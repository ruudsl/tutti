import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

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
};
