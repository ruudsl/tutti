# State Management with React Query

This document describes the state management patterns used in the Harmonie Muziek application, primarily powered by TanStack Query (React Query).

## Overview

The application uses React Query for server state management, providing:
- Automatic caching and background refetching
- Optimistic updates for better UX
- Offline support with persistence
- Deduplication of requests
- Pagination and infinite scroll support

## Query Client Configuration

The query client is configured in `frontend/src/lib/queryClient.ts`:

```typescript
import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,      // 5 minutes default
      gcTime: 1000 * 60 * 60 * 24,   // 24 hours for offline support
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
```

## Stale Time Configuration

Different data types have different freshness requirements:

```typescript
export const staleTimes = {
  // Reference data (rarely changes) - 30 minutes
  instruments: 1000 * 60 * 30,
  genres: 1000 * 60 * 30,
  orchestras: 1000 * 60 * 30,
  concertTypes: 1000 * 60 * 30,

  // User profile - 10 minutes
  user: 1000 * 60 * 10,
  users: 1000 * 60 * 15,

  // Content data - 5 minutes
  musicPieces: 1000 * 60 * 5,
  musicLists: 1000 * 60 * 5,
  concerts: 1000 * 60 * 5,
  rehearsals: 1000 * 60 * 5,

  // Frequently changing - 1 minute
  tickets: 1000 * 60 * 1,
  seating: 1000 * 60 * 1,
  notifications: 1000 * 60 * 1,

  // Real-time data - 30 seconds
  ticketStats: 1000 * 30,
  attendees: 1000 * 30,

  // User activity - 2 minutes
  favorites: 1000 * 60 * 2,
  recentViews: 1000 * 60 * 2,
};
```

## Query Keys

Centralized query keys ensure consistent cache management:

```typescript
export const queryKeys = {
  // Simple keys
  users: ['users'] as const,
  instruments: ['instruments'] as const,
  favorites: ['favorites'] as const,
  
  // Parameterized keys
  user: (id: string) => ['users', id] as const,
  concert: (id: string) => ['concerts', id] as const,
  
  // Keys with filters
  musicPieces: (filters?: Record<string, string>) => ['musicPieces', filters] as const,
  concerts: (filters?: Record<string, string>) => ['concerts', filters] as const,
  
  // Nested keys
  concertTickets: (concertId: string) => ['tickets', 'concert', concertId] as const,
  annotations: (musicPieceId: string, pageNumber?: number) =>
    ['annotations', musicPieceId, pageNumber] as const,
};
```

## Query Patterns

### Basic Query

```typescript
import { useQuery } from '@tanstack/react-query';
import { queryKeys, staleTimes } from '../lib/queryClient';

export function useConcerts(filters?: ConcertFilters) {
  return useQuery({
    queryKey: queryKeys.concerts(filters),
    queryFn: () => getConcerts(filters),
    staleTime: staleTimes.concerts,
  });
}
```

### Query with Dependencies

```typescript
export function useConcert(id: string) {
  return useQuery({
    queryKey: queryKeys.concert(id),
    queryFn: () => getConcert(id),
    enabled: !!id,  // Only fetch when id is provided
  });
}
```

### Paginated Query

```typescript
export function useUsersPaginated(filters?: UsersFilters) {
  return useQuery({
    queryKey: ['users', 'paginated', filters],
    queryFn: () => getUsersPaginated(filters),
    staleTime: staleTimes.users,
  });
}
```

### Infinite Query

```typescript
import { useInfiniteQuery } from '@tanstack/react-query';

export function useUsersInfinite(filters?: Omit<UsersFilters, 'page'>) {
  return useInfiniteQuery({
    queryKey: ['users', 'infinite', filters],
    queryFn: ({ pageParam = 1 }) => getUsersPaginated({ ...filters, page: pageParam }),
    getNextPageParam: (lastPage) => {
      const nextPage = lastPage.page + 1;
      return nextPage <= lastPage.totalPages ? nextPage : undefined;
    },
    initialPageParam: 1,
    staleTime: staleTimes.users,
  });
}
```

### Query with Select

```typescript
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: getNotifications,
    select: (data) => data.filter(n => !n.read).length,
  });
}
```

## Mutation Patterns

### Basic Mutation

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useCreateConcert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createConcert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concerts'] });
      showSuccess('Concert aangemaakt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}
```

### Mutation with Variables

```typescript
export function useUpdateConcert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ConcertUpdate }) =>
      updateConcert(id, data),
    onSuccess: (_, { id }) => {
      // Invalidate specific concert
      queryClient.invalidateQueries({ queryKey: queryKeys.concert(id) });
      // Invalidate concerts list
      queryClient.invalidateQueries({ queryKey: ['concerts'] });
      showSuccess('Concert bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}
```

### Optimistic Updates

```typescript
export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      isFavorite ? removeFavorite(id) : addFavorite(id),
    
    // Optimistically update the cache
    onMutate: async ({ id, isFavorite }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.favorites });
      
      // Snapshot current value
      const previousFavorites = queryClient.getQueryData(queryKeys.favorites);
      
      // Optimistically update
      queryClient.setQueryData(queryKeys.favorites, (old: Favorite[]) => {
        if (isFavorite) {
          return old.filter(f => f.id !== id);
        } else {
          return [...old, { id, addedAt: new Date().toISOString() }];
        }
      });
      
      // Return context for rollback
      return { previousFavorites };
    },
    
    // Rollback on error
    onError: (_err, _variables, context) => {
      if (context?.previousFavorites) {
        queryClient.setQueryData(queryKeys.favorites, context.previousFavorites);
      }
      showError('Fout bij bijwerken favorieten');
    },
    
    // Always refetch after success or error
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.favorites });
    },
  });
}
```

### Complex Optimistic Update (Reordering)

```typescript
export function useReorderProgram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ concertId, items }: ReorderParams) =>
      reorderConcertProgram(concertId, items),
    
    onMutate: async ({ concertId, items }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.concert(concertId) });
      
      const previousConcert = queryClient.getQueryData(queryKeys.concert(concertId));
      
      // Update program order optimistically
      queryClient.setQueryData(queryKeys.concert(concertId), (old: Concert) => ({
        ...old,
        program: old.program.map(item => {
          const newOrder = items.find(i => i.id === item.id);
          return newOrder ? { ...item, sortOrder: newOrder.sortOrder } : item;
        }).sort((a, b) => a.sortOrder - b.sortOrder),
      }));
      
      return { previousConcert };
    },
    
    onError: (_err, { concertId }, context) => {
      if (context?.previousConcert) {
        queryClient.setQueryData(queryKeys.concert(concertId), context.previousConcert);
      }
    },
    
    onSettled: (_, __, { concertId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.concert(concertId) });
    },
  });
}
```

## Caching Strategy

### Cache Time (gcTime)

Different data types have different cache retention:

```typescript
export const cacheTimes = {
  // Reference data - 1 hour
  instruments: 1000 * 60 * 60,
  genres: 1000 * 60 * 60,
  orchestras: 1000 * 60 * 60,
  users: 1000 * 60 * 60,

  // Content data - 30 minutes
  musicPieces: 1000 * 60 * 30,
  musicLists: 1000 * 60 * 30,

  // Frequently changing - 10 minutes
  tickets: 1000 * 60 * 10,
  seating: 1000 * 60 * 10,
};
```

### Cache Persistence

Query cache is persisted to localStorage for offline support:

```typescript
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';

export const queryPersister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'harmonie-query-cache',
  deserialize: (cachedString: string) => {
    try {
      return JSON.parse(cachedString);
    } catch {
      // Clear corrupted cache
      window.localStorage.removeItem('harmonie-query-cache');
      return undefined;
    }
  },
});

export const persistOptions = {
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
  buster: 'v4', // Version to invalidate cache on updates
};

// In App.tsx
<PersistQueryClientProvider
  client={queryClient}
  persistOptions={{ persister: queryPersister, ...persistOptions }}
>
  <App />
</PersistQueryClientProvider>
```

### Cache Invalidation Patterns

```typescript
// Invalidate specific query
queryClient.invalidateQueries({ queryKey: queryKeys.concert(id) });

// Invalidate all concerts
queryClient.invalidateQueries({ queryKey: ['concerts'] });

// Invalidate with predicate
queryClient.invalidateQueries({
  predicate: (query) =>
    query.queryKey[0] === 'concerts' ||
    query.queryKey[0] === 'concertStatistics',
});

// Force refetch (bypass staleTime)
queryClient.refetchQueries({ queryKey: queryKeys.concert(id) });

// Clear cache completely
queryClient.clear();
```

## Error Handling

### Global Error Handler

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      onError: (error) => {
        // Global mutation error handling
        if (error instanceof ApiError && error.status === 401) {
          // Redirect to login
          window.location.href = '/login';
        }
      },
    },
  },
});
```

### Hook-level Error Handling

```typescript
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createUser,
    onError: (error) => {
      // Specific error handling
      if (error.response?.status === 409) {
        showError('E-mailadres is al in gebruik');
      } else {
        showError(getErrorMessage(error));
      }
    },
  });
}
```

## Prefetching

### On Hover

```typescript
const queryClient = useQueryClient();

const handleMouseEnter = (id: string) => {
  queryClient.prefetchQuery({
    queryKey: queryKeys.concert(id),
    queryFn: () => getConcert(id),
    staleTime: staleTimes.concerts,
  });
};
```

### On Mount

```typescript
export function usePrefetchRelatedData(concertId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Prefetch related data in background
    queryClient.prefetchQuery({
      queryKey: queryKeys.concertTickets(concertId),
      queryFn: () => getConcertTickets(concertId),
    });
  }, [concertId, queryClient]);
}
```

## Background Updates

### Automatic Refetching

```typescript
// Refetch on window focus (disabled by default in this app)
useQuery({
  queryKey: ['notifications'],
  queryFn: getNotifications,
  refetchOnWindowFocus: true,
  refetchInterval: 60000, // Poll every minute
});
```

### Manual Background Sync

```typescript
const { refetch } = useQuery({
  queryKey: queryKeys.tickets(concertId),
  queryFn: () => getTickets(concertId),
});

// Trigger background refetch
refetch({ cancelRefetch: false });
```

## Local State vs Server State

Use React Query for **server state** (data from API):
- User data, concerts, music pieces
- Anything that needs caching, syncing, or invalidation

Use React's `useState`/`useReducer` for **local state**:
- Form inputs before submission
- UI state (modals, menus, tabs)
- Client-only preferences

Use React Context for **global client state**:
- Authentication state
- Theme preferences
- Language settings

## Best Practices

1. **Use centralized query keys** - Ensures consistent cache management
2. **Set appropriate staleTime** - Based on how often data changes
3. **Invalidate related queries** - When mutations affect multiple queries
4. **Use optimistic updates** - For better UX on common actions
5. **Handle errors gracefully** - Show user-friendly messages
6. **Prefetch strategically** - Anticipate user navigation
7. **Don't over-fetch** - Use `enabled` to control when queries run
8. **Consider offline** - Configure gcTime for offline support
