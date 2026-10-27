/**
 * OnboardingFlow — 4-step registration for Peetopee.
 *
 * Step 1 — Choose method (email or phone) and enter it
 * Step 2 — Enter 6-digit OTP sent to that contact
 * Step 3 — Enter name and set profile photo
 * Step 4 — Pick country
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Phone, ChevronRight, Search, CheckCircle2, RefreshCw } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { sendOtp, verifyOtp, otpSecondsLeft } from '../auth/otpService'
import { AvatarPicker } from './AvatarPicker'
import { COUNTRIES } from '../contracts/peetopee'
import type { CountryDef } from '../contracts/peetopee'
import { PeetopeeLogoSVG } from './PeetopeeLogoSVG'

type Step = 'contact' | 'otp' | 'profile' | 'country'

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}
function isValidPhone(v: string) {
  // allow + and digits, 7–15 chars
  return /^\+?[0-9]{7,15}$/.test(v.replace(/[\s\-()]/g, ''))
}

const SLIDE = {
  initial: { opacity: 0, x: 40 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: -40 },
  transition: { duration: 0.28 },
}

export function OnboardingFlow() {
  const { signIn } = useAuth()

  // Step state
  const [step, setStep] = useState<Step>('contact')
  const [method, setMethod] = useState<'email' | 'phone'>('email')
  const [contact, setContact] = useState('')
  const [contactTouched, setContactTouched] = useState(false)

  // OTP state
  const [otp, setOtp] = useState('')
  const [otpError, setOtpError] = useState('')
  const [demoCode, setDemoCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [otpBusy, setOtpBusy] = useState(false)

  // Profile state
  const [name, setName] = useState('')
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | undefined>()

  // Country state
  const [query, setQuery] = useState('')
  const [selectedCountry, setSelectedCountry] = useState<CountryDef | null>(null)

  // OTP input refs for 6 individual boxes
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return
    const t = setInterval(() => {
      setCountdown(c => {
        const next = c - 1
        if (next <= 0) clearInterval(t)
        return next
      })
    }, 1000)
    return () => clearInterval(t)
  }, [countdown])

  const contactValue = contact.trim()
  const contactValid = method === 'email' ? isValidEmail(contactValue) : isValidPhone(contactValue)
  const contactError = contactTouched && contactValue.length > 0 && !contactValid

  const filtered = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.currency.toLowerCase().includes(query.toLowerCase())
  )

  // ── Step 1 → 2: send OTP ──────────────────────────────────────────────────
  function handleSendOtp() {
    if (!contactValid) return
    const result = sendOtp(contactValue)
    setDemoCode(result.demoCode)
    setCountdown(otpSecondsLeft(contactValue))
    setOtp('')
    setOtpError('')
    setStep('otp')
  }

  // ── Step 2: OTP box input ─────────────────────────────────────────────────
  function handleOtpKey(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }
  }

  function handleOtpInput(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const arr = otp.split('')
    arr[index] = digit
    const next = arr.join('').slice(0, 6)
    setOtp(next)
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus()
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setOtp(pasted)
      otpRefs.current[5]?.focus()
    }
  }

  const handleVerifyOtp = useCallback(() => {
    setOtpBusy(true)
    setOtpError('')
    setTimeout(() => {
      const ok = verifyOtp(contactValue, otp)
      setOtpBusy(false)
      if (ok) {
        setStep('profile')
      } else {
        setOtpError('Incorrect code. Please try again.')
        setOtp('')
        otpRefs.current[0]?.focus()
      }
    }, 600)
  }, [contactValue, otp])

  // Auto-verify when 6 digits entered — defer to next tick to avoid setState-in-effect
  useEffect(() => {
    if (otp.length !== 6 || step !== 'otp') return
    const t = setTimeout(handleVerifyOtp, 0)
    return () => clearTimeout(t)
  }, [otp, step, handleVerifyOtp])

  // ── Step 4: finish ────────────────────────────────────────────────────────
  function handleFinish() {
    if (!selectedCountry) return
    signIn({
      name: name.trim(),
      email: method === 'email' ? contactValue : '',
      phone: method === 'phone' ? contactValue : undefined,
      contactMethod: method,
      avatarDataUrl,
      country: selectedCountry,
      createdAt: Date.now(),
    })
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg-gradient)' }}>
      {/* Logo */}
      <div className="flex justify-center pt-10 pb-2 shrink-0">
        <PeetopeeLogoSVG size="md" variant="horizontal" on="light" />
      </div>

      {/* Step indicator */}
      <div className="flex justify-center gap-2 py-3 shrink-0">
        {(['contact', 'otp', 'profile', 'country'] as Step[]).map((s, i) => (
          <div
            key={s}
            className="rounded-full transition-all"
            style={{
              width: step === s ? 20 : 6,
              height: 6,
              background: step === s ? 'var(--accent)' : (
                (['contact', 'otp', 'profile', 'country'] as Step[]).indexOf(step) > i
                  ? 'var(--accent)'
                  : 'var(--border)'
              ),
            }}
          />
        ))}
      </div>

      <div className="flex-1 flex flex-col max-w-md mx-auto w-full px-5 pb-10 min-h-0">
        <AnimatePresence mode="wait">

          {/* ── Step 1: Contact ─────────────────────────────────────────── */}
          {step === 'contact' && (
            <motion.div key="contact" {...SLIDE} className="flex-1 flex flex-col">
              <div className="mt-4 mb-6">
                <h1 className="text-2xl font-bold display mb-1.5" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                  Create your account
                </h1>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  We'll send a one-time code to verify it's you.
                </p>
              </div>

              {/* Toggle */}
              <div
                className="flex rounded-2xl p-1 mb-5"
                style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)' }}
              >
                {(['email', 'phone'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => { setMethod(m); setContact(''); setContactTouched(false) }}
                    className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all flex items-center justify-center gap-2"
                    style={{
                      background: method === m ? 'var(--accent)' : 'transparent',
                      color: method === m ? 'white' : 'var(--muted)',
                    }}
                  >
                    {m === 'email' ? <Mail className="size-4" /> : <Phone className="size-4" />}
                    {m === 'email' ? 'Email' : 'Phone'}
                  </button>
                ))}
              </div>

              {/* Input */}
              <div>
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--subtle)' }}>
                  {method === 'email' ? 'EMAIL ADDRESS' : 'PHONE NUMBER'}
                </label>
                <div className="relative">
                  {method === 'email'
                    ? <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4" style={{ color: 'var(--subtle)' }} />
                    : <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4" style={{ color: 'var(--subtle)' }} />
                  }
                  <input
                    type={method === 'email' ? 'email' : 'tel'}
                    inputMode={method === 'email' ? 'email' : 'tel'}
                    placeholder={method === 'email' ? 'you@example.com' : '+234 800 000 0000'}
                    value={contact}
                    onChange={e => setContact(e.target.value)}
                    onBlur={() => setContactTouched(true)}
                    className="w-full rounded-2xl pl-10 pr-4 py-3.5 text-sm outline-none"
                    style={{
                      background: 'var(--surface-muted)',
                      border: `1.5px solid ${contactError ? 'var(--danger)' : 'var(--border)'}`,
                      color: 'var(--ink)',
                      fontSize: 16,
                    }}
                    autoComplete={method === 'email' ? 'email' : 'tel'}
                  />
                </div>
                {contactError && (
                  <p className="text-xs mt-1.5 ml-1" style={{ color: 'var(--danger)' }}>
                    {method === 'email' ? 'Please enter a valid email address.' : 'Please enter a valid phone number (with country code).'}
                  </p>
                )}
                <p className="text-xs mt-2 px-1" style={{ color: 'var(--subtle)' }}>
                  Stored on your device only. Never shared or used for marketing.
                </p>
              </div>

              <div className="mt-auto pt-8">
                <button
                  onClick={handleSendOtp}
                  disabled={!contactValid}
                  className="w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
                  style={{ background: 'var(--accent)' }}
                >
                  Send code
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Step 2: OTP ─────────────────────────────────────────────── */}
          {step === 'otp' && (
            <motion.div key="otp" {...SLIDE} className="flex-1 flex flex-col">
              <div className="mt-4 mb-6">
                <button onClick={() => setStep('contact')} className="text-xs mb-3 flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                  ← Back
                </button>
                <h1 className="text-2xl font-bold display mb-1.5" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                  Enter the code
                </h1>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  We sent a 6-digit code to <span className="font-semibold" style={{ color: 'var(--ink)' }}>{contactValue}</span>
                </p>
              </div>

              {/* Demo banner */}
              {demoCode && (
                <div
                  className="rounded-2xl px-4 py-3 mb-5 flex items-center gap-3"
                  style={{ background: 'rgba(108,63,197,0.08)', border: '1px solid rgba(108,63,197,0.2)' }}
                >
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    Demo code (not a real SMS/email):
                  </span>
                  <span className="font-mono text-base font-bold tracking-widest" style={{ color: '#6c3fc5' }}>
                    {demoCode}
                  </span>
                </div>
              )}

              {/* 6-box OTP input */}
              <div className="flex gap-3 justify-center mb-2" onPaste={handleOtpPaste}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <input
                    key={i}
                    ref={el => { otpRefs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={otp[i] ?? ''}
                    onChange={e => handleOtpInput(i, e.target.value)}
                    onKeyDown={e => handleOtpKey(i, e)}
                    className="rounded-2xl text-center font-bold text-xl outline-none transition-all"
                    style={{
                      width: 46,
                      height: 58,
                      fontSize: 24,
                      background: 'var(--surface-strong)',
                      border: `2px solid ${otpError ? 'var(--danger)' : otp[i] ? 'var(--accent)' : 'var(--border)'}`,
                      color: 'var(--ink)',
                      caretColor: 'var(--accent)',
                    }}
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              {otpError && (
                <p className="text-center text-xs mt-1 mb-2" style={{ color: 'var(--danger)' }}>{otpError}</p>
              )}

              {/* Resend */}
              <div className="flex justify-center mt-3">
                {countdown > 0 ? (
                  <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                    Resend in {countdown}s
                  </p>
                ) : (
                  <button
                    onClick={handleSendOtp}
                    className="text-xs flex items-center gap-1"
                    style={{ color: 'var(--accent)' }}
                  >
                    <RefreshCw className="size-3" />
                    Resend code
                  </button>
                )}
              </div>

              <div className="mt-auto pt-8">
                <button
                  onClick={handleVerifyOtp}
                  disabled={otp.length < 6 || otpBusy}
                  className="w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
                  style={{ background: 'var(--accent)' }}
                >
                  {otpBusy ? (
                    <div className="size-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : (
                    <>Verify <ChevronRight className="size-4" /></>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Step 3: Profile ──────────────────────────────────────────── */}
          {step === 'profile' && (
            <motion.div key="profile" {...SLIDE} className="flex-1 flex flex-col">
              <div className="mt-4 mb-5">
                <h1 className="text-2xl font-bold display mb-1.5" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                  Set up your profile
                </h1>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Add a photo so traders know who they're working with.
                </p>
              </div>

              <div className="flex flex-col items-center gap-6">
                <AvatarPicker
                  name={name || '?'}
                  dataUrl={avatarDataUrl}
                  onChange={setAvatarDataUrl}
                  size={96}
                />

                <div className="w-full">
                  <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--subtle)' }}>
                    YOUR NAME
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Emeka Okafor"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full rounded-2xl px-4 py-3.5 text-sm outline-none"
                    style={{
                      background: 'var(--surface-muted)',
                      border: '1.5px solid var(--border)',
                      color: 'var(--ink)',
                      fontSize: 16,
                    }}
                    autoComplete="name"
                    autoFocus
                  />
                </div>
              </div>

              <div className="mt-auto pt-8">
                <button
                  onClick={() => setStep('country')}
                  disabled={name.trim().length < 2}
                  className="w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
                  style={{ background: 'var(--accent)' }}
                >
                  Continue
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Step 4: Country ──────────────────────────────────────────── */}
          {step === 'country' && (
            <motion.div key="country" {...SLIDE} className="flex-1 flex flex-col min-h-0">
              <div className="mt-4 mb-4">
                <button onClick={() => setStep('profile')} className="text-xs mb-2 flex items-center gap-1" style={{ color: 'var(--muted)' }}>
                  ← Back
                </button>
                <h1 className="text-2xl font-bold display mb-1" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                  Where are you?
                </h1>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  We'll show your balance in your local currency.
                </p>
              </div>

              <div className="relative mb-3 shrink-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4" style={{ color: 'var(--subtle)' }} />
                <input
                  type="text"
                  placeholder="Search country or currency..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  className="w-full rounded-2xl pl-10 pr-4 py-3 text-sm outline-none"
                  style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-2" style={{ paddingBottom: '6rem' }}>
                {filtered.map(country => {
                  const selected = selectedCountry?.code === country.code
                  return (
                    <button
                      key={country.code}
                      onClick={() => setSelectedCountry(country)}
                      className="w-full rounded-2xl px-4 py-3.5 text-left transition-all active:scale-[0.99]"
                      style={{
                        background: selected ? 'var(--accent)' : 'var(--surface-strong)',
                        border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={`https://flagcdn.com/w40/${country.code.toLowerCase()}.png`}
                          srcSet={`https://flagcdn.com/w80/${country.code.toLowerCase()}.png 2x`}
                          alt={country.name}
                          width={28} height={21}
                          className="rounded-sm shrink-0 object-cover"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-semibold" style={{ color: selected ? 'white' : 'var(--ink)' }}>
                            {country.name}
                          </div>
                          <div className="text-xs" style={{ color: selected ? 'rgba(255,255,255,0.7)' : 'var(--muted)' }}>
                            {country.currency} · {country.currencySymbol}
                          </div>
                        </div>
                        {selected && <CheckCircle2 className="size-5 shrink-0 text-white" />}
                      </div>
                    </button>
                  )
                })}
              </div>

              <div
                className="fixed bottom-0 left-0 right-0 px-5 py-4"
                style={{
                  background: 'rgba(255,255,255,0.95)',
                  backdropFilter: 'blur(20px)',
                  borderTop: '1px solid var(--border)',
                  paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
                }}
              >
                <button
                  onClick={handleFinish}
                  disabled={!selectedCountry}
                  className="w-full max-w-md mx-auto rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
                  style={{ background: 'var(--accent)', display: 'flex' }}
                >
                  Get started
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}
