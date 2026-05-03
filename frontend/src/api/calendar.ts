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
