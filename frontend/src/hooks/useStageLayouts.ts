import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getStageLayouts,
  getStageLayout,
  createStageLayout,
  updateStageLayout,
  deleteStageLayout,
  duplicateStageLayout,
  getConcertStage,
  saveConcertStage,
  deleteConcertStage,
  getPrintableSeatCards,
} from '../api';
import type { StageLayoutData, StageAssignment } from '../types';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

/**
 * Query keys for stage layouts
 */
export const stageLayoutKeys = {
  all: ['stageLayouts'] as const,
  lists: () => [...stageLayoutKeys.all, 'list'] as const,
  list: (includeTemplates: boolean) => [...stageLayoutKeys.lists(), { includeTemplates }] as const,
  details: () => [...stageLayoutKeys.all, 'detail'] as const,
  detail: (id: string) => [...stageLayoutKeys.details(), id] as const,
  concertStage: (concertId: string) => ['concertStage', concertId] as const,
  printCards: (concertId: string) => ['concertStage', concertId, 'print'] as const,
};

/**
 * Hook to fetch all stage layouts
 */
export function useStageLayouts(includeTemplates = false) {
  return useQuery({
    queryKey: stageLayoutKeys.list(includeTemplates),
    queryFn: () => getStageLayouts(includeTemplates),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch a single stage layout with full data
 */
export function useStageLayout(id: string) {
  return useQuery({
    queryKey: stageLayoutKeys.detail(id),
    queryFn: () => getStageLayout(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to create a new stage layout
 */
export function useCreateStageLayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (layout: {
      name: string;
      description?: string;
      venueName?: string;
      stageWidth?: number;
      stageDepth?: number;
      isTemplate?: boolean;
      isDefault?: boolean;
      layoutData?: StageLayoutData;
      thumbnailUrl?: string;
    }) => createStageLayout(layout),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stageLayoutKeys.all });
      showSuccess('Podiumindeling aangemaakt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update a stage layout
 */
export function useUpdateStageLayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      layout,
    }: {
      id: string;
      layout: {
        name?: string;
        description?: string;
        venueName?: string;
        stageWidth?: number;
        stageDepth?: number;
        isTemplate?: boolean;
        isDefault?: boolean;
        layoutData?: StageLayoutData;
        thumbnailUrl?: string;
      };
    }) => updateStageLayout(id, layout),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: stageLayoutKeys.all });
      queryClient.invalidateQueries({ queryKey: stageLayoutKeys.detail(id) });
      showSuccess('Podiumindeling bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete a stage layout
 */
export function useDeleteStageLayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteStageLayout(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stageLayoutKeys.all });
      showSuccess('Podiumindeling verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to duplicate a stage layout
 */
export function useDuplicateStageLayout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name?: string }) => duplicateStageLayout(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stageLayoutKeys.all });
      showSuccess('Podiumindeling gedupliceerd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to fetch concert stage assignment
 */
export function useConcertStage(concertId: string) {
  return useQuery({
    queryKey: stageLayoutKeys.concertStage(concertId),
    queryFn: () => getConcertStage(concertId),
    enabled: !!concertId,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}

/**
 * Hook to save concert stage assignment
 */
export function useSaveConcertStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      concertId,
      layoutId,
      assignments,
    }: {
      concertId: string;
      layoutId: string;
      assignments: Record<string, StageAssignment>;
    }) => saveConcertStage(concertId, layoutId, assignments),
    onSuccess: (_, { concertId }) => {
      queryClient.invalidateQueries({
        queryKey: stageLayoutKeys.concertStage(concertId),
      });
      showSuccess('Podiumindeling voor concert opgeslagen');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete concert stage assignment
 */
export function useDeleteConcertStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (concertId: string) => deleteConcertStage(concertId),
    onSuccess: (_, concertId) => {
      queryClient.invalidateQueries({
        queryKey: stageLayoutKeys.concertStage(concertId),
      });
      showSuccess('Podiumindeling van concert verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to fetch printable seat cards
 */
export function usePrintableSeatCards(concertId: string) {
  return useQuery({
    queryKey: stageLayoutKeys.printCards(concertId),
    queryFn: () => getPrintableSeatCards(concertId),
    enabled: !!concertId,
    staleTime: 1000 * 60, // 1 minute
  });
}
