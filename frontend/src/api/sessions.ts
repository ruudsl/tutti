import api from './client';

export interface UserSession {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  lastActive: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export const getSessions = async (): Promise<UserSession[]> => {
  const { data } = await api.get('/sessions');
  return data;
};

export const revokeSession = async (sessionId: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/sessions/${sessionId}`);
  return data;
};

export const revokeAllSessions = async (): Promise<{ message: string; revokedCount: number }> => {
  const { data } = await api.delete('/sessions/all');
  return data;
};
