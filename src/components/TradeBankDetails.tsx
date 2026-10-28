/**
 * TradeBankDetails — the seller's bank details for a trade.
 *
 * They're kept on the Peetopee server (encrypted), not on the blockchain. Only
 * the trade's seller and trader can read them; the escrow contract holds just a
 * hash so nobody can swap them after the trade starts.
 *
 * If the seller's app couldn't upload them right after locking the escrow (e.g.
 * it went offline), the seller's app retries from here automatically.
 */
import { useEffect, useState } from 'react'
import { Landmark, Copy, Check, Loader2 } from 'lucide-react'
import { apiGetTradeDetails, apiPostTradeDetails, ApiError } from '../auth/ptpApi'

const PENDING_KEY = (tradeId: bigint) => `ptp_pending_bank_${tradeId.toString()}`

export function rememberPendingBankDetails(tradeId: bigint, details: string) {
  try { localStorage.setItem(PENDING_KEY(tradeId), details) } catch { /* ignore */ }
}

/** Upload bank details for a trade we just created. Keeps a local copy until the server has it. */
export async function uploadBankDetails(tradeId: bigint, details: string) {
  rememberPendingBankDetails(tradeId, details)
  // The server reads the trade from the chain; give the RPC a moment to catch up if needed.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await apiPostTradeDetails(tradeId, details)
      localStorage.removeItem(PENDING_KEY(tradeId))
      return true
    } catch (e) {
      if (e instanceof ApiError && e.status !== 404 && e.status !== 0) return false
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
    }
  }
  return false
}

export function TradeBankDetails({ tradeId, role }: { tradeId: bigint; role: 'seller' | 'trader' }) {
  const [details, setDetails] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    async function load() {
      try {
        let d = await apiGetTradeDetails(tradeId)
        if (d === null && role === 'seller') {
          const pending = localStorage.getItem(PENDING_KEY(tradeId))
          if (pending && await uploadBankDetails(tradeId, pending)) d = pending
        }
        if (!alive) return
        setDetails(d)
        setError('')
        if (d === null) timer = setTimeout(() => { void load() }, 8000)
      } catch (e) {
        if (!alive) return
        setError(e instanceof ApiError ? e.message : 'Could not load bank details.')
        timer = setTimeout(() => { void load() }, 15000)
      }
    }
    void load()
    return () => { alive = false; clearTimeout(timer) }
  }, [tradeId, role])

  function copy() {
    if (!details) return
    void navigator.clipboard.writeText(details).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="mb-4 rounded-2xl p-4" style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-2">
        <Landmark className="size-4" style={{ color: 'var(--accent)' }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
          {role === 'trader' ? 'Send the money to' : 'Your bank details (shared with the trader)'}
        </span>
      </div>
      {details === undefined && !error && (
        <p className="text-sm flex items-center gap-2" style={{ color: 'var(--muted)' }}>
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      )}
      {details === null && (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {role === 'trader'
            ? "Waiting for the seller's app to share their bank details. Don't send any money yet."
            : 'Sharing your bank details with the trader…'}
        </p>
      )}
      {details && (
        <div className="flex items-start gap-2">
          <p className="flex-1 text-sm font-medium whitespace-pre-wrap break-words" style={{ color: 'var(--ink)' }}>{details}</p>
          <button onClick={copy} className="rounded-lg p-2 shrink-0" style={{ background: 'var(--surface-muted)' }} aria-label="Copy bank details">
            {copied ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" style={{ color: 'var(--muted)' }} />}
          </button>
        </div>
      )}
      {error && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  )
}
