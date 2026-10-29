/**
 * DisputeEvidence — both sides of a disputed trade explain what happened and
 * attach proof (e.g. a bank transfer receipt). The Peetopee admin reviews it on
 * the #admin page and decides who gets the escrowed USDC.
 */
import { useEffect, useState } from 'react'
import { Camera, Loader2, Send } from 'lucide-react'
import { apiAddEvidence, apiListEvidence, ApiError, type Evidence } from '../auth/ptpApi'
import { downscale } from './KycFlow'

export function EvidenceList({ evidence, me }: { evidence: Evidence[]; me?: 'seller' | 'trader' }) {
  if (evidence.length === 0) {
    return <p className="text-xs" style={{ color: 'var(--muted)' }}>No evidence yet.</p>
  }
  return (
    <div className="space-y-2">
      {evidence.map(e => (
        <div key={e.id} className="rounded-xl p-3" style={{ background: e.role === me ? 'rgba(29,78,216,0.06)' : 'var(--surface-muted)' }}>
          <div className="text-[11px] font-semibold mb-1 uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>
            {e.role === me ? 'You' : e.role === 'seller' ? 'Seller' : 'Trader'} · {new Date(e.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
          {e.text && <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink)' }}>{e.text}</p>}
          {e.image && (
            <a href={e.image} target="_blank" rel="noopener noreferrer">
              <img src={e.image} alt="Evidence" className="mt-2 rounded-lg max-h-64 object-contain" style={{ background: '#111' }} />
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

export function DisputeEvidence({ tradeId, role }: { tradeId: bigint; role: 'seller' | 'trader' }) {
  const [evidence, setEvidence] = useState<Evidence[] | null>(null)
  const [text, setText] = useState('')
  const [image, setImage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    try { setEvidence(await apiListEvidence(tradeId)) } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load evidence.')
    }
  }
  useEffect(() => {
    void load()
    const t = setInterval(() => { void load() }, 15_000)
    return () => clearInterval(t)
  }, [tradeId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    setBusy(true)
    setError('')
    try {
      await apiAddEvidence(tradeId, text.trim(), image || undefined)
      setText('')
      setImage('')
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-4 rounded-2xl p-4" style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}>
      <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--subtle)' }}>Dispute evidence</div>
      <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
        {role === 'trader'
          ? 'Explain what happened and add a screenshot of your bank transfer receipt.'
          : "Explain what happened, e.g. that no money arrived, and add a screenshot of your bank statement if you can."}{' '}
        A Peetopee admin reviews both sides and releases the USDC to whoever is right.
      </p>

      {evidence === null ? <Loader2 className="size-4 animate-spin" style={{ color: 'var(--muted)' }} /> : <EvidenceList evidence={evidence} me={role} />}

      <div className="mt-3 space-y-2">
        <textarea rows={2} value={text} maxLength={1000} onChange={e => setText(e.target.value)} placeholder="What happened?"
          className="w-full rounded-xl p-3 outline-none resize-none"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 16 }} />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}>
            <Camera className="size-4" /> {image ? 'Photo added' : 'Add photo'}
            <input type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) downscale(f).then(setImage).catch(() => setError('Could not read that photo.')) }} />
          </label>
          {image && <img src={image} alt="" className="size-9 rounded-lg object-cover" />}
          <button onClick={() => { void submit() }} disabled={busy || (!text.trim() && !image)}
            className="ml-auto rounded-xl px-4 py-2 text-sm font-semibold text-white flex items-center gap-1.5 disabled:opacity-40"
            style={{ background: 'var(--accent)' }}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send
          </button>
        </div>
        {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>
    </div>
  )
}
