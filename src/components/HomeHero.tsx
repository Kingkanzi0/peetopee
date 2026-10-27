/**
 * HomeHero — post-login hero card.
 * Shows USDC balance (live from Arc Testnet) + equivalent in user's local currency.
 * Displayed at the top of the Market tab after sign-in.
 */
import { useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { motion } from 'framer-motion'
import { TrendingUp, RefreshCw } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useLocalCurrency } from '../hooks/useLocalCurrency'
import { USDC_ADDRESS, ARC_TESTNET_CHAIN_ID } from '../contracts/peetopee'
import { Amount, usdcDecimalsFor } from '../onchain-money'

interface Props {
  walletAddress: `0x${string}` | undefined
}

export function HomeHero({ walletAddress }: Props) {
  const { profile } = useAuth()
  const currencyCode = profile?.country.currency ?? 'USD'
  const currencySymbol = profile?.country.currencySymbol ?? '$'

  const { data: rawBalance, isLoading } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: walletAddress ? [walletAddress] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!walletAddress, refetchInterval: 15_000 },
  })

  const { rate, loading: fxLoading, source, convert, formatLocal } = useLocalCurrency(currencyCode)

  const usdcAmount = rawBalance != null
    ? parseFloat(Amount.fromRaw(rawBalance, usdcDecimalsFor(ARC_TESTNET_CHAIN_ID)).toFixed(6))
    : null

  const localAmount = usdcAmount != null ? convert(usdcAmount) : null

  if (!profile) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-4 mt-4 rounded-3xl p-5 text-white overflow-hidden relative"
      style={{ background: 'linear-gradient(135deg, #0d2137 0%, #122d45 55%, #251058 100%)' }}
    >
      {/* Subtle background glow */}
      <div
        className="absolute -top-8 -right-8 size-40 rounded-full opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #0052ff, transparent)' }}
      />
      <div
        className="absolute -bottom-6 -left-6 size-32 rounded-full opacity-15 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #7c3aed, transparent)' }}
      />

      <div className="relative">
        {/* Greeting */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold uppercase tracking-widest opacity-50">
            Hi, {profile.name.split(' ')[0]}
          </p>
          <div className="flex items-center gap-1 text-xs opacity-40">
            {fxLoading
              ? <><RefreshCw className="size-3 animate-spin" /> Updating…</>
              : <><TrendingUp className="size-3" /> {source === 'live' ? 'Live rate' : 'Est. rate'}</>
            }
          </div>
        </div>

        {/* USDC balance */}
        <div className="mb-1">
          <p className="text-xs opacity-50 font-medium mb-0.5">USDC Balance</p>
          {isLoading || usdcAmount == null ? (
            <div className="h-10 w-40 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.1)' }} />
          ) : (
            <motion.p
              key={usdcAmount}
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 1 }}
              className="text-4xl font-bold tabular-nums display"
              style={{ letterSpacing: '-0.02em' }}
            >
              {usdcAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-lg font-semibold ml-1.5 opacity-60">USDC</span>
            </motion.p>
          )}
        </div>

        {/* Local currency equivalent */}
        <div
          className="mt-3 flex items-center gap-2 rounded-2xl px-3 py-2.5 w-fit"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <img
            src={`https://flagcdn.com/w40/${profile.country.code.toLowerCase()}.png`}
            srcSet={`https://flagcdn.com/w80/${profile.country.code.toLowerCase()}.png 2x`}
            alt={profile.country.name}
            width={20} height={15}
            className="rounded-sm shrink-0 object-cover"
            style={{ width: 20, height: 15 }}
          />
          {fxLoading || localAmount == null ? (
            <div className="h-4 w-28 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.1)' }} />
          ) : (
            <motion.p
              key={localAmount}
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 1 }}
              className="text-sm font-semibold tabular-nums"
            >
              ≈ {formatLocal(localAmount, currencyCode, currencySymbol)}
              <span className="ml-1 opacity-50 font-normal text-xs">{currencyCode}</span>
            </motion.p>
          )}
        </div>

        {/* Rate display */}
        {rate != null && (
          <p className="mt-2.5 text-xs opacity-35">
            1 USDC = {formatLocal(rate, currencyCode, currencySymbol)} {currencyCode}
            {source === 'fallback' && ' (estimated)'}
          </p>
        )}
      </div>
    </motion.div>
  )
}
