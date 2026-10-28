/**
 * AdminKyc — review ID submissions. Open the app with #admin at the end of the URL.
 * Needs the server's ADMIN_TOKEN (kept only in this browser tab's memory).
 */
import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, Loader2, Check, X, ArrowLeft } from 'lucide-react'
import { adminApi, ApiError, type KycStatus, type KycSubmission } from '../auth/ptpApi'
import { AdminDisputes } from './AdminDisputes'

export function AdminKyc({ onExit }: { onExit: () => void }) {
  const [token, setToken] = useState('')
  const [authed, setAuthed] = useState(false)
  const [status, setStatus] = useState<KycStatus>('pending')
  const [list, setList] = useState<KycSubmission[]>([])
  const [open, setOpen] = useState<KycSubmission | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [section, setSection] = useState<'ids' | 'disputes'>('ids')

  const load = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      setList(await adminApi.list(token, status))
      setAuthed(true)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load submissions.')
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) setAuthed(false)
    } finally {
      setBusy(false)
    }
  }, [token, status])

  useEffect(() => { if (authed) void load() }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  async function openOne(id: number) {
    setBusy(true)
    try { setOpen(await adminApi.get(token, id)); setReason('') } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not open submission.')
    } finally { setBusy(false) }
  }

  async function decide(decision: 'approved' | 'rejected') {
    if (!open) return
    if (decision === 'rejected' && !reason.trim()) { setError('Add a reason so the user knows what to fix.'); return }
    setBusy(true)
    try {
      await adminApi.review(token, open.id, decision, reason.trim())
      setOpen(null)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save decision.')
    } finally { setBusy(false) }
  }

  const input = { background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 16 }

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <button onClick={onExit} className="flex items-center gap-1.5 text-sm mb-4" style={{ color: 'var(--muted)' }}>
          <ArrowLeft className="size-4" /> Back to app
        </button>
        <h1 className="text-2xl font-bold display mb-1 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
          <ShieldCheck className="size-6" /> Peetopee admin
        </h1>
        <p className="text-sm mb-5" style={{ color: 'var(--muted)' }}>Review ID submissions and decide disputed trades.</p>

        {!authed ? (
          <div className="max-w-sm space-y-3">
            <input type="password" placeholder="Admin token" value={token} onChange={e => setToken(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void load() }}
              className="w-full rounded-xl px-3 py-2.5 outline-none" style={input} />
            <button onClick={() => { void load() }} disabled={!token || busy}
              className="w-full rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>
              {busy ? 'Checking…' : 'Open'}
            </button>
            {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
          </div>
        ) : section === 'disputes' ? (
          <div>
            <SectionTabs section={section} setSection={setSection} />
            <AdminDisputes adminToken={token} />
          </div>
        ) : open ? (
          <div className="space-y-4">
            <button onClick={() => setOpen(null)} className="text-sm" style={{ color: 'var(--accent)' }}>← All submissions</button>
            <div className="rounded-2xl p-4 grid gap-1 text-sm" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', color: 'var(--ink)' }}>
              <div><b>{open.full_name}</b> {open.ptp_id && <span className="font-mono text-xs" style={{ color: 'var(--muted)' }}>{open.ptp_id}</span>}</div>
              <div style={{ color: 'var(--muted)' }}>{open.contact}</div>
              <div>{open.id_type.replace(/_/g, ' ')} · {open.id_number} · {open.country_code}</div>
              <div className="text-xs" style={{ color: 'var(--subtle)' }}>Submitted {new Date(open.submitted_at).toLocaleString()} · status {open.status}</div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {[['ID document', open.id_image], ['Selfie', open.selfie]].map(([label, src]) => (
                <figure key={label} className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <img src={src} alt={label} className="w-full object-contain max-h-[420px]" style={{ background: '#111' }} />
                  <figcaption className="text-xs px-3 py-2" style={{ color: 'var(--muted)' }}>{label}</figcaption>
                </figure>
              ))}
            </div>
            <input placeholder="Reason (required to reject, shown to the user)" value={reason} onChange={e => setReason(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 outline-none" style={input} />
            {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => { void decide('rejected') }} disabled={busy}
                className="flex-1 rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-1.5" style={{ background: 'rgba(186,43,76,0.1)', color: 'var(--danger)' }}>
                <X className="size-4" /> Reject
              </button>
              <button onClick={() => { void decide('approved') }} disabled={busy}
                className="flex-1 rounded-xl py-3 text-sm font-semibold text-white flex items-center justify-center gap-1.5" style={{ background: 'var(--success)' }}>
                <Check className="size-4" /> Approve
              </button>
            </div>
          </div>
        ) : (
          <div>
            <SectionTabs section={section} setSection={setSection} />
            <div className="flex gap-1 mb-4 rounded-xl p-1 w-fit" style={{ background: 'var(--surface-muted)' }}>
              {(['pending', 'approved', 'rejected'] as KycStatus[]).map(s => (
                <button key={s} onClick={() => setStatus(s)} className="rounded-lg px-3 py-1.5 text-sm font-semibold capitalize"
                  style={{ background: status === s ? 'white' : 'transparent', color: status === s ? 'var(--ink)' : 'var(--muted)' }}>
                  {s}
                </button>
              ))}
            </div>
            {busy && <Loader2 className="size-5 animate-spin" style={{ color: 'var(--accent)' }} />}
            {!busy && list.length === 0 && <p className="text-sm" style={{ color: 'var(--muted)' }}>Nothing here.</p>}
            <div className="space-y-2">
              {list.map(s => (
                <button key={s.id} onClick={() => { void openOne(s.id) }}
                  className="w-full text-left rounded-2xl p-4 flex items-center justify-between gap-3"
                  style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{s.full_name}</div>
                    <div className="text-xs truncate" style={{ color: 'var(--muted)' }}>{s.ptp_id ?? s.contact} · {s.id_type.replace(/_/g, ' ')} · {s.country_code}</div>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: 'var(--subtle)' }}>{new Date(s.submitted_at).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
            {error && <p className="text-xs mt-3" style={{ color: 'var(--danger)' }}>{error}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

function SectionTabs({ section, setSection }: { section: 'ids' | 'disputes'; setSection: (s: 'ids' | 'disputes') => void }) {
  return (
    <div className="flex gap-2 mb-5">
      {([['ids', 'ID review'], ['disputes', 'Disputes']] as const).map(([k, label]) => (
        <button key={k} onClick={() => setSection(k)} className="rounded-xl px-4 py-2 text-sm font-semibold"
          style={{ background: section === k ? 'var(--accent)' : 'var(--surface-muted)', color: section === k ? 'white' : 'var(--ink)' }}>
          {label}
        </button>
      ))}
    </div>
  )
}
