/**
 * Vakanties en feestdagen, en de instellingen die bepalen welke regio telt.
 *
 * Verhuisd uit src/api.ts; zie de toelichting in failed-imports.ts.
 */

import api from './client';

// ==================== HOLIDAYS ====================

export interface HolidayRegion {
  value: string;
  label: string;
  labelDutch: string;
}

export interface Holiday {
  id: string;
  name: string;
  nameEnglish?: string;
  region: string;
  country: string;
  startDate: string;
  endDate: string;
  year: number;
  holidayType: string;
  isCustom: boolean;
  source: string;
}

export interface HolidaySettings {
  region: string;
  showHolidaysInCalendar: boolean;
  autoBlockRehearsals: boolean;
}

export interface HolidaysResponse {
  holidays: Holiday[];
  settings: HolidaySettings;
  meta: {
    availableYears: number[];
    regions: HolidayRegion[];
  };
}

export const getHolidays = async (params?: {
  year?: number;
  startDate?: string;
  endDate?: string;
}): Promise<HolidaysResponse> => {
  const { data } = await api.get('/holidays', { params });
  return data;
};

export const getUpcomingHolidays = async (limit?: number): Promise<Holiday[]> => {
  const { data } = await api.get('/holidays/upcoming', { params: { limit } });
  return data;
};

export const checkHolidayDate = async (
  date: string,
): Promise<{
  isHoliday: boolean;
  holiday: {
    name: string;
    startDate: string;
    endDate: string;
    holidayType: string;
    isCustom: boolean;
  } | null;
}> => {
  const { data } = await api.get('/holidays/check', { params: { date } });
  return data;
};

export const syncHolidays = async (
  year?: number,
): Promise<{
  message: string;
  count: number;
  year: number;
}> => {
  const { data } = await api.get('/holidays/sync', { params: { year } });
  return data;
};

export const createCustomHoliday = async (holiday: {
  name: string;
  startDate: string;
  endDate: string;
  region?: string;
  holidayType?: string;
}): Promise<Holiday> => {
  const { data } = await api.post('/holidays', holiday);
  return data;
};

export const updateCustomHoliday = async (
  id: string,
  holiday: {
    name?: string;
    startDate?: string;
    endDate?: string;
    region?: string;
    holidayType?: string;
  },
): Promise<{ message: string }> => {
  const { data } = await api.put(`/holidays/${id}`, holiday);
  return data;
};

export const deleteCustomHoliday = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/holidays/${id}`);
  return data;
};

export const getHolidaySettings = async (): Promise<HolidaySettings & { regions: HolidayRegion[] }> => {
  const { data } = await api.get('/holidays/settings');
  return data;
};

export const updateHolidaySettings = async (settings: {
  region?: string;
  showHolidaysInCalendar?: boolean;
  autoBlockRehearsals?: boolean;
}): Promise<{ message: string; settings: HolidaySettings }> => {
  const { data } = await api.put('/holidays/settings', settings);
  return data;
};
