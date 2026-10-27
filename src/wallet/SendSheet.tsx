/**
 * SendSheet — bottom sheet for sending USDC or native tokens.
 */
import { useState } from 'react'
import { X, Send, Loader2, CheckCircle2, ExternalLink } from 'lucide-react'
import { useWallet, WALLET_CHAINS } from './useWalletStore'
import { sendUsdc } from './walletCore'

type Step = 'form' | 'confirm' | 'sending' | 'done' | 'error'

export function SendSheet({ onClose }: { onClose: () => void }) {
  const { credential, activeChainId, switchChain } = useWallet()
  const [step, setStep] = useState<Step>('form')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [txHash, setTxHash] = useState('')
  const [errMsg, setErrMsg] = useState('')

  const activeChain = WALLET_CHAINS.find(c => c.id === activeChainId)!

  async function submit() {
    if (!credential) return
    setStep('sending')
    try {
      const hash = await sendUsdc({ credential, chainId: activeChainId, to: to as `0x${string}`, amountUsdc: amount })
      setTxHash(hash)
      setStep('done')
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Transaction failed')
      setStep('error')
    }
  }

  return (
    <BottomSheet onClose={onClose} title="Send">
      {step === 'form' && (
        <div className="space-y-4">
          {/* Chain selector */}
          <div>
            <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--subtle)' }}>NETWORK</label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {WALLET_CHAINS.map(c => (
                <button
                  key={c.id}
                  onClick={() => switchChain(c.id)}
                  className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                  style={{
                    background: c.id === activeChainId ? 'var(--accent)' : 'var(--surface-muted)',
                    color: c.id === activeChainId ? 'white' : 'var(--subtle)',
                  }}
                >
                  {c.shortName}
                </button>
              ))}
            </div>
          </div>

          <InputField
            label="RECIPIENT ADDRESS"
            placeholder="0x..."
            value={to}
            onChange={setTo}
          />
          <InputField
            label="AMOUNT (USDC)"
            placeholder="0.00"
            type="number"
            value={amount}
            onChange={setAmount}
          />

          <button
            onClick={() => setStep('confirm')}
            disabled={!to || !amount || parseFloat(amount) <= 0}
            className="w-full rounded-2xl py-3.5 font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            <Send className="size-4" /> Review
          </button>
        </div>
      )}

      {step === 'confirm' && (
        <div className="space-y-5">
          <div
            className="rounded-2xl p-4 space-y-3"
            style={{ background: 'var(--surface-muted)' }}
          >
            <ConfirmRow label="Network" value={activeChain.name} />
            <ConfirmRow label="To" value={`${to.slice(0,8)}...${to.slice(-6)}`} />
            <ConfirmRow label="Amount" value={`${amount} USDC`} />
            <ConfirmRow label="Gas" value="Sponsored (free)" accent />
          </div>
          <p className="text-xs text-center" style={{ color: 'var(--subtle)' }}>
            You'll be prompted for your passkey to sign this transaction.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setStep('form')}
              className="flex-1 rounded-2xl py-3.5 font-semibold text-sm"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
            >
              Back
            </button>
            <button
              onClick={() => void submit()}
              className="flex-1 rounded-2xl py-3.5 font-semibold text-sm text-white"
              style={{ background: 'var(--accent)' }}
            >
              Confirm & Sign
            </button>
          </div>
        </div>
      )}

      {step === 'sending' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <Loader2 className="size-10 animate-spin" style={{ color: 'var(--accent)' }} />
          <p className="font-semibold" style={{ color: 'var(--ink)' }}>Broadcasting transaction…</p>
          <p className="text-xs text-center" style={{ color: 'var(--subtle)' }}>
            Waiting for passkey confirmation and on-chain inclusion.
          </p>
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <CheckCircle2 className="size-12" style={{ color: '#22c55e' }} />
          <p className="font-semibold text-lg" style={{ color: 'var(--ink)' }}>Sent!</p>
          <p className="text-sm" style={{ color: 'var(--subtle)' }}>{amount} USDC on {activeChain.shortName}</p>
          {txHash && (
            <a
              href={`${activeChain.explorerUrl}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-sm"
              style={{ color: 'var(--accent)' }}
            >
              View on explorer <ExternalLink className="size-3" />
            </a>
          )}
          <button
            onClick={onClose}
            className="mt-2 rounded-2xl px-8 py-3 font-semibold text-sm text-white"
            style={{ background: 'var(--accent)' }}
          >
            Done
          </button>
        </div>
      )}

      {step === 'error' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <p className="font-semibold" style={{ color: 'var(--red)' }}>Transaction failed</p>
          <p className="text-xs text-center max-w-xs" style={{ color: 'var(--subtle)' }}>{errMsg}</p>
          <button
            onClick={() => setStep('form')}
            className="rounded-2xl px-8 py-3 font-semibold text-sm text-white"
            style={{ background: 'var(--accent)' }}
          >
            Try again
          </button>
        </div>
      )}
    </BottomSheet>
  )
}

// ---------- helpers ----------

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div
        className="rounded-t-3xl p-6 pb-10 max-h-[90dvh] overflow-y-auto"
        style={{ background: 'var(--surface)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg" style={{ color: 'var(--ink)' }}>{title}</h3>
          <button onClick={onClose}><X className="size-5" style={{ color: 'var(--subtle)' }} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function InputField({ label, placeholder, value, onChange, type = 'text' }: {
  label: string; placeholder: string; value: string
  onChange: (v: string) => void; type?: string
}) {
  return (
    <div>
      <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--subtle)' }}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-2xl px-4 py-3.5 text-sm outline-none"
        style={{
          background: 'var(--surface-muted)',
          border: '1.5px solid var(--border)',
          color: 'var(--ink)',
        }}
      />
    </div>
  )
}

function ConfirmRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs" style={{ color: 'var(--subtle)' }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: accent ? '#22c55e' : 'var(--ink)' }}>{value}</span>
    </div>
  )
}
