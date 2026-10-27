/**
 * useTradeNotifications
 *
 * Polls the escrow contract for new incoming orders (for traders) and status
 * changes (for sellers) and fires browser Notification API alerts.
 *
 * Web Push (server-sent background notifications) requires a service worker +
 * a push server. This hook uses the simpler Notification API (only works while
 * the tab is open) as a first step. For full background push, wire up a SW and
 * a push endpoint (e.g. via web-push npm package on the backend).
 */
import { useEffect, useRef } from 'react'
import { useReadContract } from 'wagmi'
import { PEETOPEE_ESCROW, ARC_TESTNET_CHAIN_ID, TradeStatus, Trade } from '../contracts/peetopee'

const NOTIF_KEY = 'ptp_last_notified_trade'

function getLastNotified(): bigint {
  try { return BigInt(localStorage.getItem(NOTIF_KEY) ?? '0') } catch { return 0n }
}
function setLastNotified(id: bigint) {
  localStorage.setItem(NOTIF_KEY, id.toString())
}

async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const res = await Notification.requestPermission()
  return res === 'granted'
}

function notify(title: string, body: string, tag: string) {
  if (Notification.permission !== 'granted') return
  new Notification(title, { body, tag, icon: '/icon-192.svg', badge: '/icon-192.svg' })
}

export function useTradeNotifications(traderAddress?: string) {
  const hasPermission = useRef(false)

  // Ask for permission once on mount
  useEffect(() => {
    requestPermission().then(ok => { hasPermission.current = ok }).catch(() => {})
  }, [])

  // Watch trader's incoming trade IDs
  const { data: rawTradeIds } = useReadContract({
    ...PEETOPEE_ESCROW,
    functionName: 'getTradesByTrader',
    args: traderAddress ? [traderAddress as `0x${string}`] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!traderAddress, refetchInterval: 12_000 },
  })

  useEffect(() => {
    const tradeIds = (rawTradeIds as bigint[] | undefined) ?? []
    if (!hasPermission.current || tradeIds.length === 0) return
    const lastNotified = getLastNotified()
    const newIds = tradeIds.filter(id => id > lastNotified)
    if (newIds.length === 0) return
    const newest = newIds.reduce((a, b) => (b > a ? b : a), 0n)
    setLastNotified(newest)
    notify(
      'New order on Peetopee',
      `You have ${newIds.length} new trade${newIds.length > 1 ? 's' : ''} waiting for your action.`,
      `ptp-new-order-${newest}`,
    )
  }, [rawTradeIds])
}

/** Notify when a trade's status changes (for sellers polling their own trades) */
export function useTradeStatusNotification(tradeId: bigint | null | undefined) {
  const prevStatus = useRef<TradeStatus | undefined>(undefined)

  const { data: rawTrade } = useReadContract({
    ...PEETOPEE_ESCROW,
    functionName: 'getTrade',
    args: tradeId != null ? [tradeId] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: tradeId != null, refetchInterval: 8_000 },
  })

  useEffect(() => {
    if (!rawTrade) return
    const trade = rawTrade as Trade
    const status = trade.status
    if (prevStatus.current === undefined) { prevStatus.current = status; return }
    if (status === prevStatus.current) return
    prevStatus.current = status

    const messages: Partial<Record<TradeStatus, string>> = {
      [TradeStatus.FiatSent]: 'Your trader has marked fiat as sent. Please confirm once you receive it.',
      [TradeStatus.Completed]: `Trade #${tradeId} completed. USDC released.`,
      [TradeStatus.Disputed]: `Trade #${tradeId} is under dispute. An arbiter will review.`,
      [TradeStatus.Cancelled]: `Trade #${tradeId} was cancelled. USDC refunded.`,
      [TradeStatus.Resolved]: `Trade #${tradeId} dispute resolved.`,
    }
    const msg = messages[status]
    if (msg) notify('Peetopee trade update', msg, `ptp-trade-${tradeId}-${status}`)
  }, [rawTrade, tradeId])
}
