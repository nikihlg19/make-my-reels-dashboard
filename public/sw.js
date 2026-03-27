const CACHE_NAME = 'mmr-v1';
const PRECACHE_URLS = [
  '/',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

// Network-first strategy: try network, fall back to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET and API/auth requests
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.hostname.includes('clerk')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses for same-origin
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('push', (event) => {
  let title = 'MMR Studio';
  let body = 'You have a new notification.';
  let data = { url: '/' };

  if (event.data) {
    try {
      const parsed = event.data.json();
      title = parsed.title || title;
      body = parsed.body || body;
      data = parsed.data || data;
    } catch (e) {
      console.error('Push notification JSON parse failed:', e);
      body = event.data.text();
    }
  }

  const options = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100, 50, 200],
    requireInteraction: true,
    tag: data.tag || 'mmr-push',
    data: data,
    actions: [
      { action: 'view', title: 'View Report' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  if (action === 'dismiss') return;

  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
