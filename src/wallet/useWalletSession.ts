/**
 * useWalletSession — call once the user has passed the PIN/biometric gate.
 * Decrypts the built-in wallet into memory and connects its Funds account to
 * wagmi, so trade screens (and the admin dispute page) can sign transactions.
 */
import { useEffect } from 'react'
import { useAccount, useConnect, useConnectors } from 'wagmi'
import { unlockWallet } from './standaloneWallet'
import { useAppWallet } from './appWallet'
import { PEETOPEE_CONNECTOR_ID } from './peetopeeConnector'

export function useWalletSession() {
  const { isConnected } = useAccount()
  const { connect } = useConnect()
  const connectors = useConnectors()
  const { wallet, unlocked } = useAppWallet()

  useEffect(() => { void unlockWallet() }, [])
  useEffect(() => {
    if (!wallet || !unlocked || isConnected) return
    const connector = connectors.find(c => c.id === PEETOPEE_CONNECTOR_ID)
    if (connector) connect({ connector })
  }, [wallet, unlocked, isConnected, connectors, connect])
}
