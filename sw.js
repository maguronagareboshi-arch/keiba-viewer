const CACHE = 'kochi-viewer-v6';
const CORE = [
  './', './index.html', './manifest.webmanifest',
  './modules/ai-analysis.js', './modules/ai-insights.js', './modules/value-t10-shadow.js',
  './modules/performance-observer.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    // Never save an arbitrary page as index.html. Doing so allowed legacy
    // Monbetsu/Ooi pages to replace the Kochi home screen in the offline cache.
    event.respondWith(fetch(request).catch(() => caches.match('./index.html')));
    return;
  }
  if (url.pathname.includes('/data/3f/') || url.pathname.includes('/data/replay/')) {
    // 計測値は同じ日付・ファイル名のまま再較正されることがあるためネットワーク優先。
    // オフライン時だけ直近の検証済みコピーへフォールバックする。
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(() => caches.match(request)));
    return;
  }
  event.respondWith(caches.match(request).then(cached => {
    const update = fetch(request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
      return response;
    });
    return cached || update;
  }));
});
