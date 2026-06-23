/// <reference lib="webworker" />

const ICON = '/icon.svg';
const BADGE = '/icon.svg';

/**
 * @param {PushEvent} event
 */
function handlePush(event) {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'New message', body: event.data.text() };
  }

  const title = payload.title || 'New message';
  const options = {
    body: payload.body || '',
    icon: payload.icon || ICON,
    badge: payload.badge || BADGE,
    tag: payload.tag || payload.data?.type || 'lets-chat-message',
    data: payload.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
}

/**
 * @param {NotificationEvent} event
 */
function handleNotificationClick(event) {
  event.notification.close();

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow('/');
        }
      }),
  );
}

self.addEventListener('push', handlePush);
self.addEventListener('notificationclick', handleNotificationClick);
