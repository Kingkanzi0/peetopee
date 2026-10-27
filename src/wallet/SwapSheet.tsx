/**
 * SwapSheet — token swap powered by Circle App Kit (permissionless, no kit key).
 * Uses the wagmi-connected wallet via createViemAdapterFromProvider.
 *
 * Supported: USDT → USDC, USDC → EURC, etc. on Base Sepolia and Arc Testnet.
 * On Arc Testnet, USDC ↔ NATIVE is the same asset and is blocked before routing.
 *
 * Flow: enter amount → get quote → review → click Swap (one button, no extra confirm).
 * Third-party routing via LiFi aggregator (Circle App Kit).
 */
import { useState } from 'react'
import { useAccount, useConnectorClient, useSwitchChain } from 'wagmi'
import { AppKit, type SwapEstimate } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { X, ArrowUpDown, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

const kit = new AppKit()

// Swap-supported chains (App Kit SwapChain enum values).
// On testnet only Arc_Testnet has swap support. Other chains are mainnet-only.
const SWAP_CHAINS = [
  { label: 'Arc Testnet', id: 'Arc_Testnet', chainId: 5042002 },
  { label: 'Base',        id: 'Base',        chainId: 8453    },
  { label: 'Arbitrum',    id: 'Arbitrum',    chainId: 42161   },
  { label: 'Polygon',     id: 'Polygon',     chainId: 137     },
] as const
type SwapChainId = typeof SWAP_CHAINS[number]['id']

const TOKENS = ['USDC', 'USDT', 'EURC', 'DAI', 'NATIVE'] as const
type Token = typeof TOKENS[number]

const TOKEN_COLORS: Record<string, string> = {
  USDC: '#2775ca', USDT: '#26a17b', EURC: '#1a56db',
  DAI: '#f5a623', NATIVE: '#627eea',
}

type Step = 'form' | 'quoting' | 'review' | 'swapping' | 'done' | 'error'

interface ReviewedSwap {
  estimate: SwapEstimate
  tokenIn: Token
  tokenOut: Token
  amountIn: string
  chain: SwapChainId
  account: string
}

export function SwapSheet({ onClose }: { onClose: () => void }) {
  const { address, connector } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { data: connClient } = useConnectorClient()

  const [step, setStep] = useState<Step>('form')
  const [chain, setChain] = useState<SwapChainId>('Arc_Testnet')
  const [tokenIn, setTokenIn] = useState<Token>('USDT')
  const [tokenOut, setTokenOut] = useState<Token>('USDC')
  const [amountIn, setAmountIn] = useState('')
  const [reviewed, setReviewed] = useState<ReviewedSwap | null>(null)
  const [txHash, setTxHash] = useState('')
  const [errMsg, setErrMsg] = useState('')

  const selectedChain = SWAP_CHAINS.find(c => c.id === chain)!

  // Arc: USDC ↔ NATIVE is same asset — block it
  const isSameAsset =
    chain === 'Arc_Testnet' &&
    ((tokenIn === 'USDC' && tokenOut === 'NATIVE') ||
     (tokenIn === 'NATIVE' && tokenOut === 'USDC'))

  function flipTokens() {
    setTokenIn(tokenOut)
    setTokenOut(tokenIn)
    setReviewed(null)
  }

  async function getAdapter() {
    if (!connector) throw new Error('Wallet not connected')
    // Switch to the source chain
    await switchChainAsync({ chainId: selectedChain.chainId })
    const provider = (await connector.getProvider()) as EIP1193Provider
    return createViemAdapterFromProvider({ provider })
  }

  async function getQuote() {
    if (!address || !amountIn || parseFloat(amountIn) <= 0) return
    if (isSameAsset) return
    setStep('quoting')
    setErrMsg('')
    try {
      const adapter = await getAdapter()
      const estimate = await kit.estimateSwap({
        from: { adapter, chain },
        tokenIn,
        tokenOut,
        amountIn,
        config: { slippageBps: 300 },
      })
      setReviewed({ estimate, tokenIn, tokenOut, amountIn, chain, account: address })
      setStep('review')
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Could not get quote')
      setStep('error')
    }
  }

  async function executeSwap() {
    if (!reviewed || !address) return
    if (address !== reviewed.account) {
      setErrMsg('Wallet account changed since the quote — please get a new quote.')
      setStep('error')
      return
    }
    setStep('swapping')
    try {
      const adapter = await getAdapter()
      const result = await kit.swap({
        from: { adapter, chain: reviewed.chain },
        tokenIn: reviewed.tokenIn,
        tokenOut: reviewed.tokenOut,
        amountIn: reviewed.amountIn,
        config: { slippageBps: 300 },
      })
      setTxHash(result.txHash ?? '')
      setStep('done')
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Swap failed')
      setStep('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div
        className="rounded-t-3xl p-6 space-y-5 overflow-y-auto"
        style={{ background: 'var(--bg)', maxHeight: '90dvh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold display" style={{ color: 'var(--ink)' }}>Swap tokens</h2>
          <button onClick={onClose} className="rounded-full p-1.5" style={{ background: 'var(--surface-muted)' }}>
            <X className="size-5" style={{ color: 'var(--ink)' }} />
          </button>
        </div>

        {/* Aggregator disclosure */}
        <p className="text-xs px-1" style={{ color: 'var(--subtle)' }}>
          Swaps are routed through third-party aggregators (currently LiFi). By swapping you agree to their terms of service.
        </p>

        {step === 'done' ? (
          <div className="py-8 text-center space-y-4">
            <CheckCircle2 className="mx-auto size-14" style={{ color: 'var(--success)' }} />
            <p className="font-semibold text-lg" style={{ color: 'var(--ink)' }}>Swap complete!</p>
            {txHash && (
              <p className="text-xs break-all px-2" style={{ color: 'var(--muted)' }}>
                Tx: {txHash.slice(0, 12)}…{txHash.slice(-8)}
              </p>
            )}
            <button onClick={onClose} className="w-full rounded-2xl py-3.5 font-semibold text-white" style={{ background: 'var(--accent)' }}>
              Done
            </button>
          </div>
        ) : step === 'error' ? (
          <div className="space-y-4">
            <div className="rounded-2xl p-4 flex gap-3" style={{ background: '#fef2f2', border: '1px solid #fca5a5' }}>
              <AlertCircle className="size-5 shrink-0 text-red-500 mt-0.5" />
              <p className="text-sm text-red-700">{errMsg}</p>
            </div>
            <button onClick={() => { setStep('form'); setReviewed(null) }} className="w-full rounded-2xl py-3 font-semibold" style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}>
              Try again
            </button>
          </div>
        ) : step === 'review' && reviewed ? (
          <div className="space-y-4">
            {/* Quote summary */}
            <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: 'var(--muted)' }}>You send</span>
                <span className="font-semibold" style={{ color: 'var(--ink)' }}>{reviewed.amountIn} {reviewed.tokenIn}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: 'var(--muted)' }}>You receive (est.)</span>
                <span className="font-semibold" style={{ color: 'var(--success)' }}>
                  {reviewed.estimate.estimatedOutput?.amount ?? '—'} {reviewed.estimate.estimatedOutput?.token ?? reviewed.tokenOut}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: 'var(--muted)' }}>Slippage</span>
                <span className="text-sm" style={{ color: 'var(--ink)' }}>3%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: 'var(--muted)' }}>Chain</span>
                <span className="text-sm" style={{ color: 'var(--ink)' }}>{selectedChain.label}</span>
              </div>
            </div>

            <p className="text-xs px-1" style={{ color: 'var(--subtle)' }}>
              Estimated output is not guaranteed. Actual amount may differ due to market conditions.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => { setStep('form'); setReviewed(null) }}
                className="flex-1 rounded-2xl py-3 font-semibold"
                style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
              >
                Edit
              </button>
              <button
                onClick={() => void executeSwap()}
                className="flex-1 rounded-2xl py-3 font-semibold text-white flex items-center justify-center gap-2"
                style={{ background: 'var(--accent)' }}
              >
                Swap now
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Chain selector */}
            <div>
              <label className="text-xs font-semibold mb-1.5 block px-1" style={{ color: 'var(--subtle)' }}>Network</label>
              <div className="grid grid-cols-3 gap-2">
                {SWAP_CHAINS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setChain(c.id); setReviewed(null) }}
                    className="rounded-xl py-2 text-xs font-semibold transition-all"
                    style={{
                      background: chain === c.id ? 'var(--accent)' : 'var(--surface-strong)',
                      color: chain === c.id ? 'white' : 'var(--ink)',
                      border: `1.5px solid ${chain === c.id ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                  >
                    {c.label.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Token selectors */}
            <div className="relative">
              <div className="space-y-2">
                <TokenSelector label="From" value={tokenIn} exclude={tokenOut} onChange={v => { setTokenIn(v); setReviewed(null) }} />
                <TokenSelector label="To" value={tokenOut} exclude={tokenIn} onChange={v => { setTokenOut(v); setReviewed(null) }} />
              </div>
              <button
                onClick={flipTokens}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-8 rounded-full flex items-center justify-center z-10 shadow-sm"
                style={{ background: 'var(--bg)', border: '2px solid var(--border)' }}
              >
                <ArrowUpDown className="size-3.5" style={{ color: 'var(--accent)' }} />
              </button>
            </div>

            {/* Amount input */}
            <div>
              <label className="text-xs font-semibold mb-1.5 block px-1" style={{ color: 'var(--subtle)' }}>Amount</label>
              <input
                inputMode="decimal"
                placeholder={`0.00 ${tokenIn}`}
                value={amountIn}
                onChange={e => { setAmountIn(e.target.value.replace(/[^0-9.]/g, '')); setReviewed(null) }}
                className="w-full rounded-2xl px-4 py-3.5 outline-none"
                style={{
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border)',
                  color: 'var(--ink)',
                  fontSize: 16,
                }}
              />
            </div>

            {isSameAsset && (
              <p className="text-xs text-center px-2" style={{ color: '#f59e0b' }}>
                On Arc Testnet, USDC and NATIVE are the same asset. Choose different tokens.
              </p>
            )}

            <button
              onClick={() => void getQuote()}
              disabled={!amountIn || parseFloat(amountIn) <= 0 || isSameAsset || step === 'quoting' || !connClient}
              className="w-full rounded-2xl py-3.5 font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-transform"
              style={{ background: 'var(--accent)' }}
            >
              {step === 'quoting' && <Loader2 className="size-4 animate-spin" />}
              {step === 'quoting' ? 'Getting quote…' : 'Get quote'}
            </button>
          </>
        )}

        {step === 'swapping' && (
          <div className="fixed inset-0 z-60 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="rounded-3xl p-8 flex flex-col items-center gap-4" style={{ background: 'var(--surface)' }}>
              <Loader2 className="size-10 animate-spin" style={{ color: 'var(--accent)' }} />
              <p className="font-semibold" style={{ color: 'var(--ink)' }}>Swapping…</p>
              <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>Sign in your wallet and wait for confirmation.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TokenSelector({
  label, value, exclude, onChange,
}: {
  label: string
  value: Token
  exclude: Token
  onChange: (t: Token) => void
}) {
  const available = TOKENS.filter(t => t !== exclude)
  return (
    <div
      className="rounded-2xl px-4 py-3 flex items-center justify-between"
      style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}
    >
      <span className="text-xs font-semibold" style={{ color: 'var(--subtle)' }}>{label}</span>
      <div className="flex items-center gap-2">
        <div
          className="size-5 rounded-full shrink-0"
          style={{ background: TOKEN_COLORS[value] ?? '#888' }}
        />
        <select
          value={value}
          onChange={e => onChange(e.target.value as Token)}
          className="bg-transparent text-sm font-semibold outline-none"
          style={{ color: 'var(--ink)' }}
        >
          {available.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
