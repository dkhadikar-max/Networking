self.addEventListener('push', function (event) {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }

  const { title, body, data = {} } = payload;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/assets/logo.png',
      badge: '/assets/logo.png',
      data,
      tag: data.screen || 'byn',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const data = event.notification.data || {};

  let url = '/discover';
  if ((data.screen === 'Chat' || data.screen === 'ChatDetail') && data.connectionId) {
    url = `/chat/${data.connectionId}`;
  } else if (data.screen === 'Chat') {
    url = '/chat';
  } else if (data.screen === 'Circles') {
    url = '/circles';
  } else if (data.screen === 'PriorityMessages') {
    url = '/chat';
  } else if (data.screen === 'LikedMe' || data.screen === 'Likes') {
    url = '/likes';
  } else if (data.screen === 'Profile') {
    url = '/profile';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      for (const client of windowClients) {
        if (client.url.endsWith(url) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
