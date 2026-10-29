/**
 * useMoney — show money the way people think about it.
 *
 * Balances are held in USDC, but by default the app shows them in the local
 * currency of the country you're in (e.g. ₦ in Nigeria), with USDC alongside.
 * Tapping the balance pill switches between the two; the choice is remembered.
 *
 * The naira value is an estimate at the live market rate — the USDC amount is
 * what actually moves on Arc.
 */
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { getCountryByCode, type CountryDef } from '../contracts/peetopee'
import { useLocalCurrency } from './useLocalCurrency'

const VISITING_KEY = 'ptp_visiting_country'
const MODE_KEY = 'ptp_display_currency'
type Mode = 'local' | 'usdc'

function read(key: string) { try { return localStorage.getItem(key) } catch { return null } }
function write(key: string, v: string) { try { localStorage.setItem(key, v) } catch { /* ignore */ } }

/** The country you're in right now (defaults to your home country). Shared across screens. */
export function useVisitingCountry(): [CountryDef | undefined, (c: CountryDef) => void] {
  const { profile } = useAuth()
  const [code, setCode] = useState<string | null>(() => read(VISITING_KEY))
  useEffect(() => {
    const sync = () => setCode(read(VISITING_KEY))
    window.addEventListener('ptp-visiting-changed', sync)
    return () => window.removeEventListener('ptp-visiting-changed', sync)
  }, [])
  const country = (code && getCountryByCode(code)) || profile?.country
  function set(c: CountryDef) {
    write(VISITING_KEY, c.code)
    setCode(c.code)
    window.dispatchEvent(new Event('ptp-visiting-changed'))
  }
  return [country, set]
}

export function formatLocalAmount(amount: number, c: CountryDef) {
  const digits = Math.abs(amount) >= 1000 ? 0 : 2
  return `${c.currencySymbol}${amount.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

export function formatUsdc(amount: number) {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`
}

export function useMoney() {
  const [country] = useVisitingCountry()
  const { rate, source } = useLocalCurrency(country?.currency ?? 'USD')
  const [mode, setModeState] = useState<Mode>(() => (read(MODE_KEY) as Mode) || 'local')

  useEffect(() => {
    const sync = () => setModeState((read(MODE_KEY) as Mode) || 'local')
    window.addEventListener('ptp-display-changed', sync)
    return () => window.removeEventListener('ptp-display-changed', sync)
  }, [])

  function setMode(m: Mode) {
    write(MODE_KEY, m)
    setModeState(m)
    window.dispatchEvent(new Event('ptp-display-changed'))
  }

  const hasLocal = !!country && country.currency !== 'USD' && rate != null && rate > 0
  const showLocal = mode === 'local' && hasLocal

  return {
    country,
    rate,
    rateSource: source,
    /** True when amounts should be shown in local currency first. */
    showLocal,
    hasLocal,
    mode,
    toggle: () => setMode(mode === 'local' ? 'usdc' : 'local'),
    /** USDC → local currency number (null if no rate). */
    toLocal: (usdc: number) => (hasLocal ? usdc * rate! : null),
    /** Local currency → USDC number (null if no rate). */
    toUsdc: (local: number) => (hasLocal ? local / rate! : null),
    /** "₦66,300" or "41.97 USDC", following the user's display choice. */
    primary: (usdc: number) => (showLocal ? formatLocalAmount(usdc * rate!, country!) : formatUsdc(usdc)),
    /** The other currency, for a small second line ("41.97 USDC" or "≈ ₦66,300"). */
    secondary: (usdc: number) => (!hasLocal ? '' : showLocal ? formatUsdc(usdc) : `≈ ${formatLocalAmount(usdc * rate!, country!)}`),
    local: (usdc: number) => (hasLocal ? formatLocalAmount(usdc * rate!, country!) : null),
  }
}
