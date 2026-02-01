import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import {
  getMusicLists,
  getMyMusicLists,
  getMusicList,
  createMusicList,
  updateMusicList,
  deleteMusicList,
  addPieceToList,
  removePieceFromList,
  addTitleToList,
  removeTitleFromList,
  toggleMusicListActive,
} from '../api';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

/**
 * Hook to fetch music lists for an orchestra
 */
export function useMusicLists(orchestraId?: string) {
  return useQuery({
    queryKey: queryKeys.musicLists(orchestraId),
    queryFn: () => getMusicLists(orchestraId!),
    enabled: !!orchestraId,
  });
}

/**
 * Hook to fetch my music lists
 */
export function useMyMusicLists() {
  return useQuery({
    queryKey: queryKeys.myLists,
    queryFn: getMyMusicLists,
  });
}

/**
 * Hook to fetch a single music list with pieces
 */
export function useMusicList(id?: string) {
  return useQuery({
    queryKey: queryKeys.musicList(id!),
    queryFn: () => getMusicList(id!),
    enabled: !!id,
  });
}

/**
 * Hook to create a music list
 */
export function useCreateMusicList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, orchestraId }: { name: string; orchestraId: string }) =>
      createMusicList(name, orchestraId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.musicLists(variables.orchestraId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orchestras });
      showSuccess('Muzieklijst aangemaakt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update a music list
 */
export function useUpdateMusicList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateMusicList(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['musicLists'] });
      showSuccess('Muzieklijst bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete a music list
 */
export function useDeleteMusicList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteMusicList(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['musicLists'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.orchestras });
      showSuccess('Muzieklijst verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to add a piece to a list
 */
export function useAddPieceToList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listId, pieceId }: { listId: string; pieceId: string }) =>
      addPieceToList(listId, pieceId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.musicList(variables.listId) });
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to remove a piece from a list
 */
export function useRemovePieceFromList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listId, pieceId }: { listId: string; pieceId: string }) =>
      removePieceFromList(listId, pieceId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.musicList(variables.listId) });
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to add a title to a list
 */
export function useAddTitleToList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listId, title }: { listId: string; title: string }) =>
      addTitleToList(listId, title),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.musicList(variables.listId) });
      showSuccess(`${result.added} stuk(ken) toegevoegd aan lijst`);
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to remove a title from a list
 */
export function useRemoveTitleFromList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listId, title }: { listId: string; title: string }) =>
      removeTitleFromList(listId, title),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.musicList(variables.listId) });
      showSuccess(`${result.removed} stuk(ken) verwijderd uit lijst`);
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to toggle music list active state
 */
export function useToggleMusicListActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listId: string) => toggleMusicListActive(listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['musicLists'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.orchestras });
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}
