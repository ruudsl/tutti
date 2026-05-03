import api from './client';
import type { User, Orchestra, MusicList } from '../types';

export const getOrchestras = async (): Promise<Orchestra[]> => {
  const { data } = await api.get('/orchestras');
  return data;
};

export const getOrchestra = async (id: string): Promise<Orchestra & { members: User[]; lists: MusicList[] }> => {
  const { data } = await api.get(`/orchestras/${id}`);
  return data;
};

export const createOrchestra = async (name: string): Promise<{ id: string }> => {
  const { data } = await api.post('/orchestras', { name });
  return data;
};

export const updateOrchestra = async (id: string, name: string): Promise<void> => {
  await api.put(`/orchestras/${id}`, { name });
};

export const deleteOrchestra = async (id: string): Promise<void> => {
  await api.delete(`/orchestras/${id}`);
};
