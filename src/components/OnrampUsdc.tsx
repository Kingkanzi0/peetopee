/**
 * OnrampUsdc — buy USDC with a debit card, Apple Pay, or Google Pay.
 *
 * Circle Onramp Kit (@circle-fin/onramp-kit) is currently in private beta.
 * To activate this screen:
 *  1. Get a Cloudsmith key + package version from your Circle contact.
 *  2. Configure .npmrc and run: bun add @circle-fin/onramp-kit
 *  3. Add KIT_KEY to your server .env (never expose it to the client).
 *  4. Add a server route POST /api/onramp/sessions using createOnrampServerKit + createSessionRouteHandler.
 *  5. Uncomment the live implementation below.
 *
 * Until then this component renders a styled placeholder that explains the path.
 */
import { CreditCard, Smartphone, Building2, ArrowRight } from 'lucide-react'

interface Props {
  destinationAddress?: string
  onClose?: () => void
}

export function OnrampUsdc({ destinationAddress, onClose }: Props) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>Buy USDC</h3>
        {onClose && (
          <button onClick={onClose} className="text-xs" style={{ color: 'var(--muted)' }}>Close</button>
        )}
      </div>

      {/* Hero */}
      <div
        className="rounded-2xl p-5"
        style={{
          background: 'linear-gradient(135deg, #122d45 0%, #1061a6 100%)',
        }}
      >
        <p className="display text-lg font-bold text-white">Buy USDC instantly</p>
        <p className="mt-1 text-sm text-white/70">Debit card, Apple Pay, Google Pay, or bank transfer — no exchange needed.</p>
        {destinationAddress && (
          <div className="mono mt-3 rounded-lg px-3 py-2 text-xs text-white/60" style={{ background: 'rgba(255,255,255,0.1)' }}>
            To: {destinationAddress.slice(0, 10)}...{destinationAddress.slice(-6)}
          </div>
        )}
      </div>

      {/* Payment methods */}
      <div className="space-y-2">
        {[
          { icon: CreditCard,  label: 'Debit card',   sub: 'Instant, all major cards' },
          { icon: Smartphone,  label: 'Apple / Google Pay', sub: 'Fastest option on mobile' },
          { icon: Building2,   label: 'Bank transfer', sub: '1–2 business days' },
        ].map(({ icon: Icon, label, sub }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--surface-strong)' }}>
              <Icon className="size-4" style={{ color: 'var(--accent)' }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{label}</p>
              <p className="text-xs" style={{ color: 'var(--subtle)' }}>{sub}</p>
            </div>
            <ArrowRight className="size-4 shrink-0" style={{ color: 'var(--subtle)' }} />
          </div>
        ))}
      </div>

      {/* Status note */}
      <div
        className="rounded-2xl px-4 py-3"
        style={{ background: 'rgba(16,97,166,0.06)', border: '1px solid rgba(16,97,166,0.12)' }}
      >
        <p className="text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>Coming soon</p>
        <p className="mt-1 text-xs" style={{ color: 'var(--ink-2)' }}>
          Circle's fiat onramp is in private beta. Once your Circle contact provides the Cloudsmith access key,
          this button will open Circle's hosted checkout widget — no app switching, no CEX account needed.
        </p>
        <a
          href="https://developers.circle.com"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium"
          style={{ color: 'var(--accent-hover)' }}
        >
          Learn more about Circle Onramp <ArrowRight className="size-3" />
        </a>
      </div>

      {/* Alternative: use sidebar faucet on testnet */}
      <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--surface-muted)' }}>
        <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>On testnet?</p>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
          Use the <strong>Get test USDC</strong> button in the Arc Studio sidebar to get free test USDC instantly — no card needed.
        </p>
      </div>
    </div>
  )
}
