/* Firebase Messaging Service Worker */

self.addEventListener('install', () => {
  // Activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Show notification when a push event arrives (FCM handles data messages)
self.addEventListener('push', (event) => {
  try {
    const data = event.data ? event.data.json() : {};
    const title = data.notification?.title || data.title || 'VayAccess Update';
    const body = data.notification?.body || data.body || 'There is a new update available.';
    const icon = data.notification?.icon || data.icon || '/vay-3d-model.jpg';
    const url = data.notification?.click_action || data.click_action || '/' ;

    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon,
        data: { url },
        badge: icon,
      })
    );
  } catch (e) {
    // no-op
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const hadWindow = clientsArr.some((client) => {
        if (client.url === url && 'focus' in client) { client.focus(); return true; }
        return false;
      });
      if (!hadWindow && self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});