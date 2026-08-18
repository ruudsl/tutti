import api from './client';

export interface RecentView {
  id: string;
  itemType: string;
  itemId: string;
  itemTitle: string;
  viewedAt: string;
}

export const getRecentViews = async (type?: string, limit?: number): Promise<RecentView[]> => {
  const { data } = await api.get('/recent', { params: { type, limit } });
  return data;
};

export const recordView = async (itemType: string, itemId: string, itemTitle: string): Promise<{ message: string }> => {
  const { data } = await api.post('/recent', { itemType, itemId, itemTitle });
  return data;
};

export const clearRecentViews = async (): Promise<{ message: string }> => {
  const { data } = await api.delete('/recent');
  return data;
};
