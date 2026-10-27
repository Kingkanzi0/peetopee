/**
 * WalletAuth — passkey register / login screen.
 * Shows a clear "setup required" card when VITE_CLIENT_KEY is not configured.
 * Translates raw Circle/RPC errors into plain-English messages.
 */
import { useState } from 'react'
import { Fingerprint, KeyRound, Loader2, AlertCircle, ExternalLink, Settings2 } from 'lucide-react'
import { useWallet } from './useWalletStore'
import { CLIENT_KEY } from './walletCore'

// ---- Error translation -------------------------------------------------------
function friendlyError(raw: string): string {
  const r = raw.toLowerCase()
  // Circle SDK / bundler auth errors
  if (r.includes('401') || r.includes('unauthorized') || r.includes('invalid credentials'))
    return 'The wallet client key is not set up yet. See the setup steps below.'
  if (r.includes('403') || r.includes('forbidden'))
    return 'This domain is not allowed by the client key. Check the Allowed Domain in Circle Console.'
  if (r.includes('securityerror') || r.includes('not allowed'))
    return 'Passkey domain mismatch. The Passkey Domain in Circle Console must match this app\'s hostname exactly.'
  if (r.includes('invalidstateerror'))
    return 'A passkey already exists for this username. Try "Sign in" instead.'
  if (r.includes('notallowederror'))
    return 'Passkey prompt was cancelled or timed out. Please try again.'
  if (r.includes('network') || r.includes('fetch') || r.includes('failed to fetch'))
    return 'Network error. Check your connection and try again.'
  if (r.includes('rpc') || r.includes('bundler'))
    return 'Could not reach Circle\'s network. The client key may be missing or invalid — see setup below.'
  return raw.length > 120 ? raw.slice(0, 120) + '…' : raw
}

// ---- Setup banner (shown when key is blank) ----------------------------------
function SetupRequired() {
  return (
    <div className="mx-auto max-w-sm px-6 py-8 space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className="flex size-14 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(186,43,76,0.08)', border: '1px solid rgba(186,43,76,0.2)' }}
        >
          <Settings2 className="size-7" style={{ color: 'var(--danger)' }} />
        </div>
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Wallet setup required</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            The inbuilt wallet needs a Circle Client Key before passkeys will work.
          </p>
        </div>
      </div>

      {/* Domain copy box — what to paste into Console */}
      <div className="rounded-2xl p-3.5 space-y-1.5" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
          Paste this exact hostname into Circle Console
        </p>
        <p className="mono text-sm break-all font-semibold select-all" style={{ color: 'var(--ink)' }}>
          {window.location.hostname}
        </p>
        <p className="text-[11px]" style={{ color: 'var(--subtle)' }}>
          No https:// · no trailing slash · exact match required
        </p>
      </div>

      <div className="rounded-2xl p-4 space-y-3 text-sm" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        <p className="font-semibold" style={{ color: 'var(--ink)' }}>3-step setup in Console</p>
        <ol className="space-y-2.5 list-none">
          {[
            <>Go to <a href="https://console.circle.com" target="_blank" rel="noreferrer" className="underline font-medium" style={{ color: 'var(--accent-hover)' }}>console.circle.com</a> → <strong>Keys → Client Keys</strong> → Create a key. Set <strong>Allowed Domain</strong> to the hostname above.</>,
            <><strong>Wallets → Modular Wallets → Configurator → Passkeys → Domain Name</strong> — paste the same hostname.</>,
            <>Paste the key (starts with <code className="mono text-xs px-1 rounded" style={{ background: 'var(--border)' }}>TEST_CLIENT_KEY:</code>) into <code className="mono text-xs px-1 rounded" style={{ background: 'var(--border)' }}>VITE_CLIENT_KEY</code> in <code className="mono text-xs">.env</code>, then redeploy.</>,
          ].map((step, i) => (
            <li key={i} className="flex gap-2.5 items-start">
              <span
                className="shrink-0 flex size-5 items-center justify-center rounded-full text-xs font-bold text-white mt-0.5"
                style={{ background: 'var(--accent)' }}
              >
                {i + 1}
              </span>
              <span style={{ color: 'var(--ink-2)' }}>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <a
        href="https://developers.circle.com/wallets/modular/console-setup"
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-1.5 text-sm font-medium"
        style={{ color: 'var(--accent-hover)' }}
      >
        Full setup guide
        <ExternalLink className="size-3.5" />
      </a>
    </div>
  )
}

// ---- Main component ----------------------------------------------------------
export function WalletAuth() {
  const { register, login, loading, error } = useWallet()
  const [mode, setMode] = useState<'choose' | 'register'>('choose')
  const [username, setUsername] = useState('')

  const keyMissing = !CLIENT_KEY || CLIENT_KEY.trim() === ''
  const displayError = error ? friendlyError(error) : null
  const showSetupHint = displayError?.includes('setup') || displayError?.includes('client key') || displayError?.includes('bundler')

  if (keyMissing) return <SetupRequired />

  if (mode === 'register') {
    return (
      <div className="mx-auto max-w-sm px-6 py-8 space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl" style={{ background: 'var(--accent)' }}>
            <Fingerprint className="size-7 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Create your wallet</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--subtle)' }}>
              Secured by your fingerprint or Face ID — no seed phrase needed.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            autoComplete="username"
            placeholder="Your name (e.g. Ada)"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full rounded-2xl px-4 py-3.5 outline-none"
            style={{
              background: 'var(--surface-muted)',
              border: '1.5px solid var(--border)',
              color: 'var(--ink)',
              fontSize: 16,
            }}
          />
          <button
            onClick={() => { if (username.trim()) void register(username.trim()) }}
            disabled={loading || !username.trim()}
            className="w-full rounded-2xl py-3.5 font-semibold text-sm text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-50 active:scale-95"
            style={{ background: 'var(--accent)', fontSize: 16 }}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />}
            {loading ? 'Setting up…' : 'Create with passkey'}
          </button>
          <button
            onClick={() => setMode('choose')}
            className="w-full text-sm py-2.5 rounded-xl"
            style={{ color: 'var(--subtle)', background: 'var(--surface-muted)' }}
          >
            ← Back
          </button>
        </div>

        {displayError && (
          <ErrorBanner message={displayError} showSetup={showSetupHint ?? false} />
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm px-6 py-8 space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className="flex size-14 items-center justify-center rounded-2xl"
          style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #7c3aed 100%)' }}
        >
          <KeyRound className="size-7 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Peetopee Wallet</h2>
          <p className="text-sm mt-1 max-w-xs" style={{ color: 'var(--subtle)' }}>
            A self-custodial smart account secured by your device passkey. No seed phrase.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => setMode('register')}
          className="w-full rounded-2xl py-3.5 font-semibold text-sm text-white flex items-center justify-center gap-2 active:scale-95"
          style={{ background: 'var(--accent)', fontSize: 16 }}
        >
          <Fingerprint className="size-4" />
          Create new wallet
        </button>
        <button
          onClick={() => void login()}
          disabled={loading}
          className="w-full rounded-2xl py-3.5 font-semibold text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-50 active:scale-95"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1.5px solid var(--border)', fontSize: 16 }}
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          {loading ? 'Signing in…' : 'Sign in with passkey'}
        </button>
      </div>

      {displayError && (
        <ErrorBanner message={displayError} showSetup={showSetupHint ?? false} />
      )}

      <p className="text-xs text-center" style={{ color: 'var(--subtle)' }}>
        Independent from your connected Web3 wallet. Uses Circle Modular Wallets with gasless transactions.
      </p>
    </div>
  )
}

function ErrorBanner({ message, showSetup }: { message: string; showSetup: boolean }) {
  return (
    <div className="rounded-2xl p-3.5 space-y-2" style={{ background: 'rgba(186,43,76,0.06)', border: '1px solid rgba(186,43,76,0.2)' }}>
      <div className="flex items-start gap-2">
        <AlertCircle className="size-4 mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
        <p className="text-sm" style={{ color: 'var(--danger)' }}>{message}</p>
      </div>
      {showSetup && (
        <>
          {/* Show exact hostname so user can copy it to Console */}
          <div className="ml-6 rounded-lg p-2" style={{ background: 'var(--surface-muted)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--subtle)' }}>
              Your app's hostname (paste into Console → Allowed Domain)
            </p>
            <p className="mono text-xs font-bold break-all select-all" style={{ color: 'var(--ink)' }}>
              {window.location.hostname}
            </p>
          </div>
          <a
            href="https://developers.circle.com/wallets/modular/console-setup"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs font-medium ml-6"
            style={{ color: 'var(--accent-hover)' }}
          >
            Circle Console setup guide <ExternalLink className="size-3" />
          </a>
        </>
      )}
    </div>
  )
}
