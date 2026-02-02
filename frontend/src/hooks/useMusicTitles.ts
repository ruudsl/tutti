import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import { getMusicTitles } from '../api';

interface MusicTitlesFilters {
  search?: string;
  listId?: string;
  genreId?: string;
}

/**
 * Hook to fetch music titles with optional filters
 */
export function useMusicTitles(filters?: MusicTitlesFilters) {
  return useQuery({
    queryKey: queryKeys.musicTitles(filters as Record<string, string>),
    queryFn: () => getMusicTitles(filters),
  });
}
