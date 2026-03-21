const CACHE_NAME = 'nicofy-wav-cache-v1';
const PRECACHE_URLS = [
  // Add any static assets you want to precache here
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/manifest.json' // if you have one
];

self.addEventListener('install', event => {
  // Perform install steps
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  // Clean up old caches
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
                  .map(name => caches.delete(name))
      );
    })
    .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Only handle audio requests (including WAV/MP3 from archive.org)
  if (event.request.destination === 'audio' || 
      event.request.url.endsWith('.wav') || 
      event.request.url.endsWith('.mp3')) {
    event.respondWith(
      caches.open(CACHE_NAME)
        .then(cache => {
          return cache.match(event.request).then(cachedResponse => {
            // Return cached response if found
            if (cachedResponse) {
              return cachedResponse;
            }
            // Otherwise fetch from network
            return fetch(event.request).then(networkResponse => {
              // Check if we received a valid response
              if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                return networkResponse;
              }
              // Clone the response: one for cache, one for browser
              const responseToCache = networkResponse.clone();
              cache.put(event.request, responseToCache);
              return networkResponse;
            });
          });
        })
    );
  }
  // For all other requests, use cache-first strategy
  else {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        return cachedResponse || fetch(event.request);
      })
    );
  }
});