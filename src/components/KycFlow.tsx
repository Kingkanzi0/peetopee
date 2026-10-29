/**
 * KycFlow — ID verification. Required before you can sell in the Market or
 * register as a trader, so both sides of every P2P trade are verified.
 *
 * Submissions are reviewed on the admin page (#admin), or approved
 * automatically on test servers running with KYC_AUTO_APPROVE=1.
 */
import { useState, type ReactNode } from 'react'
import { ShieldCheck, Clock, XCircle, Camera, IdCard, Loader2, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { apiSubmitKyc, ApiError } from '../auth/ptpApi'
import { COUNTRIES } from '../contracts/peetopee'

const ID_TYPES = [
  { value: 'passport', label: 'International passport' },
  { value: 'national_id', label: 'National ID card' },
  { value: 'drivers_licence', label: "Driver's licence" },
  { value: 'voters_card', label: "Voter's card" },
  { value: 'residence_permit', label: 'Residence permit' },
]

/** Shrink a photo so uploads stay small (longest side 1600px, JPEG). */
export function downscale(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that photo.')) }
    img.src = url
  })
}

/** Shows `children` once the user is ID-verified; otherwise the verification flow. */
export function KycGate({ reason, children }: { reason: string; children: ReactNode }) {
  const { kycStatus, account } = useAuth()
  if (!account) {
    return (
      <div className="py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
        <Loader2 className="size-5 mx-auto mb-2 animate-spin" /> Checking your verification…
      </div>
    )
  }
  if (kycStatus === 'approved') return <>{children}</>
  return <KycFlow reason={reason} />
}

export function KycFlow({ reason }: { reason?: string }) {
  const { profile, kycStatus, account, refreshAccount } = useAuth()
  const [resubmit, setResubmit] = useState(false)
  const [fullName, setFullName] = useState(profile?.name ?? '')
  const [idType, setIdType] = useState('passport')
  const [idNumber, setIdNumber] = useState('')
  const [countryCode, setCountryCode] = useState(profile?.country?.code ?? 'NG')
  const [idImage, setIdImage] = useState('')
  const [selfie, setSelfie] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function pick(file: File | undefined, set: (v: string) => void) {
    if (!file) return
    try { set(await downscale(file)) } catch (e) { setError(e instanceof Error ? e.message : 'Could not read that photo.') }
  }

  async function submit() {
    setBusy(true)
    setError('')
    try {
      await apiSubmitKyc({ fullName: fullName.trim(), idType, idNumber: idNumber.trim(), countryCode, idImage, selfie })
      await refreshAccount()
      setResubmit(false)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not submit. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const header = (
    <div className="flex items-start gap-3 mb-5">
      <div className="size-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(29,78,216,0.1)' }}>
        <ShieldCheck className="size-6 text-blue-700" />
      </div>
      <div>
        <h2 className="text-lg font-bold display" style={{ color: 'var(--ink)' }}>Verify your identity</h2>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {reason ?? 'A valid ID is required for P2P trading, so every buyer and seller is a real, verified person.'}
        </p>
      </div>
    </div>
  )

  if (kycStatus === 'approved') {
    return (
      <div className="rounded-2xl p-5 flex items-center gap-3" style={{ background: 'rgba(26,128,71,0.06)', border: '1px solid rgba(26,128,71,0.2)' }}>
        <CheckCircle2 className="size-6 shrink-0" style={{ color: 'var(--success)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>Your ID is verified.</p>
      </div>
    )
  }

  if (kycStatus === 'pending' && !resubmit) {
    return (
      <div className="mx-auto max-w-lg px-4 py-4">
        {header}
        <div className="rounded-2xl p-5 flex items-start gap-3" style={{ background: 'var(--surface-muted)' }}>
          <Clock className="size-5 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>We're reviewing your ID</p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>This usually takes less than a day. You can keep using Send and Wallet meanwhile.</p>
            <button onClick={() => { void refreshAccount() }} className="mt-3 text-xs font-semibold" style={{ color: 'var(--accent)' }}>Check again</button>
          </div>
        </div>
      </div>
    )
  }

  if (kycStatus === 'rejected' && !resubmit) {
    return (
      <div className="mx-auto max-w-lg px-4 py-4">
        {header}
        <div className="rounded-2xl p-5 flex items-start gap-3" style={{ background: 'rgba(186,43,76,0.06)', border: '1px solid rgba(186,43,76,0.2)' }}>
          <XCircle className="size-5 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>Your ID wasn't approved</p>
            {account?.kyc.reason && <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{account.kyc.reason}</p>}
            <button onClick={() => setResubmit(true)} className="mt-3 text-xs font-semibold" style={{ color: 'var(--accent)' }}>Try again</button>
          </div>
        </div>
      </div>
    )
  }

  const valid = fullName.trim().length >= 3 && idNumber.trim().length >= 4 && idImage && selfie
  const input = 'w-full rounded-xl px-3 py-2.5 outline-none'
  const inputStyle = { background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 16 }

  return (
    <div className="mx-auto max-w-lg px-4 py-4 space-y-4">
      {header}

      <Field label="Full name (as on your ID)">
        <input value={fullName} onChange={e => setFullName(e.target.value)} className={input} style={inputStyle} autoComplete="name" />
      </Field>
      <div className="flex gap-3">
        <Field label="ID type">
          <select value={idType} onChange={e => setIdType(e.target.value)} className={input} style={inputStyle}>
            {ID_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Issuing country">
          <select value={countryCode} onChange={e => setCountryCode(e.target.value)} className={input} style={inputStyle}>
            {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="ID number">
        <input value={idNumber} onChange={e => setIdNumber(e.target.value)} className={input} style={inputStyle} autoCapitalize="characters" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <PhotoPicker label="Photo of your ID" icon={<IdCard className="size-6" />} value={idImage} capture="environment"
          onPick={f => { void pick(f, setIdImage) }} />
        <PhotoPicker label="Selfie" icon={<Camera className="size-6" />} value={selfie} capture="user"
          onPick={f => { void pick(f, setSelfie) }} />
      </div>
      <p className="text-xs" style={{ color: 'var(--subtle)' }}>
        Your ID and selfie are encrypted and only seen by the Peetopee review team. They're never shared with other users.
      </p>

      {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
      <button onClick={() => { void submit() }} disabled={!valid || busy}
        className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40"
        style={{ background: 'var(--accent)' }}>
        {busy ? <><Loader2 className="size-4 animate-spin" /> Submitting…</> : 'Submit for verification'}
      </button>
    </div>
  )
}

function PhotoPicker({ label, icon, value, capture, onPick }: {
  label: string; icon: ReactNode; value: string; capture: 'user' | 'environment'; onPick: (f: File | undefined) => void
}) {
  return (
    <label className="rounded-2xl overflow-hidden flex flex-col items-center justify-center text-center cursor-pointer aspect-[4/3]"
      style={{ background: 'var(--surface-muted)', border: `1.5px dashed ${value ? 'var(--success)' : 'var(--border)'}` }}>
      {value
        ? <img src={value} alt={label} className="w-full h-full object-cover" />
        : (
          <span className="flex flex-col items-center gap-1.5 px-2" style={{ color: 'var(--muted)' }}>
            {icon}
            <span className="text-xs font-semibold">{label}</span>
            <span className="text-[11px]" style={{ color: 'var(--subtle)' }}>Tap to take or upload</span>
          </span>
        )}
      <input type="file" accept="image/*" capture={capture} className="hidden" onChange={e => onPick(e.target.files?.[0])} />
    </label>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex-1 min-w-0">
      <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--muted)' }}>{label}</label>
      {children}
    </div>
  )
}
