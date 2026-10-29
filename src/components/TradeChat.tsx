/**
 * TradeChat — messages between the seller and the trader of one trade.
 * Messages go through the Peetopee server (see useTradeChat), so the other
 * person sees them within seconds, and the admin can read them in a dispute.
 */
import { useState, useEffect, useRef } from 'react'
import { X, Send, Loader2 } from 'lucide-react'
import type { useTradeChat } from '../hooks/useTradeChat'
import { ApiError } from '../auth/ptpApi'

interface Props {
  tradeId: bigint
  chat: ReturnType<typeof useTradeChat>
  onClose: () => void
}

export function TradeChat({ tradeId, chat, onClose }: Props) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const { messages, myRole, error } = chat
  const other = myRole === 'seller' ? 'Trader' : myRole === 'trader' ? 'Seller' : 'Other side'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setSendError('')
    try {
      await chat.send(text)
      setInput('')
    } catch (e) {
      setSendError(e instanceof ApiError ? e.message : "Couldn't send. Check your connection.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed bottom-0 right-0 z-50 flex flex-col rounded-t-2xl sm:bottom-4 sm:right-4 sm:rounded-2xl"
      style={{
        width: '100%',
        maxWidth: 380,
        height: 'min(460px, 75dvh)',
        background: 'var(--nav-bg)',
        backdropFilter: 'blur(40px)',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Trade #{tradeId.toString()} · chat with {other.toLowerCase()}</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {error === 'offline' ? 'Reconnecting…' : 'Kept on Peetopee — the admin can read it if there is a dispute'}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close chat"
          className="flex size-7 items-center justify-center rounded-lg" style={{ background: 'var(--surface-muted)' }}>
          <X className="size-4" style={{ color: 'var(--muted)' }} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {error === 'not-party' && (
          <p className="text-center text-xs py-6" style={{ color: 'var(--danger)' }}>
            Only the seller and trader of this trade can chat here.
          </p>
        )}
        {error !== 'not-party' && messages.length === 0 && (
          <p className="text-center text-xs py-6" style={{ color: 'var(--subtle)' }}>
            Say hello and agree the details here. Never share your PIN, seed phrase or private key.
          </p>
        )}
        {messages.map(m => {
          const mine = m.role === myRole
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[78%] rounded-2xl px-3 py-2 text-sm"
                style={{
                  background: mine ? 'var(--accent)' : 'var(--surface-muted)',
                  color: mine ? 'white' : 'var(--ink)',
                  borderBottomRightRadius: mine ? 4 : undefined,
                  borderBottomLeftRadius: !mine ? 4 : undefined,
                }}
              >
                {!mine && <p className="text-[10px] font-semibold uppercase tracking-wide opacity-60 mb-0.5">{m.role}</p>}
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                <p className="mt-0.5 text-right text-xs opacity-60">
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {sendError && <p className="px-4 text-xs" style={{ color: 'var(--danger)' }}>{sendError}</p>}
      <div className="flex items-center gap-2 px-3 py-3" style={{ borderTop: '1px solid var(--border)' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value.slice(0, 1000))}
          onKeyDown={e => { if (e.key === 'Enter') void send() }}
          placeholder="Type a message…"
          disabled={error === 'not-party'}
          className="flex-1 rounded-xl px-3 py-2 outline-none"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink)', fontSize: 16 }}
        />
        <button
          onClick={() => { void send() }}
          disabled={!input.trim() || sending || error === 'not-party'}
          aria-label="Send"
          className="flex size-9 items-center justify-center rounded-xl text-white transition-all active:scale-[0.95] disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </div>
    </div>
  )
}
