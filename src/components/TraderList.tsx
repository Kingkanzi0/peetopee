import { useReadContract } from 'wagmi'
import { Star, ShieldCheck, ArrowLeft, Zap, BadgePlus } from 'lucide-react'
import { PEETOPEE_ESCROW, ARC_TESTNET_CHAIN_ID, CountryDef, TraderProfile, formatRate, traderRating } from '../contracts/peetopee'
import { Amount, usdcDecimalsFor } from '../onchain-money'

interface Props {
  country: CountryDef
  onBack: () => void
  onSelectTrader: (trader: TraderProfile) => void
  onRegisterTrader?: () => void
}

function TraderCard({ address, onSelect }: { address: string; country: CountryDef; onSelect: (t: TraderProfile) => void }) {
  const { data: profile, isLoading } = useReadContract({
    ...PEETOPEE_ESCROW,
    functionName: 'getTraderProfile',
    args: [address as `0x${string}`],
    chainId: ARC_TESTNET_CHAIN_ID,
  })

  if (isLoading) {
    return (
      <div className="rounded-2xl p-4 animate-pulse" style={{ background: 'var(--surface-muted)' }}>
        <div className="h-5 w-32 rounded-lg" style={{ background: 'var(--border)' }} />
      </div>
    )
  }

  const p = profile as TraderProfile | undefined
  if (!p || !p.isActive) return null
  const rating = traderRating(p)
  const minFmt = Amount.fromRaw(p.minOrderUsdc, usdcDecimalsFor(ARC_TESTNET_CHAIN_ID)).toFixed(0)
  const maxFmt = Amount.fromRaw(p.maxOrderUsdc, usdcDecimalsFor(ARC_TESTNET_CHAIN_ID)).toFixed(0)
  const rateFmt = formatRate(p.exchangeRate, p.currencyCode)

  return (
    <button
      onClick={() => onSelect(p)}
      className="w-full rounded-2xl p-4 text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
      style={{
        background: 'var(--surface-strong)',
        border: '1px solid var(--border)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl text-white text-sm font-bold" style={{ background: 'var(--accent)' }}>
            {address.slice(2, 4).toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {address.slice(0, 6)}...{address.slice(-4)}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <ShieldCheck className="size-3" style={{ color: 'var(--success)' }} />
              <span className="text-xs" style={{ color: 'var(--success)' }}>Verified</span>
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="display text-base font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
            {rateFmt}
          </div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>per USDC</div>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          {[1,2,3,4,5].map(s => (
            <Star
              key={s}
              className="size-3"
              fill={rating >= s ? 'var(--accent)' : 'none'}
              stroke="var(--accent)"
            />
          ))}
          <span className="ml-1 text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
            {rating > 0 ? rating.toFixed(1) : 'New'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Zap className="size-3" style={{ color: 'var(--muted)' }} />
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            {p.completedTrades.toString()} trades
          </span>
        </div>
      </div>

      {/* Limits */}
      <div className="mt-2.5 flex items-center justify-between rounded-xl px-3 py-2" style={{ background: 'var(--surface-muted)' }}>
        <span className="text-xs" style={{ color: 'var(--subtle)' }}>Limits</span>
        <span className="mono text-xs tabular-nums font-medium" style={{ color: 'var(--ink-2)' }}>
          ${minFmt} – ${maxFmt} USDC
        </span>
      </div>

      {/* Payment methods */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {p.paymentMethods.split(',').map(m => (
          <span key={m.trim()} className="rounded-lg px-2 py-0.5 text-xs" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
            {m.trim()}
          </span>
        ))}
      </div>
    </button>
  )
}

export function TraderList({ country, onBack, onSelectTrader, onRegisterTrader }: Props) {
  const { data: traders, isLoading } = useReadContract({
    ...PEETOPEE_ESCROW,
    functionName: 'getTradersByCountry',
    args: [country.code],
    chainId: ARC_TESTNET_CHAIN_ID,
  })

  const traderAddresses = (traders as string[] | undefined) ?? []

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      {/* Back + header */}
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1.5 text-sm"
        style={{ color: 'var(--muted)' }}
      >
        <ArrowLeft className="size-4" />
        Change country
      </button>

      <div className="mb-4 flex items-center gap-2">
        <span className="text-2xl">{country.flag}</span>
        <div>
          <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>{country.name}</h2>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Local traders accepting USDC for {country.currency}</p>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: 'var(--surface-muted)' }} />
          ))}
        </div>
      )}

      {!isLoading && traderAddresses.length === 0 && (
        <div className="py-12 text-center rounded-2xl space-y-4" style={{ background: 'var(--surface-muted)' }}>
          <div className="flex justify-center">
            <div className="flex size-14 items-center justify-center rounded-2xl" style={{ background: 'var(--surface-strong)' }}>
              <BadgePlus className="size-7" style={{ color: 'var(--accent)' }} />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              No active traders in {country.name} yet.
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              Be the first to offer {country.currency} here and start earning.
            </p>
          </div>
          <button
            onClick={onRegisterTrader}
            className="inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold text-white transition-all active:scale-95"
            style={{ background: 'var(--accent)' }}
          >
            <BadgePlus className="size-4" />
            Register as a trader
          </button>
        </div>
      )}

      <div className="space-y-3">
        {traderAddresses.map(addr => (
          <TraderCard key={addr} address={addr} country={country} onSelect={onSelectTrader} />
        ))}
      </div>

      {/* Always show register CTA at bottom when there are existing traders too */}
      {!isLoading && traderAddresses.length > 0 && (
        <button
          onClick={onRegisterTrader}
          className="mt-4 w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-medium transition-all active:scale-95"
          style={{ background: 'var(--surface-muted)', color: 'var(--accent)' }}
        >
          <BadgePlus className="size-4" />
          Become a trader in {country.name}
        </button>
      )}
    </div>
  )
}
