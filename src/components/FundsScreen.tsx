import { useState, useEffect } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Wallet2, TrendingUp } from 'lucide-react'
import { USDC_ADDRESS, ARC_TESTNET_CHAIN_ID } from '../contracts/peetopee'
import { Amount, usdcDecimalsFor } from '../onchain-money'
import { getBalances, getTransactions, type LedgerTx } from '../auth/localLedger'
import { useLocalCurrency } from '../hooks/useLocalCurrency'
import { useAuth } from '../auth/AuthContext'
import { getMyPtpId } from '../auth/peetopeeId'

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: '₦', VND: '₫', EUR: '€', USD: '$', GHS: '₵', KES: 'KSh', GBP: '£',
}

function TxRow({ tx }: { tx: LedgerTx }) {
  const isCredit = tx.amount > 0
  const sym = CURRENCY_SYMBOLS[tx.currency] ?? tx.currency + ' '
  return (
    <div className="flex items-center gap-3 py-3 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
      <div
        className="size-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: isCredit ? 'rgba(22,163,74,0.1)' : 'rgba(186,43,76,0.1)' }}
      >
        {isCredit
          ? <ArrowDownLeft className="size-4 text-green-600" />
          : <ArrowUpRight className="size-4 text-red-600" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{tx.description}</div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
          {new Date(tx.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      <div
        className="text-sm font-bold shrink-0"
        style={{ color: isCredit ? '#16a34a' : 'var(--danger)' }}
      >
        {isCredit ? '+' : ''}{sym}{Math.abs(tx.amount).toLocaleString()}
      </div>
    </div>
  )
}

export function FundsScreen() {
  const { address } = useAccount()
  const { profile } = useAuth()
  const [localBalances, setLocalBalances] = useState(getBalances())
  const [txHistory, setTxHistory] = useState(getTransactions())
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null)
  const ptpId = getMyPtpId()

  const { data: rawUsdc } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 30_000 },
  })

  const usdcFormatted = rawUsdc != null
    ? Amount.fromRaw(rawUsdc, usdcDecimalsFor(ARC_TESTNET_CHAIN_ID)).toFixed(2)
    : null

  const { rate: fxRate } = useLocalCurrency(profile?.country?.currency ?? 'NGN')

  function refresh() {
    setLocalBalances(getBalances())
    setTxHistory(getTransactions())
  }

  // Initialize from localStorage on mount (deferred to avoid setState-in-effect lint)
  useEffect(() => {
    const t = setTimeout(refresh, 0)
    return () => clearTimeout(t)
  }, [])

  const displayTx = selectedCurrency
    ? getTransactions(selectedCurrency)
    : txHistory

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--ink)', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}>Funds</h1>
          {ptpId && <div className="text-xs mt-0.5 font-mono" style={{ color: 'var(--muted)' }}>{ptpId}</div>}
        </div>
        <button onClick={refresh} className="p-2 rounded-xl active:bg-gray-100">
          <RefreshCw className="size-4" style={{ color: 'var(--muted)' }} />
        </button>
      </div>

      {/* USDC balance card */}
      <div
        className="rounded-2xl p-5 mb-4"
        style={{ background: 'linear-gradient(135deg, #0f2557 0%, #1d4ed8 100%)' }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Wallet2 className="size-4 text-white/60" />
          <span className="text-xs text-white/60 font-medium">USDC Balance (Arc Testnet)</span>
        </div>
        <div className="text-3xl font-bold text-white mb-1">
          ${usdcFormatted ?? '—'}
        </div>
        {fxRate && usdcFormatted && (
          <div className="text-sm text-white/60">
            ≈ {profile?.country?.currencySymbol}{(parseFloat(usdcFormatted) * fxRate).toLocaleString(undefined, { maximumFractionDigits: 0 })} {profile?.country?.currency}
          </div>
        )}
        {!address && (
          <div className="text-xs text-white/50 mt-1">Connect wallet to see balance</div>
        )}
      </div>

      {/* Local currency wallets */}
      {localBalances.length > 0 ? (
        <div className="mb-5">
          <div className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
            Local Currency Wallets
          </div>
          <div className="space-y-2">
            {localBalances.map(b => {
              const sym = CURRENCY_SYMBOLS[b.currency] ?? b.currency + ' '
              const isSelected = selectedCurrency === b.currency
              return (
                <button
                  key={b.currency}
                  onClick={() => setSelectedCurrency(isSelected ? null : b.currency)}
                  className="w-full rounded-2xl px-4 py-3.5 flex items-center gap-3 transition-all text-left active:scale-[0.99]"
                  style={{
                    background: isSelected ? 'var(--accent)' : 'var(--surface-strong)',
                    border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  <div
                    className="size-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
                    style={{ background: isSelected ? 'rgba(255,255,255,0.2)' : '#1d4ed8' }}
                  >
                    {sym}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold" style={{ color: isSelected ? 'white' : 'var(--ink)' }}>
                      {b.currency} Wallet
                    </div>
                    <div className="text-xs" style={{ color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--muted)' }}>
                      {b.transactions.length} transaction{b.transactions.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-base" style={{ color: isSelected ? 'white' : 'var(--ink)' }}>
                      {sym}{b.balance.toLocaleString()}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div
          className="rounded-2xl px-4 py-6 mb-5 text-center"
          style={{ background: 'var(--surface-muted)', border: '1.5px dashed var(--border)' }}
        >
          <TrendingUp className="size-8 mx-auto mb-2 opacity-30" style={{ color: 'var(--ink)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>No local currency wallets yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
            Complete a P2P trade in the Market tab to receive local currency here.
          </p>
        </div>
      )}

      {/* Transaction history */}
      {displayTx.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
              {selectedCurrency ? `${selectedCurrency} Transactions` : 'All Transactions'}
            </div>
            {selectedCurrency && (
              <button className="text-xs" style={{ color: 'var(--accent)' }} onClick={() => setSelectedCurrency(null)}>
                View all
              </button>
            )}
          </div>
          <div
            className="rounded-2xl px-4"
            style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}
          >
            {displayTx.slice(0, 20).map(tx => <TxRow key={tx.id} tx={tx} />)}
          </div>
        </div>
      )}
    </div>
  )
}
