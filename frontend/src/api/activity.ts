import api from './client';

export interface ActivityStats {
  topPieces: { id: string; title: string; arranger: string | null; count: number }[];
  recentActivity: { date: string; downloads: number; views: number }[];
  userActivity: { id: string; name: string; downloads: number; views: number }[];
}

export const getActivityStats = async (period?: string): Promise<ActivityStats> => {
  const { data } = await api.get('/activity/stats', { params: { period } });
  return data;
};

export const logActivity = async (actionType: string, entityType: string, entityId: string): Promise<void> => {
  await api.post('/activity/log', { actionType, entityType, entityId });
};

export const getRecentActivity = async (limit: number = 5): Promise<{
  id: string;
  actionType: string;
  entityType: string;
  entityName?: string;
  createdAt: string;
}[]> => {
  const { data } = await api.get('/activity/recent', { params: { limit } });
  return data;
};
