/**
 * SendUsdcByPtpId — send USDC to another Peetopee user by @handle or email.
 * Uses the standalone wallet (private key in localStorage) — no external
 * wallet app or WalletConnect needed.
 */
import { useState } from 'react'
import { createPublicClient, createWalletClient, http, erc20Abi, parseUnits, formatUnits, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet, baseSepolia, arbitrumSepolia } from 'viem/chains'
import {
  Search, CheckCircle2, AlertCircle, ArrowLeft, ChevronRight,
  Wallet, Layers, ExternalLink, Loader2,
} from 'lucide-react'
import { apiLookup, type PtpApiUser } from '../auth/ptpApi'
import { loadStoredWallet, getPrivateKey } from '../wallet/standaloneWallet'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { toast } from 'sonner'

// Supported chains for this feature
const SEND_CHAINS = [
  { id: 5042002, name: 'Arc Testnet',      shortName: 'Arc',      viemChain: arcTestnet,       usdcAddress: '0x3600000000000000000000000000000000000000' as Address, decimals: 6,  explorerBase: 'https://explorer.testnet.arc.io' },
  { id: 84532,   name: 'Base Sepolia',     shortName: 'Base',     viemChain: baseSepolia,      usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address, decimals: 6,  explorerBase: 'https://sepolia.basescan.org' },
  { id: 421614,  name: 'Arbitrum Sepolia', shortName: 'Arbitrum', viemChain: arbitrumSepolia,  usdcAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d' as Address, decimals: 6,  explorerBase: 'https://sepolia.arbiscan.io' },
]

interface Props { onBack: () => void }
type Step = 'lookup' | 'amount' | 'confirm' | 'success'

export function SendUsdcByPtpId({ onBack }: Props) {
  const senderWallet = loadStoredWallet()
  const [step, setStep]             = useState<Step>('lookup')
  const [identifier, setIdentifier] = useState('')
  const [recipient, setRecipient]   = useState<PtpApiUser | null>(null)
  const [lookingUp, setLookingUp]   = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [selectedChainId, setSelectedChainId] = useState(5042002)
  const [amount, setAmount]         = useState('')
  const [senderBalance, setSenderBalance] = useState<number | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [sending, setSending]       = useState(false)
  const [txHash, setTxHash]         = useState<string | null>(null)
  const [errMsg, setErrMsg]         = useState('')

  const selectedChain = SEND_CHAINS.find(c => c.id === selectedChainId) ?? SEND_CHAINS[0]
  const amountNum     = parseFloat(amount.replace(/,/g, '')) || 0

  // Chains the recipient has a linked wallet on
  const recipientChains = recipient
    ? SEND_CHAINS.filter(c => recipient.walletAddresses[c.id] != null)
    : []

  const recipientAddress = recipient ? (recipient.walletAddresses[selectedChainId] as Address | undefined) ?? null : null

  // Fetch sender USDC balance when recipient is resolved
  async function fetchBalance(chainId: number) {
    if (!senderWallet) return
    const chain = SEND_CHAINS.find(c => c.id === chainId)
    if (!chain) return
    setLoadingBalance(true)
    try {
      const client = createPublicClient({ chain: chain.viemChain, transport: http() })
      const raw = await client.readContract({
        address: chain.usdcAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [senderWallet.address],
      })
      setSenderBalance(parseFloat(formatUnits(raw, chain.decimals)))
    } catch {
      setSenderBalance(null)
    } finally {
      setLoadingBalance(false)
    }
  }

  async function handleLookup() {
    setLookupError('')
    setRecipient(null)
    const trimmed = identifier.trim()
    if (!trimmed) return
    setLookingUp(true)
    try {
      const found = await apiLookup(trimmed)
      if (!found) {
        setLookupError('No Peetopee user found. Ask them to open Peetopee on their device to register.')
        return
      }
      if (Object.keys(found.walletAddresses).length === 0) {
        setLookupError(`${found.displayName} hasn't linked a wallet yet. Ask them to open the Wallet tab in Peetopee.`)
        return
      }
      setRecipient(found)
      const firstChainId = parseInt(Object.keys(found.walletAddresses)[0])
      setSelectedChainId(firstChainId)
      void fetchBalance(firstChainId)
    } finally {
      setLookingUp(false)
    }
  }

  async function handleSend() {
    if (!recipientAddress || amountNum <= 0) return
    const pk = getPrivateKey()
    if (!pk) { toast.error('No wallet found. Create one in the Wallet tab first.'); return }
    if (senderBalance !== null && amountNum > senderBalance) {
      toast.error('Insufficient USDC balance.')
      return
    }
    setSending(true)
    setErrMsg('')
    try {
      const account = privateKeyToAccount(pk)
      const chain   = SEND_CHAINS.find(c => c.id === selectedChainId)!
      const publicClient = createPublicClient({ chain: chain.viemChain, transport: http() })
      const walletClient = createWalletClient({ account, chain: chain.viemChain, transport: http() })
      const amountRaw = parseUnits(amountNum.toFixed(chain.decimals), chain.decimals)
      const hash = await walletClient.writeContract({
        address: chain.usdcAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [recipientAddress, amountRaw],
      })
      setTxHash(hash)
      await publicClient.waitForTransactionReceipt({ hash })
      setStep('success')
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message.slice(0, 120) : 'Transaction failed')
    } finally {
      setSending(false)
    }
  }

  const explorerUrl = txHash ? buildTxExplorerUrl(selectedChainId, txHash) : null

  // ── Success ──────────────────────────────────────────────────────────────────
  if (step === 'success') return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="size-20 rounded-full flex items-center justify-center mb-5" style={{ background: 'rgba(22,163,74,0.1)' }}>
        <CheckCircle2 className="size-10 text-green-500" />
      </div>
      <h2 className="text-2xl font-black mb-1 display" style={{ color: 'var(--ink)' }}>USDC Sent!</h2>
      <p className="text-base font-semibold mb-1" style={{ color: 'var(--ink)' }}>
        {amountNum.toLocaleString()} USDC → {recipient?.displayName}
      </p>
      <p className="text-sm mb-1" style={{ color: 'var(--muted)' }}>
        via {recipient?.ptpId} on {selectedChain.name}
      </p>
      {explorerUrl && (
        <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm font-semibold mb-6" style={{ color: 'var(--accent)' }}>
          View on explorer <ExternalLink className="size-3.5" />
        </a>
      )}
      <button
        onClick={() => { setStep('lookup'); setIdentifier(''); setRecipient(null); setAmount(''); setTxHash(null) }}
        className="rounded-2xl py-3.5 px-8 text-sm font-bold text-white"
        style={{ background: 'var(--accent)' }}
      >Send again</button>
    </div>
  )

  // ── Confirm ──────────────────────────────────────────────────────────────────
  if (step === 'confirm') return (
    <div className="max-w-md mx-auto px-4 py-4">
      <button onClick={() => setStep('amount')} className="flex items-center gap-1.5 text-sm mb-6" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="size-4" /> Back
      </button>
      <h2 className="text-xl font-bold mb-5 display" style={{ color: 'var(--ink)' }}>Confirm transfer</h2>
      <div className="rounded-2xl p-5 mb-4 space-y-3.5" style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}>
        <div className="flex items-center gap-3 pb-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="size-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ background: 'linear-gradient(135deg, #122d45, #6c3fc5)' }}>
            {recipient?.displayName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-sm" style={{ color: 'var(--ink)' }}>{recipient?.displayName}</div>
            <div className="text-xs font-mono" style={{ color: 'var(--muted)' }}>{recipient?.ptpId}</div>
          </div>
        </div>
        <Row label="Chain"   value={selectedChain.name} />
        <Row label="Token"   value="USDC" />
        <Row label="Amount"  value={`${amountNum.toLocaleString()} USDC`} bold />
        <Row label="Network fee" value="~$0.001 (Arc gas)" />
        <div className="pt-2.5" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>Recipient wallet</p>
          <p className="text-xs font-mono mt-0.5 break-all" style={{ color: 'var(--muted)' }}>{recipientAddress}</p>
        </div>
        <div className="pt-1" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>Sending from</p>
          <p className="text-xs font-mono mt-0.5 break-all" style={{ color: 'var(--muted)' }}>{senderWallet?.address}</p>
        </div>
      </div>
      {errMsg && <p className="text-xs text-center mb-3" style={{ color: 'var(--danger)' }}>{errMsg}</p>}
      <button
        onClick={() => void handleSend()}
        disabled={sending}
        className="w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-[0.98]"
        style={{ background: 'var(--accent)' }}
      >
        {sending
          ? <><Loader2 className="size-4 animate-spin" /> Sending…</>
          : <>Send {amountNum} USDC <ChevronRight className="size-4" /></>
        }
      </button>
    </div>
  )

  // ── Amount ───────────────────────────────────────────────────────────────────
  if (step === 'amount') return (
    <div className="max-w-md mx-auto px-4 py-4">
      <button onClick={() => setStep('lookup')} className="flex items-center gap-1.5 text-sm mb-5" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="size-4" /> Back
      </button>
      <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3 mb-5"
        style={{ background: 'rgba(22,163,74,0.07)', border: '1px solid rgba(22,163,74,0.2)' }}>
        <CheckCircle2 className="size-5 text-green-500 shrink-0" />
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{recipient?.displayName}</p>
          <p className="text-xs font-mono" style={{ color: 'var(--muted)' }}>{recipient?.ptpId}</p>
        </div>
      </div>

      {/* Chain selector */}
      <div className="mb-4">
        <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--subtle)' }}>CHAIN</label>
        <div className="grid grid-cols-2 gap-2">
          {recipientChains.map(c => (
            <button key={c.id}
              onClick={() => { setSelectedChainId(c.id); void fetchBalance(c.id) }}
              className="rounded-2xl px-3 py-3 text-left transition-all active:scale-[0.97]"
              style={{
                background: selectedChainId === c.id ? 'var(--accent)' : 'var(--surface-muted)',
                border: `1.5px solid ${selectedChainId === c.id ? 'var(--accent)' : 'var(--border)'}`,
              }}>
              <div className="flex items-center gap-2">
                <Layers className="size-3.5" style={{ color: selectedChainId === c.id ? 'white' : 'var(--subtle)' }} />
                <span className="text-xs font-semibold" style={{ color: selectedChainId === c.id ? 'white' : 'var(--ink)' }}>
                  {c.shortName}
                </span>
              </div>
              <p className="text-xs mt-1 font-mono" style={{ color: selectedChainId === c.id ? 'rgba(255,255,255,0.6)' : 'var(--subtle)' }}>
                {((recipient!.walletAddresses[c.id]) as string | undefined)?.slice(0, 6)}…
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Token row */}
      <div className="mb-4 rounded-2xl px-4 py-3.5 flex items-center justify-between"
        style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)' }}>
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: '#2775ca' }}>$</div>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>USDC</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>USD Coin</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>Your balance</p>
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
            {loadingBalance ? '…' : senderBalance !== null ? `${senderBalance.toFixed(2)} USDC` : '—'}
          </p>
        </div>
      </div>

      {/* Amount input */}
      <div className="mb-6">
        <div className="flex justify-between mb-1.5">
          <label className="text-xs font-semibold" style={{ color: 'var(--subtle)' }}>AMOUNT (USDC)</label>
          {senderBalance !== null && (
            <button className="text-xs font-semibold" style={{ color: 'var(--accent)' }}
              onClick={() => setAmount(senderBalance.toFixed(2))}>Max</button>
          )}
        </div>
        <input
          type="text" inputMode="decimal" placeholder="0.00" value={amount}
          onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          className="w-full rounded-2xl px-4 py-4 text-2xl font-black outline-none text-center"
          style={{
            background: 'var(--surface-muted)',
            border: `1.5px solid ${amountNum > (senderBalance ?? Infinity) && amountNum > 0 ? 'var(--danger)' : 'var(--border)'}`,
            color: 'var(--ink)',
            fontSize: 'max(16px, 1.5rem)',
          }}
        />
      </div>

      {!senderWallet && (
        <div className="rounded-2xl px-4 py-3 mb-4 flex items-start gap-2"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <Wallet className="size-4 mt-0.5 shrink-0" style={{ color: '#d97706' }} />
          <p className="text-xs" style={{ color: '#92400e' }}>
            Create a wallet in the Wallet tab first to send USDC.
          </p>
        </div>
      )}

      <button
        onClick={() => setStep('confirm')}
        disabled={!recipientAddress || amountNum <= 0 || !senderWallet || recipientChains.length === 0}
        className="w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 transition-all active:scale-[0.98]"
        style={{ background: 'var(--accent)' }}
      >
        Review transfer <ChevronRight className="size-4" />
      </button>
    </div>
  )

  // ── Lookup ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-md mx-auto px-4 py-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm mb-6" style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="size-4" /> Back
      </button>
      <h2 className="text-xl font-bold mb-1 display" style={{ color: 'var(--ink)' }}>Send USDC by Peetopee ID</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>Enter a @handle or email — no wallet address needed.</p>

      <div className="mb-4">
        <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--subtle)' }}>RECIPIENT</label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="@handle or email"
            value={identifier}
            onChange={e => { setIdentifier(e.target.value); setRecipient(null); setLookupError('') }}
            onKeyDown={e => { if (e.key === 'Enter') void handleLookup() }}
            className="flex-1 rounded-2xl px-4 py-3.5 text-sm outline-none"
            style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)', color: 'var(--ink)', fontSize: 'max(16px, 0.875rem)' }}
          />
          <button onClick={() => { void handleLookup() }} disabled={!identifier.trim() || lookingUp}
            className="rounded-2xl px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-40 active:scale-[0.97]"
            style={{ background: 'var(--accent)' }}>
            {lookingUp ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          </button>
        </div>

        {lookupError && (
          <div className="mt-2 rounded-xl px-3 py-2.5 flex items-start gap-2"
            style={{ background: 'rgba(186,43,76,0.06)', border: '1px solid rgba(186,43,76,0.15)' }}>
            <AlertCircle className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
            <p className="text-xs" style={{ color: 'var(--danger)' }}>{lookupError}</p>
          </div>
        )}

        {recipient && (
          <div className="mt-3 rounded-2xl p-4" style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="size-12 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                style={{ background: 'linear-gradient(135deg, #122d45, #6c3fc5)' }}>
                {recipient.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold" style={{ color: 'var(--ink)' }}>{recipient.displayName}</p>
                <p className="text-xs font-mono truncate" style={{ color: 'var(--muted)' }}>{recipient.ptpId}</p>
              </div>
              <CheckCircle2 className="size-5 text-green-500 shrink-0" />
            </div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--subtle)' }}>WALLET LINKED ON</p>
            {recipientChains.map(c => (
              <div key={c.id} className="flex items-center justify-between py-0.5">
                <span className="text-xs font-medium" style={{ color: 'var(--ink)' }}>{c.shortName}</span>
                <span className="text-xs font-mono" style={{ color: 'var(--subtle)' }}>
                  {((recipient?.walletAddresses[c.id]) as string | undefined)?.slice(0, 6)}…{((recipient?.walletAddresses[c.id]) as string | undefined)?.slice(-4)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Demo hint */}
      <div className="rounded-2xl px-4 py-3 mb-4" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--ink)' }}>Demo accounts you can try</p>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {['@demo_nigeria', '@alex_vn', '@marie_fr', '@kwame_gh', '@priya_in'].map(id => (
            <button key={id}
              onClick={() => { setIdentifier(id); setRecipient(null); setLookupError('') }}
              className="text-xs rounded-lg px-2.5 py-1 font-mono font-semibold transition-all active:scale-95"
              style={{ background: 'var(--accent)', color: 'white' }}>
              {id}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => setStep('amount')}
        disabled={!recipient || recipientChains.length === 0}
        className="w-full rounded-2xl py-4 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 transition-all active:scale-[0.98]"
        style={{ background: 'var(--accent)' }}
      >
        Continue <ChevronRight className="size-4" />
      </button>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span className={bold ? 'font-bold text-base' : 'font-semibold'} style={{ color: 'var(--ink)' }}>{value}</span>
    </div>
  )
}
