const CACHE_NAME = 'aboji-meds-v2';
const ASSETS = ['./index.html', './style.css', './app.js', './manifest.json'];

// ── 설치 ─────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(ASSETS))
      .catch(() => {}) // 캐시 실패해도 앱은 동작
  );
  self.skipWaiting();
});

// ── 활성화 ────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

// ── 오프라인 캐시 ─────────────────────────────────────────
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

// ── Web Push 수신 (GitHub Actions → 핸드폰) ──────────────
self.addEventListener('push', e => {
  let data = { title: '💊 약 드실 시간이에요!', body: '약을 확인해 주세요.' };
  try {
    if (e.data) data = e.data.json();
  } catch {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:               data.body,
      icon:               data.icon  || './icon-192.png',
      badge:              data.badge || './icon-192.png',
      tag:                data.tag   || 'med-alarm',
      requireInteraction: true,
      vibrate:            [300, 100, 300, 100, 300],
      data:               data.data  || { url: './' },
      actions: [
        { action: 'open',  title: '✅ 앱 열기' },
        { action: 'close', title: '닫기' }
      ]
    })
  );
});

// ── 알림 클릭 ────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'close') return;

  const targetUrl = e.notification.data?.url || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => c.url.includes('father'));
      if (existing) { existing.focus(); return; }
      clients.openWindow(targetUrl);
    })
  );
});

// ── 인앱 알람 메시지 (앱이 열려있을 때) ──────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'IN_APP_ALARM') {
    self.registration.showNotification('💊 약 드실 시간이에요!', {
      body:               e.data.body || '약을 확인해 주세요.',
      tag:                'med-alarm',
      requireInteraction: true,
      vibrate:            [300, 100, 300]
    });
  }
});
