// ============================================================
// Service Worker - موقع بيان فاشن (Bayan POS Fashion Website)
// نظام الكاشينج الذكي والتحديث التلقائي الفوري فور الرفع
// ============================================================

const CACHE_VERSION = 'v1.1.2';
const CACHE_NAME = `bayan-fashion-site-${CACHE_VERSION}`;

// الملفات الأساسية المعتمدة للموقع
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/main.js',
  './assets/logo.png',
  './version.json',
  './version.txt'
];

// 1. تثبيت السيرفس ووركر وتخزين الأصول الأساسية
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of STATIC_ASSETS) {
        try {
          const res = await fetch(asset, { cache: 'no-cache' });
          if (res && res.status === 200) {
            await cache.put(asset, res);
          }
        } catch (e) {
          // تجاهل أي أصل غير متاح
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// 2. تفعيل السيرفس ووركر وحذف كافة النسخ القديمة للكاش تلقائياً
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] 🧹 حذف الكاش القديم:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. استقبال رسالة التحديث الفوري من المتصفح
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

// 4. استراتيجية جلب الملفات:
// - ملفات الفيرجن (version.json و version.txt): دائماً من السيرفر مباشرة بدون أي كاش.
// - صفحات الويب والتنقل: Network First لضمان وصول التحديثات فوراً مع الاحتياط للكاش أوفلاين.
// - باقي الأصول (CSS, JS, صور): Stale-While-Revalidate لتحديث الكاش في الخلفية دائماً.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!request || request.method !== 'GET') return;
  if (!request.url.startsWith('http://') && !request.url.startsWith('https://')) return;

  const url = new URL(request.url);

  // ملفات فحص الإصدار لا تُخزن أبداً في الكاش لضمان كشف أي تحديث فوراً
  if (url.pathname.endsWith('version.json') || url.pathname.endsWith('version.txt') || url.pathname.endsWith('sw.js')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() => caches.match(request))
    );
    return;
  }

  // لصفحات HTML والتنقل: Network First لضمان تحميل أحدث نسخة من الموقع
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, resClone));
          }
          return networkRes;
        })
        .catch(() => caches.match(request) || caches.match('./index.html') || caches.match('./'))
    );
    return;
  }

  // لباقي الأصول (CSS / JS / Images): Stale While Revalidate
  event.respondWith(
    caches.match(request).then((cachedRes) => {
      const fetchPromise = fetch(request).then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, resClone));
        }
        return networkRes;
      }).catch(() => {});

      return cachedRes || fetchPromise;
    })
  );
});
