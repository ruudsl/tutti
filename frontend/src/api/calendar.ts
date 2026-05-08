import api from './client';

export interface CalendarSettings {
  feedUrl: string;
  includeRehearsals: boolean;
  includeConcerts: boolean;
  googleConnected: boolean;
  googleCalendarId: string | null;
  lastSync: string | null;
}

export const getCalendarSettings = async (): Promise<CalendarSettings> => {
  const { data } = await api.get('/calendar/settings');
  return data;
};

export const updateCalendarSettings = async (settings: {
  includeRehearsals?: boolean;
  includeConcerts?: boolean;
  googleCalendarId?: string;
}): Promise<void> => {
  await api.put('/calendar/settings', settings);
};

export const regenerateCalendarFeed = async (): Promise<{ feedUrl: string; message: string }> => {
  const { data } = await api.post('/calendar/feed/regenerate');
  return data;
};

export const startGoogleAuth = async (): Promise<{ authUrl: string }> => {
  const { data } = await api.post('/calendar/google/auth');
  return data;
};

export const disconnectGoogle = async (): Promise<void> => {
  await api.post('/calendar/google/disconnect');
};

export const syncGoogleCalendar = async (): Promise<{ message: string; synced: number; failed: number; total: number }> => {
  const { data } = await api.post('/calendar/google/sync');
  return data;
};

export interface InfoScreenData {
  association: {
    name: string;
  };
  nextConcert: {
    id: string;
    name: string;
    date: string;
    startTime?: string;
    venue?: string;
    city?: string;
    daysUntil: number;
  } | null;
  nextRehearsal: {
    id: string;
    date: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    orchestraName?: string;
  } | null;
  upcomingConcerts: {
    id: string;
    name: string;
    date: string;
    startTime?: string;
    venue?: string;
    city?: string;
  }[];
  announcement: {
    title: string;
    content?: string;
    publishedAt: string;
  } | null;
  currentTime: string;
  refreshInterval: number;
}

export const getInfoScreenData = async (associationSlug: string): Promise<InfoScreenData> => {
  // This is a public endpoint, so we use fetch directly instead of the authenticated api client
  const response = await fetch(`/api/calendar/info-screen/${associationSlug}`);
  if (!response.ok) {
    throw new Error('Failed to fetch info screen data');
  }
  return response.json();
};
