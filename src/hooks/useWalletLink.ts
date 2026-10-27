/**
 * useWalletLink — auto-links the connected wagmi wallet address to the
 * current user's Peetopee ID every time their wallet or chain changes.
 *
 * This means any other Peetopee user can send USDC to this user's @handle
 * on whatever chain they're connected to.
 */
import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useAuth } from '../auth/AuthContext'
import { linkWallet } from '../auth/peetopeeId'
import { apiLinkWallet } from '../auth/ptpApi'

export function useWalletLink() {
  const { address, chainId } = useAccount()
  const { profile } = useAuth()

  useEffect(() => {
    if (!address || !chainId || !profile) return
    const email = profile.email || profile.phone || ''
    if (!email) return
    // Update local registry
    linkWallet(email, chainId, address)
    // Update central server so other devices can find this wallet
    void apiLinkWallet({ email, chainId, address })
  }, [address, chainId, profile])
}
