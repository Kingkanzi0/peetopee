/**
 * Tests for the Peetopee API. Run with: cd server && bun test
 */
import { describe, expect, test, beforeEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import {
  createApi, decodeGetTrade, keccakHex, normalizeContact, recoverPersonalSign, walletLinkMessage,
  type RpcFn, type SendCodeFn,
} from './api'

const enc = new TextEncoder()
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex')

// ── test wallets ────────────────────────────────────────────────────────────

function makeWallet(seed: number) {
  const priv = new Uint8Array(32)
  priv[31] = seed
  const pub = secp256k1.getPublicKey(priv, false)
  const address = '0x' + hex(keccak_256(pub.subarray(1)).subarray(12))
  function signMessage(message: string) {
    const msg = enc.encode(message)
    const digest = keccak_256(new Uint8Array([...enc.encode(`\x19Ethereum Signed Message:\n${msg.length}`), ...msg]))
    const sig = secp256k1.sign(digest, priv, { prehash: false, format: 'recovered' })
    // noble: [recid, r, s] → Ethereum: r || s || (27 + recid)
    return '0x' + hex(sig.subarray(1)) + (27 + sig[0]).toString(16)
  }
  return { address, signMessage }
}

const alice = makeWallet(1)
const aliceFunds = makeWallet(2)
const bob = makeWallet(3)
const mallory = makeWallet(4)

// ── fake chain ──────────────────────────────────────────────────────────────

function word(v: bigint | string) {
  const n = typeof v === 'string' ? BigInt(v) : v
  return n.toString(16).padStart(64, '0')
}

function encodeTrade(t: { id: bigint; seller: string; trader: string; bankDetails: string; status?: number }) {
  const str = Buffer.from(t.bankDetails, 'utf8')
  const padded = str.toString('hex').padEnd(Math.ceil(str.length / 32) * 64, '0')
  return '0x' + [
    word(32n),                       // offset to tuple
    word(t.id), word(t.seller), word(t.trader),
    word(10_000_000n), word(16_000_000_000n),
    word(12n * 32n),                 // string offset within tuple
    word(BigInt(t.status ?? 0)), word(1n), word(0n), word(0n), word(0n), word(0n),
    word(BigInt(str.length)),
  ].join('') + padded
}

let chainTrades = new Map<bigint, string>()
const fakeRpc: RpcFn = async (method, params) => {
  if (method !== 'eth_call') throw new Error('unexpected ' + method)
  const data = (params[0] as { data: string }).data
  const id = BigInt('0x' + data.slice(10))
  return chainTrades.get(id) ?? encodeTrade({ id: 0n, seller: '0x' + '0'.repeat(40), trader: '0x' + '0'.repeat(40), bankDetails: '' })
}

// ── harness ─────────────────────────────────────────────────────────────────

let api: ReturnType<typeof createApi>
let sent: { contact: string; code: string }[]

function setup(over: Partial<Parameters<typeof createApi>[0]> = {}) {
  sent = []
  chainTrades = new Map()
  const sendCode: SendCodeFn = async (contact, code) => { sent.push({ contact, code }) }
  api = createApi({ db: new Database(':memory:'), rpc: fakeRpc, sendCode, adminToken: 'admin-secret', ...over })
}

async function call(method: string, route: string, body?: unknown, headers: Record<string, string> = {}) {
  const req = new Request(`http://test${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const res = await api.handle(req, route.split('?')[0], '1.2.3.4')
  return { status: res.status, body: await res.json() as any }
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

async function signUp(contact: string, name: string, handle?: string) {
  await call('POST', '/auth/request-otp', { contact })
  const code = sent.at(-1)!.code
  const v = await call('POST', '/auth/verify-otp', { contact, code })
  expect(v.status).toBe(200)
  const token = v.body.token as string
  const r = await call('POST', '/register', { displayName: name, ptpId: handle ?? '', countryCode: 'NG' }, auth(token))
  expect(r.status).toBe(200)
  return { token, ptpId: r.body.profile.ptpId as string }
}

async function link(token: string, ptpId: string, w: ReturnType<typeof makeWallet>, kind = 'wallet') {
  return call('POST', '/link-wallet', {
    chainId: 5042002, kind, address: w.address,
    signature: w.signMessage(walletLinkMessage(ptpId, w.address, kind)),
  }, auth(token))
}

beforeEach(() => setup())

// ── tests ───────────────────────────────────────────────────────────────────

describe('signature recovery', () => {
  test('matches the published web3.js example vector', () => {
    // web3.eth.accounts.sign('Some data', '0x4c0883a6…2318') from the web3.js docs
    const sig = '0xb91467e570a6466aa9e9876cbcd013baba02900b8979d43fe208a4a4f339f5fd6007e74cd82e037b800186422fc2da167c747ef045e5d18a5f5d4300f8e1a0291c'
    expect(recoverPersonalSign('Some data', sig)).toBe('0x2c7536e3605d9c16a7a3d7b1898e529396a65c23')
  })

  test('rejects garbage', () => {
    expect(recoverPersonalSign('hi', '0x1234')).toBeNull()
  })
})

describe('helpers', () => {
  test('normalizes contacts', () => {
    expect(normalizeContact('  Ricardo@Gmail.COM ')).toBe('ricardo@gmail.com')
    expect(normalizeContact('+234 (803) 123-4567')).toBe('+2348031234567')
    expect(normalizeContact('nope')).toBe('')
  })

  test('decodes getTrade', () => {
    const t = decodeGetTrade(encodeTrade({ id: 7n, seller: alice.address, trader: bob.address, bankDetails: 'hello', status: 1 }))!
    expect(t.tradeId).toBe(7n)
    expect(t.seller).toBe(alice.address)
    expect(t.trader).toBe(bob.address)
    expect(t.bankDetails).toBe('hello')
    expect(t.status).toBe(1)
  })
})

describe('sign-in codes', () => {
  test('email code round trip issues a session', async () => {
    const r = await call('POST', '/auth/request-otp', { contact: 'Alice@Example.com' })
    expect(r.status).toBe(200)
    expect(r.body.demoCode).toBeUndefined()
    expect(sent[0].contact).toBe('alice@example.com')
    const v = await call('POST', '/auth/verify-otp', { contact: 'alice@example.com', code: sent[0].code })
    expect(v.status).toBe(200)
    expect(v.body.token).toHaveLength(64)
    const me = await call('GET', '/me', undefined, auth(v.body.token))
    expect(me.body.contact).toBe('alice@example.com')
  })

  test('wrong codes are counted and then locked out', async () => {
    await call('POST', '/auth/request-otp', { contact: 'a@b.co' })
    for (let i = 0; i < 5; i++) {
      expect((await call('POST', '/auth/verify-otp', { contact: 'a@b.co', code: '000000' })).status).toBe(400)
    }
    const locked = await call('POST', '/auth/verify-otp', { contact: 'a@b.co', code: sent[0].code })
    expect(locked.status).toBe(429)
  })

  test('codes are single use', async () => {
    await call('POST', '/auth/request-otp', { contact: 'a@b.co' })
    expect((await call('POST', '/auth/verify-otp', { contact: 'a@b.co', code: sent[0].code })).status).toBe(200)
    expect((await call('POST', '/auth/verify-otp', { contact: 'a@b.co', code: sent[0].code })).status).toBe(400)
  })

  test('cannot spam resend', async () => {
    await call('POST', '/auth/request-otp', { contact: 'a@b.co' })
    expect((await call('POST', '/auth/request-otp', { contact: 'a@b.co' })).status).toBe(429)
  })

  test('without an email provider sign-in is refused unless demo mode is on', async () => {
    setup({ sendCode: null })
    expect((await call('POST', '/auth/request-otp', { contact: 'a@b.co' })).status).toBe(503)
    setup({ sendCode: null, otpDemo: true })
    const r = await call('POST', '/auth/request-otp', { contact: '+2348031234567' })
    expect(r.status).toBe(200)
    expect(r.body.demoCode).toMatch(/^\d{6}$/)
  })

  test('logout ends the session', async () => {
    const { token } = await signUp('a@b.co', 'Alice')
    await call('POST', '/auth/logout', {}, auth(token))
    expect((await call('GET', '/me', undefined, auth(token))).status).toBe(401)
  })
})

describe('profiles and Peetopee IDs', () => {
  test('protected routes need a session', async () => {
    for (const route of ['/register', '/link-wallet', '/update-handle', '/kyc/submit', '/trade-details']) {
      expect((await call('POST', route, {})).status).toBe(401)
    }
    expect((await call('POST', '/register', {}, auth('forged'))).status).toBe(401)
  })

  test('handles are unique and lookup hides the email', async () => {
    const a = await signUp('a@b.co', 'Alice', '@alice')
    const b = await signUp('b@b.co', 'Bob', '@alice')
    expect(a.ptpId).toBe('@alice')
    expect(b.ptpId).not.toBe('@alice')
    expect(b.ptpId.startsWith('@alice')).toBe(true)

    const byHandle = await call('GET', '/lookup?q=ALICE')
    expect(byHandle.body.found).toBe(true)
    expect(byHandle.body.user.displayName).toBe('Alice')
    expect(byHandle.body.user.email).toBeUndefined()

    const byEmail = await call('GET', '/lookup?q=A@B.CO')
    expect(byEmail.body.user.ptpId).toBe('@alice')
  })

  test('changing your handle is saved on the server', async () => {
    const a = await signUp('a@b.co', 'Alice', '@alice')
    await signUp('b@b.co', 'Bob', '@bob')
    expect((await call('POST', '/update-handle', { ptpId: '@bob' }, auth(a.token))).status).toBe(409)
    expect((await call('POST', '/update-handle', { ptpId: 'x' }, auth(a.token))).status).toBe(400)
    expect((await call('POST', '/update-handle', { ptpId: 'Alice_NG' }, auth(a.token))).body.ptpId).toBe('@alice_ng')
    expect((await call('GET', '/lookup?q=@alice_ng')).body.found).toBe(true)
    expect((await call('GET', '/lookup?q=@alice')).body.found).toBe(false)
  })

  test('profile photos are returned and size-limited', async () => {
    const a = await signUp('a@b.co', 'Alice', '@alice')
    const photo = 'data:image/jpeg;base64,' + 'A'.repeat(1000)
    await call('POST', '/register', { displayName: 'Alice', avatarUrl: photo }, auth(a.token))
    expect((await call('GET', '/lookup?q=@alice')).body.user.avatarUrl).toBe(photo)
    const huge = await call('POST', '/register', { displayName: 'Alice', avatarUrl: 'data:image/png;base64,' + 'A'.repeat(500_000) }, auth(a.token))
    expect(huge.status).toBe(413)
  })
})

describe('wallet linking', () => {
  test('needs a valid signature from that wallet', async () => {
    const a = await signUp('a@b.co', 'Alice', '@alice')
    const forged = await call('POST', '/link-wallet', {
      chainId: 5042002, kind: 'wallet', address: bob.address,
      signature: alice.signMessage(walletLinkMessage('@alice', bob.address, 'wallet')),
    }, auth(a.token))
    expect(forged.status).toBe(400)
    expect((await link(a.token, a.ptpId, alice)).status).toBe(200)
    const found = await call('GET', '/lookup?q=@alice')
    expect(found.body.user.walletAddresses['5042002']).toBe(alice.address)
  })

  test('a signature for another account cannot be replayed', async () => {
    const a = await signUp('a@b.co', 'Alice', '@alice')
    const m = await signUp('m@b.co', 'Mallory', '@mallory')
    const aliceSig = alice.signMessage(walletLinkMessage('@alice', alice.address, 'wallet'))
    const replay = await call('POST', '/link-wallet', { chainId: 5042002, kind: 'wallet', address: alice.address, signature: aliceSig }, auth(m.token))
    expect(replay.status).toBe(400)
    expect((await link(a.token, a.ptpId, alice)).status).toBe(200)
  })

  test("someone else can't take over your Peetopee ID's receiving address", async () => {
    const a = await signUp('a@b.co', 'Alice', '@alice')
    await link(a.token, a.ptpId, alice)
    const m = await signUp('m@b.co', 'Mallory', '@mallory')
    await link(m.token, m.ptpId, mallory)
    // Mallory can only change her own account, so Alice's lookup is unchanged
    expect((await call('GET', '/lookup?q=@alice')).body.user.walletAddresses['5042002']).toBe(alice.address)
    // …and she can't claim Alice's wallet either
    const sig = alice.signMessage(walletLinkMessage('@mallory', alice.address, 'wallet'))
    // (only Alice could make this signature; simulate a leak — still refused because it's already Alice's)
    const steal = await call('POST', '/link-wallet', { chainId: 5042002, kind: 'wallet', address: alice.address, signature: sig }, auth(m.token))
    expect(steal.status).toBe(409)
  })

  test('the funds account is not shown as a receiving address', async () => {
    const a = await signUp('a@b.co', 'Alice', '@alice')
    await link(a.token, a.ptpId, alice)
    await link(a.token, a.ptpId, aliceFunds, 'funds')
    const found = await call('GET', '/lookup?q=@alice')
    expect(Object.values(found.body.user.walletAddresses)).toEqual([alice.address])
    const me = await call('GET', '/me', undefined, auth(a.token))
    expect(me.body.wallets).toHaveLength(2)
  })
})

describe('ID verification', () => {
  const photo = 'data:image/jpeg;base64,' + 'B'.repeat(2000)
  const form = { fullName: 'Alice A', idType: 'passport', idNumber: 'A123', countryCode: 'NG', idImage: photo, selfie: photo }

  test('manual review flow', async () => {
    const a = await signUp('a@b.co', 'Alice', '@alice')
    await link(a.token, a.ptpId, aliceFunds, 'funds')
    expect((await call('POST', '/kyc/submit', form, auth(a.token))).body.status).toBe('pending')
    expect((await call('GET', `/kyc/verified?addresses=${aliceFunds.address}`)).body.verified[aliceFunds.address]).toBe(false)

    expect((await call('GET', '/admin/kyc')).status).toBe(403)
    const list = await call('GET', '/admin/kyc?status=pending', undefined, { 'X-Admin-Token': 'admin-secret' })
    expect(list.body.submissions).toHaveLength(1)
    expect(list.body.submissions[0].id_image).toBeUndefined()
    const id = list.body.submissions[0].id
    const one = await call('GET', `/admin/kyc/${id}`, undefined, { 'X-Admin-Token': 'admin-secret' })
    expect(one.body.submission.id_image).toBe(photo)

    await call('POST', `/admin/kyc/${id}`, { decision: 'approved' }, { 'X-Admin-Token': 'admin-secret' })
    expect((await call('GET', '/me', undefined, auth(a.token))).body.kyc.status).toBe('approved')
    expect((await call('GET', `/kyc/verified?addresses=${aliceFunds.address}`)).body.verified[aliceFunds.address]).toBe(true)
    expect((await call('GET', '/lookup?q=@alice')).body.user.idVerified).toBe(true)
  })

  test('auto-approve mode for testing', async () => {
    setup({ kycAutoApprove: true })
    const a = await signUp('a@b.co', 'Alice', '@alice')
    expect((await call('POST', '/kyc/submit', form, auth(a.token))).body.status).toBe('approved')
  })

  test('rejects non-images and missing fields', async () => {
    const a = await signUp('a@b.co', 'Alice', '@alice')
    expect((await call('POST', '/kyc/submit', { ...form, idImage: 'hello' }, auth(a.token))).status).toBe(400)
    expect((await call('POST', '/kyc/submit', { ...form, idNumber: '' }, auth(a.token))).status).toBe(400)
  })

  test('admin endpoints are off without a token configured', async () => {
    setup({ adminToken: undefined })
    expect((await call('GET', '/admin/kyc', undefined, { 'X-Admin-Token': '' })).status).toBe(404)
  })
})

describe('trade bank details', () => {
  const details = 'GTBank · 0123456789 · Alice A'

  async function trade() {
    const seller = await signUp('a@b.co', 'Alice', '@alice')
    await link(seller.token, seller.ptpId, aliceFunds, 'funds')
    const trader = await signUp('b@b.co', 'Bob', '@bob')
    await link(trader.token, trader.ptpId, bob, 'funds')
    const stranger = await signUp('m@b.co', 'Mallory', '@mallory')
    await link(stranger.token, stranger.ptpId, mallory, 'funds')
    chainTrades.set(5n, encodeTrade({ id: 5n, seller: aliceFunds.address, trader: bob.address, bankDetails: keccakHex(details) }))
    return { seller, trader, stranger }
  }

  test('only the seller can attach them, and they must match the on-chain hash', async () => {
    const { seller, stranger } = await trade()
    expect((await call('POST', '/trade-details', { tradeId: '5', details }, auth(stranger.token))).status).toBe(403)
    expect((await call('POST', '/trade-details', { tradeId: '5', details: 'Different bank' }, auth(seller.token))).status).toBe(400)
    expect((await call('POST', '/trade-details', { tradeId: '99', details }, auth(seller.token))).status).toBe(404)
    expect((await call('POST', '/trade-details', { tradeId: '5', details }, auth(seller.token))).status).toBe(200)
  })

  test('the trader can read them, a stranger cannot', async () => {
    const { seller, trader, stranger } = await trade()
    expect((await call('GET', '/trade-details?tradeId=5', undefined, auth(trader.token))).body.details).toBeNull()
    await call('POST', '/trade-details', { tradeId: '5', details }, auth(seller.token))
    expect((await call('GET', '/trade-details?tradeId=5', undefined, auth(trader.token))).body.details).toBe(details)
    expect((await call('GET', '/trade-details?tradeId=5', undefined, auth(seller.token))).body.details).toBe(details)
    expect((await call('GET', '/trade-details?tradeId=5', undefined, auth(stranger.token))).status).toBe(403)
  })
})

describe('migration from the old production database', () => {
  test('keeps users and handles; old wallet links become unverified', async () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE users (email TEXT PRIMARY KEY, ptp_id TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
        country_code TEXT NOT NULL DEFAULT '', avatar_url TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL DEFAULT (unixepoch()));
      CREATE TABLE wallets (email TEXT NOT NULL, chain_id INTEGER NOT NULL, address TEXT NOT NULL, PRIMARY KEY (email, chain_id));
      INSERT INTO users (email, ptp_id, display_name) VALUES ('old@b.co', '@olduser', 'Old User');
      INSERT INTO wallets VALUES ('old@b.co', 5042002, '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD');
    `)
    api = createApi({ db, rpc: fakeRpc, sendCode: async () => {} })
    const found = await call('GET', '/lookup?q=@olduser')
    expect(found.body.user.displayName).toBe('Old User')
    expect(found.body.user.walletAddresses).toEqual({})
    const row = db.query<{ verified: number }, []>('SELECT verified FROM linked_wallets').get()
    expect(row?.verified).toBe(0)
  })
})

describe('Arc RPC relay', () => {
  async function relay(body: unknown) {
    const req = new Request('http://test/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const res = await api.handle(req, '/rpc', '9.9.9.9')
    return { status: res.status, body: await res.json() as any }
  }

  test('forwards allowed calls and keeps the request id', async () => {
    chainTrades.set(3n, encodeTrade({ id: 3n, seller: alice.address, trader: bob.address, bankDetails: 'x' }))
    const data = '0x' + keccakHex('getTrade(uint256)').slice(2, 10) + (3).toString(16).padStart(64, '0')
    const r = await relay({ jsonrpc: '2.0', id: 42, method: 'eth_call', params: [{ to: '0x59417b13a4d545ff514642a1db1693f35652daea', data }, 'latest'] })
    expect(r.status).toBe(200)
    expect(r.body.id).toBe(42)
    expect(decodeGetTrade(r.body.result)!.tradeId).toBe(3n)
  })

  test('refuses methods outside the allowlist, per item in a batch', async () => {
    const r = await relay([
      { jsonrpc: '2.0', id: 1, method: 'eth_accounts', params: [] },
      { jsonrpc: '2.0', id: 2, method: 'debug_traceTransaction', params: [] },
    ])
    expect(r.body).toHaveLength(2)
    expect(r.body[0].error.code).toBe(-32601)
    expect(r.body[1].error.code).toBe(-32601)
  })

  test('passes node errors (like reverts) through with code and data', async () => {
    const { RpcError } = await import('./api')
    setup({ rpc: async () => { throw new RpcError(3, 'execution reverted', '0x08c379a0') } })
    const r = await relay({ jsonrpc: '2.0', id: 7, method: 'eth_call', params: [] })
    expect(r.body.error).toEqual({ code: 3, message: 'execution reverted', data: '0x08c379a0' })
  })

  test('rejects oversized batches', async () => {
    const r = await relay(Array.from({ length: 21 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'eth_chainId', params: [] })))
    expect(r.status).toBe(400)
  })
})

describe('RPC endpoint fallback', () => {
  test('skips a failing endpoint and passes node errors through without retrying', async () => {
    const { httpRpc, RpcError } = await import('./api')
    let hitsDown = 0, hitsUp = 0
    const down = Bun.serve({ port: 0, fetch() { hitsDown++; return new Response('bad gateway', { status: 502 }) } })
    const up = Bun.serve({
      port: 0,
      async fetch(req) {
        hitsUp++
        const { method } = await req.json() as { method: string }
        if (method === 'eth_call') return Response.json({ jsonrpc: '2.0', id: 1, error: { code: 3, message: 'execution reverted' } })
        return Response.json({ jsonrpc: '2.0', id: 1, result: '0x4cef52' })
      },
    })
    try {
      const rpc = httpRpc([`http://localhost:${down.port}`, `http://localhost:${up.port}`])
      expect(await rpc('eth_chainId', [])).toBe('0x4cef52')
      expect(hitsDown).toBe(1)
      await expect(rpc('eth_call', [])).rejects.toBeInstanceOf(RpcError)
      expect(hitsUp).toBe(2)
    } finally {
      down.stop(true); up.stop(true)
    }
  })
})

describe('history relay', () => {
  test('returns explorer transfers for a valid address', async () => {
    let asked = ''
    setup({ fetchExplorer: async url => { asked = url; return { items: [{ transaction_hash: '0xabc' }] } } })
    const r = await call('GET', `/history?address=${alice.address}`)
    expect(r.body.items).toEqual([{ transaction_hash: '0xabc' }])
    expect(asked).toContain(`/addresses/${alice.address}/token-transfers`)
  })

  test('rejects bad addresses and reports explorer outages', async () => {
    expect((await call('GET', '/history?address=nope')).status).toBe(400)
    setup({ fetchExplorer: async () => { throw new Error('down') } })
    expect((await call('GET', `/history?address=${alice.address}`)).status).toBe(502)
  })
})
