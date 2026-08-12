/* ============================================================
   myvocab — Service Worker (oflayn rejim)

   Strategiya: NETWORK-FIRST (tarmoq birinchi), kesh — zaxira.
   Sabab: eski "cache-first" versiyasida yangi dars qo'shilgach,
   foydalanuvchi telefonida eski `words.js` keshdan chiqaverardi va
   yangi so'zlar hech qachon ko'rinmasdi. Endi internet bo'lsa —
   doim eng yangi nusxa, internet bo'lmasa — keshdagi nusxa.
   ============================================================ */

const VERSION    = 'v4';
const CACHE_NAME = `myvocab-${VERSION}`;
const NET_TIMEOUT = 3500;   // sekin tarmoqda shuncha kutamiz, keyin keshga o'tamiz

const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './words.js',
  './verbs.js',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

/* ---------- INSTALL: asosiy fayllarni oldindan keshlaymiz ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    /* cache:'reload' — brauzerning HTTP keshini chetlab, serverdan yangisini oladi */
    await Promise.all(CORE_ASSETS.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res.ok) await cache.put(url, res);
      } catch (e) { /* bitta fayl tushmasa ham o'rnatish buzilmasin */ }
    }));
    await self.skipWaiting();
  })());
});

/* ---------- ACTIVATE: eski keshlarni tozalaymiz ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
  })());
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  /* Faqat o'zimizning GET so'rovlarimiz bilan ishlaymiz */
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(networkFirst(event));
});

async function networkFirst(event) {
  const req   = event.request;
  const cache = await caches.open(CACHE_NAME);

  try {
    const preload = await event.preloadResponse;
    const fresh   = preload || await fetchWithTimeout(req, NET_TIMEOUT);

    if (fresh && fresh.ok && fresh.type === 'basic') {
      cache.put(req, fresh.clone());       // keshdagi oflayn nusxani yangilab boramiz
    }
    return fresh;
  } catch (e) {
    /* Internet yo'q yoki juda sekin — keshdan beramiz */
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;

    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return new Response('Oflayn — bu sahifa keshda yo\'q.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}
