/**
 * Peetopee API Server
 * Runs on Bun. Uses SQLite when DB_PATH is set, falls back to in-memory Map.
 */

import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const PORT = parseInt(process.env.PORT ?? '3001')
const DB_PATH = process.env.DB_PATH

interface User {
  email: string
  ptpId: string
  displayName: string
  countryCode: string
  avatarUrl: string
  walletAddresses: Record<number, string>
}

let db: Database | null = null
const memStore = new Map<string, User>()

function initDb() {
  if (!DB_PATH) return
  try {
    const dir = dirname(DB_PATH)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    db = new Database(DB_PATH)
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;')
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY,
        ptpId TEXT UNIQUE NOT NULL,
        displayName TEXT NOT NULL,
        countryCode TEXT DEFAULT '',
        avatarUrl TEXT DEFAULT '',
        wallets TEXT DEFAULT '{}'
      );
    `)
  } catch (e) {
    console.warn('SQLite init failed, using in-memory store:', e)
    db = null
  }
}

function getUser(email: string): User | null {
  if (db) {
    const row = db.query<Record<string, string>, string>('SELECT * FROM users WHERE email = ?').get(email.toLowerCase())
    if (!row) return null
    return { ...row, walletAddresses: JSON.parse(row.wallets ?? '{}') } as User
  }
  return memStore.get(email.toLowerCase()) ?? null
}

function getUserByPtpId(ptpId: string): User | null {
  const id = ptpId.startsWith('@') ? ptpId : `@${ptpId}`
  if (db) {
    const row = db.query<Record<string, string>, string>('SELECT * FROM users WHERE ptpId = ?').get(id)
    if (!row) return null
    return { ...row, walletAddresses: JSON.parse(row.wallets ?? '{}') } as User
  }
  for (const u of memStore.values()) {
    if (u.ptpId === id) return u
  }
  return null
}

function upsertUser(u: User) {
  const email = u.email.toLowerCase()
  if (db) {
    db.query(`INSERT INTO users (email,ptpId,displayName,countryCode,avatarUrl,wallets) VALUES (?,?,?,?,?,?)
      ON CONFLICT(email) DO UPDATE SET displayName=excluded.displayName,countryCode=excluded.countryCode,avatarUrl=excluded.avatarUrl`)
      .run(email, u.ptpId, u.displayName, u.countryCode, u.avatarUrl, JSON.stringify(u.walletAddresses))
    return
  }
  const existing = memStore.get(email)
  memStore.set(email, { ...u, email, ptpId: existing?.ptpId ?? u.ptpId, walletAddresses: existing?.walletAddresses ?? u.walletAddresses })
}

function updateWallet(email: string, chainId: number, address: string) {
  const e = email.toLowerCase()
  if (db) {
    const row = db.query<{ wallets: string }, string>('SELECT wallets FROM users WHERE email = ?').get(e)
    if (!row) return
    const w = JSON.parse(row.wallets ?? '{}') as Record<number, string>
    w[chainId] = address
    db.query('UPDATE users SET wallets = ? WHERE email = ?').run(JSON.stringify(w), e)
    return
  }
  const u = memStore.get(e)
  if (!u) return
  memStore.set(e, { ...u, walletAddresses: { ...u.walletAddresses, [chainId]: address } })
}

function seedDemoUsers() {
  // arc-studio-allow-onchain-literal — test fixture addresses for demo accounts
  const demos: User[] = [
    { email: 'demo@peetopee.ng',  ptpId: '@demo_nigeria', displayName: 'Demo Nigeria', countryCode: 'NG', avatarUrl: '', walletAddresses: { 5042002: '0x1111111111111111111111111111111111111111' } },
    { email: 'alex@peetopee.vn',  ptpId: '@alex_vn',      displayName: 'Alex Vietnam', countryCode: 'VN', avatarUrl: '', walletAddresses: { 5042002: '0x2222222222222222222222222222222222222222' } },
    { email: 'marie@peetopee.fr', ptpId: '@marie_fr',     displayName: 'Marie France', countryCode: 'FR', avatarUrl: '', walletAddresses: { 5042002: '0x3333333333333333333333333333333333333333' } },
    { email: 'kwame@peetopee.gh', ptpId: '@kwame_gh',     displayName: 'Kwame Ghana',  countryCode: 'GH', avatarUrl: '', walletAddresses: { 5042002: '0x4444444444444444444444444444444444444444' } },
    { email: 'priya@peetopee.in', ptpId: '@priya_in',     displayName: 'Priya India',  countryCode: 'IN', avatarUrl: '', walletAddresses: { 5042002: '0x5555555555555555555555555555555555555555' } },
  ]
  for (const u of demos) { if (!getUser(u.email)) upsertUser(u) }
}

function cors() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } }
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors() } }) }

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/api/, '')
  if (req.method === 'OPTIONS') return json({})
  if (path === '/health') return json({ ok: true, ts: Date.now() })
  if (path === '/register' && req.method === 'POST') {
    const body = await req.json() as Record<string, string>
    const { email, ptpId, displayName, countryCode = '', avatarUrl = '' } = body
    if (!email || !ptpId || !displayName) return json({ ok: false, error: 'missing fields' }, 400)
    const existing = getUser(email)
    upsertUser({ email, ptpId: existing?.ptpId ?? ptpId, displayName, countryCode, avatarUrl, walletAddresses: existing?.walletAddresses ?? {} })
    return json({ ok: true, ptpId: existing?.ptpId ?? ptpId })
  }
  if (path === '/lookup' && req.method === 'GET') {
    const q = url.searchParams.get('q')?.trim() ?? ''
    if (!q) return json({ found: false })
    const user = q.includes('@') && !q.startsWith('@') ? getUser(q) : getUserByPtpId(q)
    if (!user) return json({ found: false })
    return json({ found: true, user: { ...user, avatarUrl: '' } })
  }
  if (path === '/link-wallet' && req.method === 'POST') {
    const body = await req.json() as Record<string, unknown>
    const { email, chainId, address } = body as { email: string; chainId: number; address: string }
    if (!email || !chainId || !address) return json({ ok: false, error: 'missing fields' }, 400)
    updateWallet(email, chainId, address)
    return json({ ok: true })
  }
  return json({ error: 'Not found' }, 404)
}

initDb()
seedDemoUsers()
Bun.serve({ port: PORT, fetch: handle })
console.log(`Peetopee API running on http://localhost:${PORT}`)
