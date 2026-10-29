import { PeetopeeLogoSVG } from './PeetopeeLogoSVG'
import { useAuth } from '../auth/AuthContext'
import { useAppWallet, useUsdcBalance } from '../wallet/appWallet'
import { useMoney } from '../hooks/useMoney'
import { useTheme } from '../theme/theme'
import { Sun, Moon } from 'lucide-react'

function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

interface WalletBarProps {
  onProfileOpen?: () => void
}

export function WalletBar({ onProfileOpen }: WalletBarProps) {
  const { profile } = useAuth()
  const { wallet } = useAppWallet()
  const address = wallet?.address ?? null
  // Wallet + Funds, refreshed every 15 seconds.
  const main = useUsdcBalance(wallet?.address)
  const funds = useUsdcBalance(wallet && wallet.fundsAddress !== wallet.address ? wallet.fundsAddress : null)
  const total = main.balance == null ? null : main.balance + (funds.balance ?? 0)
  const money = useMoney()
  const { theme, toggle: toggleTheme } = useTheme()

  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null

  return (
    <header
      className="sticky top-0 z-30 w-full"
      style={{
        background: 'var(--nav-bg)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div className="flex items-center justify-between px-4 py-2.5" style={{ maxWidth: 512, margin: '0 auto' }}>
        {/* Logo */}
        <div className="shrink-0 mr-2">
          <PeetopeeLogoSVG size="sm" variant="horizontal" on={theme} />
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 min-w-0">
          {/* Balance pill — tap to switch between local currency and USDC */}
          {total != null && (
            <button
              onClick={money.toggle}
              title={money.hasLocal ? `Show in ${money.showLocal ? 'USDC' : money.country?.currency}` : undefined}
              className="flex items-center gap-1 rounded-xl px-2.5 py-1 shrink-0 active:scale-95 transition-all"
              style={{ background: 'var(--surface-muted)' }}
            >
              <div className="size-1.5 rounded-full shrink-0" style={{ background: 'var(--success)' }} />
              <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)', fontSize: 11 }}>
                {money.primary(total)}
              </span>
            </button>
          )}

          {/* Address chip (when no profile) */}
          {shortAddr && !profile && (
            <div
              className="rounded-xl px-2.5 py-1 shrink-0"
              style={{ background: 'var(--surface-muted)' }}
            >
              <span className="font-mono text-xs" style={{ color: 'var(--ink)' }}>{shortAddr}</span>
            </div>
          )}

          {/* Light / dark mode */}
          <button onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="size-8 rounded-xl flex items-center justify-center shrink-0 active:scale-95 transition-all"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}>
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>

          {/* Profile avatar */}
          {profile && onProfileOpen && (
            <button
              onClick={onProfileOpen}
              className="shrink-0 rounded-full overflow-hidden flex items-center justify-center active:scale-95 transition-all"
              style={{ width: 34, height: 34, background: 'linear-gradient(135deg, #122d45 0%, #6c3fc5 100%)' }}
              aria-label="Open profile"
            >
              {profile.avatarDataUrl ? (
                <img src={profile.avatarDataUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white font-bold text-xs select-none">
                  {getInitials(profile.name)}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
