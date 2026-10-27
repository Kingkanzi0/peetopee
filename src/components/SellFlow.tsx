import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi } from 'viem'
import { ArrowLeft, Loader2, Lock, AlertTriangle } from 'lucide-react'
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

interface Props {
  country: CountryDef
  trader: TraderProfile
  onBack: () => void
  onTradeCreated: (tradeId: bigint) => void
}

type Step = 'amount' | 'bank' | 'confirm' | 'approving' | 'locking'

export function SellFlow({ country, trader, onBack, onTradeCreated }: Props) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongChain = chainId !== ARC_TESTNET_CHAIN_ID

  const [step, setStep] = useState<Step>('amount')
  const [amount, setAmount] = useState('')
  const [bankDetails, setBankDetails] = useState('')

  const parsedUsdc = (() => {
    try { return parseAmount(ARC_TESTNET_CHAIN_ID, amount).raw } catch { return 0n }
  })()

  const minOk = parsedUsdc >= trader.minOrderUsdc
  const maxOk = parsedUsdc <= trader.maxOrderUsdc
  const amountValid = parsedUsdc > 0n && minOk && maxOk

  const localAmount = parsedUsdc > 0n ? calcLocalAmount(parsedUsdc, trader.exchangeRate) : 0n
  const localFmt = (Number(localAmount) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })

  const minFmt = Amount.fromRaw(trader.minOrderUsdc, usdcDecimalsFor(ARC_TESTNET_CHAIN_ID)).toFixed(0)
  const maxFmt = Amount.fromRaw(trader.maxOrderUsdc, usdcDecimalsFor(ARC_TESTNET_CHAIN_ID)).toFixed(0)

  // USDC balance
  const { data: rawBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address },
  })
  const balFmt = rawBalance != null ? Amount.fromRaw(rawBalance, usdcDecimalsFor(ARC_TESTNET_CHAIN_ID)).toFixed(2) : '...'

  // Check allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, PEETOPEE_ESCROW_ADDRESS] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address },
  })
  const needsApproval = (allowance) == null || (allowance) < parsedUsdc

  // Approval tx
  const { writeContract: approve, data: approveTxHash, isPending: approvePending } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash })

  // Create trade tx
  const { writeContract: createTrade, data: createTxHash, isPending: createPending } = useWriteContract()
  const { isLoading: createConfirming, isSuccess: createSuccess, data: createReceipt } = useWaitForTransactionReceipt({ hash: createTxHash })

  // After approval confirmed, proceed to create
  if (approveSuccess && step === 'approving') {
    void refetchAllowance()
    setStep('locking')
  }

  // After trade created, parse tradeId from logs and navigate
  if (createSuccess && createReceipt && step === 'locking') {
    // Find TradeCreated log
    for (const log of createReceipt.logs) {
      try {
        // tradeId is the first indexed topic (topic[1])
        const topic1 = log.topics?.[1]
        if (topic1) {
          const tradeId = BigInt(topic1)
          onTradeCreated(tradeId)
        }
      } catch {}
    }
  }

  function handleAmountNext() {
    if (!amountValid) return
    setStep('bank')
  }

  function handleBankNext() {
    if (!bankDetails.trim()) return
    setStep('confirm')
  }

  function handleConfirm() {
    if (wrongChain) { switchChain({ chainId: ARC_TESTNET_CHAIN_ID }); return }
    if (needsApproval) {
      setStep('approving')
      approve({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [PEETOPEE_ESCROW_ADDRESS, parsedUsdc],
      })
    } else {
      setStep('locking')
      doCreateTrade()
    }
  }

  function doCreateTrade() {
    const hash = bankDetails.slice(0, 32).padEnd(32, '0')
    createTrade({
      ...PEETOPEE_ESCROW,
      functionName: 'createTrade',
      args: [
        trader.traderAddr as `0x${string}`,
        parsedUsdc,
        localAmount,
        hash,
      ],
    })
  }

  // After approval confirmed, auto-proceed to create trade
  if (approveSuccess && step === 'approving') {
    setTimeout(doCreateTrade, 500)
  }

  const fee = (parsedUsdc * 50n) / 10_000n
  const feeUsdcFmt = Amount.fromRaw(fee, usdcDecimalsFor(ARC_TESTNET_CHAIN_ID)).toFixed(4)

  const isProcessing = approvePending || approveConfirming || createPending || createConfirming || step === 'approving' || step === 'locking'

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }} disabled={isProcessing}>
        <ArrowLeft className="size-4" />
        Back to traders
      </button>

      {/* Trader summary */}
      <div className="mb-4 flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
        <span className="text-xl">{country.flag}</span>
        <div className="flex-1">
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {trader.traderAddr.slice(0, 6)}...{trader.traderAddr.slice(-4)}
          </div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            {formatRate(trader.exchangeRate, trader.currencyCode)} per USDC · {trader.paymentMethods}
          </div>
        </div>
      </div>

      {/* Step: Amount */}
      {(step === 'amount' || step === 'bank' || step === 'confirm') && (
        <>
          {step === 'amount' && (
            <div>
              <h2 className="display mb-4 text-xl font-bold" style={{ color: 'var(--ink)' }}>How much USDC to sell?</h2>

              {/* Amount input */}
              <div className="rounded-2xl p-4" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9.]/g, '')
                    if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
                  }}
                  placeholder="0.00"
                  className="display w-full bg-transparent font-bold tabular-nums outline-none placeholder:text-slate-300"
                  style={{ color: 'var(--ink)', fontSize: 'clamp(28px, 9vw, 40px)' }}
                />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--subtle)' }}>USDC</span>
                  <button
                    onClick={() => { if (rawBalance != null) setAmount(Amount.fromRaw(rawBalance, usdcDecimalsFor(ARC_TESTNET_CHAIN_ID)).toFixed(6)) }}
                    className="text-xs font-semibold"
                    style={{ color: 'var(--accent-hover)' }}
                  >
                    Balance: {balFmt} · Max
                  </button>
                </div>
              </div>

              {/* Limits */}
              <div className="mt-2 flex items-center justify-between text-xs px-1">
                <span style={{ color: 'var(--subtle)' }}>Min: ${minFmt} · Max: ${maxFmt}</span>
                {parsedUsdc > 0n && !minOk && <span style={{ color: 'var(--danger)' }}>Below minimum</span>}
                {parsedUsdc > 0n && !maxOk && <span style={{ color: 'var(--danger)' }}>Above maximum</span>}
              </div>

              {/* Preview */}
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
                disabled={!amountValid || !address}
                onClick={handleAmountNext}
                className="mt-4 w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--accent)' }}
              >
                {!address ? 'Connect wallet first' : 'Continue'}
              </button>
            </div>
          )}

          {step === 'bank' && (
            <div>
              <h2 className="display mb-2 text-xl font-bold" style={{ color: 'var(--ink)' }}>Your bank details</h2>
              <p className="mb-4 text-sm" style={{ color: 'var(--muted)' }}>
                Share your account number so the trader knows where to send {trader.currencyCode}.
              </p>

              <div className="flex items-start gap-2 rounded-xl p-3 mb-4" style={{ background: 'rgba(186,43,76,0.06)', border: '1px solid rgba(186,43,76,0.15)' }}>
                <AlertTriangle className="size-4 mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
                <p className="text-xs" style={{ color: 'var(--danger)' }}>
                  Never share this in public chats. Only the trader you selected will see it.
                </p>
              </div>

              <textarea
                rows={4}
                value={bankDetails}
                onChange={e => setBankDetails(e.target.value)}
                placeholder="Bank name, account number, account name, sort code or routing number..."
                className="w-full rounded-2xl p-4 text-sm outline-none resize-none"
                style={{
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border)',
                  color: 'var(--ink)',
                }}
              />

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setStep('amount')}
                  className="flex-1 rounded-2xl py-3.5 text-sm font-semibold transition-all"
                  style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
                >
                  Back
                </button>
                <button
                  disabled={!bankDetails.trim()}
                  onClick={handleBankNext}
                  className="flex-1 rounded-2xl py-3.5 text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
                <Row label="You receive" value={`${country.currencySymbol}${localFmt} ${trader.currencyCode}`} bold success />
                <div className="border-t" style={{ borderColor: 'var(--border)' }} />
                <Row label="Trader" value={`${trader.traderAddr.slice(0, 6)}...${trader.traderAddr.slice(-4)}`} />
                <Row label="Rate" value={formatRate(trader.exchangeRate, trader.currencyCode) + ' / USDC'} />
                <Row label="Platform fee" value={`${feeUsdcFmt} USDC`} />
                <Row label="Payment via" value={trader.paymentMethods} />
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-xl p-3" style={{ background: 'rgba(26,128,71,0.06)', border: '1px solid rgba(26,128,71,0.15)' }}>
                <Lock className="size-4 shrink-0" style={{ color: 'var(--success)' }} />
                <p className="text-xs" style={{ color: 'var(--success)' }}>
                  Your USDC goes into a tamper-proof smart contract. It's only released after you confirm receipt.
                </p>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setStep('bank')}
                  className="flex-1 rounded-2xl py-3.5 text-sm font-semibold transition-all"
                  style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
                >
                  Back
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99]"
                  style={{ background: 'var(--accent)' }}
                >
                  {wrongChain ? 'Switch to Arc' : needsApproval ? 'Approve USDC' : 'Lock in Escrow'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Processing states */}
      {(step === 'approving' || step === 'locking') && (
        <div className="py-12 text-center space-y-4">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full" style={{ background: 'var(--surface-muted)' }}>
            <Loader2 className="size-8 animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h3 className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
              {step === 'approving' ? 'Approving USDC...' : 'Locking in escrow...'}
            </h3>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              {step === 'approving' ? 'Confirm in your wallet' : 'Your USDC is being locked securely'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, bold, success }: { label: string; value: string; bold?: boolean; success?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm" style={{ color: 'var(--muted)' }}>{label}</span>
      <span
        className={`text-sm tabular-nums ${bold ? 'font-semibold' : ''}`}
        style={{ color: success ? 'var(--success)' : 'var(--ink)' }}
      >
        {value}
      </span>
    </div>
  )
}
