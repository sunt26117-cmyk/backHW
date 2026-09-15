// Service Worker for ECU Hardware Risk & Decision Copilot
// Version 3 - Network First with automatic cache purging
const CACHE_NAME = 'ecu-copilot-cache-v3-network-first';

self.addEventListener('install', (event) => {
  // Force active immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clear all old caches from prior versions to prevent stale code lock
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              console.log('[SW] Deleting legacy cache:', name);
              return caches.delete(name);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Network-First Strategy: always prefer fresh network response
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200 && event.request.url.startsWith(self.location.origin)) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache only when completely offline
        return caches.match(event.request).then((cached) => cached || caches.match('/'));
      })
  );
});

