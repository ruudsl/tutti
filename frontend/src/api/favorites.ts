import api from './client';

export interface Favorite {
  id: string;
  title: string;
  arranger: string | null;
  youtubeUrl: string | null;
  durationSeconds: number;
  grade: string | null;
  pieceCount: number;
  favoritedAt: string;
}

export const getFavorites = async (): Promise<Favorite[]> => {
  const { data } = await api.get('/favorites');
  return data;
};

export const addFavorite = async (musicTitleId: string): Promise<{ message: string }> => {
  const { data } = await api.post('/favorites', { musicTitleId });
  return data;
};

export const removeFavorite = async (musicTitleId: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/favorites/${musicTitleId}`);
  return data;
};

export const checkFavorite = async (musicTitleId: string): Promise<{ isFavorite: boolean }> => {
  const { data } = await api.get(`/favorites/check/${musicTitleId}`);
  return data;
};
