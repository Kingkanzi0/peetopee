/**
 * WalletSetupModal — Create a new wallet or import an existing one.
 *
 * CREATE: generates a 12-word seed phrase in-browser, derives the Ethereum
 * address, shows the full address + "Get test USDC" faucet link. No MetaMask
 * needed — the address is ready to receive funds immediately.
 *
 * IMPORT: paste a 12/24-word seed phrase to derive the address.
 */
import { useState, useCallback } from 'react'
import * as bip39 from 'bip39'
import { HDKey } from '@scure/bip32'
import { toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  X, Eye, EyeOff, Copy, Check, AlertTriangle, Wallet, ExternalLink,
} from 'lucide-react'

const STORAGE_KEY = 'ptp_imported_wallet'

export interface ImportedWallet {
  address: string
  privateKey?: string   // stored only if user opts in — shown once
  label: 'created' | 'imported'
}

export function loadImportedWallet(): ImportedWallet | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ImportedWallet) : null
  } catch { return null }
}

export function clearImportedWallet() {
  localStorage.removeItem(STORAGE_KEY)
}

interface Props {
  onClose: () => void
  onWallet: (w: ImportedWallet) => void
}

function deriveFromMnemonic(mnemonic: string): { address: string; privateKey: string } {
  const seed = bip39.mnemonicToSeedSync(mnemonic)
  const root = HDKey.fromMasterSeed(seed)
  const child = root.derive("m/44'/60'/0'/0/0")
  if (!child.privateKey) throw new Error('Could not derive key')
  const privateKey = toHex(child.privateKey)
  const account = privateKeyToAccount(privateKey)
  return { address: account.address, privateKey }
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [text])
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all active:scale-95"
      style={{ background: copied ? '#dcfce7' : 'var(--surface-strong)', color: copied ? '#16a34a' : 'var(--ink)', border: '1px solid var(--border)' }}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? 'Copied!' : (label ?? 'Copy')}
    </button>
  )
}

export function WalletSetupModal({ onClose, onWallet }: Props) {
  const [tab, setTab] = useState<'create' | 'import'>('create')

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div
        className="rounded-t-3xl overflow-y-auto"
        style={{ background: 'var(--bg)', maxHeight: '92dvh' }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold display" style={{ color: 'var(--ink)' }}>Wallet setup</h2>
            <button onClick={onClose} className="rounded-full p-1.5" style={{ background: 'var(--surface-muted)' }}>
              <X className="size-5" style={{ color: 'var(--ink)' }} />
            </button>
          </div>

          <div className="flex rounded-2xl p-1 gap-1" style={{ background: 'var(--surface-strong)' }}>
            {(['create', 'import'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all capitalize"
                style={{
                  background: tab === t ? 'var(--accent)' : 'transparent',
                  color: tab === t ? 'white' : 'var(--muted)',
                }}
              >
                {t === 'create' ? 'Create new' : 'Import wallet'}
              </button>
            ))}
          </div>

          {tab === 'create'
            ? <CreateWallet onClose={onClose} onWallet={onWallet} />
            : <ImportWallet onClose={onClose} onWallet={onWallet} />
          }
        </div>
      </div>
    </div>
  )
}

// ─── Create new wallet ──────────────────────────────────────────────────────
function CreateWallet({ onClose, onWallet }: { onClose: () => void; onWallet: (w: ImportedWallet) => void }) {
  const [{ mnemonic, address, privateKey }] = useState(() => {
    const mn = bip39.generateMnemonic(128)
    const { address: addr, privateKey: pk } = deriveFromMnemonic(mn)
    return { mnemonic: mn, address: addr, privateKey: pk }
  })

  const [step, setStep] = useState<'phrase' | 'done'>('phrase')
  const [revealed, setRevealed] = useState(false)
  const [showPk, setShowPk] = useState(false)
  const [backed, setBacked] = useState(false)

  function save() {
    const w: ImportedWallet = { address, privateKey, label: 'created' }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(w))
    onWallet(w)
    setStep('done')
  }

  if (step === 'done') {
    return (
      <div className="space-y-4">
        {/* Success card */}
        <div
          className="rounded-2xl p-5 text-center space-y-2"
          style={{ background: 'linear-gradient(135deg, #0052ff11, #7c3aed11)', border: '1.5px solid var(--accent)' }}
        >
          <div className="flex size-12 items-center justify-center rounded-2xl mx-auto mb-3"
            style={{ background: 'var(--accent)' }}>
            <Wallet className="size-6 text-white" />
          </div>
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Wallet created!</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Your wallet address:</p>
          <div className="flex items-center gap-2 justify-center flex-wrap">
            <code className="text-xs font-mono break-all" style={{ color: 'var(--ink)' }}>{address}</code>
            <CopyButton text={address} label="Copy address" />
          </div>
        </div>

        {/* Private key (optional reveal) */}
        <div className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Private key</p>
            <button
              onClick={() => setShowPk(v => !v)}
              className="flex items-center gap-1 text-xs"
              style={{ color: 'var(--muted)' }}
            >
              {showPk ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
              {showPk ? 'Hide' : 'Reveal'}
            </button>
          </div>
          {showPk
            ? (
              <div className="flex items-start gap-2">
                <code className="text-xs font-mono break-all flex-1" style={{ color: 'var(--ink)' }}>{privateKey}</code>
                <CopyButton text={privateKey} />
              </div>
            )
            : <p className="text-xs" style={{ color: 'var(--subtle)' }}>Tap Reveal to show your private key. Keep it secret — never share it.</p>
          }
        </div>

        {/* Fund with test USDC */}
        <div
          className="rounded-2xl p-4 space-y-3"
          style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe' }}
        >
          <p className="text-sm font-semibold text-blue-900">Get test USDC</p>
          <p className="text-xs text-blue-800">
            Your new wallet is empty. To try Peetopee, get free testnet USDC from the Arc faucet:
          </p>
          <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
            <li>Copy your wallet address above</li>
            <li>Open the Arc faucet (link below)</li>
            <li>Paste your address and request USDC</li>
            <li>Funds arrive in ~30 seconds</li>
          </ol>
          <a
            href={`https://faucet.circle.com/?address=${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white"
            style={{ background: '#1A6FE8' }}
          >
            <ExternalLink className="size-4" />
            Open Arc Testnet Faucet
          </a>
          <p className="text-xs text-center text-blue-700">
            Or use the <strong>Get test USDC</strong> button in the Arc Studio sidebar if you're testing in-app.
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full rounded-2xl py-3.5 font-semibold transition-all active:scale-[0.98]"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          Done
        </button>
      </div>
    )
  }

  // Step: show seed phrase
  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 flex gap-3" style={{ background: '#fffbeb', border: '1px solid #fcd34d' }}>
        <AlertTriangle className="size-4 shrink-0 text-amber-500 mt-0.5" />
        <p className="text-xs text-amber-800">
          Write down your seed phrase and store it somewhere safe. Anyone with these words controls your wallet. This is shown <strong>only once</strong>.
        </p>
      </div>

      {/* Seed phrase grid */}
      <div className="relative">
        <div className={`grid grid-cols-3 gap-2 ${!revealed ? 'blur-sm select-none pointer-events-none' : ''}`}>
          {mnemonic.split(' ').map((word, i) => (
            <div
              key={i}
              className="rounded-xl px-3 py-2 text-sm font-mono text-center"
              style={{ background: 'var(--surface-strong)', color: 'var(--ink)' }}
            >
              <span className="text-xs mr-1" style={{ color: 'var(--subtle)' }}>{i + 1}.</span>{word}
            </div>
          ))}
        </div>
        {!revealed && (
          <button
            onClick={() => setRevealed(true)}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl"
            style={{ background: 'rgba(0,0,0,0.18)' }}
          >
            <Eye className="size-6 text-white" />
            <span className="text-white text-sm font-semibold">Tap to reveal seed phrase</span>
          </button>
        )}
      </div>

      {revealed && <CopyButton text={mnemonic} label="Copy all 12 words" />}

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={backed}
          onChange={e => setBacked(e.target.checked)}
          className="mt-0.5 size-4 rounded accent-blue-600"
        />
        <span className="text-sm" style={{ color: 'var(--ink)' }}>
          I've written down my seed phrase and stored it safely.
        </span>
      </label>

      <button
        onClick={save}
        disabled={!backed || !revealed}
        className="w-full rounded-2xl py-3.5 font-semibold text-white disabled:opacity-40 active:scale-[0.98] transition-transform"
        style={{ background: 'var(--accent)' }}
      >
        Create wallet →
      </button>
    </div>
  )
}

// ─── Import existing wallet ──────────────────────────────────────────────────
function ImportWallet({ onClose, onWallet }: { onClose: () => void; onWallet: (w: ImportedWallet) => void }) {
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ address: string; privateKey: string } | null>(null)

  function handleImport() {
    setError('')
    const clean = phrase.trim().replace(/\s+/g, ' ')
    const words = clean.split(' ')
    if (words.length !== 12 && words.length !== 24) {
      setError('Enter a 12 or 24-word seed phrase.')
      return
    }
    if (!bip39.validateMnemonic(clean)) {
      setError('Seed phrase is not valid. Check each word carefully.')
      return
    }
    try {
      const derived = deriveFromMnemonic(clean)
      setResult(derived)
      const w: ImportedWallet = { address: derived.address, privateKey: derived.privateKey, label: 'imported' }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(w))
      onWallet(w)
    } catch {
      setError('Could not derive wallet from this phrase.')
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <div
          className="rounded-2xl p-5 text-center space-y-3"
          style={{ background: '#f0fdf4', border: '1.5px solid #86efac' }}
        >
          <p className="text-sm font-bold text-green-800">Wallet imported!</p>
          <p className="text-xs text-green-700">Derived address:</p>
          <div className="flex items-center gap-2 justify-center flex-wrap">
            <code className="text-xs font-mono break-all text-green-900">{result.address}</code>
            <CopyButton text={result.address} label="Copy" />
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-full rounded-2xl py-3.5 font-semibold text-white active:scale-[0.98] transition-transform"
          style={{ background: 'var(--accent)' }}
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Enter your 12 or 24-word seed phrase to derive your Ethereum wallet address.
      </p>
      <textarea
        value={phrase}
        onChange={e => setPhrase(e.target.value)}
        placeholder="word1 word2 word3 ... word12"
        rows={4}
        className="w-full rounded-2xl p-4 text-sm font-mono resize-none outline-none"
        style={{
          background: 'var(--surface-strong)',
          color: 'var(--ink)',
          border: error ? '1.5px solid #ef4444' : '1.5px solid var(--border)',
        }}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        onClick={handleImport}
        disabled={!phrase.trim()}
        className="w-full rounded-2xl py-3.5 font-semibold text-white disabled:opacity-40 active:scale-[0.98] transition-transform"
        style={{ background: 'var(--accent)' }}
      >
        Import wallet
      </button>
    </div>
  )
}
