/**
 * standaloneWallet — the built-in Peetopee wallet.
 * No browser extension or WalletConnect needed.
 *
 * Two accounts come from one secret key:
 *   - Wallet: your main account. People pay you here by Peetopee ID.
 *   - Funds:  your trading account. Move USDC Wallet → Funds, then sell from
 *             Funds in the Market. Derived from the wallet key, so your seed
 *             phrase backs up both.
 *
 * At rest the key is encrypted (AES-GCM) with a device key that the browser
 * keeps in IndexedDB and never lets JavaScript read out. It's decrypted into
 * memory only after you unlock the app with your PIN or biometrics.
 */
import * as bip39 from 'bip39'
import { HDKey } from '@scure/bip32'
import {
  createPublicClient, createWalletClient, http,
  toHex, parseUnits, formatUnits, keccak256, concat, stringToHex,
  type Address, type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet, baseSepolia, arbitrumSepolia, polygonAmoy } from 'viem/chains'
import { arcTransport } from './arcNetwork'
import { erc20Abi } from 'viem'

// ---- Storage ----------------------------------------------------------------
const KEY_PRIVATE_LEGACY = 'ptp_wallet_privkey'   // plaintext — older versions only, migrated on unlock
const KEY_ENCRYPTED = 'ptp_wallet_key_enc'
const KEY_ADDRESS = 'ptp_wallet_address'
const KEY_FUNDS_ADDRESS = 'ptp_funds_address'
const KEY_LABEL   = 'ptp_wallet_label'

export interface StoredWallet {
  address: Address
  /** The trading (Funds) account address. */
  fundsAddress: Address
  label: 'created' | 'imported'
}

let unlockedKey: Hex | null = null
const listeners = new Set<() => void>()

function notify() { listeners.forEach(fn => fn()) }

/** Re-render hooks when the wallet is created, unlocked or deleted. */
export function subscribeWallet(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** The trading account key is derived from the wallet key. */
export function deriveFundsKey(walletKey: Hex): Hex {
  return keccak256(concat([walletKey, stringToHex('peetopee-funds-v1')]))
}

function safeGet(k: string) { try { return localStorage.getItem(k) } catch { return null } }

export function loadStoredWallet(): StoredWallet | null {
  const hasKey = !!(safeGet(KEY_ENCRYPTED) || safeGet(KEY_PRIVATE_LEGACY))
  const addr = safeGet(KEY_ADDRESS)
  if (!hasKey || !addr) return null
  let funds = safeGet(KEY_FUNDS_ADDRESS)
  if (!funds && unlockedKey) {
    funds = privateKeyToAccount(deriveFundsKey(unlockedKey)).address
    localStorage.setItem(KEY_FUNDS_ADDRESS, funds)
  }
  const label = safeGet(KEY_LABEL) as 'created' | 'imported' | null
  return { address: addr as Address, fundsAddress: (funds ?? addr) as Address, label: label ?? 'created' }
}

export function isWalletUnlocked() {
  return unlockedKey !== null
}

// ---- device-bound encryption -------------------------------------------------

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('peetopee-keys', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('keys')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function deviceKey(): Promise<CryptoKey> {
  const db = await openKeyDb()
  const get = <T,>(k: string) => new Promise<T | undefined>((resolve, reject) => {
    const r = db.transaction('keys').objectStore('keys').get(k)
    r.onsuccess = () => resolve(r.result as T | undefined)
    r.onerror = () => reject(r.error)
  })
  const existing = await get<CryptoKey>('device')
  if (existing) return existing
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite')
    tx.objectStore('keys').put(key, 'device')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  return key
}

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

async function encryptKey(privKey: Hex): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deviceKey(), new TextEncoder().encode(privKey))
  return `v1.${b64(iv)}.${b64(new Uint8Array(ct))}`
}

async function decryptKey(blob: string): Promise<Hex> {
  const [, iv, ct] = blob.split('.')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await deviceKey(), unb64(ct))
  return new TextDecoder().decode(pt) as Hex
}

/** Encrypt and store a new wallet key, and keep it unlocked for this session. */
export async function saveWallet(privKey: Hex, label: 'created' | 'imported') {
  const account = privateKeyToAccount(privKey)
  const funds = privateKeyToAccount(deriveFundsKey(privKey))
  try {
    localStorage.setItem(KEY_ENCRYPTED, await encryptKey(privKey))
    localStorage.removeItem(KEY_PRIVATE_LEGACY)
  } catch (e) {
    // IndexedDB/WebCrypto unavailable (rare private-browsing modes): fall back so the wallet still works.
    console.warn('[wallet] device encryption unavailable, storing key unencrypted', e)
    localStorage.setItem(KEY_PRIVATE_LEGACY, privKey)
  }
  localStorage.setItem(KEY_ADDRESS, account.address)
  localStorage.setItem(KEY_FUNDS_ADDRESS, funds.address)
  localStorage.setItem(KEY_LABEL, label)
  unlockedKey = privKey
  notify()
  return account.address
}

/**
 * Decrypt the key into memory. Call once the user has passed the PIN/biometric gate.
 * Also upgrades wallets saved by older versions (plaintext) to encrypted storage.
 */
export async function unlockWallet(): Promise<boolean> {
  if (unlockedKey) return true
  const legacy = safeGet(KEY_PRIVATE_LEGACY) as Hex | null
  const blob = safeGet(KEY_ENCRYPTED)
  try {
    if (blob) {
      unlockedKey = await decryptKey(blob)
    } else if (legacy) {
      unlockedKey = legacy
      try {
        localStorage.setItem(KEY_ENCRYPTED, await encryptKey(legacy))
        localStorage.removeItem(KEY_PRIVATE_LEGACY)
      } catch { /* keep legacy storage if encryption is unavailable */ }
    } else {
      return false
    }
  } catch (e) {
    console.error('[wallet] could not unlock wallet', e)
    return false
  }
  if (!safeGet(KEY_FUNDS_ADDRESS)) {
    localStorage.setItem(KEY_FUNDS_ADDRESS, privateKeyToAccount(deriveFundsKey(unlockedKey)).address)
  }
  notify()
  return true
}

/** Forget the decrypted key (e.g. when the app locks or you sign out). */
export function lockWallet() {
  unlockedKey = null
  notify()
}

export function deleteWallet() {
  for (const k of [KEY_PRIVATE_LEGACY, KEY_ENCRYPTED, KEY_ADDRESS, KEY_FUNDS_ADDRESS, KEY_LABEL]) localStorage.removeItem(k)
  unlockedKey = null
  notify()
}

/** The main wallet key, or null if no wallet / not unlocked yet. */
export function getPrivateKey(): Hex | null {
  return unlockedKey
}

/** The trading (Funds) account key, or null if not unlocked. */
export function getFundsPrivateKey(): Hex | null {
  return unlockedKey ? deriveFundsKey(unlockedKey) : null
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
  return createPublicClient({ chain, transport: chain.id === arcTestnet.id ? arcTransport() : http() })
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
  const walletClient = createWalletClient({ account, chain, transport: chain.id === arcTestnet.id ? arcTransport() : http() })
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
