import axios from 'axios';
import type { User, Instrument, Orchestra, MusicList, MusicPiece, MusicTitle, Association, AuthResponse } from './types';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = async (email: string, password: string): Promise<AuthResponse> => {
  const { data } = await api.post('/auth/login', { email, password });
  return data;
};

export const getProfile = async (): Promise<User> => {
  const { data } = await api.get('/auth/me');
  return data;
};

export const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
  await api.post('/auth/change-password', { currentPassword, newPassword });
};

// Users
export const getUsers = async (): Promise<User[]> => {
  const { data } = await api.get('/users');
  return data;
};

export const getUser = async (id: string): Promise<User> => {
  const { data } = await api.get(`/users/${id}`);
  return data;
};

export const createUser = async (userData: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: string;
  instrumentIds?: string[];
  orchestraIds?: string[];
}): Promise<{ id: string }> => {
  const { data } = await api.post('/users', userData);
  return data;
};

export const updateUser = async (id: string, userData: {
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  password?: string;
  instrumentIds?: string[];
  orchestraIds?: string[];
}): Promise<void> => {
  await api.put(`/users/${id}`, userData);
};

export const deleteUser = async (id: string): Promise<void> => {
  await api.delete(`/users/${id}`);
};

// Instruments
export const getInstruments = async (): Promise<Instrument[]> => {
  const { data } = await api.get('/instruments');
  return data;
};

export const createInstrument = async (name: string, tuning?: string, clef?: string, aliases?: string[]): Promise<{ id: string }> => {
  const { data } = await api.post('/instruments', { name, tuning, clef, aliases });
  return data;
};

export const updateInstrument = async (id: string, name: string, tuning?: string, clef?: string): Promise<void> => {
  await api.put(`/instruments/${id}`, { name, tuning, clef });
};

export const deleteInstrument = async (id: string): Promise<void> => {
  await api.delete(`/instruments/${id}`);
};

export const addInstrumentAlias = async (instrumentId: string, alias: string): Promise<{ id: string }> => {
  const { data } = await api.post(`/instruments/${instrumentId}/aliases`, { alias });
  return data;
};

export const deleteInstrumentAlias = async (instrumentId: string, aliasId: string): Promise<void> => {
  await api.delete(`/instruments/${instrumentId}/aliases/${aliasId}`);
};

// Orchestras
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

// Music Lists
export const getMusicLists = async (orchestraId: string): Promise<MusicList[]> => {
  const { data } = await api.get(`/music-lists/orchestra/${orchestraId}`);
  return data;
};

export const getMyMusicLists = async (): Promise<MusicList[]> => {
  const { data } = await api.get('/music-lists/my-lists');
  return data;
};

export const getMusicList = async (id: string): Promise<MusicList & { pieces: MusicPiece[] }> => {
  const { data } = await api.get(`/music-lists/${id}`);
  return data;
};

export const createMusicList = async (name: string, orchestraId: string): Promise<{ id: string }> => {
  const { data } = await api.post('/music-lists', { name, orchestraId });
  return data;
};

export const updateMusicList = async (id: string, name: string): Promise<void> => {
  await api.put(`/music-lists/${id}`, { name });
};

export const deleteMusicList = async (id: string): Promise<void> => {
  await api.delete(`/music-lists/${id}`);
};

export const addPieceToList = async (listId: string, pieceId: string): Promise<void> => {
  await api.post(`/music-lists/${listId}/pieces`, { pieceId });
};

export const removePieceFromList = async (listId: string, pieceId: string): Promise<void> => {
  await api.delete(`/music-lists/${listId}/pieces/${pieceId}`);
};

export const addTitleToList = async (listId: string, title: string): Promise<{ added: number; total: number }> => {
  const { data } = await api.post(`/music-lists/${listId}/titles`, { title });
  return data;
};

export const removeTitleFromList = async (listId: string, title: string): Promise<{ removed: number }> => {
  const { data } = await api.delete(`/music-lists/${listId}/titles/${encodeURIComponent(title)}`);
  return data;
};

export const reorderMusicLists = async (orchestraId: string, listIds: string[]): Promise<void> => {
  await api.put('/music-lists/reorder', { orchestraId, listIds });
};

export const toggleMusicListActive = async (listId: string): Promise<{ isActive: boolean }> => {
  const { data } = await api.patch(`/music-lists/${listId}/toggle-active`);
  return data;
};

// Music Pieces
export const getMusicPieces = async (filters?: {
  search?: string;
  instrumentId?: string;
  listId?: string;
}): Promise<MusicPiece[]> => {
  const { data } = await api.get('/music-pieces', { params: filters });
  return data;
};

export const getMyMusicPieces = async (): Promise<MusicPiece[]> => {
  const { data } = await api.get('/music-pieces/my-pieces');
  return data;
};

export const getMusicTitles = async (filters?: {
  search?: string;
  listId?: string;
}): Promise<MusicTitle[]> => {
  const { data } = await api.get('/music-pieces/titles', { params: filters });
  return data;
};

export const uploadMusicPieces = async (
  files: File[],
  listId?: string,
  youtubeUrls?: Record<string, string>
): Promise<{ uploaded: any[]; errors?: any[] }> => {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  if (listId) formData.append('listId', listId);
  if (youtubeUrls) formData.append('youtubeUrls', JSON.stringify(youtubeUrls));

  const { data } = await api.post('/music-pieces/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

export const refreshInstrumentLinks = async (): Promise<{
  updated: number;
  alreadyLinked: number;
  notFound: number;
  total: number;
}> => {
  const { data } = await api.post('/music-pieces/refresh-instruments');
  return data;
};

export const updateMusicPiece = async (id: string, pieceData: {
  title?: string;
  arranger?: string;
  instrumentId?: string;
  tuning?: string;
  groupNumber?: string;
  clef?: string;
  youtubeUrl?: string;
  isShared?: boolean;
}): Promise<void> => {
  await api.put(`/music-pieces/${id}`, pieceData);
};

export const deleteMusicPiece = async (id: string): Promise<void> => {
  await api.delete(`/music-pieces/${id}`);
};

export const downloadMusicPiece = async (id: string): Promise<void> => {
  const response = await api.get(`/music-pieces/${id}/download`, {
    responseType: 'blob',
  });

  // Get filename from Content-Disposition header or use default
  const contentDisposition = response.headers['content-disposition'];
  let filename = 'muziekstuk.pdf';
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?(.+)"?/);
    if (match) filename = match[1];
  }

  // Create download link
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const shareMusicPiece = async (id: string, associationId: string): Promise<void> => {
  await api.post(`/music-pieces/${id}/share`, { associationId });
};

export const getSharedMusicPieces = async (): Promise<MusicPiece[]> => {
  const { data } = await api.get('/music-pieces/shared');
  return data;
};

export const getTitleMeta = async (title: string, arranger?: string | null): Promise<{
  title: string;
  arranger: string | null;
  youtubeUrl: string | null;
  description: string | null;
  durationSeconds: number;
}> => {
  const params = arranger ? `?arranger=${encodeURIComponent(arranger)}` : '';
  const { data } = await api.get(`/music-pieces/title-meta/${encodeURIComponent(title)}${params}`);
  return data;
};

export const updateTitleMeta = async (titleData: {
  title: string;
  arranger?: string | null;
  youtubeUrl?: string | null;
  description?: string | null;
  durationSeconds?: number;
}): Promise<{ id: string }> => {
  const { data } = await api.put('/music-pieces/title-meta', titleData);
  return data;
};

// Associations
export const getAssociations = async (): Promise<Association[]> => {
  const { data } = await api.get('/associations');
  return data;
};

export const getCurrentAssociation = async (): Promise<Association> => {
  const { data } = await api.get('/associations/current');
  return data;
};

export const updateCurrentAssociation = async (name: string): Promise<void> => {
  await api.put('/associations/current', { name });
};

export const createAssociation = async (name: string): Promise<{ id: string }> => {
  const { data } = await api.post('/associations', { name });
  return data;
};

export default api;
