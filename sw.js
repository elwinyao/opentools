// ==================== Service Worker ====================
// 缓存策略：
//   - Supabase API GET 请求: Network First + 缓存回退（离线可用）
//   - 本地静态资源（CSS/JS/图标）: Cache First + 后台更新
//   - HTML 页面导航: Network First，离线时回退到缓存
//   - 外部 CDN: 不拦截，让浏览器自行处理

const CACHE_NAME = 'baby-tracker-v5';
const API_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // API 缓存有效期：24 小时
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/index.css',
  '/attendance-tracker.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/index.js',
  '/lib/common.css',
  '/lib/common-bundle.js',
  '/lib/logger.js',
  '/lib/data-io.js',
  '/lib/excel-export.js',
  '/baby-tracker/baby-tracker.html',
  '/baby-tracker/baby-tracker.css',
  '/baby-tracker/page-bundle.js'
];

// ============ 安装：预缓存所有静态资源 ============
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] 预缓存静态资源...');
      return cache.addAll(STATIC_ASSETS).catch(function(err) {
        // 部分资源可能不存在（如 attendance-tracker.html），不阻塞安装
        console.warn('[SW] [WARN] 预缓存部分资源失败:', err.message || err);
      });
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ============ 激活：清理旧缓存 ============
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
          .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ============ 请求拦截 ============
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Supabase REST API GET 请求：Network First + 缓存回退（带 TTL）
  // 离线时仍可展示最近一次成功获取的数据
  if (url.hostname.includes('supabase.co') && event.request.method === 'GET') {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open('api-cache').then(function(cache) {
            // 附加时间戳 header，用于 TTL 校验
            var tsHeaders = new Headers(clone.headers);
            tsHeaders.set('x-sw-cached-at', String(Date.now()));
            var tsResponse = new Response(clone.body, {
              status: clone.status,
              statusText: clone.statusText,
              headers: tsHeaders
            });
            cache.put(event.request, tsResponse);
          });
        }
        return response;
      }).catch(function() {
        return caches.match(event.request).then(function(cached) {
          if (cached) {
            var cachedAt = cached.headers.get('x-sw-cached-at');
            if (cachedAt && (Date.now() - parseInt(cachedAt, 10)) < API_CACHE_TTL_MS) {
              return cached;
            }
          }
          // 无缓存或已过期：返回 503 让 Supabase SDK 抛错
          return new Response(JSON.stringify({ error: { message: 'Offline' } }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        });
      })
    );
    return;
  }

  // 跳过外部 CDN 和非 GET 请求
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;

  // 导航请求（HTML 页面）：Network First
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(function() {
        return caches.match(event.request).then(function(cached) {
          return cached || caches.match('/');
        });
      })
    );
    return;
  }

  // 静态资源：Cache First + 后台更新
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      var fetchPromise = fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        // 网络失败，如果有缓存就用缓存
        return cached || new Response('Offline', { status: 503 });
      });

      return cached || fetchPromise;
    })
  );
});

// ============ 推送通知（预留） ============
self.addEventListener('push', function(event) {
  var data = event.data ? event.data.json() : {};
  var title = data.title || '宝宝成长助手';
  var options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
