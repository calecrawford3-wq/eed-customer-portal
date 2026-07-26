// Service Worker for Web Push Notifications
// Registered at /sw.js with root scope

self.addEventListener('push', (event) => {
  let data = { title: 'New Message', body: 'You have a new message', phone: '', url: '/Messaging' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        data = { ...data, ...parsed };
      }
    }
  } catch (_) {
    if (event.data) {
      try { data.body = event.data.text(); } catch (e) {}
    }
  }

  const options = {
    body: data.body,
    icon: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png',
    tag: data.phone ? 'msg-' + data.phone : 'message',
    data: { phone: data.phone || '', url: data.url || '/Messaging' },
    requireInteraction: false,
    vibrate: [200, 100, 200],
    renotify: !!data.phone,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'New Message', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const phone = data.phone || '';
  const base = data.url || '/Messaging';
  const targetUrl = phone ? base + '?phone=' + encodeURIComponent(phone) : base;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // The push service changed the endpoint — re-subscribe and notify the server
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true }).then(function (newSub) {
      // Post the new subscription to the backend via fetch
      return fetch('/base44/functions/subscribeToPush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: newSub.endpoint,
          p256dh: b64(newSub.getKey('p256dh')),
          auth: b64(newSub.getKey('auth')),
        }),
      });
    })
  );
});

function b64(buffer) {
  var bytes = new Uint8Array(buffer);
  var binary = '';
  for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
