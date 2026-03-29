import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 60 * 24, // 24 hours - extended for offline support
      retry: 1,
      refetchOnWindowFocus: false,
      // Use 'online' mode (default) - service worker handles offline caching
      // 'offlineFirst' can cause queries to hang on initial page load
    },
    mutations: {
      retry: 0,
    },
  },
});

// Create persister for offline support (used by PersistQueryClientProvider in App.tsx)
// Wrapped in try-catch to handle corrupted localStorage data
export const queryPersister = typeof window !== 'undefined'
  ? createSyncStoragePersister({
      storage: window.localStorage,
      key: 'harmonie-query-cache',
      // Handle corrupted data by returning null (will clear cache)
      deserialize: (cachedString: string) => {
        try {
          return JSON.parse(cachedString);
        } catch {
          // Clear corrupted cache
          window.localStorage.removeItem('harmonie-query-cache');
          return undefined;
        }
      },
    })
  : null;

export const persistOptions = {
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
  buster: 'v2', // Bumped to invalidate potentially corrupted cache
};

/**
 * Query keys for consistent cache management
 */
export const queryKeys = {
  // Users
  users: ['users'] as const,
  user: (id: string) => ['users', id] as const,

  // Instruments
  instruments: ['instruments'] as const,
  instrument: (id: string) => ['instruments', id] as const,

  // Orchestras
  orchestras: ['orchestras'] as const,
  orchestra: (id: string) => ['orchestras', id] as const,

  // Genres
  genres: ['genres'] as const,
  genre: (id: string) => ['genres', id] as const,

  // Music pieces
  musicPieces: (filters?: Record<string, string>) => ['musicPieces', filters] as const,
  musicPiece: (id: string) => ['musicPieces', id] as const,
  musicTitles: (filters?: Record<string, string>) => ['musicTitles', filters] as const,
  titleMeta: (title: string, arranger?: string) => ['titleMeta', title, arranger] as const,

  // Music lists
  musicLists: (orchestraId?: string) => ['musicLists', orchestraId] as const,
  musicList: (id: string) => ['musicLists', 'detail', id] as const,
  myLists: ['musicLists', 'my'] as const,

  // Association
  association: ['association'] as const,
  associations: ['associations'] as const,

  // Equipment
  equipment: (filters?: Record<string, string>) => ['equipment', filters] as const,
  equipmentItem: (id: string) => ['equipment', id] as const,
  equipmentTypes: ['equipment', 'types'] as const,
  maintenanceAlerts: ['equipment', 'maintenance-alerts'] as const,

  // Uniforms
  uniformItems: (filters?: Record<string, string>) => ['uniforms', 'items', filters] as const,
  uniformItem: (id: string) => ['uniforms', 'items', id] as const,
  uniformSets: ['uniforms', 'sets'] as const,
  uniformSet: (id: string) => ['uniforms', 'sets', id] as const,
  uniformItemTypes: ['uniforms', 'item-types'] as const,
  uniformAvailability: (itemType?: string) => ['uniforms', 'availability', itemType] as const,
  userUniforms: (userId: string) => ['uniforms', 'user', userId] as const,

  // Concerts
  concerts: (filters?: Record<string, string>) => ['concerts', filters] as const,
  concert: (id: string) => ['concerts', id] as const,
  concertTypes: ['concerts', 'types'] as const,
  concertYears: ['concerts', 'years'] as const,
  concertStatistics: ['concerts', 'statistics'] as const,
  pieceHistory: (title: string) => ['concerts', 'piece-history', title] as const,

  // Favorites
  favorites: ['favorites'] as const,
  favoriteStatus: (musicTitleId: string) => ['favorites', 'status', musicTitleId] as const,

  // Practice tracker
  practiceLogs: (musicTitleId?: string) => ['practice', 'logs', musicTitleId] as const,
  practiceStats: ['practice', 'stats'] as const,

  // Recent views
  recentViews: (type?: string, limit?: number) => ['recent', type, limit] as const,

  // Annotations
  annotations: (musicPieceId: string, pageNumber?: number) =>
    ['annotations', musicPieceId, pageNumber] as const,

  // Sessions
  sessions: ['sessions'] as const,

  // Tickets
  concertTickets: (concertId: string) => ['tickets', 'concert', concertId] as const,
  ticketOrder: (orderId: string) => ['tickets', 'order', orderId] as const,
  myTickets: ['tickets', 'my'] as const,
  ticketStats: (concertId: string) => ['tickets', 'stats', concertId] as const,
  attendees: (concertId: string) => ['tickets', 'attendees', concertId] as const,

  // Ticket Transfers
  transferableTickets: ['tickets', 'transferable'] as const,
  pendingTransfers: ['tickets', 'transfers', 'pending'] as const,
  transferHistory: ['tickets', 'transfers', 'history'] as const,
  transferByCode: (code: string) => ['tickets', 'transfers', 'code', code] as const,
};
