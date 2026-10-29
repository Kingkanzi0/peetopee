/**
 * Notifications — in-app toasts plus phone/desktop notifications.
 *
 * System notifications go through the service worker (public/sw.js) because
 * Android Chrome doesn't allow `new Notification()` from a page. They show while
 * Peetopee is open or in the background; alerts when the app is fully closed
 * would need Web Push from the server (a later step).
 */
import { toast } from 'sonner'

const PREF_KEY = 'ptp_notify_enabled'
let swReg: Promise<ServiceWorkerRegistration | null> | null = null

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export type NotifyStatus = 'on' | 'off' | 'blocked' | 'unsupported'

export function notifyStatus(): NotifyStatus {
  if (!notificationsSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  if (Notification.permission !== 'granted') return 'off'
  try { return localStorage.getItem(PREF_KEY) === '0' ? 'off' : 'on' } catch { return 'on' }
}

function registerSw(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null)
  swReg ??= navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).catch(() => null)
  return swReg
}

/** Ask for permission (must be called from a tap) and switch notifications on. */
export async function enableNotifications(): Promise<NotifyStatus> {
  if (!notificationsSupported()) return 'unsupported'
  const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (result !== 'granted') return result === 'denied' ? 'blocked' : 'off'
  try { localStorage.setItem(PREF_KEY, '1') } catch { /* ignore */ }
  await registerSw()
  return 'on'
}

export function disableNotifications() {
  try { localStorage.setItem(PREF_KEY, '0') } catch { /* ignore */ }
}

/** Register the service worker on start if notifications are already allowed. */
export function initNotifications() {
  if (notifyStatus() === 'on') void registerSw()
}

/** In-app toast always; a system notification too when switched on. */
export async function notify(title: string, body: string, tag: string) {
  toast(title, { description: body })
  if (notifyStatus() !== 'on') return
  const options = { body, tag, icon: '/icon-192.png', badge: '/icon-192.png' }
  try {
    const reg = await registerSw()
    if (reg) { await reg.showNotification(title, options); return }
    new Notification(title, options)
  } catch { /* the toast already showed it */ }
}
