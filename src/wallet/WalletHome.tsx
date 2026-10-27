/**
 * WalletHome — multi-chain wallet dashboard for the connected wagmi wallet.
 * No Circle client key required. Works for all testers out of the box.
 */
import { useState } from 'react'
import { useAccount } from 'wagmi'
import {
  Send, Download, ArrowLeftRight,
  ChevronRight, TrendingUp, Copy, Check, Wifi, WifiOff,
} from 'lucide-react'
import { useChainBalances } from './useChainBalances'
import { useTokenPrices, getPriceForSymbol } from './useTokenPrices'
import { ReceiveSheet } from './ReceiveSheet'
import { WALLET_CHAINS } from './walletCore'
import { FundsPanel } from '../components/FundsPanel'

type Sheet = 'send' | 'receive' | 'bridge' | 'swap' | null

const CHAIN_COLORS: Record<number, string> = {
  5042002: '#00a3ff',
  84532:   '#0052ff',
  421614:  '#12aaff',
  80002:   '#8247e5',
}

const CHAIN_ICONS: Record<number, string> = {
  5042002: '⬡',
  84532:   '🔵',
  421614:  '🔷',
  80002:   '🟣',
}

interface Props {
  address: string
  onBack?: () => void
}

export function WalletHome({ address, onBack }: Props) {
  const { isConnected } = useAccount()
  const balances = useChainBalances(isConnected ? address : null)
  const { prices, loading: pricesLoading } = useTokenPrices()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [copied, setCopied] = useState(false)
  const [expandedChain, setExpandedChain] = useState<number | null>(5042002)

  // Total USD across all chains
  const totalUsd = balances.reduce((sum, b) => {
    const usdcPrice = getPriceForSymbol(prices, 'USDC') ?? 1
    const nativePrice = getPriceForSymbol(prices, b.nativeSymbol) ?? 0
    const usdcVal = parseFloat(b.usdcBalance) * usdcPrice
    const nativeVal = b.chainId === 5042002 ? 0 : parseFloat(b.nativeBalance) * nativePrice
    return sum + usdcVal + nativeVal
  }, 0)

  const isLoadingAll = balances.some(b => b.loading)

  function copyAddress() {
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const shortAddr = `${address.slice(0, 6)}...${address.slice(-4)}`

  if (sheet === 'receive') {
    return <ReceiveSheet onClose={() => setSheet(null)} overrideAddress={address} />
  }
  if (sheet === 'bridge') {
    return (
      <div className="px-4 py-4 max-w-lg mx-auto">
        <button
          onClick={() => setSheet(null)}
          className="mb-4 flex items-center gap-1.5 text-sm"
          style={{ color: 'var(--muted)' }}
        >
          ← Back to wallet
        </button>
        <FundsPanel walletAddress={address} />
      </div>
    )
  }

  return (
    <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">

      {/* Portfolio hero card */}
      <div
        className="rounded-3xl p-5 text-white"
        style={{ background: 'linear-gradient(135deg, #122d45 0%, #1e3a5f 60%, #7c3aed 100%)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center justify-center size-7 rounded-full transition-all active:scale-90"
                style={{ background: 'rgba(255,255,255,0.15)' }}
                aria-label="Back to home"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 5l-7 7 7 7"/>
                </svg>
              </button>
            )}
            <span className="text-xs opacity-60 font-semibold uppercase tracking-wider">Portfolio</span>
          </div>
          <div className="flex items-center gap-1 text-xs opacity-60">
            {isLoadingAll
              ? <><Wifi className="size-3 animate-pulse" /> Updating…</>
              : <><TrendingUp className="size-3" /> Live</>
            }
          </div>
        </div>

        <div className="text-4xl font-bold tracking-tight mb-1 display">
          {isLoadingAll && totalUsd === 0
            ? <span className="opacity-40">$—</span>
            : `$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          }
        </div>
        <div className="text-xs opacity-50 mb-3">across {WALLET_CHAINS.length} chains</div>

        {/* Address copy pill */}
        <button
          onClick={copyAddress}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-all active:scale-95"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? 'Copied!' : shortAddr}
        </button>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { icon: <Send className="size-5" />,          label: 'Send',    action: () => setSheet('send') },
          { icon: <Download className="size-5" />,      label: 'Receive', action: () => setSheet('receive') },
          { icon: <ArrowLeftRight className="size-5" />, label: 'Swap',   action: () => setSheet('swap') },
          { icon: <ArrowLeftRight className="size-5" style={{ transform: 'rotate(90deg)' }} />, label: 'Bridge', action: () => setSheet('bridge') },
        ].map(({ icon, label, action }) => (
          <button
            key={label}
            onClick={action}
            className="flex flex-col items-center gap-2 py-4 rounded-2xl transition-all active:scale-95"
            style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}
          >
            <span style={{ color: 'var(--accent)' }}>{icon}</span>
            <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{label}</span>
          </button>
        ))}
      </div>

      {/* Live price ticker */}
      <LivePriceTicker prices={prices} loading={pricesLoading} />

      {/* Assets by chain */}
      <div>
        <h3 className="text-xs font-semibold mb-2 px-1 uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
          Assets by chain
        </h3>
        <div className="space-y-2">
          {balances.map(b => {
            const chain = WALLET_CHAINS.find(c => c.id === b.chainId)!
            const usdcPrice = getPriceForSymbol(prices, 'USDC') ?? 1
            const nativePrice = getPriceForSymbol(prices, b.nativeSymbol) ?? 0
            const usdcUsd = parseFloat(b.usdcBalance) * usdcPrice
            const nativeUsd = b.chainId === 5042002 ? 0 : parseFloat(b.nativeBalance) * nativePrice
            const total = usdcUsd + nativeUsd
            const expanded = expandedChain === b.chainId

            return (
              <div
                key={b.chainId}
                className="rounded-2xl overflow-hidden"
                style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}
              >
                <button
                  className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-black/5"
                  onClick={() => setExpandedChain(expanded ? null : b.chainId)}
                >
                  {/* Chain badge */}
                  <div
                    className="size-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ background: `${CHAIN_COLORS[b.chainId]}18` }}
                  >
                    {b.loading
                      ? <div className="size-4 rounded-full animate-pulse" style={{ background: CHAIN_COLORS[b.chainId] }} />
                      : CHAIN_ICONS[b.chainId]
                    }
                  </div>

                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                        {chain.shortName}
                      </span>
                      <span className="font-semibold text-sm tabular-nums" style={{ color: 'var(--ink)' }}>
                        {b.loading ? '…' : `$${total.toFixed(2)}`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs truncate" style={{ color: 'var(--subtle)' }}>
                        {b.loading ? 'Fetching…' : `${b.usdcBalance} USDC`}
                      </span>
                      {b.error
                        ? <WifiOff className="size-3 shrink-0 ml-1" style={{ color: 'var(--muted)' }} />
                        : <ChevronRight
                            className="size-3.5 shrink-0 ml-1 transition-transform"
                            style={{
                              color: 'var(--subtle)',
                              transform: expanded ? 'rotate(90deg)' : 'none',
                            }}
                          />
                      }
                    </div>
                  </div>
                </button>

                {expanded && !b.loading && !b.error && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    <TokenRow
                      symbol="USDC"
                      amount={b.usdcBalance}
                      usdValue={usdcUsd}
                      color={CHAIN_COLORS[b.chainId]}
                    />
                    {b.chainId !== 5042002 && parseFloat(b.nativeBalance) > 0 && (
                      <TokenRow
                        symbol={b.nativeSymbol}
                        amount={b.nativeBalance}
                        usdValue={nativeUsd}
                        color="#888"
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {sheet === 'send' && (
        <SimpleSendSheet address={address} onClose={() => setSheet(null)} />
      )}
      {sheet === 'swap' && (
        <SwapSheet onClose={() => setSheet(null)} />
      )}
    </div>
  )
}

// ---- Simple inline Send sheet (wagmi — no passkey) --------------------------
import { useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi, parseUnits } from 'viem'
import { ARC_TESTNET_CHAIN_ID, USDC_ADDRESS } from '../contracts/peetopee'
import { Loader2, X, CheckCircle2 } from 'lucide-react'
import { SwapSheet } from './SwapSheet'

function SimpleSendSheet({ address: _address, onClose }: { address: string; onClose: () => void }) {
  const { chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [step, setStep] = useState<'form' | 'sending' | 'done' | 'error'>('form')
  const [errMsg, setErrMsg] = useState('')

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  if (isSuccess && step === 'sending') setStep('done')

  const wrongChain = chainId !== ARC_TESTNET_CHAIN_ID

  function send() {
    if (wrongChain) { switchChain({ chainId: ARC_TESTNET_CHAIN_ID }); return }
    if (!to.startsWith('0x') || to.length !== 42 || !amount) return
    setStep('sending')
    try {
      writeContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to as `0x${string}`, parseUnits(amount, 6)],
      })
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Failed')
      setStep('error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.4)' }}
    >
      <div
        className="rounded-t-3xl p-6 space-y-4"
        style={{ background: 'var(--bg)', maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold display" style={{ color: 'var(--ink)' }}>Send USDC</h2>
          <button onClick={onClose} className="rounded-full p-1" style={{ background: 'var(--surface-muted)' }}>
            <X className="size-5" style={{ color: 'var(--ink)' }} />
          </button>
        </div>

        {step === 'done' ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="mx-auto size-12" style={{ color: 'var(--success)' }} />
            <p className="font-semibold" style={{ color: 'var(--ink)' }}>Sent!</p>
            <button
              onClick={onClose}
              className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              Done
            </button>
          </div>
        ) : step === 'error' ? (
          <div className="space-y-3">
            <p className="text-sm text-center" style={{ color: 'var(--danger)' }}>{errMsg}</p>
            <button onClick={() => setStep('form')} className="w-full rounded-2xl py-3 text-sm font-semibold" style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Recipient address (0x...)"
                value={to}
                onChange={e => setTo(e.target.value)}
                className="w-full rounded-2xl px-4 py-3.5 outline-none text-sm"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
              />
              <input
                inputMode="decimal"
                placeholder="Amount (USDC)"
                value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                className="w-full rounded-2xl px-4 py-3.5 outline-none"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
              />
            </div>

            <p className="text-xs text-center" style={{ color: 'var(--subtle)' }}>
              Sends USDC on Arc Testnet from your connected wallet.
            </p>

            <button
              onClick={send}
              disabled={isPending || confirming || !to || !amount}
              className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
              style={{ background: 'var(--accent)' }}
            >
              {(isPending || confirming) && <Loader2 className="size-4 animate-spin" />}
              {wrongChain ? 'Switch to Arc Testnet' : isPending || confirming ? 'Sending…' : 'Send USDC'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ---- Token row ---------------------------------------------------------------
function TokenRow({ symbol, amount, usdValue, color }: {
  symbol: string; amount: string; usdValue: number; color: string
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div
        className="size-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
        style={{ background: color }}
      >
        {symbol.slice(0, 1)}
      </div>
      <div className="flex-1">
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{symbol}</span>
          <span className="text-sm font-medium tabular-nums" style={{ color: 'var(--ink)' }}>${usdValue.toFixed(2)}</span>
        </div>
        <span className="text-xs" style={{ color: 'var(--subtle)' }}>{amount} {symbol}</span>
      </div>
    </div>
  )
}

// ---- Live price ticker -------------------------------------------------------
function LivePriceTicker({ prices, loading }: { prices: Record<string, number>; loading: boolean }) {
  const tokens = [
    { symbol: 'USDC',  id: 'usd-coin',      color: '#2775ca' },
    { symbol: 'ETH',   id: 'ethereum',       color: '#627eea' },
    { symbol: 'MATIC', id: 'matic-network',  color: '#8247e5' },
    { symbol: 'ARB',   id: 'arbitrum',       color: '#12aaff' },
  ]

  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>Live prices</span>
        <span className="text-xs" style={{ color: 'var(--subtle)' }}>CoinGecko</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {tokens.map(t => {
          const price = prices[t.id]
          return (
            <div key={t.id} className="flex items-center gap-2">
              <div
                className="size-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ background: t.color }}
              >
                {t.symbol.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{t.symbol}</div>
                <div className="text-xs font-medium tabular-nums" style={{ color: 'var(--accent-hover)' }}>
                  {loading ? '…' : price != null
                    ? `$${price.toLocaleString('en-US', { minimumFractionDigits: price > 100 ? 0 : 2, maximumFractionDigits: price > 100 ? 0 : 4 })}`
                    : '—'
                  }
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
