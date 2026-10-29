/** A small on-device log of naira activity (sends, conversions, payouts) for the Naira screen. */

export interface NairaLogEntry {
  hash: string
  kind: 'sent' | 'received' | 'payout' | 'to_naira' | 'to_usdc' | 'faucet'
  /** naira, 6 decimals, integer string */
  amount: string
  label: string
  payoutId?: string
  timestamp: number
}

const KEY = 'ptp_naira_log_v1'
const listeners = new Set<() => void>()

export function subscribeNairaLog(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Raw stored JSON — a stable string snapshot for useSyncExternalStore. */
export function nairaLogSnapshot(): string {
  try { return localStorage.getItem(KEY) ?? '[]' } catch { return '[]' }
}

export function nairaLog(): NairaLogEntry[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as NairaLogEntry[] } catch { return [] }
}

export function logNaira(entry: Omit<NairaLogEntry, 'timestamp'>) {
  const all = [{ ...entry, timestamp: Date.now() }, ...nairaLog().filter(e => e.hash !== entry.hash)].slice(0, 200)
  try { localStorage.setItem(KEY, JSON.stringify(all)) } catch { /* storage full or blocked */ }
  listeners.forEach(fn => fn())
}
