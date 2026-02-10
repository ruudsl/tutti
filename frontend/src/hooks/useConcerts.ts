import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import {
  getConcerts,
  getConcert,
  getConcertTypes,
  getConcertYears,
  getConcertStatistics,
  getPieceHistory,
  createConcert,
  updateConcert,
  deleteConcert,
  addConcertProgramItem,
  updateConcertProgramItem,
  deleteConcertProgramItem,
  reorderConcertProgram,
  exportConcertProgram,
  exportBumaStemra,
  addConcertMedia,
  deleteConcertMedia,
  addConcertAttendance,
  addConcertAttendanceBulk,
  updateConcertAttendance,
  deleteConcertAttendance,
} from '../api';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

/**
 * Hook to fetch concert types and venue types
 */
export function useConcertTypes() {
  return useQuery({
    queryKey: queryKeys.concertTypes,
    queryFn: getConcertTypes,
  });
}

/**
 * Hook to fetch concert years
 */
export function useConcertYears() {
  return useQuery({
    queryKey: queryKeys.concertYears,
    queryFn: getConcertYears,
  });
}

/**
 * Hook to fetch concert statistics
 */
export function useConcertStatistics() {
  return useQuery({
    queryKey: queryKeys.concertStatistics,
    queryFn: getConcertStatistics,
  });
}

/**
 * Hook to fetch piece history
 */
export function usePieceHistory(title: string) {
  return useQuery({
    queryKey: queryKeys.pieceHistory(title),
    queryFn: () => getPieceHistory(title),
    enabled: !!title,
  });
}

/**
 * Hook to fetch concerts with filters
 */
export function useConcerts(filters?: { search?: string; year?: string; concertType?: string }) {
  return useQuery({
    queryKey: queryKeys.concerts(filters as Record<string, string>),
    queryFn: () => getConcerts(filters),
  });
}

/**
 * Hook to fetch single concert with full details
 */
export function useConcert(id: string) {
  return useQuery({
    queryKey: queryKeys.concert(id),
    queryFn: () => getConcert(id),
    enabled: !!id,
  });
}

/**
 * Hook to create new concert
 */
export function useCreateConcert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createConcert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concerts'] });
      showSuccess('Concert aangemaakt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update concert
 */
export function useUpdateConcert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateConcert>[1] }) =>
      updateConcert(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['concerts'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.concert(id) });
      showSuccess('Concert bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete concert
 */
export function useDeleteConcert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteConcert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concerts'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.concertStatistics });
      showSuccess('Concert verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

// ==================== CONCERT PROGRAM ====================

/**
 * Hook to add program item
 */
export function useAddConcertProgramItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ concertId, item }: { concertId: string; item: Parameters<typeof addConcertProgramItem>[1] }) =>
      addConcertProgramItem(concertId, item),
    onSuccess: (_, { concertId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.concert(concertId) });
      queryClient.invalidateQueries({ queryKey: ['concerts'] });
      showSuccess('Programma item toegevoegd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update program item
 */
export function useUpdateConcertProgramItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ concertId, programId, item }: {
      concertId: string;
      programId: string;
      item: Parameters<typeof updateConcertProgramItem>[2]
    }) => updateConcertProgramItem(concertId, programId, item),
    onSuccess: (_, { concertId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.concert(concertId) });
      showSuccess('Programma item bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete program item
 */
export function useDeleteConcertProgramItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ concertId, programId }: { concertId: string; programId: string }) =>
      deleteConcertProgramItem(concertId, programId),
    onSuccess: (_, { concertId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.concert(concertId) });
      queryClient.invalidateQueries({ queryKey: ['concerts'] });
      showSuccess('Programma item verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to reorder program items
 */
export function useReorderConcertProgram() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ concertId, items }: { concertId: string; items: { id: string; sortOrder: number }[] }) =>
      reorderConcertProgram(concertId, items),
    onSuccess: (_, { concertId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.concert(concertId) });
      showSuccess('Volgorde bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to export concert program
 */
export function useExportConcertProgram() {
  return useMutation({
    mutationFn: exportConcertProgram,
    onSuccess: (content) => {
      // Create a download
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'programma.txt';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showSuccess('Programma geëxporteerd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to export Buma/Stemra report
 */
export function useExportBumaStemra() {
  return useMutation({
    mutationFn: exportBumaStemra,
    onSuccess: (content, variables) => {
      // Create a download
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `buma_stemra_${variables.startDate}_${variables.endDate}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showSuccess('Buma/Stemra export gedownload');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

// ==================== CONCERT MEDIA ====================

/**
 * Hook to add media
 */
export function useAddConcertMedia() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ concertId, media }: { concertId: string; media: Parameters<typeof addConcertMedia>[1] }) =>
      addConcertMedia(concertId, media),
    onSuccess: (_, { concertId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.concert(concertId) });
      queryClient.invalidateQueries({ queryKey: ['concerts'] });
      showSuccess('Media toegevoegd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete media
 */
export function useDeleteConcertMedia() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ concertId, mediaId }: { concertId: string; mediaId: string }) =>
      deleteConcertMedia(concertId, mediaId),
    onSuccess: (_, { concertId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.concert(concertId) });
      queryClient.invalidateQueries({ queryKey: ['concerts'] });
      showSuccess('Media verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

// ==================== CONCERT ATTENDANCE ====================

/**
 * Hook to add attendance
 */
export function useAddConcertAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ concertId, attendance }: { concertId: string; attendance: Parameters<typeof addConcertAttendance>[1] }) =>
      addConcertAttendance(concertId, attendance),
    onSuccess: (_, { concertId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.concert(concertId) });
      queryClient.invalidateQueries({ queryKey: ['concerts'] });
      showSuccess('Bezetting toegevoegd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to add multiple attendance records
 */
export function useAddConcertAttendanceBulk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ concertId, userIds }: { concertId: string; userIds: string[] }) =>
      addConcertAttendanceBulk(concertId, userIds),
    onSuccess: (data, { concertId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.concert(concertId) });
      queryClient.invalidateQueries({ queryKey: ['concerts'] });
      showSuccess(`${data.count} leden toegevoegd aan bezetting`);
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update attendance
 */
export function useUpdateConcertAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ concertId, attendanceId, attendance }: {
      concertId: string;
      attendanceId: string;
      attendance: Parameters<typeof updateConcertAttendance>[2]
    }) => updateConcertAttendance(concertId, attendanceId, attendance),
    onSuccess: (_, { concertId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.concert(concertId) });
      showSuccess('Bezetting bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete attendance
 */
export function useDeleteConcertAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ concertId, attendanceId }: { concertId: string; attendanceId: string }) =>
      deleteConcertAttendance(concertId, attendanceId),
    onSuccess: (_, { concertId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.concert(concertId) });
      queryClient.invalidateQueries({ queryKey: ['concerts'] });
      showSuccess('Bezetting verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}
