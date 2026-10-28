import { useState } from 'react'
import { Search, Star, Clock, TrendingUp, ChevronRight, ArrowLeft, Shield, CheckCircle2, Building2, AtSign } from 'lucide-react'
import { COUNTRIES, CountryDef } from '../contracts/peetopee'
import { useAuth } from '../auth/AuthContext'

interface Vendor {
  id: string
  name: string
  avatarInitials: string
  avatarColor: string
  rate: number           // local currency per 1 USDC
  currency: string
  minUsdc: number
  maxUsdc: number
  completedTrades: number
  rating: number         // 1-5
  paymentMethods: string[]
  estMinutes: number
  liquidity: number      // max USDC available right now
  verified: boolean
  online: boolean
}

// Demo vendor data — in production these come from the PeetopeeEscrow contract
const DEMO_VENDORS: Record<string, Vendor[]> = {
  NG: [
    { id: 'v1', name: 'Chukwuemeka FX', avatarInitials: 'CF', avatarColor: '#16a34a', rate: 1620, currency: 'NGN', minUsdc: 10, maxUsdc: 5000, completedTrades: 342, rating: 4.9, paymentMethods: ['Bank Transfer', 'Opay'], estMinutes: 10, liquidity: 3000, verified: true, online: true },
    { id: 'v2', name: 'Lagos Swift FX', avatarInitials: 'LS', avatarColor: '#0052ff', rate: 1615, currency: 'NGN', minUsdc: 50, maxUsdc: 10000, completedTrades: 189, rating: 4.7, paymentMethods: ['Bank Transfer', 'Palmpay'], estMinutes: 15, liquidity: 8000, verified: true, online: true },
    { id: 'v3', name: 'Abuja Exchange', avatarInitials: 'AE', avatarColor: '#7c3aed', rate: 1608, currency: 'NGN', minUsdc: 20, maxUsdc: 2000, completedTrades: 78, rating: 4.5, paymentMethods: ['Bank Transfer'], estMinutes: 20, liquidity: 1500, verified: false, online: false },
  ],
  VN: [
    { id: 'v4', name: 'Saigon FX', avatarInitials: 'SF', avatarColor: '#dc2626', rate: 25340, currency: 'VND', minUsdc: 20, maxUsdc: 3000, completedTrades: 211, rating: 4.8, paymentMethods: ['VietcomBank', 'MoMo'], estMinutes: 12, liquidity: 2500, verified: true, online: true },
    { id: 'v5', name: 'Hanoi Trade', avatarInitials: 'HT', avatarColor: '#0891b2', rate: 25290, currency: 'VND', minUsdc: 50, maxUsdc: 5000, completedTrades: 94, rating: 4.6, paymentMethods: ['VietcomBank', 'ZaloPay'], estMinutes: 18, liquidity: 4000, verified: true, online: true },
  ],
  FR: [
    { id: 'v6', name: 'Paris FX Pro', avatarInitials: 'PF', avatarColor: '#0052ff', rate: 0.92, currency: 'EUR', minUsdc: 50, maxUsdc: 20000, completedTrades: 456, rating: 5.0, paymentMethods: ['SEPA', 'Revolut'], estMinutes: 30, liquidity: 15000, verified: true, online: true },
    { id: 'v7', name: 'Lyon Exchange', avatarInitials: 'LE', avatarColor: '#059669', rate: 0.915, currency: 'EUR', minUsdc: 100, maxUsdc: 5000, completedTrades: 123, rating: 4.7, paymentMethods: ['SEPA'], estMinutes: 45, liquidity: 4000, verified: true, online: false },
  ],
}

function formatRate(rate: number, currency: string): string {
  if (rate >= 1000) return `${rate.toLocaleString()} ${currency}`
  if (rate < 10) return `${rate.toFixed(4)} ${currency}`
  return `${rate.toFixed(2)} ${currency}`
}

interface MarketScreenProps {
  onStartTrade?: (vendor: Vendor, country: CountryDef) => void
  /** Main actions shown at the top of the home screen. */
  onPayBank?: () => void
  onSendById?: () => void
}

export function MarketScreen({ onStartTrade, onPayBank, onSendById }: MarketScreenProps) {
  const { profile } = useAuth()
  const [query, setQuery] = useState('')
  const [selectedCountry, setSelectedCountry] = useState<CountryDef | null>(
    profile?.country ?? null
  )
  const [sortBy, setSortBy] = useState<'rate' | 'rating' | 'speed'>('rate')

  const filteredCountries = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.currency.toLowerCase().includes(query.toLowerCase())
  )

  const vendors = selectedCountry ? (DEMO_VENDORS[selectedCountry.code] ?? []) : []
  const sorted = [...vendors].sort((a, b) => {
    if (sortBy === 'rate') return b.rate - a.rate
    if (sortBy === 'rating') return b.rating - a.rating
    return a.estMinutes - b.estMinutes
  })

  if (selectedCountry) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setSelectedCountry(null)}
            className="flex items-center gap-1.5 text-sm font-medium active:opacity-60"
            style={{ color: 'var(--muted)' }}
          >
            <ArrowLeft className="size-4" /> Back
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <img
              src={`https://flagcdn.com/w40/${selectedCountry.code.toLowerCase()}.png`}
              alt={selectedCountry.name}
              width={22} height={16}
              className="rounded-sm object-cover"
            />
            <span className="font-bold text-base" style={{ color: 'var(--ink)' }}>{selectedCountry.name}</span>
          </div>
        </div>

        {/* Rate banner */}
        <div
          className="rounded-2xl px-4 py-3.5 mb-4 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, #0f2557 0%, #1d4ed8 100%)' }}
        >
          <div>
            <div className="text-xs text-white/60 mb-0.5">Best rate today</div>
            <div className="text-xl font-bold text-white">
              {sorted[0] ? formatRate(sorted[0].rate, selectedCountry.currency) : '—'} / USDC
            </div>
          </div>
          <TrendingUp className="size-8 text-white/30" />
        </div>

        {/* Sort tabs */}
        <div className="flex gap-2 mb-4">
          {(['rate', 'rating', 'speed'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className="flex-1 rounded-xl py-2 text-xs font-semibold transition-all"
              style={{
                background: sortBy === s ? 'var(--accent)' : 'var(--surface-muted)',
                color: sortBy === s ? 'white' : 'var(--muted)',
                border: '1.5px solid transparent',
              }}
            >
              {s === 'rate' ? 'Best rate' : s === 'rating' ? 'Top rated' : 'Fastest'}
            </button>
          ))}
        </div>

        {/* Vendor list */}
        <div className="space-y-3">
          {sorted.map(vendor => (
            <button
              key={vendor.id}
              onClick={() => onStartTrade?.(vendor, selectedCountry)}
              className="w-full rounded-2xl p-4 text-left transition-all active:scale-[0.99]"
              style={{
                background: 'var(--surface-strong)',
                border: '1.5px solid var(--border)',
                opacity: vendor.online ? 1 : 0.65,
              }}
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div
                  className="size-10 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ background: vendor.avatarColor }}
                >
                  {vendor.avatarInitials}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Name row */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{vendor.name}</span>
                    {vendor.verified && <Shield className="size-3.5 text-blue-600" />}
                    <span
                      className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: vendor.online ? 'rgba(22,163,74,0.1)' : 'rgba(107,101,128,0.1)',
                        color: vendor.online ? '#16a34a' : 'var(--muted)',
                      }}
                    >
                      {vendor.online ? 'Online' : 'Offline'}
                    </span>
                  </div>

                  {/* Rate */}
                  <div className="text-base font-bold mb-1.5" style={{ color: 'var(--accent)' }}>
                    {formatRate(vendor.rate, vendor.currency)} <span className="text-xs font-normal" style={{ color: 'var(--muted)' }}>per USDC</span>
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--muted)' }}>
                    <span className="flex items-center gap-1">
                      <Star className="size-3 fill-amber-400 text-amber-400" />
                      {vendor.rating.toFixed(1)}
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="size-3" />
                      {vendor.completedTrades} trades
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      ~{vendor.estMinutes}min
                    </span>
                  </div>

                  {/* Limits */}
                  <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: 'var(--subtle)' }}>
                    <span>Limit: ${vendor.minUsdc}–${vendor.maxUsdc.toLocaleString()} USDC</span>
                    <span>·</span>
                    <span>{vendor.paymentMethods[0]}</span>
                  </div>
                </div>

                <ChevronRight className="size-4 shrink-0 mt-1" style={{ color: 'var(--subtle)' }} />
              </div>
            </button>
          ))}

          {sorted.length === 0 && (
            <div className="text-center py-12" style={{ color: 'var(--muted)' }}>
              <TrendingUp className="size-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No vendors available yet</p>
              <p className="text-sm mt-1">Be the first trader in {selectedCountry.name}.</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Country selection
  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      {(onPayBank || onSendById) && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          {onPayBank && (
            <button onClick={onPayBank}
              className="rounded-2xl p-4 text-left transition-all active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #0f2557 0%, #1d4ed8 100%)' }}>
              <Building2 className="size-6 text-white mb-3" />
              <div className="text-sm font-bold text-white">Send to bank</div>
              <div className="text-xs text-white/70 mt-0.5">USDC in, naira out — OPay, UBA, GTBank…</div>
            </button>
          )}
          {onSendById && (
            <button onClick={onSendById}
              className="rounded-2xl p-4 text-left transition-all active:scale-[0.98]"
              style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}>
              <AtSign className="size-6 mb-3" style={{ color: 'var(--accent)' }} />
              <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Send to a Peetopee ID</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Instant USDC to any @handle</div>
            </button>
          )}
        </div>
      )}

      <div className="mb-5">
        <h1 className="text-xl font-bold mb-0.5" style={{ color: 'var(--ink)', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.02em' }}>
          Or sell USDC in a country
        </h1>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Select a country to see verified vendors and live rates.
        </p>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4" style={{ color: 'var(--subtle)' }} />
        <input
          type="text"
          placeholder="Search country or currency..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full rounded-2xl pl-10 pr-4 py-3 text-sm outline-none"
          style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
        />
      </div>

      <div className="space-y-2">
        {filteredCountries.map(country => {
          const vendors = DEMO_VENDORS[country.code] ?? []
          const bestRate = vendors.length > 0 ? Math.max(...vendors.map(v => v.rate)) : null
          const activeVendors = vendors.filter(v => v.online).length
          return (
            <button
              key={country.code}
              onClick={() => setSelectedCountry(country)}
              className="w-full rounded-2xl px-4 py-3.5 text-left flex items-center gap-3 transition-all active:scale-[0.99]"
              style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}
            >
              <img
                src={`https://flagcdn.com/w40/${country.code.toLowerCase()}.png`}
                srcSet={`https://flagcdn.com/w80/${country.code.toLowerCase()}.png 2x`}
                alt={country.name}
                width={32} height={24}
                className="rounded-sm object-cover shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{country.name}</div>
                <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color: 'var(--muted)' }}>
                  <span>{country.currency} · {country.currencySymbol}</span>
                  {activeVendors > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-green-500 inline-block" />
                      {activeVendors} online
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                {bestRate !== null ? (
                  <>
                    <div className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                      {formatRate(bestRate, country.currency)}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--subtle)' }}>per USDC</div>
                  </>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--subtle)' }}>No vendors</span>
                )}
              </div>
              <ChevronRight className="size-4 shrink-0" style={{ color: 'var(--subtle)' }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
