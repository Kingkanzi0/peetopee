/**
 * Production server — runs the Peetopee API and, when a built frontend is
 * present in ../dist, serves it on the same port with an SPA fallback.
 * All API routes live in ./api.ts; they answer at both /api/<route> and /<route>.
 */
import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { createApi, optionsFromEnv } from './api'

const PORT = parseInt(process.env.PORT ?? '7860')
const DB_PATH = process.env.DB_PATH ?? join(import.meta.dir, '../data/peetopee.db')
const DIST = join(import.meta.dir, '../dist')

mkdirSync(dirname(DB_PATH), { recursive: true })
const db = new Database(DB_PATH, { create: true })
db.exec('PRAGMA synchronous=FULL;')
const api = createApi(optionsFromEnv(db, DB_PATH))

const API_ROUTES = /^\/(health|lookup|me|register|update-handle|link-wallet|auth\/|kyc\/|trade-details|admin\/)/

// ── static files ────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.webp': 'image/webp',
}

function staticFile(filePath: string): Response | null {
  try {
    if (!filePath.startsWith(DIST)) return null
    if (!statSync(filePath).isFile()) return null
    const ext = filePath.match(/\.[^.]+$/)?.[0] ?? ''
    return new Response(readFileSync(filePath), {
      headers: {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Cache-Control': filePath.includes('/assets/') ? 'public,max-age=31536000,immutable' : 'no-cache',
      },
    })
  } catch { return null }
}

// ── server ──────────────────────────────────────────────────────────────────

Bun.serve({
  port: PORT,
  maxRequestBodySize: 12 * 1024 * 1024,
  fetch(req, server) {
    const path = new URL(req.url).pathname
    const route = path.startsWith('/api/') || path === '/api' ? path.slice(4) || '/' : path
    if (path.startsWith('/api') || API_ROUTES.test(path) || req.method === 'OPTIONS') {
      return api.handle(req, route, server.requestIP(req)?.address)
    }
    return staticFile(join(DIST, path === '/' ? 'index.html' : path))
      ?? staticFile(join(DIST, 'index.html'))
      ?? new Response('Not found', { status: 404 })
  },
})

console.log(`Peetopee production server on http://0.0.0.0:${PORT}`)
