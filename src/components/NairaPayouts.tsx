/**
 * NairaPayouts — pay out of the naira account without a trader:
 *   - NairaBankTransfer: any Nigerian bank (OPay, UBA, GTBank…)
 *   - NairaBills: airtime, data, electricity, TV
 *
 * Flow: the naira is burned on-chain with a hash of the details (requestPayout),
 * then the details go to the server, which checks the hash and hands the payout
 * to the payment partner (simulated on testnet). If the partner can't pay, the
 * operator refunds the naira from the admin page.
 */
import { useState } from 'react'
import type { Address } from 'viem'
import { ArrowRightLeft } from 'lucide-react'
import { BANKS_BY_COUNTRY } from '../payments/banks'
import {
  NETWORKS, DATA_PLANS, DISCOS, TV_PROVIDERS, MIN_AIRTIME, MIN_ELECTRICITY, MAX_BILL, KIND_LABEL, payoutSummary,
} from '../naira/bills'
import { requestPayout, payoutDetailsText, formatNaira, toNairaUnits } from '../naira/nairaToken'
import { logNaira } from '../naira/nairaLog'
import { apiPostPayout, type PayoutKind, type Payout } from '../auth/ptpApi'
import { friendlyTxError } from '../wallet/appWallet'
import { KycGate } from './KycFlow'
import { Page, Card, Notice, MoneyInput, PrimaryButton, inputStyle, type NairaDone } from './NairaUi'

interface Shared {
  contract: Address
  balance: bigint | null
  onDone: (d: NairaDone) => void
  onBack: () => void
}

// ── payout runner (with retry if the server can't be reached) ───────────────

const PENDING_KEY = 'ptp_naira_pending_payouts'

function loadPending(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '{}') as Record<string, string> } catch { return {} }
}
function savePending(p: Record<string, string>) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(p)) } catch { /* blocked */ }
}

async function postWithRetry(payoutId: bigint, text: string): Promise<Payout | null> {
  for (let i = 0; i < 3; i++) {
    try { return await apiPostPayout(payoutId, text) } catch { await new Promise(r => setTimeout(r, 1500 * (i + 1))) }
  }
  return null
}

/** Re-send payout details that didn't reach the server last time (call when the naira screen opens). */
export async function retryPendingPayouts() {
  const pending = loadPending()
  for (const [id, text] of Object.entries(pending)) {
    try { await apiPostPayout(BigInt(id), text); delete pending[id] } catch { /* try again next time */ }
  }
  savePending(pending)
}

async function runPayout(contract: Address, kind: PayoutKind, units: bigint, details: { kind: PayoutKind } & Record<string, string>): Promise<NairaDone> {
  const text = payoutDetailsText(details)
  const { hash, payoutId } = await requestPayout(contract, kind, units, text)
  const summary = payoutSummary(kind, details)
  logNaira({ hash, kind: 'payout', amount: units.toString(), label: `${KIND_LABEL[kind]} · ${summary}`, payoutId: payoutId.toString() })

  const payout = await postWithRetry(payoutId, text)
  if (!payout) {
    savePending({ ...loadPending(), [payoutId.toString()]: text })
    return { title: 'Payment saved', pending: true, hash, lines: [`${formatNaira(units)} · ${summary}`, "We couldn't reach the Peetopee server. It will be sent automatically next time you open your naira account."] }
  }
  if (payout.status === 'failed') {
    return { title: 'Payment not sent', pending: true, hash, lines: [payout.reason ?? 'The payment partner could not pay this.', 'Your naira will be refunded.'] }
  }
  const paid = payout.status === 'paid'
  return {
    title: paid ? (kind === 'bank' ? 'Money sent' : 'Payment done') : 'Payment on its way',
    pending: !paid,
    hash,
    token: payout.token,
    lines: [
      `${formatNaira(units)} · ${summary}`,
      paid ? `Reference ${payout.reference}` : 'It is being processed. You can follow it in your naira activity.',
    ],
  }
}

// ── bank transfer ───────────────────────────────────────────────────────────

export function NairaBankTransfer(props: Shared & { onUseTrader?: () => void }) {
  return (
    <KycGate reason="Bank transfers from your naira account need a verified ID, like any bank account.">
      <BankForm {...props} />
    </KycGate>
  )
}

function BankForm({ contract, balance, onDone, onBack, onUseTrader }: Shared & { onUseTrader?: () => void }) {
  const rules = BANKS_BY_COUNTRY.NG
  const [bank, setBank] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [amount, setAmount] = useState('')
  const [narration, setNarration] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const units = (() => { try { return amount ? toNairaUnits(amount) : 0n } catch { return 0n } })()
  const tooMuch = balance != null && units > balance
  const acctOk = rules.accountPattern!.test(accountNumber)
  const ready = !!bank && acctOk && accountName.trim().length >= 2 && units >= toNairaUnits(100) && !tooMuch

  async function send() {
    setBusy(true); setError('')
    try {
      onDone(await runPayout(contract, 'bank', units, {
        kind: 'bank', bank, accountNumber, accountName: accountName.trim(), narration: narration.trim(),
      }))
    } catch (e) { setError(friendlyTxError(e)) } finally { setBusy(false) }
  }

  if (confirm) {
    return (
      <Page onBack={() => setConfirm(false)} title="Confirm transfer">
        <Card>
          <Row label="To" value={accountName.trim()} />
          <Row label="Bank" value={bank} />
          <Row label="Account" value={accountNumber} />
          {narration.trim() && <Row label="Narration" value={narration.trim()} />}
          <div className="pt-2 mt-2" style={{ borderTop: '1px solid var(--border)' }}><Row label="Amount" value={formatNaira(units, { decimals: true })} bold /></div>
          <Row label="Fee" value="₦0" />
        </Card>
        <p className="text-xs mt-3" style={{ color: 'var(--subtle)' }}>Check the account number and name carefully — bank transfers can't be reversed once paid.</p>
        {error && <p className="text-xs text-center mt-3" style={{ color: 'var(--danger)' }}>{error}</p>}
        <PrimaryButton onClick={() => { void send() }} disabled={busy} busy={busy} className="mt-5">
          Send {formatNaira(units)}
        </PrimaryButton>
      </Page>
    )
  }

  return (
    <Page onBack={onBack} title="Send to bank">
      <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
        From your naira balance ({balance == null ? '…' : formatNaira(balance)}) to any Nigerian bank. No trader needed.
      </p>
      <Field label="BANK">
        <select value={bank} onChange={e => setBank(e.target.value)} className="w-full rounded-2xl px-4 py-3.5 outline-none" style={inputStyle}>
          <option value="">Choose a bank…</option>
          {rules.banks.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </Field>
      <Field label="ACCOUNT NUMBER">
        <input value={accountNumber} inputMode="numeric" placeholder={rules.accountHint}
          onChange={e => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
          className="w-full rounded-2xl px-4 py-3.5 outline-none font-mono" style={{ ...inputStyle, borderColor: accountNumber && !acctOk ? 'var(--danger)' : 'var(--border)' }} />
      </Field>
      <Field label="ACCOUNT NAME">
        <input value={accountName} placeholder="As it appears on the account" onChange={e => setAccountName(e.target.value.slice(0, 80))}
          className="w-full rounded-2xl px-4 py-3.5 outline-none" style={inputStyle} />
      </Field>
      <Field label="AMOUNT">
        <MoneyInput value={amount} onChange={setAmount} prefix="₦" placeholder="₦0" invalid={tooMuch} />
        {tooMuch && <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>More than your naira balance. Add naira first.</p>}
      </Field>
      <Field label="NARRATION (OPTIONAL)">
        <input value={narration} placeholder="e.g. Rent" onChange={e => setNarration(e.target.value.slice(0, 60))}
          className="w-full rounded-2xl px-4 py-3.5 outline-none" style={inputStyle} />
      </Field>
      <PrimaryButton onClick={() => setConfirm(true)} disabled={!ready}>Review transfer</PrimaryButton>
      {onUseTrader && (
        <button onClick={onUseTrader} className="mt-4 w-full text-xs font-semibold flex items-center justify-center gap-1.5" style={{ color: 'var(--accent)' }}>
          <ArrowRightLeft className="size-3.5" /> Or pay with USDC through a verified trader
        </button>
      )}
    </Page>
  )
}

// ── bills ───────────────────────────────────────────────────────────────────

type BillKind = 'airtime' | 'data' | 'electricity' | 'tv'

export function NairaBills({ contract, balance, onDone, onBack }: Shared) {
  const [kind, setKind] = useState<BillKind>('airtime')
  const [network, setNetwork] = useState<string>(NETWORKS[0])
  const [phone, setPhone] = useState('')
  const [planId, setPlanId] = useState('')
  const [disco, setDisco] = useState('')
  const [meterType, setMeterType] = useState<'prepaid' | 'postpaid'>('prepaid')
  const [meterNumber, setMeterNumber] = useState('')
  const [provider, setProvider] = useState('DStv')
  const [smartcard, setSmartcard] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const plans = kind === 'data' ? DATA_PLANS : kind === 'tv' ? TV_PROVIDERS[provider] : []
  const plan = plans.find(p => p.id === planId)
  const naira = kind === 'data' || kind === 'tv' ? (plan?.price ?? 0) : parseFloat(amount) || 0
  const units = naira > 0 ? toNairaUnits(naira) : 0n
  const tooMuch = balance != null && units > balance

  const phoneOk = /^0\d{10}$/.test(phone)
  let valid = false
  let details: ({ kind: PayoutKind } & Record<string, string>) | null = null
  if (kind === 'airtime') {
    valid = phoneOk && naira >= MIN_AIRTIME && naira <= MAX_BILL
    details = { kind, network, phone }
  } else if (kind === 'data') {
    valid = phoneOk && !!plan
    details = { kind, network, phone, plan: plan?.label ?? '' }
  } else if (kind === 'electricity') {
    valid = !!disco && /^\d{11,13}$/.test(meterNumber) && naira >= MIN_ELECTRICITY && naira <= MAX_BILL
    details = { kind, disco, meterType, meterNumber }
  } else {
    valid = /^\d{10,12}$/.test(smartcard) && !!plan
    details = { kind, provider, plan: plan?.label ?? '', smartcard }
  }

  async function pay() {
    if (!details || !valid || tooMuch) return
    setBusy(true); setError('')
    try { onDone(await runPayout(contract, kind, units, details)) } catch (e) { setError(friendlyTxError(e)) } finally { setBusy(false) }
  }

  function switchKind(k: BillKind) { setKind(k); setPlanId(''); setAmount(''); setError('') }

  return (
    <Page onBack={onBack} title="Pay bills">
      <div className="grid grid-cols-4 gap-1 rounded-xl p-1 mb-5" style={{ background: 'var(--surface-muted)' }}>
        {(['airtime', 'data', 'electricity', 'tv'] as BillKind[]).map(k => (
          <button key={k} onClick={() => switchKind(k)} className="rounded-lg py-2 text-xs font-semibold"
            style={{ background: kind === k ? 'var(--chip)' : 'transparent', color: kind === k ? 'var(--ink)' : 'var(--muted)' }}>
            {k === 'tv' ? 'TV' : k === 'electricity' ? 'Power' : k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>

      {(kind === 'airtime' || kind === 'data') && (
        <>
          <Field label="NETWORK">
            <div className="grid grid-cols-4 gap-2">
              {NETWORKS.map(n => (
                <button key={n} onClick={() => setNetwork(n)} className="rounded-xl py-2.5 text-xs font-bold"
                  style={{ background: network === n ? 'var(--accent)' : 'var(--surface-muted)', color: network === n ? 'white' : 'var(--ink)' }}>{n}</button>
              ))}
            </div>
          </Field>
          <Field label="PHONE NUMBER">
            <input value={phone} inputMode="tel" placeholder="08031234567" onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
              className="w-full rounded-2xl px-4 py-3.5 outline-none font-mono" style={{ ...inputStyle, borderColor: phone && !phoneOk ? 'var(--danger)' : 'var(--border)' }} />
          </Field>
        </>
      )}

      {kind === 'electricity' && (
        <>
          <Field label="ELECTRICITY COMPANY">
            <select value={disco} onChange={e => setDisco(e.target.value)} className="w-full rounded-2xl px-4 py-3.5 outline-none" style={inputStyle}>
              <option value="">Choose…</option>
              {DISCOS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="METER TYPE">
            <div className="grid grid-cols-2 gap-2">
              {(['prepaid', 'postpaid'] as const).map(t => (
                <button key={t} onClick={() => setMeterType(t)} className="rounded-xl py-2.5 text-xs font-bold capitalize"
                  style={{ background: meterType === t ? 'var(--accent)' : 'var(--surface-muted)', color: meterType === t ? 'white' : 'var(--ink)' }}>{t}</button>
              ))}
            </div>
          </Field>
          <Field label="METER NUMBER">
            <input value={meterNumber} inputMode="numeric" placeholder="11–13 digits" onChange={e => setMeterNumber(e.target.value.replace(/\D/g, '').slice(0, 13))}
              className="w-full rounded-2xl px-4 py-3.5 outline-none font-mono" style={inputStyle} />
          </Field>
        </>
      )}

      {kind === 'tv' && (
        <>
          <Field label="PROVIDER">
            <div className="grid grid-cols-3 gap-2">
              {Object.keys(TV_PROVIDERS).map(p => (
                <button key={p} onClick={() => { setProvider(p); setPlanId('') }} className="rounded-xl py-2.5 text-xs font-bold"
                  style={{ background: provider === p ? 'var(--accent)' : 'var(--surface-muted)', color: provider === p ? 'white' : 'var(--ink)' }}>{p}</button>
              ))}
            </div>
          </Field>
          <Field label="SMARTCARD / IUC NUMBER">
            <input value={smartcard} inputMode="numeric" placeholder="10–12 digits" onChange={e => setSmartcard(e.target.value.replace(/\D/g, '').slice(0, 12))}
              className="w-full rounded-2xl px-4 py-3.5 outline-none font-mono" style={inputStyle} />
          </Field>
        </>
      )}

      {(kind === 'data' || kind === 'tv') && (
        <Field label={kind === 'data' ? 'DATA PLAN' : 'PACKAGE'}>
          <div className="space-y-2">
            {plans.map(p => (
              <button key={p.id} onClick={() => setPlanId(p.id)} className="w-full rounded-xl px-4 py-3 flex justify-between text-sm"
                style={{ background: planId === p.id ? 'rgba(29,78,216,0.08)' : 'var(--surface-muted)', border: `1.5px solid ${planId === p.id ? 'var(--accent)' : 'transparent'}`, color: 'var(--ink)' }}>
                <span className="font-semibold">{p.label}</span><span className="tabular-nums">{formatNaira(p.price)}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] mt-1.5" style={{ color: 'var(--subtle)' }}>Sample plans and prices on testnet.</p>
        </Field>
      )}

      {(kind === 'airtime' || kind === 'electricity') && (
        <Field label={`AMOUNT (MIN ${formatNaira(kind === 'airtime' ? MIN_AIRTIME : MIN_ELECTRICITY)})`}>
          <MoneyInput value={amount} onChange={setAmount} prefix="₦" placeholder="₦0" invalid={tooMuch} />
        </Field>
      )}

      {tooMuch && <Notice tone="error">That's more than your naira balance ({formatNaira(balance ?? 0n)}). Add naira first.</Notice>}
      {error && <p className="text-xs text-center mb-3" style={{ color: 'var(--danger)' }}>{error}</p>}
      <PrimaryButton onClick={() => { void pay() }} disabled={busy || !valid || tooMuch} busy={busy}>
        Pay {units > 0n ? formatNaira(units) : ''}
      </PrimaryButton>
      <p className="text-xs text-center mt-2" style={{ color: 'var(--subtle)' }}>Balance: {balance == null ? '…' : formatNaira(balance)} · no fee</p>
    </Page>
  )
}

// ── bits ────────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--subtle)' }}>{label}</label>
      {children}
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm py-1">
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span className={`${bold ? 'font-bold text-base' : 'font-semibold'} text-right`} style={{ color: 'var(--ink)' }}>{value}</span>
    </div>
  )
}
