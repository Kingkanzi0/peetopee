/**
 * Peetopee API client.
 *
 * Talks to server/api.ts. In dev, Vite proxies /api to localhost:3001.
 * In production, VITE_API_URL points at the deployed server (e.g. Render).
 *
 * Sign-in gives us a session token. It's kept in localStorage and sent as a
 * Bearer token on every call that changes your account.
 */

export interface PtpApiUser {
  ptpId: string
  displayName: string
  countryCode: string
  avatarUrl: string
  walletAddresses: Record<number, string>
  idVerified: boolean
}

export type KycStatus = 'none' | 'pending' | 'approved' | 'rejected'

export interface MeResponse {
  contact: string
  profile: PtpApiUser | null
  wallets: { chainId: number; kind: 'wallet' | 'funds'; address: string; verified: boolean }[]
  kyc: { status: KycStatus; reason: string }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api'
const SESSION_KEY = 'ptp_session_token'

// ── session token ───────────────────────────────────────────────────────────

export function getSessionToken(): string | null {
  try { return localStorage.getItem(SESSION_KEY) } catch { return null }
}

export function setSessionToken(token: string | null) {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token)
    else localStorage.removeItem(SESSION_KEY)
  } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event('ptp-session-changed'))
}

// ── transport ───────────────────────────────────────────────────────────────

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, authed = false): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (authed) {
    const token = getSessionToken()
    if (!token) throw new ApiError(401, 'Please sign in again.')
    headers.Authorization = `Bearer ${token}`
  }
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError(0, "Can't reach the Peetopee server. Check your connection and try again.")
  }
  let data: Record<string, unknown>
  try {
    data = await res.json() as Record<string, unknown>
  } catch {
    throw new ApiError(res.status, "The Peetopee server isn't responding correctly. Please try again shortly.")
  }
  if (!res.ok || data.ok === false) {
    if (res.status === 401 && authed) setSessionToken(null)
    throw new ApiError(res.status, String(data.error ?? 'Something went wrong.'))
  }
  return data as T
}

// ── sign-in ─────────────────────────────────────────────────────────────────

/** Ask the server to send a 6-digit code. `demoCode` is only set on test servers. */
export function apiRequestOtp(contact: string) {
  return request<{ expiresIn: number; demoCode?: string }>('POST', '/auth/request-otp', { contact })
}

/** Exchange the code for a session. Stores the token on success. */
export async function apiVerifyOtp(contact: string, code: string) {
  const res = await request<{ token: string; contact: string; profile: PtpApiUser | null }>(
    'POST', '/auth/verify-otp', { contact, code })
  setSessionToken(res.token)
  return res
}

export async function apiLogout() {
  try { await request('POST', '/auth/logout', {}, true) } catch { /* already gone */ }
  setSessionToken(null)
}

// ── profile ─────────────────────────────────────────────────────────────────

export function apiMe() {
  return request<MeResponse>('GET', '/me', undefined, true)
}

/** Create or update your Peetopee profile. Returns the handle the server assigned. */
export async function apiRegister(params: { ptpId?: string; displayName: string; countryCode?: string; avatarUrl?: string }) {
  const res = await request<{ profile: PtpApiUser }>('POST', '/register', params, true)
  return res.profile
}

export async function apiUpdateHandle(ptpId: string) {
  const res = await request<{ ptpId: string }>('POST', '/update-handle', { ptpId }, true)
  return res.ptpId
}

/** Look up a user by @handle or email. Returns null when nobody matches. */
export async function apiLookup(q: string): Promise<PtpApiUser | null> {
  const res = await request<{ found: boolean; user?: PtpApiUser }>('GET', `/lookup?q=${encodeURIComponent(q)}`)
  return res.found && res.user ? res.user : null
}

/** Link a wallet you control. `signature` must be over walletLinkMessage(...). */
export async function apiLinkWallet(params: { chainId: number; kind: 'wallet' | 'funds'; address: string; signature: string }) {
  await request('POST', '/link-wallet', params, true)
}

/** Must match walletLinkMessage() in server/api.ts exactly. */
export function walletLinkMessage(ptpId: string, address: string, kind: string) {
  return `Peetopee wallet link\nAccount: ${ptpId}\nAddress: ${address.toLowerCase()}\nPurpose: ${kind}`
}

// ── ID verification ─────────────────────────────────────────────────────────

export async function apiSubmitKyc(form: {
  fullName: string; idType: string; idNumber: string; countryCode: string; idImage: string; selfie: string
}) {
  const res = await request<{ status: KycStatus }>('POST', '/kyc/submit', form, true)
  return res.status
}

/** Which of these addresses belong to ID-verified Peetopee users. Keys are lowercase. */
export async function apiVerifiedAddresses(addresses: string[]): Promise<Record<string, boolean>> {
  if (addresses.length === 0) return {}
  const res = await request<{ verified: Record<string, boolean> }>(
    'GET', `/kyc/verified?addresses=${addresses.map(a => a.toLowerCase()).join(',')}`)
  return res.verified
}

// ── trade bank details ──────────────────────────────────────────────────────

export async function apiPostTradeDetails(tradeId: bigint, details: string) {
  await request('POST', '/trade-details', { tradeId: tradeId.toString(), details }, true)
}

export async function apiGetTradeDetails(tradeId: bigint): Promise<string | null> {
  const res = await request<{ details: string | null }>('GET', `/trade-details?tradeId=${tradeId.toString()}`, undefined, true)
  return res.details
}

// ── admin (ID review) ───────────────────────────────────────────────────────

export interface KycSubmission {
  id: number
  contact: string
  ptp_id: string | null
  full_name: string
  id_type: string
  id_number: string
  country_code: string
  status: KycStatus
  reason: string
  submitted_at: number
  id_image?: string
  selfie?: string
}

async function adminRequest<T>(method: 'GET' | 'POST', path: string, adminToken: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'X-Admin-Token': adminToken, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json() as Record<string, unknown>
  if (!res.ok || data.ok === false) throw new ApiError(res.status, String(data.error ?? 'Request failed'))
  return data as T
}

export const adminApi = {
  list: (token: string, status: KycStatus) =>
    adminRequest<{ submissions: KycSubmission[] }>('GET', `/admin/kyc?status=${status}`, token).then(r => r.submissions),
  get: (token: string, id: number) =>
    adminRequest<{ submission: KycSubmission }>('GET', `/admin/kyc/${id}`, token).then(r => r.submission),
  review: (token: string, id: number, decision: 'approved' | 'rejected', reason: string) =>
    adminRequest('POST', `/admin/kyc/${id}`, token, { decision, reason }),
}
