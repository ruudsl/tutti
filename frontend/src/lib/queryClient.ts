import { QueryClient } from '@tanstack/react-query';
import type { Query } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

/**
 * Stale time configuration per data type
 * Different data has different freshness requirements
 */
export const staleTimes = {
  // Reference data (rarely changes) - 30 minutes
  instruments: 1000 * 60 * 30,
  genres: 1000 * 60 * 30,
  orchestras: 1000 * 60 * 30,
  concertTypes: 1000 * 60 * 30,
  equipmentTypes: 1000 * 60 * 30,
  uniformTypes: 1000 * 60 * 30,

  // User profile - 10 minutes
  user: 1000 * 60 * 10,
  association: 1000 * 60 * 10,

  // User list data - 15 minutes (frequently accessed but doesn't change often)
  users: 1000 * 60 * 15,

  // Content data - 5 minutes (default)
  musicPieces: 1000 * 60 * 5,
  musicLists: 1000 * 60 * 5,
  musicTitles: 1000 * 60 * 5,
  concerts: 1000 * 60 * 5,
  rehearsals: 1000 * 60 * 5,

  // Frequently changing data - 1 minute
  tickets: 1000 * 60 * 1,
  seating: 1000 * 60 * 1,
  notifications: 1000 * 60 * 1,

  // Real-time data - 30 seconds
  ticketStats: 1000 * 30,
  attendees: 1000 * 30,

  // User activity - 2 minutes
  favorites: 1000 * 60 * 2,
  recentViews: 1000 * 60 * 2,
  practiceLogs: 1000 * 60 * 2,
};

/**
 * Cache time (gcTime) configuration per data type
 * How long data stays in cache after becoming unused
 */
export const cacheTimes = {
  // Reference data - 1 hour (keep in cache longer)
  instruments: 1000 * 60 * 60,
  genres: 1000 * 60 * 60,
  orchestras: 1000 * 60 * 60,
  concertTypes: 1000 * 60 * 60,
  users: 1000 * 60 * 60,

  // Content data - 30 minutes
  musicPieces: 1000 * 60 * 30,
  musicLists: 1000 * 60 * 30,
  musicTitles: 1000 * 60 * 30,

  // Frequently changing - 10 minutes
  tickets: 1000 * 60 * 10,
  seating: 1000 * 60 * 10,
};

/**
 * De 4xx-statussen die na een korte pauze alsnog kunnen slagen: een
 * tijdslimiet en een snelheidsbegrenzing. De rest van de 4xx-familie niet.
 */
const HERPROBEERBARE_STATUSSEN = new Set([408, 425, 429]);

/** De HTTP-status uit een axios-fout, of undefined bij een netwerkfout. */
function statusVan(error: unknown): number | undefined {
  const response = (error as { response?: { status?: unknown } } | null | undefined)?.response;
  return typeof response?.status === 'number' ? response.status : undefined;
}

/**
 * Bepaalt of een mislukte aanvraag nog een keer geprobeerd wordt.
 *
 * Een 401, 403, 404 of 422 verandert niet door hem te herhalen: de sessie is
 * verlopen, het mag niet, het bestaat niet of de invoer deugt niet. De
 * herhaling stelde alleen het foutscherm uit terwijl de gebruiker naar een
 * draaiend rondje keek - bij een verlopen sessie op elk scherm tegelijk.
 *
 * Een serverfout of een wegvallende verbinding is wél vaak van voorbijgaande
 * aard; die krijgt één herkansing.
 */
export function moetOpnieuwProberen(failureCount: number, error: unknown): boolean {
  const status = statusVan(error);
  if (status !== undefined && status >= 400 && status < 500 && !HERPROBEERBARE_STATUSSEN.has(status)) {
    return false;
  }
  return failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes default
      gcTime: 1000 * 60 * 60 * 24, // 24 hours - extended for offline support
      retry: moetOpnieuwProberen,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

const PERSIST_STORAGE_KEY = 'harmonie-query-cache';

// Check if we need to clear cache (e.g., after association switch)
if (typeof window !== 'undefined' && window.localStorage.getItem('harmonie-clear-cache')) {
  window.localStorage.removeItem('harmonie-clear-cache');
  window.localStorage.removeItem(PERSIST_STORAGE_KEY);
}

// Create persister for offline support (used by PersistQueryClientProvider in App.tsx)
// Wrapped in try-catch to handle corrupted localStorage data
export const queryPersister =
  typeof window !== 'undefined'
    ? createSyncStoragePersister({
        storage: window.localStorage,
        key: PERSIST_STORAGE_KEY,
        // Handle corrupted data by returning null (will clear cache)
        deserialize: (cachedString: string) => {
          try {
            return JSON.parse(cachedString);
          } catch {
            // Clear corrupted cache
            window.localStorage.removeItem(PERSIST_STORAGE_KEY);
            return undefined;
          }
        },
      })
    : null;

/**
 * Whitelist of queryKey prefixes that may be persisted to localStorage.
 * Only stable, non-sensitive reference data is persisted for offline support.
 * Personal data (users, invoices, contacts, tickets, etc.) is deliberately
 * excluded so it never lingers in localStorage after logout.
 */
const PERSISTED_QUERY_KEY_PREFIXES: readonly string[] = [
  'instruments',
  'genres',
  'orchestras',
  'vocabularies',
  'holidays',
  'concertTypes',
  'equipment-types',
  'packingTemplates',
];

export const persistOptions = {
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
  buster: 'v5', // Bumped: persisted cache is now filtered to reference data only
  dehydrateOptions: {
    shouldDehydrateQuery: (query: Query) =>
      query.state.status === 'success' &&
      typeof query.queryKey[0] === 'string' &&
      PERSISTED_QUERY_KEY_PREFIXES.includes(query.queryKey[0]),
  },
};

/**
 * Clears the persisted React Query cache from localStorage and empties the
 * in-memory query cache. Call this on logout so no cached (personal) data
 * remains behind.
 */
export function clearPersistedCache(): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(PERSIST_STORAGE_KEY);
    } catch {
      // Ignore localStorage errors (e.g. privacy mode)
    }
  }
  queryClient.clear();
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
  annotations: (musicPieceId: string, pageNumber?: number) => ['annotations', musicPieceId, pageNumber] as const,

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
