import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPracticeLogs, getPracticeStats, logPractice, deletePracticeLog } from '../api';
import { queryKeys } from '../lib/queryClient';
import { showSuccess, showError } from '../utils/toast';

export function usePracticeLogs(musicTitleId?: string) {
  const {
    data: logs = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['practiceLogs', musicTitleId],
    queryFn: () => getPracticeLogs(musicTitleId),
  });

  return { logs, isLoading, error };
}

export function usePracticeStats() {
  const {
    data: stats,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.practiceStats,
    queryFn: getPracticeStats,
  });

  return { stats, isLoading, error };
}

export function useLogPractice() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: { musicTitleId: string; durationMinutes: number; notes?: string }) =>
      logPractice(data.musicTitleId, data.durationMinutes, data.notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practiceLogs'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.practiceStats });
      showSuccess('Oefensessie opgeslagen');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Fout bij opslaan oefensessie');
    },
  });

  return mutation;
}

export function useDeletePracticeLog() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: deletePracticeLog,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practiceLogs'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.practiceStats });
      showSuccess('Oefensessie verwijderd');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Fout bij verwijderen oefensessie');
    },
  });

  return mutation;
}
