/**
 * useLocalCurrency — fetches a live USD→local-currency FX rate
 * and converts a USDC amount to the user's local currency.
 *
 * Uses the Open Exchange Rates free tier (app_id not required for
 * /api/latest.json with a free key). Falls back to hardcoded approximate
 * rates if the API is unavailable so the UI never stalls.
 */
import { useState, useEffect } from 'react'

// Fallback rates: 1 USD → local currency (approximate, Oct 2026)
const FALLBACK_RATES: Record<string, number> = {
  NGN: 1620,
  VND: 25400,
  EUR: 0.93,
  GBP: 0.79,
  KES: 132,
  GHS: 15.8,
  ZAR: 18.5,
  INR: 84,
  BRL: 5.4,
  MXN: 17.2,
  PHP: 58,
  IDR: 15800,
  CAD: 1.37,
  AUD: 1.55,
  JPY: 150,
  SGD: 1.34,
  THB: 35,
  EGP: 48,
  PKR: 278,
  BDT: 110,
  MAD: 9.95,
  TZS: 2650,
  UGX: 3780,
  USD: 1,
}

export interface FxState {
  rate: number | null        // 1 USDC = X local currency
  loading: boolean
  source: 'live' | 'fallback'
  convert: (usdc: number) => number | null
  formatLocal: (amount: number, currencyCode: string, symbol: string) => string
}

// Fetch from exchangerate-api.com free tier (no key needed for basic endpoint)
async function fetchRate(currencyCode: string): Promise<number | null> {
  if (currencyCode === 'USD') return 1
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(
      `https://open.er-api.com/v6/latest/USD`,
      { signal: controller.signal }
    )
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = await res.json() as { rates?: Record<string, number> }
    return data.rates?.[currencyCode] ?? null
  } catch {
    return null
  }
}

export function useLocalCurrency(currencyCode: string): FxState {
  // Start with the fallback rate so UI renders immediately without stalling.
  const [rate, setRate] = useState<number | null>(() => FALLBACK_RATES[currencyCode] ?? null)
  const [loading, setLoading] = useState(false)
  const [source, setSource] = useState<'live' | 'fallback'>('fallback')

  useEffect(() => {
    if (!currencyCode) return
    let mounted = true

    async function refresh() {
      const live = await fetchRate(currencyCode)
      if (!mounted) return
      if (live != null) {
        setRate(live)
        setSource('live')
      } else {
        const fallback = FALLBACK_RATES[currencyCode] ?? null
        setRate(fallback)
        setSource('fallback')
      }
      setLoading(false)
    }

    void refresh()
    // Refresh every 5 minutes
    const interval = setInterval(() => { void refresh() }, 5 * 60_000)
    return () => { mounted = false; clearInterval(interval) }
  }, [currencyCode])

  function convert(usdc: number): number | null {
    if (rate == null) return null
    return usdc * rate
  }

  function formatLocal(amount: number, code: string, symbol: string): string {
    // Format with locale-aware thousands separators
    if (amount >= 1000) {
      return `${symbol}${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    }
    return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return { rate, loading, source, convert, formatLocal }
}
