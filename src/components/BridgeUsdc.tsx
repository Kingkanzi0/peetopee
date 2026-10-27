/**
 * BridgeUsdc — bring USDC from Base Sepolia, Eth Sepolia, or Arb Sepolia to Arc Testnet
 * using Circle App Kit + @circle-fin/adapter-viem-v2 (wagmi provider adapter).
 * No Kit Key needed for bridge operations.
 */
import { useState } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { ArrowRight, ArrowDownUp, Loader2, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react'
import { AppKit, BridgeChain } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { toast } from 'sonner'

// Singleton kit — stateless between calls
const appKit = new AppKit()

interface SourceChain {
  label: string
  chainId: number
  kitName: BridgeChain
  explorerBase: string
}

const SOURCE_CHAINS: SourceChain[] = [
  { label: 'Base Sepolia',      chainId: 84532,    kitName: BridgeChain.Base_Sepolia,      explorerBase: 'https://sepolia.basescan.org/tx/' },
  { label: 'Ethereum Sepolia',  chainId: 11155111, kitName: BridgeChain.Ethereum_Sepolia,  explorerBase: 'https://sepolia.etherscan.io/tx/' },
  { label: 'Arbitrum Sepolia',  chainId: 421614,   kitName: BridgeChain.Arbitrum_Sepolia,  explorerBase: 'https://sepolia.arbiscan.io/tx/' },
]

type BridgeState = 'idle' | 'bridging' | 'success' | 'error'

interface Props {
  onClose?: () => void
}

export function BridgeUsdc({ onClose }: Props) {
  const { address, chainId: walletChain, connector } = useAccount()
  const { switchChainAsync } = useSwitchChain()

  const [source, setSource] = useState<SourceChain>(SOURCE_CHAINS[0])
  const [amount, setAmount] = useState('')
  const [bridgeState, setBridgeState] = useState<BridgeState>('idle')
  const [resultSteps, setResultSteps] = useState<{ name: string; state: string; explorerUrl?: string }[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  const amountNum = parseFloat(amount)
  const valid = address && amount && !isNaN(amountNum) && amountNum >= 1 && amountNum <= 10000

  async function handleBridge() {
    if (!address || !connector || !valid) return

    setBridgeState('bridging')
    setErrorMsg('')
    setResultSteps([])

    try {
      // Switch to source chain if needed
      if (walletChain !== source.chainId) {
        await switchChainAsync({ chainId: source.chainId })
      }

      const provider = (await connector.getProvider()) as EIP1193Provider
      const adapter = await createViemAdapterFromProvider({ provider })

      const result = await appKit.bridge({
        from: { adapter, chain: source.kitName },
        to:   { adapter, chain: BridgeChain.Arc_Testnet },
        amount,
      })

      // Surface step results
      if (result.steps) {
        setResultSteps(result.steps.map(s => ({
          name: s.name,
          state: s.state,
          explorerUrl: 'explorerUrl' in s ? (s.explorerUrl) : undefined,
        })))
      }

      if (result.state === 'success') {
        setBridgeState('success')
        toast.success(`Bridged ${amount} USDC to Arc Testnet`)
      } else {
        throw new Error(`Bridge ended with state: ${result.state}`)
      }
    } catch (err: unknown) {
      setBridgeState('error')
      const msg = err instanceof Error ? err.message : 'Bridge failed'
      setErrorMsg(msg)
      toast.error(msg)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>Bridge USDC to Arc</h3>
        {onClose && (
          <button onClick={onClose} className="text-xs" style={{ color: 'var(--muted)' }}>Close</button>
        )}
      </div>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Move USDC from another testnet to Arc Testnet so you can create trades. Powered by Circle CCTP.
      </p>

      {/* Source chain selector */}
      <div>
        <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--muted)' }}>From chain</label>
        <div className="flex gap-2 flex-wrap">
          {SOURCE_CHAINS.map(c => (
            <button
              key={c.chainId}
              onClick={() => setSource(c)}
              className="rounded-xl px-3 py-2 text-xs font-semibold transition-all"
              style={{
                background: source.chainId === c.chainId ? 'var(--accent)' : 'var(--surface-muted)',
                color: source.chainId === c.chainId ? 'white' : 'var(--ink)',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Route preview */}
      <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: 'var(--surface-muted)' }}>
        <div className="flex-1 text-center">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>From</p>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{source.label}</p>
        </div>
        <ArrowRight className="size-4 shrink-0" style={{ color: 'var(--subtle)' }} />
        <div className="flex-1 text-center">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>To</p>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Arc Testnet</p>
        </div>
      </div>

      {/* Amount input */}
      <div className="rounded-2xl p-4" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
        <input
          inputMode="decimal"
          value={amount}
          onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="0.00"
          disabled={bridgeState === 'bridging'}
          className="display w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-300 disabled:opacity-50"
          style={{ color: 'var(--ink)' }}
        />
        <div className="mt-1 flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>USDC</span>
          <div className="flex gap-1.5">
            {['10', '50', '100'].map(v => (
              <button
                key={v}
                onClick={() => setAmount(v)}
                className="rounded-lg px-2 py-1 text-xs font-medium transition-all hover:scale-105"
                style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Steps progress (post-bridge) */}
      {resultSteps.length > 0 && (
        <div className="space-y-2">
          {resultSteps.map((s, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-muted)' }}>
              <div className="size-5 shrink-0 flex items-center justify-center">
                {s.state === 'success' ? <CheckCircle2 className="size-5" style={{ color: 'var(--success)' }} />
                  : s.state === 'error'   ? <AlertCircle className="size-5" style={{ color: 'var(--danger)' }} />
                  : s.state === 'pending' ? <Loader2 className="size-4 animate-spin" style={{ color: 'var(--accent)' }} />
                  : <div className="size-2 rounded-full" style={{ background: 'var(--border-strong)' }} />}
              </div>
              <span className="flex-1 text-sm capitalize" style={{ color: 'var(--ink)' }}>{s.name}</span>
              {s.explorerUrl && (
                <a href={s.explorerUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" style={{ color: 'var(--accent-hover)' }} />
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bridging in-progress indicator */}
      {bridgeState === 'bridging' && resultSteps.length === 0 && (
        <div className="flex items-center justify-center gap-3 py-4">
          <Loader2 className="size-5 animate-spin" style={{ color: 'var(--accent)' }} />
          <span className="text-sm" style={{ color: 'var(--muted)' }}>Bridging USDC via CCTP...</span>
        </div>
      )}

      {/* Error */}
      {bridgeState === 'error' && (
        <div className="flex items-start gap-2 rounded-xl p-3" style={{ background: 'rgba(186,43,76,0.07)', border: '1px solid rgba(186,43,76,0.15)' }}>
          <AlertCircle className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--danger)' }} />
          <p className="text-xs" style={{ color: 'var(--danger)' }}>{errorMsg}</p>
        </div>
      )}

      {/* CTA */}
      {bridgeState !== 'success' && (
        <button
          disabled={!valid || bridgeState === 'bridging'}
          onClick={() => { void handleBridge() }}
          className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40 transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{ background: 'var(--accent)' }}
        >
          {bridgeState === 'bridging'
            ? <><Loader2 className="size-4 animate-spin" /> Bridging USDC...</>
            : <><ArrowDownUp className="size-4" /> Bridge to Arc Testnet</>}
        </button>
      )}

      {bridgeState === 'success' && (
        <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(26,128,71,0.08)' }}>
          <CheckCircle2 className="mx-auto mb-2 size-8" style={{ color: 'var(--success)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
            {amount} USDC arrived on Arc Testnet
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Your balance will update shortly.</p>
          {onClose && (
            <button onClick={onClose} className="mt-3 text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>
              Back to marketplace
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-center" style={{ color: 'var(--subtle)' }}>
        Bridge takes ~10–30 seconds via CCTP fast mode. No fees from Peetopee.
      </p>
    </div>
  )
}
