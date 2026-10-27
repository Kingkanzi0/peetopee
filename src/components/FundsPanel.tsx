/**
 * FundsPanel — hub for "get USDC": bridge from another chain or buy with card.
 */
import { useState } from 'react'
import { ArrowDownUp, CreditCard } from 'lucide-react'
import { BridgeUsdc } from './BridgeUsdc'
import { OnrampUsdc } from './OnrampUsdc'

type Mode = 'home' | 'bridge' | 'onramp'

interface Props {
  walletAddress?: string
}

export function FundsPanel({ walletAddress }: Props) {
  const [mode, setMode] = useState<Mode>('home')

  if (mode === 'bridge') return <BridgeUsdc onClose={() => setMode('home')} />
  if (mode === 'onramp') return <OnrampUsdc destinationAddress={walletAddress} onClose={() => setMode('home')} />

  return (
    <div className="mx-auto max-w-lg px-4 py-6 space-y-4">
      <h2 className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>Get USDC</h2>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Fund your wallet to start trading. Choose how you'd like to add USDC.
      </p>

      {/* Bridge */}
      <button
        onClick={() => setMode('bridge')}
        className="w-full rounded-2xl p-5 text-left flex items-start gap-4 transition-all hover:scale-[1.01] active:scale-[0.99]"
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
      >
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: 'rgba(18,45,69,0.08)' }}>
          <ArrowDownUp className="size-5" style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Bridge from another chain</p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            Move USDC from Base, Ethereum, or Arbitrum to Arc Testnet in ~20 seconds via CCTP.
          </p>
          <div className="mt-2 flex gap-1.5 flex-wrap">
            {['Base Sepolia', 'Eth Sepolia', 'Arb Sepolia'].map(c => (
              <span key={c} className="text-xs rounded-lg px-2 py-0.5 font-medium" style={{ background: 'var(--surface-muted)', color: 'var(--subtle)' }}>{c}</span>
            ))}
          </div>
        </div>
      </button>

      {/* Buy with card */}
      <button
        onClick={() => setMode('onramp')}
        className="w-full rounded-2xl p-5 text-left flex items-start gap-4 transition-all hover:scale-[1.01] active:scale-[0.99]"
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
      >
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: 'rgba(18,45,69,0.08)' }}>
          <CreditCard className="size-5" style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Buy with card</p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
            Purchase USDC with a debit card, Apple Pay, or bank transfer via Circle's onramp (private beta).
          </p>
          <span className="mt-2 inline-block text-xs rounded-lg px-2 py-0.5 font-medium" style={{ background: 'rgba(16,97,166,0.1)', color: 'var(--accent-hover)' }}>
            Coming soon
          </span>
        </div>
      </button>

      {/* Testnet shortcut */}
      <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--surface-muted)' }}>
        <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Testing the app?</p>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
          Hit the <strong>Get test USDC</strong> button in the Arc Studio sidebar for free testnet USDC instantly.
        </p>
      </div>
    </div>
  )
}
