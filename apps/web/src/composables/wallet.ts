import { ref } from 'vue'
import { ethers } from 'ethers'
import useIoPay from '@/composables/iopay'
import useLedger from '@/composables/ledger'
import useEthers from '@/composables/ethers'
import useWalletConnect from '@/composables/walletConnect'
import { ProviderString } from '@/types/ProviderString'
import { TransactionInit } from '@/interfaces/TransactionInit'

const { ethersProviderList, requestEthersAccount, sendEthersTransaction, signEthersMessage } = useEthers()
const {
  enableWalletConnect,
  disableWalletConnect,
  sendWalletConnectTransaction,
} = useWalletConnect()

const amount = ref<string>('0.001')
const toAddress = ref<string>('0x728474D29c2F81eb17a669a7582A2C17f1042b57')
// Test ethereum send to address : 0xD4e5faa8aD7d499Aa03BDDE2a3116E66bc8F8203
// Test iotex send to address: acc://06da5e904240736b1e21ca6dbbd5f619860803af04ff3d54/acme

export default function useWallet() {
  const { getIoPayAccounts, sendIoPayTransaction, signIoPayMessage } =
    useIoPay()
  const {
    bip32Path,
    getLedgerEthSigner,
    signLedgerMessage,
    sendLedgerTransaction,
  } = useLedger()
  const selectedProvider = ref<ProviderString>('')
  const selectedAccount = ref<string>('')
  const setSelectedProvider = (provider: ProviderString) => {
    selectedProvider.value = provider
  }
  const setSelectedAccount = (address: string) => {
    selectedAccount.value = address
  }

  async function connectWallet(provider: ProviderString) {
    try {
      if (selectedProvider.value === 'WalletConnect' && provider !== 'WalletConnect') {
        await disableWalletConnect()
      }
      setSelectedProvider(provider)
      selectedAccount.value = 'Not Active'
      if (provider === 'WalletConnect') {
        enableWalletConnect()
      } else if (ethersProviderList.includes(provider)) {
        const accounts = await requestEthersAccount(
          provider as ProviderString
        )
        const address = accounts[0]
        setSelectedAccount(address)
      } else if (provider === 'IoPay') {
        const accounts = await getIoPayAccounts()
        const { address } = accounts[0]
        setSelectedAccount(address)
      } else if (provider === 'Ledger') {
        const ledgerEth = await getLedgerEthSigner()
        const { address } = await ledgerEth.getAddress(bip32Path)
        setSelectedAccount(address)
      } else {
        throw new Error('No provider selected')
      }
    } catch (error) {
      console.error(error)
    }
  }

  async function sendTransaction(providerString: ProviderString) {
    const tx: TransactionInit = {
      from: selectedAccount.value,
      to: toAddress.value,
      value: amount.value,
      providerString
    }

    try {
      if (providerString === 'WalletConnect') {
        await sendWalletConnectTransaction(tx)
      } else if (ethersProviderList.includes(providerString)) {
        await sendEthersTransaction(tx)
      } else if (selectedProvider.value === 'IoPay') {
        await sendIoPayTransaction(tx)
      } else if (selectedProvider.value === 'Ledger') {
        await sendLedgerTransaction(tx)
      } else {
        throw new Error('Provider selected not yet supported')
      }
    } catch (error) {
      console.error('sendTransaction error: ', error)
    }
  }

  async function signMessage(message: string) {
    // TODO: Mock sending hash and signature to backend for verification
    try {
      if (ethersProviderList.includes(selectedProvider.value)) {
        await signEthersMessage(selectedProvider.value, message)
      } else if (selectedProvider.value === 'IoPay') {
        const hashedMessage = ethers.utils.id(message)
        await signIoPayMessage(hashedMessage)
      } else if (selectedProvider.value === 'Ledger') {
        await signLedgerMessage(message)
      } else {
        console.log('signMessage not yet supported for this wallet provider')
      }
    } catch (error) {
      console.error(error)
    }
  }

  return {
    selectedProvider,
    selectedAccount,
    toAddress,
    amount,
    connectWallet,
    sendTransaction,
    signMessage,
  }
}
