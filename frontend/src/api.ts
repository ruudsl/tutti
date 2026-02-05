import axios from 'axios';
import type { User, Instrument, Orchestra, MusicList, MusicPiece, MusicTitle, Association, Genre, MfaSetupResponse, LoginResponse } from './types';

// Use environment variable for API URL in production, fallback to /api for development proxy
const API_BASE = import.meta.env.VITE_API_URL || '/api';

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
export const login = async (email: string, password: string, mfaCode?: string): Promise<LoginResponse> => {
  const { data } = await api.post('/auth/login', { email, password, mfaCode });
  return data;
};

export const getProfile = async (): Promise<User> => {
  const { data } = await api.get('/auth/me');
  return data;
};

export const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
  await api.post('/auth/change-password', { currentPassword, newPassword });
};

// Password Reset
export const requestPasswordReset = async (email: string): Promise<{ message: string }> => {
  const { data } = await api.post('/auth/forgot-password', { email });
  return data;
};

export const validateResetToken = async (token: string): Promise<{ valid: boolean }> => {
  const { data } = await api.get(`/auth/reset-password/validate?token=${token}`);
  return data;
};

export const resetPassword = async (token: string, newPassword: string): Promise<{ message: string }> => {
  const { data } = await api.post('/auth/reset-password', { token, newPassword });
  return data;
};

// MFA
export const setupMfa = async (): Promise<MfaSetupResponse> => {
  const { data } = await api.post('/auth/mfa/setup');
  return data;
};

export const enableMfa = async (code: string): Promise<{ message: string; mfaEnabled: boolean }> => {
  const { data } = await api.post('/auth/mfa/enable', { code });
  return data;
};

export const disableMfa = async (password: string, code?: string): Promise<{ message: string; mfaEnabled: boolean }> => {
  const { data } = await api.post('/auth/mfa/disable', { password, code });
  return data;
};

export const getMfaStatus = async (): Promise<{ mfaEnabled: boolean }> => {
  const { data } = await api.get('/auth/mfa/status');
  return data;
};

// Users
export const getUsers = async (): Promise<User[]> => {
  const { data } = await api.get('/users');
  // Backend returns paginated data, extract the data array
  return Array.isArray(data) ? data : data.data || [];
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
  const { data } = await api.delete(`/music-lists/${listId}/titles`, { data: { title } });
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
  genreId?: string;
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

export const getYouTubeMeta = async (url: string): Promise<{
  title: string;
  author: string;
  thumbnailUrl: string;
  videoId: string;
}> => {
  const { data } = await api.get('/music-pieces/youtube-meta', { params: { url } });
  return data;
};

export const getTitleMeta = async (title: string, arranger?: string | null): Promise<{
  title: string;
  arranger: string | null;
  youtubeUrl: string | null;
  description: string | null;
  durationSeconds: number;
  isShared: boolean;
  genres: Genre[];
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
  grade?: string | null;
  isShared?: boolean;
  genreIds?: string[];
}): Promise<{ id: string }> => {
  const { data } = await api.put('/music-pieces/title-meta', titleData);
  return data;
};

// MP3 upload for titles
export const uploadTitleMp3 = async (titleId: string, file: File): Promise<{ message: string; mp3FilePath: string }> => {
  const formData = new FormData();
  formData.append('mp3', file);
  const { data } = await api.post(`/music-pieces/title-mp3/${titleId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

export const deleteTitleMp3 = async (titleId: string): Promise<void> => {
  await api.delete(`/music-pieces/title-mp3/${titleId}`);
};

export const getMp3Url = (filename: string): string => {
  const baseUrl = api.defaults.baseURL || '';
  const token = localStorage.getItem('token');
  return `${baseUrl}/music-pieces/mp3/${filename}?token=${token}`;
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

// Genres
export const getGenres = async (): Promise<Genre[]> => {
  const { data } = await api.get('/genres');
  return data;
};

export const createGenre = async (name: string): Promise<{ id: string }> => {
  const { data } = await api.post('/genres', { name });
  return data;
};

export const updateGenre = async (id: string, name: string): Promise<void> => {
  await api.put(`/genres/${id}`, { name });
};

export const deleteGenre = async (id: string): Promise<void> => {
  await api.delete(`/genres/${id}`);
};

// Backup
export interface BackupInfo {
  database: { size: number; sizeFormatted: string };
  pdfFiles: { count: number; size: number; sizeFormatted: string };
  mp3Files: { count: number; size: number; sizeFormatted: string };
  total: { size: number; sizeFormatted: string };
}

export const getBackupInfo = async (): Promise<BackupInfo> => {
  const { data } = await api.get('/backup/info');
  return data;
};

export const downloadBackup = async (): Promise<void> => {
  const response = await api.get('/backup', {
    responseType: 'blob',
  });

  // Create download link
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;

  // Get filename from Content-Disposition header or generate one
  const contentDisposition = response.headers['content-disposition'];
  let filename = `harmonie-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="(.+)"/);
    if (match) filename = match[1];
  }

  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const restoreBackup = async (file: File): Promise<void> => {
  const formData = new FormData();
  formData.append('backup', file);
  await api.post('/backup/restore', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000, // 5 minute timeout for large backups
  });
};

// Issues (Meldkamer)
export interface PieceIssue {
  id: string;
  music_piece_id: string;
  page_number: number | null;
  measure_number: string | null;
  description: string;
  status: 'open' | 'in_review' | 'resolved' | 'rejected';
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  piece_title: string;
  piece_arranger: string | null;
  instrument_name: string | null;
  reported_by_name: string;
  reported_by_email?: string;
  resolved_by_name?: string | null;
}

export interface IssueStats {
  total: number;
  open: number;
  in_review: number;
  resolved: number;
  rejected: number;
}

export const getIssues = async (filters?: { status?: string; pieceId?: string }): Promise<PieceIssue[]> => {
  const { data } = await api.get('/issues', { params: filters });
  return data;
};

export const getMyIssues = async (): Promise<PieceIssue[]> => {
  const { data } = await api.get('/issues/my-issues');
  return data;
};

export const getIssueStats = async (): Promise<IssueStats> => {
  const { data } = await api.get('/issues/stats');
  return data;
};

export const createIssue = async (issue: {
  musicPieceId: string;
  pageNumber?: number;
  measureNumber?: string;
  description: string;
}): Promise<PieceIssue> => {
  const { data } = await api.post('/issues', issue);
  return data;
};

export const updateIssueStatus = async (
  id: string,
  status: string,
  resolutionNotes?: string
): Promise<PieceIssue> => {
  const { data } = await api.patch(`/issues/${id}/status`, { status, resolutionNotes });
  return data;
};

export const deleteIssue = async (id: string): Promise<void> => {
  await api.delete(`/issues/${id}`);
};

// Loans (Leen-systeem)
export interface Loan {
  id: string;
  music_title_id: string;
  borrower_name: string;
  borrower_email: string | null;
  borrower_organization: string | null;
  notes: string | null;
  date_out: string;
  expected_return: string | null;
  date_returned: string | null;
  status: 'active' | 'returned' | 'overdue';
  created_at: string;
  title_name?: string;
  title_arranger?: string;
  created_by_name?: string;
}

export const getLoans = async (filters?: { status?: string }): Promise<Loan[]> => {
  const { data } = await api.get('/loans', { params: filters });
  return data;
};

export const createLoan = async (loan: {
  musicTitleId: string;
  borrowerName: string;
  borrowerEmail?: string;
  borrowerOrganization?: string;
  notes?: string;
  expectedReturn?: string;
}): Promise<Loan> => {
  const { data } = await api.post('/loans', loan);
  return data;
};

export const updateLoan = async (id: string, updates: {
  borrowerName?: string;
  borrowerEmail?: string;
  borrowerOrganization?: string;
  notes?: string;
  expectedReturn?: string;
}): Promise<Loan> => {
  const { data } = await api.put(`/loans/${id}`, updates);
  return data;
};

export const returnLoan = async (id: string): Promise<Loan> => {
  const { data } = await api.post(`/loans/${id}/return`);
  return data;
};

export const deleteLoan = async (id: string): Promise<void> => {
  await api.delete(`/loans/${id}`);
};

// Activity Log (Statistieken)
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

export default api;
