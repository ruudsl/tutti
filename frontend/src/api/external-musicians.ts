import api from './client';

// Types
export interface ExternalMusician {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  musicianType: 'alumni' | 'guest' | 'substitute' | 'friend';
  notes: string | null;
  isActive: boolean;
  rating: number | null;
  lastPlayedDate: string | null;
  totalPerformances: number;
  instrumentNames?: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalMusicianInstrument {
  id: string;
  instrumentId: string;
  instrumentName: string;
  instrumentTuning: string | null;
  skillLevel: 'beginner' | 'intermediate' | 'advanced' | 'professional' | null;
  isPrimary: boolean;
}

export interface ExternalMusicianDetail extends ExternalMusician {
  instruments: ExternalMusicianInstrument[];
  recentAssignments: RecentAssignment[];
}

export interface RecentAssignment {
  id: string;
  eventType: 'concert' | 'rehearsal';
  eventDate: string;
  eventName: string | null;
  instrumentName: string;
  status: string;
  feeAmount: number | null;
}

export interface CreateExternalMusicianData {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  musicianType: 'alumni' | 'guest' | 'substitute' | 'friend';
  notes?: string | null;
  rating?: number | null;
  instruments?: {
    instrumentId: string;
    skillLevel?: 'beginner' | 'intermediate' | 'advanced' | 'professional' | null;
    isPrimary?: boolean;
  }[];
}

export interface UpdateExternalMusicianData extends Partial<CreateExternalMusicianData> {
  isActive?: boolean;
}

export interface ExternalMusicianSearchResult extends ExternalMusician {
  skillLevel: string | null;
  isPrimary: boolean;
  instrumentName: string;
  instrumentTuning: string | null;
}

// API Functions

export const getExternalMusicians = async (filters?: {
  type?: string;
  instrumentId?: string;
  isActive?: boolean;
  search?: string;
}): Promise<ExternalMusician[]> => {
  const params = new URLSearchParams();
  if (filters?.type) params.set('type', filters.type);
  if (filters?.instrumentId) params.set('instrumentId', filters.instrumentId);
  if (filters?.isActive !== undefined) params.set('isActive', String(filters.isActive));
  if (filters?.search) params.set('search', filters.search);

  const { data } = await api.get(`/external-musicians?${params.toString()}`);
  return data;
};

export const getExternalMusician = async (id: string): Promise<ExternalMusicianDetail> => {
  const { data } = await api.get(`/external-musicians/${id}`);
  return data;
};

export const createExternalMusician = async (musicianData: CreateExternalMusicianData): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/external-musicians', musicianData);
  return data;
};

export const updateExternalMusician = async (id: string, musicianData: UpdateExternalMusicianData): Promise<{ message: string }> => {
  const { data } = await api.put(`/external-musicians/${id}`, musicianData);
  return data;
};

export const deleteExternalMusician = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/external-musicians/${id}`);
  return data;
};

export const searchExternalMusiciansByInstrument = async (
  instrumentId: string,
  options?: { skillLevel?: string; activeOnly?: boolean }
): Promise<ExternalMusicianSearchResult[]> => {
  const params = new URLSearchParams();
  params.set('instrument', instrumentId);
  if (options?.skillLevel) params.set('skillLevel', options.skillLevel);
  if (options?.activeOnly) params.set('activeOnly', 'true');

  const { data } = await api.get(`/external-musicians/search?${params.toString()}`);
  return data;
};

export const addInstrumentToMusician = async (
  musicianId: string,
  instrumentData: {
    instrumentId: string;
    skillLevel?: 'beginner' | 'intermediate' | 'advanced' | 'professional' | null;
    isPrimary?: boolean;
  }
): Promise<{ id: string; message: string }> => {
  const { data } = await api.post(`/external-musicians/${musicianId}/instruments`, instrumentData);
  return data;
};

export const removeInstrumentFromMusician = async (musicianId: string, instrumentId: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/external-musicians/${musicianId}/instruments/${instrumentId}`);
  return data;
};
