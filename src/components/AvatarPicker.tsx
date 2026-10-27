/**
 * AvatarPicker — lets the user set a profile photo.
 * Tapping the circle opens a hidden <input type="file" accept="image/*" capture="user">
 * which triggers the camera on mobile or the file picker on desktop.
 * The selected image is cropped to a square, downscaled to 256×256, and
 * returned as a base64 data URL.
 */
import { useRef, useState, useCallback } from 'react'
import { Camera } from 'lucide-react'

interface AvatarPickerProps {
  name: string
  dataUrl?: string
  onChange: (dataUrl: string) => void
  size?: number
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

const AVATAR_SIZE = 256

function cropAndScale(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const { width, height } = img
      const side = Math.min(width, height)
      const sx = (width - side) / 2
      const sy = (height - side) / 2
      const canvas = document.createElement('canvas')
      canvas.width = AVATAR_SIZE
      canvas.height = AVATAR_SIZE
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    img.src = url
  })
}

export function AvatarPicker({ name, dataUrl, onChange, size = 88 }: AvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const initials = getInitials(name)

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const dataUrl = await cropAndScale(file)
      onChange(dataUrl)
    } catch {
      // ignore — user can retry
    } finally {
      setBusy(false)
      // reset input so same file can be picked again
      if (inputRef.current) inputRef.current.value = ''
    }
  }, [onChange])

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="relative rounded-full overflow-hidden transition-all active:scale-95 focus:outline-none"
        style={{ width: size, height: size, flexShrink: 0 }}
        aria-label="Set profile photo"
      >
        {/* Avatar or initials */}
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="Profile"
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center font-bold select-none"
            style={{
              background: 'linear-gradient(135deg, #122d45 0%, #6c3fc5 100%)',
              color: 'white',
              fontSize: size * 0.36,
            }}
          >
            {initials || '?'}
          </div>
        )}

        {/* Camera overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 active:opacity-100 transition-opacity"
          style={{ background: 'rgba(0,0,0,0.45)' }}
        >
          {busy ? (
            <div className="size-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <Camera className="size-5 text-white" />
          )}
        </div>

        {/* Small badge */}
        <div
          className="absolute bottom-1 right-1 rounded-full flex items-center justify-center shadow-md"
          style={{ width: size * 0.28, height: size * 0.28, background: 'var(--accent)' }}
        >
          <Camera style={{ width: size * 0.14, height: size * 0.14, color: 'white' }} />
        </div>
      </button>

      <span className="text-xs" style={{ color: 'var(--subtle)' }}>
        Tap to {dataUrl ? 'change' : 'add'} photo
      </span>

      {/* Hidden file input — no capture= so the OS shows "Camera / Gallery / Files" sheet */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={e => { void handleFile(e) }}
        tabIndex={-1}
      />
    </div>
  )
}
