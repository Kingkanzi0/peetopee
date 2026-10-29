/**
 * TraderBond (escrow V2) — the deposit a trader locks before sellers can trade with them.
 * If the trader loses a dispute, the admin can pay the seller from it. It can be
 * withdrawn, but not below the minimum while trades are open.
 */
import { useEffect, useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi, formatUnits, parseUnits } from 'viem'
import { ShieldCheck, Loader2 } from 'lucide-react'
import {
  PEETOPEE_ESCROW, PEETOPEE_ESCROW_ADDRESS, USDC_ADDRESS, ARC_TESTNET_CHAIN_ID, type TraderProfile,
} from '../contracts/peetopee'
import { friendlyTxError } from '../wallet/appWallet'

export function TraderBond({ profile, onChanged }: { profile: TraderProfile; onChanged: () => void }) {
  const { address } = useAccount()
  const { data: minBondRaw } = useReadContract({ ...PEETOPEE_ESCROW, functionName: 'minTraderBond', chainId: ARC_TESTNET_CHAIN_ID })
  const minBond = (minBondRaw as bigint | undefined) ?? 0n
  const bond = profile.bond ?? 0n
  const open = profile.openTrades ?? 0n
  const ok = bond >= minBond

  const [mode, setMode] = useState<'deposit' | 'withdraw' | null>(null)
  const [amount, setAmount] = useState('')
  const [step, setStep] = useState<'idle' | 'approving' | 'sending'>('idle')
  const raw = (() => { try { return amount ? parseUnits(amount, 6) : 0n } catch { return 0n } })()

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance',
    args: address ? [address, PEETOPEE_ESCROW_ADDRESS] : undefined, chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address },
  })
  const { writeContract: approve, data: approveHash, error: approveError } = useWriteContract()
  const { isSuccess: approved } = useWaitForTransactionReceipt({ hash: approveHash })
  const { writeContract: write, data: txHash, error: writeError } = useWriteContract()
  const { isSuccess: done } = useWaitForTransactionReceipt({ hash: txHash })

  function send() {
    setStep('sending')
    write({ ...PEETOPEE_ESCROW, functionName: mode === 'deposit' ? 'depositBond' : 'withdrawBond', args: [raw] })
  }

  function start() {
    if (raw <= 0n) return
    if (mode === 'deposit' && (allowance ?? 0n) < raw) {
      setStep('approving')
      approve({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [PEETOPEE_ESCROW_ADDRESS, raw] })
    } else {
      send()
    }
  }

  useEffect(() => { if (approved && step === 'approving') { void refetchAllowance(); send() } }, [approved]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (done) { setStep('idle'); setMode(null); setAmount(''); onChanged() } }, [done]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (approveError || writeError) setStep('idle') }, [approveError, writeError])

  const err = approveError ?? writeError
  const busy = step !== 'idle'
  const maxWithdraw = open > 0n ? (bond > minBond ? bond - minBond : 0n) : bond

  return (
    <div className="mb-5 rounded-2xl p-4" style={{ background: ok ? 'rgba(26,128,71,0.06)' : 'rgba(245,158,11,0.08)', border: `1px solid ${ok ? 'rgba(26,128,71,0.2)' : 'rgba(245,158,11,0.3)'}` }}>
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="size-4" style={{ color: ok ? 'var(--success)' : '#d97706' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Trader deposit: {formatUnits(bond, 6)} USDC</span>
      </div>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        {ok
          ? `Sellers can trade with you. Minimum ${formatUnits(minBond, 6)} USDC. If you lose a dispute, part of it can be paid to the seller.`
          : `Lock at least ${formatUnits(minBond, 6)} USDC (from your Funds) before sellers can trade with you. You can withdraw it later.`}
        {open > 0n && ` You have ${open.toString()} open trade${open === 1n ? '' : 's'}.`}
      </p>

      {mode ? (
        <div className="mt-3 flex gap-2">
          <input value={amount} inputMode="decimal" placeholder={mode === 'deposit' ? 'Amount to add' : `Max ${formatUnits(maxWithdraw, 6)}`}
            onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); if (/^\d*\.?\d{0,6}$/.test(v)) setAmount(v) }}
            className="flex-1 min-w-0 rounded-xl px-3 py-2 outline-none"
            style={{ background: 'var(--chip)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 16 }} />
          <button onClick={start} disabled={busy || raw <= 0n || (mode === 'withdraw' && raw > maxWithdraw)}
            className="rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-40 flex items-center gap-1.5" style={{ background: 'var(--accent)' }}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {mode === 'deposit' ? 'Lock' : 'Withdraw'}
          </button>
          <button onClick={() => { setMode(null); setAmount('') }} disabled={busy} className="text-xs px-2" style={{ color: 'var(--muted)' }}>Cancel</button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button onClick={() => { setMode('deposit'); setAmount(ok ? '' : formatUnits(minBond - bond, 6)) }}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-white" style={{ background: 'var(--accent)' }}>
            {ok ? 'Add to deposit' : 'Lock deposit'}
          </button>
          {bond > 0n && (
            <button onClick={() => setMode('withdraw')} disabled={maxWithdraw === 0n}
              className="rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: 'var(--chip)', color: 'var(--ink)' }}>
              Withdraw
            </button>
          )}
        </div>
      )}
      {err && !busy && <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>{friendlyTxError(err)}</p>}
    </div>
  )
}
