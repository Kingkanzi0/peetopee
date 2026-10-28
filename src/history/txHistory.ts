/**
 * Transaction history.
 *
 * Two sources, merged by transaction hash:
 *   1. What you did in this app (kept on this device, with friendly labels like
 *      "Sent to @alex" or "Moved to Funds").
 *   2. USDC transfers to and from your Wallet and Funds accounts on Arc, from
 *      the Arc testnet block explorer (Blockscout API). This catches money
 *      other people sent you and activity from other devices.
 */
import { PEETOPEE_ESCROW_ADDRESS, USDC_ADDRESS } from '../contracts/peetopee'

export type TxKind =
  | 'sent'          // USDC to another person
  | 'received'      // USDC from another person
  | 'to_funds'      // Wallet → Funds
  | 'from_funds'    // Funds → Wallet
  | 'escrow_lock'   // Funds → escrow (you started a sale)
  | 'escrow_release'// escrow → you (refund, or you were the trader)

export interface HistoryEntry {
  hash: string
  chainId: number
  kind: TxKind
  /** USDC amount as a decimal string, always positive. */
  amount: string
  /** Who or what was on the other side, e.g. "@alex" or "0x12…ab". */
  counterparty: string
  /** Optional extra detail, e.g. "Trade #12". */
  note?: string
  timestamp: number
  status: 'pending' | 'confirmed' | 'failed'
}

const STORAGE_KEY = 'ptp_tx_history_v1'
const EXPLORER_API = 'https://explorer.testnet.arc.io/api/v2'
const ARC_CHAIN_ID = 5042002
const MAX_LOCAL = 300

const listeners = new Set<() => void>()
export function subscribeHistory(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function loadLocal(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as HistoryEntry[] : []
  } catch { return [] }
}

function saveLocal(entries: HistoryEntry[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_LOCAL))) } catch { /* full */ }
  listeners.forEach(fn => fn())
}

/** Record something the user did in the app. Call it as soon as you have a tx hash. */
export function recordTx(entry: Omit<HistoryEntry, 'timestamp' | 'status'> & Partial<Pick<HistoryEntry, 'timestamp' | 'status'>>) {
  const all = loadLocal().filter(e => e.hash.toLowerCase() !== entry.hash.toLowerCase())
  all.unshift({ timestamp: Date.now(), status: 'pending', ...entry })
  saveLocal(all)
}

export function updateTxStatus(hash: string, status: HistoryEntry['status']) {
  const all = loadLocal()
  const e = all.find(x => x.hash.toLowerCase() === hash.toLowerCase())
  if (!e) return
  e.status = status
  saveLocal(all)
}

export function localHistory(): HistoryEntry[] {
  return loadLocal()
}

export function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

// ── explorer ────────────────────────────────────────────────────────────────

interface BlockscoutTransfer {
  from?: { hash?: string }
  to?: { hash?: string }
  total?: { value?: string; decimals?: string | null }
  token?: { address?: string; address_hash?: string }
  transaction_hash?: string
  tx_hash?: string
  timestamp?: string
}

function formatUnits6(raw: string, decimals: number) {
  const v = BigInt(raw)
  const base = 10n ** BigInt(decimals)
  const whole = v / base
  const frac = (v % base).toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole.toString()
}

async function explorerTransfers(address: string, signal?: AbortSignal): Promise<BlockscoutTransfer[]> {
  // Through the Peetopee server first (browser blockers often block the explorer), then directly.
  try {
    const res = await fetch(`/api/history?address=${address}`, { signal })
    if (res.ok) {
      const body = await res.json() as { items?: BlockscoutTransfer[] }
      if (Array.isArray(body.items)) return body.items
    }
  } catch (e) {
    if (signal?.aborted) throw e
  }
  const res = await fetch(`${EXPLORER_API}/addresses/${address}/token-transfers?type=ERC-20`, { signal })
  if (!res.ok) throw new Error(`explorer ${res.status}`)
  const body = await res.json() as { items?: BlockscoutTransfer[] }
  return body.items ?? []
}

function classify(t: BlockscoutTransfer, wallet: string, funds: string, escrow: string): HistoryEntry | null {
  const tokenAddr = (t.token?.address_hash ?? t.token?.address ?? '').toLowerCase()
  if (tokenAddr && tokenAddr !== USDC_ADDRESS.toLowerCase()) return null
  const from = (t.from?.hash ?? '').toLowerCase()
  const to = (t.to?.hash ?? '').toLowerCase()
  const hash = t.transaction_hash ?? t.tx_hash
  if (!hash || !t.total?.value) return null
  const decimals = Number(t.total.decimals ?? 6)
  const amount = formatUnits6(t.total.value, Number.isFinite(decimals) ? decimals : 6)
  const mine = (a: string) => a === wallet || a === funds
  let kind: TxKind
  let counterparty: string
  if (from === wallet && to === funds) { kind = 'to_funds'; counterparty = 'Funds' }
  else if (from === funds && to === wallet) { kind = 'from_funds'; counterparty = 'Wallet' }
  else if (mine(from) && to === escrow) { kind = 'escrow_lock'; counterparty = 'Escrow' }
  else if (from === escrow && mine(to)) { kind = 'escrow_release'; counterparty = 'Escrow' }
  else if (mine(from)) { kind = 'sent'; counterparty = shortAddr(to) }
  else if (mine(to)) { kind = 'received'; counterparty = shortAddr(from) }
  else return null
  return {
    hash, chainId: ARC_CHAIN_ID, kind, amount, counterparty,
    timestamp: t.timestamp ? Date.parse(t.timestamp) : 0,
    status: 'confirmed',
  }
}

/**
 * Full history for your Wallet and Funds accounts, newest first.
 * Falls back to the local record if the explorer can't be reached.
 */
export async function loadHistory(walletAddress?: string | null, fundsAddress?: string | null, signal?: AbortSignal) {
  const local = loadLocal()
  const wallet = (walletAddress ?? '').toLowerCase()
  const funds = (fundsAddress ?? '').toLowerCase()
  const escrow = PEETOPEE_ESCROW_ADDRESS.toLowerCase()
  const byHash = new Map<string, HistoryEntry>()
  let explorerOk = true

  const addrs = [...new Set([wallet, funds].filter(Boolean))]
  const results = await Promise.allSettled(addrs.map(a => explorerTransfers(a, signal)))
  for (const r of results) {
    if (r.status !== 'fulfilled') { explorerOk = false; continue }
    for (const t of r.value) {
      const e = classify(t, wallet, funds, escrow)
      if (e) byHash.set(e.hash.toLowerCase(), e)
    }
  }

  // Local entries carry better labels; they win, but take the chain's confirmed status/time.
  for (const e of local) {
    const key = e.hash.toLowerCase()
    const chain = byHash.get(key)
    byHash.set(key, chain
      ? { ...e, status: 'confirmed', timestamp: chain.timestamp || e.timestamp }
      : e)
  }

  const entries = [...byHash.values()].sort((a, b) => b.timestamp - a.timestamp)
  return { entries, explorerOk }
}

export const KIND_LABELS: Record<TxKind, string> = {
  sent: 'Sent',
  received: 'Received',
  to_funds: 'Moved to Funds',
  from_funds: 'Moved to Wallet',
  escrow_lock: 'Locked in escrow',
  escrow_release: 'Released from escrow',
}

/** Money leaving the user entirely (internal moves are neither in nor out). */
export function direction(kind: TxKind): 'in' | 'out' | 'internal' {
  if (kind === 'received' || kind === 'escrow_release') return 'in'
  if (kind === 'sent' || kind === 'escrow_lock') return 'out'
  return 'internal'
}

export function explorerTxUrl(hash: string) {
  return `https://explorer.testnet.arc.io/tx/${hash}`
}
