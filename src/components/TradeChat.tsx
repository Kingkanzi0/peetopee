import { useState, useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { X, Send } from 'lucide-react'

interface Message {
  id: string
  from: string
  text: string
  ts: number
}

interface Props {
  tradeId: bigint
  counterpartyAddress: string
  onClose: () => void
}

const STORAGE_KEY = (tradeId: bigint) => `peetopee_chat_${tradeId.toString()}`

export function TradeChat({ tradeId, counterpartyAddress, onClose }: Props) {
  const { address } = useAccount()
  const [messages, setMessages] = useState<Message[]>(() => {
    const raw = localStorage.getItem(STORAGE_KEY(tradeId))
    if (raw) { try { return JSON.parse(raw) as Message[] } catch {} }
    return []
  })
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function send() {
    if (!input.trim() || !address) return
    const msg: Message = {
      id: Date.now().toString(),
      from: address,
      text: input.trim(),
      ts: Date.now(),
    }
    const next = [...messages, msg]
    setMessages(next)
    localStorage.setItem(STORAGE_KEY(tradeId), JSON.stringify(next))
    setInput('')
  }

  const mine = (from: string) => address && from.toLowerCase() === address.toLowerCase()

  return (
    <div
      className="fixed bottom-0 right-0 z-50 flex flex-col rounded-t-2xl sm:bottom-4 sm:right-4 sm:rounded-2xl"
      style={{
        width: '100%',
        maxWidth: 360,
        height: 400,
        background: 'rgba(255,255,255,0.96)',
        backdropFilter: 'blur(40px)',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Trade #{tradeId.toString()}</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {counterpartyAddress.slice(0, 6)}...{counterpartyAddress.slice(-4)}
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-lg"
          style={{ background: 'var(--surface-muted)' }}
        >
          <X className="size-4" style={{ color: 'var(--muted)' }} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-xs py-6" style={{ color: 'var(--subtle)' }}>
            Messages are stored locally. Only you can see them. Use this to coordinate with your counterparty.
          </p>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex ${mine(m.from) ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-[75%] rounded-2xl px-3 py-2 text-sm"
              style={{
                background: mine(m.from) ? 'var(--accent)' : 'var(--surface-muted)',
                color: mine(m.from) ? 'white' : 'var(--ink)',
                borderBottomRightRadius: mine(m.from) ? 4 : undefined,
                borderBottomLeftRadius: !mine(m.from) ? 4 : undefined,
              }}
            >
              <p>{m.text}</p>
              <p className="mt-0.5 text-right text-xs opacity-60">
                {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-3" style={{ borderTop: '1px solid var(--border)' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Type a message..."
          className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
        />
        <button
          onClick={send}
          disabled={!input.trim()}
          className="flex size-8 items-center justify-center rounded-xl text-white transition-all hover:scale-[1.05] active:scale-[0.95] disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          <Send className="size-4" />
        </button>
      </div>
    </div>
  )
}
