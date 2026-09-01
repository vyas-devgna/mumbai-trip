const SHELL_CACHE = 'mumbai-tripos-shell-v3'
const RUNTIME_CACHE = 'mumbai-tripos-runtime-v3'
const MAP_CACHE = 'mumbai-tripos-map-v1'
const BASE = '/mumbai-trip/'
const PRECACHE = [
  BASE,
  `${BASE}manifest.webmanifest`,
  `${BASE}icon.svg`,
  `${BASE}version.json`,
  `${BASE}resources/outbound-karnavati.pdf`,
  `${BASE}resources/return-gujarat.pdf`,
  `${BASE}resources/sea-lounge-booking.svg`
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, RUNTIME_CACHE, MAP_CACHE])
    const keys = await caches.keys()
    await Promise.all(keys.filter(key => !keep.has(key)).map(key => caches.delete(key)))
    await self.clients.claim()
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) client.postMessage({ type: 'TRIPOS_SW_ACTIVE' })
  })())
})

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request, { cache: 'no-store' })
    if (response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return (await caches.match(request)) || (fallbackUrl ? await caches.match(fallbackUrl) : undefined) || Response.error()
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE)
  const cached = await cache.match(request)
  const update = fetch(request).then(response => {
    if (response?.ok) cache.put(request, response.clone())
    return response
  }).catch(() => null)
  return cached || await update || Response.error()
}

async function mapTile(request) {
  const cache = await caches.open(MAP_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(request, response.clone())
      const keys = await cache.keys()
      if (keys.length > 180) await Promise.all(keys.slice(0, keys.length - 160).map(key => cache.delete(key)))
    }
    return response
  } catch {
    return Response.error()
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, BASE))
    return
  }

  if (url.origin === self.location.origin && url.pathname === `${BASE}version.json`) {
    event.respondWith(networkFirst(event.request))
    return
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event.request))
    return
  }

  if (url.hostname.includes('openstreetmap.org') || url.hostname.includes('arcgisonline.com')) {
    event.respondWith(mapTile(event.request))
  }
})

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
