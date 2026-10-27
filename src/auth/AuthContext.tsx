/**
 * AuthContext — lightweight email-based profile for Peetopee.
 *
 * No passwords, no JWT. The user enters their name, email and preferred
 * country once. The profile lives in localStorage. The wallet connection
 * (wagmi/ConnectKit) is separate — email auth gates the app UX, wagmi
 * gates onchain actions.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { CountryDef } from '../contracts/peetopee'
import { clearPin } from '../hooks/usePinAuth'
import { registerPtpId } from './peetopeeId'
import { apiRegister } from './ptpApi'

export interface UserProfile {
  name: string
  email: string
  phone?: string
  contactMethod: 'email' | 'phone'
  avatarDataUrl?: string   // base64 data URL of profile photo
  country: CountryDef
  createdAt: number
}

interface AuthState {
  profile: UserProfile | null
  signIn: (profile: UserProfile) => void
  signOut: () => void
  updateCountry: (country: CountryDef) => void
  updateProfile: (partial: Partial<UserProfile>) => void
}

const STORAGE_KEY = 'ptp_user_profile'

function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as UserProfile) : null
  } catch {
    return null
  }
}

function saveProfile(p: UserProfile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(loadProfile)

  const signIn = useCallback((p: UserProfile) => {
    // Clear any existing PIN so the new user always sets up their own PIN fresh
    clearPin()
    // Assign a local Peetopee ID for this user
    const localRecord = registerPtpId(p.email || p.phone || 'user', p.name, p.avatarDataUrl)
    // Also register on the central server so any device can find this user
    void apiRegister({
      email: p.email || p.phone || 'user',
      ptpId: localRecord.ptpId,
      displayName: p.name,
      countryCode: p.country?.code ?? '',
      avatarUrl: p.avatarDataUrl ?? '',
    })
    saveProfile(p)
    setProfile(p)
  }, [])

  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    clearPin()
    setProfile(null)
  }, [])

  const updateCountry = useCallback((country: CountryDef) => {
    setProfile(prev => {
      if (!prev) return prev
      const updated = { ...prev, country }
      saveProfile(updated)
      return updated
    })
  }, [])

  const updateProfile = useCallback((partial: Partial<UserProfile>) => {
    setProfile(prev => {
      if (!prev) return prev
      const updated = { ...prev, ...partial }
      saveProfile(updated)
      return updated
    })
  }, [])

  return (
    <AuthContext.Provider value={{ profile, signIn, signOut, updateCountry, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
