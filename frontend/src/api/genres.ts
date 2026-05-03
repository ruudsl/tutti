import api from './client';
import type { Genre } from '../types';

export const getGenres = async (): Promise<Genre[]> => {
  const { data } = await api.get('/genres');
  return data;
};

export const createGenre = async (name: string, parentId?: string): Promise<{ id: string }> => {
  const { data } = await api.post('/genres', { name, parentId });
  return data;
};

export const updateGenre = async (id: string, name: string, parentId?: string | null): Promise<void> => {
  await api.put(`/genres/${id}`, { name, parentId });
};

export const deleteGenre = async (id: string): Promise<void> => {
  await api.delete(`/genres/${id}`);
};
