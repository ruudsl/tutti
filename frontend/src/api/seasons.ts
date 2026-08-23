/**
 * Seizoensplanning: sjablonen, seizoenen, en het genereren van de repetities
 * en concerten die erbij horen.
 *
 * Verhuisd uit src/api.ts; zie de toelichting in failed-imports.ts.
 */

import api from './client';

// =============================================
// SEASONS API (Season Planning Wizard)
// =============================================

export interface SeasonTemplate {
  id: string;
  name: string;
  description: string | null;
  defaultRehearsalDay: number | null;
  defaultRehearsalTime: string | null;
  defaultRehearsalDuration: number;
  defaultRehearsalLocation: string | null;
  typicalConcertsCount: number;
  templateData: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Season {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  templateId: string | null;
  templateName: string | null;
  status: 'draft' | 'active' | 'completed';
  budgetTotal: number | null;
  budgetAllocated: number;
  notes: string | null;
  eventCount: number;
  concertCount: number;
  rehearsalCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeasonEvent {
  id: string;
  eventType: 'concert' | 'rehearsal' | 'other';
  eventId: string | null;
  eventName: string | null;
  plannedDate: string;
  budgetAmount: number | null;
  notes: string | null;
  createdAt: string;
}

export interface SeasonDetail extends Omit<Season, 'eventCount' | 'concertCount' | 'rehearsalCount'> {
  events: SeasonEvent[];
}

export interface PlannedConcert {
  name: string;
  date: string;
  location?: string;
  type?: string;
  budgetAmount?: number;
}

export interface GenerateSeasonEventsParams {
  rehearsalDay?: number;
  rehearsalTime?: string;
  rehearsalEndTime?: string;
  rehearsalLocation?: string;
  orchestraId?: string;
  concerts?: PlannedConcert[];
  excludeDates?: string[];
  generateRehearsals?: boolean;
  generateConcerts?: boolean;
}

export interface GenerateSeasonEventsResult {
  message: string;
  rehearsalCount: number;
  concertCount: number;
  rehearsalDates: string[];
  concertNames: string[];
}

// Season Templates
export const getSeasonTemplates = async (): Promise<SeasonTemplate[]> => {
  const { data } = await api.get('/seasons/templates');
  return data;
};

export const createSeasonTemplate = async (template: {
  name: string;
  description?: string;
  defaultRehearsalDay?: number;
  defaultRehearsalTime?: string;
  defaultRehearsalDuration?: number;
  defaultRehearsalLocation?: string;
  typicalConcertsCount?: number;
  templateData?: Record<string, unknown>;
}): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/seasons/templates', template);
  return data;
};

export const updateSeasonTemplate = async (
  id: string,
  template: {
    name?: string;
    description?: string;
    defaultRehearsalDay?: number;
    defaultRehearsalTime?: string;
    defaultRehearsalDuration?: number;
    defaultRehearsalLocation?: string;
    typicalConcertsCount?: number;
    templateData?: Record<string, unknown>;
  },
): Promise<{ message: string }> => {
  const { data } = await api.put(`/seasons/templates/${id}`, template);
  return data;
};

export const deleteSeasonTemplate = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/seasons/templates/${id}`);
  return data;
};

// Seasons
export const getSeasons = async (status?: string): Promise<Season[]> => {
  const params = status ? { status } : {};
  const { data } = await api.get('/seasons', { params });
  return data;
};

export const getSeason = async (id: string): Promise<SeasonDetail> => {
  const { data } = await api.get(`/seasons/${id}`);
  return data;
};

export const createSeason = async (season: {
  name: string;
  startDate: string;
  endDate: string;
  templateId?: string;
  budgetTotal?: number;
  notes?: string;
}): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/seasons', season);
  return data;
};

export const updateSeason = async (
  id: string,
  season: {
    name?: string;
    startDate?: string;
    endDate?: string;
    templateId?: string;
    status?: 'draft' | 'active' | 'completed';
    budgetTotal?: number;
    budgetAllocated?: number;
    notes?: string;
  },
): Promise<{ message: string }> => {
  const { data } = await api.put(`/seasons/${id}`, season);
  return data;
};

export const deleteSeason = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/seasons/${id}`);
  return data;
};

// Season Events
export const addSeasonEvent = async (
  seasonId: string,
  event: {
    eventType: 'concert' | 'rehearsal' | 'other';
    eventId?: string;
    plannedDate: string;
    budgetAmount?: number;
    notes?: string;
  },
): Promise<{ id: string; message: string }> => {
  const { data } = await api.post(`/seasons/${seasonId}/events`, event);
  return data;
};

export const removeSeasonEvent = async (seasonId: string, eventId: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/seasons/${seasonId}/events/${eventId}`);
  return data;
};

// Generate season events (rehearsals and concerts)
export const generateSeasonEvents = async (
  seasonId: string,
  params: GenerateSeasonEventsParams,
): Promise<GenerateSeasonEventsResult> => {
  const { data } = await api.post(`/seasons/${seasonId}/generate`, params);
  return data;
};
