/*
 * AvroNext service worker. Deliberately small:
 * - caches only the app's static files (hashed /_next/static, icons), never pages or
 *   data: everything private keeps coming from Nextcloud through the server;
 * - shows /offline.html when a page can't load;
 * - receives Android share-sheet posts (manifest share_target): keeps the shared
 *   files in the browser (IndexedDB) and opens /share to choose where they go.
 */
const STATIC = 'avronext-static-v1'
const SHELL = ['/offline.html', '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

function putShare(data) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('avronext-share', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('share')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const tx = open.result.transaction('share', 'readwrite')
      tx.objectStore('share').put(data, 'pending')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    }
  })
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Only the share sheet's navigation, not the /share page's own server-action posts.
  if (req.method === 'POST' && url.pathname === '/share' && req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const form = await req.formData()
        await putShare({
          title: form.get('title') || '',
          text: form.get('text') || '',
          url: form.get('url') || '',
          files: form.getAll('files').filter((f) => typeof f === 'object' && f.size > 0),
          at: Date.now(),
        })
        return Response.redirect('/share?received=1', 303)
      })(),
    )
    return
  }
  if (req.method !== 'GET') return

  // Hashed build files and icons never change: cache first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) cache.put(req, res.clone())
        return res
      }),
    )
    return
  }

  // Pages: always from the network; the offline page when there is none.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')))
  }
})
