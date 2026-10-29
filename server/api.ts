/**
 * Peetopee API — the single source of truth for the backend.
 *
 * Both entry points use this file:
 *   - server/index.ts  (local dev, port 3001, proxied by Vite at /api)
 *   - server/prod.ts   (Docker / Render: API + built frontend on one port)
 *
 * What it does:
 *   - Email one-time-code sign-in, issuing a session token
 *   - Peetopee ID profiles (@handle, name, photo, country)
 *   - Wallet linking, proven with a wallet signature
 *   - ID verification (KYC) submissions and admin review
 *   - Bank details for escrow trades, kept off-chain and shown only to
 *     the trade's seller and trader
 *
 * Environment variables:
 *   RESEND_API_KEY      send sign-in codes by email (https://resend.com)
 *   OTP_FROM_EMAIL      sender address, e.g. "Peetopee <login@yourdomain.com>"
 *   OTP_DEMO=1          TESTING ONLY: return the sign-in code in the API response
 *   KYC_AUTO_APPROVE=1  TESTING ONLY: approve ID submissions automatically
 *   ADMIN_TOKEN         secret for the ID review page (admin endpoints are off without it)
 *   DATA_KEY            64 hex chars; encrypts ID images and bank details at rest
 *                       (auto-generated next to the database file when unset)
 *   ARC_RPC_URL         defaults to https://rpc.testnet.arc.io
 *   ESCROW_ADDRESS      defaults to the deployed PeetopeeEscrow
 *   NAIRA_ADDRESS       the PeetopeeNaira (tNGN) contract; the admin page can also set it
 *   PAYOUT_MODE         "simulate" (TESTNET: bank/bill payouts are marked paid at once)
 *                       or "manual" (default: an operator pays and marks them on #admin)
 */
import { Database } from 'bun:sqlite'
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak_256 } from '@noble/hashes/sha3.js'

// ── constants ───────────────────────────────────────────────────────────────

export const ARC_CHAIN_ID = 5042002
const DEFAULT_RPCS = [
  'https://rpc.testnet.arc.io',
  'https://rpc.blockdaemon.testnet.arc.io',
  'https://rpc.drpc.testnet.arc.io',
  'https://rpc.quicknode.testnet.arc.io',
]

/** Read-only and broadcast methods the app needs; everything else is refused by the /rpc relay. */
const RELAY_METHODS = new Set([
  'eth_chainId', 'net_version', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getBlockByHash',
  'eth_call', 'eth_estimateGas', 'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory',
  'eth_getBalance', 'eth_getCode', 'eth_getTransactionCount', 'eth_getTransactionByHash',
  'eth_getTransactionReceipt', 'eth_sendRawTransaction', 'eth_getLogs',
])
const RELAY_MAX_BATCH = 20
const EXPLORER_API = 'https://explorer.testnet.arc.io/api/v2'
/** Tokens the wallet shows prices and logos for (CoinGecko ids). */
export const PRICE_IDS = ['usd-coin', 'ethereum', 'bitcoin', 'solana', 'arbitrum', 'polygon-ecosystem-token', 'matic-network'] as const
const PRICES_TTL_MS = 60_000
const DEFAULT_ESCROW = '0x59417b13a4d545ff514642a1db1693f35652daea'

const OTP_TTL_MS = 10 * 60_000
const OTP_RESEND_MS = 30_000
const OTP_MAX_ATTEMPTS = 5
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000
const MAX_AVATAR_CHARS = 400_000        // ~300 KB image as a data URL
const MAX_ID_IMAGE_CHARS = 4_000_000    // ~3 MB image as a data URL
const MAX_BANK_DETAILS_CHARS = 1_000
const PAYOUT_KINDS = ['bank', 'airtime', 'data', 'electricity', 'tv'] as const
type PayoutKind = typeof PAYOUT_KINDS[number]
const HANDLE_RE = /^@[a-z0-9_]{3,20}$/
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const WALLET_KINDS = ['wallet', 'funds'] as const
type WalletKind = typeof WALLET_KINDS[number]

// ── small helpers ───────────────────────────────────────────────────────────

const enc = new TextEncoder()
const dec = new TextDecoder()

function sha256Hex(s: string) {
  return createHash('sha256').update(s).digest('hex')
}

function toHex(b: Uint8Array) {
  return Buffer.from(b).toString('hex')
}

function hexToBytes(h: string) {
  return new Uint8Array(Buffer.from(h.replace(/^0x/, ''), 'hex'))
}

export function keccakHex(data: string | Uint8Array) {
  return '0x' + toHex(keccak_256(typeof data === 'string' ? enc.encode(data) : data))
}

/** Email → lowercase; phone → digits with optional leading +. */
export function normalizeContact(raw: string): string {
  const v = String(raw ?? '').trim()
  if (v.includes('@')) return v.toLowerCase()
  const digits = v.replace(/[\s\-().]/g, '')
  return /^\+?[0-9]{7,15}$/.test(digits) ? digits : ''
}

function isEmail(contact: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)
}

export function normalizeHandle(raw: string): string {
  const v = String(raw ?? '').trim().toLowerCase()
  return v.startsWith('@') ? v : `@${v}`
}

/** The exact text a wallet signs to prove it belongs to a Peetopee account. */
export function walletLinkMessage(ptpId: string, address: string, kind: string) {
  return `Peetopee wallet link\nAccount: ${ptpId}\nAddress: ${address.toLowerCase()}\nPurpose: ${kind}`
}

/** Recover the signer address of an Ethereum personal_sign (EIP-191) signature. */
export function recoverPersonalSign(message: string, signature: string): string | null {
  try {
    const sig = hexToBytes(signature)
    if (sig.length !== 65) return null
    let v = sig[64]
    if (v >= 27) v -= 27
    if (v !== 0 && v !== 1) return null
    const msg = enc.encode(message)
    const digest = keccak_256(new Uint8Array([...enc.encode(`\x19Ethereum Signed Message:\n${msg.length}`), ...msg]))
    const recovered = new Uint8Array(65)
    recovered[0] = v
    recovered.set(sig.subarray(0, 64), 1)
    const pub = secp256k1.recoverPublicKey(recovered, digest, { prehash: false })
    const uncompressed = secp256k1.Point.fromBytes(pub).toBytes(false)
    const addr = keccak_256(uncompressed.subarray(1)).subarray(12)
    return '0x' + toHex(addr)
  } catch {
    return null
  }
}

// ── encryption at rest ──────────────────────────────────────────────────────

function loadDataKey(dbPath: string | undefined): Buffer {
  const fromEnv = process.env.DATA_KEY
  if (fromEnv && /^[0-9a-fA-F]{64}$/.test(fromEnv)) return Buffer.from(fromEnv, 'hex')
  if (!dbPath || dbPath === ':memory:') return randomBytes(32)
  const keyFile = join(dirname(dbPath), 'data.key')
  if (existsSync(keyFile)) return Buffer.from(readFileSync(keyFile, 'utf8').trim(), 'hex')
  const key = randomBytes(32)
  writeFileSync(keyFile, key.toString('hex'), { mode: 0o600 })
  return key
}

function encrypt(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([c.update(plaintext, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), body].map(b => b.toString('base64')).join('.')
}

function decrypt(key: Buffer, blob: string): string {
  const [iv, tag, body] = blob.split('.').map(s => Buffer.from(s, 'base64'))
  const d = createDecipheriv('aes-256-gcm', key, iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(body), d.final()]).toString('utf8')
}

// ── chain reads (no web3 library needed) ────────────────────────────────────

export type RpcFn = (method: string, params: unknown[]) => Promise<unknown>

export interface OnchainTrade {
  tradeId: bigint
  seller: string
  trader: string
  bankDetails: string
  status: number
}

const GET_TRADE_SELECTOR = keccakHex('getTrade(uint256)').slice(0, 10)

/** Decode PeetopeeEscrow.getTrade(uint256) → Trade (a tuple containing one string). */
export function decodeGetTrade(hex: string): OnchainTrade | null {
  const h = hex.replace(/^0x/, '')
  if (h.length < 64 * 14) return null
  const word = (i: number) => h.slice(i * 64, i * 64 + 64)
  const num = (i: number) => BigInt('0x' + word(i))
  const base = Number(num(0)) / 32 // offset of the tuple
  const tradeId = num(base)
  const seller = '0x' + word(base + 1).slice(24)
  const trader = '0x' + word(base + 2).slice(24)
  const strOffset = Number(num(base + 5)) / 32
  const status = Number(num(base + 6))
  const lenIdx = base + strOffset
  const len = Number(num(lenIdx))
  const strHex = h.slice((lenIdx + 1) * 64, (lenIdx + 1) * 64 + len * 2)
  return { tradeId, seller, trader, status, bankDetails: dec.decode(hexToBytes(strHex)) }
}

export interface OnchainPayout {
  from: string
  amount: bigint
  kind: number
  ref: string
  status: number   // 1 requested, 2 refunded
}

const GET_PAYOUT_SELECTOR = keccakHex('getPayout(uint256)').slice(0, 10)

/** Decode PeetopeeNaira.getPayout(uint256) → (address, uint256, uint8, bytes32, uint8, uint64). */
export function decodeGetPayout(hex: string): OnchainPayout | null {
  const h = hex.replace(/^0x/, '')
  if (h.length < 64 * 6) return null
  const word = (i: number) => h.slice(i * 64, i * 64 + 64)
  return {
    from: '0x' + word(0).slice(24),
    amount: BigInt('0x' + word(1)),
    kind: Number(BigInt('0x' + word(2))),
    ref: '0x' + word(3),
    status: Number(BigInt('0x' + word(4))),
  }
}

/** A JSON-RPC error returned by the node (e.g. a contract revert). Passed through as-is. */
export class RpcError extends Error {
  constructor(public code: number, message: string, public data?: unknown) { super(message) }
}

/** Calls the first endpoint that answers; moves to the next on network errors or timeouts. */
export function httpRpc(urls: string[]): RpcFn {
  return async (method, params) => {
    let lastErr: unknown
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          signal: AbortSignal.timeout(10_000),
        })
        if (res.status >= 500 || res.status === 429) throw new Error(`RPC ${res.status}`)
        const body = await res.json() as { result?: unknown; error?: { code?: number; message: string; data?: unknown } }
        if (body.error) throw new RpcError(body.error.code ?? -32000, body.error.message, body.error.data)
        return body.result
      } catch (e) {
        if (e instanceof RpcError) throw e
        lastErr = e
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('All Arc RPC endpoints failed')
  }
}

// ── email delivery ──────────────────────────────────────────────────────────

export type SendCodeFn = (contact: string, code: string) => Promise<void>

function resendSender(apiKey: string, from: string): SendCodeFn {
  return async (to, code) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: `${code} is your Peetopee code`,
        text: `Your Peetopee sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't ask for this, you can ignore this email.`,
      }),
    })
    if (!res.ok) throw new Error(`Email provider returned ${res.status}`)
  }
}

// ── API factory ─────────────────────────────────────────────────────────────

export interface ApiOptions {
  db: Database
  dbPath?: string
  rpc?: RpcFn
  sendCode?: SendCodeFn | null
  otpDemo?: boolean
  kycAutoApprove?: boolean
  adminToken?: string
  escrowAddress?: string
  /** PeetopeeNaira contract (naira account token). Overridden by the admin page setting. */
  nairaAddress?: string
  /** simulate = testnet, payouts are marked paid immediately; manual = operator marks them. */
  payoutMode?: 'simulate' | 'manual'
  now?: () => number
  /** For tests: replaces the call to the Arc explorer. */
  fetchExplorer?: (url: string) => Promise<unknown>
  /** For tests: replaces the call to CoinGecko. */
  fetchPrices?: (url: string) => Promise<unknown>
}

type Json = Record<string, unknown>

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

export function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export function optionsFromEnv(db: Database, dbPath?: string): ApiOptions {
  const env = process.env
  return {
    db,
    dbPath,
    rpc: httpRpc(env.ARC_RPC_URL ? [env.ARC_RPC_URL, ...DEFAULT_RPCS] : DEFAULT_RPCS),
    sendCode: env.RESEND_API_KEY
      ? resendSender(env.RESEND_API_KEY, env.OTP_FROM_EMAIL || 'Peetopee <onboarding@resend.dev>')
      : null,
    otpDemo: env.OTP_DEMO === '1',
    kycAutoApprove: env.KYC_AUTO_APPROVE === '1',
    adminToken: env.ADMIN_TOKEN || undefined,
    escrowAddress: env.ESCROW_ADDRESS || DEFAULT_ESCROW,
    nairaAddress: env.NAIRA_ADDRESS || undefined,
    payoutMode: env.PAYOUT_MODE === 'simulate' ? 'simulate' : 'manual',
  }
}

export function migrate(db: Database) {
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;')

  // The old dev server (server/index.ts) used a different "users" layout.
  const cols = db.query<{ name: string }, []>("SELECT name FROM pragma_table_info('users')").all().map(c => c.name)
  if (cols.includes('ptpId')) db.exec('ALTER TABLE users RENAME TO users_legacy_dev')

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      email        TEXT PRIMARY KEY,           -- the sign-in contact (email or phone)
      ptp_id       TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      country_code TEXT NOT NULL DEFAULT '',
      avatar_url   TEXT NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS linked_wallets (
      email     TEXT NOT NULL,
      chain_id  INTEGER NOT NULL,
      kind      TEXT NOT NULL DEFAULT 'wallet',
      address   TEXT NOT NULL,
      verified  INTEGER NOT NULL DEFAULT 0,
      linked_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (email, chain_id, kind)
    );
    CREATE INDEX IF NOT EXISTS linked_wallets_address ON linked_wallets(address);
    CREATE TABLE IF NOT EXISTS otps (
      contact    TEXT PRIMARY KEY,
      code_hash  TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      sent_at    INTEGER NOT NULL,
      attempts   INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      contact    TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kyc (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      contact      TEXT UNIQUE NOT NULL,
      full_name    TEXT NOT NULL,
      id_type      TEXT NOT NULL,
      id_number    TEXT NOT NULL,
      country_code TEXT NOT NULL,
      id_image     TEXT NOT NULL,              -- encrypted
      selfie       TEXT NOT NULL,              -- encrypted
      status       TEXT NOT NULL,              -- pending | approved | rejected
      reason       TEXT NOT NULL DEFAULT '',
      submitted_at INTEGER NOT NULL,
      reviewed_at  INTEGER
    );
    CREATE TABLE IF NOT EXISTS trade_details (
      trade_id     TEXT PRIMARY KEY,
      details_hash TEXT NOT NULL,
      details      TEXT NOT NULL,              -- encrypted
      created_at   INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trade_evidence (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id   TEXT NOT NULL,
      role       TEXT NOT NULL,                -- seller | trader
      author     TEXT NOT NULL,                -- contact of the person who added it
      body       TEXT NOT NULL,                -- encrypted JSON { text, image }
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS trade_evidence_trade ON trade_evidence(trade_id);
    CREATE TABLE IF NOT EXISTS trade_chat (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id   TEXT NOT NULL,
      role       TEXT NOT NULL,                -- seller | trader
      author     TEXT NOT NULL,                -- contact of the sender
      body       TEXT NOT NULL,                -- encrypted message text
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS trade_chat_trade ON trade_chat(trade_id, id);
    CREATE TABLE IF NOT EXISTS payouts (
      payout_id    TEXT NOT NULL,              -- id in the naira contract
      contract     TEXT NOT NULL,              -- naira contract address
      contact      TEXT NOT NULL,              -- who asked for it
      from_address TEXT NOT NULL,
      kind         TEXT NOT NULL,              -- bank | airtime | data | electricity | tv
      amount       TEXT NOT NULL,              -- naira, 6 decimals, as an integer string
      details      TEXT NOT NULL,              -- encrypted JSON (account number, phone, meter…)
      status       TEXT NOT NULL,              -- processing | paid | failed
      reference    TEXT NOT NULL DEFAULT '',   -- partner reference, or SIM-… when simulated
      token        TEXT NOT NULL DEFAULT '',   -- electricity token, if any
      reason       TEXT NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      PRIMARY KEY (contract, payout_id)
    );
    CREATE INDEX IF NOT EXISTS payouts_contact ON payouts(contact);
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // Carry over wallets from the old unauthenticated table as UNVERIFIED.
  // They stop showing in lookups until the owner's app re-links them with a signature.
  const hasOld = db.query<{ n: number }, []>("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='wallets'").get()
  if (hasOld && hasOld.n > 0) {
    db.exec(`INSERT OR IGNORE INTO linked_wallets (email, chain_id, kind, address, verified)
             SELECT lower(email), chain_id, 'wallet', lower(address), 0 FROM wallets;
             ALTER TABLE wallets RENAME TO wallets_legacy;`)
  }
}

export function createApi(opts: ApiOptions) {
  const db = opts.db
  const now = opts.now ?? (() => Date.now())
  const dataKey = loadDataKey(opts.dbPath)
  const escrow = (opts.escrowAddress ?? DEFAULT_ESCROW).toLowerCase()
  const ipHits = new Map<string, number[]>()

  migrate(db)

  // ── auth ──────────────────────────────────────────────────────────────────

  function sessionContact(req: Request): string {
    const auth = req.headers.get('authorization') ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (!token) throw new HttpError(401, 'Please sign in again.')
    const row = db.query<{ contact: string; expires_at: number }, string>(
      'SELECT contact, expires_at FROM sessions WHERE token_hash = ?').get(sha256Hex(token))
    if (!row || row.expires_at < now()) throw new HttpError(401, 'Your session has expired. Please sign in again.')
    return row.contact
  }

  function requireAdmin(req: Request) {
    if (!opts.adminToken) throw new HttpError(404, 'Admin is not enabled on this server.')
    const given = Buffer.from(req.headers.get('x-admin-token') ?? '')
    const want = Buffer.from(opts.adminToken)
    if (given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(403, 'Wrong admin token.')
  }

  function rateLimitIp(ip: string, max: number, windowMs: number) {
    const t = now()
    const hits = (ipHits.get(ip) ?? []).filter(x => t - x < windowMs)
    if (hits.length >= max) throw new HttpError(429, 'Too many requests. Please wait a few minutes.')
    hits.push(t)
    ipHits.set(ip, hits)
  }

  // ── data access ───────────────────────────────────────────────────────────

  type UserRow = { email: string; ptp_id: string; display_name: string; country_code: string; avatar_url: string }

  function userByContact(contact: string) {
    return db.query<UserRow, string>('SELECT * FROM users WHERE email = ?').get(contact)
  }

  function userByHandle(handle: string) {
    return db.query<UserRow, string>('SELECT * FROM users WHERE ptp_id = ?').get(handle)
  }

  function walletsOf(contact: string, onlyVerified: boolean) {
    return db.query<{ chain_id: number; kind: string; address: string; verified: number }, string>(
      `SELECT chain_id, kind, address, verified FROM linked_wallets WHERE email = ?${onlyVerified ? ' AND verified = 1' : ''}`,
    ).all(contact)
  }

  function verifiedAddressesOf(contact: string): Set<string> {
    return new Set(walletsOf(contact, true).map(w => w.address.toLowerCase()))
  }

  function kycStatus(contact: string) {
    return db.query<{ status: string; reason: string }, string>('SELECT status, reason FROM kyc WHERE contact = ?').get(contact)
  }

  function publicUser(u: UserRow) {
    const walletAddresses: Record<number, string> = {}
    for (const w of walletsOf(u.email, true)) if (w.kind === 'wallet') walletAddresses[w.chain_id] = w.address
    return {
      ptpId: u.ptp_id,
      displayName: u.display_name,
      countryCode: u.country_code,
      avatarUrl: u.avatar_url,
      walletAddresses,
      idVerified: kycStatus(u.email)?.status === 'approved',
    }
  }

  async function readTrade(tradeId: bigint): Promise<OnchainTrade | null> {
    if (!opts.rpc) throw new HttpError(503, 'Chain access is not configured.')
    const data = GET_TRADE_SELECTOR + tradeId.toString(16).padStart(64, '0')
    const result = await opts.rpc('eth_call', [{ to: escrow, data }, 'latest']) as string
    const trade = decodeGetTrade(result)
    if (!trade || trade.tradeId === 0n) return null
    return trade
  }

  // ── handlers ──────────────────────────────────────────────────────────────

  async function requestOtp(body: Json, ip: string) {
    const contact = normalizeContact(String(body.contact ?? ''))
    if (!contact) throw new HttpError(400, 'Enter a valid email address or phone number.')
    rateLimitIp(ip, 10, 10 * 60_000)
    const existing = db.query<{ sent_at: number }, string>('SELECT sent_at FROM otps WHERE contact = ?').get(contact)
    if (existing && now() - existing.sent_at < OTP_RESEND_MS) {
      throw new HttpError(429, 'Please wait 30 seconds before asking for a new code.')
    }
    const canDeliver = !!opts.sendCode && isEmail(contact)
    if (!canDeliver && !opts.otpDemo) {
      throw new HttpError(503, isEmail(contact)
        ? 'Email sign-in is not set up on the server yet.'
        : 'Phone sign-in is not available yet. Please use your email address.')
    }
    const code = String(randomInt(100000, 1000000))
    db.query(`INSERT INTO otps (contact, code_hash, expires_at, sent_at, attempts) VALUES (?,?,?,?,0)
              ON CONFLICT(contact) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, sent_at=excluded.sent_at, attempts=0`)
      .run(contact, sha256Hex(`${contact}:${code}`), now() + OTP_TTL_MS, now())
    if (canDeliver) await opts.sendCode!(contact, code)
    return { ok: true, expiresIn: OTP_TTL_MS / 1000, ...(opts.otpDemo ? { demoCode: code } : {}) }
  }

  function verifyOtp(body: Json) {
    const contact = normalizeContact(String(body.contact ?? ''))
    const code = String(body.code ?? '').trim()
    const row = db.query<{ code_hash: string; expires_at: number; attempts: number }, string>(
      'SELECT code_hash, expires_at, attempts FROM otps WHERE contact = ?').get(contact)
    if (!row || row.expires_at < now()) throw new HttpError(400, 'That code has expired. Ask for a new one.')
    if (row.attempts >= OTP_MAX_ATTEMPTS) throw new HttpError(429, 'Too many wrong codes. Ask for a new one.')
    if (row.code_hash !== sha256Hex(`${contact}:${code}`)) {
      db.query('UPDATE otps SET attempts = attempts + 1 WHERE contact = ?').run(contact)
      throw new HttpError(400, 'Incorrect code. Please try again.')
    }
    db.query('DELETE FROM otps WHERE contact = ?').run(contact)
    const token = randomBytes(32).toString('hex')
    db.query('INSERT INTO sessions (token_hash, contact, expires_at) VALUES (?,?,?)').run(sha256Hex(token), contact, now() + SESSION_TTL_MS)
    const user = userByContact(contact)
    return { ok: true, token, contact, profile: user ? publicUser(user) : null }
  }

  function logout(req: Request) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth.startsWith('Bearer ')) db.query('DELETE FROM sessions WHERE token_hash = ?').run(sha256Hex(auth.slice(7).trim()))
    return { ok: true }
  }

  function register(contact: string, body: Json) {
    const displayName = String(body.displayName ?? '').trim().slice(0, 60)
    const countryCode = String(body.countryCode ?? '').trim().toUpperCase().slice(0, 2)
    const avatarUrl = String(body.avatarUrl ?? '')
    if (!displayName) throw new HttpError(400, 'Your name is required.')
    if (avatarUrl.length > MAX_AVATAR_CHARS) throw new HttpError(413, 'Profile photo is too large.')
    if (avatarUrl && !avatarUrl.startsWith('data:image/') && !avatarUrl.startsWith('https://')) {
      throw new HttpError(400, 'Profile photo must be an image.')
    }

    const existing = userByContact(contact)
    if (existing) {
      db.query(`UPDATE users SET display_name=?, country_code=?, avatar_url=CASE WHEN ?!='' THEN ? ELSE avatar_url END WHERE email=?`)
        .run(displayName, countryCode, avatarUrl, avatarUrl, contact)
      return { ok: true, profile: publicUser(userByContact(contact)!) }
    }

    // New account: try the requested handle, then numbered variants.
    let wanted = normalizeHandle(String(body.ptpId ?? ''))
    if (!HANDLE_RE.test(wanted)) wanted = normalizeHandle(displayName.replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'user')
    if (!HANDLE_RE.test(wanted)) wanted = '@user'
    let handle = wanted
    for (let i = 0; userByHandle(handle); i++) {
      handle = `${wanted.slice(0, 16)}${randomInt(10, i < 5 ? 100 : 10000)}`
    }
    db.query('INSERT INTO users (email, ptp_id, display_name, country_code, avatar_url) VALUES (?,?,?,?,?)')
      .run(contact, handle, displayName, countryCode, avatarUrl)
    return { ok: true, profile: publicUser(userByContact(contact)!) }
  }

  function updateHandle(contact: string, body: Json) {
    const handle = normalizeHandle(String(body.ptpId ?? ''))
    if (!HANDLE_RE.test(handle)) {
      throw new HttpError(400, 'Use 3–20 letters, numbers or underscores.')
    }
    const me = userByContact(contact)
    if (!me) throw new HttpError(404, 'Create your profile first.')
    if (me.ptp_id === handle) return { ok: true, ptpId: handle }
    if (userByHandle(handle)) throw new HttpError(409, `${handle} is already taken.`)
    db.query('UPDATE users SET ptp_id = ? WHERE email = ?').run(handle, contact)
    return { ok: true, ptpId: handle }
  }

  function linkWallet(contact: string, body: Json) {
    const me = userByContact(contact)
    if (!me) throw new HttpError(404, 'Create your profile first.')
    const address = String(body.address ?? '').toLowerCase()
    const chainId = Number(body.chainId ?? ARC_CHAIN_ID)
    const kind = String(body.kind ?? 'wallet') as WalletKind
    const signature = String(body.signature ?? '')
    if (!ADDRESS_RE.test(address)) throw new HttpError(400, 'Invalid wallet address.')
    if (!Number.isInteger(chainId) || chainId <= 0) throw new HttpError(400, 'Invalid chain.')
    if (!WALLET_KINDS.includes(kind)) throw new HttpError(400, 'Invalid wallet type.')
    const signer = recoverPersonalSign(walletLinkMessage(me.ptp_id, address, kind), signature)
    if (signer !== address) throw new HttpError(400, 'Wallet signature check failed.')
    const owner = db.query<{ email: string }, [string, string]>(
      'SELECT email FROM linked_wallets WHERE address = ? AND verified = 1 AND email != ? LIMIT 1',
    ).get(address, contact)
    if (owner) throw new HttpError(409, 'This wallet is already linked to another Peetopee account.')
    db.query(`INSERT INTO linked_wallets (email, chain_id, kind, address, verified, linked_at) VALUES (?,?,?,?,1,unixepoch())
              ON CONFLICT(email, chain_id, kind) DO UPDATE SET address=excluded.address, verified=1, linked_at=excluded.linked_at`)
      .run(contact, chainId, kind, address)
    return { ok: true }
  }

  function me(contact: string) {
    const u = userByContact(contact)
    const k = kycStatus(contact)
    return {
      ok: true,
      contact,
      profile: u ? publicUser(u) : null,
      wallets: walletsOf(contact, false).map(w => ({ chainId: w.chain_id, kind: w.kind, address: w.address, verified: !!w.verified })),
      kyc: k ? { status: k.status, reason: k.reason } : { status: 'none', reason: '' },
    }
  }

  function lookup(q: string) {
    const term = q.trim()
    if (!term) throw new HttpError(400, 'Enter a Peetopee ID.')
    const u = term.includes('@') && !term.startsWith('@')
      ? userByContact(normalizeContact(term))
      : userByHandle(normalizeHandle(term))
    return u ? { found: true, user: publicUser(u) } : { found: false }
  }

  function submitKyc(contact: string, body: Json) {
    const fullName = String(body.fullName ?? '').trim().slice(0, 100)
    const idType = String(body.idType ?? '').trim().slice(0, 40)
    const idNumber = String(body.idNumber ?? '').trim().slice(0, 40)
    const countryCode = String(body.countryCode ?? '').trim().toUpperCase().slice(0, 2)
    const idImage = String(body.idImage ?? '')
    const selfie = String(body.selfie ?? '')
    if (!fullName || !idType || !idNumber || !countryCode) throw new HttpError(400, 'Please fill in every field.')
    for (const [label, img] of [['ID photo', idImage], ['Selfie', selfie]] as const) {
      if (!img.startsWith('data:image/')) throw new HttpError(400, `${label} must be a photo.`)
      if (img.length > MAX_ID_IMAGE_CHARS) throw new HttpError(413, `${label} is too large. Please use a smaller photo.`)
    }
    const current = kycStatus(contact)
    if (current?.status === 'approved') throw new HttpError(409, 'Your ID is already verified.')
    const status = opts.kycAutoApprove ? 'approved' : 'pending'
    db.query(`INSERT INTO kyc (contact, full_name, id_type, id_number, country_code, id_image, selfie, status, reason, submitted_at, reviewed_at)
              VALUES (?,?,?,?,?,?,?,?,'',?,?)
              ON CONFLICT(contact) DO UPDATE SET full_name=excluded.full_name, id_type=excluded.id_type, id_number=excluded.id_number,
                country_code=excluded.country_code, id_image=excluded.id_image, selfie=excluded.selfie, status=excluded.status,
                reason='', submitted_at=excluded.submitted_at, reviewed_at=excluded.reviewed_at`)
      .run(contact, fullName, idType, idNumber, countryCode, encrypt(dataKey, idImage), encrypt(dataKey, selfie),
        status, now(), opts.kycAutoApprove ? now() : null)
    return { ok: true, status }
  }

  function verifiedAddresses(list: string) {
    const addrs = list.split(',').map(a => a.trim().toLowerCase()).filter(a => ADDRESS_RE.test(a)).slice(0, 100)
    const verified: Record<string, boolean> = {}
    for (const a of addrs) {
      const row = db.query<{ status: string }, string>(
        `SELECT k.status FROM linked_wallets w JOIN kyc k ON k.contact = w.email
         WHERE w.address = ? AND w.verified = 1 LIMIT 1`).get(a)
      verified[a] = row?.status === 'approved'
    }
    return { ok: true, verified }
  }

  async function postTradeDetails(contact: string, body: Json) {
    const details = String(body.details ?? '').trim()
    if (!details) throw new HttpError(400, 'Bank details are required.')
    if (details.length > MAX_BANK_DETAILS_CHARS) throw new HttpError(413, 'Bank details are too long.')
    let tradeId: bigint
    try { tradeId = BigInt(String(body.tradeId)) } catch { throw new HttpError(400, 'Invalid trade.') }
    const trade = await readTrade(tradeId)
    if (!trade) throw new HttpError(404, 'Trade not found on-chain yet.')
    if (!verifiedAddressesOf(contact).has(trade.seller.toLowerCase())) {
      throw new HttpError(403, 'Only the seller can add bank details to this trade.')
    }
    const hash = keccakHex(details)
    if (trade.bankDetails.toLowerCase() !== hash) {
      throw new HttpError(400, "These bank details don't match the ones locked in the trade.")
    }
    const existing = db.query<{ details_hash: string }, string>('SELECT details_hash FROM trade_details WHERE trade_id = ?').get(tradeId.toString())
    if (existing) return { ok: true }
    db.query('INSERT INTO trade_details (trade_id, details_hash, details, created_at) VALUES (?,?,?,?)')
      .run(tradeId.toString(), hash, encrypt(dataKey, details), now())
    return { ok: true }
  }

  async function getTradeDetails(contact: string, tradeIdRaw: string) {
    let tradeId: bigint
    try { tradeId = BigInt(tradeIdRaw) } catch { throw new HttpError(400, 'Invalid trade.') }
    const trade = await readTrade(tradeId)
    if (!trade) throw new HttpError(404, 'Trade not found.')
    const mine = verifiedAddressesOf(contact)
    if (!mine.has(trade.trader.toLowerCase()) && !mine.has(trade.seller.toLowerCase())) {
      throw new HttpError(403, 'Only the seller and trader can see these bank details.')
    }
    const row = db.query<{ details: string }, string>('SELECT details FROM trade_details WHERE trade_id = ?').get(tradeId.toString())
    if (!row) return { ok: true, details: null }
    return { ok: true, details: decrypt(dataKey, row.details) }
  }

  // ── dispute evidence ──────────────────────────────────────────────────────

  const MAX_EVIDENCE_TEXT = 1_000
  const MAX_EVIDENCE_PER_TRADE = 20

  /** Which side of the trade this account is on, or null. */
  function roleIn(contact: string, trade: OnchainTrade): 'seller' | 'trader' | null {
    const mine = verifiedAddressesOf(contact)
    if (mine.has(trade.seller.toLowerCase())) return 'seller'
    if (mine.has(trade.trader.toLowerCase())) return 'trader'
    return null
  }

  function evidenceFor(tradeId: bigint) {
    return db.query<{ id: number; role: string; body: string; created_at: number }, string>(
      'SELECT id, role, body, created_at FROM trade_evidence WHERE trade_id = ? ORDER BY created_at ASC').all(tradeId.toString())
      .map(r => ({ id: r.id, role: r.role, createdAt: r.created_at, ...(JSON.parse(decrypt(dataKey, r.body)) as { text: string; image?: string }) }))
  }

  async function addEvidence(contact: string, body: Json) {
    let tradeId: bigint
    try { tradeId = BigInt(String(body.tradeId)) } catch { throw new HttpError(400, 'Invalid trade.') }
    const text = String(body.text ?? '').trim().slice(0, MAX_EVIDENCE_TEXT)
    const image = body.image ? String(body.image) : ''
    if (!text && !image) throw new HttpError(400, 'Add a message or a photo.')
    if (image && (!image.startsWith('data:image/') || image.length > MAX_ID_IMAGE_CHARS)) {
      throw new HttpError(400, 'The photo must be an image under 3 MB.')
    }
    const trade = await readTrade(tradeId)
    if (!trade) throw new HttpError(404, 'Trade not found.')
    const role = roleIn(contact, trade)
    if (!role) throw new HttpError(403, 'Only the seller and trader can add evidence.')
    const count = db.query<{ n: number }, string>('SELECT count(*) AS n FROM trade_evidence WHERE trade_id = ?').get(tradeId.toString())
    if ((count?.n ?? 0) >= MAX_EVIDENCE_PER_TRADE) throw new HttpError(429, 'This trade already has the maximum amount of evidence.')
    db.query('INSERT INTO trade_evidence (trade_id, role, author, body, created_at) VALUES (?,?,?,?,?)')
      .run(tradeId.toString(), role, contact, encrypt(dataKey, JSON.stringify({ text, ...(image ? { image } : {}) })), now())
    return { ok: true }
  }

  async function listEvidence(contact: string, tradeIdRaw: string) {
    let tradeId: bigint
    try { tradeId = BigInt(tradeIdRaw) } catch { throw new HttpError(400, 'Invalid trade.') }
    const trade = await readTrade(tradeId)
    if (!trade) throw new HttpError(404, 'Trade not found.')
    if (!roleIn(contact, trade)) throw new HttpError(403, 'Only the seller and trader can see this evidence.')
    return { ok: true, evidence: evidenceFor(tradeId) }
  }

  // ── trade chat (seller ⇄ trader) ──────────────────────────────────────────

  const MAX_CHAT_TEXT = 1_000
  const MAX_CHAT_PER_TRADE = 500
  /** Seller and trader never change once a trade exists, so cache them (fewer chain reads while polling). */
  const tradeParties = new Map<string, OnchainTrade>()

  async function tradeFor(tradeIdRaw: unknown): Promise<{ tradeId: bigint; trade: OnchainTrade }> {
    let tradeId: bigint
    try { tradeId = BigInt(String(tradeIdRaw)) } catch { throw new HttpError(400, 'Invalid trade.') }
    const key = tradeId.toString()
    let trade = tradeParties.get(key)
    if (!trade) {
      const fresh = await readTrade(tradeId)
      if (!fresh) throw new HttpError(404, 'Trade not found.')
      trade = fresh
      tradeParties.set(key, trade)
      if (tradeParties.size > 5_000) tradeParties.delete(tradeParties.keys().next().value!)
    }
    return { tradeId, trade }
  }

  function chatSince(tradeId: bigint, afterId: number) {
    return db.query<{ id: number; role: string; body: string; created_at: number }, [string, number]>(
      'SELECT id, role, body, created_at FROM trade_chat WHERE trade_id = ? AND id > ? ORDER BY id ASC LIMIT 200')
      .all(tradeId.toString(), afterId)
      .map(r => ({ id: r.id, role: r.role, text: decrypt(dataKey, r.body), createdAt: r.created_at }))
  }

  async function postChat(contact: string, body: Json, ip: string) {
    const text = String(body.text ?? '').trim().slice(0, MAX_CHAT_TEXT)
    if (!text) throw new HttpError(400, 'Type a message.')
    rateLimitIp(`chat:${contact}:${ip}`, 30, 60_000)
    const { tradeId, trade } = await tradeFor(body.tradeId)
    const role = roleIn(contact, trade)
    if (!role) throw new HttpError(403, 'Only the seller and trader can chat on this trade.')
    const count = db.query<{ n: number }, string>('SELECT count(*) AS n FROM trade_chat WHERE trade_id = ?').get(tradeId.toString())
    if ((count?.n ?? 0) >= MAX_CHAT_PER_TRADE) throw new HttpError(429, 'This chat is full.')
    const res = db.query('INSERT INTO trade_chat (trade_id, role, author, body, created_at) VALUES (?,?,?,?,?)')
      .run(tradeId.toString(), role, contact, encrypt(dataKey, text), now())
    return { ok: true, message: { id: Number(res.lastInsertRowid), role, text, createdAt: now() } }
  }

  async function listChat(contact: string, tradeIdRaw: string, afterRaw: string) {
    const { tradeId, trade } = await tradeFor(tradeIdRaw)
    const role = roleIn(contact, trade)
    if (!role) throw new HttpError(403, 'Only the seller and trader can read this chat.')
    const after = Math.max(0, parseInt(afterRaw || '0', 10) || 0)
    return { ok: true, myRole: role, messages: chatSince(tradeId, after) }
  }

  /** Everything the admin needs to decide a dispute. */
  async function adminDispute(tradeIdRaw: string) {
    let tradeId: bigint
    try { tradeId = BigInt(tradeIdRaw) } catch { throw new HttpError(400, 'Invalid trade.') }
    const trade = await readTrade(tradeId)
    if (!trade) throw new HttpError(404, 'Trade not found.')
    const details = db.query<{ details: string }, string>('SELECT details FROM trade_details WHERE trade_id = ?').get(tradeId.toString())
    const who = (address: string) => {
      const row = db.query<{ ptp_id: string; display_name: string; email: string }, string>(
        `SELECT u.ptp_id, u.display_name, u.email FROM linked_wallets w JOIN users u ON u.email = w.email
         WHERE w.address = ? AND w.verified = 1 LIMIT 1`).get(address.toLowerCase())
      return row ? { ptpId: row.ptp_id, name: row.display_name, contact: row.email } : null
    }
    return {
      ok: true,
      seller: who(trade.seller),
      trader: who(trade.trader),
      bankDetails: details ? decrypt(dataKey, details.details) : null,
      evidence: evidenceFor(tradeId),
      chat: chatSince(tradeId, 0),
    }
  }

  function adminListKyc(status: string) {
    const rows = db.query<Record<string, unknown>, string>(
      `SELECT k.id, k.contact, k.full_name, k.id_type, k.id_number, k.country_code, k.status, k.reason, k.submitted_at,
              u.ptp_id
       FROM kyc k LEFT JOIN users u ON u.email = k.contact
       WHERE k.status = ? ORDER BY k.submitted_at ASC LIMIT 200`).all(status)
    return { ok: true, submissions: rows }
  }

  function adminGetKyc(id: number) {
    const row = db.query<{ id_image: string; selfie: string } & Record<string, unknown>, number>('SELECT * FROM kyc WHERE id = ?').get(id)
    if (!row) throw new HttpError(404, 'Submission not found.')
    return { ok: true, submission: { ...row, id_image: decrypt(dataKey, row.id_image), selfie: decrypt(dataKey, row.selfie) } }
  }

  function adminReviewKyc(id: number, body: Json) {
    const decision = String(body.decision ?? '')
    if (decision !== 'approved' && decision !== 'rejected') throw new HttpError(400, 'Decision must be approved or rejected.')
    const reason = String(body.reason ?? '').slice(0, 300)
    const res = db.query('UPDATE kyc SET status = ?, reason = ?, reviewed_at = ? WHERE id = ?').run(decision, reason, now(), id)
    if (res.changes === 0) throw new HttpError(404, 'Submission not found.')
    return { ok: true }
  }

  // ── naira account payouts (bank, airtime, data, electricity, TV) ─────────

  function nairaAddress(): string {
    const row = db.query<{ value: string }, string>('SELECT value FROM config WHERE key = ?').get('naira_address')
    return (row?.value || opts.nairaAddress || '').toLowerCase()
  }

  function config() {
    return { ok: true, nairaAddress: nairaAddress() || null, payoutMode: opts.payoutMode ?? 'manual' }
  }

  async function readPayout(contract: string, payoutId: bigint): Promise<OnchainPayout | null> {
    if (!opts.rpc) throw new HttpError(503, 'Chain access is not configured.')
    const data = GET_PAYOUT_SELECTOR + payoutId.toString(16).padStart(64, '0')
    try {
      const result = await opts.rpc('eth_call', [{ to: contract, data }, 'latest']) as string
      const p = decodeGetPayout(result)
      return p && p.status !== 0 ? p : null
    } catch (e) {
      if (e instanceof RpcError) return null // UnknownPayout reverts
      throw e
    }
  }

  /** Check the details the app sends have the fields a payout partner needs. */
  function validatePayoutDetails(kind: PayoutKind, d: Record<string, unknown>) {
    const str = (k: string) => String(d[k] ?? '').trim()
    const need = (ok: boolean, msg: string) => { if (!ok) throw new HttpError(400, msg) }
    if (kind === 'bank') {
      need(!!str('bank'), 'Choose a bank.')
      need(/^\d{10}$/.test(str('accountNumber')), 'Enter the 10-digit account number.')
      need(str('accountName').length >= 2, "Enter the account holder's name.")
    } else if (kind === 'airtime' || kind === 'data') {
      need(!!str('network'), 'Choose a network.')
      need(/^0\d{10}$/.test(str('phone')), 'Enter an 11-digit phone number, e.g. 08031234567.')
      if (kind === 'data') need(!!str('plan'), 'Choose a data plan.')
    } else if (kind === 'electricity') {
      need(!!str('disco'), 'Choose your electricity company.')
      need(/^\d{11,13}$/.test(str('meterNumber')), 'Enter your 11–13 digit meter number.')
    } else if (kind === 'tv') {
      need(!!str('provider'), 'Choose a TV provider.')
      need(/^\d{10,12}$/.test(str('smartcard')), 'Enter your smartcard / IUC number.')
      need(!!str('plan'), 'Choose a package.')
    }
  }

  type PayoutRow = {
    payout_id: string; contract: string; contact: string; from_address: string; kind: string; amount: string
    details: string; status: string; reference: string; token: string; reason: string; created_at: number; updated_at: number
  }

  function publicPayout(r: PayoutRow, withContact = false) {
    return {
      payoutId: r.payout_id, kind: r.kind, amount: r.amount, status: r.status, reference: r.reference,
      token: r.token || undefined, reason: r.reason || undefined, createdAt: r.created_at, updatedAt: r.updated_at,
      details: JSON.parse(decrypt(dataKey, r.details)) as Record<string, unknown>,
      ...(withContact ? { contact: r.contact, fromAddress: r.from_address } : {}),
    }
  }

  function payoutRow(contract: string, payoutId: string) {
    return db.query<PayoutRow, [string, string]>('SELECT * FROM payouts WHERE contract = ? AND payout_id = ?').get(contract, payoutId)
  }

  /** The app burned naira on-chain for a payout; record where it should go and pay it out. */
  async function postPayout(contact: string, body: Json) {
    const contract = nairaAddress()
    if (!contract) throw new HttpError(503, "The naira account isn't switched on yet.")
    let payoutId: bigint
    try { payoutId = BigInt(String(body.payoutId)) } catch { throw new HttpError(400, 'Invalid payout.') }
    const detailsText = String(body.details ?? '')
    if (!detailsText || detailsText.length > MAX_BANK_DETAILS_CHARS) throw new HttpError(400, 'Invalid payout details.')
    let details: Record<string, unknown>
    try { details = JSON.parse(detailsText) } catch { throw new HttpError(400, 'Invalid payout details.') }

    const existing = payoutRow(contract, payoutId.toString())
    if (existing) {
      if (existing.contact !== contact) throw new HttpError(403, 'This payout belongs to someone else.')
      return { ok: true, payout: publicPayout(existing) }
    }

    const onchain = await readPayout(contract, payoutId)
    if (!onchain) throw new HttpError(404, 'Payout not found on-chain yet.')
    if (!verifiedAddressesOf(contact).has(onchain.from.toLowerCase())) throw new HttpError(403, 'This payout was not made from your wallet.')
    if (onchain.ref.toLowerCase() !== keccakHex(detailsText)) throw new HttpError(400, "These details don't match the payout on-chain.")
    if (onchain.status !== 1) throw new HttpError(409, 'This payout was already refunded.')
    const kind = PAYOUT_KINDS[onchain.kind]
    if (!kind || details.kind !== kind) throw new HttpError(400, 'Payout type mismatch.')
    validatePayoutDetails(kind, details)

    let status = 'processing'
    let reference = ''
    let token = ''
    let reason = ''
    if (kind === 'bank' && kycStatus(contact)?.status !== 'approved') {
      status = 'failed'
      reason = 'Bank transfers need a verified ID. Your naira will be refunded.'
    } else if (opts.payoutMode === 'simulate') {
      // TESTNET: no money moves. Pretend a payment partner paid it at once.
      status = 'paid'
      reference = `SIM-${randomBytes(5).toString('hex').toUpperCase()}`
      if (kind === 'electricity') token = Array.from({ length: 5 }, () => String(randomInt(0, 10_000)).padStart(4, '0')).join('-')
    }
    const t = now()
    db.query(`INSERT INTO payouts (payout_id, contract, contact, from_address, kind, amount, details, status, reference, token, reason, created_at, updated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(payoutId.toString(), contract, contact, onchain.from.toLowerCase(), kind, onchain.amount.toString(),
        encrypt(dataKey, detailsText), status, reference, token, reason, t, t)
    return { ok: true, payout: publicPayout(payoutRow(contract, payoutId.toString())!) }
  }

  function myPayouts(contact: string) {
    const rows = db.query<PayoutRow, [string, string]>(
      'SELECT * FROM payouts WHERE contact = ? AND contract = ? ORDER BY created_at DESC LIMIT 50').all(contact, nairaAddress())
    return { ok: true, payouts: rows.map(r => publicPayout(r)) }
  }

  function adminListPayouts(status: string) {
    const rows = db.query<PayoutRow, [string, string]>(
      'SELECT * FROM payouts WHERE status = ? AND contract = ? ORDER BY created_at ASC LIMIT 200').all(status, nairaAddress())
    return { ok: true, payouts: rows.map(r => publicPayout(r, true)) }
  }

  function adminUpdatePayout(payoutId: string, body: Json) {
    const status = String(body.status ?? '')
    if (status !== 'paid' && status !== 'failed') throw new HttpError(400, 'Status must be paid or failed.')
    const res = db.query('UPDATE payouts SET status = ?, reference = ?, reason = ?, updated_at = ? WHERE contract = ? AND payout_id = ?')
      .run(status, String(body.reference ?? '').slice(0, 100), String(body.reason ?? '').slice(0, 300), now(), nairaAddress(), payoutId)
    if (res.changes === 0) throw new HttpError(404, 'Payout not found.')
    return { ok: true }
  }

  function adminSetConfig(body: Json) {
    const addr = String(body.nairaAddress ?? '').trim()
    if (!ADDRESS_RE.test(addr)) throw new HttpError(400, 'Enter a contract address (0x…).')
    db.query('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('naira_address', addr.toLowerCase())
    return config()
  }

  /**
   * JSON-RPC relay to Arc. Browsers' ad/tracker blockers (e.g. Brave Shields) often
   * block direct calls to public RPC hosts; calls to the app's own server get through.
   */
  async function rpcRelay(req: Request, ip: string): Promise<Response> {
    if (!opts.rpc) return json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Chain access is not configured.' } }, 503)
    rateLimitIp(`rpc:${ip}`, 600, 60_000)
    let body: unknown
    try { body = await req.json() } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400) }
    const batch = Array.isArray(body)
    const calls = (batch ? body : [body]) as { id?: unknown; method?: unknown; params?: unknown }[]
    if (calls.length === 0 || calls.length > RELAY_MAX_BATCH) {
      return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid batch size' } }, 400)
    }
    const answers = await Promise.all(calls.map(async c => {
      const id = c?.id ?? null
      const method = typeof c?.method === 'string' ? c.method : ''
      if (!RELAY_METHODS.has(method)) return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not allowed: ${method}` } }
      try {
        return { jsonrpc: '2.0', id, result: await opts.rpc!(method, Array.isArray(c.params) ? c.params : []) }
      } catch (e) {
        if (e instanceof RpcError) return { jsonrpc: '2.0', id, error: { code: e.code, message: e.message, ...(e.data !== undefined ? { data: e.data } : {}) } }
        return { jsonrpc: '2.0', id, error: { code: -32603, message: 'Arc network unavailable, please retry.' } }
      }
    }))
    return json(batch ? answers : answers[0])
  }

  /** USDC transfer history for an address, via the Arc explorer (relayed for the same reason as /rpc). */
  async function historyRelay(address: string, ip: string) {
    if (!ADDRESS_RE.test(address)) throw new HttpError(400, 'Invalid address.')
    rateLimitIp(`history:${ip}`, 60, 60_000)
    const fetcher = opts.fetchExplorer ?? (async (url: string) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) throw new Error(`explorer ${res.status}`)
      return res.json()
    })
    try {
      const body = await fetcher(`${EXPLORER_API}/addresses/${address}/token-transfers?type=ERC-20`) as { items?: unknown[] }
      return { ok: true, items: Array.isArray(body?.items) ? body.items : [] }
    } catch {
      throw new HttpError(502, 'The Arc explorer is unavailable right now.')
    }
  }

  /**
   * Token prices and logos from CoinGecko, cached for a minute and relayed so
   * browser blockers and CoinGecko's per-visitor rate limits don't blank the wallet.
   */
  let priceCache: { at: number; tokens: unknown[] } | null = null
  async function prices(ip: string) {
    if (priceCache && now() - priceCache.at < PRICES_TTL_MS) return { ok: true, tokens: priceCache.tokens, cachedAt: priceCache.at }
    rateLimitIp(`prices:${ip}`, 60, 60_000)
    const fetcher = opts.fetchPrices ?? (async (url: string) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`coingecko ${res.status}`)
      return res.json()
    })
    try {
      const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${PRICE_IDS.join(',')}&price_change_percentage=24h`
      const rows = await fetcher(url) as { id: string; symbol: string; name: string; image: string; current_price: number; price_change_percentage_24h: number | null }[]
      if (!Array.isArray(rows) || rows.length === 0) throw new Error('empty')
      const tokens = rows.map(r => ({
        id: r.id, symbol: String(r.symbol).toUpperCase(), name: r.name, image: r.image,
        price: r.current_price, change24h: r.price_change_percentage_24h ?? null,
      }))
      priceCache = { at: now(), tokens }
      return { ok: true, tokens, cachedAt: priceCache.at }
    } catch {
      if (priceCache) return { ok: true, tokens: priceCache.tokens, cachedAt: priceCache.at, stale: true }
      throw new HttpError(502, 'Prices are unavailable right now.')
    }
  }

  // ── router ────────────────────────────────────────────────────────────────

  async function readBody(req: Request): Promise<Json> {
    try {
      const b = await req.json()
      return b && typeof b === 'object' ? b as Json : {}
    } catch {
      throw new HttpError(400, 'Invalid request body.')
    }
  }

  /** Handle an API request. `route` is the path without any /api prefix. */
  async function handle(req: Request, route: string, ip = 'unknown'): Promise<Response> {
    if (req.method === 'OPTIONS') return corsPreflight()
    const url = new URL(req.url)
    const m = req.method
    try {
      if (route === '/health') return json({ ok: true, ts: now() })
      if (m === 'POST' && route === '/rpc') return await rpcRelay(req, ip)
      if (m === 'GET' && route === '/history') return json(await historyRelay(url.searchParams.get('address') ?? '', ip))
      if (m === 'GET' && route === '/prices') return json(await prices(ip))

      if (m === 'POST' && route === '/auth/request-otp') return json(await requestOtp(await readBody(req), ip))
      if (m === 'POST' && route === '/auth/verify-otp') return json(verifyOtp(await readBody(req)))
      if (m === 'POST' && route === '/auth/logout') return json(logout(req))

      if (m === 'GET' && route === '/lookup') return json(lookup(url.searchParams.get('q') ?? ''))
      if (m === 'GET' && route === '/kyc/verified') return json(verifiedAddresses(url.searchParams.get('addresses') ?? ''))

      if (m === 'GET' && route === '/me') return json(me(sessionContact(req)))
      if (m === 'POST' && route === '/register') return json(register(sessionContact(req), await readBody(req)))
      if (m === 'POST' && route === '/update-handle') return json(updateHandle(sessionContact(req), await readBody(req)))
      if (m === 'POST' && route === '/link-wallet') return json(linkWallet(sessionContact(req), await readBody(req)))
      if (m === 'POST' && route === '/kyc/submit') return json(submitKyc(sessionContact(req), await readBody(req)))
      if (m === 'POST' && route === '/trade-details') return json(await postTradeDetails(sessionContact(req), await readBody(req)))
      if (m === 'GET' && route === '/trade-details') return json(await getTradeDetails(sessionContact(req), url.searchParams.get('tradeId') ?? ''))
      if (m === 'POST' && route === '/trade-evidence') return json(await addEvidence(sessionContact(req), await readBody(req)))
      if (m === 'GET' && route === '/trade-evidence') return json(await listEvidence(sessionContact(req), url.searchParams.get('tradeId') ?? ''))
      if (m === 'GET' && route === '/config') return json(config())
      if (m === 'POST' && route === '/payouts') return json(await postPayout(sessionContact(req), await readBody(req)))
      if (m === 'GET' && route === '/payouts') return json(myPayouts(sessionContact(req)))
      if (m === 'POST' && route === '/admin/config') { requireAdmin(req); return json(adminSetConfig(await readBody(req))) }
      if (m === 'GET' && route === '/admin/payouts') { requireAdmin(req); return json(adminListPayouts(url.searchParams.get('status') ?? 'processing')) }
      const payoutMatch = route.match(/^\/admin\/payouts\/(\d+)$/)
      if (m === 'POST' && payoutMatch) { requireAdmin(req); return json(adminUpdatePayout(payoutMatch[1], await readBody(req))) }
      if (m === 'POST' && route === '/trade-chat') return json(await postChat(sessionContact(req), await readBody(req), ip))
      if (m === 'GET' && route === '/trade-chat') return json(await listChat(sessionContact(req), url.searchParams.get('tradeId') ?? '', url.searchParams.get('after') ?? '0'))
      if (m === 'GET' && route === '/admin/dispute') { requireAdmin(req); return json(await adminDispute(url.searchParams.get('tradeId') ?? '')) }

      const adminMatch = route.match(/^\/admin\/kyc(?:\/(\d+))?$/)
      if (adminMatch) {
        requireAdmin(req)
        const id = adminMatch[1] ? Number(adminMatch[1]) : null
        if (m === 'GET' && id === null) return json(adminListKyc(url.searchParams.get('status') ?? 'pending'))
        if (m === 'GET' && id !== null) return json(adminGetKyc(id))
        if (m === 'POST' && id !== null) return json(adminReviewKyc(id, await readBody(req)))
      }

      return json({ ok: false, error: 'Not found' }, 404)
    } catch (e) {
      if (e instanceof HttpError) return json({ ok: false, error: e.message }, e.status)
      console.error('[api]', route, e)
      return json({ ok: false, error: 'Something went wrong on the server.' }, 500)
    }
  }

  return { handle }
}
