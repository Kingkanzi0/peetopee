/**
 * SendScreen — ways to send money.
 *
 *  - Send USDC to anyone by Peetopee ID (instant, on Arc)
 *  - Pay a local bank account (a shop, a friend, yourself): a verified local
 *    trader pays it in local currency and receives your USDC from escrow
 */
import { useState } from 'react'
import { Building2, ChevronRight, AtSign, Zap, Copy, Check } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { SendUsdcByPtpId } from './SendUsdcByPtpId'
import { TransactionHistory } from './TransactionHistory'

interface Props {
  /** Go to the Market's trader list to pay a bank account in local currency. */
  onPayBank: () => void
}

export function SendScreen({ onPayBank }: Props) {
  const { profile } = useAuth()
  const [mode, setMode] = useState<'choose' | 'usdc'>('choose')
  const [copied, setCopied] = useState(false)
  const myId = profile?.ptpId

  if (mode === 'usdc') return <SendUsdcByPtpId onBack={() => setMode('choose')} />

  function copyId() {
    if (!myId) return
    void navigator.clipboard.writeText(myId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold mb-0.5 display" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Send money</h1>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Choose how you want to send.</p>
      </div>

      {myId && (
        <button onClick={copyId}
          className="w-full text-left rounded-2xl px-4 py-3.5 mb-5 flex items-center gap-3"
          style={{ background: 'linear-gradient(135deg, #122d45 0%, #1a4d7a 100%)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="size-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.12)' }}>
            <AtSign className="size-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/50 font-semibold uppercase tracking-wide">Your Peetopee ID · share it to get paid</p>
            <p className="text-base font-black text-white truncate">{myId}</p>
          </div>
          {copied ? <Check className="size-4 text-green-300" /> : <Copy className="size-4 text-white/60" />}
        </button>
      )}

      <div className="space-y-3">
        <button
          onClick={() => setMode('usdc')}
          className="w-full rounded-2xl p-5 text-left flex items-center gap-4 transition-all active:scale-[0.99]"
          style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}
        >
          <div className="size-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(29,78,216,0.1)' }}>
            <Zap className="size-6 text-blue-700" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-sm mb-0.5" style={{ color: 'var(--ink)' }}>Send USDC by Peetopee ID</div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>Type a @handle or email. Arrives in seconds.</div>
          </div>
          <ChevronRight className="size-5 shrink-0" style={{ color: 'var(--subtle)' }} />
        </button>

        <button
          onClick={onPayBank}
          className="w-full rounded-2xl p-5 text-left flex items-center gap-4 transition-all active:scale-[0.99]"
          style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}
        >
          <div className="size-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(5,150,105,0.1)' }}>
            <Building2 className="size-6 text-emerald-600" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-sm mb-0.5" style={{ color: 'var(--ink)' }}>Pay a local bank account</div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              Pay a shop or person in their local currency. A verified local trader sends the money; your USDC stays in escrow until it arrives.
            </div>
          </div>
          <ChevronRight className="size-5 shrink-0" style={{ color: 'var(--subtle)' }} />
        </button>
      </div>

      <div className="mt-8">
        <TransactionHistory compact filter={e => e.kind === 'sent' || e.kind === 'received'} title="Recent transfers" />
      </div>
    </div>
  )
}
