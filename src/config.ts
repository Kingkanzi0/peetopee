/**
 * wagmi configuration — Peetopee
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet, baseSepolia, arbitrumSepolia } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected, walletConnect } from 'wagmi/connectors'
import { registerChain } from './tracing'

registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

export const WC_PROJECT_ID = (import.meta.env.VITE_WC_PROJECT_ID as string) || ''

const APP_URL = 'https://reekystem-app-c461974f-1d1c-45bb-9a5b-bb8590159ba7.static.hf.space'

const connectors = [
  // Injected: picks up MetaMask extension, OKX in-app browser, and any
  // browser-injected wallet automatically.
  injected({ shimDisconnect: true }),

  // WalletConnect v2: handles deep-linking to MetaMask app, OKX app, Zerion,
  // Rabby, Phantom, Rainbow, Trust Wallet and 400+ others on mobile.
  ...(WC_PROJECT_ID
    ? [walletConnect({
        projectId: WC_PROJECT_ID,
        metadata: {
          name: 'Peetopee',
          description: 'Your USDC. Local Money. Anywhere.',
          url: APP_URL,
          icons: [`${APP_URL}/icon-512.png`],
        },
        // Let ConnectKit render its own modal — don't show the default WC QR popup
        showQrModal: false,
      })]
    : []),
]

export const config = createConfig({
  chains: [arcTestnet, baseSepolia, arbitrumSepolia, mainnet],
  connectors,
  transports: {
    [arcTestnet.id]: http(),
    [baseSepolia.id]: http(),
    [arbitrumSepolia.id]: http(),
    [mainnet.id]: http(),
  },
})
