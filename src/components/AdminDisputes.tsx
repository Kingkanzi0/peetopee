/**
 * AdminDisputes — decide disputed trades.
 *
 * Lists trades in dispute (read from the escrow contract), shows both people,
 * the seller's bank details and everyone's evidence, and lets the contract
 * admin release the USDC to the trader or refund the seller.
 *
 * Only the escrow contract's admin address can resolve disputes. The page
 * checks whether your Peetopee Funds account is that admin and, if not, gives
 * you the exact Arc Studio prompt to make it so.
 */
import { useEffect, useMemo, useState } from 'react'
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatUnits, parseUnits } from 'viem'
import { Loader2, Copy, Check, Scale } from 'lucide-react'
import { PEETOPEE_ESCROW, PEETOPEE_ESCROW_ADDRESS, ARC_TESTNET_CHAIN_ID, IS_ESCROW_V2, TradeStatus, type Trade, type TraderProfile } from '../contracts/peetopee'
import { adminApi, ApiError } from '../auth/ptpApi'
import { EvidenceList } from './DisputeEvidence'
import { friendlyTxError } from '../wallet/appWallet'

const MAX_SCAN = 300

export function AdminDisputes({ adminToken }: { adminToken: string }) {
  const { address } = useAccount()
  const { data: adminAddr } = useReadContract({ ...PEETOPEE_ESCROW, functionName: 'admin', chainId: ARC_TESTNET_CHAIN_ID })
  const { data: countRaw, refetch: refetchCount } = useReadContract({ ...PEETOPEE_ESCROW, functionName: 'tradeCount', chainId: ARC_TESTNET_CHAIN_ID })
  const count = Number((countRaw as bigint | undefined) ?? 0n)
  const ids = useMemo(() => {
    const first = Math.max(1, count - MAX_SCAN + 1)
    return Array.from({ length: Math.max(0, count - first + 1) }, (_, i) => BigInt(first + i))
  }, [count])
  const { data: tradeResults, refetch: refetchTrades, isLoading } = useReadContracts({
    contracts: ids.map(id => ({ ...PEETOPEE_ESCROW, functionName: 'getTrade', args: [id], chainId: ARC_TESTNET_CHAIN_ID })),
    query: { enabled: ids.length > 0 },
  })
  const disputed = (tradeResults ?? [])
    .map(r => r.result as Trade | undefined)
    .filter((t): t is Trade => !!t && Number(t.status) === TradeStatus.Disputed)
    .reverse()

  const [openId, setOpenId] = useState<bigint | null>(null)
  const isAdmin = !!address && !!adminAddr && (adminAddr as string).toLowerCase() === address.toLowerCase()

  const open = disputed.find(t => t.tradeId === openId)
  if (open) {
    return (
      <DisputeDetail
        trade={open}
        adminToken={adminToken}
        canResolve={isAdmin}
        onBack={() => setOpenId(null)}
        onResolved={() => { setOpenId(null); void refetchCount(); void refetchTrades() }}
      />
    )
  }

  return (
    <div className="space-y-4">
      <AdminAccess adminAddr={adminAddr as string | undefined} myAddr={address} />
      {isLoading && <Loader2 className="size-5 animate-spin" style={{ color: 'var(--accent)' }} />}
      {!isLoading && disputed.length === 0 && <p className="text-sm" style={{ color: 'var(--muted)' }}>No trades in dispute.</p>}
      <div className="space-y-2">
        {disputed.map(t => (
          <button key={t.tradeId.toString()} onClick={() => setOpenId(t.tradeId)}
            className="w-full text-left rounded-2xl p-4 flex items-center justify-between gap-3"
            style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            <div className="min-w-0">
              <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Trade #{t.tradeId.toString()}</div>
              <div className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                Opened by {t.sellerDisputed ? 'seller' : t.traderDisputed ? 'trader' : '—'} · {new Date(Number(t.disputedAt) * 1000).toLocaleString()}
              </div>
            </div>
            <div className="text-sm font-bold tabular-nums shrink-0" style={{ color: 'var(--ink)' }}>{formatUnits(t.usdcAmount, 6)} USDC</div>
          </button>
        ))}
      </div>
    </div>
  )
}

function AdminAccess({ adminAddr, myAddr }: { adminAddr?: string; myAddr?: string }) {
  const [copied, setCopied] = useState(false)
  if (!adminAddr) return null
  if (myAddr && adminAddr.toLowerCase() === myAddr.toLowerCase()) {
    return (
      <div className="rounded-xl p-3 text-xs" style={{ background: 'rgba(26,128,71,0.06)', color: 'var(--success)' }}>
        Your Peetopee Funds account is the escrow admin — you can resolve disputes.
      </div>
    )
  }
  const prompt = myAddr
    ? `Using the deployer wallet that is the current admin of PeetopeeEscrow at ${PEETOPEE_ESCROW_ADDRESS} on Arc Testnet, call transferAdmin(${myAddr}). Then confirm admin() returns ${myAddr}.`
    : ''
  return (
    <div className="rounded-xl p-3 text-xs space-y-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#92400e' }}>
      <p>
        You can review disputes, but only the escrow admin ({adminAddr.slice(0, 6)}…{adminAddr.slice(-4)}) can resolve them.
        {myAddr ? ' To make your Peetopee Funds account the admin, paste this into Arc Studio:' : ' Unlock your Peetopee wallet to see how to become the admin.'}
      </p>
      {prompt && (
        <div className="flex items-start gap-2">
          <code className="flex-1 rounded-lg p-2 break-all" style={{ background: 'white', color: 'var(--ink)' }}>{prompt}</code>
          <button onClick={() => { void navigator.clipboard.writeText(prompt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}
            className="rounded-lg p-2" style={{ background: 'white' }} aria-label="Copy prompt">
            {copied ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
          </button>
        </div>
      )}
    </div>
  )
}

function DisputeDetail({ trade, adminToken, canResolve, onBack, onResolved }: {
  trade: Trade; adminToken: string; canResolve: boolean; onBack: () => void; onResolved: () => void
}) {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof adminApi.dispute>> | null>(null)
  const [error, setError] = useState('')
  const [choice, setChoice] = useState<boolean | null>(null)
  const [slash, setSlash] = useState('')
  // V2: the trader's bond, so the admin can compensate the seller from it
  const { data: traderProfile } = useReadContract({
    ...PEETOPEE_ESCROW, functionName: 'getTraderProfile', args: [trade.trader as `0x${string}`],
    chainId: ARC_TESTNET_CHAIN_ID, query: { enabled: IS_ESCROW_V2 },
  })
  const bond = (traderProfile as TraderProfile | undefined)?.bond ?? 0n
  const slashRaw = (() => { try { return slash ? parseUnits(slash, 6) : 0n } catch { return -1n } })()
  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    adminApi.dispute(adminToken, trade.tradeId).then(setInfo).catch(e => setError(e instanceof ApiError ? e.message : 'Could not load this dispute.'))
  }, [adminToken, trade.tradeId])
  useEffect(() => { if (isSuccess) onResolved() }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  function resolve(releaseToTrader: boolean) {
    const slashNote = !releaseToTrader && slashRaw > 0n ? ` and pay the seller ${formatUnits(slashRaw, 6)} USDC from the trader's bond` : ''
    const who = releaseToTrader ? 'release the USDC to the TRADER' : `REFUND the seller${slashNote}`
    if (!window.confirm(`Trade #${trade.tradeId}: ${who}? This cannot be undone.`)) return
    setChoice(releaseToTrader)
    writeContract({
      ...PEETOPEE_ESCROW,
      functionName: 'resolveDispute',
      args: IS_ESCROW_V2
        ? [trade.tradeId, releaseToTrader, releaseToTrader ? 0n : (slashRaw > 0n ? slashRaw : 0n)]
        : [trade.tradeId, releaseToTrader],
    })
  }

  const person = (p: { ptpId: string; name: string; contact: string } | null | undefined, addr: string) =>
    p ? `${p.name} (${p.ptpId}) · ${p.contact}` : `${addr.slice(0, 6)}…${addr.slice(-4)} (no Peetopee account linked)`
  const busy = isPending || confirming

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm" style={{ color: 'var(--accent)' }}>← All disputes</button>
      <div className="rounded-2xl p-4 space-y-1 text-sm" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', color: 'var(--ink)' }}>
        <div className="flex items-center gap-2 font-bold"><Scale className="size-4" /> Trade #{trade.tradeId.toString()} · {formatUnits(trade.usdcAmount, 6)} USDC</div>
        <div><span style={{ color: 'var(--muted)' }}>Seller:</span> {person(info?.seller, trade.seller)}</div>
        <div><span style={{ color: 'var(--muted)' }}>Trader:</span> {person(info?.trader, trade.trader)}</div>
        <div><span style={{ color: 'var(--muted)' }}>Local amount:</span> {(Number(trade.localAmount) / 1e6).toLocaleString()}</div>
        <div><span style={{ color: 'var(--muted)' }}>Fiat marked sent:</span> {Number(trade.fiatSentAt) > 0 ? new Date(Number(trade.fiatSentAt) * 1000).toLocaleString() : 'No'}</div>
        <div><span style={{ color: 'var(--muted)' }}>Opened by:</span> {trade.sellerDisputed ? 'Seller' : 'Trader'}</div>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--subtle)' }}>Bank details the trader had to pay</div>
        <p className="rounded-xl p-3 text-sm whitespace-pre-wrap" style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}>
          {info ? (info.bankDetails ?? 'Not shared') : '…'}
        </p>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--subtle)' }}>Evidence</div>
        {info ? <EvidenceList evidence={info.evidence} /> : <Loader2 className="size-4 animate-spin" />}
      </div>

      {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
      {writeError && !busy && <p className="text-xs" style={{ color: 'var(--danger)' }}>{friendlyTxError(writeError)}</p>}

      {IS_ESCROW_V2 && (
        <div>
          <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--muted)' }}>
            If refunding: compensation for the seller from the trader's bond (USDC, optional) · bond {formatUnits(bond, 6)} USDC
          </label>
          <input value={slash} inputMode="decimal" placeholder="0"
            onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); if (/^\d*\.?\d{0,6}$/.test(v)) setSlash(v) }}
            className="w-full rounded-xl px-3 py-2.5 outline-none"
            style={{ background: 'var(--surface-muted)', border: `1px solid ${slashRaw < 0n || slashRaw > bond ? 'var(--danger)' : 'var(--border)'}`, color: 'var(--ink)', fontSize: 16 }} />
          {slashRaw > bond && <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>More than the bond — it will be capped at {formatUnits(bond, 6)} USDC.</p>}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => resolve(false)} disabled={!canResolve || busy}
          className="flex-1 rounded-xl py-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5"
          style={{ background: 'rgba(186,43,76,0.1)', color: 'var(--danger)' }}>
          {busy && choice === false && <Loader2 className="size-4 animate-spin" />} Refund seller
        </button>
        <button onClick={() => resolve(true)} disabled={!canResolve || busy}
          className="flex-1 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-1.5"
          style={{ background: 'var(--success)' }}>
          {busy && choice === true && <Loader2 className="size-4 animate-spin" />} Release to trader
        </button>
      </div>
      {!canResolve && <p className="text-xs" style={{ color: 'var(--subtle)' }}>Resolve buttons unlock once your Funds account is the escrow admin (see the note on the list page).</p>}
    </div>
  )
}
