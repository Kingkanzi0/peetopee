/**
 * BackupWallet — show the recovery phrase (or, for older wallets, the private key)
 * after re-entering the PIN, so the wallet can be restored on another phone.
 *
 * BackupReminder — a banner shown until the user confirms they've saved it.
 */
import { useState, useSyncExternalStore } from 'react'
import { ShieldAlert, ShieldCheck, Eye, Copy, Check, X, Loader2, KeyRound } from 'lucide-react'
import type { Hex } from 'viem'
import { usePinAuth } from '../hooks/usePinAuth'
import { getBackupSecret, isWalletBackedUp, markWalletBackedUp, subscribeWallet, loadStoredWallet } from './standaloneWallet'

/** Re-renders when the backed-up flag changes. */
export function useWalletBackedUp() {
  return useSyncExternalStore(subscribeWallet, () => isWalletBackedUp())
}

export function BackupWallet({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'intro' | 'pin' | 'show'>('intro')
  const [pin, setPin] = useState('')
  const { verifyPin, busy, error, setError } = usePinAuth()
  const [secret, setSecret] = useState<{ phrase: string | null; privateKey: Hex } | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [loadError, setLoadError] = useState('')

  async function checkPin(value: string) {
    if (value.length !== 6) return
    if (!(await verifyPin(value))) { setPin(''); return }
    try {
      setSecret(await getBackupSecret())
      setStep('show')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not open your wallet.')
    }
  }

  const words = secret?.phrase?.split(' ') ?? null
  const text = secret ? (secret.phrase ?? secret.privateKey) : ''

  function copy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      // Don't leave it on the clipboard longer than needed.
      setTimeout(() => { setCopied(false); void navigator.clipboard.writeText('').catch(() => {}) }, 30_000)
    })
  }

  function finish() {
    markWalletBackedUp()
    setSecret(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end sm:justify-center sm:items-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4 overflow-y-auto"
        style={{ background: 'var(--bg)', maxHeight: '92dvh', paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold display flex items-center gap-2" style={{ color: 'var(--ink)' }}>
            <KeyRound className="size-5" /> Back up your wallet
          </h2>
          <button onClick={() => { setSecret(null); onClose() }} aria-label="Close" className="rounded-full p-1.5" style={{ background: 'var(--surface-muted)' }}>
            <X className="size-5" style={{ color: 'var(--ink)' }} />
          </button>
        </div>

        {step === 'intro' && (
          <>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Your wallet lives only on this phone. If you lose the phone or clear the browser, the only way to get your money back is the recovery phrase (or private key) you're about to see.
            </p>
            <ul className="text-sm space-y-1.5" style={{ color: 'var(--ink)' }}>
              <li>✍️ Write it on paper and keep it somewhere safe.</li>
              <li>🚫 Never share it — not with Peetopee support, traders or anyone. Anyone who has it can take your money.</li>
              <li>📵 Don't screenshot it or keep it in chats or email.</li>
            </ul>
            <button onClick={() => setStep('pin')} className="w-full rounded-2xl py-3.5 text-sm font-bold text-white" style={{ background: 'var(--accent)' }}>
              I understand — continue
            </button>
          </>
        )}

        {step === 'pin' && (
          <>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Enter your 6-digit PIN to continue.</p>
            <input
              type="password" inputMode="numeric" autoComplete="off" autoFocus maxLength={6} value={pin}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                setPin(v); setError(null)
                if (v.length === 6) void checkPin(v)
              }}
              className="w-full rounded-2xl px-4 py-4 text-center text-2xl tracking-[0.6em] font-bold outline-none"
              style={{ background: 'var(--surface-muted)', border: `1.5px solid ${error ? 'var(--danger)' : 'var(--border)'}`, color: 'var(--ink)' }}
            />
            {busy && <Loader2 className="size-5 animate-spin mx-auto" style={{ color: 'var(--accent)' }} />}
            {(error || loadError) && <p className="text-xs text-center" style={{ color: 'var(--danger)' }}>{error ?? loadError}</p>}
          </>
        )}

        {step === 'show' && secret && (
          <>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {words ? `Your ${words.length}-word recovery phrase` : 'Your private key'}
            </p>
            {!words && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                This wallet was set up before recovery phrases were kept, so back up its private key instead.
                To restore it, choose <b>Import existing wallet → Private key</b> on the new phone.
              </p>
            )}
            <div className="relative rounded-2xl p-3" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              <div className={revealed ? '' : 'blur-md select-none pointer-events-none'}>
                {words ? (
                  <div className="grid grid-cols-3 gap-2">
                    {words.map((w, i) => (
                      <div key={i} className="rounded-xl px-2 py-1.5 text-sm font-mono" style={{ background: 'var(--chip)', color: 'var(--ink)' }}>
                        <span className="text-xs mr-1" style={{ color: 'var(--subtle)' }}>{i + 1}.</span>{w}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="font-mono text-sm break-all p-1" style={{ color: 'var(--ink)' }}>{secret.privateKey}</p>
                )}
              </div>
              {!revealed && (
                <button onClick={() => setRevealed(true)} className="absolute inset-0 flex items-center justify-center gap-2 rounded-2xl text-sm font-semibold"
                  style={{ color: 'var(--ink)' }}>
                  <Eye className="size-4" /> Tap to show — make sure no one can see your screen
                </button>
              )}
            </div>
            {revealed && (
              <button onClick={copy} className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
                {copied ? <><Check className="size-3.5" /> Copied — cleared from the clipboard in 30s</> : <><Copy className="size-3.5" /> Copy (paper is safer)</>}
              </button>
            )}
            <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: 'var(--ink)' }}>
              <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" />
              I've written it down and stored it somewhere safe.
            </label>
            <button onClick={finish} disabled={!confirmed || !revealed}
              className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>
              Done
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** Banner until the wallet is backed up. Opens the backup sheet itself. */
export function BackupReminder() {
  const backedUp = useWalletBackedUp()
  const hasWallet = !!loadStoredWallet()
  const [open, setOpen] = useState(false)
  if (!hasWallet || backedUp) return null
  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full text-left rounded-2xl p-3.5 mb-4 flex items-center gap-3"
        style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn-border)' }}>
        <ShieldAlert className="size-5 shrink-0" style={{ color: '#d97706' }} />
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: 'var(--warn-ink)' }}>Back up your wallet</p>
          <p className="text-xs" style={{ color: 'var(--warn-ink)' }}>Without a backup, losing this phone means losing your money.</p>
        </div>
        <span className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white shrink-0" style={{ background: '#d97706' }}>Back up</span>
      </button>
      {open && <BackupWallet onClose={() => setOpen(false)} />}
    </>
  )
}

/** Card for the Wallet tab: status + button. */
export function BackupCard() {
  const backedUp = useWalletBackedUp()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full flex items-center gap-3 rounded-2xl p-4 text-left"
        style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}>
        {backedUp ? <ShieldCheck className="size-5 shrink-0" style={{ color: 'var(--success)' }} /> : <ShieldAlert className="size-5 shrink-0" style={{ color: '#d97706' }} />}
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Back up wallet</p>
          <p className="text-xs" style={{ color: backedUp ? 'var(--subtle)' : 'var(--warn-ink)' }}>
            {backedUp ? 'Backed up. Tap to view your recovery phrase again.' : 'Not backed up yet — do this now.'}
          </p>
        </div>
      </button>
      {open && <BackupWallet onClose={() => setOpen(false)} />}
    </>
  )
}
