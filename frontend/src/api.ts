import axios from 'axios';
import type { User, Instrument, Orchestra, MusicList, MusicPiece, MusicTitle, Association, AssociationSettings, ThemeSettings, Genre, MfaSetupResponse, LoginResponse, Rehearsal, RehearsalDetail, RehearsalDefaultDay, SpondConfig, SpondGroup, SpondSyncResult, SpondOrchestraGroup, SpondMemberLink, MicrosoftConfig, SmtpConfig, Equipment, EquipmentDetail, MaintenanceAlert, UniformItem, UniformItemDetail, UniformSet, UniformItemType, UniformSizeAvailability, Concert, ConcertDetail, ConcertStatistics, PieceHistory, ConcertType, MediaType, SeatingSection, SeatingAssignment, SeatingNeighbor, RehearsalSeat, SeatingChart } from './types';

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

// Users
export const getUsers = async (): Promise<User[]> => {
  // Request all users by setting a high limit (max 1000 users should be enough for most associations)
  const { data } = await api.get('/users?limit=1000');
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
  webhook_url: string;
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
  webhook_url: string;
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

export default api;
