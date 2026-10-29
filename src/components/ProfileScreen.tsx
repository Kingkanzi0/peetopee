/**
 * ProfileScreen — full profile + Peetopee ID management.
 * Accessible from the avatar in WalletBar.
 */
import { useState } from 'react'
import {
  ChevronRight, LogOut, Globe, Bell, Shield, ChevronLeft,
  Copy, CheckCircle2, AtSign, Share2, Edit2, X, Check, Palette,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { AvatarPicker } from './AvatarPicker'
import { COUNTRIES } from '../contracts/peetopee'
import { ApiError } from '../auth/ptpApi'
import { KycFlow } from './KycFlow'
import { useTheme, type ThemePref } from '../theme/theme'
import { notifyStatus, enableNotifications, disableNotifications, type NotifyStatus } from '../notify/notify'

interface ProfileScreenProps {
  onBack: () => void
}

export function ProfileScreen({ onBack }: ProfileScreenProps) {
  const { profile, updateProfile, saveProfileNow, signOut, changePtpId } = useAuth()
  const [editName, setEditName] = useState(profile?.name ?? '')
  const [saved, setSaved] = useState(false)
  // A newly picked photo is shown right away but only kept once you tap Save.
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showCountry, setShowCountry] = useState(false)
  const [query, setQuery] = useState('')

  // Peetopee ID state
  const myPtpId = profile?.ptpId ?? '@—'
  const [editingHandle, setEditingHandle] = useState(false)
  const [handleInput, setHandleInput] = useState(myPtpId.replace('@', ''))
  const [handleError, setHandleError] = useState('')
  const [handleSaved, setHandleSaved] = useState(false)
  const [handleBusy, setHandleBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!profile) return null

  const filtered = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.currency.toLowerCase().includes(query.toLowerCase())
  )

  const nameChanged = editName.trim() !== profile.name && editName.trim().length >= 2
  const canSave = (nameChanged || !!pendingPhoto) && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setSaveError('')
    try {
      await saveProfileNow({
        ...(nameChanged ? { name: editName.trim() } : {}),
        ...(pendingPhoto ? { avatarDataUrl: pendingPhoto } : {}),
      })
      setPendingPhoto(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : "Couldn't save. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  function copyPtpId() {
    void navigator.clipboard.writeText(myPtpId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function sharePtpId() {
    if (navigator.share) {
      void navigator.share({
        title: 'My Peetopee ID',
        text: `Send me money on Peetopee! My ID is ${myPtpId}`,
      })
    } else {
      copyPtpId()
    }
  }

  async function saveHandle() {
    const raw = handleInput.trim().replace('@', '').toLowerCase()
    if (raw.length < 3 || raw.length > 20) { setHandleError('Use 3–20 characters'); return }
    if (!/^[a-z0-9_]+$/.test(raw)) { setHandleError('Letters, numbers and _ only'); return }
    setHandleBusy(true)
    try {
      await changePtpId(`@${raw}`)
      setHandleError('')
      setEditingHandle(false)
      setHandleSaved(true)
      setTimeout(() => setHandleSaved(false), 2000)
    } catch (e) {
      setHandleError(e instanceof ApiError ? e.message : 'Could not save. Try again.')
    } finally {
      setHandleBusy(false)
    }
  }

  const contactDisplay = profile.contactMethod === 'phone'
    ? profile.phone ?? profile.email
    : profile.email

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg-gradient)' }}>

      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-4 shrink-0"
        style={{
          paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <button
          onClick={onBack}
          className="size-9 rounded-full flex items-center justify-center active:scale-95 transition-all"
          style={{ background: 'var(--surface-muted)' }}
        >
          <ChevronLeft className="size-5" style={{ color: 'var(--ink)' }} />
        </button>
        <h1 className="text-base font-bold flex-1" style={{ color: 'var(--ink)' }}>Profile</h1>
        <button
          onClick={() => { void handleSave() }}
          disabled={!canSave}
          className="text-sm font-semibold px-3 py-1.5 rounded-xl disabled:opacity-40 transition-all active:scale-95"
          style={{ color: saved ? 'var(--success)' : 'var(--accent)', background: 'var(--surface-muted)' }}
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto px-4 py-6 space-y-5"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      >

        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-4 py-4">
          <AvatarPicker
            name={profile.name}
            dataUrl={pendingPhoto ?? profile.avatarDataUrl}
            onChange={dataUrl => { setPendingPhoto(dataUrl); setSaveError('') }}
            size={96}
          />
          {pendingPhoto && (
            <div className="flex gap-2">
              <button onClick={() => { void handleSave() }} disabled={saving}
                className="rounded-xl px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--accent)' }}>
                {saving ? 'Saving…' : 'Save photo'}
              </button>
              <button onClick={() => setPendingPhoto(null)} disabled={saving}
                className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}>
                Cancel
              </button>
            </div>
          )}
          {saved && !pendingPhoto && <p className="text-xs font-semibold" style={{ color: 'var(--success)' }}>Saved ✓ — people now see your new photo.</p>}
          {saveError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{saveError}</p>}
          <input
            type="text"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            className="text-center text-xl font-bold w-full max-w-xs rounded-2xl px-4 py-2.5 outline-none"
            style={{
              background: 'transparent',
              border: '1.5px solid var(--border)',
              color: 'var(--ink)',
              fontSize: 20,
            }}
            placeholder="Your name"
          />
        </div>

        {/* ───── PEETOPEE ID CARD ───── */}
        <div
          className="rounded-3xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #122d45 0%, #1a4d7a 100%)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* ID header */}
          <div className="px-5 pt-5 pb-3 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div
                className="size-8 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.12)' }}
              >
                <AtSign className="size-4 text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white/60 uppercase tracking-wide">Peetopee ID</p>
                <p className="text-xs text-white/40 mt-0.5">Your universal payment identifier</p>
              </div>
            </div>
            <span
              className="text-xs px-2 py-1 rounded-full font-semibold"
              style={{ background: 'rgba(26,200,100,0.18)', color: '#4ade80' }}
            >
              Active
            </span>
          </div>

          {/* Handle display / edit */}
          <div className="px-5 pb-4">
            {editingHandle ? (
              <div className="space-y-2">
                <div
                  className="flex items-center rounded-2xl overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.2)' }}
                >
                  <span className="pl-4 pr-1 text-white/50 text-lg font-semibold">@</span>
                  <input
                    autoFocus
                    type="text"
                    value={handleInput}
                    onChange={e => { setHandleInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')); setHandleError('') }}
                    className="flex-1 py-3 pr-3 bg-transparent outline-none text-white font-semibold text-lg"
                    style={{ fontSize: 18 }}
                    placeholder="yourhandle"
                    maxLength={20}
                  />
                  <button
                    onClick={() => { setEditingHandle(false); setHandleError('') }}
                    className="px-3 py-3 active:opacity-70"
                  >
                    <X className="size-4 text-white/50" />
                  </button>
                  <button
                    onClick={() => { void saveHandle() }}
                    disabled={handleBusy}
                    className="px-4 py-3 active:opacity-70"
                    style={{ color: '#60a5fa' }}
                  >
                    <Check className="size-4" />
                  </button>
                </div>
                {handleError && (
                  <p className="text-xs px-1" style={{ color: '#f87171' }}>{handleError}</p>
                )}
                <p className="text-xs px-1 text-white/40">
                  3–20 characters. Letters, numbers and _ only.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p
                    className="text-3xl font-black tracking-tight"
                    style={{ color: handleSaved ? '#4ade80' : 'white' }}
                  >
                    {handleSaved ? '✓ Saved!' : myPtpId}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    Others can send you money using this ID
                  </p>
                </div>
                <button
                  onClick={() => { setEditingHandle(true); setHandleInput(myPtpId.replace('@', '')) }}
                  className="size-9 rounded-xl flex items-center justify-center active:scale-95 transition-all"
                  style={{ background: 'rgba(255,255,255,0.1)' }}
                  title="Edit handle"
                >
                  <Edit2 className="size-4 text-white/70" />
                </button>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div
            className="grid grid-cols-2 divide-x"
            style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
          >
            <button
              onClick={copyPtpId}
              className="flex items-center justify-center gap-2 py-3.5 active:opacity-70 transition-all"
              style={{ color: copied ? '#4ade80' : 'rgba(255,255,255,0.7)' }}
            >
              {copied ? <CheckCircle2 className="size-4" /> : <Copy className="size-4" />}
              <span className="text-sm font-semibold">{copied ? 'Copied!' : 'Copy ID'}</span>
            </button>
            <button
              onClick={sharePtpId}
              className="flex items-center justify-center gap-2 py-3.5 active:opacity-70 transition-all"
              style={{ color: 'rgba(255,255,255,0.7)' }}
            >
              <Share2 className="size-4" />
              <span className="text-sm font-semibold">Share</span>
            </button>
          </div>
        </div>

        {/* How to use */}
        <div
          className="rounded-2xl px-4 py-3.5 space-y-2"
          style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--subtle)' }}>How to use your Peetopee ID</p>
          {[
            { icon: '💸', text: 'Share your ID — anyone on Peetopee can send you local currency instantly.' },
            { icon: '🏦', text: 'Go to Send → Peetopee User and enter their @handle or email.' },
            { icon: '🌍', text: 'Works in any supported country — NGN, VND, EUR and more.' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-start gap-2.5">
              <span className="text-base shrink-0 mt-0.5">{icon}</span>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--subtle)' }}>{text}</p>
            </div>
          ))}
        </div>

        {/* ID verification */}
        <div>
          <p className="text-xs font-semibold mb-2 px-1 uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>ID verification</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}>
            <KycFlow reason="Needed to sell USDC or become a trader." />
          </div>
        </div>

        {/* Contact info */}
        <div className="rounded-3xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div
            className="px-4 py-3.5 flex items-center justify-between"
            style={{ background: 'var(--surface-strong)', borderBottom: '1px solid var(--border)' }}
          >
            <div>
              <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--subtle)' }}>
                {profile.contactMethod === 'phone' ? 'PHONE NUMBER' : 'EMAIL ADDRESS'}
              </p>
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{contactDisplay}</p>
            </div>
            <span
              className="text-xs px-2 py-1 rounded-full font-semibold"
              style={{ background: 'rgba(26,128,71,0.1)', color: 'var(--success)' }}
            >
              Verified
            </span>
          </div>

          <button
            onClick={() => setShowCountry(!showCountry)}
            className="w-full px-4 py-3.5 flex items-center justify-between active:opacity-70 transition-all"
            style={{ background: 'var(--surface-strong)' }}
          >
            <div className="flex items-center gap-3">
              <Globe className="size-4" style={{ color: 'var(--subtle)' }} />
              <div className="text-left">
                <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--subtle)' }}>COUNTRY</p>
                <div className="flex items-center gap-2">
                  <img
                    src={`https://flagcdn.com/w40/${profile.country.code.toLowerCase()}.png`}
                    alt={profile.country.name}
                    width={18} height={13}
                    className="rounded-sm object-cover"
                  />
                  <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    {profile.country.name} · {profile.country.currency}
                  </span>
                </div>
              </div>
            </div>
            <ChevronRight
              className="size-4 transition-transform"
              style={{ color: 'var(--subtle)', transform: showCountry ? 'rotate(90deg)' : '' }}
            />
          </button>

          {showCountry && (
            <div className="px-4 pb-4 pt-2" style={{ background: 'var(--surface-muted)' }}>
              <input
                type="text"
                placeholder="Search..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none mb-3"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)', fontSize: 16 }}
              />
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {filtered.map(country => (
                  <button
                    key={country.code}
                    onClick={() => { updateProfile({ country }); setShowCountry(false) }}
                    className="w-full rounded-xl px-3 py-2.5 flex items-center gap-3 text-left transition-all active:scale-[0.98]"
                    style={{
                      background: profile.country.code === country.code ? 'var(--accent)' : 'var(--surface)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <img src={`https://flagcdn.com/w40/${country.code.toLowerCase()}.png`} alt="" width={18} height={13} className="rounded-sm" />
                    <span className="text-sm font-medium" style={{ color: profile.country.code === country.code ? 'white' : 'var(--ink)' }}>
                      {country.name}
                    </span>
                    <span className="ml-auto text-xs" style={{ color: profile.country.code === country.code ? 'rgba(255,255,255,0.7)' : 'var(--subtle)' }}>
                      {country.currency}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Settings */}
        <div className="rounded-3xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <AppearanceRow />
          <NotificationsRow />
          {[
            { icon: Shield, label: 'Security', sub: 'PIN and biometrics' },
          ].map(({ icon: Icon, label, sub }) => (
            <button
              key={label}
              className="w-full px-4 py-3.5 flex items-center gap-3 active:opacity-70 transition-all"
              style={{
                background: 'var(--surface-strong)',
              }}
            >
              <Icon className="size-4 shrink-0" style={{ color: 'var(--subtle)' }} />
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{label}</p>
                <p className="text-xs" style={{ color: 'var(--subtle)' }}>{sub}</p>
              </div>
              <ChevronRight className="size-4" style={{ color: 'var(--subtle)' }} />
            </button>
          ))}
        </div>

        {/* Sign out */}
        <button
          onClick={signOut}
          className="w-full rounded-3xl py-4 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          style={{ background: 'rgba(186,43,76,0.08)', border: '1px solid rgba(186,43,76,0.15)', color: 'var(--danger)' }}
        >
          <LogOut className="size-4" />
          <span className="text-sm font-semibold">Sign out</span>
        </button>
      </div>
    </div>
  )
}

/** Turn "You received USDC" and trade alerts on or off on this device. */
function NotificationsRow() {
  const [status, setStatus] = useState<NotifyStatus>(() => notifyStatus())
  const [busy, setBusy] = useState(false)
  const sub = {
    on: 'On — payments received and trade updates',
    off: 'Off — tap to get alerts when you receive money',
    blocked: 'Blocked in your browser settings — allow notifications for this site',
    unsupported: "This browser can't show notifications (alerts still appear in the app)",
  }[status]
  async function toggle() {
    if (status === 'on') { disableNotifications(); setStatus('off'); return }
    if (status === 'unsupported') return
    setBusy(true)
    try { setStatus(await enableNotifications()) } finally { setBusy(false) }
  }
  return (
    <button onClick={() => { void toggle() }} disabled={busy}
      className="w-full px-4 py-3.5 flex items-center gap-3 active:opacity-70 transition-all"
      style={{ background: 'var(--surface-strong)', borderBottom: '1px solid var(--border)' }}>
      <Bell className="size-4 shrink-0" style={{ color: status === 'on' ? 'var(--accent)' : 'var(--subtle)' }} />
      <div className="flex-1 text-left">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Notifications</p>
        <p className="text-xs" style={{ color: status === 'blocked' ? 'var(--danger)' : 'var(--subtle)' }}>{sub}</p>
      </div>
      <span className="relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors"
        style={{ background: status === 'on' ? 'var(--accent)' : 'var(--border)' }}>
        <span className="absolute top-0.5 size-5 rounded-full bg-white shadow transition-all" style={{ left: status === 'on' ? 22 : 2 }} />
      </span>
    </button>
  )
}

/** Light, dark, or follow the phone's setting. */
function AppearanceRow() {
  const { pref, setPref } = useTheme()
  const options: [ThemePref, string][] = [['light', 'Light'], ['dark', 'Dark'], ['system', 'Auto']]
  return (
    <div className="w-full px-4 py-3.5 flex items-center gap-3" style={{ background: 'var(--surface-strong)', borderBottom: '1px solid var(--border)' }}>
      <Palette className="size-4 shrink-0" style={{ color: 'var(--subtle)' }} />
      <div className="flex-1 text-left">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Appearance</p>
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>{pref === 'system' ? 'Follows your phone' : pref === 'dark' ? 'Dark mode' : 'Light mode'}</p>
      </div>
      <div className="flex rounded-xl p-0.5 shrink-0" style={{ background: 'var(--surface-muted)' }}>
        {options.map(([value, label]) => (
          <button key={value} onClick={() => setPref(value)} className="rounded-lg px-2.5 py-1 text-xs font-semibold"
            style={{ background: pref === value ? 'var(--chip)' : 'transparent', color: pref === value ? 'var(--ink)' : 'var(--muted)' }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
