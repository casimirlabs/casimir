import { EthersProvider } from '@/interfaces/EthersProvider'

// TODO: Add other browser providers here and set their types accordingly?? (BraveWallet, TrustWallet)
export interface BrowserProviders {
  BraveWallet?: EthersProvider
  CoinbaseWallet?: EthersProvider
  MetaMask?: EthersProvider
  TrustWallet?: EthersProvider
  // Phantom?: any // TODO: Fix this.
}
