// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "./CasimirUpkeep.sol";
import "./interfaces/ICasimirManager.sol";
import "./libraries/Types.sol";
import "./vendor/interfaces/IDepositContract.sol";
import "./vendor/interfaces/ISSVNetwork.sol";
import "./vendor/interfaces/IWETH9.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@uniswap/v3-core/contracts/interfaces/pool/IUniswapV3PoolState.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

// Dev-only imports
import "hardhat/console.sol";

/**
 * @title Manager contract that accepts and distributes deposits
 */
contract CasimirManager is ICasimirManager, Ownable, ReentrancyGuard {
    /*************/
    /* Libraries */
    /*************/

    /** Use math for precise division */
    using Math for uint256;
    /** Use internal type for uint32 array */
    using Types32Array for uint32[];
    /** Use internal type for bytes array */
    using TypesBytesArray for bytes[];
    /** Use internal type for withdrawal array */
    using TypesWithdrawalArray for Withdrawal[];
    /** Use internal type for address */
    using TypesAddress for address;

    /*************/
    /* Constants */
    /*************/

    /* Distribution threshold (100 WEI) */
    uint256 private constant distributionThreshold = 100 wei;
    /** Scale factor for each reward to stake ratio */
    uint256 private constant scaleFactor = 1 ether;
    /** Uniswap 0.3% fee tier */
    uint24 private constant uniswapFeeTier = 3000;
    /** Pool capacity */
    uint256 private constant poolCapacity = 32 ether;

    /*************/
    /* Contracts */
    /*************/

    /** Upkeep contract */
    ICasimirUpkeep private immutable upkeep;
    /** Beacon deposit contract */
    IDepositContract private immutable beaconDeposit;
    /** LINK ERC-20 token contract */
    IERC20 private immutable linkToken;
    /** SSV network contract */
    ISSVNetwork private immutable ssvNetwork;
    /** SSV ERC-20 token contract */
    IERC20 private immutable ssvToken;
    /** Uniswap factory contract */
    IUniswapV3Factory private immutable swapFactory;
    /** Uniswap router contract  */
    ISwapRouter private immutable swapRouter;

    /***************/
    /* Enumerators */
    /***************/

    /** Token abbreviations */
    enum Token {
        LINK,
        SSV,
        WETH
    }

    /********************/
    /* Dynamic State */
    /********************/

    /** Latest active (consensus) balance reported from upkeep */
    uint256 latestActiveStake;
    /** Last pool ID created */
    uint256 lastPoolId;
    /** Token addresses */
    mapping(Token => address) private tokenAddresses;
    /** Unswapped tokens by address */
    mapping(address => uint256) private unswappedTokens;
    /** All users */
    mapping(address => User) private users;
    /** All pools (open, ready, or staked) */
    mapping(uint32 => Pool) private pools;
    /** Total deposits not yet in pools */
    uint256 private openDeposits;
    /** IDs of pools ready for initiation */
    uint32[] private readyPoolIds;
    /** IDS of pools pending deposit confirmation */
    uint32[] private pendingPoolIds;
    /** IDs of pools staked */
    uint32[] private stakedPoolIds;
    /** All validators (ready or staked) */
    mapping(bytes => Validator) private validators;
    /** Public keys of ready validators */
    bytes[] private readyValidatorPublicKeys;
    /** Public keys of pending validators */
    bytes[] private pendingValidatorPublicKeys;
    /** Public keys of staked validators */
    bytes[] private stakedValidatorPublicKeys;
    /** Exiting validator count */
    uint256 private exitingValidatorCount;
    /** Sum of scaled reward to stake ratios (intial value required) */
    uint256 rewardRatioSum = 1000 ether;
    /** Requested withdrawals */
    Withdrawal[] private requestedWithdrawalQueue;
    /** Pending withdrawals */
    Withdrawal[] private pendingWithdrawalQueue;
    /** Total requested withdrawals */
    uint256 private requestedWithdrawals;
    /** Total pending withdrawals */
    uint256 private pendingWithdrawals;
    /** LINK fee percentage (intial value required) */
    uint32 linkFee = 1;
    /** SSV fee percentage (intial value required) */
    uint32 ssvFee = 1;

    /**
     * @notice Constructor
     * @param beaconDepositAddress The Beacon deposit address
     * @param linkTokenAddress The Chainlink token address
     * @param oracleAddress The Chainlink functions oracle address
     * @param oracleSubId The Chainlink functions oracle subscription ID
     * @param ssvNetworkAddress The SSV network address
     * @param ssvTokenAddress The SSV token address
     * @param swapFactoryAddress The Uniswap factory address
     * @param swapRouterAddress The Uniswap router address
     * @param wethTokenAddress The WETH contract address
     */
    constructor(
        address beaconDepositAddress,
        address linkTokenAddress,
        address oracleAddress,
        uint64 oracleSubId,
        address ssvNetworkAddress,
        address ssvTokenAddress,
        address swapFactoryAddress,
        address swapRouterAddress,
        address wethTokenAddress
    ) {
        beaconDeposit = IDepositContract(beaconDepositAddress);
        linkToken = IERC20(linkTokenAddress);
        tokenAddresses[Token.LINK] = linkTokenAddress;
        ssvNetwork = ISSVNetwork(ssvNetworkAddress);
        tokenAddresses[Token.SSV] = ssvTokenAddress;
        ssvToken = IERC20(ssvTokenAddress);
        swapFactory = IUniswapV3Factory(swapFactoryAddress);
        swapRouter = ISwapRouter(swapRouterAddress);
        tokenAddresses[Token.WETH] = wethTokenAddress;

        /** Deploy upkeep contract */
        upkeep = new CasimirUpkeep(
            address(this),
            oracleAddress,
            oracleSubId
        );
    }

    /**
     * @notice Deposit user stake
     */
    function depositStake() external payable nonReentrant {
        require(msg.value > 0, "Deposit amount must be greater than 0");
        uint256 processedAmount = processFees(msg.value, getFees());
        require(
            processedAmount >= distributionThreshold,
            "Stake amount must be greater than 100 WEI"
        );
        // Todo cap deposits to avoid exhausting gas

        /** Update user account state */
        if (users[msg.sender].stake0 > 0) {
            /** Settle user's current stake */
            users[msg.sender].stake0 = getUserStake(msg.sender);
        }
        users[msg.sender].rewardRatioSum0 = rewardRatioSum;
        users[msg.sender].stake0 += processedAmount;

        /** Distribute stake to open pools */
        distributeStake(processedAmount);
    }

    /**
     * @notice Rebalance the reward to stake ratio and redistribute swept rewards
     * @param activeStake The active consensus stake
     * @param sweptRewards The swept consensus stake
     */
    function rebalanceStake(uint256 activeStake, uint256 sweptRewards) external {
        require(
            msg.sender == address(upkeep),
            "Only upkeep can distribute rewards"
        );

        int256 change = int256(activeStake + sweptRewards) -
            int256(latestActiveStake + pendingPoolIds.length * poolCapacity);

        /** Update reward to stake ratio */
        if (change > 0) {
            uint256 reward = SafeCast.toUint256(change);
            // /** Reward fees set to zero for testing */
            // uint256 processedReward = processFees(reward, Fees(0, 0));
            rewardRatioSum += Math.mulDiv(rewardRatioSum, reward, getStake());
            emit StakeRebalanced(msg.sender, reward);
        } else if (change < 0) {
            uint256 penalty = SafeCast.toUint256(change);
            rewardRatioSum -= Math.mulDiv(rewardRatioSum, penalty, getStake());
            emit StakeRebalanced(msg.sender, penalty);
        }

        /** Update latest active stake */
        latestActiveStake = activeStake;

        /** Distribute swept rewards */
        distributeStake(sweptRewards);
    }

    /**
     * @dev Distribute stake to open pools
     * @param amount The amount of stake to distribute
     */
    function distributeStake(uint256 amount) private {
        emit StakeDistributed(msg.sender, amount);

        /** Distribute ETH to open pools */
        while (amount > 0) {
            uint256 remainingCapacity = poolCapacity - openDeposits;
            if (remainingCapacity > amount) {
                /** Add remaining amount to open deposits */
                openDeposits += amount;
                amount = 0;
            } else {
                /** Create new pool */
                lastPoolId++;
                uint32 poolId = uint32(lastPoolId);
                Pool storage pool;
                pool = pools[poolId];

                /** Move open deposits and remaining capacity to pool */
                openDeposits = 0;
                amount -= remainingCapacity;
                pool.deposits = poolCapacity;
                readyPoolIds.push(poolId);

                emit PoolFilled(msg.sender, poolId);
            }
        }
    }

    /**
     * @notice Request to withdraw user stake
     * @param amount The amount of stake to withdraw
     */
    function requestWithdrawal(uint256 amount) external nonReentrant {
        require(openDeposits >= amount, "Withdrawing more than open deposits");
        require(users[msg.sender].stake0 > 0, "User does not have a stake");

        /** Settle user's compounded stake */
        users[msg.sender].stake0 = getUserStake(msg.sender);

        require(
            users[msg.sender].stake0 >= amount,
            "Withdrawing more than user stake"
        );

        /** Update requested withdrawals state */
        requestedWithdrawalQueue.push(
            Withdrawal({user: msg.sender, amount: amount})
        );
        requestedWithdrawals += amount;

        emit WithdrawalRequested(msg.sender, amount);
    }

    /**
     * @notice Initiate a given count of requested withdrawals
     * @param count The number of withdrawals to initiate
     */
    function initiateRequestedWithdrawals(uint256 count) external {
        require(
            msg.sender == address(upkeep),
            "Only upkeep can initiate withdrawals"
        );

        while (count > 0) {
            count--;

            /** Get next requested withdrawal */
            Withdrawal memory withdrawal = requestedWithdrawalQueue[0];

            /** Update user account state */
            users[withdrawal.user].rewardRatioSum0 = rewardRatioSum;
            users[withdrawal.user].stake0 -= withdrawal.amount;

            /** Update requested withdrawals state */
            requestedWithdrawalQueue.remove(0);
            requestedWithdrawals -= withdrawal.amount;

            if (withdrawal.amount <= openDeposits) {
                /** Withdraw amount from open deposits */
                openDeposits -= withdrawal.amount;

                withdrawal.user.send(withdrawal.amount);

                emit WithdrawalCompleted(
                    withdrawal.user,
                    withdrawal.amount
                );
            } else {
                /** Update requested withdrawals state */
                pendingWithdrawalQueue.push(withdrawal);
                pendingWithdrawals += withdrawal.amount;

                emit WithdrawalInitiated(
                    withdrawal.user,
                    withdrawal.amount
                );
            }
        }
    }

    /**
     * @notice Complete a given count of pending withdrawals
     * @param count The number of withdrawals to complete
     */
    function completePendingWithdrawals(uint256 count) external {
        require(
            msg.sender == address(upkeep),
            "Only upkeep can complete withdrawals"
        );

        while (count > 0) {
            count--;

            /** Get next pending withdrawal */
            Withdrawal memory withdrawal = pendingWithdrawalQueue[0];

            /** Update pending withdrawals state */
            pendingWithdrawalQueue.remove(0);
            pendingWithdrawals -= withdrawal.amount;

            withdrawal.user.send(withdrawal.amount);

            emit WithdrawalCompleted(withdrawal.user, withdrawal.amount);
        }
    }

    /**
     * @notice Initiate a given count of next ready pools
     * @param count The number of pools to stake
     */
    function initiateReadyPools(uint256 count) external {
        require(
            msg.sender == address(upkeep),
            "Only upkeep can stake pools"
        );

        // Todo move these checks to upkeep
        require(readyValidatorPublicKeys.length >= count, "Not enough ready validators");
        require(readyPoolIds.length >= count, "Not enough ready pools");

        while (count > 0) {
            count--;

            /** Get next ready pool ID */
            uint32 poolId = readyPoolIds[0];

            /** Get next ready validator */
            bytes memory validatorPublicKey = readyValidatorPublicKeys[0];
            Validator memory validator = validators[validatorPublicKey];

            /** Get the pool */
            Pool storage pool = pools[poolId];
            pool.validatorPublicKey = validatorPublicKey;

            /** Move pool from ready to pending state */
            readyPoolIds.remove(0);
            pendingPoolIds.push(poolId);

            /** Move validator from ready to pending state and add to pool */
            readyValidatorPublicKeys.remove(0);
            pendingValidatorPublicKeys.push(validatorPublicKey);

            /** Deposit validator */
            beaconDeposit.deposit{value: pool.deposits}(
                validatorPublicKey, // bytes
                validator.withdrawalCredentials, // bytes
                validator.signature, // bytes
                validator.depositDataRoot // bytes32
            );

            /** Pay SSV fees and register validator */
            /** Todo update for v3 SSV contracts and dynamic fees */
            uint256 mockSSVFee = 5 ether;
            ssvToken.approve(address(ssvNetwork), mockSSVFee);
            ssvNetwork.registerValidator(
                validatorPublicKey, // bytes
                validator.operatorIds, // uint32[]
                validator.sharesPublicKeys, // bytes[]
                validator.sharesEncrypted, // bytes[],
                mockSSVFee // uint256 (fees handled on user deposits)
            );

            emit PoolInitiated(poolId);
        }
    }

    /**
     * @notice Complete a given count of the next pending pools
     * @param count The number of pools to complete
     */
    function completePendingPools(uint256 count) external {
        require(
            msg.sender == address(upkeep),
            "Only upkeep can complete pending pools"
        );
        require(pendingPoolIds.length >= count, "Not enough pending pools");

        while (count > 0) {
            count--;

            /** Get next pending pool */
            uint32 poolId = pendingPoolIds[0];
            Pool memory pool = pools[poolId];

            /** Move pool from pending to staked state */
            pendingPoolIds.remove(0);
            stakedPoolIds.push(poolId);

            /** Move validator from pending to staked state */
            pendingValidatorPublicKeys.remove(0);
            stakedValidatorPublicKeys.push(pool.validatorPublicKey);

            emit PoolCompleted(poolId);
        }
    }

    /**
     * @notice Request a given count of staked pool exits
     * @param count The number of exits to request
     */
    function requestPoolExits(uint256 count) external {
        require(
            msg.sender == address(upkeep),
            "Only upkeep can request pool exits"
        );

        uint256 index = 0; // Keeping the same staked pool array
        while (count > 0) {
            uint32 poolId = stakedPoolIds[index];
            Pool storage pool = pools[poolId];

            if (!pool.exiting) {
                count--;
                index++;

                pool.exiting = true;

                /** Increase exiting validators */
                exitingValidatorCount++;

                emit PoolExitRequested(poolId);
            }
        }
    }

    /**
     * @notice Complete a pool exit
     * @param poolIndex The staked pool index
     * @param validatorIndex The staked validator (internal) index
     */
    function completePoolExit(
        uint256 poolIndex,
        uint256 validatorIndex
    ) external {
        require(
            msg.sender == address(upkeep),
            "Only upkeep can complete pool exits"
        );
        require(exitingValidatorCount > 0, "No exiting validators");

        uint32 poolId = stakedPoolIds[poolIndex];
        Pool storage pool = pools[poolId];

        require(pool.exiting, "Pool is not exiting");

        bytes memory validatorPublicKey = pool.validatorPublicKey;
        bytes memory stakedValidatorPublicKey = stakedValidatorPublicKeys[
            validatorIndex
        ];

        require(
            keccak256(validatorPublicKey) ==
                keccak256(stakedValidatorPublicKey),
            "Pool validator does not match staked validator"
        );

        /** Remove pool from staked pools and delete */
        stakedPoolIds.remove(poolIndex);
        delete pools[poolId];

        /** Remove validator from staked and exiting states and delete */
        stakedValidatorPublicKeys.remove(validatorIndex);
        delete validators[validatorPublicKey];

        /** Decrease exiting validators */
        exitingValidatorCount--;

        /** Remove validator from SSV */
        ssvNetwork.removeValidator(validatorPublicKey);

        emit PoolExited(poolId);
    }

    /**
     * @notice Register an operator with the pool manager
     * @param operatorId The operator ID
     */
    function registerOperator(uint32 operatorId) external payable {
        // require(
        //     msg.value >= operatorCollateralMinimum,
        //     "Insufficient operator collateral"
        // );
    }

    /**
     * @notice Register a validator with the pool manager
     * @param depositDataRoot The deposit data root
     * @param publicKey The validator public key
     * @param operatorIds The operator IDs
     * @param sharesEncrypted The encrypted shares
     * @param sharesPublicKeys The public keys of the shares
     * @param signature The signature
     * @param withdrawalCredentials The withdrawal credentials
     */
    function registerValidator(
        bytes32 depositDataRoot,
        bytes calldata publicKey,
        uint32[] memory operatorIds,
        bytes[] memory sharesEncrypted,
        bytes[] memory sharesPublicKeys,
        bytes calldata signature,
        bytes calldata withdrawalCredentials
    ) external onlyOwner {
        /** Create validator and add to ready state */
        validators[publicKey] = Validator(
            depositDataRoot,
            operatorIds,
            sharesEncrypted,
            sharesPublicKeys,
            signature,
            withdrawalCredentials,
            0
        );
        readyValidatorPublicKeys.push(publicKey);

        emit ValidatorRegistered(publicKey);
    }

    /**
     * @notice Reshare a registered validator
     * @param publicKey The validator public key
     * @param operatorIds The operator IDs
     * @param sharesEncrypted The encrypted shares
     * @param sharesPublicKeys The public keys of the shares
     */
    function reshareValidator(
        bytes calldata publicKey,
        uint32[] memory operatorIds,
        bytes[] memory sharesEncrypted,
        bytes[] memory sharesPublicKeys
    ) external onlyOwner {
        /** Get validator */
        Validator storage validator = validators[publicKey];

        require(
            validator.reshareCount < 3,
            "Validator has been reshared twice"
        );

        /** Update validator */
        validator.operatorIds = operatorIds;
        validator.sharesEncrypted = sharesEncrypted;
        validator.sharesPublicKeys = sharesPublicKeys;
        validator.reshareCount++;

        emit ValidatorReshared(publicKey);
    }

    /**
     * @dev Process fees from a deposit
     * @param depositAmount The full deposit amount
     * @param fees The fees to process
     * @return processedAmount The processed deposit amount
     */
    function processFees(
        uint256 depositAmount,
        Fees memory fees
    ) private returns (uint256 processedAmount) {
        /** Calculate total fee percentage */
        uint32 feePercent = fees.LINK + fees.SSV;

        /** Calculate ETH amount to return in processed deposit */
        uint256 ethAmount = Math.mulDiv(depositAmount, 100, 100 + feePercent);

        /** Calculate fee amount to swap */
        uint256 feeAmount = depositAmount - ethAmount;

        /** Wrap and swap */
        if (feeAmount > 0) {
            wrapFees(feeAmount);

            (, uint256 unswappedLINK) = swapFees(
                tokenAddresses[Token.WETH],
                tokenAddresses[Token.LINK],
                Math.mulDiv(feeAmount, fees.LINK, feePercent)
            );
            // Todo use linkToken.increaseAllowance(swappedLINK) if available
            linkToken.approve(
                address(upkeep),
                linkToken.balanceOf(address(this))
            );
            unswappedTokens[tokenAddresses[Token.LINK]] += unswappedLINK;

            (, uint256 unswappedSSV) = swapFees(
                tokenAddresses[Token.WETH],
                tokenAddresses[Token.SSV],
                Math.mulDiv(feeAmount, fees.SSV, feePercent)
            );
            // Todo use ssvToken.increaseAllowance(swappedSSV) if available
            ssvToken.approve(
                address(upkeep),
                ssvToken.balanceOf(address(this))
            );
            unswappedTokens[tokenAddresses[Token.SSV]] += unswappedSSV;
        }
        processedAmount = ethAmount;
    }

    /**
     * @dev Deposit WETH to use ETH in swaps
     * @param amount The amount of ETH to deposit
     */
    function wrapFees(uint256 amount) private {
        IWETH9 wethToken = IWETH9(tokenAddresses[Token.WETH]);
        wethToken.deposit{value: amount}();
        // Todo use wethToken.increaseAllowance(swappedSSV) if available
        wethToken.approve(
            address(swapRouter),
            wethToken.balanceOf(address(this))
        );
    }

    /**
     * @dev Swap token in for token out
     */
    function swapFees(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) private returns (uint256 amountOut, uint256 amountUnswapped) {
        address swapPool = swapFactory.getPool(
            tokenIn,
            tokenOut,
            uniswapFeeTier
        );
        uint256 liquidity = IUniswapV3PoolState(swapPool).liquidity();
        if (liquidity < amountIn) {
            amountUnswapped = amountIn - liquidity;
            amountIn = liquidity;
        }
        if (amountIn > 0) {
            /** Get swap params */
            ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
                .ExactInputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    fee: uniswapFeeTier,
                    recipient: address(this),
                    deadline: block.timestamp,
                    amountIn: amountIn,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                });

            /** Perform swap */
            amountOut = swapRouter.exactInputSingle(params);
        }
    }

    /**
     * @dev Update link fee
     * @param newFee The new fee
     */
    function setLINKFee(uint32 newFee) external onlyOwner {
        linkFee = newFee;
    }

    /**
     * @dev Update ssv fee
     * @param newFee The new fee
     */
    function setSSVFee(uint32 newFee) external onlyOwner {
        ssvFee = newFee;
    }

    /**
     * @notice Update the functions oracle address
     * @param oracle New oracle address
     */
    function setOracleAddress(address oracle) external onlyOwner {
        upkeep.setOracleAddress(oracle);
    }

    /**
     * @notice Get the total manager stake
     * @return stake The total manager stake
     */
    function getStake() public view returns (uint256 stake) {
        stake = getBufferedStake() + getActiveStake(); // - pendingWithdrawals;
    }

    /**
     * @notice Get the total manager buffered (execution) stake
     * @return bufferedStake The total manager buffered (execution) stake
     */
    function getBufferedStake() public view returns (uint256 bufferedStake) {
        bufferedStake =
            (readyPoolIds.length + pendingPoolIds.length) *
            poolCapacity +
            openDeposits;
    }

    /**
     * @notice Get the total manager swept (execution) stake
     * @return sweptStake The total manager swept (execution) stake
     */
    function getSweptStake() public view returns (uint256 sweptStake) {
        sweptStake = address(this).balance - getBufferedStake();
    }

    /**
     * @notice Get the manager active (consensus) stake
     * @return activeStake The total manager active (consensus) stake
     */
    function getActiveStake() public view returns (uint256 activeStake) {
        activeStake = latestActiveStake;
    }

    /**
     * @notice Get the total user stake for a given user address
     * @param userAddress The user address
     * @return userStake The total user stake
     */
    function getUserStake(
        address userAddress
    ) public view returns (uint256 userStake) {
        require(users[userAddress].stake0 > 0, "User does not have a stake");
        userStake = Math.mulDiv(
            users[userAddress].stake0,
            rewardRatioSum,
            users[userAddress].rewardRatioSum0
        );
    }

    /**
     * @notice Get the current token fees as percentages
     * @return fees The current token fees as percentages
     */
    function getFees() public view returns (Fees memory fees) {
        fees = Fees(linkFee, ssvFee);
    }

    // External view functions

    /**
     * @notice Get the total requested withdrawals
     * @return requestedWithdrawals The total requested withdrawals
     */
    function getRequestedWithdrawals() external view returns (uint256) {
        return requestedWithdrawals;
    }

    /**
     * @notice Get the total pending withdrawals
     * @return pendingWithdrawals The total pending withdrawals
     */
    function getPendingWithdrawals() external view returns (uint256) {
        return pendingWithdrawals;
    }

    /**
     * @notice Get the requested withdrawal queue
     * @return requestedWithdrawalQueue The requested withdrawal queue
     */
    function getRequestedWithdrawalQueue()
        external
        view
        returns (Withdrawal[] memory) {
        return requestedWithdrawalQueue;
    }

    /**
     * @notice Get the pending withdrawal queue
     * @return pendingWithdrawalQueue The pending withdrawal queue
     */
    function getPendingWithdrawalQueue()
        external
        view
        returns (Withdrawal[] memory) {
        return pendingWithdrawalQueue;
    }

    /**
     * @notice Get ready validator public keys
     * @return A list of inactive validator public keys
     */
    function getReadyValidatorPublicKeys()
        external
        view
        returns (bytes[] memory)
    {
        return readyValidatorPublicKeys;
    }

    /**
     * @notice Get staked validator public keys
     * @return A list of active validator public keys
     */
    function getStakedValidatorPublicKeys()
        external
        view
        returns (bytes[] memory)
    {
        return stakedValidatorPublicKeys;
    }

    /**
     * @notice Get the count of exiting validators
     * @return The count of exiting validators
     */
    function getExitingValidatorCount() external view returns (uint256) {
        return exitingValidatorCount;
    }

    /**
     * @notice Get a list of all ready pool IDs
     * @return A list of all ready pool IDs
     */
    function getReadyPoolIds() external view returns (uint32[] memory) {
        return readyPoolIds;
    }

    /**
     * @notice Get a list of all pending pool IDs
     * @return A list of all pending pool IDs
     */
    function getPendingPoolIds() external view returns (uint32[] memory) {
        return pendingPoolIds;
    }

    /**
     * @notice Get a list of all staked pool IDs
     * @return A list of all staked pool IDs
     */
    function getStakedPoolIds() external view returns (uint32[] memory) {
        return stakedPoolIds;
    }

    /**
     * @notice Get the total manager open deposits
     * @return The total manager open deposits
     */
    function getOpenDeposits() external view returns (uint256) {
        return openDeposits;
    }

    /**
     * @notice Get the pool details for a given pool ID
     * @param poolId The pool ID
     * @return poolDetails The pool details
     */
    function getPoolDetails(
        uint32 poolId
    ) external view returns (PoolDetails memory poolDetails) {
        /** Pool in open or ready state will not have validator or operators */
        Pool memory pool = pools[poolId];
        if (pool.validatorPublicKey.length == 0) {
            poolDetails = PoolDetails(
                pool.deposits,
                pool.validatorPublicKey,
                new uint32[](0),
                pool.exiting
            );
        } else {
            Validator memory validator = validators[pool.validatorPublicKey];
            poolDetails = PoolDetails(
                pool.deposits,
                pool.validatorPublicKey,
                validator.operatorIds,
                pool.exiting
            );
        }
    }

    /**
     * @notice Get the LINK fee percentage to charge on each deposit
     * @return The LINK fee percentage to charge on each deposit
     */
    function getLINKFee() external view returns (uint32) {
        return linkFee;
    }

    /**
     * @notice Get the SSV fee percentage to charge on each deposit
     * @return The SSV fee percentage to charge on each deposit
     */
    function getSSVFee() external view returns (uint32) {
        return ssvFee;
    }

    /**
     * @notice Get the upkeep address
     * @return upkeepAddress The upkeep address
     */
    function getUpkeepAddress()
        external
        view
        returns (address upkeepAddress)
    {
        upkeepAddress = address(upkeep);
    }

    // Dev-only functions

    /**
     * @dev Will be removed in production
     * @dev Used for mocking sweeps from Beacon to the manager
     */
    receive() external payable nonReentrant {}
}
