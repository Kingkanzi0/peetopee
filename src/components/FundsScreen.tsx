/**
 * FundsScreen — your money at a glance.
 *
 *   Funds balance  — USDC in your trading account. Selling in the Market uses this.
 *   Wallet balance — USDC in your main wallet (where Peetopee ID payments arrive).
 *
 * Both are shown in USDC and in the currency of the country you're visiting.
 * To sell, move USDC Wallet → Funds first.
 */
import { useState } from 'react'
import type { Address } from 'viem'
import {
  ArrowDownToLine, ArrowUpFromLine, Loader2, MapPin, ShoppingBag, Wallet2, Briefcase, X, CheckCircle2,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { COUNTRIES, getCountryByCode, type CountryDef } from '../contracts/peetopee'
import {
  useAppWallet, useUsdcBalance, maxSendable, sendUsdcOnArc, waitForArcTx, friendlyTxError, GAS_RESERVE_USDC,
} from '../wallet/appWallet'
import { recordTx, updateTxStatus } from '../history/txHistory'
import { TransactionHistory } from './TransactionHistory'
import { useNairaConfig, useNairaBalance, formatNaira } from '../naira/nairaToken'

export { useVisitingCountry } from '../hooks/useMoney'
import { useVisitingCountry, useMoney } from '../hooks/useMoney'

function formatLocal(amount: number, c: CountryDef) {
  const digits = amount >= 1000 ? 0 : 2
  return `${c.currencySymbol}${amount.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

interface Props {
  onSell: (country: CountryDef) => void
  onOpenWallet: () => void
  /** Open the naira account (shown when it's switched on). */
  onOpenNaira?: () => void
}

export function FundsScreen({ onSell, onOpenWallet, onOpenNaira }: Props) {
  const { profile } = useAuth()
  const { wallet, unlocked } = useAppWallet()
  const [visiting, setVisiting] = useVisitingCountry()
  const money = useMoney()
  const { rate, rateSource: source } = money
  const funds = useUsdcBalance(wallet?.fundsAddress)
  const main = useUsdcBalance(wallet?.address)
  const nairaCfg = useNairaConfig()
  const naira = useNairaBalance(wallet?.address)
  const [move, setMove] = useState<'to_funds' | 'from_funds' | null>(null)

  if (!wallet) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8 text-center">
        <Wallet2 className="size-10 mx-auto mb-3 opacity-40" style={{ color: 'var(--ink)' }} />
        <h1 className="text-xl font-bold mb-1 display" style={{ color: 'var(--ink)' }}>Set up your wallet</h1>
        <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>Create or import a Peetopee wallet to hold USDC and trade.</p>
        <button onClick={onOpenWallet} className="rounded-2xl py-3.5 px-8 text-sm font-bold text-white" style={{ background: 'var(--accent)' }}>
          Go to Wallet
        </button>
      </div>
    )
  }


  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <h1 className="text-xl font-bold display" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Funds</h1>
          {profile?.ptpId && <div className="text-xs mt-0.5 font-mono" style={{ color: 'var(--muted)' }}>{profile.ptpId}</div>}
        </div>
        <label className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}>
          <MapPin className="size-3.5" style={{ color: 'var(--accent)' }} />
          <span className="sr-only">Country you're in</span>
          <select
            value={visiting?.code ?? ''}
            onChange={e => { const c = getCountryByCode(e.target.value); if (c) setVisiting(c) }}
            className="bg-transparent outline-none"
            style={{ fontSize: 16, maxWidth: 140 }}
          >
            {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
          </select>
        </label>
      </div>

      {/* Funds (trading) card */}
      <div className="rounded-2xl p-5 mb-3" style={{ background: 'linear-gradient(135deg, #0f2557 0%, #1d4ed8 100%)' }}>
        <div className="flex items-center gap-2 mb-1">
          <Briefcase className="size-4 text-white/60" />
          <span className="text-xs text-white/70 font-medium">Funds balance · used for selling</span>
        </div>
        <button onClick={money.toggle} className="text-left">
          <div className="text-3xl font-bold text-white tabular-nums">
            {funds.balance == null ? '—' : money.primary(funds.balance)}
          </div>
          <div className="text-sm text-white/70 mt-0.5 tabular-nums">
            {funds.balance == null ? '' : money.secondary(funds.balance)}
          </div>
        </button>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button onClick={() => setMove('to_funds')} disabled={!unlocked}
            className="rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
            style={{ background: 'white', color: '#0f2557' }}>
            <ArrowDownToLine className="size-4" /> Add to Funds
          </button>
          <button onClick={() => visiting && onSell(visiting)} disabled={!visiting}
            className="rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}>
            <ShoppingBag className="size-4" /> Sell for {visiting?.currency}
          </button>
        </div>
      </div>

      {/* Naira account */}
      {nairaCfg.address && onOpenNaira && (
        <button onClick={onOpenNaira} className="w-full text-left rounded-2xl p-4 mb-3 flex items-center gap-3"
          style={{ background: 'linear-gradient(135deg, #064e3b 0%, #059669 100%)' }}>
          <div className="size-10 rounded-xl flex items-center justify-center shrink-0 text-white font-black" style={{ background: 'rgba(255,255,255,0.15)' }}>₦</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-white/70">Naira account</div>
            <div className="text-base font-bold tabular-nums text-white">{naira.balance == null ? '—' : formatNaira(naira.balance, { decimals: true })}</div>
          </div>
          <span className="text-xs font-semibold rounded-xl px-3 py-2 text-white" style={{ background: 'rgba(255,255,255,0.15)' }}>Open</span>
        </button>
      )}

      {/* Wallet card */}
      <div className="rounded-2xl p-4 mb-5 flex items-center gap-3" style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}>
        <div className="size-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(29,78,216,0.1)' }}>
          <Wallet2 className="size-5 text-blue-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs" style={{ color: 'var(--muted)' }}>Wallet balance</div>
          <div className="text-base font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
            {main.balance == null ? '—' : money.primary(main.balance)}
            <span className="text-xs font-medium ml-1.5" style={{ color: 'var(--muted)' }}>{main.balance == null ? '' : money.secondary(main.balance)}</span>
          </div>
        </div>
        <button onClick={() => setMove('from_funds')} disabled={!unlocked || !funds.balance}
          className="text-xs font-semibold rounded-xl px-3 py-2 flex items-center gap-1 disabled:opacity-40"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}>
          <ArrowUpFromLine className="size-3.5" /> From Funds
        </button>
      </div>

      {rate != null && visiting && visiting.currency !== 'USD' && (
        <p className="text-xs -mt-3 mb-5 px-1" style={{ color: 'var(--subtle)' }}>
          1 USDC ≈ {formatLocal(rate, visiting)} · {source === 'live' ? 'live rate' : 'approximate rate'}. Traders set their own rates.
        </p>
      )}

      <TransactionHistory />

      {move && (
        <MoveSheet
          direction={move}
          walletAddress={wallet.address}
          fundsAddress={wallet.fundsAddress}
          available={move === 'to_funds' ? main.balance : funds.balance}
          onClose={() => setMove(null)}
          onDone={() => { funds.refresh(); main.refresh() }}
        />
      )}
    </div>
  )
}

function MoveSheet({ direction, walletAddress, fundsAddress, available, onClose, onDone }: {
  direction: 'to_funds' | 'from_funds'
  walletAddress: Address
  fundsAddress: Address
  available: number | null
  onClose: () => void
  onDone: () => void
}) {
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const amountNum = parseFloat(amount) || 0
  const max = maxSendable(available)
  const toFunds = direction === 'to_funds'

  async function submit() {
    if (amountNum <= 0 || amountNum > max) return
    setBusy(true)
    setErr('')
    let hash: `0x${string}` | null = null
    try {
      const sent = await sendUsdcOnArc(toFunds ? 'wallet' : 'funds', toFunds ? fundsAddress : walletAddress, amountNum.toFixed(6))
      hash = sent
      recordTx({ hash: sent, chainId: 5042002, kind: direction, amount: String(amountNum), counterparty: toFunds ? 'Funds' : 'Wallet' })
      await waitForArcTx(sent)
      updateTxStatus(sent, 'confirmed')
      setDone(true)
      onDone()
    } catch (e) {
      if (hash) updateTxStatus(hash, 'failed')
      setErr(friendlyTxError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={busy ? undefined : onClose}>
      <div className="rounded-t-3xl p-6 space-y-4 max-w-lg w-full mx-auto" style={{ background: 'var(--bg, white)', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold display" style={{ color: 'var(--ink)' }}>{toFunds ? 'Add to Funds' : 'Move to Wallet'}</h2>
          <button onClick={onClose} disabled={busy} className="rounded-full p-1.5" style={{ background: 'var(--surface-muted)' }} aria-label="Close">
            <X className="size-5" style={{ color: 'var(--ink)' }} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <CheckCircle2 className="size-12 mx-auto mb-3 text-green-500" />
            <p className="font-semibold" style={{ color: 'var(--ink)' }}>
              {amountNum} USDC moved to {toFunds ? 'Funds' : 'Wallet'}
            </p>
            <button onClick={onClose} className="mt-5 rounded-2xl py-3 px-8 text-sm font-bold text-white" style={{ background: 'var(--accent)' }}>Done</button>
          </div>
        ) : (
          <>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {toFunds
                ? 'Move USDC from your Wallet into Funds so you can sell it in the Market.'
                : 'Move USDC from Funds back to your Wallet.'}
            </p>
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-xs font-semibold" style={{ color: 'var(--subtle)' }}>AMOUNT (USDC)</label>
                <button className="text-xs font-semibold" style={{ color: 'var(--accent)' }} onClick={() => setAmount(String(max))}>
                  Available {available == null ? '…' : available.toFixed(2)} · Max
                </button>
              </div>
              <input
                inputMode="decimal" placeholder="0.00" value={amount} autoFocus
                onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); if (/^\d*\.?\d{0,6}$/.test(v)) setAmount(v) }}
                className="w-full rounded-2xl px-4 py-4 font-black outline-none text-center"
                style={{ background: 'var(--surface-muted)', border: `1.5px solid ${amountNum > max ? 'var(--danger)' : 'var(--border)'}`, color: 'var(--ink)', fontSize: 24 }}
              />
              {amountNum > max && (
                <p className="text-xs mt-1.5 text-center" style={{ color: 'var(--danger)' }}>
                  Max {max} USDC — we keep {GAS_RESERVE_USDC} USDC for the network fee.
                </p>
              )}
            </div>
            {err && <p className="text-xs text-center" style={{ color: 'var(--danger)' }}>{err}</p>}
            <button onClick={() => { void submit() }} disabled={busy || amountNum <= 0 || amountNum > max}
              className="w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ background: 'var(--accent)' }}>
              {busy ? <><Loader2 className="size-4 animate-spin" /> Moving…</> : `Move ${amountNum || ''} USDC`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
