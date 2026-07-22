(function (root) {
  'use strict';
  const metrics = { navigation:null, lcp:null, inp:null, longTasks:0, longTaskMs:0, measuredAt:new Date().toISOString() };
  const round = value => Math.round(Number(value || 0) * 10) / 10;
  function persist() {
    try { sessionStorage.setItem('kv_perf_latest_v1', JSON.stringify(metrics)); } catch (_) {}
  }
  function observe(type, handler, options) {
    if (!root.PerformanceObserver) return;
    try {
      const observer = new PerformanceObserver(list => list.getEntries().forEach(handler));
      observer.observe(options || { type, buffered:true });
    } catch (_) {}
  }
  root.addEventListener('load', () => {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) metrics.navigation = { ttfb:round(nav.responseStart), domInteractive:round(nav.domInteractive), load:round(nav.loadEventEnd) };
    persist();
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(error => console.warn('[service worker]', error));
    }
  }, { once:true });
  observe('largest-contentful-paint', entry => { metrics.lcp = round(entry.startTime); persist(); });
  observe('event', entry => {
    if (entry.duration && (!metrics.inp || entry.duration > metrics.inp)) { metrics.inp = round(entry.duration); persist(); }
  }, { type:'event', buffered:true, durationThreshold:40 });
  observe('longtask', entry => { metrics.longTasks++; metrics.longTaskMs = round(metrics.longTaskMs + entry.duration); persist(); });
  root.kvGetPerformanceSnapshot = () => JSON.parse(JSON.stringify(metrics));
})(window);
