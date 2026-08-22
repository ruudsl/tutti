import api from './client';
import type { MusicList, MusicPiece, MusicTitle, Genre } from '../types';

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

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

export const createMusicList = async (
  name: string,
  orchestraId: string,
  options?: {
    listType?: 'regular' | 'concert';
    concertDate?: string | null;
    concertLocation?: string | null;
  },
): Promise<{ id: string }> => {
  const { data } = await api.post('/music-lists', { name, orchestraId, ...options });
  return data;
};

export const updateMusicList = async (
  id: string,
  listData: {
    name: string;
    listType?: 'regular' | 'concert';
    concertDate?: string | null;
    concertLocation?: string | null;
  },
): Promise<void> => {
  await api.put(`/music-lists/${id}`, listData);
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

export const reorderTitlesInList = async (listId: string, titleOrder: string[]): Promise<{ message: string }> => {
  const { data } = await api.put(`/music-lists/${listId}/reorder-titles`, { titleOrder });
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
  youtubeUrls?: Record<string, string>,
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

export const uploadMusicPiecesZip = async (
  zipFile: File,
  listId?: string,
): Promise<{ uploaded: any[]; errors?: any[]; skipped?: string[] }> => {
  const formData = new FormData();
  formData.append('zip', zipFile);
  if (listId) formData.append('listId', listId);

  const { data } = await api.post('/music-pieces/upload-zip', formData, {
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

export const updateMusicPiece = async (
  id: string,
  pieceData: {
    title?: string;
    arranger?: string;
    instrumentId?: string;
    tuning?: string;
    groupNumber?: string;
    clef?: string;
    youtubeUrl?: string;
    isShared?: boolean;
  },
): Promise<void> => {
  await api.put(`/music-pieces/${id}`, pieceData);
};

export const deleteMusicPiece = async (id: string): Promise<void> => {
  await api.delete(`/music-pieces/${id}`);
};

export const deleteMusicPiecesBulk = async (ids: string[]): Promise<{ count: number }> => {
  const { data } = await api.post('/music-pieces/bulk-delete', { ids });
  return data;
};

export const restoreMusicPiece = async (id: string): Promise<void> => {
  await api.post(`/music-pieces/${id}/restore`);
};

/**
 * Haalt de bestandsnaam uit een Content-Disposition-kopregel.
 *
 * Express stuurt bij een naam met niet-ASCII tekens twee vormen mee: `filename`
 * met een vraagteken op de plek van elk bijzonder teken, en `filename*` met de
 * echte naam in UTF-8 (RFC 5987). Wie alleen naar `filename` keek, bood
 * "Ma?ana.pdf" aan - een naam die Windows niet eens accepteert. `filename*`
 * wint daarom, met `filename` als terugval.
 */
function leesBestandsnaam(contentDisposition?: string): string {
  const standaard = 'muziekstuk.pdf';
  if (!contentDisposition) return standaard;

  const gecodeerd = contentDisposition.match(/filename\*=\s*[^']*'[^']*'([^;]+)/i);
  if (gecodeerd) {
    try {
      return decodeURIComponent(gecodeerd[1].trim());
    } catch {
      // Een half gecodeerde naam mag de download niet tegenhouden; val terug
      // op de gewone vorm hieronder.
    }
  }

  const gewoon = contentDisposition.match(/filename="([^"]+)"|filename=([^\s;]+)/i);
  if (gewoon) return gewoon[1] || gewoon[2];

  return standaard;
}

export const downloadMusicPiece = async (id: string): Promise<void> => {
  const response = await api.get(`/music-pieces/${id}/download`, {
    responseType: 'blob',
  });

  const filename = leesBestandsnaam(response.headers['content-disposition']);

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

export const getYouTubeMeta = async (
  url: string,
): Promise<{
  title: string;
  author: string;
  thumbnailUrl: string;
  videoId: string;
}> => {
  const { data } = await api.get('/music-pieces/youtube-meta', { params: { url } });
  return data;
};

export const getTitleMeta = async (
  title: string,
  arranger?: string | null,
): Promise<{
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

export const bulkUpdatePieces = async (
  pieceIds: string[],
  updates: {
    instrumentId?: string | null;
    addToListId?: string;
    removeFromListId?: string;
  },
): Promise<{ message: string; updated: number }> => {
  const { data } = await api.put('/music-pieces/bulk', { pieceIds, updates });
  return data;
};

export const bulkDeletePieces = async (pieceIds: string[]): Promise<{ message: string; deleted: number }> => {
  const { data } = await api.delete('/music-pieces/bulk', { data: { pieceIds } });
  return data;
};

// MP3 upload for titles
export const uploadTitleMp3 = async (
  titleId: string,
  file: File,
): Promise<{ message: string; mp3FilePath: string }> => {
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

// PDF Thumbnails
export const getPdfThumbnailUrl = (
  filename: string,
  options?: {
    page?: number;
    size?: 'small' | 'medium' | 'large';
  },
): string => {
  const baseUrl = api.defaults.baseURL || '/api';
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.size) params.set('size', options.size);
  const queryString = params.toString();
  return `${baseUrl}/thumbnails/${encodeURIComponent(filename)}${queryString ? `?${queryString}` : ''}`;
};

export const getPdfInfo = async (filename: string): Promise<{ filename: string; pageCount: number }> => {
  const { data } = await api.get(`/thumbnails/${encodeURIComponent(filename)}/info`);
  return data;
};

/**
 * @deprecated Use createMp3BlobUrl() instead to avoid exposing JWT tokens in URLs,
 * or a short-lived download token via withDownloadToken() from utils/downloadUrl.
 * Tokens in URLs can be logged by servers, proxies, and browser history.
 * This function is kept for backward compatibility with existing audio elements;
 * the backend logs a warning whenever this legacy full-JWT query path is used.
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
