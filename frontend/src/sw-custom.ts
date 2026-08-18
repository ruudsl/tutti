/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

declare let self: ServiceWorkerGlobalScope;

interface ExtendedNotificationOptions extends NotificationOptions {
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
}

// Precache and route
precacheAndRoute(self.__WB_MANIFEST);

// Cleanup old caches
cleanupOutdatedCaches();

// Skip waiting and claim clients immediately
self.skipWaiting();
clientsClaim();

// Cache-first strategy for GET API requests when offline
// This provides better offline support by serving cached data immediately
registerRoute(
  ({ request, url }) => {
    // Match GET requests to API endpoints (except auth)
    return request.method === 'GET' && url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth');
  },
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24, // 24 hours
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
    networkTimeoutSeconds: 5, // Faster fallback to cache when network is slow
  }),
);

// Background sync for POST/PUT/DELETE API requests when offline
registerRoute(
  ({ request, url }) => {
    // Match mutating requests to API endpoints
    return (
      ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method) &&
      url.pathname.startsWith('/api/') &&
      !url.pathname.startsWith('/api/auth')
    );
  },
  new NetworkFirst({
    cacheName: 'api-mutations-cache',
    plugins: [
      new BackgroundSyncPlugin('api-mutations-queue', {
        maxRetentionTime: 24 * 60, // 24 hours in minutes
        onSync: async ({ queue: _queue }) => {
          // Notify the app when sync happens
          const clients = await self.clients.matchAll({ type: 'window' });
          for (const client of clients) {
            client.postMessage({
              type: 'BACKGROUND_SYNC_COMPLETE',
              queueName: 'api-mutations-queue',
            });
          }
        },
      }),
    ],
    networkTimeoutSeconds: 10,
  }),
);

// User profile - StaleWhileRevalidate
registerRoute(
  /\/api\/auth\/me$/,
  new StaleWhileRevalidate({
    cacheName: 'user-profile-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 1,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  }),
);

// Music pieces metadata
registerRoute(
  /\/api\/music-pieces(?:\/titles)?(?:\?.*)?$/,
  new StaleWhileRevalidate({
    cacheName: 'music-metadata-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 500,
        maxAgeSeconds: 60 * 60 * 24, // 24 hours
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  }),
);

// Reference data (orchestras, instruments, genres)
registerRoute(
  /\/api\/(orchestras|instruments|genres)$/,
  new StaleWhileRevalidate({
    cacheName: 'reference-data-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  }),
);

// Favorites and recent views
registerRoute(
  /\/api\/(favorites|recent)(?:\?.*)?$/,
  new NetworkFirst({
    cacheName: 'user-data-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24, // 24 hours
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
    networkTimeoutSeconds: 5,
  }),
);

// Rehearsals
registerRoute(
  /\/api\/rehearsals(?:\/.*)?(?:\?.*)?$/,
  new NetworkFirst({
    cacheName: 'rehearsals-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24, // 24 hours
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
    networkTimeoutSeconds: 10,
  }),
);

// Music files (MP3)
registerRoute(
  /\.mp3$/,
  new CacheFirst({
    cacheName: 'music-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
      }),
    ],
  }),
);

// PDF files
registerRoute(
  /\.pdf$/,
  new CacheFirst({
    cacheName: 'pdf-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24 * 14, // 14 days
      }),
    ],
  }),
);

// Images
registerRoute(
  /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
  new CacheFirst({
    cacheName: 'image-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
      }),
    ],
  }),
);

// Fonts
registerRoute(
  /\.(?:woff|woff2|ttf|eot)$/,
  new CacheFirst({
    cacheName: 'font-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
      }),
    ],
  }),
);

// Google Fonts Stylesheets
registerRoute(
  /^https:\/\/fonts\.googleapis\.com/,
  new StaleWhileRevalidate({
    cacheName: 'google-fonts-stylesheets',
  }),
);

// Google Fonts Webfonts
registerRoute(
  /^https:\/\/fonts\.gstatic\.com/,
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
      }),
    ],
  }),
);

// ============================================================================
// Push Notification Handling
// ============================================================================

interface PushData {
  title?: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: {
    url?: string;
    type?: string;
    id?: string;
    [key: string]: unknown;
  };
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
  requireInteraction?: boolean;
  silent?: boolean;
}

self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) {
    console.warn('Push event received but no data');
    return;
  }

  let payload: PushData;
  try {
    payload = event.data.json() as PushData;
  } catch {
    payload = {
      title: 'Harmonie',
      body: event.data.text(),
    };
  }

  const title = payload.title || 'Harmonie';
  const options: ExtendedNotificationOptions = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/badge-72x72.png',
    tag: payload.tag || 'harmonie-notification',
    data: payload.data || {},
    actions: payload.actions || [],
    requireInteraction: payload.requireInteraction || false,
    silent: payload.silent || false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};

  let targetUrl = '/';

  if (action === 'view' && data.url) {
    targetUrl = data.url;
  } else if (data.url) {
    targetUrl = data.url;
  } else if (data.type && data.id) {
    switch (data.type) {
      case 'music':
        targetUrl = `/music/${data.id}`;
        break;
      case 'rehearsal':
        targetUrl = `/rehearsals/${data.id}`;
        break;
      case 'concert':
        targetUrl = `/concerts/${data.id}`;
        break;
      case 'seating':
        targetUrl = `/seating/${data.id}`;
        break;
      default:
        targetUrl = '/';
    }
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

self.addEventListener('notificationclose', (event: NotificationEvent) => {
  const data = event.notification.data || {};
  if (data.id) {
    fetch('/api/notifications/' + data.id + '/dismiss', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {
      // Silent fail - user may be offline
    });
  }
});

// Handle subscription change (e.g., when browser updates the push subscription)
self.addEventListener('pushsubscriptionchange', (event) => {
  const pushEvent = event as PushSubscriptionChangeEvent & ExtendableEvent;

  pushEvent.waitUntil(
    (async () => {
      try {
        const subscription = await self.registration.pushManager.subscribe(
          pushEvent.oldSubscription?.options || {
            userVisibleOnly: true,
            applicationServerKey: null,
          },
        );

        await fetch('/api/notifications/push-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            keys: {
              p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))),
              auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))),
            },
          }),
        });
      } catch (error) {
        console.error('Failed to resubscribe to push notifications:', error);
      }
    })(),
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event: SyncEvent) => {
  if (event.tag === 'sync-offline-actions') {
    event.waitUntil(syncOfflineActions());
  }
});

async function syncOfflineActions(): Promise<void> {
  const db = await openOfflineDB();
  const actions = await getOfflineActions(db);

  let successCount = 0;
  let failCount = 0;

  for (const action of actions) {
    try {
      const response = await fetch(action.url, {
        method: action.method,
        headers: action.headers,
        body: action.body,
        credentials: 'include',
      });

      if (response.ok) {
        await removeOfflineAction(db, action.id);
        successCount++;
      } else {
        failCount++;
      }
    } catch {
      failCount++;
      // Will retry on next sync
    }
  }

  // Notify the app about sync completion
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage({
      type: 'OFFLINE_SYNC_COMPLETE',
      successCount,
      failCount,
      remainingActions: actions.length - successCount,
    });
  }
}

interface OfflineAction {
  id: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

function openOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('harmonie-offline', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('actions')) {
        db.createObjectStore('actions', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

function getOfflineActions(db: IDBDatabase): Promise<OfflineAction[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('actions', 'readonly');
    const store = tx.objectStore('actions');
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function removeOfflineAction(db: IDBDatabase, id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('actions', 'readwrite');
    const store = tx.objectStore('actions');
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}
