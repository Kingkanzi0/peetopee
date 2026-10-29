/**
 * SendUsdcByPtpId — send USDC on Arc to another Peetopee user by @handle or email.
 *
 * As you type, the recipient is looked up automatically and shown with their
 * photo. The search button (or Enter) looks up immediately.
 * Sends from your Wallet account using the built-in wallet.
 */
import { useEffect, useRef, useState } from 'react'
import type { Address } from 'viem'
import {
  Search, CheckCircle2, AlertCircle, ArrowLeft, ChevronRight,
  Wallet, ExternalLink, Loader2, BadgeCheck,
} from 'lucide-react'
import { apiLookup, ApiError, type PtpApiUser } from '../auth/ptpApi'
import { useAuth } from '../auth/AuthContext'
import {
  useAppWallet, useUsdcBalance, maxSendable, sendUsdcOnArc, waitForArcTx, friendlyTxError, GAS_RESERVE_USDC,
} from '../wallet/appWallet'
import { recordTx, updateTxStatus, explorerTxUrl } from '../history/txHistory'
import { TransactionHistory } from './TransactionHistory'
import { useMoney } from '../hooks/useMoney'

const ARC_CHAIN_ID = 5042002
const LOOKUP_DELAY_MS = 450

interface Props { onBack: () => void }
type Step = 'lookup' | 'amount' | 'confirm' | 'success'

export function Avatar({ user, size = 48 }: { user: Pick<PtpApiUser, 'displayName' | 'avatarUrl'>; size?: number }) {
  const initials = user.displayName.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
  if (user.avatarUrl) {
    return (
      <img src={user.avatarUrl} alt={user.displayName} width={size} height={size}
        className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
    )
  }
  return (
    <div className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36, background: 'linear-gradient(135deg, #122d45, #6c3fc5)' }}>
      {initials}
    </div>
  )
}

/** Looks like something worth looking up: @abc, abc (3+ chars), or a full email. */
function isLookupable(q: string) {
  const v = q.trim()
  if (v.includes('@') && !v.startsWith('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  return /^@?[a-zA-Z0-9_]{3,20}$/.test(v)
}

export function SendUsdcByPtpId({ onBack }: Props) {
  const { profile } = useAuth()
  const { wallet, unlocked } = useAppWallet()
  const { balance, refresh: refreshBalance } = useUsdcBalance(wallet?.address)

  const [step, setStep] = useState<Step>('lookup')
  const [identifier, setIdentifier] = useState('')
  const [recipient, setRecipient] = useState<PtpApiUser | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [amount, setAmount] = useState('')
  const [sending, setSending] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [errMsg, setErrMsg] = useState('')
  const lookupSeq = useRef(0)

  // Amounts can be typed in local currency (e.g. ₦) or USDC; USDC is what's actually sent.
  const money = useMoney()
  const [inLocal, setInLocal] = useState(money.showLocal)
  const typed = parseFloat(amount.replace(/,/g, '')) || 0
  const amountNum = inLocal ? Math.floor((money.toUsdc(typed) ?? 0) * 1e6) / 1e6 : typed
  const localLabel = money.local(amountNum) // e.g. "₦10,000"
  const recipientAddress = (recipient?.walletAddresses[ARC_CHAIN_ID] ?? null) as Address | null
  const isSelf = !!recipient && recipient.ptpId === profile?.ptpId
  const maxAmount = maxSendable(balance)
  const tooMuch = amountNum > 0 && balance != null && amountNum > maxAmount

  async function lookup(q: string) {
    const trimmed = q.trim()
    if (!trimmed) return
    const seq = ++lookupSeq.current
    setLookingUp(true)
    setLookupError('')
    try {
      const found = await apiLookup(trimmed)
      if (seq !== lookupSeq.current) return // a newer lookup is running
      setRecipient(found)
      if (!found) setLookupError(`No Peetopee user found for "${trimmed}".`)
      else if (!found.walletAddresses[ARC_CHAIN_ID]) {
        setLookupError(`${found.displayName} hasn't set up their Peetopee wallet yet. Ask them to open the Wallet tab.`)
      }
    } catch (e) {
      if (seq !== lookupSeq.current) return
      setRecipient(null)
      setLookupError(e instanceof ApiError ? e.message : 'Lookup failed. Please try again.')
    } finally {
      if (seq === lookupSeq.current) setLookingUp(false)
    }
  }

  // Auto-lookup while typing.
  useEffect(() => {
    if (step !== 'lookup' || !isLookupable(identifier)) return
    const t = setTimeout(() => { void lookup(identifier) }, LOOKUP_DELAY_MS)
    return () => clearTimeout(t)
  }, [identifier, step]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSend() {
    if (!recipientAddress || amountNum <= 0 || !recipient) return
    if (tooMuch) { setErrMsg(`You can send up to ${maxAmount} USDC (we keep ${GAS_RESERVE_USDC} for the network fee).`); return }
    setSending(true)
    setErrMsg('')
    let hash: string | null = null
    try {
      const sent = await sendUsdcOnArc('wallet', recipientAddress, amountNum.toFixed(6))
      hash = sent
      setTxHash(sent)
      recordTx({
        hash: sent, chainId: ARC_CHAIN_ID, kind: 'sent', amount: String(amountNum), counterparty: recipient.ptpId,
        note: inLocal && money.country ? `${money.country.currencySymbol}${typed.toLocaleString()} · ${recipient.displayName}` : recipient.displayName,
      })
      await waitForArcTx(sent)
      updateTxStatus(sent, 'confirmed')
      refreshBalance()
      setStep('success')
    } catch (e) {
      if (hash) updateTxStatus(hash, 'failed')
      setErrMsg(friendlyTxError(e))
    } finally {
      setSending(false)
    }
  }

  function reset() {
    setStep('lookup'); setIdentifier(''); setRecipient(null); setAmount(''); setTxHash(null); setErrMsg(''); setLookupError('')
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (step === 'success') return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="size-20 rounded-full flex items-center justify-center mb-5" style={{ background: 'rgba(22,163,74,0.1)' }}>
        <CheckCircle2 className="size-10 text-green-500" />
      </div>
      <h2 className="text-2xl font-black mb-1 display" style={{ color: 'var(--ink)' }}>USDC sent!</h2>
      <p className="text-base font-semibold mb-1" style={{ color: 'var(--ink)' }}>
        {inLocal && money.country ? `${money.country.currencySymbol}${typed.toLocaleString()}` : `${amountNum.toLocaleString()} USDC`} → {recipient?.displayName}
      </p>
      <p className="text-sm mb-1" style={{ color: 'var(--muted)' }}>{recipient?.ptpId} · Arc</p>
      {txHash && (
        <a href={explorerTxUrl(txHash)} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm font-semibold mb-6" style={{ color: 'var(--accent)' }}>
          View on explorer <ExternalLink className="size-3.5" />
        </a>
      )}
      <button onClick={reset} className="rounded-2xl py-3.5 px-8 text-sm font-bold text-white" style={{ background: 'var(--accent)' }}>
        Send again
      </button>
    </div>
  )

  // ── Confirm ────────────────────────────────────────────────────────────────
  if (step === 'confirm' && recipient) return (
    <div className="max-w-md mx-auto px-4 py-4">
      <button onClick={() => setStep('amount')} disabled={sending} className="flex items-center gap-1.5 text-sm mb-6" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="size-4" /> Back
      </button>
      <h2 className="text-xl font-bold mb-5 display" style={{ color: 'var(--ink)' }}>Confirm transfer</h2>
      <div className="rounded-2xl p-5 mb-4 space-y-3.5" style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}>
        <div className="flex items-center gap-3 pb-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
          <Avatar user={recipient} size={44} />
          <div className="min-w-0">
            <div className="font-bold text-sm flex items-center gap-1" style={{ color: 'var(--ink)' }}>
              {recipient.displayName}
              {recipient.idVerified && <BadgeCheck className="size-4 text-blue-600" />}
            </div>
            <div className="text-xs font-mono" style={{ color: 'var(--muted)' }}>{recipient.ptpId}</div>
          </div>
        </div>
        <Row label="Network" value="Arc" />
        {inLocal && money.country && <Row label="They get" value={`${money.country.currencySymbol}${typed.toLocaleString()} (≈)`} bold />}
        <Row label={inLocal ? 'USDC sent' : 'Amount'} value={`${amountNum.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`} bold={!inLocal} />
        <Row label="Network fee" value="< 0.01 USDC" />
        <div className="pt-2.5" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>Recipient wallet</p>
          <p className="text-xs font-mono mt-0.5 break-all" style={{ color: 'var(--muted)' }}>{recipientAddress}</p>
        </div>
      </div>
      {errMsg && <p className="text-xs text-center mb-3" style={{ color: 'var(--danger)' }}>{errMsg}</p>}
      <button
        onClick={() => void handleSend()}
        disabled={sending}
        className="w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-[0.98]"
        style={{ background: 'var(--accent)' }}
      >
        {sending ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : <>Send {inLocal && localLabel ? `${money.country!.currencySymbol}${typed.toLocaleString()}` : `${amountNum} USDC`} <ChevronRight className="size-4" /></>}
      </button>
    </div>
  )

  // ── Amount ─────────────────────────────────────────────────────────────────
  if (step === 'amount' && recipient) return (
    <div className="max-w-md mx-auto px-4 py-4">
      <button onClick={() => setStep('lookup')} className="flex items-center gap-1.5 text-sm mb-5" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="size-4" /> Back
      </button>
      <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3 mb-5"
        style={{ background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.2)' }}>
        <Avatar user={recipient} size={40} />
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{recipient.displayName}</p>
          <p className="text-xs font-mono" style={{ color: 'var(--muted)' }}>{recipient.ptpId}</p>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex justify-between items-center mb-1.5">
          {money.hasLocal ? (
            <div className="flex rounded-lg p-0.5" style={{ background: 'var(--surface-muted)' }}>
              {([true, false] as const).map(local => (
                <button key={String(local)} onClick={() => { setInLocal(local); setAmount('') }}
                  className="rounded-md px-2.5 py-1 text-xs font-semibold"
                  style={{ background: inLocal === local ? 'var(--chip)' : 'transparent', color: inLocal === local ? 'var(--ink)' : 'var(--muted)' }}>
                  {local ? money.country!.currency : 'USDC'}
                </button>
              ))}
            </div>
          ) : (
            <label className="text-xs font-semibold" style={{ color: 'var(--subtle)' }}>AMOUNT (USDC)</label>
          )}
          <button className="text-xs font-semibold" style={{ color: 'var(--accent)' }} disabled={balance == null}
            onClick={() => setAmount(inLocal ? String(Math.floor(money.toLocal(maxAmount) ?? 0)) : String(maxAmount))}>
            Wallet: {balance == null ? '…' : money.primary(balance)} · Max
          </button>
        </div>
        <input
          type="text" inputMode="decimal" placeholder={inLocal ? `${money.country?.currencySymbol ?? ''}0` : '0.00'} value={amount}
          onChange={e => {
            const v = e.target.value.replace(/[^0-9.]/g, '')
            if (inLocal ? /^\d*\.?\d{0,2}$/.test(v) : /^\d*\.?\d{0,6}$/.test(v)) setAmount(v)
          }}
          className="w-full rounded-2xl px-4 py-4 text-2xl font-black outline-none text-center"
          style={{
            background: 'var(--surface-muted)',
            border: `1.5px solid ${tooMuch ? 'var(--danger)' : 'var(--border)'}`,
            color: 'var(--ink)',
            fontSize: 'max(16px, 1.5rem)',
          }}
        />
        {amountNum > 0 && !tooMuch && (
          <p className="text-xs mt-1.5 text-center tabular-nums" style={{ color: 'var(--muted)' }}>
            {inLocal ? `= ${amountNum.toLocaleString(undefined, { maximumFractionDigits: 4 })} USDC` : localLabel ? `≈ ${localLabel}` : ''}
          </p>
        )}
        {tooMuch && (
          <p className="text-xs mt-1.5 text-center" style={{ color: 'var(--danger)' }}>
            Max {money.primary(maxAmount)} — we keep {GAS_RESERVE_USDC} USDC for the network fee.
          </p>
        )}
        {inLocal && (
          <p className="text-[11px] mt-1 text-center" style={{ color: 'var(--subtle)' }}>
            Sent as USDC at today's rate. It arrives in their Peetopee account instantly, and they can send it on to any bank.
          </p>
        )}
      </div>

      <button
        onClick={() => { setErrMsg(''); setStep('confirm') }}
        disabled={amountNum <= 0 || tooMuch || !unlocked}
        className="w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 transition-all active:scale-[0.98]"
        style={{ background: 'var(--accent)' }}
      >
        Review transfer <ChevronRight className="size-4" />
      </button>
    </div>
  )

  // ── Lookup ─────────────────────────────────────────────────────────────────
  const canContinue = !!recipient && !!recipientAddress && !isSelf && !!wallet
  return (
    <div className="max-w-md mx-auto px-4 py-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm mb-6" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="size-4" /> Back
      </button>
      <h2 className="text-xl font-bold mb-1 display" style={{ color: 'var(--ink)' }}>Send USDC by Peetopee ID</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>Type a @handle or email — no wallet address needed.</p>

      <div className="mb-4">
        <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--subtle)' }}>RECIPIENT</label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="@handle or email"
            value={identifier}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={e => { setIdentifier(e.target.value); setRecipient(null); setLookupError('') }}
            onKeyDown={e => { if (e.key === 'Enter') void lookup(identifier) }}
            className="flex-1 rounded-2xl px-4 py-3.5 text-sm outline-none"
            style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)', color: 'var(--ink)', fontSize: 'max(16px, 0.875rem)' }}
          />
          <button onClick={() => { void lookup(identifier) }} disabled={!identifier.trim() || lookingUp}
            aria-label="Search"
            className="rounded-2xl px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-40 active:scale-[0.97]"
            style={{ background: 'var(--accent)' }}>
            {lookingUp ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          </button>
        </div>

        {lookupError && (
          <div className="mt-2 rounded-xl px-3 py-2.5 flex items-start gap-2"
            style={{ background: 'rgba(186,43,76,0.06)', border: '1px solid rgba(186,43,76,0.15)' }}>
            <AlertCircle className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
            <p className="text-xs" style={{ color: 'var(--danger)' }}>{lookupError}</p>
          </div>
        )}

        {recipient && (
          <button
            onClick={() => canContinue && setStep('amount')}
            disabled={!canContinue}
            className="mt-3 w-full text-left rounded-2xl p-4 flex items-center gap-3 transition-all active:scale-[0.99]"
            style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}
          >
            <Avatar user={recipient} size={52} />
            <div className="flex-1 min-w-0">
              <p className="font-bold flex items-center gap-1" style={{ color: 'var(--ink)' }}>
                <span className="truncate">{recipient.displayName}</span>
                {recipient.idVerified && <BadgeCheck className="size-4 shrink-0 text-blue-600" />}
              </p>
              <p className="text-xs font-mono truncate" style={{ color: 'var(--muted)' }}>{recipient.ptpId}</p>
              {isSelf && <p className="text-xs mt-0.5" style={{ color: 'var(--danger)' }}>That's you!</p>}
            </div>
            {canContinue && <CheckCircle2 className="size-5 text-green-500 shrink-0" />}
          </button>
        )}
      </div>

      {!wallet && (
        <div className="rounded-2xl px-4 py-3 mb-4 flex items-start gap-2"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <Wallet className="size-4 mt-0.5 shrink-0" style={{ color: '#d97706' }} />
          <p className="text-xs" style={{ color: 'var(--warn-ink)' }}>Create a wallet in the Wallet tab first to send USDC.</p>
        </div>
      )}

      <button
        onClick={() => setStep('amount')}
        disabled={!canContinue}
        className="w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 transition-all active:scale-[0.98]"
        style={{ background: 'var(--accent)' }}
      >
        Continue <ChevronRight className="size-4" />
      </button>

      <div className="mt-8">
        <TransactionHistory compact filter={e => e.kind === 'sent' || e.kind === 'received'} title="Recent transfers" />
      </div>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span className={bold ? 'font-bold text-base' : 'font-semibold'} style={{ color: 'var(--ink)' }}>{value}</span>
    </div>
  )
}
