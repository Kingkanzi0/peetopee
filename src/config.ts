/**
 * wagmi configuration — Peetopee
 *
 * The app uses ONLY its own built-in wallet (create or import a seed phrase /
 * private key in the Wallet tab). External wallets such as MetaMask or
 * WalletConnect are intentionally not supported.
 *
 * wagmi is kept because the Market, Sell, Trader and Trade screens use its
 * read/write hooks; the single connector below signs with the built-in
 * wallet's Funds account.
 */

import { createConfig } from 'wagmi'
import { arcTestnet } from 'viem/chains'
import { arcTransport } from './wallet/arcNetwork'
import { registerChain } from './tracing'
import { peetopeeWallet } from './wallet/peetopeeConnector'

registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arcTestnet],
  connectors: [peetopeeWallet()],
  transports: {
    [arcTestnet.id]: arcTransport(),
  },
})
