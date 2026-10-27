/**
 * useWalletStore — React context/state for the inbuilt wallet.
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { createElement } from 'react'
import {
  loadCredential,
  persistCredential,
  clearCredential,
  getSmartAccount,
  registerPasskey,
  loginPasskey,
  WALLET_CHAINS,
  type P256Credential,
  type WalletChainId,
} from './walletCore'

interface WalletState {
  credential: P256Credential | null
  address: string | null
  activeChainId: WalletChainId
  loading: boolean
  error: string | null
  register: (username: string) => Promise<void>
  login: () => Promise<void>
  logout: () => void
  switchChain: (id: WalletChainId) => void
}

const DEFAULT_CHAIN: WalletChainId = 5042002

const WalletCtx = createContext<WalletState | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [credential, setCredential] = useState<P256Credential | null>(() => loadCredential())
  const [address, setAddress] = useState<string | null>(null)
  const [activeChainId, setActiveChainId] = useState<WalletChainId>(DEFAULT_CHAIN)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resolve smart account address; use ref to avoid stale closure
  const credRef = useRef(credential)
  const chainRef = useRef(activeChainId)
  credRef.current = credential
  chainRef.current = activeChainId

  useEffect(() => {
    if (!credRef.current) return
    let cancelled = false
    void getSmartAccount(credRef.current, chainRef.current)
      .then(acc => { if (!cancelled) setAddress(acc.address) })
      .catch(() => { if (!cancelled) setAddress(null) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credential, activeChainId])

  // Clear address when credential is cleared (outside effect, derived)
  const addressToShow = credential ? address : null

  const register = useCallback(async (username: string) => {
    setLoading(true); setError(null)
    try {
      const cred = await registerPasskey(username)
      persistCredential(cred)
      setCredential(cred)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }, [])

  const login = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const cred = await loginPasskey()
      persistCredential(cred)
      setCredential(cred)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    clearCredential()
    setCredential(null)
    setAddress(null)
  }, [])

  const switchChain = useCallback((id: WalletChainId) => setActiveChainId(id), [])

  const value: WalletState = {
    credential,
    address: addressToShow,
    activeChainId,
    loading,
    error,
    register,
    login,
    logout,
    switchChain,
  }

  return createElement(WalletCtx.Provider, { value }, children)
}

export function useWallet() {
  const ctx = useContext(WalletCtx)
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>')
  return ctx
}

export { WALLET_CHAINS }
