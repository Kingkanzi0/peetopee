/**
 * standaloneWallet — self-contained wallet engine.
 * No wagmi, no ConnectKit, no external wallet required.
 * Creates/imports a private key, stores it encrypted in localStorage,
 * reads balances via viem publicClient, sends via walletClient.
 */
import * as bip39 from 'bip39'
import { HDKey } from '@scure/bip32'
import {
  createPublicClient, createWalletClient, http,
  toHex, parseUnits, formatUnits,
  type Address, type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet, baseSepolia, arbitrumSepolia, polygonAmoy } from 'viem/chains'
import { erc20Abi } from 'viem'

// ---- Storage ----------------------------------------------------------------
const KEY_PRIVATE = 'ptp_wallet_privkey'
const KEY_ADDRESS = 'ptp_wallet_address'
const KEY_LABEL   = 'ptp_wallet_label'

export interface StoredWallet {
  address: Address
  label: 'created' | 'imported'
}

export function loadStoredWallet(): StoredWallet | null {
  try {
    const pk = localStorage.getItem(KEY_PRIVATE)
    const addr = localStorage.getItem(KEY_ADDRESS)
    const label = localStorage.getItem(KEY_LABEL) as 'created' | 'imported' | null
    if (!pk || !addr) return null
    return { address: addr as Address, label: label ?? 'created' }
  } catch { return null }
}

export function saveWallet(privKey: Hex, label: 'created' | 'imported') {
  const account = privateKeyToAccount(privKey)
  localStorage.setItem(KEY_PRIVATE, privKey)
  localStorage.setItem(KEY_ADDRESS, account.address)
  localStorage.setItem(KEY_LABEL, label)
  return account.address
}

export function deleteWallet() {
  localStorage.removeItem(KEY_PRIVATE)
  localStorage.removeItem(KEY_ADDRESS)
  localStorage.removeItem(KEY_LABEL)
}

export function getPrivateKey(): Hex | null {
  return localStorage.getItem(KEY_PRIVATE) as Hex | null
}

// ---- Key derivation ---------------------------------------------------------
export function generateMnemonic(): string {
  return bip39.generateMnemonic(128) // 12 words
}

export function deriveFromMnemonic(mnemonic: string): Hex {
  const seed = bip39.mnemonicToSeedSync(mnemonic)
  const root = HDKey.fromMasterSeed(seed)
  const child = root.derive("m/44'/60'/0'/0/0")
  if (!child.privateKey) throw new Error('Key derivation failed')
  return toHex(child.privateKey)
}

export function deriveFromPrivateKey(raw: string): Hex {
  const hex = raw.startsWith('0x') ? raw : `0x${raw}`
  if (hex.length !== 66) throw new Error('Invalid private key length')
  return hex as Hex
}

// ---- Supported chains -------------------------------------------------------
export interface WalletChainConfig {
  id: number
  name: string
  shortName: string
  symbol: string       // native gas token
  color: string
  usdcAddress: Address
  usdcDecimals: number
  rpcUrl: string
  explorerUrl: string
  isTestnet: boolean
}

export const STANDALONE_CHAINS: WalletChainConfig[] = [
  {
    id: 5042002,
    name: 'Arc Testnet',
    shortName: 'Arc',
    symbol: 'USDC',   // gas is USDC on Arc
    color: '#00a3ff',
    usdcAddress: '0x3600000000000000000000000000000000000000',
    usdcDecimals: 6,
    rpcUrl: arcTestnet.rpcUrls.default.http[0],
    explorerUrl: 'https://explorer.testnet.arc.io',
    isTestnet: true,
  },
  {
    id: 84532,
    name: 'Base Sepolia',
    shortName: 'Base',
    symbol: 'ETH',
    color: '#0052ff',
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    usdcDecimals: 6,
    rpcUrl: baseSepolia.rpcUrls.default.http[0],
    explorerUrl: 'https://sepolia.basescan.org',
    isTestnet: true,
  },
  {
    id: 421614,
    name: 'Arbitrum Sepolia',
    shortName: 'Arbitrum',
    symbol: 'ETH',
    color: '#12aaff',
    usdcAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    usdcDecimals: 6,
    rpcUrl: arbitrumSepolia.rpcUrls.default.http[0],
    explorerUrl: 'https://sepolia.arbiscan.io',
    isTestnet: true,
  },
  {
    id: 80002,
    name: 'Polygon Amoy',
    shortName: 'Polygon',
    symbol: 'MATIC',
    color: '#8247e5',
    usdcAddress: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    usdcDecimals: 6,
    rpcUrl: polygonAmoy.rpcUrls.default.http[0],
    explorerUrl: 'https://amoy.polygonscan.com',
    isTestnet: true,
  },
]

// ---- Top tokens per chain (for display) ------------------------------------
export interface TokenInfo {
  symbol: string
  name: string
  decimals: number
  address: Address | 'native'
  color: string
  geckoId: string
}

export const CHAIN_TOKENS: Record<number, TokenInfo[]> = {
  5042002: [
    { symbol: 'USDC', name: 'USD Coin',  decimals: 6, address: '0x3600000000000000000000000000000000000000', color: '#2775ca', geckoId: 'usd-coin' },
  ],
  84532: [
    { symbol: 'USDC', name: 'USD Coin',  decimals: 6, address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', color: '#2775ca', geckoId: 'usd-coin' },
    { symbol: 'ETH',  name: 'Ethereum',  decimals: 18, address: 'native', color: '#627eea', geckoId: 'ethereum' },
  ],
  421614: [
    { symbol: 'USDC', name: 'USD Coin',  decimals: 6, address: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', color: '#2775ca', geckoId: 'usd-coin' },
    { symbol: 'ETH',  name: 'Ethereum',  decimals: 18, address: 'native', color: '#627eea', geckoId: 'ethereum' },
  ],
  80002: [
    { symbol: 'USDC', name: 'USD Coin',  decimals: 6, address: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', color: '#2775ca', geckoId: 'usd-coin' },
    { symbol: 'MATIC', name: 'Polygon',  decimals: 18, address: 'native', color: '#8247e5', geckoId: 'matic-network' },
  ],
}

// ---- Public clients (read-only) --------------------------------------------
const VIEM_CHAINS = {
  5042002: arcTestnet,
  84532:   baseSepolia,
  421614:  arbitrumSepolia,
  80002:   polygonAmoy,
} as const

export function getPublicClient(chainId: number) {
  const chain = VIEM_CHAINS[chainId as keyof typeof VIEM_CHAINS]
  if (!chain) throw new Error(`Unsupported chain ${chainId}`)
  return createPublicClient({ chain, transport: http() })
}

// ---- Balance reads ----------------------------------------------------------
export interface TokenBalance {
  chainId: number
  symbol: string
  address: Address | 'native'
  balance: string      // formatted
  usdValue: number
  decimals: number
  loading: boolean
  error?: string
}

export async function fetchTokenBalance(
  walletAddress: Address,
  chainId: number,
  token: TokenInfo,
  prices: Record<string, number>,
): Promise<TokenBalance> {
  const client = getPublicClient(chainId)
  try {
    let raw: bigint
    if (token.address === 'native') {
      raw = await client.getBalance({ address: walletAddress })
    } else {
      raw = await client.readContract({
        address: token.address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [walletAddress],
      })
    }
    const balance = formatUnits(raw, token.decimals)
    const price = prices[token.geckoId] ?? (token.symbol === 'USDC' ? 1 : 0)
    const usdValue = parseFloat(balance) * price
    return { chainId, symbol: token.symbol, address: token.address, balance, usdValue, decimals: token.decimals, loading: false }
  } catch (e) {
    return { chainId, symbol: token.symbol, address: token.address, balance: '0', usdValue: 0, decimals: token.decimals, loading: false, error: String(e) }
  }
}

// ---- Send -------------------------------------------------------------------
export async function sendToken(
  privKey: Hex,
  chainId: number,
  token: TokenInfo,
  to: Address,
  amount: string,
): Promise<Hex> {
  const chain = VIEM_CHAINS[chainId as keyof typeof VIEM_CHAINS]
  if (!chain) throw new Error(`Unsupported chain ${chainId}`)
  const account = privateKeyToAccount(privKey)
  const walletClient = createWalletClient({ account, chain, transport: http() })
  const amountBigInt = parseUnits(amount, token.decimals)

  if (token.address === 'native') {
    return walletClient.sendTransaction({ to, value: amountBigInt, account, chain })
  } else {
    return walletClient.writeContract({
      address: token.address,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [to, amountBigInt],
      account,
      chain,
    })
  }
}
