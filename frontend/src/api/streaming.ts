import api from './client';

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
