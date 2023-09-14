// SPDX-License-Identifier: Apache
pragma solidity 0.8.18;

import "./interfaces/ICasimirViews.sol";
import "./interfaces/ICasimirManager.sol";
import "./interfaces/ICasimirRegistry.sol";
import "./interfaces/ICasimirPool.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title Views contract that provides read-only access to the state
 */
contract CasimirViews is ICasimirViews, Initializable {
    /*************/
    /* Constants */
    /*************/

    /** Compound minimum (0.1 ETH) */
    uint256 private constant COMPOUND_MINIMUM = 100000000 gwei;

    /*************/
    /* State */
    /*************/

    /** Manager contract */
    ICasimirManager private manager;
    /** Registry contract */
    ICasimirRegistry private registry;

    // @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract
     * @param managerAddress The manager address
     * @param registryAddress The registry address
     */
    function initialize(address managerAddress, address registryAddress) public initializer {
        require(managerAddress != address(0), "Missing manager address");
        require(registryAddress != address(0), "Missing registry address");

        manager = ICasimirManager(managerAddress);
        registry = ICasimirRegistry(registryAddress);
    }

    /**
     * @notice Get the next five compoundable pool IDs
     * @dev Should be called off-chain
     * @param startIndex The start index
     * @param endIndex The end index
     * @return poolIds The next five compoundable pool IDs
     */
    function getCompoundablePoolIds(
        uint256 startIndex,
        uint256 endIndex
    ) external view returns (uint32[5] memory poolIds) {
        uint32[] memory pendingPoolIds = manager.getPendingPoolIds();
        uint32[] memory stakedPoolIds = manager.getStakedPoolIds();
        uint256 count = 0;
        for (uint256 i = startIndex; i < endIndex; i++) {
            uint32 poolId;
            if (i < pendingPoolIds.length) {
                poolId = pendingPoolIds[i];
            } else {
                poolId = stakedPoolIds[i - pendingPoolIds.length];
            }
            ICasimirPool pool = ICasimirPool(manager.getPoolAddress(poolId));
            ICasimirPool.PoolDetails memory poolDetails = pool.getDetails();
            if (poolDetails.balance >= COMPOUND_MINIMUM) {
                poolIds[count] = poolId;
                count++;
                if (count == 5) {
                    break;
                }
            }
        }
    }

    /**
     * @notice Get the deposited pool count
     * @return depositedPoolCount The deposited pool count
     */
    function getDepositedPoolCount()
        external
        view
        returns (uint256 depositedPoolCount)
    {
        return
            manager.getPendingPoolIds().length +
            manager.getStakedPoolIds().length;
    }

    /**
     * @notice Get the deposited pool public keys
     * @param startIndex The start index
     * @param endIndex The end index
     * @return publicKeys The public keys
     */
    function getDepositedPoolPublicKeys(
        uint256 startIndex,
        uint256 endIndex
    ) external view returns (bytes[] memory) {
        bytes[] memory publicKeys = new bytes[](endIndex - startIndex);
        uint32[] memory pendingPoolIds = manager.getPendingPoolIds();
        uint32[] memory stakedPoolIds = manager.getStakedPoolIds();
        uint256 count = 0;
        for (uint256 i = startIndex; i < endIndex; i++) {
            uint32 poolId;
            if (i < pendingPoolIds.length) {
                poolId = pendingPoolIds[i];
            } else {
                poolId = stakedPoolIds[i - pendingPoolIds.length];
            }
            address poolAddress = manager.getPoolAddress(poolId);
            ICasimirPool pool = ICasimirPool(poolAddress);
            ICasimirPool.PoolDetails memory details = pool.getDetails();
            publicKeys[count] = details.publicKey;
            count++;
        }
        return publicKeys;
    }

    /**
     * @notice Get the deposited pool statuses
     * @param startIndex The start index
     * @param endIndex The end index
     * @return statuses The pool statuses 
     */
    function getDepositedPoolStatuses(
        uint256 startIndex,
        uint256 endIndex
    ) external view returns (ICasimirPool.PoolStatus[] memory) {
        ICasimirPool.PoolStatus[] memory statuses = new ICasimirPool.PoolStatus[](
            endIndex - startIndex
        );
        uint32[] memory pendingPoolIds = manager.getPendingPoolIds();
        uint32[] memory stakedPoolIds = manager.getStakedPoolIds();
        uint256 count = 0;
        for (uint256 i = startIndex; i < endIndex; i++) {
            uint32 poolId;
            if (i < pendingPoolIds.length) {
                poolId = pendingPoolIds[i];
            } else {
                poolId = stakedPoolIds[i - pendingPoolIds.length];
            }
            address poolAddress = manager.getPoolAddress(poolId);
            ICasimirPool pool = ICasimirPool(poolAddress);
            ICasimirPool.PoolDetails memory poolDetails = pool.getDetails();
            statuses[count] = poolDetails.status;
            count++;
        }
        return statuses;
    }

    /**
     * @notice Get operators
     * @param startIndex The start index
     * @param endIndex The end index
     * @return operators The operators
     */
    function getOperators(
        uint256 startIndex,
        uint256 endIndex
    ) external view returns (ICasimirRegistry.Operator[] memory) {
        ICasimirRegistry.Operator[]
            memory operators = new ICasimirRegistry.Operator[](
                endIndex - startIndex
            );
        uint64[] memory operatorIds = registry.getOperatorIds();
        uint256 count = 0;
        for (uint256 i = startIndex; i < endIndex; i++) {
            uint64 operatorId = operatorIds[i];
            operators[count] = registry.getOperator(operatorId);
            count++;
        }
        return operators;
    }

    /**
     * @notice Get a pool's details by ID
     * @param poolId The pool ID
     * @return poolDetails The pool details
     */
    function getPool(
        uint32 poolId
    ) external view returns (ICasimirPool.PoolDetails memory poolDetails) {
        address poolAddress = manager.getPoolAddress(poolId);
        if (poolAddress != address(0)) {
            ICasimirPool pool = ICasimirPool(poolAddress);
            poolDetails = pool.getDetails();
        }
    }

    /**
     * @notice Get the swept balance (in gwei)
     * @dev Should be called off-chain
     * @param startIndex The start index
     * @param endIndex The end index
     * @return sweptBalance The swept balance (in gwei)
     */
    function getSweptBalance(
        uint256 startIndex,
        uint256 endIndex
    ) external view returns (uint128 sweptBalance) {
        uint32[] memory pendingPoolIds = manager.getPendingPoolIds();
        uint32[] memory stakedPoolIds = manager.getStakedPoolIds();
        for (uint256 i = startIndex; i <= endIndex; i++) {
            uint32 poolId;
            if (i < pendingPoolIds.length) {
                poolId = pendingPoolIds[i];
            } else {
                poolId = stakedPoolIds[i - pendingPoolIds.length];
            }
            ICasimirPool pool = ICasimirPool(manager.getPoolAddress(poolId));
            ICasimirPool.PoolDetails memory poolDetails = pool.getDetails();
            sweptBalance += uint128(poolDetails.balance / 1 gwei);
        }
    }
}
