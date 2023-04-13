import { ethers } from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { deployContract } from '@casimir/hardhat'
import { CasimirManager, CasimirAutomation, MockAggregator } from '../../build/artifacts/types'
import { ContractConfig, DeploymentConfig, Validator } from '@casimir/types'
import { validatorStore } from '@casimir/data'

/** Simulation amount of reward to distribute per staked validator */
const rewardPerValidator = 0.1

/** Fixture to deploy SSV manager contract */
export async function deploymentFixture() {
    let casimirManager: CasimirManager | undefined
    let mockAggregator: MockAggregator | undefined
    const [owner, , , , distributor] = await ethers.getSigners()
    let config: DeploymentConfig = {
        CasimirManager: {
            address: '',
            args: {
                beaconDepositAddress: process.env.BEACON_DEPOSIT_ADDRESS,
                linkFeedAddress: process.env.LINK_FEED_ADDRESS,
                linkTokenAddress: process.env.LINK_TOKEN_ADDRESS,
                ssvNetworkAddress: process.env.SSV_NETWORK_ADDRESS,
                ssvTokenAddress: process.env.SSV_TOKEN_ADDRESS,
                swapFactoryAddress: process.env.SWAP_FACTORY_ADDRESS,
                swapRouterAddress: process.env.SWAP_ROUTER_ADDRESS,
                wethTokenAddress: process.env.WETH_TOKEN_ADDRESS
            },
            options: {},
            proxy: false
        }
    }

    /** Insert any mock external contracts first */
    if (process.env.MOCK_EXTERNAL_CONTRACTS === 'true') {
        config = {
            MockAggregator: {
                address: '',
                args: {
                    decimals: 18,
                    initialAnswer: 0
                },
                options: {},
                proxy: false
            },
            MockKeeperRegistry: {
                address: '',
                args: {},
                options: {},
                proxy: false
            },
            ...config
        }
    }

    for (const name in config) {
        console.log(`Deploying ${name} contract...`)

        /** Link mock external contracts to Casimir */
        if (name === 'CasimirManager') {
            (config[name as keyof typeof config] as ContractConfig).args.linkFeedAddress = config.MockAggregator?.address
        }

        const { args, options, proxy } = config[name as keyof typeof config] as ContractConfig

        const contract = await deployContract(name, proxy, args, options)
        const { address } = contract

        // Semi-colon needed
        console.log(`${name} contract deployed to ${address}`);

        // Save contract address for next loop
        (config[name as keyof DeploymentConfig] as ContractConfig).address = address

        // Save SSV manager for export
        if (name === 'CasimirManager') casimirManager = contract as CasimirManager

        // Save mock aggregator for export
        if (name === 'MockAggregator') mockAggregator = contract as MockAggregator
    }

    const automationAddress = await casimirManager?.getAutomationAddress() as string
    const casimirAutomation = await ethers.getContractAt('CasimirAutomation', automationAddress) as CasimirAutomation

    return { casimirManager: casimirManager as CasimirManager, casimirAutomation: casimirAutomation as CasimirAutomation, mockAggregator, owner, distributor }
}

/** Fixture to add validators */
export async function addValidatorsFixture() {
    const { casimirManager, casimirAutomation, mockAggregator, owner, distributor } = await loadFixture(deploymentFixture)

    const validators = Object.keys(validatorStore).map((key) => validatorStore[key]).slice(0, 2) as Validator[]
    for (const validator of validators) {
        const {
            depositDataRoot,
            publicKey,
            operatorIds,
            sharesEncrypted,
            sharesPublicKeys,
            signature,
            withdrawalCredentials
        } = validator
        const registration = await casimirManager.addValidator(
            depositDataRoot,
            publicKey,
            operatorIds,
            sharesEncrypted,
            sharesPublicKeys,
            signature,
            withdrawalCredentials
        )
        await registration.wait()
    }
    return { casimirManager, casimirAutomation, mockAggregator, owner, distributor, validators }
}

/** Fixture to stake 16 ETH for the first user */
export async function firstUserDepositFixture() {
    const { casimirManager, casimirAutomation, mockAggregator, owner, distributor } = await loadFixture(addValidatorsFixture)
    const [, firstUser] = await ethers.getSigners()
    const stakeAmount = 16.0
    const fees = { ...await casimirManager.getFees() }
    const feePercent = fees.LINK + fees.SSV
    const depositAmount = stakeAmount * ((100 + feePercent) / 100)
    const value = ethers.utils.parseEther(depositAmount.toString())
    const deposit = await casimirManager.connect(firstUser).deposit({ value })
    await deposit.wait()
    
    const checkData = 'Checking upkeep'
    const { ...check } = await casimirAutomation.checkUpkeep(
        ethers.utils.defaultAbiCoder.encode(['string'], [checkData])
    )
    const { upkeepNeeded, performData } = check
    const performDataString = ethers.utils.toUtf8String(performData)
    if (upkeepNeeded) {
        const performUpkeep = await casimirAutomation.performUpkeep(
            ethers.utils.defaultAbiCoder.encode(['string'], [performDataString])
        )
        await performUpkeep.wait()
    }

    return { casimirManager, casimirAutomation, mockAggregator, owner, distributor, firstUser}
}

/** Fixture to stake 24 ETH for the second user */
export async function secondUserDepositFixture() {
    const { casimirManager, casimirAutomation, mockAggregator, owner, distributor, firstUser } = await loadFixture(firstUserDepositFixture)
    const [, , secondUser] = await ethers.getSigners()
    const stakeAmount = 24.0
    const fees = { ...await casimirManager.getFees() }
    const feePercent = fees.LINK + fees.SSV
    const depositAmount = stakeAmount * ((100 + feePercent) / 100)
    const value = ethers.utils.parseEther(depositAmount.toString())
    const deposit = await casimirManager.connect(secondUser).deposit({ value })
    await deposit.wait()
    return { casimirManager, casimirAutomation, mockAggregator, owner, distributor, firstUser, secondUser }
}

/** Fixture to reward ${rewardPerValidator} * ${stakedValidatorCount} to the first and second user */
export async function rewardPostSecondUserDepositFixture() {
    const { casimirManager, casimirAutomation, mockAggregator, owner, distributor, firstUser, secondUser } = await loadFixture(secondUserDepositFixture)
    const stakedValidatorCount = (await casimirManager?.getStakedValidatorPublicKeys())?.length
    if (stakedValidatorCount) {
        const rewardAmount = (rewardPerValidator * stakedValidatorCount).toString()
        const reward = await distributor.sendTransaction({ to: casimirManager?.address, value: ethers.utils.parseEther(rewardAmount) })
        await reward.wait()
    }
    return { casimirManager, casimirAutomation, mockAggregator, owner, distributor, firstUser, secondUser }
}

/** Fixture to stake 24 ETH for the third user */
export async function thirdUserDepositFixture() {
    const { casimirManager, casimirAutomation, mockAggregator, owner, distributor, firstUser, secondUser } = await loadFixture(rewardPostSecondUserDepositFixture)
    const [, , , thirdUser] = await ethers.getSigners()
    const stakeAmount = 24.0
    const fees = { ...await casimirManager.getFees() }
    const feePercent = fees.LINK + fees.SSV
    const depositAmount = stakeAmount * ((100 + feePercent) / 100)
    const value = ethers.utils.parseEther(depositAmount.toString())
    const deposit = await casimirManager.connect(thirdUser).deposit({ value })
    await deposit.wait()
    return { casimirManager, casimirAutomation, mockAggregator, owner, distributor, firstUser, secondUser, thirdUser }
}

/** Fixture to reward ${rewardPerValidator} * ${stakedValidatorCount} to the first, second, and third user */
export async function rewardPostThirdUserDepositFixture() {
    const { casimirManager, casimirAutomation, mockAggregator, distributor, firstUser, secondUser, thirdUser } = await loadFixture(thirdUserDepositFixture)
    const stakedValidatorCount = (await casimirManager?.getStakedValidatorPublicKeys())?.length
    if (stakedValidatorCount) {
        const rewardAmount = (rewardPerValidator * stakedValidatorCount).toString()
        const reward = await distributor.sendTransaction({ to: casimirManager?.address, value: ethers.utils.parseEther(rewardAmount) })
        await reward.wait()
    }
    return { casimirManager, casimirAutomation, mockAggregator, distributor, firstUser, secondUser, thirdUser }
}

/** Fixture to withdraw ${readyDeposits} amount to fulfill ${firstUser} partial withdrawal */
export async function firstUserPartialWithdrawalFixture() {
    const { casimirManager, casimirAutomation, mockAggregator, distributor, firstUser, secondUser, thirdUser } = await loadFixture(rewardPostThirdUserDepositFixture)
    const readyDeposits = await casimirManager?.getReadyDeposits()
    const withdrawal = await casimirManager.connect(firstUser).withdraw(readyDeposits)
    await withdrawal.wait()
    return { casimirManager, casimirAutomation, mockAggregator, distributor, firstUser, secondUser, thirdUser }
}

/** Fixture to simulate stakes and rewards */
export async function simulationFixture() {
    const { casimirManager, casimirAutomation, mockAggregator, distributor, firstUser, secondUser, thirdUser } = await loadFixture(firstUserPartialWithdrawalFixture)
    for (let i = 0; i < 5; i++) {
        const stakedValidatorCount = (await casimirManager?.getStakedValidatorPublicKeys())?.length
        if (stakedValidatorCount) {
            const rewardAmount = (rewardPerValidator * stakedValidatorCount).toString()
            const reward = await distributor.sendTransaction({ to: casimirManager?.address, value: ethers.utils.parseEther(rewardAmount) })
            await reward.wait()
        }
    }
    return { casimirManager, casimirAutomation, mockAggregator, distributor, firstUser, secondUser, thirdUser }
}