import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '../lib/queryClient';
import {
  getMusicPieces,
  getMusicPiecesPaginated,
  updateMusicPiece,
  deleteMusicPiece,
  deleteMusicPiecesBulk,
  restoreMusicPiece,
  bulkUpdatePieces,
  refreshInstrumentLinks,
  type PaginatedResponse,
} from '../api';
import type { MusicPiece } from '../types';
import { showSuccess, showError, showUndoToast } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

interface MusicPiecesFilters {
  search?: string;
  instrumentId?: string;
  listId?: string;
}

interface PaginatedMusicPiecesFilters extends MusicPiecesFilters {
  page?: number;
  pageSize?: number;
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
 * Hook to fetch music pieces with pagination
 */
export function useMusicPiecesPaginated(filters?: PaginatedMusicPiecesFilters) {
  return useQuery<PaginatedResponse<MusicPiece>>({
    queryKey: [
      ...queryKeys.musicPieces(filters as Record<string, string>),
      'paginated',
      filters?.page,
      filters?.pageSize,
    ],
    queryFn: () => getMusicPiecesPaginated(filters),
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Hook to update a music piece
 */
export function useUpdateMusicPiece() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        title?: string;
        arranger?: string;
        instrumentId?: string;
        tuning?: string;
        groupNumber?: string;
        clef?: string;
        youtubeUrl?: string;
        isShared?: boolean;
      };
    }) => updateMusicPiece(id, data),
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
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (id: string) => deleteMusicPiece(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['musicPieces'] });
      // De lijstoverzichten tellen alleen stukken zonder deleted_at
      // (routes/music-lists.ts), dus pieceCount en titleCount veranderen mee.
      queryClient.invalidateQueries({ queryKey: ['musicLists'] });
      showUndoToast(t('musicPieces.deleted'), t('common.undo'), async () => {
        try {
          await restoreMusicPiece(id);
          queryClient.invalidateQueries({ queryKey: ['musicPieces'] });
          queryClient.invalidateQueries({ queryKey: ['musicLists'] });
          showSuccess(t('musicPieces.restored'));
        } catch (error) {
          showError(getErrorMessage(error));
        }
      });
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
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (ids: string[]) => deleteMusicPiecesBulk(ids),
    onSuccess: (result, ids) => {
      queryClient.invalidateQueries({ queryKey: ['musicPieces'] });
      // De lijstoverzichten tellen alleen stukken zonder deleted_at
      // (routes/music-lists.ts), dus pieceCount en titleCount veranderen mee.
      queryClient.invalidateQueries({ queryKey: ['musicLists'] });
      showUndoToast(t('musicPieces.deletedBulk', { count: result.count }), t('common.undo'), async () => {
        try {
          await Promise.all(ids.map((id) => restoreMusicPiece(id)));
          queryClient.invalidateQueries({ queryKey: ['musicPieces'] });
          queryClient.invalidateQueries({ queryKey: ['musicLists'] });
          showSuccess(t('musicPieces.restoredBulk', { count: ids.length }));
        } catch (error) {
          showError(getErrorMessage(error));
          queryClient.invalidateQueries({ queryKey: ['musicPieces'] });
        }
      });
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to bulk update music pieces (instrument, add/remove from list)
 */
export function useBulkUpdatePieces() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      pieceIds,
      updates,
    }: {
      pieceIds: string[];
      updates: {
        instrumentId?: string | null;
        addToListId?: string;
        removeFromListId?: string;
      };
    }) => bulkUpdatePieces(pieceIds, updates),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['musicPieces'] });
      queryClient.invalidateQueries({ queryKey: ['musicLists'] });
      showSuccess(`${result.updated} muziekstukken bijgewerkt`);
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
