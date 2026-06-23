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

  const data = event.notification.data || {};
  let url = data.url;
  if (!url) {
    if (data.type === 'direct_message' && data.conversationId) {
      url = `/direct/${data.conversationId}`;
    } else if (
      data.type === 'channel_message' &&
      data.workspaceId &&
      data.channelId
    ) {
      url = `/workspaces/${data.workspaceId}/channels/${data.channelId}`;
    } else {
      url = '/';
    }
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        const existing = clientList.find(
          (client) => client.url && client.url.includes(url) && 'focus' in client,
        );
        if (existing) {
          return existing.focus();
        }
        const firstClient = clientList[0];
        if (firstClient && 'navigate' in firstClient) {
          return firstClient.navigate(url);
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', handlePush);
self.addEventListener('notificationclick', handleNotificationClick);
