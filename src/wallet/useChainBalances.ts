/**
 * useChainBalances — real USDC + native balances for the connected wagmi wallet.
 *
 * Arc Testnet: reads ERC-20 USDC balance via wagmi useReadContract (live,
 * auto-refreshes, reflects the real connected wallet). On Arc, the native
 * balance IS the same pool as USDC so we only show USDC to avoid double-counting.
 *
 * Other chains: public viem clients — no Circle key needed.
 */
import { useState, useEffect } from 'react'
import { useReadContract, useBalance } from 'wagmi'
import { createPublicClient, http, formatUnits, type PublicClient, erc20Abi } from 'viem'
import { baseSepolia, arbitrumSepolia, polygonAmoy } from 'viem/chains'
import { WALLET_CHAINS, type WalletChainId } from './walletCore'
import { getUsdc } from '@/onchain-facts'
import { formatUsdc } from '@/onchain-money'

export interface ChainBalance {
  chainId: WalletChainId
  usdcBalance: string    // human-readable USDC (e.g. "12.50")
  nativeBalance: string  // human-readable native (e.g. "0.00123")
  nativeSymbol: string
  loading: boolean
  error: string | null
}

// ---- Public RPC clients for non-Arc chains -----------------------------------
const OTHER_CLIENTS: Partial<Record<WalletChainId, PublicClient>> = {
  84532:  createPublicClient({ chain: baseSepolia,     transport: http() }) as PublicClient,
  421614: createPublicClient({ chain: arbitrumSepolia, transport: http() }),
  80002:  createPublicClient({ chain: polygonAmoy,     transport: http() }),
}

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

async function fetchOtherChain(
  address: `0x${string}`,
  chainId: WalletChainId,
): Promise<{ usdc: string; native: string }> {
  const client = OTHER_CLIENTS[chainId]
  if (!client) return { usdc: '0', native: '0' }

  let nativeHuman = '0'
  try {
    const native = await client.getBalance({ address })
    nativeHuman = Number(formatUnits(native, 18)).toFixed(5)
  } catch { /* network unreachable */ }

  let usdcHuman = '0'
  try {
    const usdcMeta = getUsdc(chainId)
    if (usdcMeta) {
      const raw = await (client).readContract({
        address: usdcMeta.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      })
      usdcHuman = formatUsdc(raw)
    }
  } catch { /* ignore */ }

  return { usdc: usdcHuman, native: nativeHuman }
}

// ---- Arc Testnet USDC address -----------------------------------------------
const ARC_USDC = '0x3600000000000000000000000000000000000000' as const

// ---- Hook --------------------------------------------------------------------
export function useChainBalances(address: string | null): ChainBalance[] {
  const addr = address as `0x${string}` | undefined

  // Arc Testnet: real ERC-20 USDC balance from wagmi (live, connected wallet).
  // chainId: 5042002 forces the RPC call to Arc regardless of the wallet's active chain.
  const { data: arcUsdcRaw, isLoading: arcLoading } = useReadContract({
    address: ARC_USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: addr ? [addr] : undefined,
    chainId: 5042002,
    query: { enabled: !!addr, refetchInterval: 10_000 },
  })

  // Arc native balance (same pool as USDC on Arc — used for display context only).
  // chainId: 5042002 ensures we read from Arc, not the wallet's current chain.
  const { data: arcNative } = useBalance({
    address: addr,
    chainId: 5042002,
    query: { enabled: !!addr, refetchInterval: 10_000 },
  })

  // Keep undefined distinct from zero: undefined means "not yet fetched"
  const arcUsdcHuman = arcUsdcRaw != null ? formatUsdc(arcUsdcRaw) : null
  const arcNativeHuman = arcNative != null
    ? formatUsdc(arcNative.value)   // Arc native = USDC (6 decimals via ERC-20 view)
    : null

  // Cap the Arc loading state: if wagmi hasn't resolved within 8s, show $0 rather than stalling.
  const [arcTimedOut, setArcTimedOut] = useState(false)
  useEffect(() => {
    if (!addr) return
    const t = setTimeout(() => setArcTimedOut(true), 8000)
    return () => clearTimeout(t)
  }, [addr])

  // Other chains: public RPC
  const [otherBalances, setOtherBalances] = useState<Partial<Record<WalletChainId, { usdc: string; native: string }>>>({})
  const [otherLoading, setOtherLoading] = useState(!!address)

  useEffect(() => {
    if (!address) return
    const a = address as `0x${string}`
    let mounted = true

    const OTHER_IDS: WalletChainId[] = [84532, 421614, 80002]

    async function refresh() {
      const results = await Promise.allSettled(
        OTHER_IDS.map(id => fetchOtherChain(a, id))
      )
      if (!mounted) return
      const updated: Partial<Record<WalletChainId, { usdc: string; native: string }>> = {}
      OTHER_IDS.forEach((id, i) => {
        const r = results[i]
        updated[id] = r.status === 'fulfilled' ? r.value : { usdc: '0', native: '0' }
      })
      setOtherBalances(updated)
      setOtherLoading(false)
    }

    void refresh()
    const interval = setInterval(() => { void refresh() }, 30_000)
    return () => { mounted = false; clearInterval(interval) }
  }, [address])

  if (!address) {
    return WALLET_CHAINS.map(c => ({
      chainId: c.id,
      usdcBalance: '0',
      nativeBalance: '0',
      nativeSymbol: c.nativeSymbol,
      loading: false,
      error: null,
    }))
  }

  return WALLET_CHAINS.map(c => {
    if (c.id === 5042002) {
      return {
        chainId: 5042002,
        usdcBalance: arcUsdcHuman ?? '0',
        nativeBalance: arcNativeHuman ?? '0',
        nativeSymbol: 'USDC',
        // loading until resolved OR until the 8s timeout fires
        loading: !arcTimedOut && (arcLoading || arcUsdcRaw === undefined),
        error: null,
      }
    }
    const ob = otherBalances[c.id]
    return {
      chainId: c.id,
      usdcBalance: ob?.usdc ?? '0',
      nativeBalance: ob?.native ?? '0',
      nativeSymbol: c.nativeSymbol,
      loading: otherLoading && !ob,
      error: null,
    }
  })
}
