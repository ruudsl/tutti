import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSeasons,
  getSeason,
  createSeason,
  updateSeason,
  deleteSeason,
  getSeasonTemplates,
  createSeasonTemplate,
  updateSeasonTemplate,
  deleteSeasonTemplate,
  addSeasonEvent,
  removeSeasonEvent,
  generateSeasonEvents,
} from '../api';
import type { GenerateSeasonEventsParams } from '../api';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

// Query keys
export const seasonQueryKeys = {
  all: ['seasons'] as const,
  list: (status?: string) => ['seasons', 'list', status] as const,
  detail: (id: string) => ['seasons', 'detail', id] as const,
  templates: ['seasons', 'templates'] as const,
};

/**
 * Hook to fetch all seasons
 */
export function useSeasons(status?: string) {
  return useQuery({
    queryKey: seasonQueryKeys.list(status),
    queryFn: () => getSeasons(status),
  });
}

/**
 * Hook to fetch a single season with events
 */
export function useSeason(id: string) {
  return useQuery({
    queryKey: seasonQueryKeys.detail(id),
    queryFn: () => getSeason(id),
    enabled: !!id,
  });
}

/**
 * Hook to fetch season templates
 */
export function useSeasonTemplates() {
  return useQuery({
    queryKey: seasonQueryKeys.templates,
    queryFn: getSeasonTemplates,
  });
}

/**
 * Hook to create a new season
 */
export function useCreateSeason() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSeason,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: seasonQueryKeys.all });
      showSuccess('Seizoen aangemaakt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update a season
 */
export function useUpdateSeason() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateSeason>[1] }) => updateSeason(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: seasonQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: seasonQueryKeys.detail(id) });
      showSuccess('Seizoen bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete a season
 */
export function useDeleteSeason() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSeason,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: seasonQueryKeys.all });
      showSuccess('Seizoen verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to create a season template
 */
export function useCreateSeasonTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSeasonTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: seasonQueryKeys.templates });
      showSuccess('Seizoenstemplate aangemaakt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update a season template
 */
export function useUpdateSeasonTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateSeasonTemplate>[1] }) =>
      updateSeasonTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: seasonQueryKeys.templates });
      showSuccess('Seizoenstemplate bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete a season template
 */
export function useDeleteSeasonTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSeasonTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: seasonQueryKeys.templates });
      showSuccess('Seizoenstemplate verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to add an event to a season
 */
export function useAddSeasonEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ seasonId, event }: { seasonId: string; event: Parameters<typeof addSeasonEvent>[1] }) =>
      addSeasonEvent(seasonId, event),
    onSuccess: (_, { seasonId }) => {
      queryClient.invalidateQueries({ queryKey: seasonQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: seasonQueryKeys.detail(seasonId) });
      showSuccess('Event toegevoegd aan seizoen');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to remove an event from a season
 */
export function useRemoveSeasonEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ seasonId, eventId }: { seasonId: string; eventId: string }) => removeSeasonEvent(seasonId, eventId),
    onSuccess: (_, { seasonId }) => {
      queryClient.invalidateQueries({ queryKey: seasonQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: seasonQueryKeys.detail(seasonId) });
      showSuccess('Event verwijderd uit seizoen');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to generate season events (rehearsals and concerts)
 */
export function useGenerateSeasonEvents() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ seasonId, params }: { seasonId: string; params: GenerateSeasonEventsParams }) =>
      generateSeasonEvents(seasonId, params),
    onSuccess: (result, { seasonId }) => {
      queryClient.invalidateQueries({ queryKey: seasonQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: seasonQueryKeys.detail(seasonId) });
      queryClient.invalidateQueries({ queryKey: ['rehearsals'] });
      queryClient.invalidateQueries({ queryKey: ['concerts'] });
      showSuccess(result.message);
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}
