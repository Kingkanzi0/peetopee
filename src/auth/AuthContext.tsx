/**
 * AuthContext — your Peetopee account.
 *
 * Sign-in is a one-time code checked by the server (see otpService.ts), which
 * gives a session token. The profile is cached in localStorage so the app opens
 * instantly, and the server is the source of truth for your Peetopee ID,
 * linked wallets and ID-verification status.
 *
 * If the session is missing or expires, the cached profile is cleared and the
 * app shows sign-in again. Signing back in restores your profile from the server.
 */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { getCountryByCode, type CountryDef } from '../contracts/peetopee'
import { clearPin } from '../hooks/usePinAuth'
import {
  apiLogout, apiMe, apiRegister, apiUpdateHandle, getSessionToken,
  type KycStatus, type MeResponse,
} from './ptpApi'

export interface UserProfile {
  name: string
  email: string
  phone?: string
  contactMethod: 'email' | 'phone'
  avatarDataUrl?: string   // base64 data URL of profile photo
  country: CountryDef      // home country
  createdAt: number
  ptpId?: string           // assigned by the server, e.g. "@emeka"
}

interface AuthState {
  profile: UserProfile | null
  /** Latest account info from the server (wallets, ID status). Null until loaded. */
  account: MeResponse | null
  kycStatus: KycStatus
  /** Call after a successful code check. Creates or updates your server profile. */
  signIn: (profile: UserProfile) => Promise<void>
  signOut: () => void
  updateCountry: (country: CountryDef) => void
  updateProfile: (partial: Partial<UserProfile>) => void
  /** Update the profile and wait until the server has it (throws if it couldn't be saved). */
  saveProfileNow: (partial: Partial<UserProfile>) => Promise<void>
  /** Change your @handle. Throws with a readable message if it's taken or invalid. */
  changePtpId: (handle: string) => Promise<string>
  refreshAccount: () => Promise<void>
}

const STORAGE_KEY = 'ptp_user_profile'

function loadProfile(): UserProfile | null {
  try {
    // Without a session the cached profile can't do anything useful.
    if (!getSessionToken()) return null
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as UserProfile) : null
  } catch {
    return null
  }
}

function saveProfile(p: UserProfile | null) {
  try {
    if (p) localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
    else localStorage.removeItem(STORAGE_KEY)
  } catch { /* storage unavailable */ }
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(loadProfile)
  const [account, setAccount] = useState<MeResponse | null>(null)

  const commit = useCallback((p: UserProfile | null) => {
    saveProfile(p)
    setProfile(p)
  }, [])

  const refreshAccount = useCallback(async () => {
    if (!getSessionToken()) return
    try {
      const me = await apiMe()
      setAccount(me)
      if (me.profile) {
        setProfile(prev => {
          if (!prev || prev.ptpId === me.profile!.ptpId) return prev
          const next = { ...prev, ptpId: me.profile!.ptpId }
          saveProfile(next)
          return next
        })
      }
    } catch { /* offline — keep cached data */ }
  }, [])

  // Load account details on start, and sign out if the server ends the session.
  useEffect(() => {
    if (!profile) return
    void refreshAccount()
    function onSession() {
      if (!getSessionToken()) { commit(null); setAccount(null) }
    }
    window.addEventListener('ptp-session-changed', onSession)
    return () => window.removeEventListener('ptp-session-changed', onSession)
  }, [profile?.email, profile?.phone]) // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = useCallback(async (p: UserProfile) => {
    // A new person on this device sets up their own PIN.
    clearPin()
    const server = await apiRegister({
      ptpId: p.ptpId,
      displayName: p.name,
      countryCode: p.country?.code ?? '',
      avatarUrl: p.avatarDataUrl ?? '',
    })
    const country = p.country ?? getCountryByCode(server.countryCode)
    commit({ ...p, country, ptpId: server.ptpId })
  }, [commit])

  const signOut = useCallback(() => {
    void apiLogout()
    clearPin()
    commit(null)
    setAccount(null)
  }, [commit])

  const pushProfile = useCallback((p: UserProfile) => {
    void apiRegister({
      displayName: p.name,
      countryCode: p.country?.code ?? '',
      avatarUrl: p.avatarDataUrl ?? '',
    }).catch(() => { /* retried next time the profile changes */ })
  }, [])

  const updateCountry = useCallback((country: CountryDef) => {
    setProfile(prev => {
      if (!prev) return prev
      const updated = { ...prev, country }
      saveProfile(updated)
      pushProfile(updated)
      return updated
    })
  }, [pushProfile])

  const updateProfile = useCallback((partial: Partial<UserProfile>) => {
    setProfile(prev => {
      if (!prev) return prev
      const updated = { ...prev, ...partial }
      saveProfile(updated)
      if ('name' in partial || 'avatarDataUrl' in partial || 'country' in partial) pushProfile(updated)
      return updated
    })
  }, [pushProfile])

  const saveProfileNow = useCallback(async (partial: Partial<UserProfile>) => {
    if (!profile) return
    const updated = { ...profile, ...partial }
    await apiRegister({
      displayName: updated.name,
      countryCode: updated.country?.code ?? '',
      avatarUrl: updated.avatarDataUrl ?? '',
    })
    commit(updated)
  }, [profile, commit])

  const changePtpId = useCallback(async (handle: string) => {
    const ptpId = await apiUpdateHandle(handle)
    setProfile(prev => {
      if (!prev) return prev
      const updated = { ...prev, ptpId }
      saveProfile(updated)
      return updated
    })
    return ptpId
  }, [])

  const kycStatus: KycStatus = account?.kyc.status ?? 'none'

  return (
    <AuthContext.Provider value={{ profile, account, kycStatus, signIn, signOut, updateCountry, updateProfile, saveProfileNow, changePtpId, refreshAccount }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
