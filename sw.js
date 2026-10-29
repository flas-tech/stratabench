// Stratabench service worker: Home Screen install, push notifications, offline notice.
// Network-first for pages; never caches API calls, files, or anything cross-origin.
const CACHE = 'sb-shell-v2';
const SHELL = ['/offline.html', '/css/app.css', '/img/icon-192.png', '/favicon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  if (r.mode === 'navigate') e.respondWith(fetch(r).catch(() => caches.match('/offline.html')));
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  const title = d.title || 'Stratabench';
  e.waitUntil(Promise.all([
    self.registration.showNotification(title, { body: d.body || 'You have a new update in Stratabench.', icon: '/img/icon-192.png', badge: '/img/icon-192.png', tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || '/login.html' } }),
    self.navigator && self.navigator.setAppBadge ? self.navigator.setAppBadge().catch(() => {}) : null,
  ]));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/login.html', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (new URL(c.url).origin === self.location.origin && 'focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});

// Browser rotated the subscription: the app re-registers on next open (refresh()).
self.addEventListener('pushsubscriptionchange', () => {});
