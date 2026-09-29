// Scan-to-World's service worker: the game works offline once it has been
// opened, and on Android a scan shared from another app (Scaniverse, say)
// arrives here and is handed to the game.
const VERSION = 'stw-1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'stw-shared').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // A scan shared from another app: keep it, and open the game to take it.
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const file = form.get('scan');
      if (file && typeof file !== 'string') {
        const shared = await caches.open('stw-shared');
        await shared.put('./shared-scan', new Response(file, { headers: { 'x-name': encodeURIComponent(file.name) } }));
      }
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // The page: the newest when online, the kept one when not.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put('./', copy)); return r; }).catch(() => caches.match('./')));
    return;
  }
  // Everything else: kept once fetched (built files have their hash in their names, so never go stale).
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return r;
  })));
});
