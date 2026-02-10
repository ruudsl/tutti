# PWA Implementatieplan - Harmonie Muziek App

## Huidige Situatie
- **Framework**: React 18 + Vite 5 + TypeScript
- **PWA Status**: Geen implementatie aanwezig
- **Caching**: Alleen React Query (5 min stale time) + localStorage voor auth
- **Offline**: Geen ondersteuning

---

## Fase 1: Basis PWA Setup

### 1.1 Installatie Dependencies
```bash
npm install -D vite-plugin-pwa workbox-window
```

### 1.2 Web App Manifest (`manifest.webmanifest`)
Locatie: `frontend/public/manifest.webmanifest`

```json
{
  "name": "Harmonie Muziek App",
  "short_name": "Harmonie",
  "description": "Muziekvereniging beheer applicatie",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1976d2",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icons/icon-72x72.png",
      "sizes": "72x72",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-96x96.png",
      "sizes": "96x96",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-128x128.png",
      "sizes": "128x128",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-144x144.png",
      "sizes": "144x144",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-152x152.png",
      "sizes": "152x152",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-384x384.png",
      "sizes": "384x384",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "screenshots": [
    {
      "src": "/screenshots/desktop.png",
      "sizes": "1280x720",
      "type": "image/png",
      "form_factor": "wide"
    },
    {
      "src": "/screenshots/mobile.png",
      "sizes": "390x844",
      "type": "image/png",
      "form_factor": "narrow"
    }
  ],
  "categories": ["music", "productivity", "utilities"],
  "lang": "nl",
  "dir": "ltr"
}
```

### 1.3 Vite PWA Plugin Configuratie
Bestand: `frontend/vite.config.ts`

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'icons/*.png'],
      manifest: false, // We gebruiken een extern manifest bestand
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          // Zie Fase 2 voor caching strategieën
        ]
      }
    })
  ]
})
```

---

## Fase 2: Caching Strategieën

### 2.1 Service Worker Caching Configuratie

```typescript
// In vite.config.ts - workbox.runtimeCaching
runtimeCaching: [
  // API calls - Network First met fallback
  {
    urlPattern: /^https?:\/\/.*\/api\/(?!auth).*$/,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'api-cache',
      expiration: {
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24, // 24 uur
      },
      networkTimeoutSeconds: 10,
      cacheableResponse: {
        statuses: [0, 200]
      }
    }
  },
  // Muziekbestanden (MP3) - Cache First
  {
    urlPattern: /\.mp3$/,
    handler: 'CacheFirst',
    options: {
      cacheName: 'music-cache',
      expiration: {
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dagen
      },
      rangeRequests: true
    }
  },
  // PDF bestanden - Cache First
  {
    urlPattern: /\.pdf$/,
    handler: 'CacheFirst',
    options: {
      cacheName: 'pdf-cache',
      expiration: {
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 dagen
      }
    }
  },
  // Afbeeldingen - Cache First
  {
    urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
    handler: 'CacheFirst',
    options: {
      cacheName: 'image-cache',
      expiration: {
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dagen
      }
    }
  },
  // Fonts - Cache First
  {
    urlPattern: /\.(?:woff|woff2|ttf|eot)$/,
    handler: 'CacheFirst',
    options: {
      cacheName: 'font-cache',
      expiration: {
        maxEntries: 20,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 jaar
      }
    }
  },
  // Google Fonts
  {
    urlPattern: /^https:\/\/fonts\.googleapis\.com/,
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'google-fonts-stylesheets'
    }
  },
  {
    urlPattern: /^https:\/\/fonts\.gstatic\.com/,
    handler: 'CacheFirst',
    options: {
      cacheName: 'google-fonts-webfonts',
      expiration: {
        maxEntries: 30,
        maxAgeSeconds: 60 * 60 * 24 * 365
      }
    }
  }
]
```

### 2.2 Caching Strategie per Resource Type

| Resource Type | Strategie | Cache Duur | Reden |
|--------------|-----------|------------|-------|
| App Shell (HTML/CSS/JS) | Precache | Permanent | Snelle initiële load |
| API Data | Network First | 24 uur | Verse data, offline fallback |
| Muziekbestanden | Cache First | 30 dagen | Grote bestanden, zelden gewijzigd |
| PDF Partituren | Cache First | 7 dagen | Grote bestanden |
| Afbeeldingen | Cache First | 30 dagen | Statisch |
| Fonts | Cache First | 1 jaar | Nooit gewijzigd |

---

## Fase 3: Offline Functionaliteit

### 3.1 Offline Status Indicator Component

```typescript
// frontend/src/components/OfflineIndicator.tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { t } = useTranslation();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="offline-banner">
      {t('app.offline_mode')}
    </div>
  );
}
```

### 3.2 Offline Data Sync met React Query

```typescript
// frontend/src/lib/queryClient.ts - Uitbreiding
import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minuten
      gcTime: 1000 * 60 * 60 * 24, // 24 uur (was cacheTime)
      retry: 1,
      networkMode: 'offlineFirst', // Probeer cache eerst
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});

// Persisteer queries naar localStorage
const localStoragePersister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'harmonie-query-cache',
});

persistQueryClient({
  queryClient,
  persister: localStoragePersister,
  maxAge: 1000 * 60 * 60 * 24, // 24 uur
});

export { queryClient };
```

### 3.3 Offline Queue voor Mutations

```typescript
// frontend/src/hooks/useOfflineMutation.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

interface QueuedMutation {
  id: string;
  endpoint: string;
  method: string;
  data: unknown;
  timestamp: number;
}

const QUEUE_KEY = 'harmonie-offline-queue';

export function useOfflineMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: {
    onSuccess?: (data: TData) => void;
    invalidateKeys?: string[][];
  }
) {
  const queryClient = useQueryClient();

  // Sync queue wanneer online
  useEffect(() => {
    const syncQueue = async () => {
      const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      if (queue.length === 0) return;

      for (const item of queue) {
        try {
          await mutationFn(item.data as TVariables);
          // Verwijder uit queue na succesvolle sync
          const updated = queue.filter((q: QueuedMutation) => q.id !== item.id);
          localStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
        } catch (error) {
          console.error('Failed to sync queued mutation:', error);
        }
      }

      // Invalidate caches na sync
      options?.invalidateKeys?.forEach(key => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    };

    window.addEventListener('online', syncQueue);
    return () => window.removeEventListener('online', syncQueue);
  }, [mutationFn, queryClient, options?.invalidateKeys]);

  return useMutation({
    mutationFn: async (variables: TVariables) => {
      if (!navigator.onLine) {
        // Queue mutation voor later
        const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
        queue.push({
          id: crypto.randomUUID(),
          data: variables,
          timestamp: Date.now(),
        });
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        throw new Error('Offline - mutation queued');
      }
      return mutationFn(variables);
    },
    onSuccess: options?.onSuccess,
  });
}
```

---

## Fase 4: Install Prompt & Update Flow

### 4.1 Install Prompt Handler

```typescript
// frontend/src/hooks/usePWAInstall.ts
import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check of app al geïnstalleerd is
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const promptInstall = async () => {
    if (!installPrompt) return false;

    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;

    if (outcome === 'accepted') {
      setInstallPrompt(null);
      return true;
    }
    return false;
  };

  return {
    canInstall: !!installPrompt && !isInstalled,
    isInstalled,
    promptInstall,
  };
}
```

### 4.2 Update Notification Component

```typescript
// frontend/src/components/PWAUpdatePrompt.tsx
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';

export function PWAUpdatePrompt() {
  const { t } = useTranslation();

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      // Check elke 12 uur voor updates
      setInterval(() => {
        registration?.update();
      }, 12 * 60 * 60 * 1000);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="update-banner">
      <span>{t('app.update_available')}</span>
      <button onClick={() => updateServiceWorker(true)}>
        {t('app.update_now')}
      </button>
      <button onClick={() => setNeedRefresh(false)}>
        {t('app.later')}
      </button>
    </div>
  );
}
```

---

## Fase 5: Push Notifications (Optioneel)

### 5.1 Backend: Push Subscription Endpoints

```typescript
// backend/src/routes/push.ts
import express from 'express';
import webpush from 'web-push';

const router = express.Router();

// VAPID keys genereren: npx web-push generate-vapid-keys
webpush.setVapidDetails(
  'mailto:admin@harmonie.nl',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

// Subscription opslaan
router.post('/subscribe', async (req, res) => {
  const { subscription, userId } = req.body;
  // Sla subscription op in database
  await db.savePushSubscription(userId, subscription);
  res.status(201).json({ success: true });
});

// Notification sturen
router.post('/send', async (req, res) => {
  const { userId, title, body, url } = req.body;
  const subscription = await db.getPushSubscription(userId);

  if (subscription) {
    await webpush.sendNotification(subscription, JSON.stringify({
      title,
      body,
      url,
      icon: '/icons/icon-192x192.png',
    }));
  }
  res.json({ success: true });
});

export default router;
```

### 5.2 Frontend: Push Registration

```typescript
// frontend/src/hooks/usePushNotifications.ts
import { useState, useCallback } from 'react';
import api from '../api';

export function usePushNotifications() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported] = useState('PushManager' in window);

  const subscribe = useCallback(async () => {
    if (!isSupported) return false;

    const registration = await navigator.serviceWorker.ready;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
    });

    await api.post('/api/push/subscribe', { subscription });
    setIsSubscribed(true);
    return true;
  }, [isSupported]);

  return { isSupported, isSubscribed, subscribe };
}
```

---

## Implementatie Volgorde

### Sprint 1: Basis PWA (Week 1-2)
- [x] Plan uitwerken
- [ ] Dependencies installeren (`vite-plugin-pwa`)
- [ ] Manifest bestand aanmaken
- [ ] App icons genereren (alle formaten)
- [ ] Vite config updaten met PWA plugin
- [ ] Service worker basis setup
- [ ] Testen installatie op mobiel

### Sprint 2: Caching & Offline (Week 3-4)
- [ ] Runtime caching configureren
- [ ] React Query persistence toevoegen
- [ ] Offline indicator component
- [ ] Offline queue voor mutations
- [ ] Testen offline functionaliteit

### Sprint 3: UX Verbeteringen (Week 5)
- [ ] Install prompt component
- [ ] Update notification component
- [ ] Vertalingen toevoegen (NL/EN/DE)
- [ ] Styling voor PWA elementen

### Sprint 4: Push Notifications (Week 6 - Optioneel)
- [ ] VAPID keys genereren
- [ ] Backend push endpoints
- [ ] Frontend push registration
- [ ] Notification handling in service worker
- [ ] Use cases: repetitie herinneringen, concert alerts

---

## Benodigde Bestanden

```
frontend/
├── public/
│   ├── manifest.webmanifest
│   ├── robots.txt
│   ├── icons/
│   │   ├── icon-72x72.png
│   │   ├── icon-96x96.png
│   │   ├── icon-128x128.png
│   │   ├── icon-144x144.png
│   │   ├── icon-152x152.png
│   │   ├── icon-192x192.png
│   │   ├── icon-384x384.png
│   │   └── icon-512x512.png
│   └── screenshots/
│       ├── desktop.png
│       └── mobile.png
├── src/
│   ├── components/
│   │   ├── OfflineIndicator.tsx
│   │   ├── PWAUpdatePrompt.tsx
│   │   └── InstallPrompt.tsx
│   ├── hooks/
│   │   ├── usePWAInstall.ts
│   │   ├── useOfflineMutation.ts
│   │   └── usePushNotifications.ts
│   └── lib/
│       └── queryClient.ts (uitbreiden)
└── vite.config.ts (uitbreiden)
```

---

## Testing Checklist

### Lighthouse PWA Audit
- [ ] Installable
- [ ] PWA Optimized
- [ ] Offline capable

### Handmatige Tests
- [ ] App installeren op Android
- [ ] App installeren op iOS (Safari)
- [ ] Offline navigatie werkt
- [ ] Gecachte data beschikbaar offline
- [ ] Update prompt verschijnt bij nieuwe versie
- [ ] Queued mutations syncen na reconnect

### Browser Support
- [ ] Chrome (Desktop & Android)
- [ ] Safari (iOS & macOS)
- [ ] Firefox
- [ ] Edge

---

## Geschatte Impact

| Metric | Verwachte Verbetering |
|--------|----------------------|
| First Contentful Paint | -40% (app shell caching) |
| Time to Interactive | -30% (precaching) |
| Offline Availability | 0% → 80% |
| User Engagement | +25% (installatie) |
| Return Visits | +35% (home screen icon) |

---

## Risico's & Mitigatie

| Risico | Mitigatie |
|--------|-----------|
| Cache invalidation bugs | Versioning in cache names |
| Stale data tonen | NetworkFirst voor API calls |
| Storage quota overschrijden | Expiration policies per cache |
| iOS beperkingen | Fallback messaging, geen push |
| Service worker update issues | `skipWaiting` + update prompt |

---

*Document versie: 1.0*
*Aangemaakt: 2026-02-10*
*Status: Plan - Wacht op goedkeuring*
