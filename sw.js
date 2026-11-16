// Service worker: keeps a copy of the app on the phone so it opens with no signal.
// Strategy: "stale-while-revalidate" — show the saved copy instantly, then quietly
// download a fresh copy in the background. After you publish an update, it shows up
// the *second* time you open the app. No version numbers to bump.

const CACHE = 'tracker-app';
const FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  const fresh = fetch(req)
    .then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })
    .catch(() => null);
  event.waitUntil(fresh);

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fresh.then((res) => {
        if (res) return res;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
