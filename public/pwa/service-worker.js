const CACHE_NAME = 'weto-pwa-v5';
const MEDIA_CACHE_NAME = 'weto-media-cache-v1';
const PRECACHE_ASSETS = [
  '/pwa/manifest.json',
  '/pwa/icons/192x192.png',
  '/pwa/icons/512x512.png',
  '/assets/logos/light.png',
  '/assets/logos/dark.png',
  '/assets/logos/favicon.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME && k !== MEDIA_CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Cache-First for immutable R2 media proxy assets (non-Range image/GIF/thumbnail GETs)
  // so previously loaded media never blanks out during network glitches.
  if (url.pathname === '/api/v1/media/proxy' && !req.headers.get('range')) {
    event.respondWith(
      caches.open(MEDIA_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const networkRes = await fetch(req);
        if (networkRes && networkRes.status === 200) {
          cache.put(req, networkRes.clone()).catch(() => undefined);
        }
        return networkRes;
      })
    );
    return;
  }

  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/webpack-hmr') ||
    url.pathname.startsWith('/__nextjs') ||
    url.pathname.startsWith('/socket.io')
  ) {
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith('/pwa/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/_next/static/');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((networkRes) => {
          if (networkRes && networkRes.ok) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => undefined);
          }
          return networkRes;
        });
      })
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const rootCached = await caches.match('/');
        if (rootCached) return rootCached;
        return new Response(
          '<!doctype html><html><body style="font-family:sans-serif;padding:2rem;text-align:center;"><h2>You are offline</h2><p>Waiting for internet connection to reload content...</p></body></html>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      })
    );
  }
});
