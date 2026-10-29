/**
 * Naira account — a naira balance (tNGN, the PeetopeeNaira contract) held in the
 * user's own Wallet account. Send it to any @handle, pay any Nigerian bank, or
 * pay bills (airtime, data, electricity, TV) without going through a trader.
 *
 * TESTNET: tNGN stands in for a licensed naira stablecoin (such as cNGN), and bank
 * and bill payouts are simulated by the server. See contracts/PeetopeeNaira.sol.
 *
 * The contract address comes from the server (/config), so it can be switched on
 * from the admin page without rebuilding the app.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  createPublicClient, createWalletClient, erc20Abi, parseEventLogs, formatUnits, parseUnits, keccak256, stringToHex,
  type Address, type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import nairaArtifact from '../../contracts/contract-metadata/PeetopeeNaira.json'
import { arcTransport } from '../wallet/arcNetwork'
import { getFundsPrivateKey, getPrivateKey } from '../wallet/standaloneWallet'
import { ARC_USDC } from '../wallet/appWallet'
import { apiConfig, type PayoutKind, type ServerConfig } from '../auth/ptpApi'

export const NAIRA_ABI = nairaArtifact.abi
export const NAIRA_BYTECODE = nairaArtifact.bytecode as Hex
export const NAIRA_DECIMALS = 6
export const PAYOUT_KIND_IDS: Record<PayoutKind, number> = { bank: 0, airtime: 1, data: 2, electricity: 3, tv: 4 }

const client = createPublicClient({ chain: arcTestnet, transport: arcTransport() })

// ── server config (which contract, payout mode) ─────────────────────────────

let config: ServerConfig | null = null
let configLoading: Promise<void> | null = null
const configListeners = new Set<() => void>()

export function reloadNairaConfig() {
  configLoading = apiConfig()
    .then(c => { config = { nairaAddress: c.nairaAddress, payoutMode: c.payoutMode } })
    .catch(() => { config = config ?? { nairaAddress: null, payoutMode: 'manual' } })
    .finally(() => { configLoading = null; configListeners.forEach(fn => fn()) })
  return configLoading
}

/** { nairaAddress, payoutMode } from the server; `ready` is false until it has loaded once. */
/**
 * COMING SOON switch. While false, the app shows the naira account and Pay bills as
 * "Coming soon" and "Send to bank" uses verified P2P traders (the launch flow).
 * Set to true once a licensed naira stablecoin / payout partner is in place.
 * The admin page can still deploy and test it (useNairaConfig({ evenIfComingSoon: true })).
 */
export const NAIRA_ACCOUNT_LIVE = false

export function useNairaConfig(opts: { evenIfComingSoon?: boolean } = {}) {
  const live = NAIRA_ACCOUNT_LIVE || !!opts.evenIfComingSoon
  const snap = useSyncExternalStore(
    fn => { configListeners.add(fn); return () => { configListeners.delete(fn) } },
    () => config,
  )
  useEffect(() => { if (!config && !configLoading) void reloadNairaConfig() }, [])
  return {
    ready: snap !== null,
    address: (live ? snap?.nairaAddress ?? null : null) as Address | null,
    simulated: snap?.payoutMode === 'simulate',
  }
}

// ── formatting ──────────────────────────────────────────────────────────────

export function toNairaUnits(naira: number | string): bigint {
  return parseUnits(typeof naira === 'number' ? naira.toFixed(2) : naira, NAIRA_DECIMALS)
}

export function nairaNumber(units: bigint | string): number {
  return Number(formatUnits(BigInt(units), NAIRA_DECIMALS))
}

export function formatNaira(units: bigint | string | number, opts: { decimals?: boolean } = {}) {
  const n = typeof units === 'number' ? units : nairaNumber(units)
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: opts.decimals ? 2 : 0, maximumFractionDigits: 2 })}`
}

// ── reads ───────────────────────────────────────────────────────────────────

export async function readNairaBalance(contract: Address, owner: Address): Promise<bigint> {
  return client.readContract({ address: contract, abi: NAIRA_ABI, functionName: 'balanceOf', args: [owner] }) as Promise<bigint>
}

export interface NairaInfo {
  rate: bigint          // naira per USDC, scaled 1e6
  spreadBps: bigint
  faucetAmount: bigint
  admin: Address
  reserve: bigint       // USDC held by the contract
}

export async function readNairaInfo(contract: Address): Promise<NairaInfo> {
  const read = (functionName: string) => client.readContract({ address: contract, abi: NAIRA_ABI, functionName })
  const [rate, spreadBps, faucetAmount, admin, reserve] = await Promise.all([
    read('rate'), read('spreadBps'), read('faucetAmount'), read('admin'),
    client.readContract({ address: ARC_USDC, abi: erc20Abi, functionName: 'balanceOf', args: [contract] }),
  ])
  return { rate: rate as bigint, spreadBps: spreadBps as bigint, faucetAmount: faucetAmount as bigint, admin: admin as Address, reserve }
}

export async function readFaucetNextAt(contract: Address, owner: Address): Promise<number> {
  const last = await client.readContract({ address: contract, abi: NAIRA_ABI, functionName: 'lastFaucetAt', args: [owner] }) as bigint
  return last === 0n ? 0 : (Number(last) + 86_400) * 1000
}

/** Same maths as the contract's quoteBuy / quoteSell. */
export function quoteBuy(info: Pick<NairaInfo, 'rate' | 'spreadBps'>, usdcUnits: bigint) {
  return (usdcUnits * info.rate * (10_000n - info.spreadBps)) / (1_000_000n * 10_000n)
}
export function quoteSell(info: Pick<NairaInfo, 'rate' | 'spreadBps'>, nairaUnits: bigint) {
  return (nairaUnits * 1_000_000n * 10_000n) / (info.rate * (10_000n + info.spreadBps))
}

/** Naira balance of an address, refreshed every 15s and on demand. */
export function useNairaBalance(owner: Address | null | undefined) {
  const { address: contract } = useNairaConfig()
  const [balance, setBalance] = useState<bigint | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!contract || !owner) { setBalance(null); return }
    let alive = true
    const load = () => readNairaBalance(contract, owner).then(b => { if (alive) setBalance(b) }).catch(() => {})
    void load()
    const t = setInterval(() => { void load() }, 15_000)
    return () => { alive = false; clearInterval(t) }
  }, [contract, owner, tick])
  return { balance, refresh: () => setTick(t => t + 1) }
}

// ── writes (sign with the Wallet account) ───────────────────────────────────

function signer(from: 'wallet' | 'funds' = 'wallet') {
  const key = from === 'wallet' ? getPrivateKey() : getFundsPrivateKey()
  if (!key) throw new Error('Unlock Peetopee with your PIN to continue.')
  const account = privateKeyToAccount(key)
  return { account, wallet: createWalletClient({ account, chain: arcTestnet, transport: arcTransport() }) }
}

async function write(contract: Address, functionName: string, args: unknown[], from: 'wallet' | 'funds' = 'wallet') {
  const { account, wallet } = signer(from)
  const hash = await wallet.writeContract({ account, chain: arcTestnet, address: contract, abi: NAIRA_ABI, functionName, args })
  const receipt = await client.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('The transaction failed on-chain.')
  return { hash, receipt }
}

/** USDC → naira. Approves the contract first if needed. */
export async function buyNaira(contract: Address, usdcUnits: bigint) {
  const { account, wallet } = signer()
  const allowance = await client.readContract({ address: ARC_USDC, abi: erc20Abi, functionName: 'allowance', args: [account.address, contract] })
  if (allowance < usdcUnits) {
    const hash = await wallet.writeContract({ account, chain: arcTestnet, address: ARC_USDC, abi: erc20Abi, functionName: 'approve', args: [contract, usdcUnits] })
    await client.waitForTransactionReceipt({ hash })
  }
  return write(contract, 'buyWithUsdc', [usdcUnits])
}

/** Naira → USDC from the reserve. */
export function sellNaira(contract: Address, nairaUnits: bigint) {
  return write(contract, 'sellForUsdc', [nairaUnits])
}

/** Send naira to another Peetopee user's wallet. */
export function sendNaira(contract: Address, to: Address, nairaUnits: bigint) {
  return write(contract, 'transfer', [to, nairaUnits])
}

/** TESTNET: claim free test naira (once a day). */
export function claimNairaFaucet(contract: Address) {
  return write(contract, 'faucet', [])
}

/** The text whose keccak256 goes on-chain; the server checks it matches. Keep key order stable. */
export function payoutDetailsText(details: { kind: PayoutKind } & Record<string, string>) {
  return JSON.stringify(details)
}

/** Burn naira for a bank/bill payout. Returns the payout id from the PayoutRequested event. */
export async function requestPayout(contract: Address, kind: PayoutKind, nairaUnits: bigint, detailsText: string) {
  const ref = keccak256(stringToHex(detailsText))
  const { hash, receipt } = await write(contract, 'requestPayout', [nairaUnits, PAYOUT_KIND_IDS[kind], ref])
  const [event] = parseEventLogs({ abi: NAIRA_ABI, logs: receipt.logs, eventName: 'PayoutRequested' }) as unknown as { args: { payoutId: bigint } }[]
  if (!event) throw new Error('Payout was sent but its id could not be read. Check your history.')
  return { hash, payoutId: event.args.payoutId }
}

// ── admin (signs with the Funds account, which should be the contract admin) ─

/** Deploy the naira contract with your Funds account as its admin. Returns the contract address. */
export async function deployNairaContract(rateNairaPerUsdc: number, spreadBps: number, faucetNaira: number) {
  const { account, wallet } = signer('funds')
  const hash = await wallet.deployContract({
    account, chain: arcTestnet, abi: NAIRA_ABI, bytecode: NAIRA_BYTECODE,
    args: [ARC_USDC, account.address, parseUnits(String(rateNairaPerUsdc), 6), BigInt(spreadBps), toNairaUnits(faucetNaira)],
  })
  const receipt = await client.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('The deployment failed on-chain.')
  return receipt.contractAddress
}

export function setNairaRate(contract: Address, rateNairaPerUsdc: number, spreadBps: number) {
  return write(contract, 'setRate', [parseUnits(String(rateNairaPerUsdc), 6), BigInt(spreadBps)], 'funds')
}

export function refundNairaPayout(contract: Address, payoutId: bigint) {
  return write(contract, 'refundPayout', [payoutId], 'funds')
}

/** Fill the reserve so people can convert naira back to USDC. */
export async function topUpNairaReserve(contract: Address, usdcUnits: bigint) {
  const { account, wallet } = signer('funds')
  const hash = await wallet.writeContract({ account, chain: arcTestnet, address: ARC_USDC, abi: erc20Abi, functionName: 'transfer', args: [contract, usdcUnits] })
  await client.waitForTransactionReceipt({ hash })
  return hash
}
