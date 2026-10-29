/**
 * Light / dark mode.
 *
 * The choice ("light", "dark" or "system") is kept on this device. The active
 * theme is set as data-theme on <html>; src/index.css swaps the colour
 * variables. index.html applies the saved choice before the app loads, so the
 * page never flashes the wrong colours.
 */
import { useSyncExternalStore } from 'react'

export type ThemePref = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

const KEY = 'ptp_theme'
const listeners = new Set<() => void>()
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch { return 'system' }
}

function resolve(pref: ThemePref): Theme {
  if (pref === 'system') return media?.matches ? 'dark' : 'light'
  return pref
}

let pref: ThemePref = readPref()
let snapshot = { pref, theme: resolve(pref) }

function apply() {
  snapshot = { pref, theme: resolve(pref) }
  const root = document.documentElement
  root.dataset.theme = snapshot.theme
  root.style.colorScheme = snapshot.theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', snapshot.theme === 'dark' ? '#0b1220' : '#122d45')
  listeners.forEach(fn => fn())
}

media?.addEventListener?.('change', () => { if (pref === 'system') apply() })

export function setThemePref(next: ThemePref) {
  pref = next
  try {
    if (next === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, next)
  } catch { /* storage blocked: still switch for this visit */ }
  apply()
}

export function initTheme() { apply() }

export function useTheme() {
  const s = useSyncExternalStore(
    fn => { listeners.add(fn); return () => { listeners.delete(fn) } },
    () => snapshot,
  )
  return {
    pref: s.pref,
    theme: s.theme,
    setPref: setThemePref,
    toggle: () => setThemePref(s.theme === 'dark' ? 'light' : 'dark'),
  }
}
