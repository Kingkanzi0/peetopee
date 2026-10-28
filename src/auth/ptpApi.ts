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

const CONFIGURED_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api'
const LOCAL_BASE = '/api'
/**
 * Where API calls go. Starts at VITE_API_URL (if set). If that server can't be
 * reached, or is an old server without this route, we fall back to /api — the
 * server running alongside the app (Vite proxy in dev, same origin in Docker) —
 * and stick with it for the rest of the session.
 */
let base = CONFIGURED_BASE
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
  const init: RequestInit = { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }
  const attempt = async (b: string) => {
    const res = await fetch(`${b}${path}`, init)
    let data: Record<string, unknown> | null = null
    try { data = await res.json() as Record<string, unknown> } catch { /* not JSON */ }
    return { res, data }
  }

  let result: { res: Response; data: Record<string, unknown> | null } | null = null
  try {
    result = await attempt(base)
  } catch { /* unreachable — maybe try the local server below */ }

  const looksWrong = !result || (result.res.status === 404 && result.data?.error === 'Not found') || (!result.data && !result.res.ok)
  if (looksWrong && base !== LOCAL_BASE) {
    try {
      const local = await attempt(LOCAL_BASE)
      if (local.data) { base = LOCAL_BASE; result = local }
    } catch { /* keep the original result */ }
  }

  if (!result) throw new ApiError(0, "Can't reach the Peetopee server. Check your connection and try again.")
  const { res, data } = result
  if (!data) throw new ApiError(res.status, "The Peetopee server isn't responding correctly. Please try again shortly.")
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

// ── dispute evidence ────────────────────────────────────────────────────────

export interface Evidence {
  id: number
  role: 'seller' | 'trader'
  text: string
  image?: string
  createdAt: number
}

export async function apiAddEvidence(tradeId: bigint, text: string, image?: string) {
  await request('POST', '/trade-evidence', { tradeId: tradeId.toString(), text, ...(image ? { image } : {}) }, true)
}

export async function apiListEvidence(tradeId: bigint): Promise<Evidence[]> {
  const res = await request<{ evidence: Evidence[] }>('GET', `/trade-evidence?tradeId=${tradeId.toString()}`, undefined, true)
  return res.evidence
}

// ── admin (ID review, disputes) ─────────────────────────────────────────────

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
  const res = await fetch(`${base}${path}`, {
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
  dispute: (token: string, tradeId: bigint) =>
    adminRequest<{
      seller: { ptpId: string; name: string; contact: string } | null
      trader: { ptpId: string; name: string; contact: string } | null
      bankDetails: string | null
      evidence: Evidence[]
    }>('GET', `/admin/dispute?tradeId=${tradeId.toString()}`, token),
}
