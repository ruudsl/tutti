import api from './client';

// MusicaInfo
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

export const searchMusicaInfo = async (
  query: string,
): Promise<{
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

// IMSLP
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

// PDF Tools
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
  },
): Promise<{ success: boolean; id: string; title: string; instrumentFound: boolean }> => {
  const { data } = await api.post('/pdf-tools/save-as-music-piece', {
    filepath,
    filename,
    listId,
    ...metadata,
  });
  return data;
};
