import { useState, useCallback, useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { ShoppingBag, LayoutDashboard, Wallet, Banknote, Send, MessageCircle } from 'lucide-react'
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
import { AdminKyc } from './components/AdminKyc'
import { PayBankScreen } from './components/PayBankScreen'
import { useVisitingCountry } from './hooks/useMoney'
import { lockWallet } from './wallet/standaloneWallet'
import { useWalletSession } from './wallet/useWalletSession'
import type { SendStart } from './components/SendScreen'
import { useNairaConfig } from './naira/nairaToken'
import { useIncomingFunds } from './hooks/useIncomingFunds'
import { initNotifications, notify } from './notify/notify'
import { useTradeChat } from './hooks/useTradeChat'
import { useAppWallet } from './wallet/appWallet'

type Screen =
  | { id: 'market' }
  | { id: 'traders'; country: CountryDef }
  | { id: 'sell'; country: CountryDef; trader: TraderProfile }
  | { id: 'trade'; tradeId: bigint }
  | { id: 'paybank' }

type Tab = 'wallet' | 'send' | 'funds' | 'market' | 'trader'

export default function App() {
  const { profile } = useAuth()
  const [splashDone, setSplashDone] = useState(false)
  const [admin, setAdmin] = useState(() => window.location.hash === '#admin')
  const onSplashDone = useCallback(() => setSplashDone(true), [])

  useEffect(() => {
    const onHash = () => setAdmin(window.location.hash === '#admin')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Forget the decrypted wallet key when the user signs out.
  useEffect(() => { if (!profile) lockWallet() }, [profile])

  const exitAdmin = () => { window.location.hash = ''; setAdmin(false) }
  if (admin) {
    // ID review only needs the admin token. Deciding disputes also needs your unlocked wallet.
    return profile
      ? <PinGate userName={profile.name}><AdminWithWallet onExit={exitAdmin} /></PinGate>
      : <AdminKyc onExit={exitAdmin} />
  }
  if (!splashDone) return <SplashScreen onDone={onSplashDone} />
  if (!profile) return <OnboardingFlow />

  return (
    <PinGate userName={profile.name}>
      <MainApp />
    </PinGate>
  )
}

function AdminWithWallet({ onExit }: { onExit: () => void }) {
  useWalletSession()
  return <AdminKyc onExit={onExit} />
}

/** Everything after the PIN/biometric unlock. */
function MainApp() {
  const { address } = useAccount()
  const [visiting] = useVisitingCountry()

  // Unlock the built-in wallet now that the user has passed the PIN gate, and
  // use its Funds account for all Market and Trader actions.
  useWalletSession()

  const [showProfile, setShowProfile] = useState(false)
  const [tab, setTab] = useState<Tab>('wallet')
  const [screen, setScreen] = useState<Screen>({ id: 'market' })
  const [sendStart, setSendStart] = useState<SendStart>('choose')
  const naira = useNairaConfig()
  const openSend = (start: SendStart) => { setSendStart(start); setTab('send') }

  useTradeNotifications(address)
  useWalletLink() // registers the built-in wallet's addresses with your Peetopee ID (automatic)
  const { wallet } = useAppWallet()
  useIncomingFunds(wallet?.address, wallet?.fundsAddress) // "You received USDC" alerts
  useEffect(() => { initNotifications() }, [])

  const [chatOpen, setChatOpen] = useState(false)
  // The chat for the trade on screen: polled while you look at the trade, even with the chat closed.
  const chatTradeId = tab === 'market' && screen.id === 'trade' ? screen.tradeId : null
  const chat = useTradeChat(chatTradeId, chatOpen)
  const seenChat = useRef(-1) // -1 until the first load, so old messages don't pop up
  useEffect(() => {
    // Toast for a new message from the other side while the chat is closed.
    if (seenChat.current < 0) { if (chat.myRole) seenChat.current = chat.messages.length; return }
    if (chatOpen || !chat.myRole || chatTradeId == null) { seenChat.current = chat.messages.length; return }
    const fresh = chat.messages.slice(seenChat.current).filter(m => m.role !== chat.myRole)
    seenChat.current = chat.messages.length
    const last = fresh[fresh.length - 1]
    if (last) void notify(`New message from the ${last.role}`, last.text.slice(0, 120), `ptp-chat-${chatTradeId}-${last.id}`)
  }, [chat.messages, chat.myRole, chatOpen, chatTradeId])
  useEffect(() => { setChatOpen(false); seenChat.current = -1 }, [chatTradeId])

  function goToTrade(tradeId: bigint, _counterparty?: string) {
    setScreen({ id: 'trade', tradeId })
    setTab('market')
  }

  function openTraders(country: CountryDef) {
    setScreen({ id: 'traders', country })
    setTab('market')
  }

  return (
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
                    onPayBank={() => naira.address ? openSend('bank') : setScreen({ id: 'paybank' })}
                    onSendById={() => openSend('usdc')}
                    onPayBills={naira.address ? () => openSend('bills') : undefined}
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
                />
              )}
              {screen.id === 'paybank' && (
                <PayBankScreen
                  initialCountry={visiting}
                  onBack={() => setScreen({ id: 'market' })}
                  onTradeCreated={id => goToTrade(id)}
                  onAddFunds={() => setTab('funds')}
                />
              )}
              {screen.id === 'sell' && (
                <SellFlow
                  country={screen.country}
                  trader={screen.trader}
                  onBack={() => setScreen({ id: 'traders', country: screen.country })}
                  onTradeCreated={id => goToTrade(id, screen.trader.traderAddr)}
                  onAddFunds={() => setTab('funds')}
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
                      onClick={() => setChatOpen(true)}
                      className="mt-2 w-full rounded-2xl py-3 text-sm font-medium flex items-center justify-center gap-2"
                      style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
                    >
                      <MessageCircle className="size-4" />
                      Chat with the {chat.myRole === 'trader' ? 'seller' : 'trader'}
                      {chat.unread > 0 && (
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: 'var(--danger)' }}>{chat.unread}</span>
                      )}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* SEND TAB */}
          {tab === 'send' && (
            <SendScreen
              key={sendStart}
              start={sendStart}
              onPayBank={() => { setScreen({ id: 'paybank' }); setTab('market') }}
            />
          )}

          {/* FUNDS TAB */}
          {tab === 'funds' && <FundsScreen onSell={openTraders} onOpenWallet={() => setTab('wallet')} onOpenNaira={() => openSend('naira')} />}

          {/* WALLET TAB */}
          {tab === 'wallet' && <WalletTab />}

          {/* TRADER TAB */}
          {tab === 'trader' && (
            <TraderDashboard
              onTradeClick={id => goToTrade(id)}
              onOpenWallet={() => setTab('wallet')}
            />
          )}
        </main>

        {/* Bottom nav */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-20 flex items-stretch justify-around px-1"
          style={{
            display: showProfile ? 'none' : undefined,
            background: 'var(--nav-bg)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderTop: '1px solid var(--border)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <NavTab active={tab === 'wallet'} label="Wallet" icon={<Wallet className="size-5" />} onClick={() => setTab('wallet')} />
          <NavTab active={tab === 'send'} label="Send" icon={<Send className="size-5" />} onClick={() => openSend('choose')} />
          <NavTab active={tab === 'funds'} label="Funds" icon={<Banknote className="size-5" />} onClick={() => setTab('funds')} />
          <NavTab active={tab === 'market'} label="Market" icon={<ShoppingBag className="size-5" />} onClick={() => { setTab('market'); setScreen({ id: 'market' }) }} />
          <NavTab active={tab === 'trader'} label="Trader" icon={<LayoutDashboard className="size-5" />} onClick={() => setTab('trader')} />
        </nav>

        {/* Chat overlay */}
        {chatOpen && chatTradeId !== null && (
          <TradeChat tradeId={chatTradeId} chat={chat} onClose={() => setChatOpen(false)} />
        )}
      </div>
  )
}

function NavTab({ active, label, icon, onClick }: {
  active: boolean; label: string; icon: React.ReactNode; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[44px] transition-all active:scale-95"
      style={{ color: active ? 'var(--nav-active)' : 'var(--subtle)' }}
    >
      <div
        className="flex size-8 items-center justify-center rounded-xl transition-all"
        style={{ background: active ? 'var(--nav-active-bg)' : 'transparent' }}
      >
        {icon}
      </div>
      <span className="text-[10px] font-semibold leading-none">{label}</span>
    </button>
  )
}
