/** A token's logo (from CoinGecko), falling back to a coloured circle with its symbol. */
import { useState } from 'react'

const COLORS: Record<string, string> = {
  USDC: '#2775ca', ETH: '#627eea', BTC: '#f7931a', SOL: '#9945ff', ARB: '#12aaff', POL: '#8247e5', MATIC: '#8247e5',
}

export function TokenIcon({ symbol, image, size = 32 }: { symbol: string; image?: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (image && !broken) {
    return (
      <img src={image} alt={symbol} width={size} height={size} loading="lazy" referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="rounded-full shrink-0 bg-white" style={{ width: size, height: size }} />
    )
  }
  return (
    <div className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, background: COLORS[symbol.toUpperCase()] ?? '#64748b', fontSize: size * (symbol.length > 3 ? 0.26 : 0.32) }}>
      {symbol.toUpperCase().slice(0, 4)}
    </div>
  )
}

export function formatUsdPrice(price: number) {
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: price >= 100 ? 2 : price >= 1 ? 2 : 4 })}`
}
