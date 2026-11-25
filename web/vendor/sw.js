// Köroğlu Öğrenci Sistemi service worker: makes the site installable ("Ana ekrana ekle").
// Network first, so a new version is always picked up; only the app shell falls back to cache offline.
const CACHE = 'koroglu-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode !== 'navigate') return; // assets: browser cache is enough
  e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); return res; })
    .catch(() => caches.match('./').then((r) => r || new Response('<h1>İnternet bağlantısı yok</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))));
});
