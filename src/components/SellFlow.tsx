import { useEffect, useRef, useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi, keccak256, stringToBytes, parseEventLogs } from 'viem'
import { ArrowLeft, Loader2, Lock, AlertTriangle, ArrowDownToLine } from 'lucide-react'
import {
  PEETOPEE_ESCROW,
  PEETOPEE_ESCROW_ADDRESS,
  USDC_ADDRESS,
  ARC_TESTNET_CHAIN_ID,
  CountryDef,
  TraderProfile,
  formatRate,
  calcLocalAmount,
} from '../contracts/peetopee'
import { Amount, parseAmount, usdcDecimalsFor } from '../onchain-money'
import {
  maxSendable, friendlyTxError, useAppWallet, useUsdcBalance, sendUsdcOnArc, waitForArcTx,
} from '../wallet/appWallet'
import { recordTx, updateTxStatus } from '../history/txHistory'
import { KycGate } from './KycFlow'
import { uploadBankDetails } from './TradeBankDetails'

interface Props {
  country: CountryDef
  trader: TraderProfile
  onBack: () => void
  onTradeCreated: (tradeId: bigint) => void
  /** Opens the Funds tab so the user can move USDC Wallet → Funds. */
  onAddFunds: () => void
  /** Skip straight to the confirm step with these values (used by "Send to bank"). */
  prefill?: { amount: string; bankDetails: string }
}

type Step = 'amount' | 'bank' | 'confirm' | 'approving' | 'locking' | 'sharing'

export function SellFlow(props: Props) {
  return (
    <KycGate reason="To sell USDC you need a verified ID. Traders only deal with verified sellers, and you only deal with verified traders.">
      <SellFlowInner {...props} />
    </KycGate>
  )
}

function SellFlowInner({ country, trader, onBack, onTradeCreated, onAddFunds, prefill }: Props) {
  const { address } = useAccount() // your Funds account (built-in wallet)
  const decimals = usdcDecimalsFor(ARC_TESTNET_CHAIN_ID)

  const [step, setStep] = useState<Step>(prefill ? 'confirm' : 'amount')
  const [amount, setAmount] = useState(prefill?.amount ?? '')
  const [bankDetails, setBankDetails] = useState(prefill?.bankDetails ?? '')
  const [error, setError] = useState('')
  const handledReceipt = useRef<string | null>(null)

  const parsedUsdc = (() => {
    try { return parseAmount(ARC_TESTNET_CHAIN_ID, amount).raw } catch { return 0n }
  })()

  const minOk = parsedUsdc >= trader.minOrderUsdc
  const maxOk = parsedUsdc <= trader.maxOrderUsdc

  const localAmount = parsedUsdc > 0n ? calcLocalAmount(parsedUsdc, trader.exchangeRate) : 0n
  const localFmt = (Number(localAmount) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })
  const minFmt = Amount.fromRaw(trader.minOrderUsdc, decimals).toFixed(0)
  const maxFmt = Amount.fromRaw(trader.maxOrderUsdc, decimals).toFixed(0)

  // Funds balance
  const { data: rawBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 10_000 },
  })
  const balance = rawBalance != null ? Number(Amount.fromRaw(rawBalance, decimals).toFixed(6)) : null
  const sellable = maxSendable(balance)
  const enoughFunds = balance != null && Number(amount || 0) <= sellable
  const amountValid = parsedUsdc > 0n && minOk && maxOk && enoughFunds

  // Allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, PEETOPEE_ESCROW_ADDRESS] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address },
  })
  const needsApproval = allowance == null || allowance < parsedUsdc

  const { writeContract: approve, data: approveTxHash, error: approveError } = useWriteContract()
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash })

  const { writeContract: createTrade, data: createTxHash, error: createError } = useWriteContract()
  const { isSuccess: createSuccess, data: createReceipt } = useWaitForTransactionReceipt({ hash: createTxHash })

  const trimmedDetails = bankDetails.trim()
  const detailsHash = trimmedDetails ? keccak256(stringToBytes(trimmedDetails)) : ''

  function doCreateTrade() {
    setStep('locking')
    createTrade({
      ...PEETOPEE_ESCROW,
      functionName: 'createTrade',
      // Only a hash of the bank details goes on-chain; the details themselves go to the Peetopee server.
      args: [trader.traderAddr as `0x${string}`, parsedUsdc, localAmount, detailsHash],
    })
  }

  // Approval confirmed → lock in escrow.
  useEffect(() => {
    if (approveSuccess && step === 'approving') {
      void refetchAllowance()
      doCreateTrade()
    }
  }, [approveSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  // Trade created → share bank details privately, then open the trade.
  useEffect(() => {
    if (!createSuccess || !createReceipt || handledReceipt.current === createReceipt.transactionHash) return
    handledReceipt.current = createReceipt.transactionHash
    const [created] = parseEventLogs({
      abi: PEETOPEE_ESCROW.abi,
      logs: createReceipt.logs.filter(l => l.address.toLowerCase() === PEETOPEE_ESCROW_ADDRESS.toLowerCase()),
      eventName: 'TradeCreated',
    }) as unknown as { args: { tradeId: bigint } }[]
    if (!created) { setError('The trade was created but its ID could not be read. Check your Trader or history.'); setStep('confirm'); return }
    const tradeId = created.args.tradeId
    recordTx({
      hash: createReceipt.transactionHash, chainId: ARC_TESTNET_CHAIN_ID, kind: 'escrow_lock',
      amount: amount, counterparty: 'Escrow', note: `Trade #${tradeId} · ${country.currency}`, status: 'confirmed',
    })
    setStep('sharing')
    void uploadBankDetails(tradeId, trimmedDetails).finally(() => onTradeCreated(tradeId))
  }, [createSuccess, createReceipt]) // eslint-disable-line react-hooks/exhaustive-deps

  // Wallet errors → back to confirm with a readable message.
  useEffect(() => {
    const e = approveError ?? createError
    if (!e) return
    setError(friendlyTxError(e))
    if (createTxHash) updateTxStatus(createTxHash, 'failed')
    setStep('confirm')
  }, [approveError, createError]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleConfirm() {
    setError('')
    if (needsApproval) {
      setStep('approving')
      approve({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [PEETOPEE_ESCROW_ADDRESS, parsedUsdc] })
    } else {
      doCreateTrade()
    }
  }

  const fee = (parsedUsdc * 50n) / 10_000n
  const feeUsdcFmt = Amount.fromRaw(fee, decimals).toFixed(4)
  const isProcessing = step === 'approving' || step === 'locking' || step === 'sharing'

  if (!address) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>Set up your Peetopee wallet in the Wallet tab to sell USDC.</p>
        <button onClick={onBack} className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>Back</button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }} disabled={isProcessing}>
        <ArrowLeft className="size-4" />
        {prefill ? 'Back' : 'Back to traders'}
      </button>

      {/* Trader summary */}
      <div className="mb-4 flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
        <span className="text-xl">{country.flag}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {trader.traderAddr.slice(0, 6)}...{trader.traderAddr.slice(-4)}
          </div>
          <div className="text-xs truncate" style={{ color: 'var(--muted)' }}>
            {formatRate(trader.exchangeRate, trader.currencyCode)} per USDC · {trader.paymentMethods}
          </div>
        </div>
      </div>

      {step === 'amount' && (
        <div>
          <h2 className="display mb-4 text-xl font-bold" style={{ color: 'var(--ink)' }}>How much USDC to sell?</h2>

          <div className="rounded-2xl p-4" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <input
              inputMode="decimal"
              value={amount}
              onChange={e => {
                const v = e.target.value.replace(/[^0-9.]/g, '')
                if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) setAmount(v)
              }}
              placeholder="0.00"
              className="display w-full bg-transparent font-bold tabular-nums outline-none placeholder:text-slate-300"
              style={{ color: 'var(--ink)', fontSize: 'clamp(28px, 9vw, 40px)' }}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>USDC</span>
              <button
                onClick={() => setAmount(String(sellable))}
                className="text-xs font-semibold"
                style={{ color: 'var(--accent-hover)' }}
              >
                Funds: {balance == null ? '…' : balance.toFixed(2)} · Max
              </button>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between text-xs px-1">
            <span style={{ color: 'var(--subtle)' }}>Min: ${minFmt} · Max: ${maxFmt}</span>
            {parsedUsdc > 0n && !minOk && <span style={{ color: 'var(--danger)' }}>Below minimum</span>}
            {parsedUsdc > 0n && !maxOk && <span style={{ color: 'var(--danger)' }}>Above maximum</span>}
          </div>

          {parsedUsdc > 0n && balance != null && !enoughFunds && (
            <TopUpFunds shortfall={Number(amount) - sellable} onDone={() => { void refetchBalance() }} onAddFunds={onAddFunds} />
          )}

          {parsedUsdc > 0n && amountValid && (
            <div className="mt-4 rounded-2xl p-4 space-y-2" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--muted)' }}>You'll receive</span>
                <span className="display text-xl font-bold tabular-nums" style={{ color: 'var(--success)' }}>
                  {country.currencySymbol}{localFmt} {trader.currencyCode}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--subtle)' }}>Platform fee (0.5%)</span>
                <span className="mono tabular-nums" style={{ color: 'var(--muted)' }}>{feeUsdcFmt} USDC</span>
              </div>
            </div>
          )}

          <button
            disabled={!amountValid}
            onClick={() => setStep('bank')}
            className="mt-4 w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--accent)' }}
          >
            Continue
          </button>
        </div>
      )}

      {step === 'bank' && (
        <div>
          <h2 className="display mb-2 text-xl font-bold" style={{ color: 'var(--ink)' }}>Where should the money go?</h2>
          <p className="mb-4 text-sm" style={{ color: 'var(--muted)' }}>
            Your bank or mobile-money account — or a shop's account if you're paying someone directly. The trader sends {trader.currencyCode} here.
          </p>

          <div className="flex items-start gap-2 rounded-xl p-3 mb-4" style={{ background: 'rgba(26,128,71,0.06)', border: '1px solid rgba(26,128,71,0.15)' }}>
            <Lock className="size-4 mt-0.5 shrink-0" style={{ color: 'var(--success)' }} />
            <p className="text-xs" style={{ color: 'var(--success)' }}>
              Only the trader you picked can see these details. They are not put on the blockchain.
            </p>
          </div>

          <textarea
            rows={4}
            value={bankDetails}
            maxLength={1000}
            onChange={e => setBankDetails(e.target.value)}
            placeholder="Bank name, account number, account name (and sort code / routing number if needed)"
            className="w-full rounded-2xl p-4 outline-none resize-none"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
          />

          <div className="mt-3 flex gap-2">
            <button onClick={() => setStep('amount')} className="flex-1 rounded-2xl py-3.5 text-sm font-semibold" style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}>
              Back
            </button>
            <button
              disabled={!trimmedDetails}
              onClick={() => setStep('confirm')}
              className="flex-1 rounded-2xl py-3.5 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--accent)' }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div>
          <h2 className="display mb-4 text-xl font-bold" style={{ color: 'var(--ink)' }}>Confirm trade</h2>

          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            <Row label="You lock" value={`${amount} USDC`} bold />
            <Row label={prefill ? 'They receive' : 'You receive'} value={`${country.currencySymbol}${localFmt} ${trader.currencyCode}`} bold success />
            {prefill && (
              <div className="rounded-xl p-3 text-xs whitespace-pre-wrap" style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}>
                {trimmedDetails}
              </div>
            )}
            <div className="border-t" style={{ borderColor: 'var(--border)' }} />
            <Row label="Trader" value={`${trader.traderAddr.slice(0, 6)}...${trader.traderAddr.slice(-4)}`} />
            <Row label="Rate" value={formatRate(trader.exchangeRate, trader.currencyCode) + ' / USDC'} />
            <Row label="Platform fee" value={`${feeUsdcFmt} USDC`} />
            <Row label="Payment via" value={trader.paymentMethods} />
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-xl p-3" style={{ background: 'rgba(26,128,71,0.06)', border: '1px solid rgba(26,128,71,0.15)' }}>
            <Lock className="size-4 shrink-0" style={{ color: 'var(--success)' }} />
            <p className="text-xs" style={{ color: 'var(--success)' }}>
              Your USDC goes into a smart contract and is only released after you confirm the money arrived.
            </p>
          </div>

          {balance != null && !enoughFunds && (
            <TopUpFunds shortfall={Number(amount) - sellable} onDone={() => { void refetchBalance() }} onAddFunds={onAddFunds} />
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-xl p-3" style={{ background: 'rgba(186,43,76,0.06)', border: '1px solid rgba(186,43,76,0.15)' }}>
              <AlertTriangle className="size-4 mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
              <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button onClick={() => setStep('bank')} className="flex-1 rounded-2xl py-3.5 text-sm font-semibold" style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}>
              Back
            </button>
            <button
              onClick={handleConfirm}
              disabled={!amountValid}
              className="flex-1 rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              Lock in escrow
            </button>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="py-12 text-center space-y-4">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full" style={{ background: 'var(--surface-muted)' }}>
            <Loader2 className="size-8 animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h3 className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
              {step === 'approving' ? 'Preparing your USDC…' : step === 'locking' ? 'Locking in escrow…' : 'Sharing bank details with the trader…'}
            </h3>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>This takes a few seconds. Please keep the app open.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, bold, success }: { label: string; value: string; bold?: boolean; success?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className={`text-sm tabular-nums text-right ${bold ? 'font-semibold' : ''}`} style={{ color: success ? 'var(--success)' : 'var(--ink)' }}>
        {value}
      </span>
    </div>
  )
}

/**
 * Shown when the Funds balance is short. Moves the difference from the Wallet in
 * one tap, so users don't have to think about Wallet vs Funds.
 */
function TopUpFunds({ shortfall, onDone, onAddFunds }: { shortfall: number; onDone: () => void; onAddFunds: () => void }) {
  const { wallet } = useAppWallet()
  const { balance: walletBalance, refresh } = useUsdcBalance(wallet?.address)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const need = Math.ceil(shortfall * 100) / 100 // round up to the cent
  const canCover = walletBalance != null && maxSendable(walletBalance) >= need

  async function move() {
    if (!wallet) return
    setBusy(true)
    setErr('')
    try {
      const hash = await sendUsdcOnArc('wallet', wallet.fundsAddress, need.toFixed(6))
      recordTx({ hash, chainId: ARC_TESTNET_CHAIN_ID, kind: 'to_funds', amount: String(need), counterparty: 'Funds' })
      await waitForArcTx(hash)
      updateTxStatus(hash, 'confirmed')
      refresh()
      onDone()
    } catch (e) {
      setErr(friendlyTxError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 rounded-2xl p-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
      <div className="flex items-center gap-3">
        <p className="flex-1 text-xs" style={{ color: '#92400e' }}>
          {canCover
            ? `You need ${need.toFixed(2)} more USDC in Funds. Move it from your Wallet?`
            : `You need ${need.toFixed(2)} more USDC. Your Wallet doesn't have enough either — add USDC first.`}
        </p>
        <button onClick={canCover ? () => { void move() } : onAddFunds} disabled={busy}
          className="shrink-0 rounded-xl px-3 py-2 text-xs font-semibold text-white flex items-center gap-1 disabled:opacity-60"
          style={{ background: 'var(--accent)' }}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowDownToLine className="size-3.5" />}
          {busy ? 'Moving…' : canCover ? `Move ${need.toFixed(2)} USDC` : 'Add USDC'}
        </button>
      </div>
      {err && <p className="text-xs mt-2" style={{ color: 'var(--danger)' }}>{err}</p>}
    </div>
  )
}
