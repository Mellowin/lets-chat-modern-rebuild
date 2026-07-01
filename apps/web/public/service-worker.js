/// <reference lib="webworker" />

const CACHE_VERSION = 'v2';
const APP_SHELL_CACHE = `lets-chat-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `lets-chat-static-${CACHE_VERSION}`;
const OFFLINE_PAGE = '/offline.html';
const ICON = '/icon.svg';
const BADGE = '/icon.svg';

const SHELL_URLS = [
  '/',
  '/login',
  '/register',
  '/dashboard',
  '/direct',
  '/profile',
  '/project-status',
  '/admin',
  '/admin/reports',
  '/offline.html',
];

const STATIC_ASSET_URLS = [
  '/icon.svg',
  '/apple-touch-icon.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-192x192.png',
  '/icons/icon-maskable-512x512.png',
  '/manifest.webmanifest',
];

/**
 * @param {Response} response
 */
function isCacheableResponse(response) {
  return (
    response &&
    response.status === 200 &&
    response.type === 'basic' &&
    !response.bodyUsed
  );
}

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

/**
 * @param {FetchEvent} event
 */
function handleFetch(event) {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    return;
  }

  // Never intercept or cache API calls, auth flows or attachment downloads.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/uploads/') ||
    url.pathname.startsWith('/auth/')
  ) {
    return;
  }

  // Navigation requests: try network first, fall back to cached shell/offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheableResponse(response)) {
            const responseClone = response.clone();
            caches
              .open(APP_SHELL_CACHE)
              .then((cache) =>
                cache.put(request, responseClone).catch(() => {}),
              )
              .catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then(
              (cached) =>
                (cached && cached.clone()) ||
                caches.match(OFFLINE_PAGE),
            )
            .then(
              (cached) =>
                (cached && cached.clone()) ||
                new Response('Offline', { status: 503 }),
            ),
        ),
    );
    return;
  }

  // Static assets: serve from cache first, then network.
  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    /\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf|webmanifest)$/i.test(
      url.pathname,
    );

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached.clone();
        }
        return fetch(request).then((response) => {
          if (isCacheableResponse(response)) {
            const responseClone = response.clone();
            caches
              .open(STATIC_CACHE)
              .then((cache) =>
                cache.put(request, responseClone).catch(() => {}),
              )
              .catch(() => {});
          }
          return response;
        });
      }),
    );
    return;
  }

  // Other same-origin GET requests: network first with cache fallback.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (isCacheableResponse(response)) {
              const responseClone = response.clone();
              caches
                .open(APP_SHELL_CACHE)
                .then((cache) =>
                  cache.put(request, responseClone).catch(() => {}),
                )
                .catch(() => {});
            }
            return response;
          })
          .catch(() => cached);

        return cached ? cached.clone() : network;
      }),
    );
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS).catch(() => {}))
      .then(() =>
        caches
          .open(STATIC_CACHE)
          .then((cache) => cache.addAll(STATIC_ASSET_URLS).catch(() => {})),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                (key.startsWith('lets-chat-shell-') ||
                  key.startsWith('lets-chat-static-')) &&
                key !== APP_SHELL_CACHE &&
                key !== STATIC_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', handleFetch);
self.addEventListener('push', handlePush);
self.addEventListener('notificationclick', handleNotificationClick);
