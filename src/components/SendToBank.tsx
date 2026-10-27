/**
 * SendToBank — lets a user send local currency to a local bank account.
 *
 * Flow:
 * 1. User enters the local currency amount they want the recipient to get
 * 2. System shows the USDC equivalent they need to lock
 * 3. User enters recipient bank details (bank name, account number, account name)
 * 4. On confirm, routes to the P2P escrow: finds a trader in that country,
 *    locks USDC in escrow, and the trader sends fiat to the bank account.
 *
 * This bridges the "send cash to a bank account" use case over the escrow rails.
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Building2, Hash, User, ChevronRight, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useLocalCurrency } from '../hooks/useLocalCurrency'
import { COUNTRIES } from '../contracts/peetopee'
import type { CountryDef } from '../contracts/peetopee'

interface Props {
  onBack: () => void
  onRouteToEscrow: (params: {
    country: CountryDef
    usdcAmount: number
    localAmount: number
    bankDetails: BankDetails
  }) => void
}

export interface BankDetails {
  bankName: string
  accountNumber: string
  accountName: string
  countryCode: string
}

type Step = 'amount' | 'bank' | 'review'

const BANK_SUGGESTIONS: Record<string, string[]> = {
  NG: ['Access Bank', 'GTBank', 'First Bank', 'Zenith Bank', 'UBA', 'Fidelity Bank', 'Opay', 'Palmpay', 'Kuda Bank'],
  VN: ['Vietcombank', 'BIDV', 'Techcombank', 'VPBank', 'MB Bank', 'ACB', 'Sacombank'],
  FR: ['BNP Paribas', 'Crédit Agricole', 'Société Générale', 'La Banque Postale', 'LCL', 'Crédit Mutuel'],
  GB: ['Barclays', 'Lloyds', 'NatWest', 'HSBC UK', 'Santander UK', 'Monzo', 'Revolut'],
  KE: ['Equity Bank', 'KCB Bank', 'Co-operative Bank', 'Absa Kenya', 'M-Pesa'],
  GH: ['GCB Bank', 'Ecobank Ghana', 'Fidelity Bank Ghana', 'Standard Chartered Ghana', 'MTN MoMo'],
  ZA: ['Standard Bank', 'FNB', 'Absa', 'Nedbank', 'Capitec'],
}

function getBankSuggestions(countryCode: string): string[] {
  return BANK_SUGGESTIONS[countryCode] ?? []
}

export function SendToBank({ onBack, onRouteToEscrow }: Props) {
  const { profile } = useAuth()
  const [selectedCountry, setSelectedCountry] = useState<CountryDef | null>(profile?.country ?? null)
  const [localAmount, setLocalAmount] = useState('')
  const [step, setStep] = useState<Step>('amount')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [bankSuggestOpen, setBankSuggestOpen] = useState(false)

  const country = selectedCountry ?? COUNTRIES[0]
  const { rate, loading: fxLoading, formatLocal } = useLocalCurrency(country.currency)

  const localNum = parseFloat(localAmount.replace(/,/g, '')) || 0
  const usdcNeeded = rate && localNum > 0 ? localNum / rate : null

  const step1Valid = localNum > 0 && usdcNeeded != null && usdcNeeded >= 1
  const step2Valid = bankName.trim().length > 2 && accountNumber.trim().length >= 6 && accountName.trim().length > 2

  function formatLocalInput(val: string): string {
    const num = val.replace(/[^0-9.]/g, '')
    return num
  }

  function handleConfirm() {
    if (!usdcNeeded || !step2Valid) return
    onRouteToEscrow({
      country,
      usdcAmount: parseFloat(usdcNeeded.toFixed(6)),
      localAmount: localNum,
      bankDetails: {
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        accountName: accountName.trim(),
        countryCode: country.code,
      },
    })
  }

  const suggestions = getBankSuggestions(country.code)

  return (
    <div className="max-w-lg mx-auto px-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 py-4 mb-2">
        <button
          onClick={onBack}
          className="flex items-center justify-center size-9 rounded-xl transition-all active:scale-90"
          style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}
        >
          <ArrowLeft className="size-4" style={{ color: 'var(--ink)' }} />
        </button>
        <div>
          <h1 className="font-bold text-base display" style={{ color: 'var(--ink)' }}>Send to Bank</h1>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Transfer to any local bank account</p>
        </div>
      </div>

      {/* Step progress */}
      <div className="flex items-center gap-2 mb-6">
        {(['amount', 'bank', 'review'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div
              className="flex size-6 items-center justify-center rounded-full text-xs font-bold shrink-0 transition-all"
              style={{
                background: step === s ? 'var(--accent)' : (i < ['amount','bank','review'].indexOf(step) ? 'var(--success)' : 'var(--surface-muted)'),
                color: step === s || i < ['amount','bank','review'].indexOf(step) ? 'white' : 'var(--subtle)',
              }}
            >
              {i < ['amount','bank','review'].indexOf(step) ? '✓' : i + 1}
            </div>
            <span className="text-xs font-medium capitalize" style={{ color: step === s ? 'var(--ink)' : 'var(--subtle)' }}>
              {s}
            </span>
            {i < 2 && <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* Step 1: Amount */}
        {step === 'amount' && (
          <motion.div
            key="amount"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="space-y-5"
          >
            {/* Country selector */}
            <div>
              <label className="text-xs font-semibold mb-1.5 block uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                Send to
              </label>
              <div className="flex gap-2 flex-wrap">
                {COUNTRIES.map(c => (
                  <button
                    key={c.code}
                    onClick={() => setSelectedCountry(c)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
                    style={{
                      background: selectedCountry?.code === c.code ? 'var(--accent)' : 'var(--surface-strong)',
                      color: selectedCountry?.code === c.code ? 'white' : 'var(--ink)',
                      border: `1.5px solid ${selectedCountry?.code === c.code ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                  >
                    <img
                      src={`https://flagcdn.com/w40/${c.code.toLowerCase()}.png`}
                      alt={c.name}
                      width={18} height={13}
                      className="rounded-sm object-cover"
                      style={{ width: 18, height: 13 }}
                    />
                    {c.currency}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount input */}
            <div>
              <label className="text-xs font-semibold mb-1.5 block uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                Amount in {country.currency}
              </label>
              <div className="relative">
                <span
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold"
                  style={{ color: 'var(--subtle)' }}
                >
                  {country.currencySymbol}
                </span>
                <input
                  inputMode="decimal"
                  placeholder="0"
                  value={localAmount}
                  onChange={e => setLocalAmount(formatLocalInput(e.target.value))}
                  className="w-full rounded-2xl pl-10 pr-4 py-4 text-2xl font-bold outline-none tabular-nums"
                  style={{
                    background: 'var(--surface-muted)',
                    border: '1.5px solid var(--border)',
                    color: 'var(--ink)',
                    fontSize: 24,
                  }}
                />
                <span
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold"
                  style={{ color: 'var(--subtle)' }}
                >
                  {country.currency}
                </span>
              </div>

              {/* Quick amounts */}
              <div className="flex gap-2 mt-2">
                {(country.currency === 'NGN'
                  ? [5000, 10000, 25000, 50000]
                  : country.currency === 'VND'
                  ? [100000, 500000, 1000000, 5000000]
                  : [10, 50, 100, 250]
                ).map(amt => (
                  <button
                    key={amt}
                    onClick={() => setLocalAmount(String(amt))}
                    className="flex-1 rounded-xl py-1.5 text-xs font-semibold transition-all active:scale-95"
                    style={{ background: 'var(--surface-strong)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                  >
                    {country.currencySymbol}{amt.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {/* USDC equivalent */}
            <div
              className="rounded-2xl p-4"
              style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}
            >
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: 'var(--muted)' }}>You need to lock</span>
                {fxLoading ? (
                  <Loader2 className="size-4 animate-spin" style={{ color: 'var(--subtle)' }} />
                ) : usdcNeeded != null ? (
                  <span className="text-base font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {usdcNeeded.toFixed(2)} USDC
                  </span>
                ) : (
                  <span className="text-sm" style={{ color: 'var(--subtle)' }}>Enter amount above</span>
                )}
              </div>
              {usdcNeeded != null && rate != null && (
                <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
                  Rate: 1 USDC = {formatLocal(rate, country.currency, country.currencySymbol)} {country.currency}
                  {' · '}0.5% platform fee included
                </p>
              )}
            </div>

            {usdcNeeded != null && usdcNeeded < 1 && (
              <div className="flex items-center gap-2 text-xs px-1" style={{ color: 'var(--danger)' }}>
                <AlertCircle className="size-4 shrink-0" />
                Minimum send is 1 USDC equivalent.
              </div>
            )}

            <button
              onClick={() => setStep('bank')}
              disabled={!step1Valid}
              className="w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
              style={{ background: 'var(--accent)' }}
            >
              Continue <ChevronRight className="size-4" />
            </button>
          </motion.div>
        )}

        {/* Step 2: Bank details */}
        {step === 'bank' && (
          <motion.div
            key="bank"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Enter the recipient's bank account details in {country.name}.
            </p>

            {/* Bank name */}
            <div>
              <label className="text-xs font-semibold mb-1.5 block uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                Bank Name
              </label>
              <div className="relative">
                <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 pointer-events-none" style={{ color: 'var(--subtle)' }} />
                <input
                  type="text"
                  placeholder={`e.g. ${suggestions[0] ?? 'Bank name'}`}
                  value={bankName}
                  onChange={e => { setBankName(e.target.value); setBankSuggestOpen(true) }}
                  onFocus={() => setBankSuggestOpen(true)}
                  onBlur={() => setTimeout(() => setBankSuggestOpen(false), 150)}
                  className="w-full rounded-2xl pl-10 pr-4 py-3.5 text-sm outline-none"
                  style={{
                    background: 'var(--surface-muted)',
                    border: '1.5px solid var(--border)',
                    color: 'var(--ink)',
                    fontSize: 16,
                  }}
                />
              </div>
              {/* Suggestions dropdown */}
              {bankSuggestOpen && suggestions.length > 0 && (
                <div
                  className="mt-1 rounded-2xl overflow-hidden shadow-lg"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  {suggestions
                    .filter(s => s.toLowerCase().includes(bankName.toLowerCase()))
                    .slice(0, 5)
                    .map(s => (
                      <button
                        key={s}
                        onClick={() => { setBankName(s); setBankSuggestOpen(false) }}
                        className="w-full px-4 py-2.5 text-left text-sm transition-colors"
                        style={{ color: 'var(--ink)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        {s}
                      </button>
                    ))
                  }
                </div>
              )}
            </div>

            {/* Account number */}
            <div>
              <label className="text-xs font-semibold mb-1.5 block uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                Account Number / IBAN
              </label>
              <div className="relative">
                <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 pointer-events-none" style={{ color: 'var(--subtle)' }} />
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={country.code === 'NG' ? '10-digit NUBAN' : country.code === 'FR' ? 'FR76 XXXX...' : 'Account number'}
                  value={accountNumber}
                  onChange={e => setAccountNumber(e.target.value)}
                  className="w-full rounded-2xl pl-10 pr-4 py-3.5 text-sm outline-none font-mono"
                  style={{
                    background: 'var(--surface-muted)',
                    border: '1.5px solid var(--border)',
                    color: 'var(--ink)',
                    fontSize: 16,
                  }}
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Account name */}
            <div>
              <label className="text-xs font-semibold mb-1.5 block uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                Account Holder Name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 pointer-events-none" style={{ color: 'var(--subtle)' }} />
                <input
                  type="text"
                  placeholder="Full name on account"
                  value={accountName}
                  onChange={e => setAccountName(e.target.value)}
                  className="w-full rounded-2xl pl-10 pr-4 py-3.5 text-sm outline-none"
                  style={{
                    background: 'var(--surface-muted)',
                    border: '1.5px solid var(--border)',
                    color: 'var(--ink)',
                    fontSize: 16,
                  }}
                  autoComplete="off"
                />
              </div>
            </div>

            <button
              onClick={() => setStep('review')}
              disabled={!step2Valid}
              className="w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
              style={{ background: 'var(--accent)' }}
            >
              Review <ChevronRight className="size-4" />
            </button>
            <button
              onClick={() => setStep('amount')}
              className="w-full rounded-2xl py-3 text-sm font-medium"
              style={{ color: 'var(--muted)' }}
            >
              ← Back
            </button>
          </motion.div>
        )}

        {/* Step 3: Review */}
        {step === 'review' && (
          <motion.div
            key="review"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="space-y-4"
          >
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: '1.5px solid var(--border)' }}
            >
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>Order summary</p>
              </div>
              {[
                { label: 'You send (USDC locked)', value: `${usdcNeeded?.toFixed(2) ?? '—'} USDC` },
                { label: 'Recipient gets', value: `${country.currencySymbol}${localNum.toLocaleString()} ${country.currency}` },
                { label: 'Country', value: country.name },
                { label: 'Bank', value: bankName },
                { label: 'Account number', value: accountNumber, mono: true },
                { label: 'Account name', value: accountName },
                { label: 'Platform fee', value: `≈ ${((usdcNeeded ?? 0) * 0.005).toFixed(4)} USDC (0.5%)` },
              ].map(({ label, value, mono }) => (
                <div key={label} className="flex justify-between items-center px-4 py-3 border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>{label}</span>
                  <span className={`text-sm font-semibold text-right max-w-[55%] break-all ${mono ? 'font-mono' : ''}`} style={{ color: 'var(--ink)' }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            <div
              className="rounded-2xl p-3.5 flex gap-2.5"
              style={{ background: '#fff8e6', border: '1px solid #f5c842' }}
            >
              <AlertCircle className="size-4 shrink-0 mt-0.5" style={{ color: '#b45309' }} />
              <p className="text-xs" style={{ color: '#92400e' }}>
                A verified local trader in {country.name} will send the fiat payment to this bank account after you lock USDC in escrow. You can dispute if payment is not received within 24 hours.
              </p>
            </div>

            <button
              onClick={handleConfirm}
              className="w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              style={{ background: 'var(--accent)' }}
            >
              <CheckCircle2 className="size-4" />
              Find a trader &amp; lock USDC
            </button>
            <button
              onClick={() => setStep('bank')}
              className="w-full rounded-2xl py-3 text-sm font-medium"
              style={{ color: 'var(--muted)' }}
            >
              ← Back
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
