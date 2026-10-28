/**
 * otpService — sign-in codes, issued and checked by the Peetopee server.
 *
 * The server emails the code (when RESEND_API_KEY is set). On test servers
 * running with OTP_DEMO=1 it also returns the code so the app can show it in
 * a banner. Verifying a code stores a session token (see ptpApi.ts).
 */
import { apiRequestOtp, apiVerifyOtp, ApiError, type PtpApiUser } from './ptpApi'

export interface OtpSendResult {
  ok: boolean
  error?: string
  /** Seconds until the code expires. */
  expiresIn: number
  /** Only present on test servers (OTP_DEMO=1). */
  demoCode?: string
}

export async function sendOtp(target: string): Promise<OtpSendResult> {
  try {
    const res = await apiRequestOtp(target.trim())
    return { ok: true, expiresIn: res.expiresIn, demoCode: res.demoCode }
  } catch (e) {
    return { ok: false, expiresIn: 0, error: e instanceof ApiError ? e.message : 'Could not send the code.' }
  }
}

export interface OtpVerifyResult {
  ok: boolean
  error?: string
  /** The existing server profile when this contact has signed in before. */
  profile?: PtpApiUser | null
}

export async function verifyOtp(target: string, code: string): Promise<OtpVerifyResult> {
  try {
    const res = await apiVerifyOtp(target.trim(), code.trim())
    return { ok: true, profile: res.profile }
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.message : 'Could not check the code.' }
  }
}
