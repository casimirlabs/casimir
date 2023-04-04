//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../SSVAutomation.sol";

contract MockSSVAutomation is SSVAutomation {
    uint256 public vaultCount = 1;
    bool public canHarvest = true;
    bool public shouldHarvest = true;
    bool public didHarvest = true;

    constructor(
        address _keeperRegistry,
        uint256 _performUpkeepGasLimit,
        uint256 _performUpkeepGasLimitBuffer,
        uint256 _vaultHarvestFunctionGasOverhead,
        uint256 _keeperRegistryGasOverhead
    )
        SSVAutomation(
            _keeperRegistry,
            _performUpkeepGasLimit,
            _performUpkeepGasLimitBuffer,
            _vaultHarvestFunctionGasOverhead,
            _keeperRegistryGasOverhead
        )
    {}

    function _getVaultAddresses()
        internal
        view
        override
        returns (address[] memory result)
    {
        result = new address[](vaultCount);
    }

    function _canHarvestVault(address) internal view override returns (bool) {
        return canHarvest;
    }

    function _shouldHarvestVault(address)
        internal
        view
        override
        returns (
            bool shouldHarvestVault,
            uint256 txCostWithPremium,
            uint256 callRewardAmount
        )
    {
        return (shouldHarvest, 0, 0);
    }

    function _getVaultHarvestGasOverhead(address)
        internal
        view
        override
        returns (uint256)
    {
        return
            _estimateSingleVaultHarvestGasOverhead(
                vaultHarvestFunctionGasOverhead
            );
    }

    function _harvestVault(address)
        internal
        view
        override
        returns (bool, uint256)
    {
        return (didHarvest, 0);
    }

    function setVaultCount(uint256 newVaultCount) public {
        vaultCount = newVaultCount;
    }

    function setCanHarvestVault(bool _canHarvest) public {
        canHarvest = _canHarvest;
    }

    function setShouldHarvestVault(bool _shouldHarvest) public {
        shouldHarvest = _shouldHarvest;
    }

    function setHarvestVault(bool _didHarvest) public {
        didHarvest = _didHarvest;
    }
}