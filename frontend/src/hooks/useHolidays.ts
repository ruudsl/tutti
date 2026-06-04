import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getHolidays,
  getUpcomingHolidays,
  checkHolidayDate,
  syncHolidays,
  createCustomHoliday,
  updateCustomHoliday,
  deleteCustomHoliday,
  getHolidaySettings,
  updateHolidaySettings,
  Holiday,
  HolidaySettings,
  HolidaysResponse,
  HolidayRegion,
} from '../api';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

// Query keys for holidays
export const holidayQueryKeys = {
  all: ['holidays'] as const,
  list: (params?: { year?: number; startDate?: string; endDate?: string }) =>
    [...holidayQueryKeys.all, 'list', params] as const,
  upcoming: (limit?: number) => [...holidayQueryKeys.all, 'upcoming', limit] as const,
  check: (date: string) => [...holidayQueryKeys.all, 'check', date] as const,
  settings: [...holidayQueryKeys.all, 'settings'] as const,
};

/**
 * Hook to fetch holidays for a year or date range
 */
export function useHolidays(params?: {
  year?: number;
  startDate?: string;
  endDate?: string;
}) {
  return useQuery({
    queryKey: holidayQueryKeys.list(params),
    queryFn: () => getHolidays(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch upcoming holidays
 */
export function useUpcomingHolidays(limit?: number) {
  return useQuery({
    queryKey: holidayQueryKeys.upcoming(limit),
    queryFn: () => getUpcomingHolidays(limit),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to check if a date falls within a holiday
 */
export function useCheckHolidayDate(date: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: holidayQueryKeys.check(date),
    queryFn: () => checkHolidayDate(date),
    enabled: !!date && (options?.enabled !== false),
    staleTime: 60 * 60 * 1000, // 1 hour - dates don't change often
  });
}

/**
 * Hook to fetch holiday settings
 */
export function useHolidaySettings() {
  return useQuery({
    queryKey: holidayQueryKeys.settings,
    queryFn: getHolidaySettings,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to sync holidays from external source
 */
export function useSyncHolidays() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (year?: number) => syncHolidays(year),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: holidayQueryKeys.all });
      showSuccess(data.message);
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to create a custom holiday
 */
export function useCreateCustomHoliday() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCustomHoliday,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: holidayQueryKeys.all });
      showSuccess('Feestdag toegevoegd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update a custom holiday
 */
export function useUpdateCustomHoliday() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, holiday }: {
      id: string;
      holiday: {
        name?: string;
        startDate?: string;
        endDate?: string;
        region?: string;
        holidayType?: string;
      };
    }) => updateCustomHoliday(id, holiday),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: holidayQueryKeys.all });
      showSuccess('Feestdag bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete a custom holiday
 */
export function useDeleteCustomHoliday() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCustomHoliday,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: holidayQueryKeys.all });
      showSuccess('Feestdag verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update holiday settings
 */
export function useUpdateHolidaySettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateHolidaySettings,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: holidayQueryKeys.all });
      showSuccess(data.message);
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

// Re-export types for convenience
export type { Holiday, HolidaySettings, HolidaysResponse, HolidayRegion };
