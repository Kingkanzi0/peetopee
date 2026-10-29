/** One-time card asking to switch on "You received USDC" alerts (browsers need a tap to ask). */
import { useState } from 'react'
import { Bell, X } from 'lucide-react'
import { notifyStatus, enableNotifications } from '../notify/notify'

const DISMISS_KEY = 'ptp_notify_prompt_dismissed'

export function NotifyPrompt() {
  const [hidden, setHidden] = useState(() => {
    try { return notifyStatus() !== 'off' || localStorage.getItem(DISMISS_KEY) === '1' } catch { return true }
  })
  if (hidden) return null
  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ } setHidden(true) }
  return (
    <div className="rounded-2xl p-3.5 mb-4 flex items-center gap-3" style={{ background: 'rgba(29,78,216,0.07)', border: '1px solid rgba(29,78,216,0.15)' }}>
      <Bell className="size-5 shrink-0" style={{ color: 'var(--accent)' }} />
      <p className="flex-1 text-xs" style={{ color: 'var(--ink)' }}>Get a notification when you receive money.</p>
      <button onClick={() => { void enableNotifications().then(s => { if (s !== 'off') setHidden(true) }) }}
        className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white shrink-0" style={{ background: 'var(--accent)' }}>
        Turn on
      </button>
      <button onClick={dismiss} aria-label="Not now" className="shrink-0"><X className="size-4" style={{ color: 'var(--subtle)' }} /></button>
    </div>
  )
}
