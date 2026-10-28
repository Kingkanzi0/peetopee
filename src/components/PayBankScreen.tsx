/**
 * PayBankScreen — "Pay any bank account with USDC".
 *
 * The user picks a bank (e.g. OPay, UBA), enters the account and how much local
 * currency should arrive. We find the best rate among ID-verified traders in
 * that country, work out the USDC needed, then hand off to the escrow sell flow
 * (pre-filled) — the trader pays the bank account, the user confirms it arrived,
 * and only then is the USDC released.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import { formatUnits } from 'viem'
import { ArrowLeft, Building2, ChevronRight, Loader2, ShieldCheck, BadgePlus, Info } from 'lucide-react'
import {
  PEETOPEE_ESCROW, ARC_TESTNET_CHAIN_ID, COUNTRIES, getCountryByCode, formatRate,
  type CountryDef, type TraderProfile,
} from '../contracts/peetopee'
import { apiVerifiedAddresses } from '../auth/ptpApi'
import { bankRulesFor, formatBankDetails } from '../payments/banks'
import { SellFlow } from './SellFlow'

interface Props {
  initialCountry?: CountryDef
  onBack: () => void
  onTradeCreated: (tradeId: bigint) => void
  onAddFunds: () => void
  onRegisterTrader: () => void
}

const SCALE = 1_000_000n

/** Local amount string (e.g. "15000.50") → bigint scaled by 1e6. */
function parseLocal(v: string): bigint {
  if (!/^\d+(\.\d{0,6})?$/.test(v)) return 0n
  const [whole, frac = ''] = v.split('.')
  return BigInt(whole) * SCALE + BigInt(frac.padEnd(6, '0'))
}

/** USDC (6 decimals) needed so the trader pays at least `localScaled`, at `rate` (local per USDC, scaled 1e6). */
function usdcFor(localScaled: bigint, rate: bigint): bigint {
  if (rate <= 0n) return 0n
  return (localScaled * SCALE + rate - 1n) / rate // round up so the recipient never gets less
}

interface Quote { trader: TraderProfile; usdc: bigint }

export function PayBankScreen({ initialCountry, onBack, onTradeCreated, onAddFunds, onRegisterTrader }: Props) {
  const [country, setCountry] = useState<CountryDef>(initialCountry ?? getCountryByCode('NG')!)
  const rules = bankRulesFor(country.code)
  const [bank, setBank] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [note, setNote] = useState('')
  const [localAmount, setLocalAmount] = useState('')
  const [chosen, setChosen] = useState<string | null>(null) // trader address
  const [proceed, setProceed] = useState(false)

  // Traders in this country → their profiles → which are ID-verified.
  const { data: traderAddrs, isLoading: loadingList } = useReadContract({
    ...PEETOPEE_ESCROW,
    functionName: 'getTradersByCountry',
    args: [country.code],
    chainId: ARC_TESTNET_CHAIN_ID,
  })
  const addrs = (traderAddrs as string[] | undefined) ?? []
  const { data: profileResults, isLoading: loadingProfiles } = useReadContracts({
    contracts: addrs.map(a => ({
      ...PEETOPEE_ESCROW,
      functionName: 'getTraderProfile',
      args: [a as `0x${string}`],
      chainId: ARC_TESTNET_CHAIN_ID,
    })),
    query: { enabled: addrs.length > 0 },
  })
  const [verified, setVerified] = useState<Record<string, boolean> | null>(null)
  const addrKey = addrs.join(',')
  useEffect(() => {
    setVerified(null)
    if (!addrKey) { setVerified({}); return }
    let alive = true
    apiVerifiedAddresses(addrKey.split(','))
      .then(v => { if (alive) setVerified(v) })
      .catch(() => { if (alive) setVerified({}) })
    return () => { alive = false }
  }, [addrKey])

  const traders: TraderProfile[] = useMemo(() => (profileResults ?? [])
    .map(r => r.result as TraderProfile | undefined)
    .filter((p): p is TraderProfile => !!p && p.isActive && p.countryCode === country.code
      && !!verified?.[p.traderAddr.toLowerCase()]),
  [profileResults, verified, country.code])

  const localScaled = parseLocal(localAmount)
  const quotes: Quote[] = useMemo(() => traders
    .map(t => ({ trader: t, usdc: usdcFor(localScaled, t.exchangeRate) }))
    .filter(q => q.usdc > 0n && q.usdc >= q.trader.minOrderUsdc && q.usdc <= q.trader.maxOrderUsdc)
    .sort((a, b) => (a.usdc < b.usdc ? -1 : a.usdc > b.usdc ? 1 : 0)),
  [traders, localScaled])
  const selected = quotes.find(q => q.trader.traderAddr === chosen) ?? quotes[0]

  const accountOk = rules.accountPattern ? rules.accountPattern.test(accountNumber) : accountNumber.trim().length >= 5
  const formOk = bank.trim() && accountOk && accountName.trim().length >= 3 && localScaled > 0n
  const loading = loadingList || loadingProfiles || verified === null
  const input = 'w-full rounded-xl px-3 py-2.5 outline-none'
  const inputStyle = { background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 16 }

  if (proceed && selected) {
    return (
      <SellFlow
        country={country}
        trader={selected.trader}
        onBack={() => setProceed(false)}
        onTradeCreated={onTradeCreated}
        onAddFunds={onAddFunds}
        prefill={{
          amount: formatUnits(selected.usdc, 6),
          bankDetails: formatBankDetails({ bank, accountNumber, accountName, note }),
        }}
      />
    )
  }

  // Range of amounts traders accept, to explain why there may be no quote.
  const limits = traders.length
    ? {
        min: traders.reduce((m, t) => (t.minOrderUsdc < m ? t.minOrderUsdc : m), traders[0].minOrderUsdc),
        max: traders.reduce((m, t) => (t.maxOrderUsdc > m ? t.maxOrderUsdc : m), traders[0].maxOrderUsdc),
      }
    : null

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="size-4" /> Back
      </button>

      <div className="flex items-start gap-3 mb-5">
        <div className="size-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(5,150,105,0.1)' }}>
          <Building2 className="size-6 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold display" style={{ color: 'var(--ink)' }}>Pay a bank account</h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Pay {country.currency} into any {country.name} bank account with your USDC. A verified local trader sends the money; your USDC stays in escrow until it arrives.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <Field label="Country">
          <select value={country.code} className={input} style={inputStyle}
            onChange={e => { const c = getCountryByCode(e.target.value); if (c) { setCountry(c); setBank(''); setChosen(null) } }}>
            {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name} · {c.currency}</option>)}
          </select>
        </Field>

        <Field label="Bank">
          {rules.banks.length > 0 ? (
            <select value={bank} onChange={e => setBank(e.target.value)} className={input} style={inputStyle}>
              <option value="">Choose bank…</option>
              {rules.banks.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          ) : (
            <input value={bank} onChange={e => setBank(e.target.value)} placeholder="Bank name" className={input} style={inputStyle} />
          )}
        </Field>

        <Field label="Account number">
          <input value={accountNumber} inputMode={rules.accountPattern ? 'numeric' : 'text'} placeholder={rules.accountHint}
            onChange={e => setAccountNumber(rules.accountPattern ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value)}
            className={input} style={{ ...inputStyle, borderColor: accountNumber && !accountOk ? 'var(--danger)' : 'var(--border)' }} />
          {accountNumber && !accountOk && (
            <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>Enter a {rules.accountHint.toLowerCase()}.</p>
          )}
        </Field>

        <Field label="Account name">
          <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="Name on the account"
            className={input} style={inputStyle} autoCapitalize="words" />
          <p className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>The trader checks this name before sending, so make sure it matches the bank.</p>
        </Field>

        <Field label={`Amount they receive (${country.currency})`}>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold" style={{ color: 'var(--muted)' }}>{country.currencySymbol}</span>
            <input value={localAmount} inputMode="decimal" placeholder="0"
              onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); if (/^\d*\.?\d{0,2}$/.test(v)) setLocalAmount(v) }}
              className={`${input} pl-9 text-lg font-bold`} style={inputStyle} />
          </div>
        </Field>

        <Field label="Note for the recipient (optional)">
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={80} placeholder="e.g. Rent for November"
            className={input} style={inputStyle} />
        </Field>
      </div>

      {/* Quote */}
      <div className="mt-5">
        {loading ? (
          <div className="rounded-2xl p-4 flex items-center gap-2 text-sm" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
            <Loader2 className="size-4 animate-spin" /> Finding the best rate…
          </div>
        ) : traders.length === 0 ? (
          <div className="rounded-2xl p-5 text-center space-y-3" style={{ background: 'var(--surface-muted)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>No verified traders in {country.name} yet</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Payments need at least one ID-verified trader paying out {country.currency}.</p>
            <button onClick={onRegisterTrader} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>
              <BadgePlus className="size-4" /> Become a trader
            </button>
          </div>
        ) : localScaled === 0n ? null : quotes.length === 0 ? (
          <div className="rounded-2xl p-4 flex items-start gap-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <Info className="size-4 mt-0.5 shrink-0" style={{ color: '#d97706' }} />
            <p className="text-xs" style={{ color: '#92400e' }}>
              No trader can take this amount right now.
              {limits && ` Traders accept between ${formatUnits(limits.min, 6)} and ${formatUnits(limits.max, 6)} USDC per payment.`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
              {quotes.length > 1 ? 'Choose a trader (best rate first)' : 'Trader'}
            </div>
            {quotes.slice(0, 4).map((q, i) => {
              const isSel = q.trader.traderAddr === selected?.trader.traderAddr
              return (
                <button key={q.trader.traderAddr} onClick={() => setChosen(q.trader.traderAddr)}
                  className="w-full rounded-2xl p-4 text-left flex items-center gap-3 transition-all"
                  style={{ background: 'var(--surface-strong)', border: `1.5px solid ${isSel ? 'var(--accent)' : 'var(--border)'}` }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
                      {q.trader.traderAddr.slice(0, 6)}…{q.trader.traderAddr.slice(-4)}
                      <ShieldCheck className="size-3.5" style={{ color: 'var(--success)' }} />
                      {i === 0 && <span className="text-[10px] rounded px-1.5 py-0.5 font-bold" style={{ background: 'rgba(26,128,71,0.1)', color: 'var(--success)' }}>BEST RATE</span>}
                    </div>
                    <div className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                      {formatRate(q.trader.exchangeRate, q.trader.currencyCode)} per USDC · {q.trader.completedTrades.toString()} trades
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {Number(formatUnits(q.usdc, 6)).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--subtle)' }}>you pay</div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <button
        onClick={() => setProceed(true)}
        disabled={!formOk || !selected}
        className="mt-5 w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40"
        style={{ background: 'var(--accent)' }}
      >
        Continue <ChevronRight className="size-4" />
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--muted)' }}>{label}</label>
      {children}
    </div>
  )
}
