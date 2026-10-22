// Generic shell. The itinerary pages are NOT in this repo: they live in this phone's IndexedDB
// (imported from a private trip file) and are served from there by this service worker.
const CACHE = 'trip-shell-v1';
const SHELL = ['import.html', 'index.html', 'style.css', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
const PRIVATE = new Set(['index.html', 'days.html', 'stamps.html', 'shopping.html', 'food.html', 'money.html', 'packing.html', 'data.js', 'app.js', 'spends.js']);
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const DB = 'trip-private', STORE = 'files';

function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function getFile(name) {
  return openDb().then(db => new Promise(res => {
    const q = db.transaction(STORE).objectStore(STORE).get(name);
    q.onsuccess = () => res(q.result == null ? null : q.result);
    q.onerror = () => res(null);
  })).catch(() => null);
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isFont = FONT_HOSTS.includes(url.hostname);
  if (!sameOrigin && !isFont) return;

  if (sameOrigin) {
    const name = url.pathname.split('/').pop() || 'index.html';
    if (PRIVATE.has(name)) {
      e.respondWith(getFile(name).then(text => {
        if (text != null) {
          const type = name.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
          return new Response(text, { headers: { 'Content-Type': type } });
        }
        if (name === 'index.html') return caches.match('index.html').then(r => r || fetch(req));
        return Response.redirect(new URL('import.html', self.registration.scope).href, 302);
      }));
      return;
    }
  }

  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});
