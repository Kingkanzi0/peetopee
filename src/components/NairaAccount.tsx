/**
 * NairaAccount — your naira balance on Peetopee, tied to your @handle.
 *
 *   - Add naira: convert USDC → naira (or, on testnet, claim free test naira)
 *   - Send naira to any @handle (instant, on Arc)
 *   - Send to any Nigerian bank, and pay airtime, data, electricity and TV —
 *     straight from the balance, no trader involved
 *   - Convert naira back to USDC
 *
 * The naira lives in your own Wallet account as tNGN (see src/naira/nairaToken.ts).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Address } from 'viem'
import {
  ArrowLeft, ArrowDownUp, Building2, Smartphone, Send, Plus, Loader2, CheckCircle2, AlertCircle,
  ExternalLink, Search, BadgeCheck, Gift, Clock, XCircle,
} from 'lucide-react'
import { useAppWallet, useUsdcBalance, friendlyTxError } from '../wallet/appWallet'
import {
  useNairaConfig, useNairaBalance, readNairaInfo, readFaucetNextAt, quoteBuy, quoteSell, buyNaira, sellNaira,
  sendNaira, claimNairaFaucet, formatNaira, toNairaUnits, type NairaInfo,
} from '../naira/nairaToken'
import { logNaira, subscribeNairaLog, nairaLogSnapshot, type NairaLogEntry } from '../naira/nairaLog'
import { apiLookup, apiMyPayouts, ApiError, type Payout, type PtpApiUser } from '../auth/ptpApi'
import { useAuth } from '../auth/AuthContext'
import { explorerTxUrl } from '../history/txHistory'
import { Avatar } from './SendUsdcByPtpId'
import { NairaBankTransfer, NairaBills, retryPendingPayouts } from './NairaPayouts'
import { Page, Card, Notice, MoneyInput, PrimaryButton, inputStyle, type NairaDone } from './NairaUi'
import { parseUnits, formatUnits } from 'viem'

const ARC_CHAIN_ID = 5042002
const MIN_GAS_USDC = 0.01

type View = 'home' | 'add' | 'withdraw' | 'send' | 'bank' | 'bills'


interface Props {
  onBack?: () => void
  initialView?: View
  /** Fallback: send to a bank through a verified P2P trader instead. */
  onUseTrader?: () => void
}

export function NairaAccount({ onBack, initialView = 'home', onUseTrader }: Props) {
  const cfg = useNairaConfig()
  const { wallet } = useAppWallet()
  const { balance, refresh } = useNairaBalance(wallet?.address)
  const { balance: usdc, refresh: refreshUsdc } = useUsdcBalance(wallet?.address)
  const [view, setView] = useState<View>(initialView)
  const [done, setDone] = useState<NairaDone | null>(null)

  // Payout details that couldn't reach the server last time are sent now.
  useEffect(() => { if (cfg.address) void retryPendingPayouts() }, [cfg.address])

  const finish = (d: NairaDone) => { setDone(d); refresh(); refreshUsdc() }
  const back = () => { setDone(null); if (view === 'home' || view === initialView) onBack?.(); else setView('home') }
  const goHome = () => { setDone(null); setView('home') }

  if (!cfg.ready) return <Centered><Loader2 className="size-6 animate-spin" style={{ color: 'var(--accent)' }} /></Centered>

  if (!cfg.address) {
    return (
      <Page onBack={onBack} title="Naira account">
        <Card>
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>Not switched on yet</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            The naira account is being set up on this server. The operator turns it on from the admin page (#admin → Naira).
          </p>
        </Card>
        {onUseTrader && (
          <button onClick={onUseTrader} className="mt-4 w-full rounded-2xl py-3.5 text-sm font-bold text-white" style={{ background: 'var(--accent)' }}>
            Send to a bank through a trader instead
          </button>
        )}
      </Page>
    )
  }

  const contract = cfg.address
  const lowGas = usdc != null && usdc < MIN_GAS_USDC

  if (done) return <DoneScreen done={done} onAgain={goHome} />

  const shared = { contract, balance, onDone: finish, onBack: back }
  if (view === 'add') return <Convert {...shared} direction="in" usdc={usdc} />
  if (view === 'withdraw') return <Convert {...shared} direction="out" usdc={usdc} />
  if (view === 'send') return <SendNaira {...shared} />
  if (view === 'bank') return <NairaBankTransfer {...shared} onUseTrader={onUseTrader} />
  if (view === 'bills') return <NairaBills {...shared} />

  return (
    <Page onBack={onBack} title="Naira account">
      <div className="rounded-3xl p-5 mb-4 text-white" style={{ background: 'linear-gradient(135deg, #064e3b 0%, #059669 100%)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Naira balance</p>
        <p className="text-3xl font-black mt-1 tabular-nums display">{balance == null ? '…' : formatNaira(balance, { decimals: true })}</p>
        <p className="text-xs text-white/60 mt-1">In your own Peetopee wallet · send by @handle or to any bank</p>
        {cfg.simulated && (
          <p className="mt-3 inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: 'rgba(255,255,255,0.15)' }}>
            Testnet: test naira, bank and bill payments are simulated
          </p>
        )}
      </div>

      {lowGas && (
        <Notice tone="warn">You need a little USDC in your Wallet (about {MIN_GAS_USDC}) to pay Arc network fees. Add some in the Wallet tab.</Notice>
      )}

      <div className="grid grid-cols-2 gap-3 mb-6">
        <Action icon={<Plus className="size-5" />} title="Add naira" sub="From USDC" onClick={() => setView('add')} />
        <Action icon={<Send className="size-5" />} title="Send to @handle" sub="Instant, free" onClick={() => setView('send')} />
        <Action icon={<Building2 className="size-5" />} title="Send to bank" sub="OPay, UBA, any bank" onClick={() => setView('bank')} />
        <Action icon={<Smartphone className="size-5" />} title="Pay bills" sub="Airtime, data, power, TV" onClick={() => setView('bills')} />
      </div>
      <button onClick={() => setView('withdraw')} className="w-full rounded-2xl py-3 text-sm font-semibold flex items-center justify-center gap-2 mb-6"
        style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}>
        <ArrowDownUp className="size-4" /> Convert naira to USDC
      </button>

      <NairaActivity />
    </Page>
  )
}

// ── convert USDC ⇄ naira ────────────────────────────────────────────────────

function Convert({ contract, balance, usdc, direction, onDone, onBack }: {
  contract: Address; balance: bigint | null; usdc: number | null; direction: 'in' | 'out'; onDone: (d: NairaDone) => void; onBack: () => void
}) {
  const { wallet } = useAppWallet()
  const [info, setInfo] = useState<NairaInfo | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [faucetAt, setFaucetAt] = useState<number | null>(null)

  useEffect(() => {
    readNairaInfo(contract).then(setInfo).catch(() => setError("Couldn't read today's rate. Check your connection."))
    if (wallet) readFaucetNextAt(contract, wallet.address).then(setFaucetAt).catch(() => {})
  }, [contract, wallet])

  const typed = (() => { try { return amount ? parseUnits(amount, 6) : 0n } catch { return 0n } })()
  const quote = info && typed > 0n ? (direction === 'in' ? quoteBuy(info, typed) : quoteSell(info, typed)) : 0n
  const maxIn = usdc == null ? 0 : Math.max(0, Math.floor((usdc - 0.02) * 1e6) / 1e6)
  const tooMuch = direction === 'in' ? typed > parseUnits(String(maxIn), 6) : balance != null && typed > balance
  const reserveShort = direction === 'out' && info != null && quote > info.reserve

  async function go() {
    if (typed <= 0n || tooMuch) return
    setBusy(true); setError('')
    try {
      if (direction === 'in') {
        const { hash } = await buyNaira(contract, typed)
        logNaira({ hash, kind: 'to_naira', amount: quote.toString(), label: `From ${amount} USDC` })
        onDone({ title: 'Naira added', lines: [`${formatNaira(quote, { decimals: true })} is in your naira account.`, `Paid ${amount} USDC.`], hash })
      } else {
        const { hash } = await sellNaira(contract, typed)
        logNaira({ hash, kind: 'to_usdc', amount: typed.toString(), label: `To ${formatUnits(quote, 6)} USDC` })
        onDone({ title: 'Converted to USDC', lines: [`${formatUnits(quote, 6)} USDC is in your Wallet.`], hash })
      }
    } catch (e) {
      setError(e instanceof Error && e.message.includes('Reserve') ? 'Not enough USDC in the reserve right now. Try a smaller amount.' : friendlyTxError(e))
    } finally { setBusy(false) }
  }

  async function faucet() {
    setBusy(true); setError('')
    try {
      const { hash } = await claimNairaFaucet(contract)
      logNaira({ hash, kind: 'faucet', amount: (info?.faucetAmount ?? 0n).toString(), label: 'Test naira' })
      onDone({ title: 'Test naira added', lines: [`${formatNaira(info?.faucetAmount ?? 0n)} of test naira is in your account.`, 'You can claim again in 24 hours.'], hash })
    } catch (e) { setError(friendlyTxError(e)) } finally { setBusy(false) }
  }

  const rate = info ? Number(info.rate) / 1e6 : null
  const faucetWait = faucetAt != null && faucetAt > Date.now()

  return (
    <Page onBack={onBack} title={direction === 'in' ? 'Add naira' : 'Convert to USDC'}>
      {rate != null && (
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
          Rate: 1 USDC = ₦{rate.toLocaleString()} · {Number(info!.spreadBps) / 100}% conversion fee
        </p>
      )}
      <label className="text-xs font-semibold mb-1.5 flex justify-between" style={{ color: 'var(--subtle)' }}>
        <span>{direction === 'in' ? 'USDC TO CONVERT' : 'NAIRA TO CONVERT'}</span>
        <button className="font-semibold" style={{ color: 'var(--accent)' }}
          onClick={() => setAmount(direction === 'in' ? String(maxIn) : balance != null ? formatUnits(balance, 6) : '')}>
          {direction === 'in' ? `Wallet: ${usdc == null ? '…' : usdc.toLocaleString()} USDC` : `Balance: ${balance == null ? '…' : formatNaira(balance)}`} · Max
        </button>
      </label>
      <MoneyInput value={amount} onChange={setAmount} prefix={direction === 'in' ? '' : '₦'} placeholder={direction === 'in' ? '0.00 USDC' : '₦0'} invalid={tooMuch} />
      {quote > 0n && (
        <p className="text-sm text-center mt-2 font-semibold" style={{ color: 'var(--ink)' }}>
          You get {direction === 'in' ? formatNaira(quote, { decimals: true }) : `${formatUnits(quote, 6)} USDC`}
        </p>
      )}
      {tooMuch && <p className="text-xs text-center mt-1" style={{ color: 'var(--danger)' }}>That's more than you have{direction === 'in' ? ' (we keep 0.02 USDC for fees)' : ''}.</p>}
      {reserveShort && <p className="text-xs text-center mt-1" style={{ color: 'var(--danger)' }}>The USDC reserve can't cover that right now. Try a smaller amount.</p>}
      {error && <p className="text-xs text-center mt-3" style={{ color: 'var(--danger)' }}>{error}</p>}

      <PrimaryButton onClick={() => { void go() }} disabled={busy || typed <= 0n || tooMuch || reserveShort || !info} busy={busy} className="mt-5">
        {direction === 'in' ? 'Add naira' : 'Convert to USDC'}
      </PrimaryButton>

      {direction === 'in' && info && info.faucetAmount > 0n && (
        <div className="mt-6 rounded-2xl p-4" style={{ background: 'var(--surface-muted)' }}>
          <p className="text-sm font-semibold flex items-center gap-2 mb-1" style={{ color: 'var(--ink)' }}><Gift className="size-4" /> Testing? Get free test naira</p>
          <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>{formatNaira(info.faucetAmount)} once a day. It has no real value.</p>
          <button onClick={() => { void faucet() }} disabled={busy || faucetWait}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>
            {faucetWait ? `Available ${new Date(faucetAt!).toLocaleString()}` : `Get ${formatNaira(info.faucetAmount)}`}
          </button>
        </div>
      )}
    </Page>
  )
}

// ── send naira to a @handle ─────────────────────────────────────────────────

function isLookupable(q: string) {
  const v = q.trim()
  if (v.includes('@') && !v.startsWith('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  return /^@?[a-zA-Z0-9_]{3,20}$/.test(v)
}

function SendNaira({ contract, balance, onDone, onBack }: { contract: Address; balance: bigint | null; onDone: (d: NairaDone) => void; onBack: () => void }) {
  const { profile } = useAuth()
  const [q, setQ] = useState('')
  const [who, setWho] = useState<PtpApiUser | null>(null)
  const [looking, setLooking] = useState(false)
  const [lookupErr, setLookupErr] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const seq = useRef(0)

  async function lookup(v: string) {
    if (!v.trim()) return
    const s = ++seq.current
    setLooking(true); setLookupErr('')
    try {
      const found = await apiLookup(v.trim())
      if (s !== seq.current) return
      setWho(found)
      if (!found) setLookupErr(`No Peetopee user found for "${v.trim()}".`)
      else if (!found.walletAddresses[ARC_CHAIN_ID]) setLookupErr(`${found.displayName} hasn't set up their Peetopee wallet yet.`)
    } catch (e) {
      if (s === seq.current) { setWho(null); setLookupErr(e instanceof ApiError ? e.message : 'Lookup failed. Please try again.') }
    } finally { if (s === seq.current) setLooking(false) }
  }

  useEffect(() => {
    if (!isLookupable(q)) return
    const t = setTimeout(() => { void lookup(q) }, 450)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const to = (who?.walletAddresses[ARC_CHAIN_ID] ?? null) as Address | null
  const isSelf = !!who && who.ptpId === profile?.ptpId
  const units = (() => { try { return amount ? toNairaUnits(amount) : 0n } catch { return 0n } })()
  const tooMuch = balance != null && units > balance

  async function send() {
    if (!to || !who || units <= 0n || tooMuch) return
    setBusy(true); setError('')
    try {
      const { hash } = await sendNaira(contract, to, units)
      logNaira({ hash, kind: 'sent', amount: units.toString(), label: `To ${who.ptpId}${note.trim() ? ` · ${note.trim()}` : ''}` })
      onDone({ title: 'Naira sent', lines: [`${formatNaira(units, { decimals: true })} → ${who.displayName} (${who.ptpId})`, 'It arrived in their naira account instantly.'], hash })
    } catch (e) { setError(friendlyTxError(e)) } finally { setBusy(false) }
  }

  return (
    <Page onBack={onBack} title="Send naira to a @handle">
      <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--subtle)' }}>RECIPIENT</label>
      <div className="flex gap-2 mb-2">
        <input value={q} placeholder="@handle or email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          onChange={e => { setQ(e.target.value); setWho(null); setLookupErr('') }}
          onKeyDown={e => { if (e.key === 'Enter') void lookup(q) }}
          className="flex-1 rounded-2xl px-4 py-3.5 outline-none" style={inputStyle} />
        <button onClick={() => { void lookup(q) }} disabled={!q.trim() || looking} aria-label="Search"
          className="rounded-2xl px-4 text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>
          {looking ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        </button>
      </div>
      {lookupErr && <Notice tone="error">{lookupErr}</Notice>}
      {who && (
        <div className="rounded-2xl p-3.5 flex items-center gap-3 mb-4" style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}>
          <Avatar user={who} size={44} />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm flex items-center gap-1" style={{ color: 'var(--ink)' }}>
              <span className="truncate">{who.displayName}</span>{who.idVerified && <BadgeCheck className="size-4 text-blue-600 shrink-0" />}
            </p>
            <p className="text-xs font-mono" style={{ color: 'var(--muted)' }}>{who.ptpId}</p>
            {isSelf && <p className="text-xs" style={{ color: 'var(--danger)' }}>That's you!</p>}
          </div>
          {to && !isSelf && <CheckCircle2 className="size-5 text-green-500" />}
        </div>
      )}

      {to && !isSelf && (
        <>
          <label className="text-xs font-semibold mb-1.5 flex justify-between" style={{ color: 'var(--subtle)' }}>
            <span>AMOUNT</span><span>Balance: {balance == null ? '…' : formatNaira(balance)}</span>
          </label>
          <MoneyInput value={amount} onChange={setAmount} prefix="₦" placeholder="₦0" invalid={tooMuch} />
          {tooMuch && <p className="text-xs text-center mt-1" style={{ color: 'var(--danger)' }}>More than your naira balance.</p>}
          <input value={note} onChange={e => setNote(e.target.value.slice(0, 60))} placeholder="What's it for? (optional)"
            className="w-full rounded-2xl px-4 py-3 outline-none mt-3" style={inputStyle} />
          {error && <p className="text-xs text-center mt-3" style={{ color: 'var(--danger)' }}>{error}</p>}
          <PrimaryButton onClick={() => { void send() }} disabled={busy || units <= 0n || tooMuch} busy={busy} className="mt-5">
            Send {units > 0n ? formatNaira(units) : ''}
          </PrimaryButton>
        </>
      )}
    </Page>
  )
}

// ── activity ────────────────────────────────────────────────────────────────

function NairaActivity() {
  const log = useSyncExternalStore(subscribeNairaLog, nairaLogSnapshot)
  const entries = (() => { try { return JSON.parse(log) as NairaLogEntry[] } catch { return [] } })()
  const [payouts, setPayouts] = useState<Record<string, Payout>>({})

  useEffect(() => {
    apiMyPayouts().then(list => setPayouts(Object.fromEntries(list.map(p => [p.payoutId, p])))).catch(() => {})
  }, [log])

  if (entries.length === 0) {
    return <p className="text-sm text-center py-6" style={{ color: 'var(--subtle)' }}>No naira activity yet.</p>
  }
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--subtle)' }}>Recent</h3>
      <div className="space-y-2">
        {entries.slice(0, 20).map(e => {
          const p = e.payoutId ? payouts[e.payoutId] : undefined
          const out = e.kind === 'sent' || e.kind === 'payout' || e.kind === 'to_usdc'
          return (
            <a key={e.hash} href={explorerTxUrl(e.hash)} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{e.label}</p>
                <p className="text-xs flex items-center gap-1" style={{ color: 'var(--subtle)' }}>
                  {new Date(e.timestamp).toLocaleString()}
                  {p && <PayoutBadge status={p.status} refunded={p.reference === 'REFUNDED'} />}
                </p>
                {p?.token && <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--ink)' }}>Token: {p.token}</p>}
              </div>
              <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: out ? 'var(--ink)' : 'var(--success)' }}>
                {out ? '−' : '+'}{formatNaira(BigInt(e.amount))}
              </span>
            </a>
          )
        })}
      </div>
    </div>
  )
}

export function PayoutBadge({ status, refunded }: { status: Payout['status']; refunded?: boolean }) {
  if (refunded) return <span className="inline-flex items-center gap-0.5 font-semibold ml-1" style={{ color: 'var(--muted)' }}>· Refunded</span>
  const map = {
    paid: { icon: <CheckCircle2 className="size-3" />, text: 'Paid', color: 'var(--success)' },
    processing: { icon: <Clock className="size-3" />, text: 'Processing', color: '#d97706' },
    failed: { icon: <XCircle className="size-3" />, text: 'Failed · refund pending', color: 'var(--danger)' },
  }[status]
  return <span className="inline-flex items-center gap-0.5 font-semibold ml-1" style={{ color: map.color }}>· {map.icon}{map.text}</span>
}

// ── result ──────────────────────────────────────────────────────────────────

function DoneScreen({ done, onAgain }: { done: NairaDone; onAgain: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center px-4 max-w-md mx-auto">
      <div className="size-20 rounded-full flex items-center justify-center mb-5" style={{ background: done.pending ? 'rgba(245,158,11,0.12)' : 'rgba(22,163,74,0.1)' }}>
        {done.pending ? <Clock className="size-10" style={{ color: '#d97706' }} /> : <CheckCircle2 className="size-10 text-green-500" />}
      </div>
      <h2 className="text-2xl font-black mb-2 display" style={{ color: 'var(--ink)' }}>{done.title}</h2>
      {done.lines.map(l => <p key={l} className="text-sm mb-1" style={{ color: 'var(--muted)' }}>{l}</p>)}
      {done.token && (
        <div className="mt-3 rounded-2xl px-4 py-3" style={{ background: 'var(--surface-muted)' }}>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>Electricity token</p>
          <p className="text-lg font-black font-mono tracking-wider" style={{ color: 'var(--ink)' }}>{done.token}</p>
        </div>
      )}
      {done.hash && (
        <a href={explorerTxUrl(done.hash)} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm font-semibold mt-4" style={{ color: 'var(--accent)' }}>
          View on explorer <ExternalLink className="size-3.5" />
        </a>
      )}
      <button onClick={onAgain} className="mt-6 rounded-2xl py-3.5 px-8 text-sm font-bold text-white" style={{ background: 'var(--accent)' }}>
        Back to naira account
      </button>
    </div>
  )
}

// ── local bits ──────────────────────────────────────────────────────────────

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-center py-16">{children}</div>
}

function Action({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-2xl p-4 text-left transition-all active:scale-[0.98]"
      style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}>
      <div className="size-9 rounded-xl flex items-center justify-center mb-2.5" style={{ background: 'rgba(5,150,105,0.1)', color: '#059669' }}>{icon}</div>
      <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{title}</div>
      <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{sub}</div>
    </button>
  )
}
