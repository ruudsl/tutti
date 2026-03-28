import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFavorites, addFavorite, removeFavorite, checkFavorite } from '../api';
import { queryKeys } from '../lib/queryClient';
import { showSuccess, showError } from '../utils/toast';

export function useFavorites() {
  const queryClient = useQueryClient();

  const { data: favorites = [], isLoading, error } = useQuery({
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
