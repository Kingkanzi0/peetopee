/**
 * PinGate — guards the app behind a 6-digit PIN + optional biometrics.
 *
 * Single source of truth: `stage`
 *   setup    → user enters PIN for the first time
 *   confirm  → user re-enters to confirm match
 *   bio      → offer to register biometrics after PIN set
 *   lock     → returning user must enter PIN (or use biometrics)
 *   unlocked → render children
 *
 * Design principles:
 * - NO separate `unlocked` boolean — stage === 'unlocked' is enough
 * - firstPin stored in useRef (never triggers re-render, never stale)
 * - async handlers called with void operator from sync onClick
 * - PIN comparison is sync (just string equality)
 */
import { useState, useRef, useEffect } from 'react'
import { Fingerprint } from 'lucide-react'
import PinPad from './PinPad'
import { usePinAuth, hasPinSet, hasBioRegistered, clearPin } from '@/hooks/usePinAuth'
import { useBiometrics } from '@/hooks/useBiometrics'

type Stage = 'setup' | 'confirm' | 'bio' | 'lock' | 'unlocked'

interface PinGateProps {
  userName: string
  children: React.ReactNode
}

export default function PinGate({ userName, children }: PinGateProps) {
  const initialStage: Stage = hasPinSet() ? 'lock' : 'setup'
  const [stage, setStage] = useState<Stage>(initialStage)
  const [pinError, setPinError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const firstPinRef = useRef<string>('')

  const { setPin: savePin, verifyPin } = usePinAuth()
  const { registerBiometric, verifyBiometric, busy: bioBusy, error: bioError, isSupported } = useBiometrics()

  // Auto-try biometrics when returning to lock screen
  useEffect(() => {
    if (stage === 'lock' && hasBioRegistered()) {
      void tryBiometrics()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  async function tryBiometrics() {
    const ok = await verifyBiometric()
    if (ok) setStage('unlocked')
  }

  // ── Setup: store first PIN in ref, go to confirm ──────────────────────────
  function handleSetup(pin: string) {
    firstPinRef.current = pin
    setPinError(null)
    setStage('confirm')
  }

  // ── Confirm: compare with ref, save hash, advance ─────────────────────────
  async function handleConfirm(pin: string) {
    if (pin !== firstPinRef.current) {
      setPinError('PINs do not match — try again.')
      firstPinRef.current = ''
      setStage('setup')
      return
    }
    setBusy(true)
    try {
      await savePin(pin)
    } finally {
      setBusy(false)
    }
    // Advance — offer biometrics if device supports it
    if (isSupported) {
      setStage('bio')
    } else {
      setStage('unlocked')
    }
  }

  // ── Lock: verify hash, unlock ─────────────────────────────────────────────
  async function handleLock(pin: string) {
    setBusy(true)
    try {
      const ok = await verifyPin(pin)
      if (ok) {
        setPinError(null)
        setStage('unlocked')
      } else {
        setPinError('Wrong PIN. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  // ── Bio: register credential, then unlock ─────────────────────────────────
  async function handleRegisterBio() {
    const ok = await registerBiometric(userName)
    if (ok) setStage('unlocked')
  }

  function handleForgot() {
    clearPin()
    firstPinRef.current = ''
    setPinError(null)
    setStage('setup')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (stage === 'unlocked') return <>{children}</>

  if (stage === 'bio') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f172a] px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1b3158] to-[#6c3fc5] flex items-center justify-center mx-auto mb-6">
          <Fingerprint className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Enable biometrics?</h2>
        <p className="text-slate-400 text-sm mb-8 max-w-xs">
          Use Face ID or fingerprint to unlock Peetopee — faster and more secure than your PIN.
        </p>

        {bioError && <p className="text-red-400 text-sm mb-4">{bioError}</p>}

        <button
          onClick={() => { void handleRegisterBio() }}
          disabled={bioBusy}
          className="w-full max-w-xs py-4 rounded-2xl bg-[#6c3fc5] text-white font-semibold text-base mb-3 active:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Fingerprint className="w-5 h-5" />
          {bioBusy ? 'Registering…' : 'Enable biometrics'}
        </button>

        <button
          onClick={() => setStage('unlocked')}
          className="w-full max-w-xs py-4 rounded-2xl bg-slate-800 text-slate-300 font-medium text-base active:opacity-80"
        >
          Skip for now
        </button>

        <p className="text-slate-600 text-xs mt-6 max-w-xs">
          You can always enable this later from your profile settings.
        </p>
      </div>
    )
  }

  if (stage === 'setup') {
    return (
      <PinPad
        title="Create your PIN"
        subtitle="Choose a 6-digit PIN to secure your account"
        onComplete={handleSetup}
        error={pinError}
        loading={busy}
      />
    )
  }

  if (stage === 'confirm') {
    return (
      <PinPad
        title="Confirm your PIN"
        subtitle="Enter the same PIN again to confirm"
        onComplete={pin => { void handleConfirm(pin) }}
        error={pinError}
        loading={busy}
      />
    )
  }

  // stage === 'lock'
  return (
    <PinPad
      title="Welcome back"
      subtitle="Enter your PIN to continue"
      onComplete={pin => { void handleLock(pin) }}
      onBiometrics={() => { void tryBiometrics() }}
      error={pinError ?? bioError}
      loading={busy || bioBusy}
      showForgot
      onForgot={handleForgot}
    />
  )
}
