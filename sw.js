const CACHE_NAME = 'aboji-meds-v1';
const ASSETS = ['./index.html', './style.css', './app.js', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

// 알람 메시지 수신
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'ALARM') {
    self.registration.showNotification('💊 약 드실 시간이에요!', {
      body: e.data.body || '약을 아직 안 드셨어요. 지금 드세요!',
      icon: './icon.png',
      badge: './icon.png',
      vibrate: [300, 100, 300, 100, 300],
      requireInteraction: true,
      tag: 'med-alarm',
      actions: [
        { action: 'taken', title: '✅ 먹었어요' },
        { action: 'later', title: '⏰ 5분 후 다시' }
      ]
    });
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'taken') {
    e.waitUntil(clients.matchAll({ type: 'window' }).then(cs => {
      if (cs.length > 0) cs[0].postMessage({ type: 'MARK_TAKEN', tag: e.notification.tag });
      else clients.openWindow('./index.html');
    }));
  } else if (e.action === 'later') {
    // 5분 후 재알림 — 앱에 메시지
    e.waitUntil(clients.matchAll({ type: 'window' }).then(cs => {
      cs.forEach(c => c.postMessage({ type: 'SNOOZE' }));
    }));
  } else {
    e.waitUntil(clients.openWindow('./index.html'));
  }
});
