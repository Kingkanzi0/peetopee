/**
 * PinPad — simple, reliable 6-digit PIN entry.
 * Calls onComplete the moment the 6th digit is pressed.
 * No setTimeout, no stale closures.
 */
import { useState } from 'react'
import { Fingerprint, Delete } from 'lucide-react'
import { hasBioRegistered } from '@/hooks/usePinAuth'

interface PinPadProps {
  title: string
  subtitle?: string
  onComplete: (pin: string) => void
  onBiometrics?: () => void
  error?: string | null
  loading?: boolean
  showForgot?: boolean
  onForgot?: () => void
}

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','del']

export default function PinPad({
  title,
  subtitle,
  onComplete,
  onBiometrics,
  error,
  loading,
  showForgot,
  onForgot,
}: PinPadProps) {
  const [pin, setPin] = useState('')
  const bioAvailable = hasBioRegistered() && !!onBiometrics

  function press(key: string) {
    if (loading) return
    if (key === 'del') {
      setPin(p => p.slice(0, -1))
      return
    }
    if (key === '') return
    const next = pin + key
    if (next.length > 6) return
    setPin(next)
    if (next.length === 6) {
      // Reset display immediately so it feels responsive
      setPin('')
      onComplete(next)
    }
  }

  // Reset pin display when error arrives (wrong PIN)
  const displayPin = pin

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f172a] px-6 select-none">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1b3158] to-[#6c3fc5] flex items-center justify-center mx-auto mb-4">
          <Fingerprint className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-1">{title}</h2>
        {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
      </div>

      {/* Dots */}
      <div className="flex gap-4 mb-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
              i < displayPin.length
                ? 'bg-[#6c3fc5] border-[#6c3fc5] scale-110'
                : 'border-slate-600 bg-transparent'
            }`}
          />
        ))}
      </div>

      {/* Error */}
      <div className="h-6 mb-4">
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
      </div>

      {/* Loading spinner */}
      {loading && (
        <div className="mb-4">
          <div className="size-6 rounded-full border-2 border-[#6c3fc5] border-t-transparent animate-spin" />
        </div>
      )}

      {/* Biometrics shortcut */}
      {bioAvailable && !loading && (
        <button
          onClick={onBiometrics}
          className="flex items-center gap-2 text-[#a78bfa] text-sm mb-4 active:opacity-70"
        >
          <Fingerprint className="w-4 h-4" />
          Use biometrics
        </button>
      )}

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {KEYS.map((key, idx) => {
          if (key === '') return <div key={idx} />
          if (key === 'del') {
            return (
              <button
                key={idx}
                onClick={() => press('del')}
                className="h-16 rounded-2xl bg-slate-800/60 flex items-center justify-center active:bg-slate-700 transition-colors"
              >
                <Delete className="w-5 h-5 text-slate-300" />
              </button>
            )
          }
          return (
            <button
              key={idx}
              onClick={() => press(key)}
              disabled={loading}
              className="h-16 rounded-2xl bg-slate-800/60 text-white text-2xl font-semibold active:bg-[#6c3fc5]/60 transition-colors disabled:opacity-40"
            >
              {key}
            </button>
          )
        })}
      </div>

      {showForgot && onForgot && (
        <button
          onClick={onForgot}
          className="mt-8 text-slate-500 text-sm underline underline-offset-2"
        >
          Forgot PIN? Reset
        </button>
      )}
    </div>
  )
}
