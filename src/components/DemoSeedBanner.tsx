/**
 * DemoSeedBanner — shows a helper card in dev explaining how to seed demo traders.
 * In production (after real traders register) this component is not rendered.
 */
import { Info } from 'lucide-react'

export function DemoSeedBanner() {
  return (
    <div
      className="mx-auto mt-4 max-w-lg rounded-2xl px-4 py-3 flex items-start gap-3"
      style={{ background: 'rgba(16,97,166,0.06)', border: '1px solid rgba(16,97,166,0.15)' }}
    >
      <Info className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--accent-hover)' }} />
      <div className="text-xs" style={{ color: 'var(--ink-2)' }}>
        <span className="font-semibold">Demo:</span> No real traders yet. Switch to the Trader tab and register yourself as a trader in Nigeria (NG), Vietnam (VN), or France (FR) with any rate. Then come back to the Marketplace.
      </div>
    </div>
  )
}
