const CACHE = 'kochi-viewer-v24';
const REQUIRED = ['./index.html', './manifest.webmanifest', './modules/app-main.js?v=20260804-perf1'];
const CORE = [
  './modules/ai-insights.js?v=20260801-cloud2',
  './modules/performance-observer.js',
  './modules/first3f-autofill.js?v=20260725-v1',
  './modules/track-bias-v2.js?v=20260726-v2',
  './modules/umaren-distortion-shadow.js?v=20260730-v1',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    await cache.addAll(REQUIRED);
    // 補助モジュールの一時失敗でService Worker全体の更新を失敗させない。
    await Promise.allSettled(CORE.map(url => cache.add(url)));
  }).then(() => self.skipWaiting()));
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
  if (url.pathname.includes('/modules/') || url.pathname.includes('/data/3f/') || url.pathname.includes('/data/replay/')) {
    // 計測値は同じ日付・ファイル名のまま再較正されることがあるためネットワーク優先。
    // オフライン時だけ直近の検証済みコピーへフォールバックする。
    event.respondWith(fetch(request).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      caches.open(CACHE).then(cache => cache.put(request, response.clone()));
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
