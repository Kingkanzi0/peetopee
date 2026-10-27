type LogoSize = 'sm' | 'md' | 'lg' | 'xl'
type LogoVariant = 'mark' | 'horizontal' | 'stacked'

interface Props {
  size?: LogoSize
  variant?: LogoVariant
  on?: 'light' | 'dark'
  className?: string
}

const DIM: Record<LogoSize, number> = { sm: 32, md: 40, lg: 64, xl: 120 }

// The brand mark: blue rounded square, stylised P with dollar coin + upward arrow
function PeetopeeMark({ px, on }: { px: number; on: 'light' | 'dark' }) {
  const bg = on === 'dark' ? 'rgba(255,255,255,0.12)' : '#1d4ed8'
  return (
    <svg width={px} height={px} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Peetopee" style={{ flexShrink: 0 }}>
      {/* Blue rounded square */}
      <rect width="40" height="40" rx="9" fill={bg} />
      {/* P-shape stem (left vertical) */}
      <rect x="10" y="10" width="3.5" height="20" rx="1.75" fill="white" />
      {/* P-shape bowl top horizontal */}
      <rect x="10" y="10" width="13" height="3.5" rx="1.75" fill="white" />
      {/* P-shape bowl bottom horizontal */}
      <rect x="10" y="19" width="13" height="3.5" rx="1.75" fill="white" />
      {/* P-shape bowl right vertical */}
      <rect x="19.5" y="10" width="3.5" height="13" rx="1.75" fill="white" />
      {/* Dollar coin circle */}
      <circle cx="28" cy="15" r="6.5" fill="#fbbf24" />
      <text x="28" y="19" textAnchor="middle" fill="#92400e" fontSize="7" fontWeight="800" fontFamily="sans-serif">$</text>
      {/* Upward arrow from coin */}
      <path d="M28 9 L28 4 M26 6 L28 4 L30 6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PeetopeeLogoSVG({ size = 'md', variant = 'horizontal', on = 'light', className = '' }: Props) {
  const px = DIM[size]
  const navyInk = on === 'dark' ? '#ffffff' : '#0f2557'
  const blueAccent = '#1d4ed8'
  const wordmarkSize = Math.round(px * 0.40)
  const taglineSize = Math.round(px * 0.22)

  const mark = <PeetopeeMark px={px} on={on} />

  if (variant === 'mark') return <span className={className}>{mark}</span>

  if (variant === 'stacked') {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        <PeetopeeMark px={px} on={on} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: wordmarkSize, lineHeight: 1, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: '-0.02em' }}>
            <span style={{ color: navyInk }}>peeto</span><span style={{ color: blueAccent }}>pee</span>
          </div>
          <div style={{ fontSize: taglineSize, color: on === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(15,37,87,0.45)', marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
            No payment barriers.
          </div>
        </div>
      </div>
    )
  }

  // horizontal (default)
  return (
    <div className={`flex items-center ${className}`} style={{ gap: Math.round(px * 0.28) }}>
      {mark}
      <div>
        <div style={{ fontSize: wordmarkSize, lineHeight: 1.1, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: '-0.02em' }}>
          <span style={{ color: navyInk }}>peeto</span><span style={{ color: blueAccent }}>pee</span>
        </div>
        {size !== 'sm' && (
          <div style={{ fontSize: taglineSize, color: on === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(15,37,87,0.45)', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.2 }}>
            No payment barriers.
          </div>
        )}
      </div>
    </div>
  )
}

export function PeetopeeLogoSplash() {
  return (
    <div className="flex flex-col items-center gap-5">
      <div style={{ filter: 'drop-shadow(0 8px 32px rgba(29,78,216,0.4))' }}>
        <PeetopeeMark px={96} on="light" />
      </div>
      <div className="text-center">
        <div style={{ fontSize: 36, lineHeight: 1, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: '-0.03em' }}>
          <span style={{ color: 'white' }}>peeto</span><span style={{ color: '#60a5fa' }}>pee</span>
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 6, fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.05em' }}>
          Your USDC. Local Money. Anywhere.
        </div>
      </div>
    </div>
  )
}

export const LOGO_SVG_STRING = `<svg width="512" height="512" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="9" fill="#1d4ed8"/><rect x="10" y="10" width="3.5" height="20" rx="1.75" fill="white"/><rect x="10" y="10" width="13" height="3.5" rx="1.75" fill="white"/><rect x="10" y="19" width="13" height="3.5" rx="1.75" fill="white"/><rect x="19.5" y="10" width="3.5" height="13" rx="1.75" fill="white"/><circle cx="28" cy="15" r="6.5" fill="#fbbf24"/><text x="28" y="19" text-anchor="middle" fill="#92400e" font-size="7" font-weight="800">$</text><path d="M28 9 L28 4 M26 6 L28 4 L30 6" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`

export function getLogoDataUrl(): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(LOGO_SVG_STRING)}`
}

export const _textScale = (size: LogoSize) => DIM[size] / 40
