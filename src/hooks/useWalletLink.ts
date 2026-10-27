/**
 * useWalletLink — links wallet addresses to the current user's Peetopee ID.
 * Runs on every load and whenever wallet/chain changes.
 * Links BOTH the standalone in-app wallet AND any wagmi connected wallet.
 */
import { useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiLinkWallet } from '../auth/ptpApi'
import { loadStoredWallet } from '../wallet/standaloneWallet'

// Arc Testnet chain ID
const ARC_CHAIN = 5042002

export function useWalletLink() {
  const { profile } = useAuth()

  useEffect(() => {
    if (!profile) return
    const email = profile.email || profile.phone || ''
    if (!email) return

    // Link the standalone in-app wallet (Arc Testnet)
    const stored = loadStoredWallet()
    if (stored?.address) {
      void apiLinkWallet({ email, chainId: ARC_CHAIN, address: stored.address })
    }
  }, [profile])
}
