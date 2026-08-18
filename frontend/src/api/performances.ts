import api from './client';

export interface PerformanceHistoryItem {
  id: string;
  title: string;
  composer?: string;
  arranger?: string;
  concertId: string;
  concertName: string;
  concertDate: string;
  concertLocation?: string;
  concertType?: string;
}

export interface LastPlayedPiece {
  title: string;
  composer?: string;
  musicTitleId?: string;
  lastPlayed: string;
  timesPlayed: number;
}

export interface NeverPlayedPiece {
  id: string;
  title: string;
  composer?: string;
}

export interface MostPlayedPiece {
  title: string;
  composer?: string;
  musicTitleId?: string;
  timesPlayed: number;
  lastPlayed: string;
  firstPlayed: string;
}

export interface YearStatistics {
  year: string;
  concertCount: number;
  pieceCount: number;
  uniquePieces: number;
}

export interface ComposerStatistics {
  composer: string;
  timesPlayed: number;
  uniquePieces: number;
  lastPlayed: string;
}

export interface PerformanceSearchResult {
  title: string;
  composer?: string;
  musicTitleId?: string;
  concertId: string;
  concertName: string;
  concertDate: string;
}

export const getPerformanceHistory = async (params: {
  titleId?: string;
  title?: string;
}): Promise<PerformanceHistoryItem[]> => {
  const { data } = await api.get('/performances/history', { params });
  return data;
};

export const getLastPlayedPieces = async (): Promise<LastPlayedPiece[]> => {
  const { data } = await api.get('/performances/last-played');
  return data;
};

export const getNeverPlayedPieces = async (): Promise<NeverPlayedPiece[]> => {
  const { data } = await api.get('/performances/never-played');
  return data;
};

export const getMostPlayedPieces = async (limit?: number): Promise<MostPlayedPiece[]> => {
  const { data } = await api.get('/performances/most-played', { params: { limit } });
  return data;
};

export const getPerformancesByYear = async (): Promise<YearStatistics[]> => {
  const { data } = await api.get('/performances/by-year');
  return data;
};

export const getPerformancesByComposer = async (limit?: number): Promise<ComposerStatistics[]> => {
  const { data } = await api.get('/performances/by-composer', { params: { limit } });
  return data;
};

export const searchPerformances = async (query: string): Promise<PerformanceSearchResult[]> => {
  const { data } = await api.get('/performances/search', { params: { q: query } });
  return data;
};
