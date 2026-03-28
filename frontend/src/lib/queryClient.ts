import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 60 * 24, // 24 hours - extended for offline support
      retry: 1,
      refetchOnWindowFocus: false,
      networkMode: 'offlineFirst', // Try cache first for offline support
    },
    mutations: {
      retry: 0,
      networkMode: 'offlineFirst',
    },
  },
});

// Persist queries to localStorage for offline support
if (typeof window !== 'undefined') {
  const localStoragePersister = createSyncStoragePersister({
    storage: window.localStorage,
    key: 'harmonie-query-cache',
  });

  persistQueryClient({
    queryClient,
    persister: localStoragePersister,
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    buster: 'v1', // Change this to invalidate cache on breaking changes
  });
}

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
};
