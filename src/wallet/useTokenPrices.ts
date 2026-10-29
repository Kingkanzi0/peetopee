/**
 * useTokenPrices — live USD prices, 24h change and token logos.
 *
 * Source order: the Peetopee server's /api/prices relay (cached, not blocked by
 * Brave Shields) → CoinGecko directly → built-in estimates. Shared by every
 * screen and refreshed once a minute.
 */
import { useSyncExternalStore } from 'react'

export type TokenPrices = Record<string, number>

export interface TokenMeta {
  id: string
  symbol: string
  name: string
  /** Logo URL from CoinGecko, if known. */
  image?: string
  price: number
  change24h: number | null
}

// CoinGecko IDs for each token we display
export const COIN_IDS = {
  usdc: 'usd-coin',
  eth: 'ethereum',
  matic: 'matic-network',
  pol: 'polygon-ecosystem-token',
  arb: 'arbitrum',
  btc: 'bitcoin',
  sol: 'solana',
}

const IDS = Object.values(COIN_IDS)

/** Shown if prices can't be fetched at all. Approximate, and labelled as estimates. */
const FALLBACK: TokenMeta[] = [
  { id: 'usd-coin', symbol: 'USDC', name: 'USD Coin', price: 1, change24h: null },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', price: 2500, change24h: null },
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', price: 65000, change24h: null },
  { id: 'solana', symbol: 'SOL', name: 'Solana', price: 150, change24h: null },
  { id: 'arbitrum', symbol: 'ARB', name: 'Arbitrum', price: 0.2, change24h: null },
  { id: 'polygon-ecosystem-token', symbol: 'POL', name: 'POL (ex-MATIC)', price: 0.13, change24h: null },
  { id: 'matic-network', symbol: 'MATIC', name: 'Polygon', price: 0.13, change24h: null },
]

interface State { tokens: Record<string, TokenMeta>; prices: TokenPrices; source: 'live' | 'estimate'; loading: boolean }

const priceMap = (tokens: Record<string, TokenMeta>): TokenPrices => Object.fromEntries(Object.values(tokens).map(t => [t.id, t.price]))
const initialTokens = Object.fromEntries(FALLBACK.map(t => [t.id, t]))
let state: State = { tokens: initialTokens, prices: priceMap(initialTokens), source: 'estimate', loading: true }
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null
let inflight: Promise<void> | null = null

function set(next: Partial<State>) {
  state = { ...state, ...next }
  // Prices only change identity when tokens change, so screens can depend on them safely.
  if (next.tokens) state.prices = priceMap(next.tokens)
  listeners.forEach(fn => fn())
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(6_000) })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

type Row = { id: string; symbol: string; name: string; image?: string; price?: number; current_price?: number; change24h?: number | null; price_change_percentage_24h?: number | null }

function toMeta(rows: Row[]): TokenMeta[] {
  return rows
    .map(r => ({
      id: r.id,
      symbol: String(r.symbol).toUpperCase(),
      name: r.name,
      image: r.image,
      price: Number(r.price ?? r.current_price),
      change24h: (r.change24h ?? r.price_change_percentage_24h ?? null) as number | null,
    }))
    .filter(t => Number.isFinite(t.price))
}

async function refresh() {
  if (inflight) return inflight
  inflight = (async () => {
    let rows: TokenMeta[] = []
    try {
      const body = await getJson('/api/prices') as { tokens?: Row[] }
      rows = toMeta(body.tokens ?? [])
    } catch { /* try CoinGecko directly */ }
    if (rows.length === 0) {
      try {
        rows = toMeta(await getJson(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${IDS.join(',')}&price_change_percentage=24h`) as Row[])
      } catch { /* keep what we have */ }
    }
    if (rows.length > 0) {
      // Keep logos/estimates for anything missing from this response.
      set({ tokens: { ...state.tokens, ...Object.fromEntries(rows.map(t => [t.id, t])) }, source: 'live', loading: false })
    } else {
      set({ loading: false })
    }
  })().finally(() => { inflight = null })
  return inflight
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  if (!timer) { void refresh(); timer = setInterval(() => { void refresh() }, 60_000) }
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0 && timer) { clearInterval(timer); timer = null }
  }
}

export function useTokenPrices() {
  const s = useSyncExternalStore(subscribe, () => state)
  return { prices: s.prices, tokens: s.tokens, loading: s.loading, source: s.source }
}

/** Returns the price for a token symbol (case-insensitive). */
export function getPriceForSymbol(prices: TokenPrices, symbol: string): number | null {
  const id = idForSymbol(symbol)
  return id ? prices[id] ?? null : null
}

export function idForSymbol(symbol: string): string | null {
  const s = symbol.toLowerCase()
  if (s === 'usdc' || s === 'usdc.e') return COIN_IDS.usdc
  if (s === 'eth' || s === 'weth') return COIN_IDS.eth
  if (s === 'matic') return COIN_IDS.matic
  if (s === 'pol') return COIN_IDS.pol
  if (s === 'arb') return COIN_IDS.arb
  if (s === 'btc' || s === 'wbtc') return COIN_IDS.btc
  if (s === 'sol') return COIN_IDS.sol
  return null
}
