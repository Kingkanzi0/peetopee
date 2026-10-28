/**
 * arcNetwork — how the app talks to Arc Testnet.
 *
 * Uses Arc's official public RPC endpoints with automatic fallback, so one slow
 * or blocked endpoint doesn't make balances look like 0. Set VITE_ARC_RPC_URL to
 * put your own endpoint (e.g. a private RPC key) first in the list.
 */
import { fallback, http, type Transport } from 'viem'

const CUSTOM = (import.meta.env.VITE_ARC_RPC_URL as string | undefined)?.trim()

export const ARC_RPC_URLS = [
  ...(CUSTOM ? [CUSTOM] : []),
  'https://rpc.testnet.arc.io',
  'https://rpc.blockdaemon.testnet.arc.io',
  'https://rpc.drpc.testnet.arc.io',
  'https://rpc.quicknode.testnet.arc.io',
]

/** Tries each endpoint in order; moves on after an error or a 10s timeout. */
export function arcTransport(): Transport {
  return fallback(ARC_RPC_URLS.map(url => http(url, { timeout: 10_000, retryCount: 1 })))
}
