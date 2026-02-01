import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import { getGenres, createGenre, updateGenre, deleteGenre } from '../api';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

/**
 * Hook to fetch all genres
 */
export function useGenres() {
  return useQuery({
    queryKey: queryKeys.genres,
    queryFn: getGenres,
  });
}

/**
 * Hook to create a new genre
 */
export function useCreateGenre() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => createGenre(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.genres });
      showSuccess('Genre aangemaakt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update a genre
 */
export function useUpdateGenre() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateGenre(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.genres });
      showSuccess('Genre bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete a genre
 */
export function useDeleteGenre() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteGenre(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.genres });
      showSuccess('Genre verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}
