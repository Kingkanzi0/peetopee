/**
 * Peetopee API — local development server (port 3001).
 * Vite proxies /api/* here (see vite.config.ts). All routes live in ./api.ts.
 *
 * Uses an in-memory database unless DB_PATH is set. For local testing without
 * an email provider, run with OTP_DEMO=1 so sign-in codes come back in the API
 * response (the app shows them in a banner).
 */
import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createApi, optionsFromEnv } from './api'

const PORT = parseInt(process.env.PORT ?? '3001')
const DB_PATH = process.env.DB_PATH

if (DB_PATH && !existsSync(dirname(DB_PATH))) mkdirSync(dirname(DB_PATH), { recursive: true })
const db = new Database(DB_PATH ?? ':memory:', { create: true })
const api = createApi(optionsFromEnv(db, DB_PATH))

Bun.serve({
  port: PORT,
  maxRequestBodySize: 12 * 1024 * 1024,
  fetch(req, server) {
    const path = new URL(req.url).pathname.replace(/^\/api/, '') || '/'
    return api.handle(req, path, server.requestIP(req)?.address)
  },
})

console.log(`Peetopee API running on http://localhost:${PORT}${DB_PATH ? '' : ' (in-memory database)'}`)
