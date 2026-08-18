import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFavorites, addFavorite, removeFavorite, checkFavorite } from '../api';
import { queryKeys } from '../lib/queryClient';
import { showSuccess, showError } from '../utils/toast';

/**
 * @description Hook for managing user's favorite music titles.
 * Provides fetching, adding, removing, and toggling favorites with optimistic updates.
 *
 * @returns {Object} Favorites state and controls
 * @returns {Array} returns.favorites - List of favorite music titles
 * @returns {boolean} returns.isLoading - Whether favorites are being fetched
 * @returns {Error} returns.error - Error if fetch failed
 * @returns {Function} returns.addFavorite - Add a music title to favorites
 * @returns {Function} returns.removeFavorite - Remove a music title from favorites
 * @returns {Function} returns.toggleFavorite - Toggle favorite status
 * @returns {Function} returns.isFavorite - Check if a music title is favorited
 * @returns {boolean} returns.isToggling - Whether a toggle operation is in progress
 *
 * @example
 * ```tsx
 * function MusicCard({ music }: { music: MusicTitle }) {
 *   const { isFavorite, toggleFavorite, isToggling } = useFavorites();
 *   const favorited = isFavorite(music.id);
 *
 *   return (
 *     <div>
 *       <h3>{music.title}</h3>
 *       <button
 *         onClick={() => toggleFavorite(music.id, favorited)}
 *         disabled={isToggling}
 *       >
 *         {favorited ? 'Unfavorite' : 'Favorite'}
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useFavorites() {
  const queryClient = useQueryClient();

  const {
    data: favorites = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.favorites,
    queryFn: getFavorites,
  });

  const addMutation = useMutation({
    mutationFn: addFavorite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.favorites });
      showSuccess('Toegevoegd aan favorieten');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Fout bij toevoegen aan favorieten');
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeFavorite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.favorites });
      showSuccess('Verwijderd uit favorieten');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Fout bij verwijderen uit favorieten');
    },
  });

  const toggleFavorite = async (musicTitleId: string, isFavorite: boolean) => {
    if (isFavorite) {
      await removeMutation.mutateAsync(musicTitleId);
    } else {
      await addMutation.mutateAsync(musicTitleId);
    }
  };

  const isFavorite = (musicTitleId: string): boolean => {
    return favorites.some((f: any) => f.id === musicTitleId);
  };

  return {
    favorites,
    isLoading,
    error,
    addFavorite: addMutation.mutateAsync,
    removeFavorite: removeMutation.mutateAsync,
    toggleFavorite,
    isFavorite,
    isToggling: addMutation.isPending || removeMutation.isPending,
  };
}

/**
 * @description Hook for checking the favorite status of a specific music title.
 * Useful when you only need to check one item without loading all favorites.
 *
 * @param {string | undefined} musicTitleId - The ID of the music title to check
 *
 * @returns {Object} Favorite status
 * @returns {boolean} returns.isFavorite - Whether the music title is favorited
 * @returns {boolean} returns.isLoading - Whether the status is being checked
 *
 * @example
 * ```tsx
 * function FavoriteIndicator({ musicId }: { musicId: string }) {
 *   const { isFavorite, isLoading } = useFavoriteStatus(musicId);
 *
 *   if (isLoading) return <Spinner size="sm" />;
 *   return isFavorite ? <HeartFilled /> : <HeartOutline />;
 * }
 * ```
 */
export function useFavoriteStatus(musicTitleId: string | undefined) {
  const { data, isLoading } = useQuery({
    queryKey: ['favoriteStatus', musicTitleId],
    queryFn: () => checkFavorite(musicTitleId!),
    enabled: !!musicTitleId,
  });

  return {
    isFavorite: data?.isFavorite ?? false,
    isLoading,
  };
}
