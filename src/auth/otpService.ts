/**
 * otpService — demo OTP for Peetopee registration.
 *
 * In production you would call a real SMS/email provider (Twilio, AWS SES,
 * Resend, etc.) from a backend. This demo version generates a 6-digit code,
 * stores it in memory with a 10-minute expiry, and logs it to the console so
 * you can see it during testing. The app shows a banner with the code for
 * demo convenience.
 */

interface OtpRecord {
  code: string
  target: string
  expiresAt: number
}

// In-memory store — clears on page reload (intentional for demo)
const store = new Map<string, OtpRecord>()

const OTP_TTL_MS = 10 * 60 * 1000 // 10 minutes

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export interface OtpSendResult {
  success: boolean
  /** demo-only: the actual code so we can show it in a banner */
  demoCode: string
}

/**
 * Send (or resend) a 6-digit OTP to the given target (email or phone).
 * Returns the code in demoCode for the in-app banner. In production,
 * drop demoCode and call a real provider instead.
 */
export function sendOtp(target: string): OtpSendResult {
  const code = generateCode()
  const key = target.toLowerCase().trim()
  store.set(key, { code, target: key, expiresAt: Date.now() + OTP_TTL_MS })
  console.log(`[Peetopee OTP] ${target} → ${code}`)
  return { success: true, demoCode: code }
}

/**
 * Verify a code entered by the user.
 * Returns true if the code matches and hasn't expired.
 * Deletes the record on first successful verify (single-use).
 */
export function verifyOtp(target: string, code: string): boolean {
  const key = target.toLowerCase().trim()
  const record = store.get(key)
  if (!record) return false
  if (Date.now() > record.expiresAt) { store.delete(key); return false }
  if (record.code !== code.trim()) return false
  store.delete(key)
  return true
}

/** How many seconds until the OTP expires (0 if not found or already expired) */
export function otpSecondsLeft(target: string): number {
  const key = target.toLowerCase().trim()
  const record = store.get(key)
  if (!record) return 0
  return Math.max(0, Math.floor((record.expiresAt - Date.now()) / 1000))
}
