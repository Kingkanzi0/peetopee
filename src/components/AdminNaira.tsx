/**
 * AdminNaira — switch on and run the naira account.
 *
 *   1. Deploy the naira contract from your Peetopee Funds account (it becomes the admin),
 *      or paste an existing address. The server remembers it; add NAIRA_ADDRESS on
 *      Render so it survives free-plan restarts.
 *   2. Set the USDC ⇄ naira rate and fill the USDC reserve.
 *   3. Work the payout queue: mark bank/bill payouts paid, or failed and refund the naira.
 */
import { useCallback, useEffect, useState } from 'react'
import type { Address } from 'viem'
import { formatUnits, parseUnits } from 'viem'
import { Loader2, Copy, Check, Rocket } from 'lucide-react'
import { adminApi, ApiError, type Payout } from '../auth/ptpApi'
import { useAppWallet, useUsdcBalance, friendlyTxError } from '../wallet/appWallet'
import { useLocalCurrency } from '../hooks/useLocalCurrency'
import {
  useNairaConfig, reloadNairaConfig, readNairaInfo, deployNairaContract, setNairaRate, topUpNairaReserve,
  refundNairaPayout, formatNaira, NAIRA_ACCOUNT_LIVE, type NairaInfo,
} from '../naira/nairaToken'
import { KIND_LABEL, payoutSummary } from '../naira/bills'

const input = { background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 16 } as const

export function AdminNaira({ adminToken }: { adminToken: string }) {
  const cfg = useNairaConfig({ evenIfComingSoon: true })
  const { wallet, unlocked } = useAppWallet()
  const fundsUsdc = useUsdcBalance(wallet?.fundsAddress)
  const fx = useLocalCurrency('NGN')
  const [info, setInfo] = useState<NairaInfo | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  const [rate, setRate] = useState('')
  const [spread, setSpread] = useState('1')
  const [faucet, setFaucet] = useState('20000')
  const [existing, setExisting] = useState('')
  const [reserve, setReserve] = useState('')

  useEffect(() => { if (!rate && fx.rate) setRate(String(Math.round(fx.rate))) }, [fx.rate]) // eslint-disable-line react-hooks/exhaustive-deps
  const loadInfo = useCallback(() => { if (cfg.address) readNairaInfo(cfg.address).then(setInfo).catch(() => {}) }, [cfg.address])
  useEffect(loadInfo, [loadInfo])

  async function act(label: string, fn: () => Promise<void>) {
    setBusy(label); setError(''); setNote('')
    try { await fn() } catch (e) {
      setError(e instanceof ApiError ? e.message : friendlyTxError(e))
    } finally { setBusy('') }
  }

  const isAdmin = !!info && !!wallet && info.admin.toLowerCase() === wallet.fundsAddress.toLowerCase()
  const rateNum = parseFloat(rate)
  const spreadBps = Math.round((parseFloat(spread) || 0) * 100)

  // ── not switched on yet ──
  if (!cfg.address) {
    return (
      <div className="space-y-5 max-w-lg">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          The naira account is off. Deploy its contract from your Peetopee Funds account (you become its admin), or paste an address you deployed before.
        </p>
        {!unlocked || !wallet ? (
          <p className="text-sm" style={{ color: 'var(--danger)' }}>Unlock your Peetopee wallet to deploy.</p>
        ) : (
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--ink)' }}><Rocket className="size-4" /> Deploy the naira contract</p>
            <Labeled label={`Rate: naira per 1 USDC${fx.source === 'live' ? ' (live market rate filled in)' : ''}`}>
              <input value={rate} onChange={e => setRate(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className="w-full rounded-xl px-3 py-2.5 outline-none" style={input} />
            </Labeled>
            <Labeled label="Conversion fee (%)">
              <input value={spread} onChange={e => setSpread(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className="w-full rounded-xl px-3 py-2.5 outline-none" style={input} />
            </Labeled>
            <Labeled label="Test naira per faucet claim (0 = no faucet)">
              <input value={faucet} onChange={e => setFaucet(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="w-full rounded-xl px-3 py-2.5 outline-none" style={input} />
            </Labeled>
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>
              Admin will be your Funds account {wallet.fundsAddress.slice(0, 6)}…{wallet.fundsAddress.slice(-4)} · it has {fundsUsdc.balance ?? '…'} USDC for the fee.
            </p>
            <button disabled={!!busy || !(rateNum > 0) || spreadBps > 300 || (fundsUsdc.balance ?? 0) < 0.05}
              onClick={() => { void act('deploy', async () => {
                const addr = await deployNairaContract(rateNum, spreadBps, parseInt(faucet || '0', 10))
                await adminApi.setNairaAddress(adminToken, addr)
                await reloadNairaConfig()
                setNote(`Deployed at ${addr}. Add NAIRA_ADDRESS=${addr} on Render so it survives restarts.`)
              }) }}
              className="w-full rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: 'var(--accent)' }}>
              {busy === 'deploy' && <Loader2 className="size-4 animate-spin" />} Deploy and switch on
            </button>
            {(fundsUsdc.balance ?? 0) < 0.05 && <p className="text-xs" style={{ color: 'var(--danger)' }}>Move at least 0.05 USDC to your Funds account to pay the deployment fee.</p>}
          </div>
        )}
        <div className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Already deployed?</p>
          <div className="flex gap-2">
            <input value={existing} onChange={e => setExisting(e.target.value.trim())} placeholder="0x…" className="flex-1 rounded-xl px-3 py-2.5 outline-none font-mono" style={input} />
            <button disabled={!!busy || !/^0x[0-9a-fA-F]{40}$/.test(existing)}
              onClick={() => { void act('set', async () => { await adminApi.setNairaAddress(adminToken, existing); await reloadNairaConfig() }) }}
              className="rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>Use it</button>
          </div>
        </div>
        {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>
    )
  }

  // ── running ──
  const contract = cfg.address
  return (
    <div className="space-y-5">
      {!NAIRA_ACCOUNT_LIVE && (
        <div className="rounded-xl p-3 text-xs" style={{ background: 'rgba(245,158,11,0.08)', color: 'var(--warn-ink)' }}>
          Users see the naira account as "Coming soon". Set NAIRA_ACCOUNT_LIVE = true in src/naira/nairaToken.ts to open it.
        </div>
      )}
      <div className="rounded-2xl p-4 text-sm space-y-1" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', color: 'var(--ink)' }}>
        <div className="flex items-center gap-2"><b>Naira contract</b><CopyText text={contract} /></div>
        {info ? (
          <>
            <div>Rate ₦{(Number(info.rate) / 1e6).toLocaleString()} per USDC · fee {Number(info.spreadBps) / 100}% · faucet {formatNaira(info.faucetAmount)}</div>
            <div>USDC reserve: {formatUnits(info.reserve, 6)} USDC</div>
            <div className="text-xs" style={{ color: isAdmin ? 'var(--success)' : 'var(--danger)' }}>
              {isAdmin ? 'Your Funds account is the admin.' : `Admin is ${info.admin.slice(0, 6)}…${info.admin.slice(-4)} — rate changes and refunds need that account.`}
            </div>
          </>
        ) : <Loader2 className="size-4 animate-spin" />}
        {cfg.simulated && <div className="text-xs" style={{ color: '#d97706' }}>PAYOUT_MODE=simulate: payouts are marked paid automatically. Nothing below needs doing.</div>}
        <div className="text-xs" style={{ color: 'var(--subtle)' }}>On Render's free plan, set NAIRA_ADDRESS={contract} so this survives restarts.</div>
      </div>

      {isAdmin && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Rate</p>
            <div className="flex gap-2">
              <input value={rate} onChange={e => setRate(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="₦ per USDC" className="flex-1 min-w-0 rounded-xl px-3 py-2 outline-none" style={input} />
              <input value={spread} onChange={e => setSpread(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="fee %" className="w-16 rounded-xl px-3 py-2 outline-none" style={input} />
            </div>
            {fx.rate && <p className="text-xs" style={{ color: 'var(--subtle)' }}>Market: ₦{Math.round(fx.rate).toLocaleString()} ({fx.source})</p>}
            <button disabled={!!busy || !(rateNum > 0) || spreadBps > 300}
              onClick={() => { void act('rate', async () => { await setNairaRate(contract, rateNum, spreadBps); loadInfo(); setNote('Rate updated.') }) }}
              className="w-full rounded-xl py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>
              {busy === 'rate' ? 'Saving…' : 'Set rate'}
            </button>
          </div>
          <div className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Fill the USDC reserve</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>So people can convert naira back to USDC. From your Funds ({fundsUsdc.balance ?? '…'} USDC).</p>
            <input value={reserve} onChange={e => setReserve(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="USDC" className="w-full rounded-xl px-3 py-2 outline-none" style={input} />
            <button disabled={!!busy || !(parseFloat(reserve) > 0)}
              onClick={() => { void act('reserve', async () => { await topUpNairaReserve(contract, parseUnits(reserve, 6)); setReserve(''); loadInfo(); fundsUsdc.refresh() }) }}
              className="w-full rounded-xl py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>
              {busy === 'reserve' ? 'Sending…' : 'Add to reserve'}
            </button>
          </div>
        </div>
      )}

      {note && <p className="text-xs" style={{ color: 'var(--success)' }}>{note}</p>}
      {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}

      <PayoutQueue adminToken={adminToken} contract={contract} canRefund={isAdmin} />
    </div>
  )
}

function PayoutQueue({ adminToken, contract, canRefund }: { adminToken: string; contract: Address; canRefund: boolean }) {
  const [status, setStatus] = useState<Payout['status']>('processing')
  const [list, setList] = useState<Payout[] | null>(null)
  const [refs, setRefs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setList(null)
    adminApi.payouts(adminToken, status).then(setList).catch(e => { setList([]); setError(e instanceof ApiError ? e.message : 'Could not load payouts.') })
  }, [adminToken, status])
  useEffect(load, [load])

  async function mark(p: Payout, next: 'paid' | 'failed') {
    setBusy(p.payoutId); setError('')
    try {
      await adminApi.updatePayout(adminToken, p.payoutId, next, refs[p.payoutId] ?? '', next === 'failed' ? 'The payment partner could not pay this.' : '')
      load()
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not save.') } finally { setBusy('') }
  }

  async function refund(p: Payout) {
    if (!window.confirm(`Refund ${formatNaira(BigInt(p.amount))} to the sender? Only do this if it was NOT paid out.`)) return
    setBusy(p.payoutId); setError('')
    try { await refundNairaPayout(contract, BigInt(p.payoutId)); await adminApi.updatePayout(adminToken, p.payoutId, 'failed', 'REFUNDED', 'Refunded to your naira account.'); load() }
    catch (e) { setError(friendlyTxError(e)) } finally { setBusy('') }
  }

  return (
    <div>
      <div className="flex gap-1 mb-3 rounded-xl p-1 w-fit" style={{ background: 'var(--surface-muted)' }}>
        {(['processing', 'failed', 'paid'] as const).map(s => (
          <button key={s} onClick={() => setStatus(s)} className="rounded-lg px-3 py-1.5 text-sm font-semibold capitalize"
            style={{ background: status === s ? 'var(--chip)' : 'transparent', color: status === s ? 'var(--ink)' : 'var(--muted)' }}>{s}</button>
        ))}
      </div>
      {error && <p className="text-xs mb-2" style={{ color: 'var(--danger)' }}>{error}</p>}
      {list === null ? <Loader2 className="size-5 animate-spin" style={{ color: 'var(--accent)' }} />
        : list.length === 0 ? <p className="text-sm" style={{ color: 'var(--muted)' }}>Nothing here.</p>
        : (
          <div className="space-y-2">
            {list.map(p => (
              <div key={p.payoutId} className="rounded-2xl p-4 space-y-2" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
                <div className="flex justify-between gap-3 text-sm" style={{ color: 'var(--ink)' }}>
                  <b>#{p.payoutId} · {KIND_LABEL[p.kind]}</b>
                  <b className="tabular-nums">{formatNaira(BigInt(p.amount), { decimals: true })}</b>
                </div>
                <div className="text-sm" style={{ color: 'var(--ink)' }}>{payoutSummary(p.kind, p.details)}</div>
                {p.details.narration && <div className="text-xs" style={{ color: 'var(--muted)' }}>Narration: {p.details.narration}</div>}
                <div className="text-xs" style={{ color: 'var(--subtle)' }}>{p.contact} · {new Date(p.createdAt).toLocaleString()}{p.reference ? ` · ref ${p.reference}` : ''}{p.reason ? ` · ${p.reason}` : ''}</div>
                {status === 'processing' && (
                  <div className="flex gap-2">
                    <input value={refs[p.payoutId] ?? ''} onChange={e => setRefs(r => ({ ...r, [p.payoutId]: e.target.value }))} placeholder="Bank / partner reference"
                      className="flex-1 min-w-0 rounded-xl px-3 py-2 outline-none text-sm" style={input} />
                    <button onClick={() => { void mark(p, 'paid') }} disabled={!!busy} className="rounded-xl px-3 text-xs font-semibold text-white disabled:opacity-40" style={{ background: 'var(--success)' }}>Paid</button>
                    <button onClick={() => { void mark(p, 'failed') }} disabled={!!busy} className="rounded-xl px-3 text-xs font-semibold disabled:opacity-40" style={{ background: 'rgba(186,43,76,0.1)', color: 'var(--danger)' }}>Failed</button>
                  </div>
                )}
                {status === 'failed' && p.reference !== 'REFUNDED' && (
                  <button onClick={() => { void refund(p) }} disabled={!canRefund || !!busy}
                    className="rounded-xl px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 flex items-center gap-1.5" style={{ background: 'var(--accent)' }}>
                    {busy === p.payoutId && <Loader2 className="size-3.5 animate-spin" />} Refund naira on-chain
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>{label}</span>{children}</label>
}

function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}
      className="font-mono text-xs flex items-center gap-1" style={{ color: 'var(--muted)' }}>
      {text.slice(0, 8)}…{text.slice(-6)} {copied ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
    </button>
  )
}
