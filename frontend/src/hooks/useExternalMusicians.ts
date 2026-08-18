import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getExternalMusicians,
  getExternalMusician,
  createExternalMusician,
  updateExternalMusician,
  deleteExternalMusician,
  searchExternalMusiciansByInstrument,
  addInstrumentToMusician,
  removeInstrumentFromMusician,
  CreateExternalMusicianData,
  UpdateExternalMusicianData,
} from '../api/external-musicians';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

// Query keys
export const externalMusicianKeys = {
  all: ['externalMusicians'] as const,
  lists: () => [...externalMusicianKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...externalMusicianKeys.lists(), filters] as const,
  details: () => [...externalMusicianKeys.all, 'detail'] as const,
  detail: (id: string) => [...externalMusicianKeys.details(), id] as const,
  search: (instrumentId: string, options?: Record<string, any>) =>
    [...externalMusicianKeys.all, 'search', instrumentId, options] as const,
};

/**
 * Hook to fetch all external musicians with optional filters
 */
export function useExternalMusicians(filters?: {
  type?: string;
  instrumentId?: string;
  isActive?: boolean;
  search?: string;
}) {
  return useQuery({
    queryKey: externalMusicianKeys.list(filters || {}),
    queryFn: () => getExternalMusicians(filters),
  });
}

/**
 * Hook to fetch a single external musician with full details
 */
export function useExternalMusician(id: string | null) {
  return useQuery({
    queryKey: externalMusicianKeys.detail(id || ''),
    queryFn: () => getExternalMusician(id!),
    enabled: !!id,
  });
}

/**
 * Hook to search external musicians by instrument
 */
export function useExternalMusicianSearch(
  instrumentId: string | null,
  options?: { skillLevel?: string; activeOnly?: boolean },
) {
  return useQuery({
    queryKey: externalMusicianKeys.search(instrumentId || '', options),
    queryFn: () => searchExternalMusiciansByInstrument(instrumentId!, options),
    enabled: !!instrumentId,
  });
}

/**
 * Hook to create a new external musician
 */
export function useCreateExternalMusician() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateExternalMusicianData) => createExternalMusician(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: externalMusicianKeys.all });
      showSuccess('Externe muzikant toegevoegd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update an external musician
 */
export function useUpdateExternalMusician() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateExternalMusicianData }) => updateExternalMusician(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: externalMusicianKeys.all });
      queryClient.invalidateQueries({ queryKey: externalMusicianKeys.detail(id) });
      showSuccess('Externe muzikant bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete (deactivate) an external musician
 */
export function useDeleteExternalMusician() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteExternalMusician(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: externalMusicianKeys.all });
      showSuccess('Externe muzikant gedeactiveerd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to add an instrument to an external musician
 */
export function useAddMusicianInstrument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      musicianId,
      instrumentData,
    }: {
      musicianId: string;
      instrumentData: {
        instrumentId: string;
        skillLevel?: 'beginner' | 'intermediate' | 'advanced' | 'professional' | null;
        isPrimary?: boolean;
      };
    }) => addInstrumentToMusician(musicianId, instrumentData),
    onSuccess: (_, { musicianId }) => {
      queryClient.invalidateQueries({ queryKey: externalMusicianKeys.detail(musicianId) });
      queryClient.invalidateQueries({ queryKey: externalMusicianKeys.lists() });
      showSuccess('Instrument toegevoegd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to remove an instrument from an external musician
 */
export function useRemoveMusicianInstrument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ musicianId, instrumentId }: { musicianId: string; instrumentId: string }) =>
      removeInstrumentFromMusician(musicianId, instrumentId),
    onSuccess: (_, { musicianId }) => {
      queryClient.invalidateQueries({ queryKey: externalMusicianKeys.detail(musicianId) });
      queryClient.invalidateQueries({ queryKey: externalMusicianKeys.lists() });
      showSuccess('Instrument verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}
