/**
 * Peetopee API server — Bun + bun:sqlite
 * Stores Peetopee ID registrations centrally so any device can find any user.
 * Runs on port 3001; Vite proxies /api/* to it.
 */
import { Database } from 'bun:sqlite'
import { join } from 'path'

const DB_PATH = process.env.DB_PATH ?? join(import.meta.dir, '../data/peetopee.db')

// Ensure data directory exists
import { mkdirSync } from 'fs'
mkdirSync(join(import.meta.dir, '../data'), { recursive: true })

const db = new Database(DB_PATH, { create: true })

// Crash-safe WAL mode (skill requirement)
db.exec(`PRAGMA journal_mode=WAL`)
db.exec(`PRAGMA synchronous=FULL`)
db.exec(`PRAGMA busy_timeout=5000`)

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    email        TEXT PRIMARY KEY,
    ptp_id       TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    country_code TEXT NOT NULL DEFAULT '',
    avatar_url   TEXT NOT NULL DEFAULT '',
    created_at   INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS wallets (
    email    TEXT NOT NULL,
    chain_id INTEGER NOT NULL,
    address  TEXT NOT NULL,
    PRIMARY KEY (email, chain_id)
  );
`)

// ── helpers ────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

function err(msg: string, status = 400) {
  return json({ error: msg }, status)
}

function cors() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

// ── routes ─────────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: 3001,

  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname.replace(/^\/api/, '')

    if (req.method === 'OPTIONS') return cors()

    // POST /register — create or update a user's Peetopee profile
    if (req.method === 'POST' && path === '/register') {
      const body = await req.json() as {
        email: string
        ptpId: string
        displayName: string
        countryCode?: string
        avatarUrl?: string
      }

      const { email, ptpId, displayName, countryCode = '', avatarUrl = '' } = body

      if (!email || !ptpId || !displayName) return err('email, ptpId and displayName are required')

      const normalised = ptpId.startsWith('@') ? ptpId : `@${ptpId}`

      // Check handle uniqueness (allow re-registration with same email)
      const existing = db.query<{ email: string }, string>(
        'SELECT email FROM users WHERE ptp_id = ? AND email != ?'
      ).get(normalised, email)

      if (existing) return err('That Peetopee ID is already taken', 409)

      db.query(`
        INSERT INTO users (email, ptp_id, display_name, country_code, avatar_url)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
          ptp_id = excluded.ptp_id,
          display_name = excluded.display_name,
          country_code = excluded.country_code,
          avatar_url = CASE WHEN excluded.avatar_url != '' THEN excluded.avatar_url ELSE avatar_url END
      `).run(email, normalised, displayName, countryCode, avatarUrl)

      return json({ ok: true, ptpId: normalised })
    }

    // GET /lookup?q=@handle_or_email — find a user by handle or email
    if (req.method === 'GET' && path === '/lookup') {
      const q = url.searchParams.get('q')?.trim()
      if (!q) return err('q is required')

      const isHandle = q.startsWith('@') || !q.includes('@')
      const term = isHandle ? (q.startsWith('@') ? q : `@${q}`) : q

      type Row = { email: string; ptp_id: string; display_name: string; country_code: string; avatar_url: string }

      const user = isHandle
        ? db.query<Row, string>('SELECT * FROM users WHERE ptp_id = ?').get(term)
        : db.query<Row, string>('SELECT * FROM users WHERE email = ?').get(term)

      if (!user) return json({ found: false })

      // Get linked wallet addresses
      const walletRows = db.query<{ chain_id: number; address: string }, string>(
        'SELECT chain_id, address FROM wallets WHERE email = ?'
      ).all(user.email)

      const walletAddresses: Record<number, string> = {}
      for (const w of walletRows) walletAddresses[w.chain_id] = w.address

      return json({
        found: true,
        user: {
          email: user.email,
          ptpId: user.ptp_id,
          displayName: user.display_name,
          countryCode: user.country_code,
          avatarUrl: user.avatar_url,
          walletAddresses,
        },
      })
    }

    // POST /link-wallet — associate a wallet address with a user on a chain
    if (req.method === 'POST' && path === '/link-wallet') {
      const body = await req.json() as { email: string; chainId: number; address: string }
      const { email, chainId, address } = body

      if (!email || !chainId || !address) return err('email, chainId and address are required')

      db.query(`
        INSERT INTO wallets (email, chain_id, address)
        VALUES (?, ?, ?)
        ON CONFLICT(email, chain_id) DO UPDATE SET address = excluded.address
      `).run(email, chainId, address)

      return json({ ok: true })
    }

    // GET /health
    if (path === '/health') return json({ ok: true, ts: Date.now() })

    return err('Not found', 404)
  },
})

console.log(`Peetopee API running on http://localhost:${server.port}`)
