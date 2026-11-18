const CACHE_NAME = 'weto-pwa-v7';
const MEDIA_CACHE_NAME = 'weto-media-cache-v1';
const PRECACHE_ASSETS = [
  '/pwa/manifest.json',
  '/pwa/icons/192x192.png',
  '/pwa/icons/512x512.png',
  '/assets/logos/light.png',
  '/assets/logos/dark.png',
  '/assets/logos/favicon.png',
  // Audio assets (game sounds & notification bell)
  '/assets/games/tictactoe/music/click.mp3',
  '/assets/games/tictactoe/music/wingame.mp3',
  '/assets/games/tictactoe/music/music.mp3',
  '/assets/sounds/notifications/notification-received.mp3',
  // Tic-Tac-Toe Skin SVGs
  '/assets/games/tictactoe/svg/skins/box.svg',
  '/assets/games/tictactoe/svg/skins/crystal.svg',
  '/assets/games/tictactoe/svg/skins/default_circle.svg',
  '/assets/games/tictactoe/svg/skins/default_cross.svg',
  '/assets/games/tictactoe/svg/skins/enhance_circle.svg',
  '/assets/games/tictactoe/svg/skins/enhance_plus.svg',
  '/assets/games/tictactoe/svg/skins/hex.svg',
  '/assets/games/tictactoe/svg/skins/pentagon.svg',
  '/assets/games/tictactoe/svg/skins/pyramid.svg',
  '/assets/games/tictactoe/svg/skins/shield.svg',
  '/assets/games/tictactoe/svg/skins/star.svg',
  // Tic-Tac-Toe Game Core SVGs & PNGs
  '/assets/games/tictactoe/svg/dora.svg',
  '/assets/games/tictactoe/svg/dora_1.svg',
  '/assets/games/tictactoe/svg/dora_2.svg',
  '/assets/games/tictactoe/svg/dora_3.svg',
  '/assets/games/tictactoe/svg/dora_4.svg',
  '/assets/games/tictactoe/svg/versus.svg',
  '/assets/games/tictactoe/svg/clock.svg',
  '/assets/games/tictactoe/svg/rank1.svg',
  '/assets/games/tictactoe/svg/rank2.svg',
  '/assets/games/tictactoe/svg/rank3.svg',
  '/assets/games/tictactoe/svg/increment_coin.svg',
  '/assets/games/tictactoe/svg/leaderboard_icon.svg',
  '/assets/games/tictactoe/svg/more_game.svg',
  '/assets/games/tictactoe/png/guest.png',
  '/assets/games/tictactoe/png/coin.png',
  '/assets/games/tictactoe/png/maze_icon.png',
  '/assets/games/tictactoe/png/coin_stack_small.png',
  '/assets/games/tictactoe/png/coin_stack_medium.png',
  '/assets/games/tictactoe/png/coin_stack_large.png',
  '/assets/games/tictactoe/png/coin_bag_small.png',
  '/assets/games/tictactoe/png/coin_bag_large.png',
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

// Native Web Push notifications in PWA and Web App
self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { message: event.data.text() };
    }
  }

  const title = payload.title || payload.notification?.title || 'Weto';
  const body = payload.body || payload.message || payload.notification?.body || 'New notification';
  const data = payload.data || payload;
  const chatId = data.chatId || payload.chatId;
  const actionUrl =
    payload.actionUrl || data.actionUrl || (chatId ? `/messenger/c/${chatId}` : '/messenger');

  // Broadcast to all active client windows
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      client.postMessage({
        type: 'WETO_PUSH_EVENT',
        data: { ...data, chatId, title, message: body },
      });
    }
  });

  const options = {
    body,
    icon: '/pwa/icons/192x192.png',
    badge: '/assets/logos/favicon.png',
    tag: chatId ? `chat-${chatId}-${Date.now()}` : (data.notificationId ? `notif-${data.notificationId}` : `weto-push-${Date.now()}`),
    renotify: true,
    vibrate: [200, 100, 200],
    timestamp: Date.now(),
    requireInteraction: false,
    data: {
      actionUrl,
      chatId,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.actionUrl || '/messenger';
  const targetUrl = new URL(rawUrl, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
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
