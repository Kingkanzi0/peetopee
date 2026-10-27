/**
 * Production server — serves the built Vite frontend as static files
 * AND runs the Peetopee API on the same port (7860 for HF Spaces).
 * The frontend's /api/* calls are handled by the API routes;
 * everything else returns the index.html (SPA fallback).
 */
import { Database } from 'bun:sqlite'
import { join } from 'path'
import { mkdirSync, readFileSync, statSync } from 'fs'

const PORT   = parseInt(process.env.PORT  ?? '7860')
const DB_PATH = process.env.DB_PATH ?? join(import.meta.dir, '../data/peetopee.db')
const DIST   = join(import.meta.dir, '../dist')

mkdirSync(join(import.meta.dir, '../data'), { recursive: true })

const db = new Database(DB_PATH, { create: true })
db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000`)
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

// ── seed demo accounts ──────────────────────────────────────────────────────
// arc-studio-allow-onchain-literal — test fixture addresses for demo accounts
;(function seedDemoUsers() {
  const demos = [
    { email: 'demo@peetopee.ng',  ptpId: '@demo_nigeria', name: 'Demo Nigeria', cc: 'NG', addr: '0x1111111111111111111111111111111111111111' },
    { email: 'alex@peetopee.vn',  ptpId: '@alex_vn',      name: 'Alex Vietnam', cc: 'VN', addr: '0x2222222222222222222222222222222222222222' },
    { email: 'marie@peetopee.fr', ptpId: '@marie_fr',     name: 'Marie France', cc: 'FR', addr: '0x3333333333333333333333333333333333333333' },
    { email: 'kwame@peetopee.gh', ptpId: '@kwame_gh',     name: 'Kwame Ghana',  cc: 'GH', addr: '0x4444444444444444444444444444444444444444' },
    { email: 'priya@peetopee.in', ptpId: '@priya_in',     name: 'Priya India',  cc: 'IN', addr: '0x5555555555555555555555555555555555555555' },
  ]
  for (const d of demos) {
    db.query(`INSERT OR IGNORE INTO users (email, ptp_id, display_name, country_code, avatar_url) VALUES (?,?,?,?,?)`).run(d.email, d.ptpId, d.name, d.cc, '')
    db.query(`INSERT OR IGNORE INTO wallets (email, chain_id, address) VALUES (?,?,?)`).run(d.email, 5042002, d.addr)
  }
})()

// ── helpers ────────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.webp': 'image/webp',
}

function mimeFor(path: string) {
  const ext = path.match(/\.[^.]+$/)?.[0] ?? ''
  return MIME[ext] ?? 'application/octet-stream'
}

function staticFile(filePath: string): Response | null {
  try {
    const stat = statSync(filePath)
    if (!stat.isFile()) return null
    const body = readFileSync(filePath)
    return new Response(body, {
      headers: {
        'Content-Type': mimeFor(filePath),
        'Cache-Control': filePath.includes('/assets/') ? 'public,max-age=31536000,immutable' : 'no-cache',
      },
    })
  } catch { return null }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
function err(msg: string, status = 400) { return json({ error: msg }, status) }
function cors() {
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }})
}

// ── server ──────────────────────────────────────────────────────────────────

Bun.serve({
  port: PORT,

  async fetch(req) {
    const url  = new URL(req.url)
    const path = url.pathname

    if (req.method === 'OPTIONS') return cors()

    // ── API routes ──────────────────────────────────────────────────────────
    if (path.startsWith('/api')) {
      const route = path.replace(/^\/api/, '')

      if (req.method === 'POST' && route === '/register') {
        const body = await req.json() as { email: string; ptpId: string; displayName: string; countryCode?: string; avatarUrl?: string }
        const { email, ptpId, displayName, countryCode = '', avatarUrl = '' } = body
        if (!email || !ptpId || !displayName) return err('email, ptpId and displayName are required')
        const normalised = ptpId.startsWith('@') ? ptpId : `@${ptpId}`
        const clash = db.query<{ email: string }, [string, string]>('SELECT email FROM users WHERE ptp_id = ? AND email != ?').get(normalised, email)
        if (clash) return err('That Peetopee ID is already taken', 409)
        db.query(`INSERT INTO users (email, ptp_id, display_name, country_code, avatar_url)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET ptp_id=excluded.ptp_id, display_name=excluded.display_name,
          country_code=excluded.country_code, avatar_url=CASE WHEN excluded.avatar_url!='' THEN excluded.avatar_url ELSE avatar_url END`
        ).run(email, normalised, displayName, countryCode, avatarUrl)
        return json({ ok: true, ptpId: normalised })
      }

      if (req.method === 'GET' && route === '/lookup') {
        const q = url.searchParams.get('q')?.trim()
        if (!q) return err('q is required')
        const isHandle = q.startsWith('@') || !q.includes('@')
        const term = isHandle ? (q.startsWith('@') ? q : `@${q}`) : q
        type Row = { email: string; ptp_id: string; display_name: string; country_code: string; avatar_url: string }
        const user = isHandle
          ? db.query<Row, string>('SELECT * FROM users WHERE ptp_id = ?').get(term)
          : db.query<Row, string>('SELECT * FROM users WHERE email = ?').get(term)
        if (!user) return json({ found: false })
        const ws = db.query<{ chain_id: number; address: string }, string>('SELECT chain_id, address FROM wallets WHERE email = ?').all(user.email)
        const walletAddresses: Record<number, string> = {}
        for (const w of ws) walletAddresses[w.chain_id] = w.address
        return json({ found: true, user: { email: user.email, ptpId: user.ptp_id, displayName: user.display_name, countryCode: user.country_code, avatarUrl: user.avatar_url, walletAddresses } })
      }

      if (req.method === 'POST' && route === '/link-wallet') {
        const body = await req.json() as { email: string; chainId: number; address: string }
        const { email, chainId, address } = body
        if (!email || !chainId || !address) return err('email, chainId and address are required')
        db.query(`INSERT INTO wallets (email, chain_id, address) VALUES (?,?,?) ON CONFLICT(email,chain_id) DO UPDATE SET address=excluded.address`).run(email, chainId, address)
        return json({ ok: true })
      }

      if (route === '/health') return json({ ok: true, ts: Date.now() })
      return err('Not found', 404)
    }

    // ── Static files ────────────────────────────────────────────────────────
    // Try exact path first, then index.html fallback for SPA routing
    const filePath = join(DIST, path === '/' ? 'index.html' : path)
    const file = staticFile(filePath)
    if (file) return file

    // SPA fallback
    const index = staticFile(join(DIST, 'index.html'))
    if (index) return index

    return new Response('Not found', { status: 404 })
  },
})

console.log(`Peetopee production server on http://0.0.0.0:${PORT}`)
