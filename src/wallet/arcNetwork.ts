/**
 * arcNetwork — how the app talks to Arc Testnet.
 *
 * Goes through the Peetopee server's /api/rpc relay first, then Arc's official
 * public RPC endpoints, with automatic fallback, so one slow or blocked endpoint
 * doesn't make balances look like 0. Set VITE_ARC_RPC_URL to
 * put your own endpoint (e.g. a private RPC key) first in the list.
 */
import { fallback, http, type Transport } from 'viem'

const CUSTOM = (import.meta.env.VITE_ARC_RPC_URL as string | undefined)?.trim()

/**
 * The Peetopee server's relay comes first: browser blockers (e.g. Brave Shields)
 * often block public RPC hosts but never the app's own server. The public
 * endpoints follow as a backup.
 */
const RELAY = typeof window !== 'undefined' ? new URL('/api/rpc', window.location.origin).href : null

export const ARC_RPC_URLS = [
  ...(CUSTOM ? [CUSTOM] : []),
  ...(RELAY ? [RELAY] : []),
  'https://rpc.testnet.arc.io',
  'https://rpc.blockdaemon.testnet.arc.io',
  'https://rpc.drpc.testnet.arc.io',
  'https://rpc.quicknode.testnet.arc.io',
]

/** Tries each endpoint in order; moves on after an error or a 10s timeout. */
export function arcTransport(): Transport {
  return fallback(ARC_RPC_URLS.map(url => http(url, { timeout: 10_000, retryCount: 1 })))
}
