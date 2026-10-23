// Service worker da Pedra Mestra: funciona offline e se atualiza sozinho.
// Ao publicar uma versão nova, mude VERSION: o navegador detecta, instala e o app recarrega.
const VERSION = '2.2.0';
const CACHE = 'pedra-mestra-' + VERSION;
const FILES = ['./', 'index.html', 'engine.js', 'app.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'vendor/three.module.min.js', 'vendor/addons/geometries/RoundedBoxGeometry.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('message', e => { if (e.data === 'version') e.source.postMessage({ version: VERSION }); });

// Rede primeiro, revalidando com o servidor (pega atualizações na hora); cache se estiver offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const same = new URL(e.request.url).origin === location.origin;
  e.respondWith(
    fetch(!same ? e.request : e.request.mode === 'navigate' ? new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(e.request, { cache: 'no-cache' })).then(res => {
      if (res.ok && same) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
