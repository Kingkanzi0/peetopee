import { useState } from 'react'
import { Search } from 'lucide-react'
import { COUNTRIES, CountryDef } from '../contracts/peetopee'
import { PeetopeeLogoSplash } from './PeetopeeLogoSVG'

interface Props {
  onSelect: (country: CountryDef) => void
}

export function CountryPicker({ onSelect }: Props) {
  const [query, setQuery] = useState('')

  const filtered = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.code.toLowerCase().includes(query.toLowerCase()) ||
    c.currency.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* Hero */}
      <div className="mb-8 text-center">
        <div className="mb-5 flex justify-center">
          <PeetopeeLogoSplash />
        </div>
        <h1 className="display text-2xl font-bold mt-2" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>Where are you?</h1>
        <p className="mt-1.5 text-sm" style={{ color: 'var(--muted)' }}>Find verified local traders who will pay in your currency.</p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2" style={{ color: 'var(--subtle)' }} />
        <input
          type="text"
          placeholder="Search country or currency..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full rounded-2xl py-3.5 pl-10 pr-4 text-sm outline-none transition-all"
          style={{
            background: 'var(--surface-muted)',
            color: 'var(--ink)',
            border: '1px solid var(--border)',
          }}
        />
      </div>

      {/* Country list */}
      <div className="space-y-2">
        {filtered.map(country => (
          <button
            key={country.code}
            onClick={() => onSelect(country)}
            className="w-full rounded-2xl px-4 py-3.5 text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{
              background: 'var(--surface-strong)',
              border: '1px solid var(--border)',
              backdropFilter: 'blur(16px)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={`https://flagcdn.com/w40/${country.code.toLowerCase()}.png`}
                  srcSet={`https://flagcdn.com/w80/${country.code.toLowerCase()}.png 2x`}
                  alt={country.name}
                  width={28}
                  height={21}
                  className="rounded-sm shrink-0 object-cover"
                  style={{ width: 28, height: 21 }}
                />
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{country.name}</div>
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>{country.currency} · {country.currencySymbol}</div>
                </div>
              </div>
              <div className="text-xs font-medium px-2 py-1 rounded-lg" style={{ background: 'var(--surface-muted)', color: 'var(--subtle)' }}>
                {country.code}
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="py-12 text-center" style={{ color: 'var(--muted)' }}>
            <p className="text-sm">No countries found for "{query}"</p>
          </div>
        )}
      </div>
    </div>
  )
}
