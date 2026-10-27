import { useState } from 'react'
import { Building2, ChevronRight, ArrowLeft, User, CheckCircle2, AlertCircle, Search, AtSign, Zap } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { lookupByEmail, lookupByPtpId, getMyPtpId, type PtpIdRecord } from '../auth/peetopeeId'
import { SendUsdcByPtpId } from './SendUsdcByPtpId'
import { getBalance, debitBalance, creditBalance } from '../auth/localLedger'
import { COUNTRIES } from '../contracts/peetopee'
import { useLocalCurrency } from '../hooks/useLocalCurrency'
import { toast } from 'sonner'

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: '₦', VND: '₫', EUR: '€', USD: '$', GHS: '₵', KES: 'KSh', GBP: '£',
}

// Demo Nigerian banks — production uses a real bank-code API
const NG_BANKS = ['Access Bank', 'First Bank', 'GTBank', 'UBA', 'Zenith Bank', 'Opay', 'Palmpay', 'Kuda']
const VN_BANKS = ['VietcomBank', 'Techcombank', 'VPBank', 'BIDV', 'MoMo', 'ZaloPay']
const FR_BANKS = ['BNP Paribas', 'Société Générale', 'Crédit Agricole', 'Revolut', 'Wise']

function getBanks(countryCode: string): string[] {
  if (countryCode === 'NG') return NG_BANKS
  if (countryCode === 'VN') return VN_BANKS
  if (countryCode === 'FR') return FR_BANKS
  return []
}

type SendMode = 'choose' | 'ptpid' | 'bank' | 'usdc'
type Step = 'details' | 'confirm' | 'success'

function PtpIdSend() {
  const { profile } = useAuth()
  const [step, setStep] = useState<Step>('details')
  const [identifier, setIdentifier] = useState('')
  const [resolvedUser, setResolvedUser] = useState<PtpIdRecord | null>(null)
  const [resolveError, setResolveError] = useState('')
  const [currency, setCurrency] = useState(profile?.country?.currency ?? 'NGN')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const balance = getBalance(currency)
  const sym = CURRENCY_SYMBOLS[currency] ?? currency + ' '
  const amountNum = parseFloat(amount.replace(/,/g, '')) || 0

  function handleLookup() {
    setResolveError('')
    setResolvedUser(null)
    const trimmed = identifier.trim()
    let found: PtpIdRecord | null = null
    if (trimmed.includes('@') && !trimmed.startsWith('@')) {
      found = lookupByEmail(trimmed)
    } else {
      found = lookupByPtpId(trimmed)
    }
    if (!found) {
      setResolveError('No Peetopee user found with that email or ID.')
    } else {
      setResolvedUser(found)
    }
  }

  function handleConfirm() {
    setBusy(true)
    setTimeout(() => {
      if (amountNum <= 0 || amountNum > balance) {
        toast.error('Insufficient balance.')
        setBusy(false)
        return
      }
      debitBalance(currency, amountNum, `Sent to ${resolvedUser?.name ?? identifier}`, {
        type: 'send_internal',
        counterparty: identifier,
      })
      creditBalance(currency, amountNum, `Received from ${profile?.name ?? 'Peetopee user'}`, {
        type: 'p2p_credit',
        counterparty: profile?.email,
      })
      setBusy(false)
      setStep('success')
    }, 1000)
  }

  if (step === 'success') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <div className="size-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <CheckCircle2 className="size-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--ink)' }}>Sent!</h2>
        <p className="text-sm mb-1" style={{ color: 'var(--muted)' }}>
          {sym}{amountNum.toLocaleString()} sent to {resolvedUser?.name}
        </p>
        <p className="text-xs mb-6" style={{ color: 'var(--subtle)' }}>
          This was an internal Peetopee transfer.
        </p>
        <button
          onClick={() => { setStep('details'); setIdentifier(''); setResolvedUser(null); setAmount('') }}
          className="rounded-2xl py-3.5 px-8 text-sm font-bold text-white"
          style={{ background: 'var(--accent)' }}
        >
          Send again
        </button>
      </div>
    )
  }

  if (step === 'confirm') {
    return (
      <div className="max-w-md mx-auto px-4 py-6">
        <button onClick={() => setStep('details')} className="flex items-center gap-1.5 text-sm mb-6" style={{ color: 'var(--muted)' }}>
          <ArrowLeft className="size-4" /> Back
        </button>
        <h2 className="text-xl font-bold mb-5" style={{ color: 'var(--ink)', fontFamily: "'Space Grotesk', sans-serif" }}>Confirm payment</h2>

        <div className="rounded-2xl p-4 mb-4 space-y-3" style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--muted)' }}>Recipient</span>
            <span className="font-semibold" style={{ color: 'var(--ink)' }}>{resolvedUser?.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--muted)' }}>Peetopee ID</span>
            <span className="font-mono text-xs" style={{ color: 'var(--ink)' }}>{resolvedUser?.ptpId}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--muted)' }}>Amount</span>
            <span className="font-bold" style={{ color: 'var(--ink)' }}>{sym}{amountNum.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--muted)' }}>Fee</span>
            <span style={{ color: 'var(--ink)' }}>Free (internal transfer)</span>
          </div>
        </div>

        <p className="text-xs mb-5 px-1" style={{ color: 'var(--subtle)' }}>
          Internal transfers between Peetopee users are instant and free. Make sure the recipient is correct before confirming.
        </p>

        <button
          onClick={handleConfirm}
          disabled={busy}
          className="w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
        >
          {busy ? <div className="size-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> : <>Confirm & Send <ChevronRight className="size-4" /></>}
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto px-4 py-4">
      <h2 className="text-lg font-bold mb-5" style={{ color: 'var(--ink)', fontFamily: "'Space Grotesk', sans-serif" }}>Send to Peetopee user</h2>

      {/* Recipient lookup */}
      <div className="mb-4">
        <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--subtle)' }}>EMAIL OR PEETOPEE ID</label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="user@email.com or @handle1234"
            value={identifier}
            onChange={e => { setIdentifier(e.target.value); setResolvedUser(null); setResolveError('') }}
            className="flex-1 rounded-2xl px-4 py-3.5 text-sm outline-none"
            style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
          />
          <button
            onClick={handleLookup}
            disabled={!identifier.trim()}
            className="rounded-2xl px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            <Search className="size-4" />
          </button>
        </div>
        {resolveError && (
          <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: 'var(--danger)' }}>
            <AlertCircle className="size-3" /> {resolveError}
          </p>
        )}
        {resolvedUser && (
          <div className="mt-2 rounded-xl px-3 py-2.5 flex items-center gap-2" style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)' }}>
            <CheckCircle2 className="size-4 text-green-600 shrink-0" />
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{resolvedUser.name}</div>
              <div className="text-xs font-mono" style={{ color: 'var(--muted)' }}>{resolvedUser.ptpId}</div>
            </div>
          </div>
        )}
      </div>

      {/* Currency selector */}
      <div className="mb-4">
        <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--subtle)' }}>CURRENCY</label>
        <select
          value={currency}
          onChange={e => setCurrency(e.target.value)}
          className="w-full rounded-2xl px-4 py-3.5 text-sm outline-none"
          style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
        >
          {['NGN', 'VND', 'EUR'].map(c => (
            <option key={c} value={c}>{c} — Balance: {CURRENCY_SYMBOLS[c]}{getBalance(c).toLocaleString()}</option>
          ))}
        </select>
      </div>

      {/* Amount */}
      <div className="mb-6">
        <div className="flex justify-between mb-1.5">
          <label className="text-xs font-semibold" style={{ color: 'var(--subtle)' }}>AMOUNT</label>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>Available: {sym}{balance.toLocaleString()}</span>
        </div>
        <input
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="w-full rounded-2xl px-4 py-3.5 text-sm outline-none"
          style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
        />
      </div>

      <button
        onClick={() => setStep('confirm')}
        disabled={!resolvedUser || amountNum <= 0 || amountNum > balance}
        className="w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40"
        style={{ background: 'var(--accent)' }}
      >
        Review transfer <ChevronRight className="size-4" />
      </button>
    </div>
  )
}

function BankSend() {
  const { profile } = useAuth()
  const [step, setStep] = useState<Step>('details')
  const [countryCode, setCountryCode] = useState(profile?.country?.code ?? 'NG')
  const country = COUNTRIES.find(c => c.code === countryCode) ?? COUNTRIES[0]
  const { rate } = useLocalCurrency(country.currency)
  const sym = CURRENCY_SYMBOLS[country.currency] ?? country.currency + ' '
  const balance = getBalance(country.currency)
  const banks = getBanks(countryCode)
  const [bank, setBank] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const amountNum = parseFloat(amount.replace(/,/g, '')) || 0
  const fee = Math.round(amountNum * 0.01)
  const recipientGets = amountNum - fee
  const usdcEquiv = rate ? (amountNum / rate).toFixed(2) : null

  function handleVerifyAccount() {
    if (!accountNumber || accountNumber.length < 6) return
    setBusy(true)
    setTimeout(() => {
      setAccountName('Demo Account Name [Placeholder]')
      setBusy(false)
    }, 800)
  }

  function handleSend() {
    setBusy(true)
    setTimeout(() => {
      const result = debitBalance(country.currency, amountNum, `Bank transfer to ${accountName || accountNumber} — ${bank}`, {
        type: 'send_bank',
        counterparty: accountNumber,
      })
      setBusy(false)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setStep('success')
    }, 1200)
  }

  if (step === 'success') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <div className="size-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <CheckCircle2 className="size-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--ink)' }}>Transfer initiated</h2>
        <p className="text-sm mb-1" style={{ color: 'var(--muted)' }}>
          {sym}{amountNum.toLocaleString()} to {accountName || accountNumber}
        </p>
        <p className="text-xs mb-2" style={{ color: 'var(--subtle)' }}>Processing via {bank}. May take up to 24 hours.</p>
        <div
          className="rounded-xl px-4 py-3 mb-6 text-xs text-center"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#92400e' }}
        >
          Note: Bank payouts require a real payment provider integration. This is a demo placeholder.
        </div>
        <button
          onClick={() => { setStep('details'); setAmount(''); setAccountNumber(''); setAccountName('') }}
          className="rounded-2xl py-3.5 px-8 text-sm font-bold text-white"
          style={{ background: 'var(--accent)' }}
        >
          Send again
        </button>
      </div>
    )
  }

  if (step === 'confirm') {
    return (
      <div className="max-w-md mx-auto px-4 py-6">
        <button onClick={() => setStep('details')} className="flex items-center gap-1.5 text-sm mb-6" style={{ color: 'var(--muted)' }}>
          <ArrowLeft className="size-4" /> Back
        </button>
        <h2 className="text-xl font-bold mb-5" style={{ color: 'var(--ink)', fontFamily: "'Space Grotesk', sans-serif" }}>Confirm bank transfer</h2>
        <div className="rounded-2xl p-4 mb-4 space-y-3" style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}>
          <div className="flex justify-between text-sm"><span style={{ color: 'var(--muted)' }}>Bank</span><span className="font-semibold" style={{ color: 'var(--ink)' }}>{bank}</span></div>
          <div className="flex justify-between text-sm"><span style={{ color: 'var(--muted)' }}>Account number</span><span className="font-mono" style={{ color: 'var(--ink)' }}>{accountNumber}</span></div>
          <div className="flex justify-between text-sm"><span style={{ color: 'var(--muted)' }}>Account name</span><span style={{ color: 'var(--ink)' }}>{accountName || '—'}</span></div>
          <div className="flex justify-between text-sm"><span style={{ color: 'var(--muted)' }}>Amount</span><span className="font-bold" style={{ color: 'var(--ink)' }}>{sym}{amountNum.toLocaleString()}</span></div>
          <div className="flex justify-between text-sm"><span style={{ color: 'var(--muted)' }}>Fee (1%)</span><span style={{ color: 'var(--ink)' }}>{sym}{fee.toLocaleString()}</span></div>
          <div className="flex justify-between text-sm font-bold border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            <span style={{ color: 'var(--ink)' }}>Recipient gets</span><span style={{ color: 'var(--accent)' }}>{sym}{recipientGets.toLocaleString()}</span>
          </div>
        </div>
        <button
          onClick={handleSend}
          disabled={busy}
          className="w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
        >
          {busy ? <div className="size-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> : <>Confirm transfer <ChevronRight className="size-4" /></>}
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto px-4 py-4">
      <h2 className="text-lg font-bold mb-5" style={{ color: 'var(--ink)', fontFamily: "'Space Grotesk', sans-serif" }}>Send to bank account</h2>

      {/* Country */}
      <div className="mb-4">
        <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--subtle)' }}>COUNTRY</label>
        <select
          value={countryCode}
          onChange={e => { setCountryCode(e.target.value); setBank(''); setAccountName('') }}
          className="w-full rounded-2xl px-4 py-3.5 text-sm outline-none"
          style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
        >
          {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name} — {c.currency}</option>)}
        </select>
      </div>

      {/* Bank */}
      <div className="mb-4">
        <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--subtle)' }}>BANK</label>
        <select
          value={bank}
          onChange={e => setBank(e.target.value)}
          className="w-full rounded-2xl px-4 py-3.5 text-sm outline-none"
          style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
        >
          <option value="">Select bank...</option>
          {banks.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {/* Account number */}
      <div className="mb-4">
        <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--subtle)' }}>ACCOUNT NUMBER</label>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            placeholder="e.g. 0123456789"
            value={accountNumber}
            onChange={e => { setAccountNumber(e.target.value); setAccountName('') }}
            className="flex-1 rounded-2xl px-4 py-3.5 text-sm outline-none"
            style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
          />
          <button
            onClick={handleVerifyAccount}
            disabled={accountNumber.length < 6 || busy}
            className="rounded-2xl px-4 text-xs font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {busy ? <div className="size-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> : 'Verify'}
          </button>
        </div>
        {accountName && (
          <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: 'var(--success)' }}>
            <CheckCircle2 className="size-3" /> {accountName}
          </div>
        )}
      </div>

      {/* Amount */}
      <div className="mb-6">
        <div className="flex justify-between mb-1.5">
          <label className="text-xs font-semibold" style={{ color: 'var(--subtle)' }}>AMOUNT ({country.currency})</label>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>Balance: {sym}{balance.toLocaleString()}</span>
        </div>
        <input
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="w-full rounded-2xl px-4 py-3.5 text-sm outline-none"
          style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
        />
        {usdcEquiv && amountNum > 0 && (
          <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>≈ {usdcEquiv} USDC at current rate</p>
        )}
      </div>

      <button
        onClick={() => setStep('confirm')}
        disabled={!bank || !accountNumber || amountNum <= 0 || amountNum > balance}
        className="w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40"
        style={{ background: 'var(--accent)' }}
      >
        Review transfer <ChevronRight className="size-4" />
      </button>
    </div>
  )
}

export function SendScreen() {
  const { profile } = useAuth()
  const [mode, setMode] = useState<SendMode>('choose')
  const myId = getMyPtpId() ?? (profile ? lookupByEmail(profile.email || profile.phone || '')?.ptpId : null) ?? null

  if (mode === 'usdc') {
    return <SendUsdcByPtpId onBack={() => setMode('choose')} />
  }

  if (mode === 'ptpid') {
    return (
      <div className="max-w-lg mx-auto pt-4">
        <div className="px-4 mb-2">
          <button onClick={() => setMode('choose')} className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
            <ArrowLeft className="size-4" /> Back
          </button>
        </div>
        <PtpIdSend />
      </div>
    )
  }

  if (mode === 'bank') {
    return (
      <div className="max-w-lg mx-auto pt-4">
        <div className="px-4 mb-2">
          <button onClick={() => setMode('choose')} className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
            <ArrowLeft className="size-4" /> Back
          </button>
        </div>
        <BankSend />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold mb-0.5" style={{ color: 'var(--ink)', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}>Send Money</h1>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Choose how you want to send.</p>
      </div>

      {/* Your Peetopee ID pill */}
      {myId && (
        <div
          className="rounded-2xl px-4 py-3.5 mb-5 flex items-center gap-3"
          style={{ background: 'linear-gradient(135deg, #122d45 0%, #1a4d7a 100%)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="size-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.12)' }}>
            <AtSign className="size-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/50 font-semibold uppercase tracking-wide">Your Peetopee ID</p>
            <p className="text-base font-black text-white truncate">{myId}</p>
          </div>
          <span className="text-xs px-2 py-1 rounded-full font-semibold shrink-0" style={{ background: 'rgba(74,222,128,0.18)', color: '#4ade80' }}>Active</span>
        </div>
      )}

      <div className="space-y-3">
        {/* USDC onchain send — primary/hero option */}
        <button
          onClick={() => setMode('usdc')}
          className="w-full rounded-2xl p-5 text-left flex items-center gap-4 transition-all active:scale-[0.99]"
          style={{ background: 'linear-gradient(135deg, #122d45 0%, #1a4d7a 100%)', border: '1.5px solid rgba(255,255,255,0.08)' }}
        >
          <div className="size-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.12)' }}>
            <Zap className="size-6 text-white" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-sm mb-0.5 text-white">Send USDC by Peetopee ID</div>
            <div className="text-xs text-white/60">Send USDC onchain using only a @handle — no wallet address needed. Pick the chain and token.</div>
          </div>
          <ChevronRight className="size-5 shrink-0 text-white/40" />
        </button>

        <button
          onClick={() => setMode('ptpid')}
          className="w-full rounded-2xl p-5 text-left flex items-center gap-4 transition-all active:scale-[0.99]"
          style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}
        >
          <div className="size-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(29,78,216,0.1)' }}>
            <User className="size-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-sm mb-0.5" style={{ color: 'var(--ink)' }}>Send local currency</div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>Send NGN/EUR/VND from your local wallet to another Peetopee account. Free, instant.</div>
          </div>
          <ChevronRight className="size-5 shrink-0" style={{ color: 'var(--subtle)' }} />
        </button>

        <button
          onClick={() => setMode('bank')}
          className="w-full rounded-2xl p-5 text-left flex items-center gap-4 transition-all active:scale-[0.99]"
          style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}
        >
          <div className="size-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(5,150,105,0.1)' }}>
            <Building2 className="size-6 text-emerald-600" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-sm mb-0.5" style={{ color: 'var(--ink)' }}>Local bank account</div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>Transfer your local currency balance to a supported bank account. 1% fee.</div>
          </div>
          <ChevronRight className="size-5 shrink-0" style={{ color: 'var(--subtle)' }} />
        </button>

        <div
          className="rounded-2xl px-4 py-3.5 text-xs"
          style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', color: '#92400e' }}
        >
          <span className="font-semibold">Note:</span> To send local currency you must first have a balance from a completed P2P trade. Go to the <span className="font-semibold">Market</span> tab to exchange USDC.
        </div>
      </div>
    </div>
  )
}
