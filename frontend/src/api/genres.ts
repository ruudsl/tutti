import api from './client';
import type { Genre } from '../types';

/** De genres die de vereniging ziet; met `alles` ook de verborgen standaardgenres (voor het beheer). */
export const getGenres = async (alles = false): Promise<Genre[]> => {
  const { data } = await api.get('/genres', alles ? { params: { alles: 'true' } } : undefined);
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

/** Een standaardgenre verbergen of weer tonen voor de eigen vereniging. */
export const zetGenreVerborgen = async (id: string, verborgen: boolean): Promise<void> => {
  if (verborgen) await api.post(`/genres/${id}/verbergen`);
  else await api.delete(`/genres/${id}/verbergen`);
};
