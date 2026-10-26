// Keeps the app working offline. Bump VERSION whenever you change app files.
const VERSION = 'workit-v65';
const FILES = [
  './', 'index.html', 'styles.css', 'config.js', 'manifest.webmanifest',
  'js/app.js', 'js/notes.js', 'js/classes.js', 'js/api.js', 'js/scan.js', 'js/pdf.js', 'js/pdfview.js', 'js/store.js', 'js/move.js',
  'icons/icon.svg', 'icons/logo.svg', 'icons/logo-dark.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

// A page that came through a redirect (Cloudflare turns admin.html into /admin) can't be handed
// to the browser as is, or it shows "site can't be reached". A plain copy of it can.
async function plain(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION)
    .then(c => Promise.all(FILES.map(f => fetch(new Request(f, { cache: 'reload' })).then(plain).then(res => c.put(f, res)))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first for our own files so updates show up, cache when offline.
// 'no-cache' makes the browser check GitHub every time instead of reusing a
// copy up to 10 minutes old, so a new version shows up on the next open.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache' })
      .then(plain)
      .then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
