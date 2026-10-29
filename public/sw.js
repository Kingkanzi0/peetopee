// Peetopee service worker — only used to show notifications (no offline caching).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = all.find(c => 'focus' in c)
    if (open) return open.focus()
    return self.clients.openWindow('/')
  })())
})
