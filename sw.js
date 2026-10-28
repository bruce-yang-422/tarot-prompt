// Service Worker：讓網站可以安裝成 App 並離線使用。
// - 網站本身（HTML、CSS、JS、圖示）安裝時先快取，之後一律「先連網、失敗才用快取」，確保拿到最新版
// - 78 張牌圖（約 15MB，整個網站約 16MB）安裝時一起下載，之後「先用快取」，離線也能看到每一張牌
//   圖檔清單讀自 images/rws-1909/manifest.json；個別圖檔下載失敗不影響安裝，之後看到時會再補存
const SHELL_CACHE = 'wenpai-shell-v10';
const IMAGE_CACHE = 'wenpai-images-v1';

const SHELL_FILES = [
  './',
  'index.html',
  'css/style.css',
  'js/cards.js',
  'js/spreads.js',
  'js/background.js',
  'js/prompt.js',
  'js/storage.js',
  'js/ai.js',
  'js/settings.js',
  'js/app.js',
  'js/install.js',
  'manifest.webmanifest',
  'favicon.ico',
  'icons/logo-128.png',
  'icons/logo-256.png',
  'icons/tarot-cards-star-moon.png',
  'icons/hand-holding-tarot-card.png',
  'icons/icon-192.png',
  'icons/favicon-32.png',
];

const IMAGE_DIR = 'images/rws-1909/';

async function precacheImages() {
  const cache = await caches.open(IMAGE_CACHE);
  const list = await fetch(IMAGE_DIR + 'manifest.json').then((r) => r.json());
  await Promise.allSettled(
    list.map(async ({ filename }) => {
      const url = IMAGE_DIR + filename;
      if (await cache.match(url)) return;
      const res = await fetch(url);
      if (res.ok) await cache.put(url, res);
    })
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => precacheImages().catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = [SHELL_CACHE, IMAGE_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // 只處理同網域的 GET；OpenAI、Google、Claude 等外部 API 請求不經過快取
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.includes('/images/rws-1909/')) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(networkFirst(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(IMAGE_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    // 離線時開啟任何頁面都回到首頁（單頁網站，畫面由網址 # 切換）
    if (req.mode === 'navigate') return cache.match('index.html');
    throw err;
  }
}
