import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import {
  getMusicPieces,
  updateMusicPiece,
  deleteMusicPiece,
  deleteMusicPiecesBulk,
  refreshInstrumentLinks,
} from '../api';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

interface MusicPiecesFilters {
  search?: string;
  instrumentId?: string;
  listId?: string;
}

/**
 * Hook to fetch music pieces with optional filters
 */
export function useMusicPieces(filters?: MusicPiecesFilters) {
  return useQuery({
    queryKey: queryKeys.musicPieces(filters as Record<string, string>),
    queryFn: () => getMusicPieces(filters),
  });
}

/**
 * Hook to update a music piece
 */
export function useUpdateMusicPiece() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: {
      title?: string;
      arranger?: string;
      instrumentId?: string;
      tuning?: string;
      groupNumber?: string;
      clef?: string;
      youtubeUrl?: string;
      isShared?: boolean;
    }}) => updateMusicPiece(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['musicPieces'] });
      showSuccess('Muziekstuk bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete a music piece
 */
export function useDeleteMusicPiece() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteMusicPiece(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['musicPieces'] });
      showSuccess('Muziekstuk verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to bulk delete music pieces
 */
export function useDeleteMusicPiecesBulk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => deleteMusicPiecesBulk(ids),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['musicPieces'] });
      showSuccess(`${result.count} muziekstukken verwijderd`);
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to refresh instrument links for all music pieces
 */
export function useRefreshInstrumentLinks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: refreshInstrumentLinks,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['musicPieces'] });
      showSuccess(`Instrumenten bijgewerkt: ${result.updated} gekoppeld, ${result.alreadyLinked} waren al gekoppeld`);
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}
