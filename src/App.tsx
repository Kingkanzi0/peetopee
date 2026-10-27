import { useState, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { ShoppingBag, LayoutDashboard, Wallet, Banknote, Send } from 'lucide-react'
import { WalletBar } from './components/WalletBar'
import { TraderList } from './components/TraderList'
import { SellFlow } from './components/SellFlow'
import { TradeStatusScreen } from './components/TradeStatus'
import { TraderDashboard } from './components/TraderDashboard'
import { TradeChat } from './components/TradeChat'
import { WalletTab } from './wallet/WalletTab'
import { SplashScreen } from './components/SplashScreen'
import { OnboardingFlow } from './components/OnboardingFlow'
import { DemoSeedBanner } from './components/DemoSeedBanner'
import { MarketScreen } from './components/MarketScreen'
import { FundsScreen } from './components/FundsScreen'
import { SendScreen } from './components/SendScreen'
import { useAuth } from './auth/AuthContext'
import PinGate from './components/PinGate'
import { ProfileScreen } from './components/ProfileScreen'
import { useTradeNotifications } from './hooks/useTradeNotifications'
import { useWalletLink } from './hooks/useWalletLink'
import type { CountryDef, TraderProfile } from './contracts/peetopee'

type Screen =
  | { id: 'market' }
  | { id: 'traders'; country: CountryDef }
  | { id: 'sell'; country: CountryDef; trader: TraderProfile }
  | { id: 'trade'; tradeId: bigint }

type Tab = 'market' | 'send' | 'funds' | 'wallet' | 'trader'

export default function App() {
  const { address } = useAccount()
  const { profile } = useAuth()

  const [splashDone, setSplashDone] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [tab, setTab] = useState<Tab>('market')
  const [screen, setScreen] = useState<Screen>({ id: 'market' })
  const [openTraderRegister, setOpenTraderRegister] = useState(false)

  useTradeNotifications(address)
  useWalletLink() // auto-links connected wallet address to the user's Peetopee ID

  const [chatOpen, setChatOpen] = useState(false)
  const [chatTradeId, setChatTradeId] = useState<bigint | null>(null)
  const [chatCounterparty, setChatCounterparty] = useState('')

  const onSplashDone = useCallback(() => setSplashDone(true), [])

  function goToTrade(tradeId: bigint, counterparty?: string) {
    setScreen({ id: 'trade', tradeId })
    if (counterparty) {
      setChatTradeId(tradeId)
      setChatCounterparty(counterparty)
    }
    setTab('market')
  }

  if (!splashDone) return <SplashScreen onDone={onSplashDone} />
  if (!profile) return <OnboardingFlow />

  return (
    <PinGate userName={profile.name}>
      <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
        {showProfile && <ProfileScreen onBack={() => setShowProfile(false)} />}
        {!showProfile && <WalletBar onProfileOpen={() => setShowProfile(true)} />}

        <main
          style={{
            paddingBottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))',
            display: showProfile ? 'none' : undefined,
          }}
        >
          {/* MARKET TAB */}
          {tab === 'market' && (
            <>
              {screen.id === 'market' && (
                <>
                  <MarketScreen
                    onStartTrade={(vendor, country) => {
                      // Find the matching onchain trader profile or fall back to demo flow
                      setScreen({ id: 'traders', country })
                    }}
                  />
                  <DemoSeedBanner />
                </>
              )}
              {screen.id === 'traders' && (
                <TraderList
                  country={screen.country}
                  onBack={() => setScreen({ id: 'market' })}
                  onSelectTrader={t => setScreen({ id: 'sell', country: screen.country, trader: t })}
                  onRegisterTrader={() => { setOpenTraderRegister(true); setTab('trader') }}
                />
              )}
              {screen.id === 'sell' && (
                <SellFlow
                  country={screen.country}
                  trader={screen.trader}
                  onBack={() => setScreen({ id: 'traders', country: screen.country })}
                  onTradeCreated={id => goToTrade(id, screen.trader.traderAddr)}
                />
              )}
              {screen.id === 'trade' && (
                <>
                  <TradeStatusScreen
                    tradeId={screen.tradeId}
                    onBack={() => setScreen({ id: 'market' })}
                  />
                  <div className="mx-auto max-w-lg px-4">
                    <button
                      onClick={() => { setChatOpen(true); setChatTradeId(screen.tradeId) }}
                      className="mt-2 w-full rounded-2xl py-3 text-sm font-medium flex items-center justify-center gap-2"
                      style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
                    >
                      Open chat with counterparty
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* SEND TAB */}
          {tab === 'send' && <SendScreen />}

          {/* FUNDS TAB */}
          {tab === 'funds' && <FundsScreen />}

          {/* WALLET TAB */}
          {tab === 'wallet' && <WalletTab onBack={() => setTab('market')} />}

          {/* TRADER TAB */}
          {tab === 'trader' && (
            <TraderDashboard
              onTradeClick={id => goToTrade(id)}
              openRegister={openTraderRegister}
              onRegisterOpened={() => setOpenTraderRegister(false)}
            />
          )}
        </main>

        {/* Bottom nav */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-20 flex items-stretch justify-around px-1"
          style={{
            display: showProfile ? 'none' : undefined,
            background: 'rgba(255,255,255,0.96)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderTop: '1px solid var(--border)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <NavTab active={tab === 'market'} label="Market" icon={<ShoppingBag className="size-5" />} onClick={() => { setTab('market'); setScreen({ id: 'market' }) }} />
          <NavTab active={tab === 'send'} label="Send" icon={<Send className="size-5" />} onClick={() => setTab('send')} />
          <NavTab active={tab === 'funds'} label="Funds" icon={<Banknote className="size-5" />} onClick={() => setTab('funds')} />
          <NavTab active={tab === 'wallet'} label="Wallet" icon={<Wallet className="size-5" />} onClick={() => setTab('wallet')} />
          <NavTab active={tab === 'trader'} label="Trader" icon={<LayoutDashboard className="size-5" />} onClick={() => setTab('trader')} />
        </nav>

        {/* Chat overlay */}
        {chatOpen && chatTradeId !== null && (
          <TradeChat
            tradeId={chatTradeId}
            counterpartyAddress={chatCounterparty || '0x0000000000000000000000000000000000000000'}
            onClose={() => setChatOpen(false)}
          />
        )}
      </div>
    </PinGate>
  )
}

function NavTab({ active, label, icon, onClick }: {
  active: boolean; label: string; icon: React.ReactNode; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[44px] transition-all active:scale-95"
      style={{ color: active ? '#1d4ed8' : 'var(--subtle)' }}
    >
      <div
        className="flex size-8 items-center justify-center rounded-xl transition-all"
        style={{ background: active ? 'rgba(29,78,216,0.1)' : 'transparent' }}
      >
        {icon}
      </div>
      <span className="text-[10px] font-semibold leading-none">{label}</span>
    </button>
  )
}
