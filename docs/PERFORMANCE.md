# Performance Optimizations

This guide covers the performance optimization strategies used in Harmonie, from frontend caching to database indexes and PWA optimizations.

## React Query Caching

### Query Client Configuration

The query client (`frontend/src/lib/queryClient.ts`) is configured with intelligent defaults:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes - data considered fresh
      gcTime: 1000 * 60 * 60 * 24, // 24 hours - cache retention for offline
      retry: 1, // Single retry on failure
      refetchOnWindowFocus: false, // Disable automatic refetch
    },
    mutations: {
      retry: 0, // No automatic retry for mutations
    },
  },
});
```

### Stale Time Configuration

Different data types have different freshness requirements:

| Data Type                            | Stale Time | Rationale                 |
| ------------------------------------ | ---------- | ------------------------- |
| Reference data (instruments, genres) | 30 min     | Rarely changes            |
| User profile                         | 10 min     | Infrequently updated      |
| User list                            | 15 min     | Moderate change frequency |
| Content (music, concerts)            | 5 min      | Default, balanced         |
| Real-time (tickets, seating)         | 30-60 sec  | Frequently updated        |
| Notifications                        | 1 min      | Time-sensitive            |

```typescript
import { staleTimes } from '../lib/queryClient';

useQuery({
  queryKey: ['instruments'],
  queryFn: fetchInstruments,
  staleTime: staleTimes.instruments, // 30 minutes
});
```

### Cache Time (gcTime)

Controls how long unused data stays in cache:

| Data Type           | Cache Time | Purpose                       |
| ------------------- | ---------- | ----------------------------- |
| Reference data      | 1 hour     | Reduce API calls              |
| Content data        | 30 min     | Balance freshness/performance |
| Frequently changing | 10 min     | Prevent stale data            |

### Query Keys

Use consistent query keys for proper cache invalidation:

```typescript
import { queryKeys } from '../lib/queryClient';

// Standard patterns
queryKeys.users; // ['users']
queryKeys.user(id); // ['users', id]
queryKeys.musicPieces({ genre }); // ['musicPieces', { genre }]
queryKeys.concert(id); // ['concerts', id]
```

### Cache Persistence

Query cache persists to localStorage for offline support:

```typescript
import { queryPersister, persistOptions } from '../lib/queryClient';

// In App.tsx
<PersistQueryClientProvider
  client={queryClient}
  persistOptions={{
    persister: queryPersister,
    maxAge: persistOptions.maxAge,  // 24 hours
    buster: persistOptions.buster,  // Cache version for invalidation
  }}
>
  <App />
</PersistQueryClientProvider>
```

## Database Indexes

### Core Performance Indexes

The migration `20260502000001_add_performance_indexes.ts` adds indexes for common query patterns:

```sql
-- Session management (frequent lookups)
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(token_hash);

-- Attendance queries (join-heavy)
CREATE INDEX idx_rehearsal_attendance_compound ON rehearsal_attendance(rehearsal_id, user_id);
CREATE INDEX idx_concert_attendance_concert ON concert_attendance(concert_id);
CREATE INDEX idx_concert_attendance_user ON concert_attendance(user_id);

-- Equipment loans (history queries)
CREATE INDEX idx_equipment_loans_user ON equipment_loans(user_id);
CREATE INDEX idx_equipment_loans_equipment ON equipment_loans(equipment_id);
```

### User-Related Indexes

```sql
-- User queries by association and status
CREATE INDEX idx_users_association_status ON users(association_id, status);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_microsoft_id ON users(microsoft_id);
CREATE INDEX idx_users_last_login ON users(last_login);

-- User relationships
CREATE INDEX idx_user_orchestras_orchestra ON user_orchestras(orchestra_id);
CREATE INDEX idx_user_orchestras_user ON user_orchestras(user_id);
CREATE INDEX idx_user_instruments_instrument ON user_instruments(instrument_id);
CREATE INDEX idx_user_instruments_user ON user_instruments(user_id);
```

### Music-Related Indexes

```sql
-- Music piece lookups
CREATE INDEX idx_music_pieces_uploaded_by ON music_pieces(uploaded_by);
CREATE INDEX idx_music_pieces_created_at ON music_pieces(created_at);
CREATE INDEX idx_music_pieces_title_association ON music_pieces(title, association_id);

-- Music lists
CREATE INDEX idx_music_list_pieces_piece ON music_list_pieces(music_piece_id);
CREATE INDEX idx_music_list_pieces_list ON music_list_pieces(music_list_id);
CREATE INDEX idx_music_lists_orchestra ON music_lists(orchestra_id);
CREATE INDEX idx_music_lists_active ON music_lists(is_active);
```

### Event Indexes

```sql
-- Rehearsals
CREATE INDEX idx_rehearsals_orchestra ON rehearsals(orchestra_id);
CREATE INDEX idx_rehearsals_type ON rehearsals(type);
CREATE INDEX idx_rehearsals_date_association ON rehearsals(date, association_id);

-- Concerts
CREATE INDEX idx_concerts_date_association ON concerts(date, association_id);
CREATE INDEX idx_concerts_type ON concerts(concert_type);
```

### Index Best Practices

1. **Index foreign keys**: Always index columns used in JOINs
2. **Compound indexes**: Create multi-column indexes for common WHERE clauses
3. **Use IF NOT EXISTS**: Prevents errors on repeated migrations
4. **Monitor query plans**: Use `EXPLAIN QUERY PLAN` to verify index usage

## Bundle Size Optimization

### Code Splitting with Vite

The Vite configuration (`frontend/vite.config.ts`) uses manual chunks for optimal loading:

```typescript
rollupOptions: {
  output: {
    manualChunks: {
      // Core React - loaded first
      'vendor-react': ['react', 'react-dom', 'react-router-dom'],

      // State management
      'vendor-query': [
        '@tanstack/react-query',
        '@tanstack/react-query-persist-client',
        '@tanstack/query-sync-storage-persister',
      ],

      // Heavy libraries - loaded on demand
      'vendor-pdf': ['pdfjs-dist'],

      // Forms
      'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod'],

      // Drag and drop
      'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],

      // i18n
      'vendor-i18n': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],

      // Utilities
      'vendor-utils': ['axios', 'date-fns', 'idb', 'ua-parser-js'],
    },
  },
},
```

### Benefits

| Chunk        | Size   | Loading           |
| ------------ | ------ | ----------------- |
| vendor-react | ~140KB | Initial load      |
| vendor-query | ~45KB  | Initial load      |
| vendor-pdf   | ~800KB | On PDF view       |
| vendor-forms | ~35KB  | On form pages     |
| vendor-dnd   | ~25KB  | On sortable lists |

### Chunk Size Warning

```typescript
build: {
  chunkSizeWarningLimit: 1000, // 1MB for PDF.js
},
```

## PWA Caching Strategies

### Service Worker Configuration

The service worker (`frontend/src/sw-custom.ts`) implements multiple caching strategies:

### Network-First (Default API)

For data that should be fresh but fallback to cache:

```typescript
registerRoute(
  ({ request, url }) => {
    return request.method === 'GET' && url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth');
  },
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24, // 24 hours
      }),
    ],
    networkTimeoutSeconds: 5, // Fast fallback to cache
  }),
);
```

### Stale-While-Revalidate

For data that can be slightly stale:

```typescript
// User profile
registerRoute(
  /\/api\/auth\/me$/,
  new StaleWhileRevalidate({
    cacheName: 'user-profile-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 1,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
      }),
    ],
  }),
);

// Reference data
registerRoute(
  /\/api\/(orchestras|instruments|genres)$/,
  new StaleWhileRevalidate({
    cacheName: 'reference-data-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
      }),
    ],
  }),
);
```

### Cache-First

For static assets that rarely change:

```typescript
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
  })
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
  })
);

// PDFs and Music files
registerRoute(/\.pdf$/, new CacheFirst({ cacheName: 'pdf-cache', ... }));
registerRoute(/\.mp3$/, new CacheFirst({ cacheName: 'music-cache', ... }));
```

### Cache Expiration Summary

| Cache                | Max Entries | Max Age  |
| -------------------- | ----------- | -------- |
| api-cache            | 200         | 24 hours |
| user-profile-cache   | 1           | 7 days   |
| reference-data-cache | 100         | 7 days   |
| image-cache          | 200         | 30 days  |
| font-cache           | 20          | 1 year   |
| pdf-cache            | 200         | 14 days  |
| music-cache          | 50          | 30 days  |

### Background Sync

Offline mutations are queued and synced when online:

```typescript
registerRoute(
  ({ request, url }) => {
    return ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method) && url.pathname.startsWith('/api/');
  },
  new NetworkFirst({
    plugins: [
      new BackgroundSyncPlugin('api-mutations-queue', {
        maxRetentionTime: 24 * 60, // 24 hours
      }),
    ],
  }),
);
```

## Image Optimization

### Recommendations

1. **Use WebP format**: Smaller file sizes with good quality
2. **Responsive images**: Serve different sizes based on viewport
3. **Lazy loading**: Load images as they enter viewport

```tsx
<img
  src="/images/concert.webp"
  srcSet="/images/concert-400.webp 400w, /images/concert-800.webp 800w"
  sizes="(max-width: 600px) 400px, 800px"
  loading="lazy"
  alt="Concert"
/>
```

### Thumbnail Generation

The backend generates thumbnails for uploaded images (`backend/src/routes/thumbnails.ts`).

## Monitoring Performance

### Health Check Endpoint

The `/api/health` endpoint reports system status:

```typescript
// Basic health check
GET / api / health;
// Returns: { status, timestamp, uptime, version, environment }

// Detailed health check (admin only)
GET / api / health / detailed;
// Returns: { status, services: { database, disk, memory }, system }
```

### Database Performance

Monitor query performance:

```typescript
import { logDb } from '../logging/logger';

const start = Date.now();
const result = db.prepare(query).all();
logDb('SELECT', 'users', undefined, Date.now() - start);
```

### React Query DevTools

In development, use React Query DevTools to monitor:

- Cache state
- Query timing
- Stale/fresh status
- Refetch behavior

## Best Practices

### 1. Optimize Queries

```typescript
// Good: Select only needed fields
const users = db.prepare('SELECT id, name, email FROM users WHERE status = ?').all('active');

// Avoid: Selecting all fields
const users = db.prepare('SELECT * FROM users WHERE status = ?').all('active');
```

### 2. Use Pagination

```typescript
// Good: Paginated queries
const pageSize = 25;
const offset = (page - 1) * pageSize;
const users = db.prepare('SELECT * FROM users LIMIT ? OFFSET ?').all(pageSize, offset);

// Avoid: Loading all data
const users = db.prepare('SELECT * FROM users').all();
```

### 3. Batch Operations

```typescript
// Good: Batch insert
const insert = db.prepare('INSERT INTO items VALUES (?, ?)');
const insertMany = db.transaction((items) => {
  for (const item of items) insert.run(item.id, item.name);
});
insertMany(items);

// Avoid: Individual inserts
items.forEach((item) => insert.run(item.id, item.name));
```

### 4. Cache Expensive Computations

```typescript
// Use React Query for computed data
const { data: statistics } = useQuery({
  queryKey: ['statistics', filters],
  queryFn: () => computeStatistics(filters),
  staleTime: staleTimes.content,
});
```

### 5. Prefetch Anticipated Data

```typescript
// Prefetch on hover
const queryClient = useQueryClient();

const handleHover = () => {
  queryClient.prefetchQuery({
    queryKey: queryKeys.concert(concertId),
    queryFn: () => fetchConcert(concertId),
  });
};
```
