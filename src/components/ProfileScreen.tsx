/**
 * ProfileScreen — full profile + Peetopee ID management.
 * Accessible from the avatar in WalletBar.
 */
import { useState } from 'react'
import {
  ChevronRight, LogOut, Globe, Bell, Shield, ChevronLeft,
  Copy, CheckCircle2, AtSign, Share2, Edit2, X, Check,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { AvatarPicker } from './AvatarPicker'
import { COUNTRIES } from '../contracts/peetopee'
import {
  getMyPtpId, lookupByEmail, updateHandle,
} from '../auth/peetopeeId'

interface ProfileScreenProps {
  onBack: () => void
}

export function ProfileScreen({ onBack }: ProfileScreenProps) {
  const { profile, updateProfile, signOut } = useAuth()
  const [editName, setEditName] = useState(profile?.name ?? '')
  const [saved, setSaved] = useState(false)
  const [showCountry, setShowCountry] = useState(false)
  const [query, setQuery] = useState('')

  // Peetopee ID state
  const contact = profile?.email || profile?.phone || 'user'
  const record = profile ? lookupByEmail(contact) : null
  const myPtpId = record?.ptpId ?? getMyPtpId() ?? '@—'
  const [editingHandle, setEditingHandle] = useState(false)
  const [handleInput, setHandleInput] = useState(myPtpId.replace('@', ''))
  const [handleError, setHandleError] = useState('')
  const [handleSaved, setHandleSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!profile) return null

  const filtered = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.currency.toLowerCase().includes(query.toLowerCase())
  )

  function handleSaveName() {
    if (editName.trim().length < 2) return
    updateProfile({ name: editName.trim() })
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
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

  function saveHandle() {
    const raw = handleInput.trim().replace('@', '').toLowerCase()
    if (raw.length < 3) { setHandleError('Handle must be at least 3 characters'); return }
    if (!/^[a-z0-9_]+$/.test(raw)) { setHandleError('Letters, numbers and _ only'); return }
    const ok = updateHandle(contact, raw)
    if (!ok) { setHandleError('That handle is already taken'); return }
    setHandleError('')
    setEditingHandle(false)
    setHandleSaved(true)
    setTimeout(() => setHandleSaved(false), 2000)
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
          onClick={handleSaveName}
          disabled={editName.trim() === profile.name || editName.trim().length < 2}
          className="text-sm font-semibold px-3 py-1.5 rounded-xl disabled:opacity-40 transition-all active:scale-95"
          style={{ color: saved ? 'var(--success)' : 'var(--accent)', background: 'var(--surface-muted)' }}
        >
          {saved ? 'Saved ✓' : 'Save'}
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
            dataUrl={profile.avatarDataUrl}
            onChange={dataUrl => updateProfile({ avatarDataUrl: dataUrl })}
            size={96}
          />
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
                    onClick={saveHandle}
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
          {[
            { icon: Bell, label: 'Notifications', sub: 'Trade alerts and updates' },
            { icon: Shield, label: 'Security', sub: 'PIN and biometrics' },
          ].map(({ icon: Icon, label, sub }, i) => (
            <button
              key={label}
              className="w-full px-4 py-3.5 flex items-center gap-3 active:opacity-70 transition-all"
              style={{
                background: 'var(--surface-strong)',
                borderBottom: i === 0 ? '1px solid var(--border)' : 'none',
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
