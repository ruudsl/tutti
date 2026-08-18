import api from './client';
import type { Rehearsal, RehearsalDetail, RehearsalDefaultDay } from '../types';

// Rehearsals
export const getRehearsals = async (startDate?: string, endDate?: string): Promise<Rehearsal[]> => {
  const params: Record<string, string> = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  const { data } = await api.get('/rehearsals', { params });
  return data;
};

export const getRehearsal = async (id: string): Promise<RehearsalDetail> => {
  const { data } = await api.get(`/rehearsals/${id}`);
  return data;
};

export const createRehearsal = async (rehearsal: {
  date: string;
  startTime: string;
  endTime: string;
  location?: string;
  type?: string;
  notes?: string;
  orchestraId?: string;
}): Promise<any> => {
  const { data } = await api.post('/rehearsals', rehearsal);
  return data;
};

export const updateRehearsal = async (
  id: string,
  rehearsal: {
    date: string;
    startTime: string;
    endTime: string;
    location?: string;
    type?: string;
    notes?: string;
    orchestraId?: string;
  },
): Promise<void> => {
  await api.put(`/rehearsals/${id}`, rehearsal);
};

export const deleteRehearsal = async (id: string): Promise<void> => {
  await api.delete(`/rehearsals/${id}`);
};

export const updateRehearsalPieces = async (id: string, pieces: { title: string; notes?: string }[]): Promise<void> => {
  await api.put(`/rehearsals/${id}/pieces`, { pieces });
};

// Rehearsal Default Days
export const getDefaultDays = async (): Promise<RehearsalDefaultDay[]> => {
  const { data } = await api.get('/rehearsals/default-days');
  return data;
};

export const addDefaultDay = async (day: {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location?: string;
  orchestraId?: string;
}): Promise<RehearsalDefaultDay> => {
  const { data } = await api.post('/rehearsals/default-days', day);
  return data;
};

export const updateDefaultDay = async (
  id: string,
  day: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    location?: string;
  },
): Promise<void> => {
  await api.put(`/rehearsals/default-days/${id}`, day);
};

export const deleteDefaultDay = async (id: string): Promise<void> => {
  await api.delete(`/rehearsals/default-days/${id}`);
};

export const generateRehearsals = async (startDate: string, endDate: string): Promise<{ count: number }> => {
  const { data } = await api.post('/rehearsals/generate', { startDate, endDate });
  return data;
};

export const getUpcomingRehearsals = async (limit: number = 3): Promise<Rehearsal[]> => {
  const { data } = await api.get('/rehearsals/upcoming', { params: { limit } });
  return data;
};

// Attendance summary
export interface AttendanceMember {
  name: string;
  spondMemberId: string | null;
  userId: string | null;
  accepted: number;
  declined: number;
  unknown: number;
  total: number;
}

export const getAttendanceSummary = async (
  from: string,
  to: string,
  orchestraId?: string,
): Promise<{
  members: AttendanceMember[];
  rehearsalCount: number;
  from: string;
  to: string;
}> => {
  const params: Record<string, string> = { from, to };
  if (orchestraId) params.orchestraId = orchestraId;
  const { data } = await api.get('/rehearsals/attendance/summary', { params });
  return data;
};

// Recurring rehearsals (RRULE)
export const createRecurringRehearsals = async (params: {
  rrule: string;
  startTime: string;
  endTime: string;
  location?: string;
  orchestraId?: string;
  until?: string;
}): Promise<{
  count: number;
  seriesId: string;
  dates: string[];
}> => {
  const { data } = await api.post('/rehearsals/recurring', params);
  return data;
};

export const deleteRehearsalSeries = async (seriesId: string, futureOnly?: boolean): Promise<{ count: number }> => {
  const params = futureOnly ? { futureOnly: 'true' } : {};
  const { data } = await api.delete(`/rehearsals/series/${seriesId}`, { params });
  return data;
};
