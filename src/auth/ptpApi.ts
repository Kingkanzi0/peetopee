/**
 * Peetopee ID API client.
 * Uses /api/* which Vite proxies to the backend server in dev,
 * and the Docker container handles in production.
 */

export interface PtpApiUser {
  email: string
  ptpId: string
  displayName: string
  countryCode: string
  avatarUrl: string
  walletAddresses: Record<number, string>
}

// In dev: Vite proxies /api to localhost:3001
// In production HF static: VITE_API_URL points to Deno Deploy / Render / etc.
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api'

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<Record<string, unknown>>
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`)
  return res.json() as Promise<Record<string, unknown>>
}

/** Register or update a Peetopee profile on the server. */
export async function apiRegister(params: {
  email: string
  ptpId: string
  displayName: string
  countryCode?: string
  avatarUrl?: string
}): Promise<{ ok: boolean; ptpId?: string; error?: string }> {
  try {
    const data = await post('/register', params)
    return data as { ok: boolean; ptpId?: string; error?: string }
  } catch {
    return { ok: false, error: 'Network error — could not reach Peetopee server' }
  }
}

/** Look up a user by @handle or email. */
export async function apiLookup(q: string): Promise<PtpApiUser | null> {
  try {
    const data = await get(`/lookup?q=${encodeURIComponent(q)}`)
    if (!data.found) return null
    return data.user as PtpApiUser
  } catch {
    return null
  }
}

/** Link a wallet address to a user on a specific chain. */
export async function apiLinkWallet(params: {
  email: string
  chainId: number
  address: string
}): Promise<boolean> {
  try {
    const data = await post('/link-wallet', params)
    return !!data.ok
  } catch {
    return false
  }
}
