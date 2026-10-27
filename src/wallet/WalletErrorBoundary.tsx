/**
 * WalletErrorBoundary — catches any thrown error inside the wallet tab
 * and shows a recovery UI instead of a white screen.
 */
import { Component, type ReactNode, type ErrorInfo } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class WalletErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[WalletErrorBoundary]', error, info)
  }

  reset() {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const msg = error.message ?? String(error)
    const isKeyError = /401|unauthorized|client.?key|not.?set|invalid.?key/i.test(msg)
    const isNetworkError = /fetch|network|failed to fetch|rpc|reach/i.test(msg)

    return (
      <div className="mx-auto max-w-sm px-5 py-10 flex flex-col items-center gap-5">
        <div
          className="flex size-14 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(186,43,76,0.08)' }}
        >
          <AlertTriangle className="size-7" style={{ color: 'var(--danger)' }} />
        </div>

        <div className="text-center space-y-1">
          <h3 className="font-bold text-base" style={{ color: 'var(--ink)' }}>
            {isKeyError ? 'Wallet setup issue' : isNetworkError ? 'Connection error' : 'Something went wrong'}
          </h3>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {isKeyError
              ? 'The Circle client key is not authorised for this domain. Check Console → Client Keys → Allowed Domain.'
              : isNetworkError
              ? "Couldn't reach Circle's network. Check your connection and try again."
              : msg.length < 200 ? msg : 'An unexpected error occurred in the wallet.'}
          </p>
        </div>

        {/* Show exact origin so user knows what to paste in Console */}
        <div
          className="w-full rounded-xl p-3 space-y-1"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
            This page's domain (paste into Console)
          </p>
          <p className="mono text-xs break-all font-medium" style={{ color: 'var(--ink)' }}>
            {window.location.hostname}
          </p>
        </div>

        <button
          onClick={() => this.reset()}
          className="flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          <RefreshCw className="size-4" />
          Try again
        </button>
      </div>
    )
  }
}
