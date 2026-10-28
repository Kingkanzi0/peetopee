/**
 * useWalletLink — keeps your Peetopee ID pointed at your built-in wallet.
 *
 * Links two addresses on Arc, each proven with a signature from that address:
 *   - "wallet": where people's Peetopee ID payments arrive
 *   - "funds":  your trading account (lets the server show your trade's bank
 *               details to you and your counterparty, and mark you ID-verified)
 *
 * Runs whenever you sign in, unlock, or create/import a wallet.
 */
import { useEffect, useRef } from 'react'
import { privateKeyToAccount } from 'viem/accounts'
import { useAuth } from '../auth/AuthContext'
import { apiLinkWallet, walletLinkMessage } from '../auth/ptpApi'
import { getFundsPrivateKey, getPrivateKey } from '../wallet/standaloneWallet'
import { useAppWallet } from '../wallet/appWallet'

const ARC_CHAIN = 5042002

export function useWalletLink() {
  const { profile, account, refreshAccount } = useAuth()
  const { wallet, unlocked } = useAppWallet()
  const busy = useRef(false)

  useEffect(() => {
    const ptpId = profile?.ptpId
    if (!ptpId || !wallet || !unlocked || !account || busy.current) return

    const linked = (kind: 'wallet' | 'funds', address: string) => account.wallets.some(
      w => w.kind === kind && w.chainId === ARC_CHAIN && w.verified && w.address.toLowerCase() === address.toLowerCase())

    const jobs: { kind: 'wallet' | 'funds'; key: `0x${string}` | null }[] = []
    if (!linked('wallet', wallet.address)) jobs.push({ kind: 'wallet', key: getPrivateKey() })
    if (!linked('funds', wallet.fundsAddress)) jobs.push({ kind: 'funds', key: getFundsPrivateKey() })
    if (jobs.length === 0) return

    busy.current = true
    void (async () => {
      try {
        for (const job of jobs) {
          if (!job.key) continue
          const acct = privateKeyToAccount(job.key)
          const signature = await acct.signMessage({ message: walletLinkMessage(ptpId, acct.address, job.kind) })
          await apiLinkWallet({ chainId: ARC_CHAIN, kind: job.kind, address: acct.address, signature })
        }
        await refreshAccount()
      } catch (e) {
        console.warn('[wallet-link] could not link wallet', e)
      } finally {
        busy.current = false
      }
    })()
  }, [profile?.ptpId, wallet?.address, wallet?.fundsAddress, unlocked, account, refreshAccount])
}
