/**
 * useBiometrics — browser-native WebAuthn (fingerprint / Face ID).
 * No Circle SDK needed. Works on any modern mobile browser.
 *
 * Flow:
 * 1. registerBiometric() — called once after PIN is set. Creates a platform
 *    authenticator credential and stores its base64url ID in localStorage.
 * 2. verifyBiometric() — calls navigator.credentials.get() with the stored
 *    credential ID. Returns true if the device authenticates successfully.
 */
import { useState, useCallback } from 'react'
import { saveBioCredId, getBioCredId } from './usePinAuth'

const RP_ID_KEY = 'ptp_bio_rp_id'

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' &&
    !!window.PublicKeyCredential &&
    typeof navigator.credentials?.create === 'function'
}

export function useBiometrics() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const registerBiometric = useCallback(async (userName: string): Promise<boolean> => {
    if (!isWebAuthnSupported()) {
      setError('Biometrics not supported on this device.')
      return false
    }
    setBusy(true)
    setError(null)
    try {
      const rpId = window.location.hostname
      localStorage.setItem(RP_ID_KEY, rpId)

      const challenge = crypto.getRandomValues(new Uint8Array(32))
      const userId = crypto.getRandomValues(new Uint8Array(16))

      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'Peetopee', id: rpId },
          user: {
            id: userId,
            name: userName,
            displayName: userName,
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },  // ES256
            { type: 'public-key', alg: -257 }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred',
          },
          timeout: 60000,
          attestation: 'none',
        },
      }) as PublicKeyCredential | null

      if (!cred) { setError('Biometric registration cancelled.'); return false }

      saveBioCredId(base64url(cred.rawId))
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Biometric registration failed.'
      // NotAllowedError = user cancelled or no platform authenticator
      setError(msg.includes('NotAllowed') ? 'Biometric registration cancelled.' : msg)
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  const verifyBiometric = useCallback(async (): Promise<boolean> => {
    if (!isWebAuthnSupported()) {
      setError('Biometrics not supported on this device.')
      return false
    }
    const credIdStr = getBioCredId()
    if (!credIdStr) { setError('No biometric registered.'); return false }

    setBusy(true)
    setError(null)
    try {
      const rpId = localStorage.getItem(RP_ID_KEY) ?? window.location.hostname
      const challenge = crypto.getRandomValues(new Uint8Array(32))
      const credId = base64urlDecode(credIdStr)
      // BufferSource requires ArrayBuffer not Uint8Array<ArrayBufferLike>
      const credIdBuffer = credId.buffer.slice(credId.byteOffset, credId.byteOffset + credId.byteLength) as ArrayBuffer

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId,
          allowCredentials: [{ type: 'public-key', id: credIdBuffer }],
          userVerification: 'required',
          timeout: 60000,
        },
      }) as PublicKeyCredential | null

      if (!assertion) { setError('Biometric verification failed.'); return false }
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Biometric verification failed.'
      setError(msg.includes('NotAllowed') ? 'Biometric verification cancelled.' : msg)
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  return { registerBiometric, verifyBiometric, busy, error, setError, isSupported: isWebAuthnSupported() }
}
