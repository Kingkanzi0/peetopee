import { useState } from 'react'
import { useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { Loader2, Plus, Settings, Package, CheckCircle2, Wallet2 } from 'lucide-react'
import {
  PEETOPEE_ESCROW,
  ARC_TESTNET_CHAIN_ID,
  TraderProfile,
  COUNTRIES,
  TradeStatus as TS,
  TRADE_STATUS_LABELS,
  Trade,
} from '../contracts/peetopee'
import { Amount, usdcDecimalsFor } from '../onchain-money'
import { friendlyTxError } from '../wallet/appWallet'
import { KycGate } from './KycFlow'

interface Props {
  onTradeClick: (tradeId: bigint) => void
  openRegister?: boolean
  onRegisterOpened?: () => void
  onOpenWallet: () => void
}

export function TraderDashboard({ onTradeClick, openRegister, onRegisterOpened, onOpenWallet }: Props) {
  const { address } = useAccount() // your Funds account (built-in wallet)

  const [_tab, setTab] = useState<'orders' | 'register'>('orders')
  // If parent requests register view, honour it; otherwise use local state
  const tab: 'orders' | 'register' = openRegister ? 'register' : _tab

  function handleTabChange(next: 'orders' | 'register') {
    setTab(next)
    if (next === 'register') onRegisterOpened?.()
  }

  // Fetch existing profile
  const { data: rawProfile, refetch: refetchProfile } = useReadContract({
    ...PEETOPEE_ESCROW,
    functionName: 'getTraderProfile',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address },
  })

  const profile = rawProfile as TraderProfile | undefined
  const isRegistered = profile && profile.traderAddr !== '0x0000000000000000000000000000000000000000'

  // Fetch trader's trades
  const { data: rawTradeIds } = useReadContract({
    ...PEETOPEE_ESCROW,
    functionName: 'getTradesByTrader',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address && !!isRegistered, refetchInterval: 8000 },
  })

  const tradeIds = (rawTradeIds as bigint[] | undefined) ?? []

  if (!address) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Wallet2 className="size-10 mx-auto mb-3 opacity-40" style={{ color: 'var(--ink)' }} />
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Set up your Peetopee wallet to become a trader.</p>
        <button onClick={onOpenWallet} className="rounded-2xl py-3 px-6 text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>
          Go to Wallet
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <h2 className="display mb-4 text-2xl font-bold" style={{ color: 'var(--ink)' }}>Trader Dashboard</h2>

      {/* Tabs */}
      <div className="flex rounded-xl p-1 mb-6" style={{ background: 'var(--surface-muted)' }}>
        {(['orders', 'register'] as const).map(t => (
          <button
            key={t}
            onClick={() => handleTabChange(t)}
            className="flex-1 rounded-lg py-2 text-sm font-semibold transition-all"
            style={{
              background: tab === t ? 'white' : 'transparent',
              color: tab === t ? 'var(--ink)' : 'var(--muted)',
              boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {t === 'orders' ? 'Incoming Orders' : isRegistered ? 'Profile' : 'Register'}
          </button>
        ))}
      </div>

      {tab === 'orders' && (
        <div>
          {!isRegistered && (
            <div className="rounded-2xl p-6 text-center" style={{ background: 'var(--surface-muted)' }}>
              <Package className="mx-auto mb-2 size-10" style={{ color: 'var(--subtle)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>You're not registered as a trader yet.</p>
              <button
                onClick={() => handleTabChange('register')}
                className="mt-3 text-sm font-semibold"
                style={{ color: 'var(--accent-hover)' }}
              >
                Register now
              </button>
            </div>
          )}

          {isRegistered && tradeIds.length === 0 && (
            <div className="rounded-2xl p-6 text-center" style={{ background: 'var(--surface-muted)' }}>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>No orders yet. Orders will appear here when sellers choose you.</p>
            </div>
          )}

          <div className="space-y-3">
            {tradeIds.map(id => (
              <TradeRow key={id.toString()} tradeId={id} onClick={() => onTradeClick(id)} />
            ))}
          </div>
        </div>
      )}

      {tab === 'register' && (
        <KycGate reason="To trade P2P you need a verified ID, so sellers know they're dealing with a real, accountable person.">
          <RegisterForm
            existing={isRegistered ? (profile) : undefined}
            onSuccess={() => { void refetchProfile(); setTab('orders') }}
          />
        </KycGate>
      )}
    </div>
  )
}

function TradeRow({ tradeId, onClick }: { tradeId: bigint; onClick: () => void }) {
  const { data: rawTrade } = useReadContract({
    ...PEETOPEE_ESCROW,
    functionName: 'getTrade',
    args: [tradeId],
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { refetchInterval: 8000 },
  })

  const trade = rawTrade as Trade | undefined
  if (!trade) return null

  const status = trade.status
  const usdcFmt = Amount.fromRaw(trade.usdcAmount, usdcDecimalsFor(ARC_TESTNET_CHAIN_ID)).toFixed(2)
  const needsAction = status === TS.Created

  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl p-4 text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
      style={{ background: 'var(--surface-strong)', border: `1px solid ${needsAction ? 'var(--accent-hover)' : 'var(--border)'}` }}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Trade #{tradeId.toString()}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Seller: {trade.seller.slice(0, 6)}...{trade.seller.slice(-4)}
          </div>
        </div>
        <div className="text-right">
          <div className="mono text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{usdcFmt} USDC</div>
          <span
            className="text-xs rounded-lg px-2 py-0.5"
            style={{
              background: needsAction ? 'rgba(16,97,166,0.1)' : 'var(--surface-muted)',
              color: needsAction ? 'var(--accent-hover)' : 'var(--muted)',
            }}
          >
            {TRADE_STATUS_LABELS[status]}
          </span>
        </div>
      </div>
      {needsAction && (
        <div className="mt-2 text-xs font-medium" style={{ color: 'var(--accent-hover)' }}>
          Action required: send {(Number(trade.localAmount) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} local currency to the seller
        </div>
      )}
    </button>
  )
}

interface RegisterFormProps {
  existing?: TraderProfile
  onSuccess: () => void
}

function RegisterForm({ existing, onSuccess }: RegisterFormProps) {
  const [country, setCountry] = useState(existing?.countryCode ?? '')
  const [currency, setCurrency] = useState(existing?.currencyCode ?? '')
  const [rate, setRate] = useState(existing ? (Number(existing.exchangeRate) / 1_000_000).toString() : '')
  const [minOrder, setMinOrder] = useState(existing ? (Number(existing.minOrderUsdc) / 1_000_000).toFixed(0) : '50')
  const [maxOrder, setMaxOrder] = useState(existing ? (Number(existing.maxOrderUsdc) / 1_000_000).toFixed(0) : '1000')
  const [paymentMethods, setPaymentMethods] = useState(existing?.paymentMethods ?? '')

  const rateScaled = rate ? BigInt(Math.round(parseFloat(rate) * 1_000_000)) : 0n
  const minScaled = minOrder ? BigInt(Math.round(parseFloat(minOrder) * 1_000_000)) : 0n
  const maxScaled = maxOrder ? BigInt(Math.round(parseFloat(maxOrder) * 1_000_000)) : 0n

  const valid = country && currency && rateScaled > 0n && minScaled > 0n && maxScaled >= minScaled && paymentMethods.trim()

  const fn = existing ? 'updateTraderProfile' : 'registerTrader'

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => { if (isSuccess) onSuccess() }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleCountrySelect(code: string) {
    setCountry(code)
    const c = COUNTRIES.find(x => x.code === code)
    if (c) setCurrency(c.currency)
  }

  function submit() {
    writeContract({
      ...PEETOPEE_ESCROW,
      functionName: fn,
      args: [country, currency, rateScaled, minScaled, maxScaled, paymentMethods],
    })
  }

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
        {existing ? 'Update your profile' : 'Register as a trader'}
      </h3>

      {/* Country */}
      <Field label="Country">
        <select
          value={country}
          onChange={e => handleCountrySelect(e.target.value)}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
        >
          <option value="">Select country...</option>
          {COUNTRIES.map(c => (
            <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
          ))}
        </select>
      </Field>

      {/* Currency */}
      <Field label="Currency code (ISO 4217)">
        <input
          value={currency}
          onChange={e => setCurrency(e.target.value.toUpperCase())}
          placeholder="e.g. NGN, EUR, VND"
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
        />
      </Field>

      {/* Rate */}
      <Field label="Exchange rate (local units per 1 USDC)">
        <input
          inputMode="decimal"
          value={rate}
          onChange={e => setRate(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="e.g. 1580 for NGN, 25500 for VND, 0.92 for EUR"
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
        />
      </Field>

      {/* Min/Max orders */}
      <div className="flex gap-3">
        <Field label="Min order (USDC)">
          <input
            inputMode="decimal"
            value={minOrder}
            onChange={e => setMinOrder(e.target.value.replace(/[^0-9]/g, ''))}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
          />
        </Field>
        <Field label="Max order (USDC)">
          <input
            inputMode="decimal"
            value={maxOrder}
            onChange={e => setMaxOrder(e.target.value.replace(/[^0-9]/g, ''))}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
          />
        </Field>
      </div>

      {/* Payment methods */}
      <Field label="Payment methods (comma-separated)">
        <input
          value={paymentMethods}
          onChange={e => setPaymentMethods(e.target.value)}
          placeholder="Bank Transfer,Mobile Money,Cash"
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
        />
      </Field>

      <button
        disabled={!valid || isPending || confirming}
        onClick={submit}
        className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40 transition-all hover:scale-[1.01] active:scale-[0.99]"
        style={{ background: 'var(--accent)' }}
      >
        {isPending || confirming ? <Loader2 className="size-4 animate-spin" /> : existing ? <Settings className="size-4" /> : <Plus className="size-4" />}
        {isPending ? 'Submitting…'
          : confirming ? 'Confirming…'
          : existing ? 'Update Profile' : 'Register as Trader'}
      </button>

      {writeError && !isPending && (
        <p className="text-xs text-center" style={{ color: 'var(--danger)' }}>{friendlyTxError(writeError)}</p>
      )}

      {isSuccess && (
        <div className="flex items-center gap-2 rounded-xl p-3" style={{ background: 'rgba(26,128,71,0.08)' }}>
          <CheckCircle2 className="size-4" style={{ color: 'var(--success)' }} />
          <span className="text-sm" style={{ color: 'var(--success)' }}>Profile saved!</span>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1">
      <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--muted)' }}>{label}</label>
      {children}
    </div>
  )
}
