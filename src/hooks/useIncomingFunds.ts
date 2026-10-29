/**
 * useIncomingFunds — tells you when USDC arrives in your Wallet or Funds account.
 *
 * Every 20 seconds it reads your transfer history (Arc explorer, via the server)
 * and notifies you about transfers in that it hasn't seen before: payments from
 * other people, and USDC released to you from escrow. On the very first run it
 * just remembers what's already there, so you don't get a flood of old alerts.
 * If the explorer can't be reached, it falls back to watching the balances.
 */
import { useEffect, useRef } from 'react'
import { loadHistory } from '../history/txHistory'
import { readUsdcBalance } from '../wallet/appWallet'
import { notify } from '../notify/notify'
import { useMoney } from './useMoney'
import type { Address } from 'viem'

const SEEN_KEY = 'ptp_seen_incoming_v1'
const POLL_MS = 20_000
const MAX_SEEN = 500

function loadSeen(): Set<string> | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : null
  } catch { return null }
}
function saveSeen(seen: Set<string>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-MAX_SEEN))) } catch { /* full */ }
}

export function useIncomingFunds(walletAddress?: Address | null, fundsAddress?: Address | null) {
  const money = useMoney()
  const moneyRef = useRef(money)
  moneyRef.current = money

  useEffect(() => {
    if (!walletAddress) return
    let alive = true
    let lastBalances: { wallet: number; funds: number } | null = null
    const ctrl = new AbortController()

    function describe(amount: number) {
      const local = moneyRef.current.local(amount)
      return `${amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC${local ? ` (≈ ${local})` : ''}`
    }

    async function tick() {
      try {
        const { entries, explorerOk } = await loadHistory(walletAddress, fundsAddress, ctrl.signal)
        if (!alive) return
        if (explorerOk) {
          const incoming = entries.filter(e => (e.kind === 'received' || e.kind === 'escrow_release') && e.status === 'confirmed')
          const seen = loadSeen()
          if (!seen) {
            // First run on this device: remember everything, announce nothing.
            saveSeen(new Set(incoming.map(e => e.hash.toLowerCase())))
          } else {
            const fresh = incoming.filter(e => !seen.has(e.hash.toLowerCase())).reverse()
            for (const e of fresh.slice(-5)) {
              const amount = parseFloat(e.amount)
              if (e.kind === 'escrow_release') {
                void notify('USDC released to you', `${describe(amount)} from escrow is in your account.`, `ptp-in-${e.hash}`)
              } else {
                void notify('You received USDC', `${describe(amount)} from ${e.counterparty || 'someone'}.`, `ptp-in-${e.hash}`)
              }
            }
            fresh.forEach(e => seen.add(e.hash.toLowerCase()))
            if (fresh.length) saveSeen(seen)
          }
          lastBalances = null
          return
        }
        // Explorer unreachable: compare balances instead.
        const [w, f] = await Promise.all([
          readUsdcBalance(walletAddress),
          fundsAddress ? readUsdcBalance(fundsAddress) : Promise.resolve(0),
        ])
        if (!alive) return
        if (lastBalances) {
          const gain = (w + f) - (lastBalances.wallet + lastBalances.funds)
          if (gain > 0.000001) void notify('You received USDC', `${describe(Math.round(gain * 1e6) / 1e6)} arrived in your account.`, `ptp-bal-${Date.now()}`)
        }
        lastBalances = { wallet: w, funds: f }
      } catch { /* offline — try again next time */ }
    }

    void tick()
    const t = setInterval(() => { void tick() }, POLL_MS)
    return () => { alive = false; ctrl.abort(); clearInterval(t) }
  }, [walletAddress, fundsAddress])
}
