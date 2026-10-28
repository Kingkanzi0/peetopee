/**
 * appWallet — React hook + helpers shared by Send, Funds and the wallet link.
 *
 * On Arc, USDC is also the gas token, so a USDC transfer needs a little USDC
 * left over to pay the network fee. `maxSendable` keeps that reserve so "Max"
 * never fails.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  createPublicClient, createWalletClient, http, erc20Abi, parseUnits, formatUnits,
  BaseError, type Address, type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import {
  getFundsPrivateKey, getPrivateKey, isWalletUnlocked, loadStoredWallet, subscribeWallet,
  type StoredWallet,
} from './standaloneWallet'

export const ARC_USDC = '0x3600000000000000000000000000000000000000' as const
export const USDC_DECIMALS = 6
/** Kept back from "Max" to pay Arc network fees (which are paid in USDC). */
export const GAS_RESERVE_USDC = 0.02

const arcClient = createPublicClient({ chain: arcTestnet, transport: http() })

let snapshot: { wallet: StoredWallet | null; unlocked: boolean } = { wallet: loadStoredWallet(), unlocked: isWalletUnlocked() }
function refreshSnapshot() {
  snapshot = { wallet: loadStoredWallet(), unlocked: isWalletUnlocked() }
}
subscribeWallet(refreshSnapshot)

/** The built-in wallet: addresses (or null) and whether it's unlocked. */
export function useAppWallet() {
  return useSyncExternalStore(subscribeWallet, () => snapshot)
}

/** USDC balance on Arc as a number, refreshed every 15s and on demand. */
export function useUsdcBalance(address: Address | string | null | undefined) {
  const [balance, setBalance] = useState<number | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!address) { setBalance(null); return }
    let alive = true
    const load = () => readUsdcBalance(address as Address).then(b => { if (alive) setBalance(b) }).catch(() => {})
    void load()
    const t = setInterval(() => { void load() }, 15_000)
    return () => { alive = false; clearInterval(t) }
  }, [address, tick])
  return { balance, refresh: () => setTick(t => t + 1) }
}

export async function readUsdcBalance(address: Address): Promise<number> {
  const raw = await arcClient.readContract({ address: ARC_USDC, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
  return Number(formatUnits(raw, USDC_DECIMALS))
}

export function maxSendable(balance: number | null) {
  if (balance == null) return 0
  return Math.max(0, Math.floor((balance - GAS_RESERVE_USDC) * 1e6) / 1e6)
}

/** Send USDC on Arc from your Wallet or Funds account. Resolves once the transaction is broadcast. */
export async function sendUsdcOnArc(from: 'wallet' | 'funds', to: Address, amount: string): Promise<Hex> {
  const key = from === 'wallet' ? getPrivateKey() : getFundsPrivateKey()
  if (!key) throw new Error('Unlock Peetopee with your PIN to send.')
  const account = privateKeyToAccount(key)
  const client = createWalletClient({ account, chain: arcTestnet, transport: http() })
  return client.writeContract({
    account,
    chain: arcTestnet,
    address: ARC_USDC,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [to, parseUnits(amount, USDC_DECIMALS)],
  })
}

export async function waitForArcTx(hash: Hex) {
  const receipt = await arcClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('The transaction failed on-chain.')
  return receipt
}

/** Turn a viem/RPC error into a sentence a user can act on. */
export function friendlyTxError(e: unknown): string {
  const text = e instanceof BaseError ? `${e.shortMessage} ${e.details ?? ''}` : e instanceof Error ? e.message : String(e)
  const t = text.toLowerCase()
  if (t.includes('insufficient funds') || t.includes('exceeds balance') || t.includes('transfer amount exceeds')) {
    return `Not enough USDC. Remember to leave about ${GAS_RESERVE_USDC} USDC for the network fee.`
  }
  if (t.includes('user rejected') || t.includes('unlock')) return 'Unlock Peetopee with your PIN and try again.'
  if (t.includes('nonce')) return 'Another transaction is still going through. Wait a few seconds and try again.'
  if (t.includes('fetch') || t.includes('network') || t.includes('timeout')) return "Couldn't reach the Arc network. Check your connection and try again."
  if (t.includes('max fee per gas') || t.includes('underpriced')) return 'Network fees changed. Please try again.'
  return 'The transfer could not be completed. Please try again.'
}
