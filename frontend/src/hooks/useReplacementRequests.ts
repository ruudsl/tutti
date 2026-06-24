import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getReplacementRequests,
  getReplacementRequest,
  createReplacementRequest,
  updateReplacementRequest,
  cancelReplacementRequest,
  inviteMusician,
  updateAssignment,
  getReplacementSuggestions,
  CreateReplacementRequestData,
  UpdateReplacementRequestData,
  InviteMusicianData,
  UpdateAssignmentData,
} from '../api/replacement-requests';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

// Query keys
export const replacementRequestKeys = {
  all: ['replacementRequests'] as const,
  lists: () => [...replacementRequestKeys.all, 'list'] as const,
  list: (filters: Record<string, any>) => [...replacementRequestKeys.lists(), filters] as const,
  details: () => [...replacementRequestKeys.all, 'detail'] as const,
  detail: (id: string) => [...replacementRequestKeys.details(), id] as const,
  suggestions: (eventId: string, eventType?: string) => [...replacementRequestKeys.all, 'suggestions', eventId, eventType] as const,
};

/**
 * Hook to fetch all replacement requests with optional filters
 */
export function useReplacementRequests(filters?: {
  status?: string;
  eventType?: string;
  instrumentId?: string;
  urgency?: string;
}) {
  return useQuery({
    queryKey: replacementRequestKeys.list(filters || {}),
    queryFn: () => getReplacementRequests(filters),
  });
}

/**
 * Hook to fetch a single replacement request with assignments
 */
export function useReplacementRequest(id: string | null) {
  return useQuery({
    queryKey: replacementRequestKeys.detail(id || ''),
    queryFn: () => getReplacementRequest(id!),
    enabled: !!id,
  });
}

/**
 * Hook to get replacement suggestions for an event
 */
export function useReplacementSuggestions(eventId: string | null, eventType?: string) {
  return useQuery({
    queryKey: replacementRequestKeys.suggestions(eventId || '', eventType),
    queryFn: () => getReplacementSuggestions(eventId!, eventType),
    enabled: !!eventId,
  });
}

/**
 * Hook to create a new replacement request
 */
export function useCreateReplacementRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateReplacementRequestData) => createReplacementRequest(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: replacementRequestKeys.all });
      showSuccess('Verzoek aangemaakt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update a replacement request
 */
export function useUpdateReplacementRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateReplacementRequestData }) =>
      updateReplacementRequest(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: replacementRequestKeys.all });
      queryClient.invalidateQueries({ queryKey: replacementRequestKeys.detail(id) });
      showSuccess('Verzoek bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to cancel a replacement request
 */
export function useCancelReplacementRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => cancelReplacementRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: replacementRequestKeys.all });
      showSuccess('Verzoek geannuleerd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to invite an external musician to a replacement request
 */
export function useInviteMusician() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requestId, data }: { requestId: string; data: InviteMusicianData }) =>
      inviteMusician(requestId, data),
    onSuccess: (_, { requestId }) => {
      queryClient.invalidateQueries({ queryKey: replacementRequestKeys.detail(requestId) });
      queryClient.invalidateQueries({ queryKey: replacementRequestKeys.lists() });
      showSuccess('Muzikant uitgenodigd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update an assignment status
 */
export function useUpdateAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      requestId,
      assignmentId,
      data,
    }: {
      requestId: string;
      assignmentId: string;
      data: UpdateAssignmentData;
    }) => updateAssignment(requestId, assignmentId, data),
    onSuccess: (_, { requestId }) => {
      queryClient.invalidateQueries({ queryKey: replacementRequestKeys.detail(requestId) });
      queryClient.invalidateQueries({ queryKey: replacementRequestKeys.lists() });
      showSuccess('Status bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}
