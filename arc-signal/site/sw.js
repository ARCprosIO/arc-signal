const V = 'signal-v17';
const FILES = ['./', 'index.html', 'css/app.css', 'js/core.js', 'js/core2.js', 'js/icons.js', 'js/charts.js', 'js/themes.js', 'js/tools.js', 'js/tools2.js', 'js/tools3.js', 'js/qr.js', 'js/web.js', 'fonts/inter.woff2', 'fonts/jakarta.woff2', 'js/knowledge.js', 'js/native.js', 'js/speed.js', 'js/app.js', 'js/views.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;   // never touch speed/ping traffic
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request).then(m => m || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined))));
});
