/**
 * StandaloneWalletHome — full wallet dashboard.
 * Reads balances via viem publicClient (no wagmi).
 * Sends via viem walletClient using the stored private key.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Send, Download, ArrowLeftRight, Copy, Check,
  TrendingUp, Loader2, X, CheckCircle2, AlertTriangle,
  Trash2, ExternalLink, RefreshCw,
} from 'lucide-react'
import { isAddress, type Address } from 'viem'
import {
  STANDALONE_CHAINS, CHAIN_TOKENS, fetchTokenBalance, sendToken,
  getPrivateKey, loadStoredWallet, type StoredWallet, type TokenBalance, type WalletChainConfig,
} from './standaloneWallet'
import { recordTx, shortAddr } from '../history/txHistory'
import { friendlyTxError } from './appWallet'
import { useTokenPrices } from './useTokenPrices'
import { QRCodeSVG } from 'qrcode.react'

type Sheet = 'send' | 'receive' | 'swap' | null

interface Props {
  wallet: StoredWallet
  onDelete: () => void
  onBack?: () => void
}

export function StandaloneWalletHome({ wallet, onDelete, onBack }: Props) {
  const [sheet, setSheet] = useState<Sheet>(null)
  const [copied, setCopied] = useState(false)
  const [balances, setBalances] = useState<TokenBalance[]>([])
  const [loadingBalances, setLoadingBalances] = useState(true)
  const [expandedChain, setExpandedChain] = useState<number>(5042002)
  const [refreshKey, setRefreshKey] = useState(0)
  const { prices } = useTokenPrices()

  // Fetch all balances (all chains in parallel, so one slow network doesn't hold up the rest)
  const fetchAll = useCallback(async () => {
    setLoadingBalances(true)
    const jobs = STANDALONE_CHAINS.flatMap(chain =>
      (CHAIN_TOKENS[chain.id] ?? []).map(token => fetchTokenBalance(wallet.address, chain.id, token, prices)))
    setBalances(await Promise.all(jobs))
    setLoadingBalances(false)
  }, [wallet.address, prices])

  useEffect(() => {
    const t = setTimeout(() => { void fetchAll() }, 0)
    return () => clearTimeout(t)
  }, [fetchAll, refreshKey])

  // Keep balances fresh so incoming payments show up without a reload.
  useEffect(() => {
    const t = setInterval(() => setRefreshKey(k => k + 1), 15_000)
    return () => clearInterval(t)
  }, [])

  const arcError = balances.some(b => b.chainId === 5042002 && b.error)

  const totalUsd = balances.reduce((sum, b) => sum + b.usdValue, 0)

  function copyAddress() {
    void navigator.clipboard.writeText(wallet.address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const shortAddr = `${wallet.address.slice(0, 8)}...${wallet.address.slice(-6)}`

  if (sheet === 'receive') {
    return (
      <ReceiveSheet
        address={wallet.address}
        onClose={() => setSheet(null)}
      />
    )
  }

  if (sheet === 'send') {
    return (
      <SendSheet
        address={wallet.address}
        chains={STANDALONE_CHAINS}
        onClose={() => setSheet(null)}
        onSent={() => { setSheet(null); setTimeout(() => setRefreshKey(k => k + 1), 3000) }}
      />
    )
  }

  return (
    <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">

      {/* Portfolio hero */}
      <div
        className="rounded-3xl p-5 text-white"
        style={{ background: 'linear-gradient(135deg, #0f2744 0%, #1e3a5f 60%, #1A6FE8 100%)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center justify-center size-7 rounded-full"
                style={{ background: 'rgba(255,255,255,0.15)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 5l-7 7 7 7"/>
                </svg>
              </button>
            )}
            <span className="text-xs opacity-60 font-semibold uppercase tracking-wider">Portfolio</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRefreshKey(k => k + 1)}
              className="flex items-center gap-1 text-xs opacity-60 active:opacity-100 transition-opacity"
            >
              <RefreshCw className={`size-3 ${loadingBalances ? 'animate-spin' : ''}`} />
              {loadingBalances ? 'Loading…' : 'Live'}
            </button>
          </div>
        </div>

        {arcError && (
          <div className="text-xs mb-2 rounded-lg px-2 py-1 inline-block" style={{ background: 'rgba(255,255,255,0.15)' }}>
            Couldn't reach the Arc network — balances may be out of date. Tap Live to retry.
          </div>
        )}
        <div className="text-4xl font-bold tracking-tight mb-1 display">
          {loadingBalances && totalUsd === 0
            ? <span className="opacity-40">$—</span>
            : `$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          }
        </div>
        <div className="text-xs opacity-50 mb-4">
          {wallet.label === 'created' ? 'Created wallet' : 'Imported wallet'} · {STANDALONE_CHAINS.length} chains
        </div>

        <button
          onClick={copyAddress}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-all active:scale-95"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? 'Copied!' : shortAddr}
        </button>
      </div>

      {/* Action row */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { icon: <Send className="size-5" />,             label: 'Send',    action: () => setSheet('send') },
          { icon: <Download className="size-5" />,         label: 'Receive', action: () => setSheet('receive') },
          { icon: <ArrowLeftRight className="size-5" />,   label: 'Swap',    action: () => setSheet('swap') },
          { icon: <ExternalLink className="size-5" />,     label: 'Faucet',
            action: () => window.open(`https://faucet.circle.com/?address=${wallet.address}`, '_blank') },
        ].map(({ icon, label, action }) => (
          <button
            key={label}
            onClick={action}
            className="flex flex-col items-center gap-2 py-4 rounded-2xl transition-all active:scale-95"
            style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}
          >
            <span style={{ color: 'var(--accent)' }}>{icon}</span>
            <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{label}</span>
          </button>
        ))}
      </div>

      {sheet === 'swap' && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ background: 'rgba(0,0,0,0.4)' }}
        >
          <div className="rounded-t-3xl p-6" style={{ background: 'var(--bg)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold display" style={{ color: 'var(--ink)' }}>Swap</h2>
              <button onClick={() => setSheet(null)} className="rounded-full p-1.5" style={{ background: 'var(--surface-muted)' }}>
                <X className="size-5" style={{ color: 'var(--ink)' }} />
              </button>
            </div>
            <div className="rounded-2xl p-4 text-center" style={{ background: 'var(--surface-strong)' }}>
              <TrendingUp className="size-8 mx-auto mb-2" style={{ color: 'var(--muted)' }} />
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>Swap coming soon</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Token swaps via Circle App Kit are being integrated. For now, use the Bridge panel in the Funds tab.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Live prices */}
      <LivePrices />

      {/* Balances by chain */}
      <div>
        <h3 className="text-xs font-semibold mb-2 px-1 uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
          Assets by chain
        </h3>
        <div className="space-y-2">
          {STANDALONE_CHAINS.map(chain => {
            const chainBals = balances.filter(b => b.chainId === chain.id)
            const chainTotal = chainBals.reduce((s, b) => s + b.usdValue, 0)
            const expanded = expandedChain === chain.id
            return (
              <div key={chain.id} className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-black/5"
                  onClick={() => setExpandedChain(expanded ? -1 : chain.id)}
                >
                  <ChainBadge chain={chain} />
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{chain.shortName}</span>
                      <span className="font-semibold text-sm tabular-nums" style={{ color: 'var(--ink)' }}>
                        {loadingBalances ? '…' : `$${chainTotal.toFixed(2)}`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs" style={{ color: 'var(--subtle)' }}>{chain.isTestnet ? 'Testnet' : 'Mainnet'}</span>
                      <svg
                        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ color: 'var(--subtle)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}
                      >
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    {loadingBalances
                      ? <div className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>Loading…</div>
                      : chainBals.length === 0
                        ? <div className="px-4 py-3 text-xs" style={{ color: 'var(--muted)' }}>No tokens</div>
                        : chainBals.map(b => (
                          <TokenBalanceRow key={`${b.chainId}-${b.symbol}`} balance={b} chainColor={chain.color} />
                        ))
                    }
                    <div className="px-4 pb-3">
                      <a
                        href={`${chain.explorerUrl}/address/${wallet.address}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs flex items-center gap-1 mt-1"
                        style={{ color: 'var(--accent)' }}
                      >
                        <ExternalLink className="size-3" />
                        View on explorer
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Faucet card */}
      <div className="rounded-2xl p-4" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
        <p className="text-xs font-semibold text-blue-800 mb-1">Need test USDC?</p>
        <p className="text-xs text-blue-700 mb-3">Get free test USDC for Arc Testnet, Base Sepolia, and other testnets from the Circle faucet.</p>
        <a
          href={`https://faucet.circle.com/?address=${wallet.address}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white"
          style={{ background: '#1A6FE8' }}
        >
          Get test USDC →
        </a>
      </div>

      {/* Delete wallet */}
      <button
        onClick={onDelete}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm"
        style={{ color: 'var(--danger)', background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
      >
        <Trash2 className="size-4" />
        Remove wallet
      </button>
    </div>
  )
}

// ---- Chain badge -----------------------------------------------------------
function ChainBadge({ chain }: { chain: WalletChainConfig }) {
  const icons: Record<number, string> = { 5042002: '⬡', 84532: '🔵', 421614: '🔷', 80002: '🟣' }
  return (
    <div
      className="size-9 rounded-xl flex items-center justify-center text-lg shrink-0"
      style={{ background: `${chain.color}20` }}
    >
      {icons[chain.id] ?? '●'}
    </div>
  )
}

// ---- Token balance row -----------------------------------------------------
function TokenBalanceRow({ balance: b, chainColor }: { balance: TokenBalance; chainColor: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="size-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: chainColor }}>
        {b.symbol.slice(0, 1)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{b.symbol}</span>
          <span className="text-sm font-medium tabular-nums" style={{ color: 'var(--ink)' }}>${b.usdValue.toFixed(2)}</span>
        </div>
        <span className="text-xs" style={{ color: b.error ? 'var(--danger)' : 'var(--subtle)' }}>
          {b.error ? "Couldn't load — tap Live to retry" : `${parseFloat(b.balance).toFixed(b.symbol === 'USDC' ? 2 : 6)} ${b.symbol}`}
        </span>
      </div>
    </div>
  )
}

// ---- Live prices ------------------------------------------------------------
function LivePrices() {
  const { prices, loading } = useTokenPrices()
  const tokens = [
    { symbol: 'USDC',  id: 'usd-coin',      color: '#2775ca' },
    { symbol: 'ETH',   id: 'ethereum',       color: '#627eea' },
    { symbol: 'MATIC', id: 'matic-network',  color: '#8247e5' },
    { symbol: 'ARB',   id: 'arbitrum',       color: '#12aaff' },
    { symbol: 'BTC',   id: 'bitcoin',        color: '#f7931a' },
    { symbol: 'SOL',   id: 'solana',         color: '#9945ff' },
  ]
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>Live prices</span>
        <span className="text-xs" style={{ color: 'var(--subtle)' }}>CoinGecko</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {tokens.map(t => {
          const price = prices[t.id]
          return (
            <div key={t.id} className="flex items-center gap-2">
              <div className="size-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: t.color }}>
                {t.symbol.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{t.symbol}</div>
                <div className="text-xs font-medium tabular-nums" style={{ color: 'var(--accent)' }}>
                  {loading ? '…' : price != null
                    ? `$${price.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: price > 100 ? 2 : 4,
                      })}`
                    : '—'}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---- Receive sheet ----------------------------------------------------------
function ReceiveSheet({ address, onClose }: { address: Address; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const [selectedChain, setSelectedChain] = useState(STANDALONE_CHAINS[0])

  function copy() {
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="rounded-t-3xl p-6 space-y-5" style={{ background: 'var(--bg)', maxHeight: '90dvh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold display" style={{ color: 'var(--ink)' }}>Receive</h2>
          <button onClick={onClose} className="rounded-full p-1.5" style={{ background: 'var(--surface-muted)' }}>
            <X className="size-5" style={{ color: 'var(--ink)' }} />
          </button>
        </div>

        {/* Chain picker */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {STANDALONE_CHAINS.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedChain(c)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0"
              style={{
                background: selectedChain.id === c.id ? 'var(--accent)' : 'var(--surface-strong)',
                color: selectedChain.id === c.id ? 'white' : 'var(--muted)',
              }}
            >
              {c.shortName}
            </button>
          ))}
        </div>

        {/* QR code */}
        <div className="flex justify-center">
          <div className="p-4 rounded-2xl bg-white shadow-sm">
            <QRCodeSVG value={address} size={200} />
          </div>
        </div>

        <div className="text-center">
          <p className="text-xs mb-1" style={{ color: 'var(--subtle)' }}>Your {selectedChain.shortName} address</p>
          <p className="font-mono text-sm break-all px-2" style={{ color: 'var(--ink)' }}>{address}</p>
        </div>

        <button
          onClick={copy}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? 'Copied!' : 'Copy address'}
        </button>

        <p className="text-xs text-center" style={{ color: 'var(--subtle)' }}>
          This address works on all EVM-compatible chains. Always verify the network before sending.
        </p>
      </div>
    </div>
  )
}

// ---- Send sheet -------------------------------------------------------------
function SendSheet({
  address: _from,
  chains,
  onClose,
  onSent,
}: {
  address: Address
  chains: WalletChainConfig[]
  onClose: () => void
  onSent: () => void
}) {
  const [selectedChain, setSelectedChain] = useState(chains[0])
  const tokens = CHAIN_TOKENS[selectedChain.id] ?? []
  const [selectedToken, setSelectedToken] = useState(tokens[0])
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [step, setStep] = useState<'form' | 'sending' | 'done' | 'error'>('form')
  const [txHash, setTxHash] = useState('')
  const [errMsg, setErrMsg] = useState('')

  async function send() {
    if (!isAddress(to)) { setErrMsg('Invalid address'); return }
    if (!amount || parseFloat(amount) <= 0) { setErrMsg('Enter a valid amount'); return }
    const pk = getPrivateKey()
    if (!pk) { setErrMsg('Unlock Peetopee with your PIN to send.'); return }
    setErrMsg('')
    setStep('sending')
    try {
      const hash = await sendToken(pk, selectedChain.id, selectedToken, to, amount)
      setTxHash(hash)
      if (selectedChain.id === 5042002 && selectedToken.symbol === 'USDC') {
        const own = loadStoredWallet()
        const isFunds = own && to.toLowerCase() === own.fundsAddress.toLowerCase()
        recordTx({ hash, chainId: 5042002, kind: isFunds ? 'to_funds' : 'sent', amount, counterparty: isFunds ? 'Funds' : shortAddr(to) })
      }
      setStep('done')
      setTimeout(onSent, 3000)
    } catch (e) {
      setErrMsg(friendlyTxError(e))
      setStep('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="rounded-t-3xl p-6 space-y-4" style={{ background: 'var(--bg)', maxHeight: '90dvh', overflowY: 'auto' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold display" style={{ color: 'var(--ink)' }}>Send</h2>
          <button onClick={onClose} className="rounded-full p-1.5" style={{ background: 'var(--surface-muted)' }}>
            <X className="size-5" style={{ color: 'var(--ink)' }} />
          </button>
        </div>

        {step === 'done' ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="mx-auto size-14" style={{ color: 'var(--success)' }} />
            <p className="font-bold text-lg" style={{ color: 'var(--ink)' }}>Sent!</p>
            <a
              href={`${selectedChain.explorerUrl}/tx/${txHash}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 text-sm"
              style={{ color: 'var(--accent)' }}
            >
              <ExternalLink className="size-3.5" /> View on explorer
            </a>
            <button onClick={onClose} className="w-full rounded-2xl py-3.5 font-semibold text-white mt-4" style={{ background: 'var(--accent)' }}>
              Done
            </button>
          </div>
        ) : step === 'sending' ? (
          <div className="py-8 text-center space-y-3">
            <Loader2 className="mx-auto size-10 animate-spin" style={{ color: 'var(--accent)' }} />
            <p className="font-semibold" style={{ color: 'var(--ink)' }}>Broadcasting transaction…</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Please wait</p>
          </div>
        ) : (
          <>
            {/* Chain selector */}
            <div>
              <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--subtle)' }}>Network</label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {chains.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedChain(c)
                      const t = CHAIN_TOKENS[c.id]?.[0]
                      if (t) setSelectedToken(t)
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0"
                    style={{
                      background: selectedChain.id === c.id ? 'var(--accent)' : 'var(--surface-strong)',
                      color: selectedChain.id === c.id ? 'white' : 'var(--muted)',
                    }}
                  >
                    {c.shortName}
                  </button>
                ))}
              </div>
            </div>

            {/* Token selector */}
            <div>
              <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--subtle)' }}>Token</label>
              <div className="flex gap-2">
                {tokens.map(t => (
                  <button
                    key={t.symbol}
                    onClick={() => setSelectedToken(t)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                    style={{
                      background: selectedToken.symbol === t.symbol ? 'var(--accent)' : 'var(--surface-strong)',
                      color: selectedToken.symbol === t.symbol ? 'white' : 'var(--muted)',
                    }}
                  >
                    {t.symbol}
                  </button>
                ))}
              </div>
            </div>

            {/* To address */}
            <input
              type="text"
              placeholder="Recipient address (0x…)"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="w-full rounded-2xl px-4 py-3.5 outline-none text-sm"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
            />

            {/* Amount */}
            <input
              inputMode="decimal"
              placeholder={`Amount in ${selectedToken.symbol}`}
              value={amount}
              onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              className="w-full rounded-2xl px-4 py-3.5 outline-none"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
            />

            {(errMsg || step === 'error') && (
              <div className="flex gap-2 rounded-xl p-3" style={{ background: '#fef2f2' }}>
                <AlertTriangle className="size-4 shrink-0 text-red-500 mt-0.5" />
                <p className="text-xs text-red-700">{errMsg}</p>
              </div>
            )}

            <button
              onClick={() => void send()}
              disabled={!to || !amount}
              className="w-full rounded-2xl py-4 font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
              style={{ background: 'linear-gradient(135deg, #1A6FE8 0%, #0ea5e9 100%)' }}
            >
              Send {selectedToken.symbol}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
