/**
 * useTradeChat — the seller ⇄ trader chat for one trade, kept on the server so
 * both people (and the admin, in a dispute) see the same messages.
 * Polls every 4 seconds while a trade is open and counts unread messages.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiChatList, apiChatSend, ApiError, type ChatMessage } from '../auth/ptpApi'

const READ_KEY = (id: bigint) => `ptp_chat_read_${id.toString()}`
const POLL_MS = 4_000

export function useTradeChat(tradeId: bigint | null, open: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [myRole, setMyRole] = useState<'seller' | 'trader' | null>(null)
  const [error, setError] = useState('')
  const [lastRead, setLastRead] = useState(0)
  const lastId = useRef(0)

  // Reset when switching trades.
  useEffect(() => {
    setMessages([]); setMyRole(null); setError(''); lastId.current = 0
    if (tradeId == null) return
    try { setLastRead(parseInt(localStorage.getItem(READ_KEY(tradeId)) ?? '0', 10) || 0) } catch { setLastRead(0) }
  }, [tradeId])

  useEffect(() => {
    if (tradeId == null) return
    let alive = true
    async function poll() {
      try {
        const res = await apiChatList(tradeId!, lastId.current)
        if (!alive) return
        setMyRole(res.myRole)
        setError('')
        if (res.messages.length) {
          lastId.current = res.messages[res.messages.length - 1].id
          setMessages(prev => [...prev, ...res.messages.filter(m => !prev.some(p => p.id === m.id))])
        }
      } catch (e) {
        // 403: not your trade (e.g. old trade on another account) — stop quietly.
        if (alive) setError(e instanceof ApiError && e.status === 403 ? 'not-party' : 'offline')
      }
    }
    void poll()
    const t = setInterval(() => { void poll() }, POLL_MS)
    return () => { alive = false; clearInterval(t) }
  }, [tradeId])

  // Opening the chat marks everything as read.
  useEffect(() => {
    if (!open || tradeId == null || messages.length === 0) return
    const newest = messages[messages.length - 1].id
    setLastRead(newest)
    try { localStorage.setItem(READ_KEY(tradeId), String(newest)) } catch { /* ignore */ }
  }, [open, messages, tradeId])

  const send = useCallback(async (text: string) => {
    if (tradeId == null) return
    const msg = await apiChatSend(tradeId, text)
    lastId.current = Math.max(lastId.current, msg.id)
    setMessages(prev => prev.some(p => p.id === msg.id) ? prev : [...prev, msg])
  }, [tradeId])

  const unread = myRole ? messages.filter(m => m.role !== myRole && m.id > lastRead).length : 0
  return { messages, myRole, send, unread, error }
}
