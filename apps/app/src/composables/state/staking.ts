import { onMounted, onUnmounted, readonly, ref, watch } from "vue"
import { useStorage } from "@vueuse/core"
import { CasimirManager } from "@casimir/ethereum/build/@types"
import {  ContractEventsByAddress, ProviderString, StakeDetails, UserContractEvents } from "@casimir/types"
import { ethers } from "ethers"
import useContracts from "@/composables/services/contracts"
import useEthers from "@/composables/services/ethers"
import useLedger from "@/composables/services/ledger"
import useToasts from "@/composables/state/toasts"
import useTrezor from "@/composables/services/trezor"
import useUser from "@/composables/services/user"
import useWallets from "@/composables/services/wallets"
import useWalletConnectV2 from "@/composables/services/walletConnectV2"

const { getBaseManager, getEigenManager, contractsAreInitialized } = useContracts()
const { browserProvidersList, getEthersBrowserSigner } = useEthers()
const { getEthersLedgerSigner } = useLedger()
const { getEthersTrezorSigner } = useTrezor()
const { addToast, updateToast, removeToast } = useToasts()
const { user, getPathIndex } = useUser()
const { detectActiveNetwork, detectActiveWalletAddress, switchEthersNetwork } = useWallets()
const { getWalletConnectSignerV2 } = useWalletConnectV2()

let baseManager: CasimirManager
let eigenManager: CasimirManager
const stakingToastId = ref(null as null | string)
const withdrawToastId = ref(null as null | string)

const initializeComposable = ref(false)
const stakingWalletAddress = ref(null as null | string)
const stakingAmount = ref(null as null | number)
const eigenLayerSelection = ref(false as boolean)
const userStakeDetails = ref<Array<StakeDetails>>([])
const depositFees = ref(null as null | number)
const listeningForContractEvents = ref(false)

const selectedWalletProvider = ref("" as ProviderString)

watch(stakingWalletAddress, () =>{
    const index = user?.value?.accounts?.findIndex(item => item.address == stakingWalletAddress.value) as number
    if (index > -1) {
        selectedWalletProvider.value = user?.value?.accounts[index].walletProvider as ProviderString
    } else {
        selectedWalletProvider.value = "" as ProviderString
    }
})

const withdrawAmount = ref(null as null | number)
const acceptTerms = ref(false)
  
export default function useStakingState() {

    watch(user, () =>{
        if (!user.value) {
            userStakeDetails.value = []
        }
    })

    function listenForStakeWithdrawEvents() {
        if (!initializeComposable.value) return
        listeningForContractEvents.value = true
        try {
            (baseManager as CasimirManager).on("StakeDeposited", stakeDepositedListener);
            (baseManager as CasimirManager).on("WithdrawalInitiated", withdrawalInitiatedListener);
            (eigenManager as CasimirManager).on("StakeDeposited", stakeDepositedListener);
            (eigenManager as CasimirManager).on("WithdrawalInitiated", withdrawalInitiatedListener)
        } catch (err) {
            console.log(`There was an error in listenForStakeWithdrawEvents: ${err}`)
        }
    }

    function listenForRebalancedEvents() {
        if (!initializeComposable.value) return
        try {
            (baseManager as CasimirManager).on("StakeRebalanced", stakeRebalancedListener)
            // (eigenManager as CasimirManager).on("StakeRebalanced", stakeRebalancedListener)
        } catch (err) {
            console.log(`There was an error in listenForRebalancedEvents: ${err}`)
        }
    }

    function stopListeningForContractEvents() {
        listeningForContractEvents.value = false
        if (!initializeComposable.value) return
        (baseManager as CasimirManager).removeListener("StakeDeposited", stakeDepositedListener);
        (baseManager as CasimirManager).removeListener("StakeRebalanced", stakeRebalancedListener);
        (baseManager as CasimirManager).removeListener("WithdrawalInitiated", withdrawalInitiatedListener);
        (eigenManager as CasimirManager).removeListener("StakeDeposited", stakeDepositedListener);
        (eigenManager as CasimirManager).removeListener("StakeRebalanced", stakeRebalancedListener);
        (eigenManager as CasimirManager).removeListener("WithdrawalInitiated", withdrawalInitiatedListener)
    }

    const stakeDepositedListener = async () => await getUserStakeDetails()
    const stakeRebalancedListener = async () => await getUserStakeDetails()
    const withdrawalInitiatedListener = async () => await getUserStakeDetails()

    watch(contractsAreInitialized, async () => {
        if (contractsAreInitialized.value) {
            baseManager = getBaseManager()
            eigenManager = getEigenManager()
            await getDepositFees()
            stopListeningForContractEvents()
            listenForStakeWithdrawEvents()
            listenForRebalancedEvents()
        }
    })
      
    onMounted(async () => {
        if (!initializeComposable.value) {
            initializeComposable.value = true
            stakingWalletAddress.value = null
            stakingAmount.value = null
            eigenLayerSelection.value = false
            useStorage("acceptTerms", acceptTerms)
            if (!contractsAreInitialized.value) return
            baseManager = getBaseManager()
            eigenManager = getEigenManager()
            await getUserStakeDetails()
            await getDepositFees()
            stopListeningForContractEvents()
            listenForStakeWithdrawEvents()
            listenForRebalancedEvents()
        }
    })
    
    onUnmounted(() =>{
        stakingWalletAddress.value = null
        stakingAmount.value = null
        eigenLayerSelection.value = false
        stopListeningForContractEvents()
        initializeComposable.value = false
    })

    function selectWallet(address: string) {
        stakingWalletAddress.value = address
    }

    function setAmountToStake(amount: number) {
        stakingAmount.value = amount
    }

    function toggleEigenlayerSelection() {
        eigenLayerSelection.value = !eigenLayerSelection.value
    }

    function toggleTerms() {
        acceptTerms.value = !acceptTerms.value
    }

    function setWithdrawAmount(amount: number) {
        withdrawAmount.value = amount
    }

    function getRandomToastId(length: number) {
        const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        let result = ""
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length))
        }
        return result
    }
    
    // TODO: @ccali11 - Add AVS selection payload to deposit function (from avsSelection.ts composable)
    async function deposit({ amount, walletProvider, type, pathIndex }: { amount: string, walletProvider: ProviderString, type: "default" | "eigen", pathIndex: number | undefined}) {
        let toastContent = {
            id: stakingToastId.value as string,
            type: "loading",
            iconUrl: "",
            title: "Submitting Stake",
            subtitle: "Processing stake request",
            timed: false,
            loading: true
        }
        addToast(toastContent)

        try {
            const activeNetwork = await detectActiveNetwork(walletProvider)
            if (activeNetwork !== 5) {
                await switchEthersNetwork(walletProvider, "0x5")
                return window.location.reload()
            }

            let signer
            if (browserProvidersList.includes(walletProvider)) {
                signer = getEthersBrowserSigner(walletProvider)
            } else if (walletProvider === "WalletConnect") {
                signer = await getWalletConnectSignerV2()
            } else if (walletProvider === "Ledger") {
                signer = getEthersLedgerSigner(pathIndex)
            } else if (walletProvider === "Trezor") {
                signer = getEthersTrezorSigner()
            } else {
                throw new Error(`Invalid wallet provider: ${walletProvider}`)
            }

            const manager = type === "default" ? baseManager : eigenManager
            const managerSigner = (manager as CasimirManager).connect(signer as ethers.Signer)
            const fees = await getDepositFees()
            const depositAmount = parseFloat(amount) * ((100 + fees) / 100)
            const value = ethers.utils.parseEther(depositAmount.toString())
            toastContent ={
                id: toastContent.id,
                type: "loading",
                iconUrl: "",
                title: "Waiting on Confirmation",
                subtitle: "Waiting stake confirmation action",
                timed: false,
                loading: true
            }
            updateToast(toastContent)
            const result = await managerSigner.depositStake({ value, type: 2 })
            const confirmation = await result.wait(1)
            if (!confirmation) throw new Error("Confirmation failed")
            toastContent ={
                id: toastContent.id,
                type: "success",
                iconUrl: "",
                title: "Stake Confirmed",
                subtitle: "Stake is confirmed and is sitting in a pool",
                timed: true,
                loading: false
            }
            updateToast(toastContent)
            setTimeout(() => {
                removeToast(toastContent.id)
            }, 4000)
            return confirmation
        } catch (err: any) {
            console.error(`Error in deposit function: ${JSON.stringify(err)}`)
            if (err.message.includes("denied by the user")) {
                toastContent ={
                    id: toastContent.id,
                    type: "failed",
                    iconUrl: "",
                    title: "Denied by User",
                    subtitle: "Transaction denied by the user",
                    timed: true,
                    loading: false
                }
                updateToast(toastContent)

                setTimeout(() => {
                    removeToast(toastContent.id)
                }, 3000)
            } else {
                toastContent ={
                    id: toastContent.id,
                    type: "failed",
                    iconUrl: "",
                    title: "Something Went Wrong",
                    subtitle: "Please try again later",
                    timed: true,
                    loading: false
                }
                updateToast(toastContent)

                setTimeout(() => {
                    removeToast(toastContent.id)
                }, 3000)
            }
            return false
        }
    }

    async function handleStake() {
        let pathIndex = 0
        stakingToastId.value = getRandomToastId(16)
        if (browserProvidersList.includes(selectedWalletProvider.value as ProviderString)) {
            const activeAddress = await detectActiveWalletAddress(selectedWalletProvider.value as ProviderString)
            if (activeAddress !== stakingWalletAddress.value) {
                stakingAmount.value = 0
                const toastContent = {
                    id: stakingToastId.value as string,
                    type: "failed",
                    iconUrl: "",
                    title: "Can Not Stake",
                    subtitle: "The wallet you are trying to stake to is not your active wallet.",
                    timed: true,
                    loading: false
                }
                addToast(toastContent)
                setTimeout(() => {
                    removeToast(toastContent.id)
                    stakingToastId.value = null
                }, 3000)
            }
        } else {
            pathIndex = getPathIndex(selectedWalletProvider.value as ProviderString, stakingWalletAddress.value as string)
        }
        
        const depositPayload = {
            amount: stakingAmount.value?.toString() as string,
            walletProvider: selectedWalletProvider.value as ProviderString,
            type: eigenLayerSelection.value ? "eigen" : "default" as "eigen" | "default",
            pathIndex
        }
        await deposit(depositPayload)
    }

    async function handleWithdraw(stakeInfo : any) {
        const { address, operatorType: type } = stakeInfo
        const walletProvider = user.value?.accounts.find(account => account.address === address)?.walletProvider as ProviderString
        
        withdrawToastId.value = getRandomToastId(16)
        const toastContent ={
            id: withdrawToastId.value as string,
            type: "loading",
            iconUrl: "",
            title: "Confirming Withdraw",
            subtitle: "Confirming stake withdraw from pool",
            timed: false,
            loading: true
        }
        addToast(toastContent)

        const withdrawPayload = {
            amount: withdrawAmount.value?.toString() as string,
            address,
            walletProvider,
            type
        }
        await withdraw(withdrawPayload)
    }

    async function getDepositFees(): Promise<number> {
        try {
            // TODO: Fix this bug
            // const fees = await (manager as CasimirManager).FEE_PERCENT()
            const fees = 5
            const feesRounded = Math.round(fees * 100) / 100
            depositFees.value = feesRounded
            return feesRounded
        } catch (err: any) {
            console.error(`There was an error in getDepositFees function: ${JSON.stringify(err)}`)
            throw new Error(err)
        }
    }

    async function getUserStakeDetails() {
        const result: Array<StakeDetails> = []
        const addresses = user.value?.accounts.map((account) => account.address) as Array<string>

        async function getUserStakeAndWithdrawable(manager: CasimirManager, address: string) {
            try {
                const userStake = await (manager as CasimirManager).getUserStake(address)
                const userStakeNumber = parseFloat(ethers.utils.formatEther(userStake))
                const availableToWithdraw = await (manager as CasimirManager).getWithdrawableBalance()
                const availableToWithdrawNumber = parseFloat(ethers.utils.formatEther(availableToWithdraw))
        
                return { userStakeNumber, availableToWithdrawNumber }
            } catch (err: any) {
                return { userStakeNumber: 0, availableToWithdrawNumber: 0 }
            }
        }
    
        const promises = addresses.map(async (address) => {
            const [baseManagerData, /* eigenManagerData */] = await Promise.all([
                getUserStakeAndWithdrawable(baseManager, address),
                // getUserStakeAndWithdrawable(eigenManager, address),
            ])
    
            if (baseManagerData.userStakeNumber > 0) {
                const amountStaked = baseManagerData.userStakeNumber
                const availableToWithdraw = baseManagerData.availableToWithdrawNumber
                const userEventTotals = await getContractEventsTotalsByAddress(address, baseManager)
                const { WithdrawalInitiated, WithdrawalRequested, WithdrawalFulfilled } = userEventTotals
                const rewards = await calculateRewards(amountStaked, userEventTotals)
                result.push({
                    operatorType: "default",
                    address,
                    amountStaked,
                    availableToWithdraw,
                    rewards,
                    WithdrawalInitiated,
                    WithdrawalRequested, 
                    WithdrawalFulfilled 
                })
            }
    
            // if (eigenManagerData.userStakeNumber > 0) {
            //     result.push({
            //         operatorType: "eigen",
            //         address,
            //         amountStaked: eigenManagerData.userStakeNumber,
            //         availableToWithdraw: eigenManagerData.availableToWithdrawNumber,
            //     })
            // }
        })
    
        await Promise.all(promises)
        userStakeDetails.value = result
    }

    async function getContractEventsTotalsByAddress(address: string, manager: CasimirManager) : Promise<ContractEventsByAddress> {
        try {
            const eventList = [
                "StakeDeposited",
                "StakeRebalanced",
                "WithdrawalInitiated",
                "WithdrawalRequested",
                "WithdrawalFulfilled"
            ]
            const eventFilters = eventList.map(event => {
                if (event === "StakeRebalanced") return (manager as CasimirManager).filters[event]()
                return ((manager as CasimirManager).filters as any)[event](address)
            })

            // const items = (await Promise.all(eventFilters.map(async eventFilter => await (manager as CasimirManager).queryFilter(eventFilter, 0, 'latest'))))
            // Use Promise.allSettled to avoid errors when a filter returns no results
            const items = (await Promise.allSettled(eventFilters.map(async eventFilter => await (manager as CasimirManager).queryFilter(eventFilter, 0, "latest")))).map(result => result.status === "fulfilled" ? result.value : [])
    
            const userEventTotals = eventList.reduce((acc, event) => {
                acc[event] = 0
                return acc
            }, {} as { [key: string]: number })
    
            for (const item of items) {
                for (const action of item) {
                    const { args, event } = action
                    const { amount } = args
                    const amountInEth = parseFloat(ethers.utils.formatEther(amount))
                    userEventTotals[event as string] += amountInEth
                }
            }
            return userEventTotals as ContractEventsByAddress
        } catch (err) {
            console.error(`There was an error in getContractEventsTotalsByAddress: ${err}`)
            return {
                StakeDeposited: 0,
                StakeRebalanced: 0,
                WithdrawalInitiated: 0,
                WithdrawalRequested: 0,
                WithdrawalFulfilled: 0
            }
        }
    }

    async function calculateRewards(currentStaked: number, userEventTotals: ContractEventsByAddress) : Promise<number> {
        try {
            const { StakeDeposited, StakeRebalanced, WithdrawalInitiated, WithdrawalRequested, WithdrawalFulfilled } = userEventTotals as UserContractEvents
            return currentStaked - StakeDeposited + ((WithdrawalInitiated) + (WithdrawalRequested) + (WithdrawalFulfilled))
        } catch (err) {
            console.error(`There was an error in calculateRewards: ${err}`)
            return 0
        }
    }

    async function withdraw({ address, amount, walletProvider, type }: { address: string, amount: string, walletProvider: ProviderString, type: "default" | "eigen" }) {
        try {
            let toastContent ={
                id: withdrawToastId.value as string,
                type: "loading",
                iconUrl: "",
                title: "Submitting Withdraw",
                subtitle: "Submitting stake withdraw from pool",
                timed: false,
                loading: true
            }
            updateToast(toastContent)
            const activeNetwork = await detectActiveNetwork(walletProvider)
            if (activeNetwork !== 5) {
                await switchEthersNetwork(walletProvider, "0x5")
                return window.location.reload()
            }
            
            if (browserProvidersList.includes(walletProvider)) {
                const activeAddress = await detectActiveWalletAddress(walletProvider)
                if (activeAddress !== address) throw new Error("Active wallet address does not match selected address.")
            }
            
            // TODO: Handle other wallet providers selected address
    
            let signer
            if (browserProvidersList.includes(walletProvider)) {
                signer = getEthersBrowserSigner(walletProvider)
            } else if (walletProvider === "WalletConnect") {
                await getWalletConnectSignerV2()
            } else if (walletProvider === "Ledger") {
                getEthersLedgerSigner()
            } else if (walletProvider === "Trezor") {
                getEthersTrezorSigner()
            } else {
                throw new Error(`Invalid wallet provider: ${walletProvider}`)
            }
            const manager = type === "default" ? baseManager : eigenManager
            const managerSigner = (manager as CasimirManager).connect(signer as ethers.Signer)
            const value = ethers.utils.parseEther(amount.toString())
            const result = await managerSigner.requestWithdrawal(value)
            const confirmation = await result.wait(1)


            toastContent ={
                id: withdrawToastId.value as string,
                type: "success",
                iconUrl: "",
                title: "Withdraw Submitted",
                subtitle: "Withdraw submitted, check on status later",
                timed: true,
                loading: false
            }
            updateToast(toastContent)

            setTimeout(() => {
                removeToast(toastContent.id)
                stakingToastId.value = null
            }, 3000)
            return confirmation
        } catch (err: any) {
            if (err.message == "Active wallet address does not match selected address.") {
                stakingAmount.value = 0
                const toastContent = {
                    id: withdrawToastId.value as string,
                    type: "failed",
                    iconUrl: "",
                    title: "Cannot Withdraw",
                    subtitle: "The wallet you are trying to withdraw to is not your active wallet.",
                    timed: true,
                    loading: false
                }
                addToast(toastContent)
                setTimeout(() => {
                    removeToast(toastContent.id)
                    stakingToastId.value = null
                }, 3000)
            } else {
                console.error(`There was an error in withdraw function: ${JSON.stringify(err)}`)
                const toastContent = {
                    id: withdrawToastId.value as string,
                    type: "failed",
                    iconUrl: "",
                    title: "Something Went Wrong",
                    subtitle: "Please try again later",
                    timed: true,
                    loading: false
                }
                addToast(toastContent)
                setTimeout(() => {
                    removeToast(toastContent.id)
                    stakingToastId.value = null
                }, 3000)
                return false
            }
        }
    }

    return {
        stakingWalletAddress: readonly(stakingWalletAddress),
        stakingAmount: readonly(stakingAmount),
        eigenLayerSelection: readonly(eigenLayerSelection),
        acceptTerms: readonly(acceptTerms),
        withdrawAmount: readonly(withdrawAmount),
        depositFees: readonly(depositFees),
        userStakeDetails: readonly(userStakeDetails),
        selectWallet,
        setAmountToStake,
        toggleEigenlayerSelection,
        toggleTerms,
        handleStake,
        setWithdrawAmount,
        handleWithdraw
    }
}