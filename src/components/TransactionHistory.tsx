/**
 * TransactionHistory — your USDC activity across Wallet and Funds.
 * See src/history/txHistory.ts for where the data comes from.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Lock, Unlock, ExternalLink, RefreshCw, Clock, XCircle,
} from 'lucide-react'
import { useAppWallet } from '../wallet/appWallet'
import { useMoney } from '../hooks/useMoney'
import {
  loadHistory, subscribeHistory, KIND_LABELS, direction, explorerTxUrl,
  type HistoryEntry, type TxKind,
} from '../history/txHistory'

const ICONS: Record<TxKind, typeof ArrowDownLeft> = {
  sent: ArrowUpRight,
  received: ArrowDownLeft,
  to_funds: ArrowLeftRight,
  from_funds: ArrowLeftRight,
  escrow_lock: Lock,
  escrow_release: Unlock,
}

interface Props {
  title?: string
  /** Fewer rows and no explorer note — for embedding under another screen. */
  compact?: boolean
  filter?: (e: HistoryEntry) => boolean
}

export function TransactionHistory({ title = 'Transaction history', compact, filter }: Props) {
  const { wallet } = useAppWallet()
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [explorerOk, setExplorerOk] = useState(true)
  const [loading, setLoading] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const res = await loadHistory(wallet?.address, wallet?.fundsAddress, signal)
      setEntries(res.entries)
      setExplorerOk(res.explorerOk)
    } catch { /* aborted */ } finally {
      setLoading(false)
    }
  }, [wallet?.address, wallet?.fundsAddress])

  useEffect(() => {
    const ctrl = new AbortController()
    void load(ctrl.signal)
    const unsub = subscribeHistory(() => { void load() })
    return () => { ctrl.abort(); unsub() }
  }, [load])

  const visible = (entries ?? []).filter(e => !filter || filter(e))
  const limit = compact ? 5 : showAll ? 200 : 15

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>{title}</div>
        <button onClick={() => { void load() }} className="p-1.5 rounded-lg" aria-label="Refresh history">
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} style={{ color: 'var(--muted)' }} />
        </button>
      </div>

      {entries === null ? (
        <div className="rounded-2xl px-4 py-6 text-center text-sm" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
          Loading…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl px-4 py-6 text-center" style={{ background: 'var(--surface-muted)', border: '1.5px dashed var(--border)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>No transactions yet</p>
          {!compact && <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>Sends, Funds moves and trades will show up here.</p>}
        </div>
      ) : (
        <div className="rounded-2xl px-4" style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}>
          {visible.slice(0, limit).map(e => <Row key={e.hash} e={e} />)}
        </div>
      )}

      {!compact && visible.length > limit && (
        <button onClick={() => setShowAll(true)} className="mt-2 w-full text-xs font-semibold py-2" style={{ color: 'var(--accent)' }}>
          Show all {visible.length}
        </button>
      )}
      {!compact && !explorerOk && (
        <p className="text-xs mt-2 px-1" style={{ color: 'var(--subtle)' }}>
          Showing activity from this device. The Arc explorer couldn't be reached, so payments you received may be missing. Tap refresh to try again.
        </p>
      )}
    </div>
  )
}

function Row({ e }: { e: HistoryEntry }) {
  const money = useMoney()
  const dir = direction(e.kind)
  const Icon = ICONS[e.kind]
  const color = dir === 'in' ? '#16a34a' : dir === 'out' ? 'var(--danger)' : 'var(--accent)'
  const bg = dir === 'in' ? 'rgba(22,163,74,0.1)' : dir === 'out' ? 'rgba(186,43,76,0.1)' : 'rgba(29,78,216,0.08)'
  const sign = dir === 'in' ? '+' : dir === 'out' ? '−' : ''
  const subtitle = e.kind === 'sent' ? `to ${e.counterparty}`
    : e.kind === 'received' ? `from ${e.counterparty}`
    : e.note ?? ''
  return (
    <a href={explorerTxUrl(e.hash)} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-3 py-3 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
      <div className="size-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
        <Icon className="size-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
          {KIND_LABELS[e.kind]}
          {e.status === 'pending' && <Clock className="size-3.5" style={{ color: 'var(--subtle)' }} />}
          {e.status === 'failed' && <XCircle className="size-3.5" style={{ color: 'var(--danger)' }} />}
        </div>
        <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
          {[subtitle, e.timestamp ? new Date(e.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '']
            .filter(Boolean).join(' · ')}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-bold tabular-nums" style={{ color: e.status === 'failed' ? 'var(--subtle)' : color }}>
          {sign}{money.primary(Number(e.amount))}
        </div>
        {money.hasLocal && (
          <div className="text-[11px] tabular-nums" style={{ color: 'var(--subtle)' }}>{money.secondary(Number(e.amount))}</div>
        )}
        <ExternalLink className="size-3 ml-auto mt-0.5" style={{ color: 'var(--subtle)' }} />
      </div>
    </a>
  )
}
