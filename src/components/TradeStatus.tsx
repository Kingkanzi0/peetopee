import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { CheckCircle2, Clock, AlertTriangle, MessageCircle, Loader2, ArrowLeft, Star } from 'lucide-react'
import {
  PEETOPEE_ESCROW,
  ARC_TESTNET_CHAIN_ID,
  TradeStatus as TS,
  TRADE_STATUS_LABELS,
  Trade,
} from '../contracts/peetopee'
import { Amount, usdcDecimalsFor } from '../onchain-money'

interface Props {
  tradeId: bigint
  onBack: () => void
}

const STEP_ORDER = [TS.Created, TS.FiatSent, TS.Completed]

export function TradeStatusScreen({ tradeId, onBack }: Props) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongChain = chainId !== ARC_TESTNET_CHAIN_ID

  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)

  const { data: rawTrade, refetch } = useReadContract({
    ...PEETOPEE_ESCROW,
    functionName: 'getTrade',
    args: [tradeId],
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { refetchInterval: 5000 },
  })

  const trade = rawTrade as Trade | undefined
  const status = trade ? (trade.status) : undefined

  const isSeller = trade && address && trade.seller.toLowerCase() === address.toLowerCase()
  const isTrader = trade && address && trade.trader.toLowerCase() === address.toLowerCase()

  const usdcFmt = trade ? Amount.fromRaw(trade.usdcAmount, usdcDecimalsFor(ARC_TESTNET_CHAIN_ID)).toFixed(2) : '...'

  const [nowSec] = useState(() => Math.floor(performance.timeOrigin / 1000 + performance.now() / 1000))
  const timeLeft = trade && status === TS.Created
    ? Math.max(0, Number(trade.createdAt) + 86400 - nowSec)
    : 0
  const hoursLeft = Math.floor(timeLeft / 3600)
  const minsLeft = Math.floor((timeLeft % 3600) / 60)

  // Mark fiat sent (trader)
  const { writeContract: markFiatSent, data: markTxHash, isPending: markPending } = useWriteContract()
  const { isLoading: markConfirming } = useWaitForTransactionReceipt({ hash: markTxHash })

  // Confirm received (seller)
  const { writeContract: confirmReceived, data: confirmTxHash, isPending: confirmPending } = useWriteContract()
  const { isLoading: confirmConfirming } = useWaitForTransactionReceipt({ hash: confirmTxHash })

  // Open dispute
  const { writeContract: openDispute, data: disputeTxHash, isPending: disputePending } = useWriteContract()
  const { isLoading: disputeConfirming } = useWaitForTransactionReceipt({ hash: disputeTxHash })

  // Cancel trade (seller, after expiry)
  const { writeContract: cancelTrade, data: cancelTxHash, isPending: cancelPending } = useWriteContract()
  const { isLoading: cancelConfirming } = useWaitForTransactionReceipt({ hash: cancelTxHash })

  // Rate trader
  const { writeContract: rateTrader, data: rateTxHash, isPending: ratePending } = useWriteContract()
  const { isLoading: rateConfirming } = useWaitForTransactionReceipt({ hash: rateTxHash })

  // Refetch after any tx confirmation
  useEffect(() => { void refetch() }, [refetch, markTxHash, confirmTxHash, disputeTxHash, cancelTxHash, rateTxHash])

  function doAction(fn: () => void) {
    if (wrongChain) { switchChain({ chainId: ARC_TESTNET_CHAIN_ID }); return }
    fn()
  }

  if (!trade) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8 text-center">
        <Loader2 className="mx-auto size-8 animate-spin" style={{ color: 'var(--accent)' }} />
        <p className="mt-4 text-sm" style={{ color: 'var(--muted)' }}>Loading trade...</p>
      </div>
    )
  }

  const isTerminal = status === TS.Completed || status === TS.Cancelled || status === TS.Resolved
  const isDisputed = status === TS.Disputed

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="size-4" />
        Back
      </button>

      {/* Trade ID + amount card */}
      <div className="mb-4 rounded-2xl p-4" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>
            Trade #{tradeId.toString()}
          </span>
          <StatusBadge status={status!} />
        </div>

        <div className="display text-3xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
          {usdcFmt} <span className="text-lg" style={{ color: 'var(--muted)' }}>USDC</span>
        </div>

        <div className="mt-1 text-xs" style={{ color: 'var(--subtle)' }}>
          Seller: {trade.seller.slice(0, 6)}...{trade.seller.slice(-4)} →
          Trader: {trade.trader.slice(0, 6)}...{trade.trader.slice(-4)}
        </div>
      </div>

      {/* Progress stepper */}
      {!isTerminal && !isDisputed && (
        <div className="mb-4 rounded-2xl p-4" style={{ background: 'var(--surface-muted)' }}>
          {/* Row: circles connected by lines */}
          <div className="flex items-center">
            {STEP_ORDER.map((s, i) => {
              const done = (status as unknown as TS) > s
              const active = status === s
              return (
                <div key={s} className="flex flex-1 items-center">
                  {/* Circle */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div
                      className="flex size-8 items-center justify-center rounded-full text-xs font-bold"
                      style={{
                        background: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--border)',
                        color: done || active ? 'white' : 'var(--muted)',
                      }}
                    >
                      {done ? <CheckCircle2 className="size-4" /> : i + 1}
                    </div>
                    <span className="text-[11px] text-center whitespace-nowrap" style={{ color: active ? 'var(--ink)' : 'var(--subtle)' }}>
                      {['Locked', 'Fiat Sent', 'Done'][i]}
                    </span>
                  </div>
                  {/* Connector line — only between steps */}
                  {i < 2 && (
                    <div
                      className="flex-1 h-0.5 mx-1 mb-4"
                      style={{ background: done ? 'var(--success)' : 'var(--border)' }}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Dispute status */}
      {isDisputed && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl p-4" style={{ background: 'rgba(186,43,76,0.06)', border: '1px solid rgba(186,43,76,0.2)' }}>
          <AlertTriangle className="size-5 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>Dispute in progress</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              An admin is reviewing this trade. Funds are locked safely in escrow until resolved.
            </p>
          </div>
        </div>
      )}

      {/* Completed */}
      {(status === TS.Completed || status === TS.Resolved) && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl p-4" style={{ background: 'rgba(26,128,71,0.06)', border: '1px solid rgba(26,128,71,0.2)' }}>
          <CheckCircle2 className="size-5 shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
            {status === TS.Resolved ? 'Dispute resolved' : 'Trade completed successfully!'}
          </p>
        </div>
      )}

      {/* Timer */}
      {status === TS.Created && timeLeft > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-muted)' }}>
          <Clock className="size-4" style={{ color: 'var(--muted)' }} />
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            Trader has {hoursLeft}h {minsLeft}m to mark fiat sent
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        {/* Trader: mark fiat sent */}
        {isTrader && status === TS.Created && (
          <ActionButton
            label="Mark Fiat Sent"
            pending={markPending || markConfirming}
            onClick={() => doAction(() => markFiatSent({ ...PEETOPEE_ESCROW, functionName: 'markFiatSent', args: [tradeId] }))}
            description="Confirm you have sent the local currency to the seller's bank account."
          />
        )}

        {/* Seller: confirm received */}
        {isSeller && status === TS.FiatSent && (
          <ActionButton
            label="Confirm Received"
            pending={confirmPending || confirmConfirming}
            onClick={() => doAction(() => confirmReceived({ ...PEETOPEE_ESCROW, functionName: 'confirmReceived', args: [tradeId] }))}
            description="Only confirm after you have received the fiat in your bank account. This releases USDC to the trader."
            success
          />
        )}

        {/* Either party: open dispute */}
        {(isSeller || isTrader) && (status === TS.Created || status === TS.FiatSent) && (
          <ActionButton
            label="Open Dispute"
            pending={disputePending || disputeConfirming}
            onClick={() => doAction(() => openDispute({ ...PEETOPEE_ESCROW, functionName: 'openDispute', args: [tradeId] }))}
            description="If something went wrong, open a dispute. An admin will review and resolve."
            danger
          />
        )}

        {/* Seller: cancel after expiry */}
        {isSeller && status === TS.Created && timeLeft === 0 && (
          <ActionButton
            label="Cancel & Reclaim USDC"
            pending={cancelPending || cancelConfirming}
            onClick={() => doAction(() => cancelTrade({ ...PEETOPEE_ESCROW, functionName: 'cancelTrade', args: [tradeId] }))}
            description="The trader did not respond in time. Reclaim your locked USDC."
            danger
          />
        )}

        {/* Seller: rate trader after completion */}
        {isSeller && status === TS.Completed && (
          <div className="rounded-2xl p-4" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>Rate this trader</p>
            <div className="flex gap-2 mb-3">
              {[1,2,3,4,5].map(s => (
                <button
                  key={s}
                  onClick={() => setRating(s)}
                  onMouseEnter={() => setHoverRating(s)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="flex-1 flex items-center justify-center py-2 rounded-xl transition-all"
                  style={{ background: (hoverRating || rating) >= s ? 'rgba(18,45,69,0.1)' : 'var(--surface-muted)' }}
                >
                  <Star
                    className="size-5"
                    fill={(hoverRating || rating) >= s ? 'var(--accent)' : 'none'}
                    stroke="var(--accent)"
                  />
                </button>
              ))}
            </div>
            <button
              disabled={rating === 0 || ratePending || rateConfirming}
              onClick={() => doAction(() => rateTrader({ ...PEETOPEE_ESCROW, functionName: 'rateTrader', args: [tradeId, rating] }))}
              className="w-full rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              {ratePending || rateConfirming ? <Loader2 className="mx-auto size-4 animate-spin" /> : 'Submit Rating'}
            </button>
          </div>
        )}
      </div>

      {/* Chat */}
      <div className="mt-4">
        <button
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
          onClick={() => {/* chat toggle handled in App */}}
        >
          <MessageCircle className="size-4" />
          Open Chat with {isSeller ? 'Trader' : 'Seller'}
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: TS }) {
  const colorMap: Record<TS, { bg: string; color: string }> = {
    [TS.Created]: { bg: 'rgba(18,45,69,0.08)', color: 'var(--ink-2)' },
    [TS.FiatSent]: { bg: 'rgba(16,97,166,0.1)', color: 'var(--accent-hover)' },
    [TS.Completed]: { bg: 'rgba(26,128,71,0.1)', color: 'var(--success)' },
    [TS.Disputed]: { bg: 'rgba(186,43,76,0.1)', color: 'var(--danger)' },
    [TS.Cancelled]: { bg: 'rgba(107,101,128,0.1)', color: 'var(--muted)' },
    [TS.Resolved]: { bg: 'rgba(26,128,71,0.1)', color: 'var(--success)' },
  }
  const { bg, color } = colorMap[status] ?? colorMap[TS.Created]
  return (
    <span className="rounded-lg px-2.5 py-1 text-xs font-semibold" style={{ background: bg, color }}>
      {TRADE_STATUS_LABELS[status]}
    </span>
  )
}

function ActionButton({ label, pending, onClick, description, success, danger }: {
  label: string; pending: boolean; onClick: () => void; description: string; success?: boolean; danger?: boolean
}) {
  const bg = danger ? 'rgba(186,43,76,0.08)' : success ? 'rgba(26,128,71,0.06)' : 'var(--surface-muted)'
  const border = danger ? 'rgba(186,43,76,0.2)' : success ? 'rgba(26,128,71,0.2)' : 'var(--border)'
  const btnBg = danger ? 'var(--danger)' : success ? 'var(--success)' : 'var(--accent)'

  return (
    <div className="rounded-2xl p-4" style={{ background: bg, border: `1px solid ${border}` }}>
      <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>{description}</p>
      <button
        disabled={pending}
        onClick={onClick}
        className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: btnBg }}
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {label}
      </button>
    </div>
  )
}
