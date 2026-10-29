// ABIs of the escrow contracts (committed), so the app builds without running Foundry first.
import v1Artifact from '../../contracts/contract-metadata/PeetopeeEscrow.json'
import v2Artifact from '../../contracts/contract-metadata/PeetopeeEscrowV2.json'

const ESCROW_V1_ADDRESS = '0x59417b13a4d545ff514642a1db1693f35652daea'

/**
 * PeetopeeEscrowV2 (trader bonds, 48h confirm window, slashing).
 * Leave empty until V2 is deployed; then paste its address here and redeploy the
 * app. Everything V2-specific in the UI switches on automatically.
 */
const ESCROW_V2_ADDRESS = ''

export const ESCROW_VERSION: 1 | 2 = ESCROW_V2_ADDRESS ? 2 : 1
export const IS_ESCROW_V2 = ESCROW_VERSION === 2

export const PEETOPEE_ESCROW_ADDRESS = (ESCROW_V2_ADDRESS || ESCROW_V1_ADDRESS) as `0x${string}`

export const PEETOPEE_ESCROW = {
  address: PEETOPEE_ESCROW_ADDRESS,
  abi: IS_ESCROW_V2 ? v2Artifact.abi : v1Artifact.abi,
} as const

/** V2: seller has this long after "fiat sent" to confirm or dispute before the trader can claim. */
export const CONFIRM_WINDOW_SECONDS = 172_800

// Arc Testnet chain ID
export const ARC_TESTNET_CHAIN_ID = 5042002

export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const

// Trade status enum matching Solidity
export enum TradeStatus {
  Created = 0,
  FiatSent = 1,
  Completed = 2,
  Disputed = 3,
  Cancelled = 4,
  Resolved = 5,
}

export const TRADE_STATUS_LABELS: Record<TradeStatus, string> = {
  [TradeStatus.Created]: 'Escrow Locked',
  [TradeStatus.FiatSent]: 'Fiat Sent',
  [TradeStatus.Completed]: 'Completed',
  [TradeStatus.Disputed]: 'In Dispute',
  [TradeStatus.Cancelled]: 'Cancelled',
  [TradeStatus.Resolved]: 'Resolved',
}

export interface TraderProfile {
  traderAddr: string
  countryCode: string
  currencyCode: string
  exchangeRate: bigint
  minOrderUsdc: bigint
  maxOrderUsdc: bigint
  paymentMethods: string
  isActive: boolean
  completedTrades: bigint
  totalRatingPoints: bigint
  /** V2 only */
  ratingCount?: bigint
  /** V2 only: USDC locked as a bond */
  bond?: bigint
  /** V2 only */
  openTrades?: bigint
}

export interface Trade {
  tradeId: bigint
  seller: string
  trader: string
  usdcAmount: bigint
  localAmount: bigint
  bankDetails: string
  status: TradeStatus
  createdAt: bigint
  fiatSentAt: bigint
  disputedAt: bigint
  sellerDisputed: boolean
  traderDisputed: boolean
  /** V2 only: platform fee fixed at creation */
  feeBps?: bigint
}

// Country definitions for the "Where are you?" selector
export interface CountryDef {
  code: string
  name: string
  flag: string
  currency: string
  currencySymbol: string
}

export const COUNTRIES: CountryDef[] = [
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬', currency: 'NGN', currencySymbol: '₦' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳', currency: 'VND', currencySymbol: '₫' },
  { code: 'FR', name: 'France', flag: '🇫🇷', currency: 'EUR', currencySymbol: '€' },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭', currency: 'GHS', currencySymbol: '₵' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪', currency: 'KES', currencySymbol: 'KSh' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭', currency: 'PHP', currencySymbol: '₱' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽', currency: 'MXN', currencySymbol: '$' },
  { code: 'IN', name: 'India', flag: '🇮🇳', currency: 'INR', currencySymbol: '₹' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷', currency: 'BRL', currencySymbol: 'R$' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩', currency: 'IDR', currencySymbol: 'Rp' },
]

export function getCountryByCode(code: string): CountryDef | undefined {
  return COUNTRIES.find(c => c.code === code)
}

/** Format exchange rate: 1 USDC = X local (rate is local units per 1 USDC, scaled 1e6) */
export function formatRate(rate: bigint, currencyCode: string): string {
  const rateNum = Number(rate) / 1_000_000
  return `${rateNum.toLocaleString()} ${currencyCode}`
}

/** Calculate local amount from USDC amount and rate */
export function calcLocalAmount(usdcAmount: bigint, rate: bigint): bigint {
  // usdcAmount is 6 decimals, rate is local/USDC scaled 1e6
  // localAmount = usdcAmount * rate / 1e6
  return (usdcAmount * rate) / 1_000_000n
}

/** Trader rating as 0-5 number */
export function traderRating(profile: TraderProfile): number {
  const count = profile.ratingCount ?? profile.completedTrades
  if (!count) return 0
  return Number(profile.totalRatingPoints) / Number(count)
}
