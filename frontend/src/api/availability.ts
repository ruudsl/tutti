import api from './client';

export interface AvailabilityEntry {
  id: string;
  date: string;
  status: 'available' | 'unavailable' | 'maybe';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  userId: string;
  firstName: string;
  lastName: string;
  status: 'available' | 'unavailable' | 'maybe' | 'unknown';
  notes: string | null;
}

export interface TeamAvailability {
  date: string;
  summary: {
    available: number;
    unavailable: number;
    maybe: number;
    unknown: number;
    total: number;
  };
  members: TeamMember[];
}

export const getMyAvailability = async (fromDate?: string, toDate?: string): Promise<AvailabilityEntry[]> => {
  const { data } = await api.get('/availability', { params: { fromDate, toDate } });
  return data;
};

export const getTeamAvailability = async (date: string, orchestraId?: string): Promise<TeamAvailability> => {
  const { data } = await api.get('/availability/team', { params: { date, orchestraId } });
  return data;
};

export const setAvailability = async (
  date: string,
  status: 'available' | 'unavailable' | 'maybe',
  notes?: string,
): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/availability', { date, status, notes });
  return data;
};

export const setBulkAvailability = async (
  dates: string[],
  status: 'available' | 'unavailable' | 'maybe',
  notes?: string,
): Promise<{ message: string; created: number; updated: number }> => {
  const { data } = await api.post('/availability/bulk', { dates, status, notes });
  return data;
};

export const removeAvailability = async (date: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/availability/${date}`);
  return data;
};
