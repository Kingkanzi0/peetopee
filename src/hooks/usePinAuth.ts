/**
 * usePinAuth — stores and verifies a 6-digit PIN using SHA-256 (Web Crypto).
 * The raw PIN never touches localStorage; only the hex digest is saved.
 * Handles biometric credential ID storage alongside the PIN hash.
 */
import { useState, useCallback } from 'react'

const PIN_HASH_KEY = 'ptp_pin_hash'
const BIO_CRED_KEY = 'ptp_bio_cred_id'
const PIN_ATTEMPTS_KEY = 'ptp_pin_attempts'
const MAX_ATTEMPTS = 5

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export function hasPinSet(): boolean {
  return !!localStorage.getItem(PIN_HASH_KEY)
}

export function hasBioRegistered(): boolean {
  return !!localStorage.getItem(BIO_CRED_KEY)
}

export function getBioCredId(): string | null {
  return localStorage.getItem(BIO_CRED_KEY)
}

export function saveBioCredId(credId: string): void {
  localStorage.setItem(BIO_CRED_KEY, credId)
}

export function clearPin(): void {
  localStorage.removeItem(PIN_HASH_KEY)
  localStorage.removeItem(BIO_CRED_KEY)
  localStorage.removeItem(PIN_ATTEMPTS_KEY)
}

function getAttempts(): number {
  return parseInt(localStorage.getItem(PIN_ATTEMPTS_KEY) ?? '0', 10)
}

function incAttempts(): number {
  const n = getAttempts() + 1
  localStorage.setItem(PIN_ATTEMPTS_KEY, String(n))
  return n
}

function resetAttempts(): void {
  localStorage.removeItem(PIN_ATTEMPTS_KEY)
}

export function usePinAuth() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setPin = useCallback(async (pin: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const hash = await sha256hex(pin)
      localStorage.setItem(PIN_HASH_KEY, hash)
      resetAttempts()
    } finally {
      setBusy(false)
    }
  }, [])

  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      const storedHash = localStorage.getItem(PIN_HASH_KEY)
      if (!storedHash) { setError('No PIN set.'); return false }
      const attempts = getAttempts()
      if (attempts >= MAX_ATTEMPTS) {
        setError('Too many attempts. Please reset your PIN via email.')
        return false
      }
      const hash = await sha256hex(pin)
      if (hash === storedHash) {
        resetAttempts()
        return true
      }
      const remaining = MAX_ATTEMPTS - incAttempts()
      setError(remaining > 0 ? `Wrong PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} left.` : 'Too many attempts. Please reset your PIN via email.')
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  return { setPin, verifyPin, busy, error, setError }
}
