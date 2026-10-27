/**
 * walletCore.ts — Circle Modular Wallet core setup
 * Passkey transport + multi-chain modular transports + bundler clients
 */
import {
  createPublicClient,
  type Address,
  type Hex,
  type Chain,
} from 'viem'
import {
  arcTestnet,
  baseSepolia,
  arbitrumSepolia,
  polygonAmoy,
} from 'viem/chains'
import {
  createBundlerClient,
  type P256Credential,
  toWebAuthnAccount,
} from 'viem/account-abstraction'
import {
  WebAuthnMode,
  toCircleSmartAccount,
  toModularTransport,
  toPasskeyTransport,
  toWebAuthnCredential,
  encodeTransfer,
  ContractAddress,
} from '@circle-fin/modular-wallets-core'
import { getUsdc } from '@/onchain-facts'
import { parseUsdc } from '@/onchain-money'

export const CLIENT_KEY = import.meta.env.VITE_CLIENT_KEY as string
export const CLIENT_URL = import.meta.env.VITE_CLIENT_URL as string

// Re-export P256Credential so callers import from one place
export type { P256Credential }

// ---------- Chain definitions the inbuilt wallet supports ----------
export type WalletChainId = 5042002 | 84532 | 421614 | 80002

export interface WalletChain {
  id: WalletChainId
  name: string
  shortName: string
  testnet: boolean
  transportPath: string
  viemChain: Chain
  nativeSymbol: string
  explorerUrl: string
}

export const WALLET_CHAINS: WalletChain[] = [
  {
    id: 5042002,
    name: 'Arc Testnet',
    shortName: 'Arc',
    testnet: true,
    transportPath: '/arcTestnet',
    viemChain: arcTestnet,
    nativeSymbol: 'USDC',
    explorerUrl: 'https://explorer.arc.io',
  },
  {
    id: 84532,
    name: 'Base Sepolia',
    shortName: 'Base',
    testnet: true,
    transportPath: '/baseSepolia',
    viemChain: baseSepolia,
    nativeSymbol: 'ETH',
    explorerUrl: 'https://sepolia.basescan.org',
  },
  {
    id: 421614,
    name: 'Arbitrum Sepolia',
    shortName: 'Arbitrum',
    testnet: true,
    transportPath: '/arbitrumSepolia',
    viemChain: arbitrumSepolia,
    nativeSymbol: 'ETH',
    explorerUrl: 'https://sepolia.arbiscan.io',
  },
  {
    id: 80002,
    name: 'Polygon Amoy',
    shortName: 'Polygon',
    testnet: true,
    transportPath: '/polygonAmoy',
    viemChain: polygonAmoy,
    nativeSymbol: 'MATIC',
    explorerUrl: 'https://amoy.polygonscan.com',
  },
]

// ---------- Passkey transport (shared) ----------
export function getPasskeyTransport() {
  return toPasskeyTransport(CLIENT_URL, CLIENT_KEY)
}

// ---------- Per-chain modular transports ----------
export function getModularTransport(chainId: WalletChainId) {
  const wc = WALLET_CHAINS.find(c => c.id === chainId)!
  return toModularTransport(`${CLIENT_URL}${wc.transportPath}`, CLIENT_KEY)
}

export function getPublicClient(chainId: WalletChainId) {
  const wc = WALLET_CHAINS.find(c => c.id === chainId)!
  return createPublicClient({ chain: wc.viemChain, transport: getModularTransport(chainId) })
}

export function getBundlerClient(chainId: WalletChainId) {
  const wc = WALLET_CHAINS.find(c => c.id === chainId)!
  return createBundlerClient({ chain: wc.viemChain, transport: getModularTransport(chainId) })
}

// ---------- Passkey registration / login ----------
export async function registerPasskey(username: string): Promise<P256Credential> {
  const transport = getPasskeyTransport()
  const credential = await toWebAuthnCredential({
    transport,
    mode: WebAuthnMode.Register,
    username,
  })
  return credential
}

export async function loginPasskey(): Promise<P256Credential> {
  const transport = getPasskeyTransport()
  const credential = await toWebAuthnCredential({
    transport,
    mode: WebAuthnMode.Login,
  })
  return credential
}

// ---------- Credential persistence (localStorage for demo) ----------
const CRED_KEY = 'ptp_wallet_credential'

export function persistCredential(cred: P256Credential) {
  localStorage.setItem(CRED_KEY, JSON.stringify(cred))
}

export function loadCredential(): P256Credential | null {
  try {
    const raw = localStorage.getItem(CRED_KEY)
    return raw ? (JSON.parse(raw) as P256Credential) : null
  } catch {
    return null
  }
}

export function clearCredential() {
  localStorage.removeItem(CRED_KEY)
}

// ---------- Smart account ----------
export async function getSmartAccount(credential: P256Credential, chainId: WalletChainId) {
  const client = getPublicClient(chainId)
  return toCircleSmartAccount({
    client,
    owner: toWebAuthnAccount({ credential }),
  })
}

// ---------- Send USDC ----------
export async function sendUsdc(params: {
  credential: P256Credential
  chainId: WalletChainId
  to: Address
  amountUsdc: string
}): Promise<Hex> {
  const { credential, chainId, to, amountUsdc } = params
  const account = await getSmartAccount(credential, chainId)
  const bundler = getBundlerClient(chainId)
  const amount = parseUsdc(amountUsdc)

  let usdcAddress: Address
  if (chainId === 5042002) {
    usdcAddress = ContractAddress.ArcTestnet_USDC
  } else {
    const meta = getUsdc(chainId)
    if (!meta) throw new Error(`No USDC address for chain ${chainId}`)
    usdcAddress = meta.address as Address
  }

  const callData = encodeTransfer(to, usdcAddress, amount)
  const hash = await bundler.sendUserOperation({
    account,
    calls: [callData],
    paymaster: true,
  })
  const { receipt } = await bundler.waitForUserOperationReceipt({ hash })
  return receipt.transactionHash
}

// ---------- Send native token ----------
export async function sendNative(params: {
  credential: P256Credential
  chainId: WalletChainId
  to: Address
  amountWei: bigint
}): Promise<Hex> {
  const { credential, chainId, to, amountWei } = params
  const account = await getSmartAccount(credential, chainId)
  const bundler = getBundlerClient(chainId)
  const hash = await bundler.sendUserOperation({
    account,
    calls: [{ to, value: amountWei, data: '0x' }],
    paymaster: true,
  })
  const { receipt } = await bundler.waitForUserOperationReceipt({ hash })
  return receipt.transactionHash
}
