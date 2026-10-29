/** Shared building blocks for the naira account screens. */
import { ArrowLeft, AlertCircle, Loader2 } from 'lucide-react'

export interface NairaDone { title: string; lines: string[]; hash?: string; token?: string; pending?: boolean }

export const inputStyle = { background: 'var(--surface-muted)', border: '1.5px solid var(--border)', color: 'var(--ink)', fontSize: 16 } as const

export function Page({ title, onBack, children }: { title: string; onBack?: () => void; children: React.ReactNode }) {
  return (
    <div className="max-w-md mx-auto px-4 py-4">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm mb-5" style={{ color: 'var(--muted)' }}>
          <ArrowLeft className="size-4" /> Back
        </button>
      )}
      <h2 className="text-xl font-bold mb-4 display" style={{ color: 'var(--ink)' }}>{title}</h2>
      {children}
    </div>
  )
}


export function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl p-4" style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}>{children}</div>
}

export function Notice({ tone, children }: { tone: 'warn' | 'error' | 'info'; children: React.ReactNode }) {
  const c = tone === 'error'
    ? { bg: 'rgba(186,43,76,0.06)', border: 'rgba(186,43,76,0.15)', fg: 'var(--danger)' }
    : tone === 'warn'
      ? { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', fg: 'var(--warn-ink)' }
      : { bg: 'rgba(29,78,216,0.06)', border: 'rgba(29,78,216,0.15)', fg: 'var(--ink)' }
  return (
    <div className="rounded-xl px-3 py-2.5 mb-4 flex items-start gap-2 text-xs" style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.fg }}>
      <AlertCircle className="size-4 shrink-0 mt-0.5" /> <div>{children}</div>
    </div>
  )
}


export function MoneyInput({ value, onChange, prefix, placeholder, invalid }: {
  value: string; onChange: (v: string) => void; prefix: string; placeholder: string; invalid?: boolean
}) {
  return (
    <input type="text" inputMode="decimal" value={value ? `${prefix}${value}` : ''} placeholder={placeholder}
      onChange={e => {
        const v = e.target.value.replace(/[^0-9.]/g, '')
        if (/^\d*\.?\d{0,2}$/.test(v) || (!prefix && /^\d*\.?\d{0,6}$/.test(v))) onChange(v)
      }}
      className="w-full rounded-2xl px-4 py-4 font-black outline-none text-center"
      style={{ ...inputStyle, border: `1.5px solid ${invalid ? 'var(--danger)' : 'var(--border)'}`, fontSize: 'max(16px, 1.5rem)' }} />
  )
}

export function PrimaryButton({ onClick, disabled, busy, children, className = '' }: {
  onClick: () => void; disabled?: boolean; busy?: boolean; children: React.ReactNode; className?: string
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 transition-all active:scale-[0.98] ${className}`}
      style={{ background: 'var(--accent)' }}>
      {busy && <Loader2 className="size-4 animate-spin" />}{children}
    </button>
  )
}

