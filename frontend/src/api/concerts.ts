import api from './client';
import type { Concert, ConcertDetail, ConcertStatistics, PieceHistory, ConcertType, MediaType } from '../types';

export const getConcertTypes = async (): Promise<{
  concertTypes: ConcertType[];
  mediaTypes: MediaType[];
}> => {
  const { data } = await api.get('/concerts/types');
  return data;
};

export const getAdminConcertTypes = async (): Promise<{
  types: { id: string; value: string; label: string; sortOrder: number }[];
  defaults: ConcertType[];
}> => {
  const { data } = await api.get('/concerts/concert-types');
  return data;
};

export const createConcertType = async (value: string, label: string, sortOrder?: number): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/concerts/concert-types', { value, label, sortOrder });
  return data;
};

export const updateConcertType = async (id: string, updates: { value?: string; label?: string; sortOrder?: number }): Promise<{ message: string }> => {
  const { data } = await api.put(`/concerts/concert-types/${id}`, updates);
  return data;
};

export const deleteConcertType = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/concerts/concert-types/${id}`);
  return data;
};

export const initDefaultConcertTypes = async (): Promise<{ message: string }> => {
  const { data } = await api.post('/concerts/concert-types/init-defaults');
  return data;
};

export const getConcertStatistics = async (): Promise<ConcertStatistics> => {
  const { data } = await api.get('/concerts/statistics');
  return data;
};

export const getPieceHistory = async (title: string): Promise<PieceHistory> => {
  const { data } = await api.get(`/concerts/piece-history/${encodeURIComponent(title)}`);
  return data;
};

export const getConcerts = async (filters?: {
  search?: string;
  year?: string;
  concertType?: string;
}): Promise<{ data: Concert[]; total: number; page: number; limit: number }> => {
  const { data } = await api.get('/concerts', { params: filters });
  return data;
};

export const getConcertYears = async (): Promise<string[]> => {
  const { data } = await api.get('/concerts/years');
  return data;
};

export const getConcert = async (id: string): Promise<ConcertDetail> => {
  const { data } = await api.get(`/concerts/${id}`);
  return data;
};

export const createConcert = async (concert: {
  name: string;
  date: string;
  endDate?: string;
  location?: string;
  venueType?: string;
  concertType?: string;
  description?: string;
  notes?: string;
}): Promise<{ id: string }> => {
  const { data } = await api.post('/concerts', concert);
  return data;
};

export const updateConcert = async (id: string, concert: {
  name?: string;
  date?: string;
  endDate?: string;
  location?: string;
  venueType?: string;
  concertType?: string;
  description?: string;
  notes?: string;
}): Promise<void> => {
  await api.put(`/concerts/${id}`, concert);
};

export const deleteConcert = async (id: string): Promise<void> => {
  await api.delete(`/concerts/${id}`);
};

export const addConcertProgramItem = async (concertId: string, item: {
  musicTitleId?: string | null;
  title: string;
  composer?: string;
  arranger?: string;
  sortOrder?: number;
  notes?: string;
  partOfSet?: string;
}): Promise<{ id: string }> => {
  const { data } = await api.post(`/concerts/${concertId}/program`, item);
  return data;
};

export const updateConcertProgramItem = async (concertId: string, programId: string, item: {
  musicTitleId?: string | null;
  title?: string;
  arranger?: string;
  sortOrder?: number;
  notes?: string;
  partOfSet?: string;
}): Promise<void> => {
  await api.put(`/concerts/${concertId}/program/${programId}`, item);
};

export const deleteConcertProgramItem = async (concertId: string, programId: string): Promise<void> => {
  await api.delete(`/concerts/${concertId}/program/${programId}`);
};

export const reorderConcertProgram = async (concertId: string, items: { id: string; sortOrder: number }[]): Promise<void> => {
  await api.put(`/concerts/${concertId}/program/reorder`, { items });
};

export const exportConcertProgram = async (concertId: string): Promise<string> => {
  const { data } = await api.get(`/concerts/${concertId}/program/export`, { responseType: 'text' });
  return data;
};

export const exportBumaStemra = async (params: {
  startDate: string;
  endDate: string;
}): Promise<string> => {
  const { data } = await api.get('/concerts/buma-stemra-export', {
    params,
    responseType: 'text',
  });
  return data;
};

export const addConcertMedia = async (concertId: string, media: {
  mediaType: string;
  url?: string;
  description?: string;
}): Promise<{ id: string }> => {
  const { data } = await api.post(`/concerts/${concertId}/media`, media);
  return data;
};

export const deleteConcertMedia = async (concertId: string, mediaId: string): Promise<void> => {
  await api.delete(`/concerts/${concertId}/media/${mediaId}`);
};

export const addConcertAttendance = async (concertId: string, attendance: {
  userId?: string | null;
  memberName: string;
  instrumentPlayed?: string;
  notes?: string;
}): Promise<{ id: string }> => {
  const { data } = await api.post(`/concerts/${concertId}/attendance`, attendance);
  return data;
};

export const addConcertAttendanceBulk = async (concertId: string, userIds: string[]): Promise<{ ids: string[]; count: number }> => {
  const { data } = await api.post(`/concerts/${concertId}/attendance/bulk`, { userIds });
  return data;
};

export const updateConcertAttendance = async (concertId: string, attendanceId: string, attendance: {
  memberName?: string;
  instrumentPlayed?: string;
  notes?: string;
}): Promise<void> => {
  await api.put(`/concerts/${concertId}/attendance/${attendanceId}`, attendance);
};

export const deleteConcertAttendance = async (concertId: string, attendanceId: string): Promise<void> => {
  await api.delete(`/concerts/${concertId}/attendance/${attendanceId}`);
};
