// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.16;

import "./interfaces/IWETH9.sol";
import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "hardhat/console.sol";

/**
 * @title Manager contract that accepts and distributes deposits
 */
contract SSVManager is ChainlinkClient {
    using Chainlink for Chainlink.Request;
    using Counters for Counters.Counter;

    /** Token abbreviations */
    enum Token {
        LINK,
        SSV,
        WETH
    }

    /** Balance for storing stake and reward amounts */
    struct Balance {
        uint256 stake;
        uint256 rewards;
    }

    /** Processed fee and stake amounts */
    struct DepositFunds {
        uint256 linkAmount;
        uint256 ssvAmount;
        uint256 stakeAmount;
    }

    /** Token fees required for contract protocols */
    struct Fees {
        uint32 LINK;
        uint32 SSV;
    }

    /** SSV pool used for running a validator */
    struct Pool {
        Balance balance;
        mapping(address => Balance) userBalances;
        bytes validatorPublicKey;
        uint32[] operatorIds;
    }

    /** User account for storing pool addresses */
    struct User {
        mapping(uint32 => bool) poolIdLookup;
        uint32[] poolIds;
    }

    /** Pool ID generator */
    Counters.Counter _lastPoolId;

    /** Uniswap 0.3% fee tier */
    uint24 private immutable swapFee = 3000;

    /** Uniswap ISwapRouter */
    ISwapRouter public immutable swapRouter;

    /** Token addresses */
    mapping(Token => address) private tokens;

    /** All users who have deposited to pools */
    mapping(address => User) private users;

    /** SSV pools */
    mapping(uint32 => Pool) private pools;

    /** Pool IDs of pools accepting deposits */
    uint32[] private openPoolIds;

    /** Pool IDs of pools completed and staked */
    uint32[] private stakedPoolIds;

    /** Chainlink request job ID */
    bytes32 private immutable jobId;

    /** Chainlink request fee */
    uint256 private immutable linkFee;

    address private oracleAddress;

    /** Event signaling a validator init request fulfillment */
    event ValidatorInitFullfilled(
        uint32 poolId,
        uint32[] operatorIds,
        bytes[] encryptedShares, 
        bytes[] sharePublicKeys, 
        bytes validatorPublicKey, 
        bytes depositDataSignature
    );

    /** Event signaling a user deposit to the manager */
    event ManagerDeposit(
        address userAddress,
        uint256 linkAmount,
        uint256 ssvAmount,
        uint256 stakeAmount,
        uint256 depositTime
    );

    /** Event signaling a user stake to a pool */
    event PoolStake(
        address userAddress,
        uint32 poolId,
        uint256 linkAmount,
        uint256 ssvAmount,
        uint256 stakeAmount,
        uint256 stakeTime
    );

    /**
     * @notice Constructor
     * @param _linkOracleAddress - The Chainlink oracle address
     * @param _swapRouterAddress - The Uniswap router address
     * @param _linkTokenAddress - The Chainlink token address
     * @param _ssvTokenAddress - The SSV token address
     * @param _wethTokenAddress - The WETH contract address
     */
    constructor(
        address _linkOracleAddress,
        address _swapRouterAddress,
        address _linkTokenAddress,
        address _ssvTokenAddress,
        address _wethTokenAddress
    ) {
        swapRouter = ISwapRouter(_swapRouterAddress);
        tokens[Token.LINK] = _linkTokenAddress;
        tokens[Token.SSV] = _ssvTokenAddress;
        tokens[Token.WETH] = _wethTokenAddress;

        /// Set up Chainlink client
        setChainlinkOracle(_linkOracleAddress);
        setChainlinkToken(_linkTokenAddress);
        jobId = '7da2702f37fd48e5b1b9a5715e3509b6';
        linkFee = (1 * LINK_DIVISIBILITY) / 10;
    }

    /**
     * @notice Deposit to the pool manager
     */
    function deposit() external payable {
        address userAddress = msg.sender;
        uint256 depositAmount = msg.value;
        uint256 time = block.timestamp;

        /// Swap fees to protocol token funds
        DepositFunds memory depositFunds = processDepositFunds(depositAmount);

        /// Emit manager deposit event
        emit ManagerDeposit(
            userAddress,
            depositFunds.linkAmount,
            depositFunds.ssvAmount,
            depositFunds.stakeAmount,
            time
        );

        /// Distribute ETH stake to pools
        while (depositFunds.stakeAmount > 0) {
            /// Get next open pool
            uint32 poolId;
            Pool storage pool;
            if (openPoolIds.length > 0) {
                poolId = openPoolIds[0];
            } else {
                /// Generate a new pool ID
                _lastPoolId.increment();
                poolId = uint32(_lastPoolId.current());

                /// Push new open pool ID
                openPoolIds.push(poolId);
            }

            /// Get the pool
            pool = pools[poolId];

            /// Get contract amount for next open pool
            uint256 poolStakeAmount = pool.balance.stake;

            /// Deposit to pool
            uint256 poolRequiredAmount = 32000000000000000000 - poolStakeAmount;
            uint256 addStakeAmount;
            if (poolRequiredAmount > depositFunds.stakeAmount) {
                // Deposit remaining stake amount
                addStakeAmount = depositFunds.stakeAmount;
                depositFunds.stakeAmount = 0;
            } else {
                addStakeAmount = poolRequiredAmount;
                depositFunds.stakeAmount -= poolRequiredAmount;

                /// Start a new validator to stake pool
                initValidator(poolId);

                /// Remove pool from open pools when completed
                for (uint i = 0; i < openPoolIds.length - 1; i++) {
                    openPoolIds[i] = openPoolIds[i + 1];
                }
                openPoolIds.pop();
                /// Add completed pool to staked pools
                stakedPoolIds.push(poolId);
            }

            pool.balance.stake += addStakeAmount;
            pool.userBalances[userAddress].stake += addStakeAmount;

            /// Save pool address to user if new stake
            User storage user = users[userAddress];
            if (!user.poolIdLookup[poolId]) {
                user.poolIdLookup[poolId] = true;
                user.poolIds.push(poolId);
            }

            /// Emit pool stake event
            emit PoolStake(
                userAddress,
                poolId,
                depositFunds.linkAmount,
                depositFunds.ssvAmount,
                depositFunds.stakeAmount,
                time
            );
        }
    }

    /**
     * @dev Process fee and stake deposit amounts
     * @param _depositAmount - The deposit amount
     * @return The fee and stake deposit amounts
     */
    function processDepositFunds(
        uint256 _depositAmount
    ) private returns (DepositFunds memory) {
        Fees memory fees = getFees();
        uint32 feesTotal = fees.LINK + fees.SSV;
        uint256 stakeAmount = (_depositAmount * 100) / (100 + feesTotal);
        uint256 feeAmount = _depositAmount - stakeAmount;

        // /// Wrap ETH fees in ERC-20 to use in swap
        wrap(feeAmount);

        /// Swap fees and return with { stakeAmount, linkAmount, ssvAmount }
        uint256 linkAmount = swap(
            tokens[Token.WETH],
            tokens[Token.LINK],
            (feeAmount * fees.LINK) / feesTotal
        );
        uint256 ssvAmount = swap(
            tokens[Token.WETH],
            tokens[Token.SSV],
            (feeAmount * fees.SSV) / feesTotal
        );

        return DepositFunds(linkAmount, ssvAmount, stakeAmount);
    }

    /**
     * @dev Deposit WETH to use ETH in swaps
     * @param _amount - The amount of ETH to deposit
     */
    function wrap(uint256 _amount) private {
        IWETH9 wethToken = IWETH9(tokens[Token.WETH]);
        wethToken.deposit{value: _amount}();
        wethToken.approve(address(swapRouter), _amount);
    }

    /**
     * @dev Swap one token-in for another token-out
     * @param _tokenIn - The token-in address
     * @param _tokenOut - The token-out address
     * @param _amountIn - The amount of token-in to input
     * @return The amount of token-out
     */
    function swap(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn
    ) private returns (uint256) {
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: _tokenIn,
                tokenOut: _tokenOut,
                fee: swapFee,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: _amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

        /// The call to `exactInputSingle` executes the swap
        return swapRouter.exactInputSingle(params);
    }

    /**
     * @notice Get the current token fees as percentages
     * @return The current token fees as percentages
     */
    function getFees() public pure returns (Fees memory) {
        return Fees(getLINKFee(), getSSVFee());
    }

    /**
     * @notice Get the LINK fee percentage to charge on each deposit
     * @return The LINK fee percentage to charge on each deposit
     */
    function getLINKFee() public pure returns (uint32) {
        return 1;
    }

    /**
     * @notice Get the SSV fee percentage to charge on each deposit
     * @return The SSV fee percentage to charge on each deposit
     */
    function getSSVFee() public pure returns (uint32) {
        return 1;
    }

    /**
     * @dev Init a validator for a pool
     */
    function initValidator(uint32 _poolId) private {
        this.requestValidatorInit(_poolId);
    }

    /**
     * @notice Get validator init config with operators and deposit data from a DKG ceremony
     * @return _requestId - ID of the request
     */
    function requestValidatorInit(uint32 _poolId) public returns (bytes32 _requestId) {
        Chainlink.Request memory request = buildChainlinkRequest(
            jobId,
            address(this),
            this.fulfillValidatorInit.selector
        );

        request.add(
            "get",
            "https://ssv.dev.casimir.co/validator-init"
        );

        // Sends the request
        return sendChainlinkRequest(request, linkFee);
    }

    /**
     * @notice Receives the response in the form of uint32
     *
     * @param _requestId - ID of the Chainlink request
     * @param _poolId - The pool ID
     * @param _operatorIds - The operator IDs
     * @param _encryptedShares - Standard SSV encrypted shares
     * @param _sharePublicKeys - Each share's BLS pubkey
     * @param _validatorPublicKey - Resulting public key corresponding to the shared private key
     * @param _depositDataSignature - Reconstructed signature of DepositMessage according to eth2 spec
     */
    function fulfillValidatorInit(bytes32 _requestId, uint32 _poolId, uint32[] calldata _operatorIds, bytes[] calldata _encryptedShares, bytes[] calldata _sharePublicKeys, bytes calldata _validatorPublicKey, bytes calldata _depositDataSignature)
        public
        recordChainlinkFulfillment(_requestId)
    {
        emit ValidatorInitFullfilled(_poolId, _operatorIds, _encryptedShares, _sharePublicKeys, _validatorPublicKey, _depositDataSignature);
        console.log('FULFILLED VALIDATOR INIT FOR POOL', _poolId);
        Pool storage pool = pools[_poolId];
        pool.operatorIds = _operatorIds;
        pool.validatorPublicKey = _validatorPublicKey;
    }

    /**
     * @notice Get a list of all open pool IDs
     * @return A list of all open pool IDs
     */
    function getOpenPoolIds() external view returns (uint32[] memory) {
        return openPoolIds;
    }

    /**
     * @notice Get a list of all staked pool IDs
     * @return A list of all staked pool IDs
     */
    function getStakedPoolIds() external view returns (uint32[] memory) {
        return stakedPoolIds;
    }

    /**
     * @notice Get a list of a user's pool IDs by user address
     * @param _userAddress - The user address
     * @return A list of a user's pool IDs
     */
    function getUserPoolIds(
        address _userAddress
    ) external view returns (uint32[] memory) {
        return users[_userAddress].poolIds;
    }

    /**
     * @notice Get a user's balance in a pool by user address and pool ID
     * @param _poolId - The pool ID
     * @param _userAddress - The user address
     * @return A user's balance in a pool
     */
    function getPoolUserBalance(
        uint32 _poolId,
        address _userAddress
    ) external view returns (Balance memory) {
        return pools[_poolId].userBalances[_userAddress];
    }

    /**
     * @notice Get a pool's balance by pool ID
     * @param _poolId - The pool ID
     * @return The pool's balance
     */
    function getPoolBalance(
        uint32 _poolId
    ) external view returns (Balance memory) {
        return pools[_poolId].balance;
    }

    /**
     * @notice Get a pool's validator public key by pool ID
     * @param _poolId - The pool ID
     * @return The pool's validator public key
     */
    function getPoolValidatorPublicKey(
        uint32 _poolId
    ) external view returns (bytes memory) {
        return pools[_poolId].validatorPublicKey;
    }

    /**
     * @notice Get a pool's operators by pool ID
     * @param _poolId - The pool ID
     * @return The pool's operators
     */
    function getPoolOperatorIds(
        uint32 _poolId
    ) external view returns (uint32[] memory) {
        return pools[_poolId].operatorIds;
    }
}
