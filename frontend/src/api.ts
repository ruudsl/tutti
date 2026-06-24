import axios from 'axios';
import type { User, Instrument, Orchestra, MusicList, MusicPiece, MusicTitle, Association, AssociationSettings, ThemeSettings, Genre, MfaSetupResponse, LoginResponse, Rehearsal, RehearsalDetail, RehearsalDefaultDay, SpondConfig, SpondGroup, SpondSyncResult, SpondOrchestraGroup, SpondMemberLink, MicrosoftConfig, SmtpConfig, TelegramConfig, WhatsAppConfig, Equipment, EquipmentDetail, MaintenanceAlert, UniformItem, UniformItemDetail, UniformSet, UniformItemType, UniformSizeAvailability, Concert, ConcertDetail, ConcertStatistics, PieceHistory, ConcertType, MediaType, SeatingSection, SeatingAssignment, SeatingNeighbor, RehearsalSeat, SeatingChart, ConcertTicketInfo, TicketOrder, Ticket, TicketValidationResult, TicketStats, AttendeeExport, TicketType, SeatHeatmapData } from './types';

// Use environment variable for API URL in production, fallback to /api for development proxy
const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000, // 15 second timeout to prevent hanging requests
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors - only logout on 401 (token expired/invalid), not 403 (insufficient permissions)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
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

// Pagination configuration
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

// Users with pagination support
export interface UsersFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: string;
  orchestraId?: string;
}

// Users - backwards compatible version that fetches all
export const getUsers = async (filters?: UsersFilters): Promise<User[]> => {
  // For backwards compatibility, fetch all users when no filters provided
  // Use a high limit for existing components that expect all users
  const params = filters ? { ...filters } : { limit: 1000 };
  const { data } = await api.get('/users', { params });
  // Backend returns paginated data, extract the data array
  return Array.isArray(data) ? data : data.data || [];
};

// Users - paginated version for new components
export const getUsersPaginated = async (filters?: UsersFilters): Promise<PaginatedResponse<User>> => {
  const params = {
    page: filters?.page || 1,
    pageSize: Math.min(filters?.pageSize || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    ...filters,
  };
  const { data } = await api.get('/users', { params });
  // Ensure we return proper paginated structure
  if (Array.isArray(data)) {
    return {
      data,
      total: data.length,
      page: 1,
      pageSize: data.length,
      totalPages: 1,
    };
  }
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

export const createMusicList = async (name: string, orchestraId: string, options?: {
  listType?: 'regular' | 'concert';
  concertDate?: string | null;
  concertLocation?: string | null;
}): Promise<{ id: string }> => {
  const { data } = await api.post('/music-lists', { name, orchestraId, ...options });
  return data;
};

export const updateMusicList = async (id: string, data: {
  name: string;
  listType?: 'regular' | 'concert';
  concertDate?: string | null;
  concertLocation?: string | null;
}): Promise<void> => {
  await api.put(`/music-lists/${id}`, data);
};

export const downloadProgramPdf = async (listId: string): Promise<Blob> => {
  const { data } = await api.get(`/music-lists/${listId}/program-pdf`, { responseType: 'blob' });
  return data;
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
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const getMusicPieces = async (filters?: {
  search?: string;
  instrumentId?: string;
  listId?: string;
}): Promise<MusicPiece[]> => {
  const { data } = await api.get('/music-pieces', { params: filters });
  return data;
};

export const getMusicPiecesPaginated = async (filters?: {
  search?: string;
  instrumentId?: string;
  listId?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<MusicPiece>> => {
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

// Upload with progress tracking
export const uploadMusicPiecesWithProgress = async (
  files: File[],
  options: {
    listId?: string;
    youtubeUrls?: Record<string, string>;
    onProgress?: (progress: number) => void;
    onUploadStart?: () => void;
    onUploadComplete?: () => void;
  } = {}
): Promise<{ uploaded: any[]; errors?: any[] }> => {
  const { listId, youtubeUrls, onProgress, onUploadStart, onUploadComplete } = options;

  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  if (listId) formData.append('listId', listId);
  if (youtubeUrls) formData.append('youtubeUrls', JSON.stringify(youtubeUrls));

  onUploadStart?.();

  const { data } = await api.post('/music-pieces/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress?.(percentCompleted);
      }
    },
  });

  onUploadComplete?.();

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

export const deleteMusicPiecesBulk = async (ids: string[]): Promise<{ count: number }> => {
  const { data } = await api.post('/music-pieces/bulk-delete', { ids });
  return data;
};

// Batch export music pieces as ZIP
export const batchExportMusicPieces = async (
  pieceIds: string[],
  includeMetadata = true
): Promise<void> => {
  const response = await api.post('/music-pieces/batch-export', {
    pieceIds,
    includeMetadata,
  }, {
    responseType: 'blob',
  });

  // Get filename from Content-Disposition header or use default
  const contentDisposition = response.headers['content-disposition'];
  let filename = `muziekstukken-export-${new Date().toISOString().slice(0, 10)}.zip`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="([^"]+)"|filename=([^\s;]+)/);
    if (match) filename = match[1] || match[2];
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

// Batch export all pieces for a specific title as ZIP
export const batchExportByTitle = async (
  title: string,
  arranger?: string
): Promise<void> => {
  const response = await api.post('/music-pieces/batch-export-by-title', {
    title,
    arranger,
  }, {
    responseType: 'blob',
  });

  // Get filename from Content-Disposition header or use default
  const contentDisposition = response.headers['content-disposition'];
  const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
  let filename = `${safeTitle}-${new Date().toISOString().slice(0, 10)}.zip`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="([^"]+)"|filename=([^\s;]+)/);
    if (match) filename = match[1] || match[2];
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

export const downloadMusicPiece = async (id: string): Promise<void> => {
  const response = await api.get(`/music-pieces/${id}/download`, {
    responseType: 'blob',
  });

  // Get filename from Content-Disposition header or use default
  const contentDisposition = response.headers['content-disposition'];
  let filename = 'muziekstuk.pdf';
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="([^"]+)"|filename=([^\s;]+)/);
    if (match) filename = match[1] || match[2];
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
  internalNotes?: string | null;
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

/**
 * @deprecated Use createMp3BlobUrl() instead to avoid exposing JWT tokens in URLs.
 * Tokens in URLs can be logged by servers, proxies, and browser history.
 * This function is kept for backward compatibility with existing audio elements.
 */
export const getMp3Url = (filename: string): string => {
  const baseUrl = api.defaults.baseURL || '';
  const token = localStorage.getItem('token');
  return `${baseUrl}/music-pieces/mp3/${filename}?token=${token}`;
};

// Fetch MP3 as a blob with proper Authorization header (avoids token in URL)
export const getMp3Blob = async (filename: string): Promise<Blob> => {
  const response = await api.get(`/music-pieces/mp3/${filename}`, {
    responseType: 'blob',
  });
  return response.data;
};

/**
 * Create a blob URL for audio playback - RECOMMENDED over getMp3Url.
 * This approach keeps the JWT token in the Authorization header instead of the URL.
 * Remember to call revokeBlobUrl() when the audio element is unmounted to free memory.
 */
export const createMp3BlobUrl = async (filename: string): Promise<string> => {
  const blob = await getMp3Blob(filename);
  return URL.createObjectURL(blob);
};

// Revoke a blob URL when no longer needed to free memory
export const revokeBlobUrl = (url: string): void => {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
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

// Settings
export const getSettings = async (): Promise<AssociationSettings> => {
  const { data } = await api.get('/settings');
  return data;
};

export const updateSettings = async (settings: { displayName?: string }): Promise<void> => {
  await api.put('/settings', settings);
};

export const uploadLogo = async (file: File): Promise<{ logoUrl: string }> => {
  const formData = new FormData();
  formData.append('logo', file);
  const { data } = await api.post('/settings/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

export const removeLogo = async (): Promise<void> => {
  await api.delete('/settings/logo');
};

// Theme
export const updateTheme = async (theme: ThemeSettings | null): Promise<void> => {
  await api.put('/settings/theme', { theme });
};

// Rehearsals
export const getRehearsals = async (startDate?: string, endDate?: string): Promise<Rehearsal[]> => {
  const params: Record<string, string> = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  const { data } = await api.get('/rehearsals', { params });
  return data;
};

export const getRehearsal = async (id: string): Promise<RehearsalDetail> => {
  const { data } = await api.get(`/rehearsals/${id}`);
  return data;
};

export const createRehearsal = async (rehearsal: {
  date: string; startTime: string; endTime: string; location?: string; type?: string; notes?: string; orchestraId?: string;
}): Promise<any> => {
  const { data } = await api.post('/rehearsals', rehearsal);
  return data;
};

export const updateRehearsal = async (id: string, rehearsal: {
  date: string; startTime: string; endTime: string; location?: string; type?: string; notes?: string; orchestraId?: string;
}): Promise<void> => {
  await api.put(`/rehearsals/${id}`, rehearsal);
};

export const deleteRehearsal = async (id: string): Promise<void> => {
  await api.delete(`/rehearsals/${id}`);
};

export const updateRehearsalPieces = async (id: string, pieces: { title: string; notes?: string }[]): Promise<void> => {
  await api.put(`/rehearsals/${id}/pieces`, { pieces });
};

// Rehearsal Default Days
export const getDefaultDays = async (): Promise<RehearsalDefaultDay[]> => {
  const { data } = await api.get('/rehearsals/default-days');
  return data;
};

export const addDefaultDay = async (day: {
  dayOfWeek: number; startTime: string; endTime: string; location?: string; orchestraId?: string;
}): Promise<RehearsalDefaultDay> => {
  const { data } = await api.post('/rehearsals/default-days', day);
  return data;
};

export const updateDefaultDay = async (id: string, day: {
  dayOfWeek: number; startTime: string; endTime: string; location?: string;
}): Promise<void> => {
  await api.put(`/rehearsals/default-days/${id}`, day);
};

export const deleteDefaultDay = async (id: string): Promise<void> => {
  await api.delete(`/rehearsals/default-days/${id}`);
};

export const generateRehearsals = async (startDate: string, endDate: string): Promise<{ count: number }> => {
  const { data } = await api.post('/rehearsals/generate', { startDate, endDate });
  return data;
};

// Attendance summary
export interface AttendanceMember {
  name: string;
  spondMemberId: string | null;
  userId: string | null;
  accepted: number;
  declined: number;
  unknown: number;
  total: number;
}

export const getAttendanceSummary = async (from: string, to: string, orchestraId?: string): Promise<{
  members: AttendanceMember[];
  rehearsalCount: number;
  from: string;
  to: string;
}> => {
  const params: Record<string, string> = { from, to };
  if (orchestraId) params.orchestraId = orchestraId;
  const { data } = await api.get('/rehearsals/attendance/summary', { params });
  return data;
};

// Spond integration
export const getSpondConfig = async (): Promise<SpondConfig> => {
  const { data } = await api.get('/spond/config');
  return data;
};

export const saveSpondConfig = async (config: {
  username: string; password: string; groupId?: string; syncEnabled?: boolean;
}): Promise<void> => {
  await api.put('/spond/config', config);
};

export const removeSpondConfig = async (): Promise<void> => {
  await api.delete('/spond/config');
};

export const getSpondGroups = async (): Promise<SpondGroup[]> => {
  const { data } = await api.get('/spond/groups');
  return data;
};

export const syncSpond = async (): Promise<SpondSyncResult> => {
  const { data } = await api.post('/spond/sync');
  return data;
};

export const syncSpondRehearsal = async (rehearsalId: string): Promise<{ message: string; attendanceCount: number }> => {
  const { data } = await api.post(`/spond/sync/${rehearsalId}`);
  return data;
};

// Spond Orchestra Groups
export const getSpondOrchestraGroups = async (): Promise<SpondOrchestraGroup[]> => {
  const { data } = await api.get('/spond/orchestra-groups');
  return data;
};

export const setSpondOrchestraGroup = async (orchestraId: string, spondGroupId: string | null, spondGroupName?: string): Promise<void> => {
  await api.put(`/spond/orchestra-groups/${orchestraId}`, { spondGroupId, spondGroupName });
};

// Spond Member Links
export const getSpondMemberLinks = async (): Promise<SpondMemberLink[]> => {
  const { data } = await api.get('/spond/member-links');
  return data;
};

export const createSpondMemberLink = async (spondMemberId: string, userId: string, spondMemberName?: string): Promise<void> => {
  await api.post('/spond/member-links', { spondMemberId, userId, spondMemberName });
};

export const deleteSpondMemberLink = async (id: string): Promise<void> => {
  await api.delete(`/spond/member-links/${id}`);
};

// Spond Attendance (bidirectional sync)
export const updateMyAttendance = async (rehearsalId: string, accepted: boolean): Promise<{
  message: string;
  status: string;
  spondSynced: boolean;
}> => {
  const { data } = await api.put(`/spond/attendance/${rehearsalId}`, { accepted });
  return data;
};

export const getMyAttendanceStatus = async (rehearsalId: string): Promise<{
  status: string;
  canSyncToSpond: boolean;
}> => {
  const { data } = await api.get(`/spond/attendance/${rehearsalId}/my-status`);
  return data;
};

// Microsoft Entra ID (SSO)
export const getMicrosoftEnabled = async (): Promise<{ enabled: boolean }> => {
  const { data } = await api.get('/auth/microsoft/enabled');
  return data;
};

export const getMicrosoftLoginUrl = async (): Promise<{ authUrl: string }> => {
  const { data } = await api.get('/auth/microsoft/login');
  return data;
};

export const microsoftCallback = async (code: string, state: string): Promise<LoginResponse> => {
  const { data } = await api.post('/auth/microsoft/callback', { code, state });
  return data;
};

export const getMicrosoftConfig = async (): Promise<MicrosoftConfig> => {
  const { data } = await api.get('/auth/microsoft/config');
  return data;
};

export const saveMicrosoftConfig = async (config: {
  clientId: string; clientSecret?: string; tenantId: string; enabled: boolean;
}): Promise<void> => {
  await api.put('/auth/microsoft/config', config);
};

export const removeMicrosoftConfig = async (): Promise<void> => {
  await api.delete('/auth/microsoft/config');
};

// SMTP Configuration
export const getSmtpConfig = async (): Promise<SmtpConfig> => {
  const { data } = await api.get('/settings/smtp');
  return data;
};

export const saveSmtpConfig = async (config: {
  host: string; port: number; secure: boolean; user: string; password?: string; from: string; enabled: boolean;
}): Promise<void> => {
  await api.put('/settings/smtp', config);
};

export const removeSmtpConfig = async (): Promise<void> => {
  await api.delete('/settings/smtp');
};

export const testSmtpConfig = async (): Promise<{ message: string }> => {
  const { data } = await api.post('/settings/smtp/test');
  return data;
};

// Telegram Configuration
export type { TelegramConfig, WhatsAppConfig };

export const getTelegramConfig = async (): Promise<TelegramConfig> => {
  const { data } = await api.get('/settings/telegram');
  return data;
};

export const saveTelegramConfig = async (config: { botToken?: string; enabled: boolean }): Promise<{ message: string }> => {
  const { data } = await api.put('/settings/telegram', config);
  return data;
};

export const deleteTelegramConfig = async (): Promise<{ message: string }> => {
  const { data } = await api.delete('/settings/telegram');
  return data;
};

// WhatsApp Configuration
export const getWhatsAppConfig = async (): Promise<WhatsAppConfig> => {
  const { data } = await api.get('/settings/whatsapp');
  return data;
};

export const saveWhatsAppConfig = async (config: {
  provider: 'meta' | 'twilio';
  enabled: boolean;
  meta?: { phoneNumberId?: string; accessToken?: string };
  twilio?: { accountSid?: string; authToken?: string; whatsappFrom?: string };
}): Promise<{ message: string }> => {
  const { data } = await api.put('/settings/whatsapp', config);
  return data;
};

export const deleteWhatsAppConfig = async (): Promise<{ message: string }> => {
  const { data } = await api.delete('/settings/whatsapp');
  return data;
};

// Changelog
export const getChangelog = async (lang?: string): Promise<{ content: string }> => {
  const { data } = await api.get('/changelog', { params: { lang } });
  return data;
};

// PDF Tools - Save as music piece
export const savePdfAsMusicPiece = async (
  filepath: string,
  filename: string,
  listId?: string,
  metadata?: {
    title?: string;
    arranger?: string;
    instrumentId?: string;
    tuning?: string;
    groupNumber?: string;
    clef?: string;
  }
): Promise<{ success: boolean; id: string; title: string; instrumentFound: boolean }> => {
  const { data } = await api.post('/pdf-tools/save-as-music-piece', {
    filepath,
    filename,
    listId,
    ...metadata,
  });
  return data;
};

// ========================
// MUSICAINFO
// ========================

export interface MusicaInfoSearchResult {
  title: string;
  composer: string;
  arranger: string;
  articleNumber: string;
  detailUrl: string;
  publisher: string;
  duration: string;
  difficulty: string;
}

export interface MusicaInfoDetail {
  title: string;
  composer: string;
  arranger: string;
  publisher: string;
  duration: string;
  durationSeconds: number;
  difficulty: string;
  instrumentation: string;
  articleNumber: string;
}

export const searchMusicaInfo = async (query: string): Promise<{
  query: string;
  resultCount: number;
  results: MusicaInfoSearchResult[];
  searchUrl: string;
}> => {
  const { data } = await api.get('/musicainfo/search', { params: { q: query } });
  return data;
};

export const getMusicaInfoDetail = async (artnr: string): Promise<MusicaInfoDetail> => {
  const { data } = await api.get('/musicainfo/detail', { params: { artnr } });
  return data;
};

// ========================
// IMSLP
// ========================

export interface ImslpWork {
  id: string;
  title: string;
  composer: string;
  workCategory: string;
  instrumentation: string;
  key: string;
  movements: string[];
  year: string;
  permalink: string;
}

export interface ImslpScore {
  id: string;
  filename: string;
  description: string;
  pageCount: number;
  fileUrl: string;
  uploader: string;
  uploadDate: string;
  editor: string;
  publisher: string;
  copyright: string;
  fileSize: string;
}

export interface ImslpWorkDetail extends ImslpWork {
  scores: ImslpScore[];
}

export interface ImslpSearchResult {
  works: ImslpWork[];
  totalCount: number;
  searchUrl: string;
}

export interface ImslpImportResult {
  message: string;
  musicTitleId: string;
  musicPieceId: string;
  filename: string;
  title: string;
  composer?: string;
  arranger?: string;
}

export const searchImslp = async (query: string, composer?: string): Promise<ImslpSearchResult> => {
  const params: Record<string, string> = { q: query };
  if (composer) params.composer = composer;
  const { data } = await api.get('/imslp/search', { params });
  return data;
};

export const getImslpWorkDetails = async (workId: string): Promise<ImslpWorkDetail> => {
  const { data } = await api.get(`/imslp/work/${workId}`);
  return data;
};

export const importFromImslp = async (params: {
  fileUrl: string;
  title: string;
  composer?: string;
  arranger?: string;
  instrumentation?: string;
  imslpWorkId?: string;
  imslpPermalink?: string;
}): Promise<ImslpImportResult> => {
  const { data } = await api.post('/imslp/import', params);
  return data;
};

// ==================== CLOUD IMPORT (OneDrive / Google Drive) ====================

export interface CloudImportConfig {
  onedrive: {
    enabled: boolean;
    clientId: string | null;
    tenantId: string;
  };
  googleDrive: {
    enabled: boolean;
    clientId: string | null;
    apiKey: string | null;
  };
}

export interface CloudImportFile {
  id: string;
  name: string;
  downloadUrl?: string;
}

export interface CloudImportResult {
  message: string;
  uploaded: Array<{
    id: string;
    filename: string;
    title: string;
    instrumentId: string | null;
    instrumentFound: boolean;
  }>;
  errors?: Array<{ filename: string; error: string }>;
}

export const getCloudImportConfig = async (): Promise<CloudImportConfig> => {
  const { data } = await api.get('/cloud-import/config');
  return data;
};

export const importFromOneDrive = async (params: {
  files: CloudImportFile[];
  accessToken: string;
  listId?: string;
}): Promise<CloudImportResult> => {
  const { data } = await api.post('/cloud-import/onedrive', params);
  return data;
};

export const importFromGoogleDrive = async (params: {
  files: CloudImportFile[];
  accessToken: string;
  listId?: string;
}): Promise<CloudImportResult> => {
  const { data } = await api.post('/cloud-import/google-drive', params);
  return data;
};

// ==================== GOOGLE DRIVE SETTINGS ====================

export interface GoogleDriveSettings {
  clientId: string;
  apiKey: string;
  enabled: boolean;
  configured: boolean;
}

export const getGoogleDriveSettings = async (): Promise<GoogleDriveSettings> => {
  const { data } = await api.get('/settings/google-drive');
  return data;
};

export const updateGoogleDriveSettings = async (params: {
  clientId: string;
  apiKey: string;
  enabled: boolean;
}): Promise<{ message: string }> => {
  const { data } = await api.put('/settings/google-drive', params);
  return data;
};

export const deleteGoogleDriveSettings = async (): Promise<{ message: string }> => {
  const { data } = await api.delete('/settings/google-drive');
  return data;
};

// ==================== EQUIPMENT (INSTRUMENTENBEHEER) ====================

export const getEquipmentTypes = async (): Promise<string[]> => {
  const { data } = await api.get('/equipment/types');
  return data;
};

export const getMaintenanceAlerts = async (): Promise<MaintenanceAlert[]> => {
  const { data } = await api.get('/equipment/maintenance-alerts');
  return data;
};

export const getEquipment = async (filters?: {
  search?: string;
  status?: string;
  type?: string;
}): Promise<{ data: Equipment[]; total: number; page: number; limit: number }> => {
  const { data } = await api.get('/equipment', { params: filters });
  return data;
};

export const getEquipmentItem = async (id: string): Promise<EquipmentDetail> => {
  const { data } = await api.get(`/equipment/${id}`);
  return data;
};

export const createEquipment = async (equipment: {
  instrumentType: string;
  brandModel?: string;
  serialNumber?: string;
  yearOfManufacture?: number;
  status?: string;
  currentUserId?: string | null;
  notes?: string;
  maintenanceIntervalMonths?: number;
  lastMaintenanceDate?: string;
  purchasePrice?: number;
  currentValue?: number;
}): Promise<{ id: string }> => {
  const { data } = await api.post('/equipment', equipment);
  return data;
};

export const updateEquipment = async (id: string, equipment: {
  instrumentType?: string;
  brandModel?: string;
  serialNumber?: string;
  yearOfManufacture?: number;
  status?: string;
  currentUserId?: string | null;
  notes?: string;
  maintenanceIntervalMonths?: number;
  lastMaintenanceDate?: string;
  purchasePrice?: number;
  currentValue?: number;
}): Promise<void> => {
  await api.put(`/equipment/${id}`, equipment);
};

export const deleteEquipment = async (id: string): Promise<void> => {
  await api.delete(`/equipment/${id}`);
};

export const addEquipmentDamageLog = async (equipmentId: string, log: {
  date: string;
  description: string;
  repairCost?: number;
  repairedBy?: string;
  status?: string;
}): Promise<{ id: string }> => {
  const { data } = await api.post(`/equipment/${equipmentId}/damage-logs`, log);
  return data;
};

export const updateEquipmentDamageLog = async (equipmentId: string, logId: string, log: {
  date?: string;
  description?: string;
  repairCost?: number;
  repairedBy?: string;
  status?: string;
}): Promise<void> => {
  await api.put(`/equipment/${equipmentId}/damage-logs/${logId}`, log);
};

export const deleteEquipmentDamageLog = async (equipmentId: string, logId: string): Promise<void> => {
  await api.delete(`/equipment/${equipmentId}/damage-logs/${logId}`);
};

export const createEquipmentLoan = async (equipmentId: string, loan: {
  userId: string;
  loanDate: string;
  conditionAtLoan?: string;
  notes?: string;
}): Promise<{ id: string }> => {
  const { data } = await api.post(`/equipment/${equipmentId}/loans`, loan);
  return data;
};

export const returnEquipmentLoan = async (equipmentId: string, loanId: string, returnData: {
  returnDate: string;
  conditionAtReturn?: string;
}): Promise<void> => {
  await api.post(`/equipment/${equipmentId}/loans/${loanId}/return`, returnData);
};

export const recordEquipmentMaintenance = async (equipmentId: string, maintenance: {
  date?: string;
  notes?: string;
}): Promise<{ nextMaintenanceDate: string }> => {
  const { data } = await api.post(`/equipment/${equipmentId}/record-maintenance`, maintenance);
  return data;
};

// ==================== UNIFORMS (UNIFORMEN-INVENTARIS) ====================

export const getUniformItemTypes = async (): Promise<UniformItemType[]> => {
  const { data } = await api.get('/uniforms/item-types');
  return data;
};

export const searchUniformsBySize = async (size: string, itemType?: string): Promise<UniformItem[]> => {
  const { data } = await api.get('/uniforms/size-search', { params: { size, itemType } });
  return data;
};

export const getUniformAvailabilityBySize = async (itemType?: string): Promise<UniformSizeAvailability[]> => {
  const { data } = await api.get('/uniforms/available-by-size', { params: { itemType } });
  return data;
};

export const getUniformItems = async (filters?: {
  search?: string;
  status?: string;
  itemType?: string;
  size?: string;
}): Promise<{ data: UniformItem[]; total: number; page: number; limit: number }> => {
  const { data } = await api.get('/uniforms/items', { params: filters });
  return data;
};

export const getUniformItem = async (id: string): Promise<UniformItemDetail> => {
  const { data } = await api.get(`/uniforms/items/${id}`);
  return data;
};

export const createUniformItem = async (item: {
  itemType: string;
  sizeStandard?: string;
  sizeLength?: number;
  sizeWidth?: number;
  color?: string;
  condition?: string;
  status?: string;
  currentUserId?: string | null;
  notes?: string;
  purchaseDate?: string;
  purchasePrice?: number;
}): Promise<{ id: string }> => {
  const { data } = await api.post('/uniforms/items', item);
  return data;
};

export const createUniformItemsBulk = async (item: {
  itemType: string;
  sizeStandard?: string;
  sizeLength?: number;
  sizeWidth?: number;
  color?: string;
  condition?: string;
  status?: string;
  notes?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  count: number;
}): Promise<{ ids: string[]; count: number }> => {
  const { data } = await api.post('/uniforms/items/bulk', item);
  return data;
};

export const updateUniformItem = async (id: string, item: {
  itemType?: string;
  sizeStandard?: string;
  sizeLength?: number;
  sizeWidth?: number;
  color?: string;
  condition?: string;
  status?: string;
  currentUserId?: string | null;
  notes?: string;
  purchaseDate?: string;
  purchasePrice?: number;
}): Promise<void> => {
  await api.put(`/uniforms/items/${id}`, item);
};

export const deleteUniformItem = async (id: string): Promise<void> => {
  await api.delete(`/uniforms/items/${id}`);
};

export const assignUniformItem = async (itemId: string, assignment: {
  userId: string;
  assignedDate: string;
  conditionAtAssignment?: string;
  notes?: string;
}): Promise<{ id: string }> => {
  const { data } = await api.post(`/uniforms/items/${itemId}/assign`, assignment);
  return data;
};

export const returnUniformItem = async (itemId: string, returnData: {
  returnedDate: string;
  conditionAtReturn?: string;
}): Promise<void> => {
  await api.post(`/uniforms/items/${itemId}/return`, returnData);
};

export const getUniformSets = async (): Promise<UniformSet[]> => {
  const { data } = await api.get('/uniforms/sets');
  return data;
};

export const getUniformSet = async (id: string): Promise<UniformSet> => {
  const { data } = await api.get(`/uniforms/sets/${id}`);
  return data;
};

export const createUniformSet = async (set: {
  name: string;
  description?: string;
  requirements?: { itemType: string; quantity: number }[];
}): Promise<{ id: string }> => {
  const { data } = await api.post('/uniforms/sets', set);
  return data;
};

export const updateUniformSet = async (id: string, set: {
  name?: string;
  description?: string;
  requirements?: { itemType: string; quantity: number }[];
}): Promise<void> => {
  await api.put(`/uniforms/sets/${id}`, set);
};

export const deleteUniformSet = async (id: string): Promise<void> => {
  await api.delete(`/uniforms/sets/${id}`);
};

export const getUserUniforms = async (userId: string): Promise<UniformItem[]> => {
  const { data } = await api.get(`/uniforms/user/${userId}`);
  return data;
};

// ==================== CONCERTS (CONCERT-ARCHIEF) ====================

export const getConcertTypes = async (): Promise<{
  concertTypes: ConcertType[];
  mediaTypes: MediaType[];
}> => {
  const { data } = await api.get('/concerts/types');
  return data;
};

// Concert Types Admin
export const getAdminConcertTypes = async (): Promise<{
  types: { id: string; value: string; label: string; sortOrder: number }[];
  defaults: ConcertType[];
}> => {
  const { data } = await api.get('/concerts/concert-types');
  return data;
};

export const createConcertType = async (value: string, label: string, sortOrder?: number): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/concerts/concert-types', { value, label, sortOrder });
  return data;
};

export const updateConcertType = async (id: string, updates: { value?: string; label?: string; sortOrder?: number }): Promise<{ message: string }> => {
  const { data } = await api.put(`/concerts/concert-types/${id}`, updates);
  return data;
};

export const deleteConcertType = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/concerts/concert-types/${id}`);
  return data;
};

export const initDefaultConcertTypes = async (): Promise<{ message: string }> => {
  const { data } = await api.post('/concerts/concert-types/init-defaults');
  return data;
};

export const getConcertStatistics = async (): Promise<ConcertStatistics> => {
  const { data } = await api.get('/concerts/statistics');
  return data;
};

export const getPieceHistory = async (title: string): Promise<PieceHistory> => {
  const { data } = await api.get(`/concerts/piece-history/${encodeURIComponent(title)}`);
  return data;
};

export const getConcerts = async (filters?: {
  search?: string;
  year?: string;
  concertType?: string;
}): Promise<{ data: Concert[]; total: number; page: number; limit: number }> => {
  const { data } = await api.get('/concerts', { params: filters });
  return data;
};

export const getConcertYears = async (): Promise<string[]> => {
  const { data } = await api.get('/concerts/years');
  return data;
};

export const getConcert = async (id: string): Promise<ConcertDetail> => {
  const { data } = await api.get(`/concerts/${id}`);
  return data;
};

export const createConcert = async (concert: {
  name: string;
  date: string;
  endDate?: string;
  location?: string;
  venueType?: string;
  concertType?: string;
  description?: string;
  notes?: string;
}): Promise<{ id: string }> => {
  const { data } = await api.post('/concerts', concert);
  return data;
};

export const updateConcert = async (id: string, concert: {
  name?: string;
  date?: string;
  endDate?: string;
  location?: string;
  venueType?: string;
  concertType?: string;
  description?: string;
  notes?: string;
}): Promise<void> => {
  await api.put(`/concerts/${id}`, concert);
};

export const deleteConcert = async (id: string): Promise<void> => {
  await api.delete(`/concerts/${id}`);
};

export const addConcertProgramItem = async (concertId: string, item: {
  musicTitleId?: string | null;
  title: string;
  composer?: string;
  arranger?: string;
  sortOrder?: number;
  notes?: string;
  partOfSet?: string;
}): Promise<{ id: string }> => {
  const { data } = await api.post(`/concerts/${concertId}/program`, item);
  return data;
};

export const updateConcertProgramItem = async (concertId: string, programId: string, item: {
  musicTitleId?: string | null;
  title?: string;
  arranger?: string;
  sortOrder?: number;
  notes?: string;
  partOfSet?: string;
}): Promise<void> => {
  await api.put(`/concerts/${concertId}/program/${programId}`, item);
};

export const deleteConcertProgramItem = async (concertId: string, programId: string): Promise<void> => {
  await api.delete(`/concerts/${concertId}/program/${programId}`);
};

export const reorderConcertProgram = async (concertId: string, items: { id: string; sortOrder: number }[]): Promise<void> => {
  await api.put(`/concerts/${concertId}/program/reorder`, { items });
};

export const exportConcertProgram = async (concertId: string): Promise<string> => {
  const { data } = await api.get(`/concerts/${concertId}/program/export`, { responseType: 'text' });
  return data;
};

export const exportBumaStemra = async (params: {
  startDate: string;
  endDate: string;
}): Promise<string> => {
  const { data } = await api.get('/concerts/buma-stemra-export', {
    params,
    responseType: 'text',
  });
  return data;
};

export const addConcertMedia = async (concertId: string, media: {
  mediaType: string;
  url?: string;
  description?: string;
}): Promise<{ id: string }> => {
  const { data } = await api.post(`/concerts/${concertId}/media`, media);
  return data;
};

export const deleteConcertMedia = async (concertId: string, mediaId: string): Promise<void> => {
  await api.delete(`/concerts/${concertId}/media/${mediaId}`);
};

export const addConcertAttendance = async (concertId: string, attendance: {
  userId?: string | null;
  memberName: string;
  instrumentPlayed?: string;
  notes?: string;
}): Promise<{ id: string }> => {
  const { data } = await api.post(`/concerts/${concertId}/attendance`, attendance);
  return data;
};

export const addConcertAttendanceBulk = async (concertId: string, userIds: string[]): Promise<{ ids: string[]; count: number }> => {
  const { data } = await api.post(`/concerts/${concertId}/attendance/bulk`, { userIds });
  return data;
};

export const updateConcertAttendance = async (concertId: string, attendanceId: string, attendance: {
  memberName?: string;
  instrumentPlayed?: string;
  notes?: string;
}): Promise<void> => {
  await api.put(`/concerts/${concertId}/attendance/${attendanceId}`, attendance);
};

export const deleteConcertAttendance = async (concertId: string, attendanceId: string): Promise<void> => {
  await api.delete(`/concerts/${concertId}/attendance/${attendanceId}`);
};

// ==================== ENTRA ID SYNC ====================

export interface JobTitleMapping {
  id: string;
  job_title: string;
  instrument_id: string;
  instrument_name: string;
  instrument_tuning: string | null;
}

export interface EntraUser {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
  department: string | null;
  departments: string[];
  isImported: boolean;
  hasMapping: boolean;
  mappedInstrumentId: string | null;
}

export interface EntraUsersResponse {
  users: EntraUser[];
  uniqueJobTitles: string[];
  uniqueDepartments: string[];
  newDepartments: string[];
  totalCount: number;
  importedCount: number;
}

export interface EntraImportResult {
  message: string;
  imported: number;
  skipped: number;
  errors: string[];
}

export interface EntraSyncResult {
  message: string;
  updated: number;
  created: number;
  skipped: number;
}

// Job Title Mappings
export const getJobTitleMappings = async (): Promise<JobTitleMapping[]> => {
  const { data } = await api.get('/entra/mappings');
  return data;
};

export const createJobTitleMapping = async (mapping: {
  jobTitle: string;
  instrumentId: string;
}): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/entra/mappings', mapping);
  return data;
};

export const updateJobTitleMapping = async (id: string, instrumentId: string): Promise<void> => {
  await api.put(`/entra/mappings/${id}`, { instrumentId });
};

export const deleteJobTitleMapping = async (id: string): Promise<void> => {
  await api.delete(`/entra/mappings/${id}`);
};

// Entra Users
export const getEntraUsers = async (): Promise<EntraUsersResponse> => {
  const { data } = await api.get('/entra/users');
  return data;
};

export const importEntraUsers = async (userIds: string[]): Promise<EntraImportResult> => {
  const { data } = await api.post('/entra/users/import', { userIds });
  return data;
};

export const syncEntraUsers = async (createNew: boolean = false): Promise<EntraSyncResult> => {
  const { data } = await api.post('/entra/users/sync', { createNew });
  return data;
};

export const syncEntraPhotos = async (): Promise<{ message: string; synced: number; skipped: number; failed: number }> => {
  const { data } = await api.post('/entra/sync-photos');
  return data;
};

// ==================== MEMBER DIRECTORY (SMOELENBOEK) ====================

export interface DirectoryMember {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  instruments: { id: string; name: string; tuning: string | null }[];
  orchestras: { id: string; name: string }[];
}

export const getMemberDirectory = async (filters?: {
  orchestraId?: string;
  instrumentId?: string;
  search?: string;
}): Promise<DirectoryMember[]> => {
  const { data } = await api.get('/users/directory', { params: filters });
  return data;
};

// ==================== AUDIT LOGS ====================

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName?: string;
  changes?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

export const getAuditLogs = async (params?: {
  page?: number;
  pageSize?: number;
  action?: string;
  entityType?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<AuditLogsResponse> => {
  const { data } = await api.get('/audit-logs', { params });
  return data;
};

// ==================== DASHBOARD WIDGETS ====================

export const getUpcomingRehearsals = async (limit: number = 3): Promise<Rehearsal[]> => {
  const { data } = await api.get('/rehearsals/upcoming', { params: { limit } });
  return data;
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

// ==================== SEATING (ORKEST OPSTELLING) ====================

// Seating Sections
export const getSeatingSections = async (orchestraId: string): Promise<SeatingSection[]> => {
  const { data } = await api.get(`/seating/sections/${orchestraId}`);
  return data;
};

export const createDefaultSeatingLayout = async (orchestraId: string): Promise<{ message: string }> => {
  const { data } = await api.post(`/seating/sections/${orchestraId}/default`);
  return data;
};

export const createSeatingSection = async (section: {
  orchestraId: string;
  name: string;
  rowNumber: number;
  instrumentIds?: string[];
}): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/seating/sections', section);
  return data;
};

export const updateSeatingSection = async (id: string, section: {
  name?: string;
  rowNumber?: number;
  instrumentIds?: string[];
}): Promise<{ message: string }> => {
  const { data } = await api.put(`/seating/sections/${id}`, section);
  return data;
};

export const deleteSeatingSection = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/seating/sections/${id}`);
  return data;
};

export const deleteAllSeatingSections = async (orchestraId: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/seating/sections/orchestra/${orchestraId}`);
  return data;
};

// Seating Assignments
export const getSeatingAssignments = async (orchestraId: string): Promise<SeatingAssignment[]> => {
  const { data } = await api.get(`/seating/assignments/${orchestraId}`);
  return data;
};

export const createSeatingAssignment = async (assignment: {
  orchestraId: string;
  userId: string;
  sectionId: string;
  positionInSection: number;
  seatLabel?: string;
  notes?: string;
}): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/seating/assignments', assignment);
  return data;
};

export const updateSeatingAssignment = async (id: string, assignment: {
  sectionId?: string;
  positionInSection?: number;
  seatLabel?: string;
  notes?: string;
}): Promise<{ message: string }> => {
  const { data } = await api.put(`/seating/assignments/${id}`, assignment);
  return data;
};

export const deleteSeatingAssignment = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/seating/assignments/${id}`);
  return data;
};

export const bulkUpdateSeatingAssignments = async (orchestraId: string, assignments: {
  userId: string;
  sectionId: string;
  positionInSection: number;
}[]): Promise<{ message: string }> => {
  const { data } = await api.put(`/seating/assignments/bulk/${orchestraId}`, { assignments });
  return data;
};

// Seating Neighbors
export const getSeatingNeighbors = async (orchestraId: string): Promise<SeatingNeighbor[]> => {
  const { data } = await api.get(`/seating/neighbors/${orchestraId}`);
  return data;
};

export const createSeatingNeighbor = async (neighbor: {
  orchestraId: string;
  userId: string;
  neighborUserId: string;
  preference: 'preferred' | 'avoid';
}): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/seating/neighbors', neighbor);
  return data;
};

export const deleteSeatingNeighbor = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/seating/neighbors/${id}`);
  return data;
};

// Rehearsal Seating
export const getRehearsalSeating = async (rehearsalId: string): Promise<RehearsalSeat[]> => {
  const { data } = await api.get(`/seating/rehearsal/${rehearsalId}`);
  return data;
};

export const generateRehearsalSeating = async (rehearsalId: string): Promise<{ message: string; memberCount: number }> => {
  const { data } = await api.post(`/seating/rehearsal/${rehearsalId}/generate`);
  return data;
};

export const updateRehearsalSeat = async (rehearsalId: string, seatId: string, seat: {
  rowNumber: number;
  positionInRow: number;
}): Promise<{ message: string }> => {
  const { data } = await api.put(`/seating/rehearsal/${rehearsalId}/seat/${seatId}`, seat);
  return data;
};

// Seating Chart
export const getSeatingChart = async (orchestraId: string, rehearsalId?: string): Promise<SeatingChart> => {
  const params = rehearsalId ? { rehearsalId } : {};
  const { data } = await api.get(`/seating/chart/${orchestraId}`, { params });
  return data;
};

// Seating Notifications
export interface SeatingNotificationSettings {
  id: string;
  orchestra_id: string;
  notification_type: 'webhook' | 'whatsapp';
  webhook_url: string | null;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_whatsapp_from: string | null;
  twilio_whatsapp_to: string | null;
  minutes_before: number;
  enabled: boolean;
  include_image: boolean;
  message_template: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeatingNotificationLog {
  id: string;
  rehearsal_id: string;
  orchestra_id: string;
  sent_at: string;
  status: 'pending' | 'sent' | 'failed';
  error_message: string | null;
  webhook_response: string | null;
}

export const getSeatingNotificationSettings = async (orchestraId: string): Promise<SeatingNotificationSettings | null> => {
  const { data } = await api.get(`/seating-notifications/settings/${orchestraId}`);
  return data;
};

export const saveSeatingNotificationSettings = async (orchestraId: string, settings: {
  notification_type: 'webhook' | 'whatsapp';
  webhook_url?: string;
  twilio_account_sid?: string;
  twilio_auth_token?: string;
  twilio_whatsapp_from?: string;
  twilio_whatsapp_to?: string;
  minutes_before: number;
  enabled: boolean;
  include_image: boolean;
  message_template?: string;
}): Promise<SeatingNotificationSettings> => {
  const { data } = await api.put(`/seating-notifications/settings/${orchestraId}`, settings);
  return data;
};

export const deleteSeatingNotificationSettings = async (orchestraId: string): Promise<{ success: boolean }> => {
  const { data } = await api.delete(`/seating-notifications/settings/${orchestraId}`);
  return data;
};

export const getSeatingNotificationLogs = async (rehearsalId: string): Promise<SeatingNotificationLog[]> => {
  const { data } = await api.get(`/seating-notifications/logs/${rehearsalId}`);
  return data;
};

export const sendSeatingNotification = async (rehearsalId: string, imageBase64?: string): Promise<{ success: boolean; message: string }> => {
  const { data } = await api.post(`/seating-notifications/send/${rehearsalId}`, { imageBase64 });
  return data;
};

export const testTwilioConnection = async (settings: {
  account_sid: string;
  auth_token: string;
  whatsapp_from: string;
  whatsapp_to: string;
}): Promise<{ success: boolean; message: string }> => {
  const { data } = await api.post('/seating-notifications/test-twilio', settings);
  return data;
};

// ========================
// ONBOARDING & OFFBOARDING
// ========================

export interface OnboardingRequest {
  firstName: string;
  lastName: string;
  email: string;
  privateEmail?: string;
  instrumentIds?: string[];
  orchestraIds?: string[];
  createM365Account?: boolean;
  m365Password?: string;
  addToPercussionGroup?: boolean;
  profilePhoto?: File;
}

export interface OnboardingResponse {
  success: boolean;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  tempPassword: string;
  m365Created: boolean;
  m365Error: string | null;
  licenseAssigned?: boolean;
  groupsAdded?: string[];
  groupsFailed?: string[];
  emailForwardingSet?: boolean;
  photoUploaded?: boolean;
  spondLinkPending: boolean;
  message: string;
  instructions: string[];
}

export interface M365GroupMapping {
  id: string;
  orchestraId: string | null;
  orchestraName: string | null;
  groupName: string;
  groupType: 'orchestra' | 'percussion' | 'special';
}

export interface InstrumentJobTitleMapping {
  id: string;
  instrumentId: string;
  instrumentName: string;
  instrumentTuning: string | null;
  jobTitle: string;
}

export interface PendingSpondLink {
  id: string;
  userId: string;
  expectedEmail: string;
  expectedName: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
}

export interface OnboardingTask {
  id: string;
  taskType: string;
  status: string;
  errorMessage: string | null;
  metadata: Record<string, any> | null;
  completedAt: string | null;
  createdAt: string;
}

export interface OffboardResponse {
  success: boolean;
  m365Removed: boolean;
  m365Error: string | null;
  message: string;
  notes: string[];
}

export interface InactiveMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  offboardedAt: string | null;
  createdAt: string;
}

export const onboardMember = async (data: OnboardingRequest): Promise<OnboardingResponse> => {
  // Use FormData if there's a profile photo, otherwise use JSON
  if (data.profilePhoto) {
    const formData = new FormData();
    formData.append('firstName', data.firstName);
    formData.append('lastName', data.lastName);
    formData.append('email', data.email);
    if (data.privateEmail) formData.append('privateEmail', data.privateEmail);
    if (data.instrumentIds) formData.append('instrumentIds', JSON.stringify(data.instrumentIds));
    if (data.orchestraIds) formData.append('orchestraIds', JSON.stringify(data.orchestraIds));
    if (data.createM365Account) formData.append('createM365Account', 'true');
    if (data.m365Password) formData.append('m365Password', data.m365Password);
    if (data.addToPercussionGroup) formData.append('addToPercussionGroup', 'true');
    formData.append('profilePhoto', data.profilePhoto);

    const { data: response } = await api.post('/onboarding/member', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response;
  } else {
    const { data: response } = await api.post('/onboarding/member', data);
    return response;
  }
};

// M365 Group Mappings
export const getM365GroupMappings = async (): Promise<M365GroupMapping[]> => {
  const { data } = await api.get('/onboarding/m365-groups');
  return data;
};

export const createM365GroupMapping = async (data: { orchestraId?: string; groupName: string; groupType?: string }): Promise<{ id: string; message: string }> => {
  const { data: response } = await api.post('/onboarding/m365-groups', data);
  return response;
};

export const updateM365GroupMapping = async (id: string, groupName: string): Promise<{ message: string }> => {
  const { data } = await api.put(`/onboarding/m365-groups/${id}`, { groupName });
  return data;
};

export const deleteM365GroupMapping = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/onboarding/m365-groups/${id}`);
  return data;
};

// Instrument Job Title Mappings (instrument -> M365 job title)
export const getInstrumentJobTitleMappings = async (): Promise<InstrumentJobTitleMapping[]> => {
  const { data } = await api.get('/onboarding/job-titles');
  return data;
};

export const createInstrumentJobTitleMapping = async (data: { instrumentId: string; jobTitle: string }): Promise<{ id: string; message: string }> => {
  const { data: response } = await api.post('/onboarding/job-titles', data);
  return response;
};

export const updateInstrumentJobTitleMapping = async (id: string, jobTitle: string): Promise<{ message: string }> => {
  const { data } = await api.put(`/onboarding/job-titles/${id}`, { jobTitle });
  return data;
};

export const deleteInstrumentJobTitleMapping = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/onboarding/job-titles/${id}`);
  return data;
};

export const getPendingSpondLinks = async (): Promise<PendingSpondLink[]> => {
  const { data } = await api.get('/onboarding/pending-links');
  return data;
};

export const deletePendingSpondLink = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/onboarding/pending-links/${id}`);
  return data;
};

export const getOnboardingTasks = async (userId: string): Promise<OnboardingTask[]> => {
  const { data } = await api.get(`/onboarding/tasks/${userId}`);
  return data;
};

export const retryEmailForwarding = async (userId: string): Promise<{ success: boolean; message: string }> => {
  const { data } = await api.post(`/onboarding/retry-email-forwarding/${userId}`);
  return data;
};

export const offboardMember = async (userId: string, removeFromM365?: boolean): Promise<OffboardResponse> => {
  const { data } = await api.post(`/onboarding/offboard/${userId}`, { removeFromM365 });
  return data;
};

export const reactivateMember = async (userId: string): Promise<{ success: boolean; message: string }> => {
  const { data } = await api.post(`/onboarding/reactivate/${userId}`);
  return data;
};

export const getInactiveMembers = async (): Promise<InactiveMember[]> => {
  const { data } = await api.get('/onboarding/inactive-members');
  return data;
};

// ==================== FAVORITES ====================

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

// ==================== PRACTICE TRACKER ====================

export interface PracticeLog {
  id: string;
  durationMinutes: number;
  notes: string | null;
  practicedAt: string;
  musicTitle: {
    id: string;
    title: string;
    arranger: string | null;
  };
}

export interface PracticeStats {
  totalMinutes: number;
  weekMinutes: number;
  monthMinutes: number;
  currentStreak: number;
  mostPracticed: {
    id: string;
    title: string;
    arranger: string | null;
    totalMinutes: number;
    sessionCount: number;
  }[];
}

export const getPracticeLogs = async (musicTitleId?: string): Promise<PracticeLog[]> => {
  const { data } = await api.get('/practice', { params: { musicTitleId } });
  return data;
};

export const getPracticeStats = async (): Promise<PracticeStats> => {
  const { data } = await api.get('/practice/stats');
  return data;
};

export const logPractice = async (
  musicTitleId: string,
  durationMinutes: number,
  notes?: string
): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/practice', { musicTitleId, durationMinutes, notes });
  return data;
};

export const deletePracticeLog = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/practice/${id}`);
  return data;
};

// ==================== RECENT VIEWS ====================

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

export const recordView = async (
  itemType: string,
  itemId: string,
  itemTitle: string
): Promise<{ message: string }> => {
  const { data } = await api.post('/recent', { itemType, itemId, itemTitle });
  return data;
};

export const clearRecentViews = async (): Promise<{ message: string }> => {
  const { data } = await api.delete('/recent');
  return data;
};

// ==================== PDF ANNOTATIONS ====================

export interface Annotation {
  id: string;
  pageNumber: number;
  annotationType: 'highlight' | 'note' | 'drawing' | 'text';
  xPosition: number;
  yPosition: number;
  width?: number;
  height?: number;
  content?: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export const getAnnotations = async (
  musicPieceId: string,
  pageNumber?: number
): Promise<Annotation[]> => {
  const { data } = await api.get(`/annotations/piece/${musicPieceId}`, {
    params: { pageNumber },
  });
  return data;
};

export const createAnnotation = async (annotation: {
  musicPieceId: string;
  pageNumber: number;
  annotationType: 'highlight' | 'note' | 'drawing' | 'text';
  xPosition: number;
  yPosition: number;
  width?: number;
  height?: number;
  content?: string;
  color?: string;
}): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/annotations', annotation);
  return data;
};

export const updateAnnotation = async (
  id: string,
  updates: {
    xPosition?: number;
    yPosition?: number;
    width?: number;
    height?: number;
    content?: string;
    color?: string;
  }
): Promise<{ message: string }> => {
  const { data } = await api.put(`/annotations/${id}`, updates);
  return data;
};

export const deleteAnnotation = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/annotations/${id}`);
  return data;
};

export const deleteAllAnnotations = async (
  musicPieceId: string
): Promise<{ message: string; deleted: number }> => {
  const { data } = await api.delete(`/annotations/piece/${musicPieceId}`);
  return data;
};

// ==================== SESSION MANAGEMENT ====================

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

// ==================== REORDER TITLES IN LIST ====================

export const reorderTitlesInList = async (
  listId: string,
  titleOrder: string[]
): Promise<{ message: string }> => {
  const { data } = await api.put(`/music-lists/${listId}/reorder-titles`, { titleOrder });
  return data;
};

// ==================== BULK OPERATIONS ====================

export const bulkUpdatePieces = async (
  pieceIds: string[],
  updates: {
    instrumentId?: string | null;
    addToListId?: string;
    removeFromListId?: string;
  }
): Promise<{ message: string; updated: number }> => {
  const { data } = await api.put('/music-pieces/bulk', { pieceIds, updates });
  return data;
};

export const bulkDeletePieces = async (pieceIds: string[]): Promise<{ message: string; deleted: number }> => {
  const { data } = await api.delete('/music-pieces/bulk', { data: { pieceIds } });
  return data;
};

// ==================== DATA EXPORT (GDPR) ====================

export const exportUserData = async (): Promise<Blob> => {
  const { data } = await api.get('/users/export-data', { responseType: 'blob' });
  return data;
};

// ==================== CALENDAR SYNC ====================

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

// ========================
// NOTIFICATION CHANNELS
// ========================

export interface NotificationChannel {
  channel: 'email' | 'push' | 'whatsapp' | 'telegram';
  configured: boolean;
  name: string;
}

export interface NotificationPreferences {
  userId: string;
  channels: {
    email: { enabled: boolean; address?: string };
    push: { enabled: boolean };
    whatsapp: { enabled: boolean; verified: boolean; phoneNumber?: string };
    telegram: { enabled: boolean; verified: boolean; chatId?: string };
  };
  notificationTypes: {
    new_music?: { enabled: boolean; channels: string[] };
    rehearsal_change?: { enabled: boolean; channels: string[] };
    seating_update?: { enabled: boolean; channels: string[] };
    chat_message?: { enabled: boolean; channels: string[] };
    practice_reminder?: { enabled: boolean; channels: string[] };
    concert_reminder?: { enabled: boolean; channels: string[] };
  };
}

export const getNotificationChannels = async (): Promise<NotificationChannel[]> => {
  const { data } = await api.get('/notification-channels/channels');
  return data;
};

export const getNotificationPreferences = async (): Promise<NotificationPreferences> => {
  const { data } = await api.get('/notification-channels/preferences');
  return data;
};

export const updateNotificationPreferences = async (prefs: {
  emailEnabled?: boolean;
  pushEnabled?: boolean;
  whatsappEnabled?: boolean;
  telegramEnabled?: boolean;
  newMusic?: boolean;
  rehearsalChanges?: boolean;
  seatingUpdates?: boolean;
  chatMessages?: boolean;
  practiceReminders?: boolean;
  concertReminders?: boolean;
}): Promise<void> => {
  await api.put('/notification-channels/preferences', prefs);
};

// Telegram
export const getTelegramLinkUrl = async (): Promise<{ code: string; url: string; expiresIn: number }> => {
  const { data } = await api.post('/notification-channels/telegram/link');
  return data;
};

export const getTelegramStatus = async (): Promise<{ linked: boolean; verified: boolean; linkedAt: string | null }> => {
  const { data } = await api.get('/notification-channels/telegram/status');
  return data;
};

export const unlinkTelegram = async (): Promise<void> => {
  await api.delete('/notification-channels/telegram/unlink');
};

// WhatsApp
export const linkWhatsApp = async (phoneNumber: string): Promise<{ message: string; phoneNumber: string; expiresIn: number }> => {
  const { data } = await api.post('/notification-channels/whatsapp/link', { phoneNumber });
  return data;
};

export const verifyWhatsApp = async (code: string): Promise<void> => {
  await api.post('/notification-channels/whatsapp/verify', { code });
};

export const getWhatsAppStatus = async (): Promise<{ linked: boolean; verified: boolean; phoneNumber: string | null; linkedAt: string | null }> => {
  const { data } = await api.get('/notification-channels/whatsapp/status');
  return data;
};

export const unlinkWhatsApp = async (): Promise<void> => {
  await api.delete('/notification-channels/whatsapp/unlink');
};

// Streaming Links
export interface StreamingSearchResult {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumArt: string | null;
  durationMs: number;
  previewUrl: string | null;
  url: string;
  platform: 'spotify' | 'apple';
}

export interface StreamingStatus {
  spotify: boolean;
  appleMusic: boolean;
}

export const getStreamingStatus = async (): Promise<StreamingStatus> => {
  const { data } = await api.get('/streaming/status');
  return data;
};

export const searchStreamingTracks = async (
  query: string,
  platform: 'spotify' | 'apple',
  composer?: string,
  limit?: number
): Promise<{ results: StreamingSearchResult[] }> => {
  const { data } = await api.get('/streaming/search', {
    params: { q: query, platform, composer, limit },
  });
  return data;
};

export const getStreamingLinks = async (titleId: string): Promise<{
  spotify_url?: string | null;
  apple_music_url?: string | null;
  youtube_music_url?: string | null;
  spotify_preview_url?: string | null;
  apple_music_preview_url?: string | null;
}> => {
  const { data } = await api.get(`/streaming/music-titles/${titleId}/links`);
  return data;
};

export const updateStreamingLinks = async (
  titleId: string,
  links: {
    spotify_url?: string | null;
    apple_music_url?: string | null;
    youtube_music_url?: string | null;
    spotify_preview_url?: string | null;
    apple_music_preview_url?: string | null;
  }
): Promise<{ message: string; links: typeof links }> => {
  const { data } = await api.post(`/streaming/music-titles/${titleId}/links`, links);
  return data;
};

export const deleteStreamingLink = async (
  titleId: string,
  platform: 'spotify' | 'apple' | 'youtube'
): Promise<void> => {
  await api.delete(`/streaming/music-titles/${titleId}/links/${platform}`);
};

// ==================== TICKETING ====================

// Get available ticket types for a concert
export const getConcertTickets = async (concertId: string): Promise<ConcertTicketInfo> => {
  const { data } = await api.get(`/concerts/${concertId}/tickets`);
  return data;
};

// Create a ticket order
export const createTicketOrder = async (
  concertId: string,
  order: {
    items: { ticketTypeId: string; quantity: number }[];
    buyerName: string;
    buyerEmail: string;
    buyerPhone?: string;
    notes?: string;
    captchaToken?: string;
  }
): Promise<{ orderId: string; total: number; expiresAt: string; items: { ticketTypeId: string; name: string; quantity: number; unitPrice: number; subtotal: number }[] }> => {
  const { data } = await api.post(`/concerts/${concertId}/tickets/order`, order);
  return data;
};

// Get order details
export const getTicketOrder = async (orderId: string): Promise<TicketOrder> => {
  const { data } = await api.get(`/tickets/orders/${orderId}`);
  return data;
};

// Initialize payment for an order
export const payTicketOrder = async (
  orderId: string,
  payment: { method?: string; returnUrl?: string }
): Promise<{ paymentId: string; checkoutUrl: string }> => {
  const { data } = await api.post(`/tickets/orders/${orderId}/pay`, payment);
  return data;
};

// Get ticket details by code
export const getTicketByCode = async (code: string): Promise<Ticket> => {
  const { data } = await api.get(`/tickets/${code}`);
  return data;
};

// Validate and scan a ticket
export const validateTicket = async (
  code: string,
  concertId?: string
): Promise<TicketValidationResult> => {
  const { data } = await api.post(`/tickets/${code}/validate`, { concertId });
  return data;
};

// Get current user's tickets
export const getMyTickets = async (): Promise<Ticket[]> => {
  const { data } = await api.get('/tickets/my');
  return data;
};

// Admin: Create ticket type
export const createTicketType = async (
  concertId: string,
  ticketType: {
    name: string;
    price: number;
    quantity: number;
    description?: string;
    saleStart?: string;
    saleEnd?: string;
    maxPerOrder?: number;
  }
): Promise<TicketType> => {
  const { data } = await api.post(`/concerts/${concertId}/ticket-types`, ticketType);
  return data;
};

// Admin: Update ticket type
export const updateTicketType = async (
  ticketTypeId: string,
  updates: {
    name?: string;
    price?: number;
    quantity?: number;
    description?: string;
    saleStart?: string;
    saleEnd?: string;
    maxPerOrder?: number;
  }
): Promise<{ success: boolean }> => {
  const { data } = await api.put(`/ticket-types/${ticketTypeId}`, updates);
  return data;
};

// Admin: Delete ticket type
export const deleteTicketType = async (ticketTypeId: string): Promise<{ success: boolean }> => {
  const { data } = await api.delete(`/ticket-types/${ticketTypeId}`);
  return data;
};

// Admin: Get ticket stats for a concert
export const getConcertTicketStats = async (concertId: string): Promise<TicketStats> => {
  const { data } = await api.get(`/concerts/${concertId}/ticket-stats`);
  return data;
};

// Admin: Get attendee list
export const getConcertAttendees = async (concertId: string): Promise<AttendeeExport[]> => {
  const { data } = await api.get(`/concerts/${concertId}/attendees`);
  return data;
};

// Admin: Get seat heatmap data for a concert
export const getSeatHeatmapData = async (concertId: string): Promise<SeatHeatmapData> => {
  const { data } = await api.get(`/concerts/${concertId}/seats/heatmap-data`);
  return data;
};

// Admin: Export attendee list as CSV
export const exportConcertAttendeesCsv = async (concertId: string): Promise<void> => {
  const response = await api.get(`/concerts/${concertId}/attendees?format=csv`, {
    responseType: 'blob',
  });
  const blob = new Blob([response.data], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `attendees-${concertId}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
};

// Admin: Cancel a ticket
export const cancelTicket = async (ticketId: string): Promise<{ success: boolean; message: string }> => {
  const { data } = await api.post(`/tickets/${ticketId}/cancel`);
  return data;
};

// Admin: Refund an order
export const refundOrder = async (orderId: string, reason?: string): Promise<{ success: boolean; refundId?: string; message: string }> => {
  const { data } = await api.post(`/tickets/orders/${orderId}/refund`, { reason });
  return data;
};

// Mock payment (development only)
export const mockPayment = async (orderId: string, action: 'pay' | 'cancel'): Promise<{ success: boolean }> => {
  const { data } = await api.post(`/tickets/orders/${orderId}/mock-payment`, { action });
  return data;
};

// =============================================
// TICKET SALES ADMIN API
// =============================================

import type { TicketSalesResponse, PaymentDetails, TicketDashboard, SalesPredictionResponse } from './types';

// Get ticket dashboard data for a concert
export const getTicketDashboard = async (concertId: string): Promise<TicketDashboard> => {
  const { data } = await api.get(`/tickets/dashboard/${concertId}`);
  return data;
};

// Get all ticket sales/orders for admin overview
export const getTicketSales = async (params?: {
  concertId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}): Promise<TicketSalesResponse> => {
  const { data } = await api.get('/tickets/sales', { params });
  return data;
};

// Get payment details from Mollie/Stripe for an order
export const getPaymentDetails = async (orderId: string): Promise<PaymentDetails> => {
  const { data } = await api.get(`/tickets/sales/${orderId}/payment-details`);
  return data;
};

// Get AI-based ticket sales predictions for a concert (admin only)
export const getSalesPredictions = async (concertId: string): Promise<SalesPredictionResponse> => {
  const { data } = await api.get(`/concerts/${concertId}/tickets/predictions`);
  return data;
};

// Get scanned tickets (attendees) for a concert
import type { ScannedTicketsResponse } from './types';

export const getScannedTickets = async (concertId: string): Promise<ScannedTicketsResponse> => {
  const { data } = await api.get(`/concerts/${concertId}/scanned-tickets`);
  return data;
};

// Export ticket sales as CSV
export const exportTicketSalesCsv = async (params?: {
  concertId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}): Promise<void> => {
  const response = await api.get('/tickets/sales/export', {
    params,
    responseType: 'blob',
  });
  const blob = new Blob([response.data], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ticket-sales-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
};

// =============================================
// GUEST LIST API (Free Tickets / Comps)
// =============================================

import type { GuestListResponse, GuestListEntry } from './types';

// Get guest list for a concert
export const getGuestList = async (concertId: string, params?: {
  page?: number;
  limit?: number;
  search?: string;
  ticketsSent?: boolean;
}): Promise<GuestListResponse> => {
  const { data } = await api.get(`/concerts/${concertId}/guest-list`, { params });
  return data;
};

// Add a guest to the guest list
export const addGuest = async (concertId: string, guest: {
  name: string;
  email: string;
  ticketCount: number;
  ticketTypeId?: string | null;
  notes?: string | null;
  organisation?: string | null;
}): Promise<GuestListEntry> => {
  const { data } = await api.post(`/concerts/${concertId}/guest-list`, guest);
  return data;
};

// Update a guest list entry
export const updateGuest = async (guestId: string, guest: Partial<{
  name: string;
  email: string;
  ticketCount: number;
  ticketTypeId: string | null;
  notes: string | null;
  organisation: string | null;
}>): Promise<GuestListEntry> => {
  const { data } = await api.put(`/guest-list/${guestId}`, guest);
  return data;
};

// Delete a guest from the guest list
export const deleteGuest = async (guestId: string): Promise<void> => {
  await api.delete(`/guest-list/${guestId}`);
};

// Send tickets to a guest
export const sendGuestTickets = async (guestId: string): Promise<{
  success: boolean;
  orderId: string;
  ticketCount: number;
  tickets: { id: string; code: string }[];
}> => {
  const { data } = await api.post(`/guest-list/${guestId}/send-tickets`);
  return data;
};

// Send tickets to all guests who haven't received them yet
export const sendAllGuestTickets = async (concertId: string): Promise<{
  success: boolean;
  sent: number;
  failed: number;
  errors?: string[];
}> => {
  const { data } = await api.post(`/concerts/${concertId}/guest-list/send-all`);
  return data;
};

// =============================================
// PAYMENT SETTINGS API
// =============================================

import type { PaymentSettings, MollieStatus } from './types';

// Get payment settings
export const getPaymentSettings = async (): Promise<PaymentSettings> => {
  const { data } = await api.get('/payment-settings');
  return data;
};

// Update payment settings
export const updatePaymentSettings = async (settings: {
  passFeesToCustomer?: boolean;
}): Promise<{ success: boolean }> => {
  const { data } = await api.put('/payment-settings', settings);
  return data;
};

// Update payment method fee
export const updatePaymentMethodFee = async (method: string, fee: {
  customerFee: number;
  isEnabled?: boolean;
}): Promise<{ success: boolean }> => {
  const { data } = await api.put(`/payment-settings/fees/${method}`, fee);
  return data;
};

// Connect Mollie account
export const connectMollie = async (
  apiKey: string,
  mode?: 'live' | 'test'
): Promise<{
  success: boolean;
  profileId: string;
  organisationName: string;
  canReceivePayments: boolean;
  mode: 'live' | 'test';
}> => {
  const { data } = await api.post('/payment-settings/mollie/connect', { apiKey, mode });
  return data;
};

// Disconnect Mollie account (removes both live and test keys)
export const disconnectMollie = async (): Promise<{ success: boolean }> => {
  const { data } = await api.post('/payment-settings/mollie/disconnect');
  return data;
};

// Set active Mollie mode (live/test)
export const setMollieMode = async (mode: 'live' | 'test'): Promise<{ success: boolean; mode: 'live' | 'test' }> => {
  const { data } = await api.put('/payment-settings/mollie/mode', { mode });
  return data;
};

// Delete a specific Mollie API key (live or test)
export const deleteMollieKey = async (mode: 'live' | 'test'): Promise<{ success: boolean }> => {
  const { data } = await api.delete(`/payment-settings/mollie/key/${mode}`);
  return data;
};

// Get Mollie status
export const getMollieStatus = async (): Promise<MollieStatus & { statusDescription?: string }> => {
  const { data } = await api.get('/payment-settings/mollie/status');
  return data;
};

// Test Mollie connection
export const testMollieConnection = async (): Promise<{
  connected: boolean;
  canReceivePayments: boolean;
  canReceivePayouts: boolean;
  error?: string;
}> => {
  const { data } = await api.get('/payment-settings/mollie/test');
  return data;
};

// =============================================
// TICKET TRANSFERS API
// =============================================

import type { TicketTransfer, TicketTransferHistory, TransferableTicket } from './types';

// Get user's transferable tickets
export const getTransferableTickets = async (): Promise<TransferableTicket[]> => {
  const { data } = await api.get('/tickets/transferable');
  return data;
};

// Initiate a ticket transfer
export const initiateTicketTransfer = async (
  ticketId: string,
  transfer: { recipientEmail: string; recipientName: string }
): Promise<{ transfer: TicketTransfer; message: string }> => {
  const { data } = await api.post(`/tickets/${ticketId}/transfer`, transfer);
  return data;
};

// Get pending transfers (outgoing)
export const getPendingTransfers = async (): Promise<TicketTransfer[]> => {
  const { data } = await api.get('/tickets/transfers');
  return data;
};

// Cancel a pending transfer
export const cancelTicketTransfer = async (transferId: string): Promise<{ success: boolean; message: string }> => {
  const { data } = await api.delete(`/tickets/transfers/${transferId}`);
  return data;
};

// Accept a ticket transfer (for recipient)
export const acceptTicketTransfer = async (
  transferCode: string
): Promise<{ success: boolean; ticket: Ticket; message: string }> => {
  const { data } = await api.post(`/tickets/transfers/${transferCode}/accept`);
  return data;
};

// Get transfer details by code (for accept page)
export const getTransferByCode = async (transferCode: string): Promise<TicketTransfer> => {
  const { data } = await api.get(`/tickets/transfers/${transferCode}`);
  return data;
};

// Get transfer history
export const getTransferHistory = async (): Promise<TicketTransferHistory[]> => {
  const { data } = await api.get('/tickets/transfers/history');
  return data;
};

// Re-export from modular API files
export {
  getMyAvailability,
  getTeamAvailability,
  setAvailability,
  setBulkAvailability,
  removeAvailability,
  type AvailabilityEntry,
  type TeamMember,
  type TeamAvailability,
} from './api/availability';

export {
  getPracticeGoals,
  setPracticeGoal,
  deletePracticeGoal,
  type PracticeGoal,
  type PracticeGoalsResponse,
} from './api/practice';

export {
  getTitleLoanHistory,
  type TitleLoanHistory,
  type LoanHistoryEntry,
} from './api/loans';

export {
  getAttendancePrediction,
  type AttendancePrediction,
} from './api/concerts';

export {
  createRecurringRehearsals,
  deleteRehearsalSeries,
} from './api/rehearsals';

export {
  uploadMusicPiecesZip,
} from './api/music';

// =============================================
// FAILED IMPORTS API
// =============================================

export interface FailedImport {
  id: string;
  originalFilename: string;
  filePath: string | null;
  importType: string;
  errorMessage: string;
  errorCode: string | null;
  metadata: Record<string, unknown> | null;
  sourceInfo: string | null;
  listId: string | null;
  listName: string | null;
  retryCount: number;
  maxRetries: number;
  status: 'failed' | 'retrying' | 'recovered' | 'dismissed';
  createdByName: string | null;
  createdAt: string;
  lastRetryAt: string | null;
  recoveredAt: string | null;
}

export interface FailedImportStats {
  total: number;
  failed: number;
  retrying: number;
  recovered: number;
  dismissed: number;
}

export const getFailedImports = async (status?: string): Promise<FailedImport[]> => {
  const params = status ? { status } : {};
  const { data } = await api.get('/failed-imports', { params });
  return data;
};

export const getFailedImportStats = async (): Promise<FailedImportStats> => {
  const { data } = await api.get('/failed-imports/stats');
  return data;
};

export const retryFailedImport = async (id: string): Promise<{ message: string; pieceId?: string }> => {
  const { data } = await api.post(`/failed-imports/${id}/retry`);
  return data;
};

export const dismissFailedImport = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.post(`/failed-imports/${id}/dismiss`);
  return data;
};

export const deleteFailedImport = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/failed-imports/${id}`);
  return data;
};

export const bulkDismissFailedImports = async (ids: string[]): Promise<{ message: string; dismissed: number }> => {
  const { data } = await api.post('/failed-imports/bulk-dismiss', { ids });
  return data;
};

// =============================================
// SEASONS API (Season Planning Wizard)
// =============================================

export interface SeasonTemplate {
  id: string;
  name: string;
  description: string | null;
  defaultRehearsalDay: number | null;
  defaultRehearsalTime: string | null;
  defaultRehearsalDuration: number;
  defaultRehearsalLocation: string | null;
  typicalConcertsCount: number;
  templateData: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Season {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  templateId: string | null;
  templateName: string | null;
  status: 'draft' | 'active' | 'completed';
  budgetTotal: number | null;
  budgetAllocated: number;
  notes: string | null;
  eventCount: number;
  concertCount: number;
  rehearsalCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeasonEvent {
  id: string;
  eventType: 'concert' | 'rehearsal' | 'other';
  eventId: string | null;
  eventName: string | null;
  plannedDate: string;
  budgetAmount: number | null;
  notes: string | null;
  createdAt: string;
}

export interface SeasonDetail extends Omit<Season, 'eventCount' | 'concertCount' | 'rehearsalCount'> {
  events: SeasonEvent[];
}

export interface PlannedConcert {
  name: string;
  date: string;
  location?: string;
  type?: string;
  budgetAmount?: number;
}

export interface GenerateSeasonEventsParams {
  rehearsalDay?: number;
  rehearsalTime?: string;
  rehearsalEndTime?: string;
  rehearsalLocation?: string;
  orchestraId?: string;
  concerts?: PlannedConcert[];
  excludeDates?: string[];
  generateRehearsals?: boolean;
  generateConcerts?: boolean;
}

export interface GenerateSeasonEventsResult {
  message: string;
  rehearsalCount: number;
  concertCount: number;
  rehearsalDates: string[];
  concertNames: string[];
}

// Season Templates
export const getSeasonTemplates = async (): Promise<SeasonTemplate[]> => {
  const { data } = await api.get('/seasons/templates');
  return data;
};

export const createSeasonTemplate = async (template: {
  name: string;
  description?: string;
  defaultRehearsalDay?: number;
  defaultRehearsalTime?: string;
  defaultRehearsalDuration?: number;
  defaultRehearsalLocation?: string;
  typicalConcertsCount?: number;
  templateData?: Record<string, unknown>;
}): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/seasons/templates', template);
  return data;
};

export const updateSeasonTemplate = async (id: string, template: {
  name?: string;
  description?: string;
  defaultRehearsalDay?: number;
  defaultRehearsalTime?: string;
  defaultRehearsalDuration?: number;
  defaultRehearsalLocation?: string;
  typicalConcertsCount?: number;
  templateData?: Record<string, unknown>;
}): Promise<{ message: string }> => {
  const { data } = await api.put(`/seasons/templates/${id}`, template);
  return data;
};

export const deleteSeasonTemplate = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/seasons/templates/${id}`);
  return data;
};

// Seasons
export const getSeasons = async (status?: string): Promise<Season[]> => {
  const params = status ? { status } : {};
  const { data } = await api.get('/seasons', { params });
  return data;
};

export const getSeason = async (id: string): Promise<SeasonDetail> => {
  const { data } = await api.get(`/seasons/${id}`);
  return data;
};

export const createSeason = async (season: {
  name: string;
  startDate: string;
  endDate: string;
  templateId?: string;
  budgetTotal?: number;
  notes?: string;
}): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/seasons', season);
  return data;
};

export const updateSeason = async (id: string, season: {
  name?: string;
  startDate?: string;
  endDate?: string;
  templateId?: string;
  status?: 'draft' | 'active' | 'completed';
  budgetTotal?: number;
  budgetAllocated?: number;
  notes?: string;
}): Promise<{ message: string }> => {
  const { data } = await api.put(`/seasons/${id}`, season);
  return data;
};

export const deleteSeason = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/seasons/${id}`);
  return data;
};

// Season Events
export const addSeasonEvent = async (seasonId: string, event: {
  eventType: 'concert' | 'rehearsal' | 'other';
  eventId?: string;
  plannedDate: string;
  budgetAmount?: number;
  notes?: string;
}): Promise<{ id: string; message: string }> => {
  const { data } = await api.post(`/seasons/${seasonId}/events`, event);
  return data;
};

export const removeSeasonEvent = async (seasonId: string, eventId: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/seasons/${seasonId}/events/${eventId}`);
  return data;
};

// Generate season events (rehearsals and concerts)
export const generateSeasonEvents = async (
  seasonId: string,
  params: GenerateSeasonEventsParams
): Promise<GenerateSeasonEventsResult> => {
  const { data } = await api.post(`/seasons/${seasonId}/generate`, params);
  return data;
};

// ==================== HOLIDAYS ====================

export interface HolidayRegion {
  value: string;
  label: string;
  labelDutch: string;
}

export interface Holiday {
  id: string;
  name: string;
  nameEnglish?: string;
  region: string;
  country: string;
  startDate: string;
  endDate: string;
  year: number;
  holidayType: string;
  isCustom: boolean;
  source: string;
}

export interface HolidaySettings {
  region: string;
  showHolidaysInCalendar: boolean;
  autoBlockRehearsals: boolean;
}

export interface HolidaysResponse {
  holidays: Holiday[];
  settings: HolidaySettings;
  meta: {
    availableYears: number[];
    regions: HolidayRegion[];
  };
}

export const getHolidays = async (params?: {
  year?: number;
  startDate?: string;
  endDate?: string;
}): Promise<HolidaysResponse> => {
  const { data } = await api.get('/holidays', { params });
  return data;
};

export const getUpcomingHolidays = async (limit?: number): Promise<Holiday[]> => {
  const { data } = await api.get('/holidays/upcoming', { params: { limit } });
  return data;
};

export const checkHolidayDate = async (date: string): Promise<{
  isHoliday: boolean;
  holiday: {
    name: string;
    startDate: string;
    endDate: string;
    holidayType: string;
    isCustom: boolean;
  } | null;
}> => {
  const { data } = await api.get('/holidays/check', { params: { date } });
  return data;
};

export const syncHolidays = async (year?: number): Promise<{
  message: string;
  count: number;
  year: number;
}> => {
  const { data } = await api.get('/holidays/sync', { params: { year } });
  return data;
};

export const createCustomHoliday = async (holiday: {
  name: string;
  startDate: string;
  endDate: string;
  region?: string;
  holidayType?: string;
}): Promise<Holiday> => {
  const { data } = await api.post('/holidays', holiday);
  return data;
};

export const updateCustomHoliday = async (
  id: string,
  holiday: {
    name?: string;
    startDate?: string;
    endDate?: string;
    region?: string;
    holidayType?: string;
  }
): Promise<{ message: string }> => {
  const { data } = await api.put(`/holidays/${id}`, holiday);
  return data;
};

export const deleteCustomHoliday = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/holidays/${id}`);
  return data;
};

export const getHolidaySettings = async (): Promise<HolidaySettings & { regions: HolidayRegion[] }> => {
  const { data } = await api.get('/holidays/settings');
  return data;
};

export const updateHolidaySettings = async (settings: {
  region?: string;
  showHolidaysInCalendar?: boolean;
  autoBlockRehearsals?: boolean;
}): Promise<{ message: string; settings: HolidaySettings }> => {
  const { data } = await api.put('/holidays/settings', settings);
  return data;
};

// ==================== STAGE LAYOUTS (PODIUMPLOT DESIGNER) ====================

import type {
  StageLayout,
  StageLayoutData,
  ConcertStageResponse,
  PrintableSeatCardsResponse,
  StageAssignment,
} from './types';

export const getStageLayouts = async (includeTemplates = false): Promise<StageLayout[]> => {
  const { data } = await api.get('/stage-layouts', {
    params: { includeTemplates: includeTemplates ? 'true' : 'false' },
  });
  return data;
};

export const getStageLayout = async (id: string): Promise<StageLayout> => {
  const { data } = await api.get(`/stage-layouts/${id}`);
  return data;
};

export const createStageLayout = async (layout: {
  name: string;
  description?: string;
  venueName?: string;
  stageWidth?: number;
  stageDepth?: number;
  isTemplate?: boolean;
  isDefault?: boolean;
  layoutData?: StageLayoutData;
  thumbnailUrl?: string;
}): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/stage-layouts', layout);
  return data;
};

export const updateStageLayout = async (
  id: string,
  layout: {
    name?: string;
    description?: string;
    venueName?: string;
    stageWidth?: number;
    stageDepth?: number;
    isTemplate?: boolean;
    isDefault?: boolean;
    layoutData?: StageLayoutData;
    thumbnailUrl?: string;
  }
): Promise<{ message: string }> => {
  const { data } = await api.put(`/stage-layouts/${id}`, layout);
  return data;
};

export const deleteStageLayout = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/stage-layouts/${id}`);
  return data;
};

export const duplicateStageLayout = async (
  id: string,
  name?: string
): Promise<{ id: string; message: string }> => {
  const { data } = await api.post(`/stage-layouts/${id}/duplicate`, { name });
  return data;
};

export const getConcertStage = async (concertId: string): Promise<ConcertStageResponse> => {
  const { data } = await api.get(`/concerts/${concertId}/stage`);
  return data;
};

export const saveConcertStage = async (
  concertId: string,
  layoutId: string,
  assignments: Record<string, StageAssignment>
): Promise<{ message: string }> => {
  const { data } = await api.put(`/concerts/${concertId}/stage`, {
    layoutId,
    assignments,
  });
  return data;
};

export const deleteConcertStage = async (concertId: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/concerts/${concertId}/stage`);
  return data;
};

export const getPrintableSeatCards = async (
  concertId: string
): Promise<PrintableSeatCardsResponse> => {
  const { data } = await api.get(`/concerts/${concertId}/stage/print`);
  return data;
};

export default api;
