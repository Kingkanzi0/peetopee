/**
 * ReceiveSheet — shows a QR code and copyable address for receiving funds.
 * Accepts an optional overrideAddress (from wagmi connected wallet).
 */
import { useState } from 'react'
import { X, Copy, Check } from 'lucide-react'

interface Props {
  onClose: () => void
  overrideAddress?: string
}

export function ReceiveSheet({ onClose, overrideAddress }: Props) {
  const [copied, setCopied] = useState(false)
  const address = overrideAddress ?? null

  function copy() {
    if (!address) return
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="rounded-t-3xl p-6 pb-10 space-y-5"
        style={{ background: 'var(--bg)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg display" style={{ color: 'var(--ink)' }}>Receive</h3>
          <button
            onClick={onClose}
            className="rounded-full p-1"
            style={{ background: 'var(--surface-muted)' }}
          >
            <X className="size-5" style={{ color: 'var(--subtle)' }} />
          </button>
        </div>

        {address ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-center" style={{ color: 'var(--subtle)' }}>
              Share this address to receive USDC or tokens. Make sure the sender uses the correct network.
            </p>

            {/* QR code via free public API */}
            <div
              className="size-52 rounded-2xl overflow-hidden flex items-center justify-center"
              style={{ border: '2px solid var(--border)', background: 'white' }}
            >
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(address)}`}
                alt="Wallet QR Code"
                width={200}
                height={200}
              />
            </div>

            {/* Copyable address */}
            <div
              className="w-full rounded-2xl px-4 py-3 flex items-center gap-2"
              style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)' }}
            >
              <span className="flex-1 mono text-xs break-all select-all" style={{ color: 'var(--ink)' }}>
                {address}
              </span>
              <button
                onClick={copy}
                className="shrink-0 p-2 rounded-xl transition-all active:scale-90"
                style={{ background: 'var(--accent)' }}
              >
                {copied
                  ? <Check className="size-4 text-white" />
                  : <Copy className="size-4 text-white" />
                }
              </button>
            </div>

            <p className="text-xs text-center" style={{ color: 'var(--subtle)' }}>
              Long-press the address above to copy it on mobile.
            </p>
          </div>
        ) : (
          <p className="text-center text-sm py-8" style={{ color: 'var(--subtle)' }}>
            Connect your wallet first to see your address.
          </p>
        )}
      </div>
    </div>
  )
}
