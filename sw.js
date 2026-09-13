// Service worker de l'appli "Enveloppes"
// Stratégie "réseau d'abord" : sert toujours la dernière version quand il y a internet,
// et ne retombe sur le cache que lorsque le réseau est indisponible (usage hors-ligne).

const CACHE_VERSION = 'v2';
const CACHE_NAME = 'enveloppes-cache-' + CACHE_VERSION;

// Fichiers propres à l'appli (même origine)
const LOCAL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Ressources externes (CDN) dont dépend l'appli
const EXTERNAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Fichiers locaux : mise en cache directe (best effort, ne bloque jamais l'installation)
    await Promise.all(
      LOCAL_ASSETS.map((url) =>
        cache.add(url).catch((err) => console.warn('[SW] Échec de mise en cache (local):', url, err))
      )
    );

    // Ressources externes : mode no-cors requis (Google Fonts ne renvoie pas d'en-têtes CORS sur ce endpoint)
    await Promise.all(
      EXTERNAL_ASSETS.map(async (url) => {
        try {
          const req = new Request(url, { mode: 'no-cors' });
          const res = await fetch(req);
          await cache.put(url, res);
        } catch (err) {
          console.warn('[SW] Échec de mise en cache (externe):', url, err);
        }
      })
    );

    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    );
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith((async () => {
    // Réseau d'abord : on essaie toujours d'avoir la version la plus fraîche
    try {
      const response = await fetch(event.request);
      if (response && response.status === 200 && event.request.url.startsWith(self.location.origin)) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone());
      }
      return response;
    } catch (err) {
      // Hors-ligne (ou requête échouée) : on retombe sur le cache
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
      }
      throw err;
    }
  })());
});

