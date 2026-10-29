/**
 * WalletTab — fully self-contained wallet.
 * No external wallet, no ConnectKit, no WalletConnect required.
 * Users create or import a wallet using a seed phrase or private key.
 * Reads balances via viem publicClient; sends via viem walletClient.
 */
import { useState, useCallback } from 'react'
import * as bip39 from 'bip39'
import {
  KeyRound, PlusCircle, Download, Eye, EyeOff,
  Copy, Check, AlertTriangle, Trash2, ArrowLeft,
} from 'lucide-react'
import {
  loadStoredWallet, saveWallet, deleteWallet,
  generateMnemonic, deriveFromMnemonic, deriveFromPrivateKey,
  type StoredWallet,
} from './standaloneWallet'
import { StandaloneWalletHome } from './StandaloneWalletHome'

type Screen = 'home' | 'create' | 'import' | 'backup' | 'dashboard'

export function WalletTab({ onBack }: { onBack?: () => void }) {
  const [wallet, setWallet] = useState<StoredWallet | null>(() => loadStoredWallet())
  const [screen, setScreen] = useState<Screen>(() => loadStoredWallet() ? 'dashboard' : 'home')

  function handleWalletCreated(w: StoredWallet) {
    setWallet(w)
    setScreen('dashboard')
  }

  function handleDelete() {
    if (!confirm('Delete this wallet? Make sure you have your seed phrase backed up.')) return
    deleteWallet()
    setWallet(null)
    setScreen('home')
  }

  if (screen === 'dashboard' && wallet) {
    return (
      <StandaloneWalletHome
        wallet={wallet}
        onDelete={handleDelete}
        onBack={onBack}
      />
    )
  }

  if (screen === 'create') {
    return (
      <CreateWalletScreen
        onBack={() => setScreen('home')}
        onCreated={handleWalletCreated}
      />
    )
  }

  if (screen === 'import') {
    return (
      <ImportWalletScreen
        onBack={() => setScreen('home')}
        onImported={handleWalletCreated}
      />
    )
  }

  // Home screen — no wallet yet
  return (
    <div className="flex flex-col items-center gap-6 px-6 py-12 text-center max-w-sm mx-auto">
      <div
        className="flex size-20 items-center justify-center rounded-3xl"
        style={{ background: 'linear-gradient(135deg, #1A6FE8 0%, #0ea5e9 100%)' }}
      >
        <KeyRound className="size-10 text-white" />
      </div>

      <div>
        <h2 className="text-2xl font-bold display mb-2" style={{ color: 'var(--ink)' }}>
          Peetopee Wallet
        </h2>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
          A self-custodial wallet built into Peetopee. Your keys, your crypto — no external app needed.
        </p>
      </div>

      <div className="w-full space-y-3">
        <button
          onClick={() => setScreen('create')}
          className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-4 font-semibold text-white active:scale-[0.98] transition-transform"
          style={{ background: 'linear-gradient(135deg, #1A6FE8 0%, #0ea5e9 100%)' }}
        >
          <PlusCircle className="size-5" />
          Create new wallet
        </button>

        <button
          onClick={() => setScreen('import')}
          className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-4 font-semibold active:scale-[0.98] transition-transform"
          style={{ background: 'var(--surface-strong)', color: 'var(--ink)', border: '1.5px solid var(--border)' }}
        >
          <Download className="size-5" />
          Import existing wallet
        </button>
      </div>

      <div className="rounded-2xl p-4 w-full text-left" style={{ background: 'var(--info-bg)', border: '1px solid var(--info-border)' }}>
        <p className="text-xs font-semibold text-sky-800 mb-1">Testnet wallets</p>
        <p className="text-xs text-sky-700 leading-relaxed">
          This wallet operates on testnets (Arc Testnet, Base Sepolia, etc.). Use the faucet to get free test USDC after creating your wallet.
        </p>
      </div>
    </div>
  )
}

// ---- Create wallet ----------------------------------------------------------
function CreateWalletScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void
  onCreated: (w: StoredWallet) => void
}) {
  const [mnemonic] = useState(() => generateMnemonic())
  const [revealed, setRevealed] = useState(false)
  const [backed, setBacked] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(mnemonic).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }, [mnemonic])

  async function create() {
    const privKey = deriveFromMnemonic(mnemonic)
    await saveWallet(privKey, 'created')
    const saved = loadStoredWallet()
    if (saved) onCreated(saved)
  }

  return (
    <div className="px-4 py-4 max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-full p-2" style={{ background: 'var(--surface-muted)' }}>
          <ArrowLeft className="size-4" style={{ color: 'var(--ink)' }} />
        </button>
        <h2 className="text-lg font-bold display" style={{ color: 'var(--ink)' }}>Create wallet</h2>
      </div>

      <div className="rounded-2xl p-4 flex gap-3" style={{ background: 'var(--warn-bg)', border: '1px solid var(--warn-border)' }}>
        <AlertTriangle className="size-4 shrink-0 text-amber-500 mt-0.5" />
        <p className="text-xs text-amber-800 leading-relaxed">
          Write down your 12-word seed phrase and store it safely offline. Anyone with these words can access your wallet. It is shown only once.
        </p>
      </div>

      {/* Seed phrase grid */}
      <div className="relative">
        <div className={`grid grid-cols-3 gap-2 ${!revealed ? 'blur-sm select-none pointer-events-none' : ''}`}>
          {mnemonic.split(' ').map((word, i) => (
            <div
              key={i}
              className="rounded-xl px-3 py-2.5 text-sm font-mono text-center"
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
            style={{ background: 'rgba(10,20,40,0.55)' }}
          >
            <Eye className="size-8 text-white" />
            <span className="text-white text-sm font-semibold">Tap to reveal seed phrase</span>
          </button>
        )}
      </div>

      {revealed && (
        <button
          onClick={copy}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold"
          style={{ background: 'var(--surface-strong)', color: 'var(--ink)', border: '1.5px solid var(--border)' }}
        >
          {copied ? <Check className="size-4" style={{ color: 'var(--success)' }} /> : <Copy className="size-4" />}
          {copied ? 'Copied!' : 'Copy seed phrase'}
        </button>
      )}

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={backed}
          onChange={e => setBacked(e.target.checked)}
          className="mt-0.5 size-4 accent-blue-600"
        />
        <span className="text-sm" style={{ color: 'var(--ink)' }}>
          I have written down my seed phrase and stored it safely.
        </span>
      </label>

      <button
        onClick={() => { void create() }}
        disabled={!backed || !revealed}
        className="w-full rounded-2xl py-4 font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-transform"
        style={{ background: 'linear-gradient(135deg, #1A6FE8 0%, #0ea5e9 100%)' }}
      >
        Create wallet →
      </button>
    </div>
  )
}

// ---- Import wallet ----------------------------------------------------------
function ImportWalletScreen({
  onBack,
  onImported,
}: {
  onBack: () => void
  onImported: (w: StoredWallet) => void
}) {
  const [input, setInput] = useState('')
  const [showInput, setShowInput] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'phrase' | 'key'>('phrase')

  async function doImport() {
    setError('')
    try {
      let privKey: `0x${string}`
      if (mode === 'phrase') {
        const words = input.trim().split(/\s+/)
        if (words.length !== 12 && words.length !== 24) {
          setError('Seed phrase must be 12 or 24 words')
          return
        }
        if (!bip39.validateMnemonic(input.trim())) {
          setError('Invalid seed phrase — check for typos')
          return
        }
        privKey = deriveFromMnemonic(input.trim())
      } else {
        privKey = deriveFromPrivateKey(input.trim())
      }
      await saveWallet(privKey, 'imported')
      const saved = loadStoredWallet()
      if (saved) onImported(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    }
  }

  return (
    <div className="px-4 py-4 max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-full p-2" style={{ background: 'var(--surface-muted)' }}>
          <ArrowLeft className="size-4" style={{ color: 'var(--ink)' }} />
        </button>
        <h2 className="text-lg font-bold display" style={{ color: 'var(--ink)' }}>Import wallet</h2>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-2xl p-1 gap-1" style={{ background: 'var(--surface-strong)' }}>
        {(['phrase', 'key'] as const).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); setInput(''); setError('') }}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all"
            style={{
              background: mode === m ? 'var(--accent)' : 'transparent',
              color: mode === m ? 'white' : 'var(--muted)',
            }}
          >
            {m === 'phrase' ? 'Seed phrase' : 'Private key'}
          </button>
        ))}
      </div>

      <div className="relative">
        <textarea
          rows={mode === 'phrase' ? 4 : 2}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={mode === 'phrase'
            ? 'Enter your 12 or 24 word seed phrase, separated by spaces…'
            : 'Enter your private key (0x…)'
          }
          className="w-full rounded-2xl px-4 py-3.5 text-sm outline-none resize-none"
          style={{
            background: 'var(--surface-muted)',
            border: error ? '1.5px solid var(--danger)' : '1px solid var(--border)',
            color: 'var(--ink)',
            fontSize: 16,
            filter: showInput ? 'none' : 'blur(4px)',
          }}
        />
        <button
          onClick={() => setShowInput(v => !v)}
          className="absolute top-3 right-3 p-1.5 rounded-lg"
          style={{ background: 'var(--surface-strong)' }}
        >
          {showInput
            ? <EyeOff className="size-4" style={{ color: 'var(--muted)' }} />
            : <Eye    className="size-4" style={{ color: 'var(--muted)' }} />
          }
        </button>
      </div>

      {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}

      <div className="rounded-2xl p-3 flex gap-2" style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)' }}>
        <AlertTriangle className="size-4 shrink-0 text-red-500 mt-0.5" />
        <p className="text-xs text-red-700">Never enter your seed phrase or private key on a website you don't trust. Only import here if you trust Peetopee.</p>
      </div>

      <button
        onClick={() => { void doImport() }}
        disabled={!input.trim()}
        className="w-full rounded-2xl py-4 font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-transform"
        style={{ background: 'linear-gradient(135deg, #1A6FE8 0%, #0ea5e9 100%)' }}
      >
        Import wallet →
      </button>
    </div>
  )
}

export { Trash2 }  // re-export for StandaloneWalletHome usage
