import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import { getOrchestras, createOrchestra, updateOrchestra, deleteOrchestra } from '../api';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

/**
 * Hook to fetch all orchestras
 */
export function useOrchestras() {
  return useQuery({
    queryKey: queryKeys.orchestras,
    queryFn: getOrchestras,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/**
 * Hook to create a new orchestra
 */
export function useCreateOrchestra() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => createOrchestra(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orchestras });
      showSuccess('Orkest aangemaakt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update an orchestra
 */
export function useUpdateOrchestra() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateOrchestra(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orchestras });
      showSuccess('Orkest bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete an orchestra
 */
export function useDeleteOrchestra() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteOrchestra(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orchestras });
      showSuccess('Orkest verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}
