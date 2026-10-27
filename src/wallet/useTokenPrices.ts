/**
 * useTokenPrices — fetches live USD prices from CoinGecko public API (no key needed).
 * Returns a map of coinId -> price in USD, refreshed every 60 s.
 */
import { useState, useEffect } from 'react'

export type TokenPrices = Record<string, number>

// CoinGecko IDs for each token we display
export const COIN_IDS = {
  usdc: 'usd-coin',
  eth:  'ethereum',
  matic: 'matic-network',
  arb:  'arbitrum',
}

const ENDPOINT =
  `https://api.coingecko.com/api/v3/simple/price?ids=${Object.values(COIN_IDS).join(',')}&vs_currencies=usd`

// Fallback prices shown if CoinGecko is rate-limited or unreachable.
// These are approximate and clearly labelled as estimates in the UI.
const FALLBACK_PRICES: TokenPrices = {
  'usd-coin':     1.00,
  'ethereum':  2500.00,
  'matic-network': 0.13,
  'arbitrum':     0.20,
}

async function fetchPrices(): Promise<TokenPrices> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(ENDPOINT, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return FALLBACK_PRICES
    const data = await res.json() as Record<string, { usd: number }>
    const out: TokenPrices = {}
    for (const [id, val] of Object.entries(data)) {
      out[id] = val.usd
    }
    return Object.keys(out).length > 0 ? out : FALLBACK_PRICES
  } catch {
    return FALLBACK_PRICES
  }
}

export function useTokenPrices() {
  const [prices, setPrices] = useState<TokenPrices>(FALLBACK_PRICES)
  const [loading, setLoading] = useState(false) // start false — fallbacks are valid

  useEffect(() => {
    let mounted = true
    async function refresh() {
      const p = await fetchPrices()
      if (mounted) { setPrices(p); setLoading(false) }
    }
    void refresh()
    const interval = setInterval(() => { void refresh() }, 60_000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  return { prices, loading }
}

/** Returns the price for a token symbol (case-insensitive). */
export function getPriceForSymbol(prices: TokenPrices, symbol: string): number | null {
  const s = symbol.toLowerCase()
  if (s === 'usdc' || s === 'usdc.e') return prices[COIN_IDS.usdc] ?? null
  if (s === 'eth' || s === 'weth') return prices[COIN_IDS.eth] ?? null
  if (s === 'matic' || s === 'pol') return prices[COIN_IDS.matic] ?? null
  if (s === 'arb') return prices[COIN_IDS.arb] ?? null
  return null
}
