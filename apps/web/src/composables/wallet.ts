import { ref } from 'vue'
import { ethers } from 'ethers'
import useEnvironment from '@/composables/environment'
import useIoPay from '@/composables/iopay'
import useLedger from '@/composables/ledger'
import useTrezor from '@/composables/trezor'
import useEthers from '@/composables/ethers'
import useWalletConnect from '@/composables/walletConnect'
import useSolana from '@/composables/solana'
import useSSV from '@/composables/ssv'
import { ProviderString } from '@/types/ProviderString'
import { TransactionInit } from '@/interfaces/TransactionInit'
import { MessageInit } from '@/interfaces/MessageInit'
import { Pool } from '@/interfaces/Pool'

const amount = ref<string>('0.1')
const toAddress = ref<string>('0x728474D29c2F81eb17a669a7582A2C17f1042b57')
const amountToStake = ref<string>('0.1')
const pools = ref<Pool[]>([])
const selectedProvider = ref<ProviderString>('')
const selectedAccount = ref<string>('')
// Test ethereum send to address : 0xD4e5faa8aD7d499Aa03BDDE2a3116E66bc8F8203
// Test solana address: 7aVow9eVQjwn7Y4y7tAbPM1pfrE1TzjmJhxcRt8QwX5F
// Test iotex send to address: acc://06da5e904240736b1e21ca6dbbd5f619860803af04ff3d54/acme

export default function useWallet() {
  const { ethereumURL } = useEnvironment()
  const { ssv } = useSSV()
  const { ethersProviderList, getEthersBrowserSigner, getEthersAddress, sendEthersTransaction, signEthersMessage, loginWithEthers } = useEthers()
  const { solanaProviderList, getSolanaAddress, sendSolanaTransaction, signSolanaMessage } = useSolana()
  const { getIoPayAddress, sendIoPayTransaction, signIoPayMessage } = useIoPay()
  const { getLedgerAddress, getEthersLedgerSigner, sendLedgerTransaction, signLedgerMessage } = useLedger()
  const { getTrezorAddress, getEthersTrezorSigner, sendTrezorTransaction, signTrezorMessage } = useTrezor()
  const { isWalletConnectSigner, getWalletConnectAddress, getEthersWalletConnectSigner, sendWalletConnectTransaction, signWalletConnectMessage } = useWalletConnect()

  // Todo should we move these ethers objects to the ethers composable?
  const ethersSignerCreator = {
    'MetaMask': getEthersBrowserSigner,
    'CoinbaseWallet': getEthersBrowserSigner,
    'Ledger': getEthersLedgerSigner,
    'Trezor': getEthersTrezorSigner,
    'WalletConnect': getEthersWalletConnectSigner
  }
  const ethersSignerList = Object.keys(ethersSignerCreator)

  const setSelectedProvider = (provider: ProviderString) => {
    selectedProvider.value = provider
  }
  const setSelectedAccount = (address: string) => {
    selectedAccount.value = address
  }

  async function connectWallet(provider: ProviderString) {
    try {
      setSelectedProvider(provider)
      selectedAccount.value = 'Not Active'
      if (provider === 'WalletConnect') {
        const address = await getWalletConnectAddress()
        setSelectedAccount(address)
      } else if (ethersProviderList.includes(provider)) {
        const address = await getEthersAddress(provider)
        setSelectedAccount(address)
      } else if (solanaProviderList.includes(provider)) {
        const address = await getSolanaAddress(provider)
        setSelectedAccount(address)
      } else if (provider === 'IoPay') {
        const address = await getIoPayAddress()
        setSelectedAccount(address)
      } else if (provider === 'Ledger') {
        const address = await getLedgerAddress()
        setSelectedAccount(address)
      } else if (provider === 'Trezor') {
        const address = await getTrezorAddress()
        setSelectedAccount(address)
      } else {
        throw new Error('No provider selected')
      }
    } catch (error) {
      console.error(error)
    }
  }

  async function sendTransaction() {
    const txInit: TransactionInit = {
      from: selectedAccount.value,
      to: toAddress.value,
      value: amount.value,
      providerString: selectedProvider.value
    }

    try {
      if (txInit.providerString === 'WalletConnect') {
        await sendWalletConnectTransaction(txInit)
      } else if (ethersProviderList.includes(txInit.providerString)) {
        await sendEthersTransaction(txInit)
      } else if (solanaProviderList.includes(txInit.providerString)) {
        await sendSolanaTransaction(txInit)
      } else if (selectedProvider.value === 'IoPay') {
        await sendIoPayTransaction(txInit)
      } else if (selectedProvider.value === 'Ledger') {
        await sendLedgerTransaction(txInit)
      } else if (selectedProvider.value === 'Trezor') {
        await sendTrezorTransaction(txInit)
      } else {
        throw new Error('Provider selected not yet supported')
      }
    } catch (error) {
      console.error('sendTransaction error: ', error)
    }
  }

  async function signMessage(message: string) {
    const messageInit: MessageInit = {
      message,
      providerString: selectedProvider.value,
    }
    try {
      if (messageInit.providerString === 'WalletConnect') {
        await signWalletConnectMessage(messageInit)
      } else if (ethersProviderList.includes(messageInit.providerString)) {
        await signEthersMessage(messageInit)
      } else if (solanaProviderList.includes(messageInit.providerString)) {
        await signSolanaMessage(messageInit)
      } else if (messageInit.providerString === 'IoPay') {
        await signIoPayMessage(messageInit)
      } else if (messageInit.providerString === 'Ledger') {
        await signLedgerMessage(messageInit)
      } else if (messageInit.providerString === 'Trezor') {
        await signTrezorMessage(messageInit)
      } else {
        console.log('signMessage not yet supported for this wallet provider')
      }
    } catch (error) {
      console.error(error)
    }
  }

  // Todo @ccali11 should we move these ssv objects to the ssv composable?
  async function getUserPools() {
    if (ethersSignerList.includes(selectedProvider.value)) {
      const provider = new ethers.providers.JsonRpcProvider(ethereumURL)
      const userAddress = selectedAccount.value
      const ssvProvider = ssv.connect(provider)
      const usersPoolsIds = await ssvProvider.getUserPoolIds(userAddress)
      pools.value = await Promise.all(usersPoolsIds.map(async (poolId: number) => {
        const { stake: totalStake, rewards: totalRewards } = await ssvProvider.getPoolBalance(poolId)
        const { stake: userStake, rewards: userRewards } = await ssvProvider.getPoolUserBalance(poolId, userAddress)
        return {
          id: poolId,
          totalStake: ethers.utils.formatEther(totalStake),
          totalRewards: ethers.utils.formatEther(totalRewards),
          userStake: ethers.utils.formatEther(userStake),
          userRewards: ethers.utils.formatEther(userRewards)
        }
      }))
    }
  }

  async function deposit() {
    if (Object.keys(ethersSignerCreator).includes(selectedProvider.value)) {
      const signerKey = selectedProvider.value as keyof typeof ethersSignerCreator
      let signer = ethersSignerCreator[signerKey](selectedProvider.value)
      if (isWalletConnectSigner(signer)) signer = await signer
      const ssvProvider = ssv.connect(signer)
      const fees = await ssvProvider.getFees()
      const { LINK, SSV } = fees
      // TODO: Fix types
      const feesTotalPercent = LINK + SSV
      const depositAmount = amountToStake.value * ((100 + feesTotalPercent) / 100)
      const value = ethers.utils.parseEther(depositAmount.toString())
      const result = await ssvProvider.deposit({ value, type: 0 })
      return await result.wait()
    } else {
      // Todo @ccali11 this should happen sooner - ideally we'll this disable method if missing ssv provider
      console.log('Please connect to one of the following providers:', ethersProviderList)
    }
    return
  }

  async function login() {
    try {
      if (ethersProviderList.includes(selectedProvider.value)) {
        const loggedIn = await loginWithEthers(selectedProvider.value, selectedAccount.value)
        console.log('loggedIn :>> ', loggedIn)
      } else {
        console.log('Login not yet supported for this wallet provider')
      }
    } catch (err) {
      console.log(`There was an error logging in: ${err}`)
    }
  }

  return {
    selectedProvider,
    selectedAccount,
    toAddress,
    amount,
    amountToStake,
    pools,
    connectWallet,
    sendTransaction,
    signMessage,
    deposit,
    login,
    getUserPools
  }
}