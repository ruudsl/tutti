/**
 * Hooks for JSKOS Vocabulary API (WP5)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export interface VocabularyConcept {
  uri: string;
  type: 'instrument' | 'genre' | 'composer';
  label: string;
  labels: Record<string, string>;
  notation?: string;
  altLabels?: string[];
  hasChildren?: boolean;
}

export interface VocabularyHierarchyNode extends VocabularyConcept {
  children: VocabularyHierarchyNode[];
  level: number;
}

export interface TitleInstrument {
  uri: string;
  count: number;
  isOptional: boolean;
  notes?: string;
}

// Search instruments
export function useInstrumentSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: ['vocabularies', 'instruments', 'search', query],
    queryFn: async () => {
      if (!query || query.length < 2) return { instruments: [], total: 0 };
      const { data } = await api.get('/vocabularies/instruments', {
        params: { q: query, limit: 20 },
      });
      return data as { instruments: VocabularyConcept[]; total: number };
    },
    enabled: enabled && query.length >= 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Get all instruments
export function useInstruments() {
  return useQuery({
    queryKey: ['vocabularies', 'instruments', 'all'],
    queryFn: async () => {
      const { data } = await api.get('/vocabularies/instruments');
      return data as { instruments: VocabularyConcept[]; total: number };
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}

// Get instrument hierarchy tree
export function useInstrumentTree() {
  return useQuery({
    queryKey: ['vocabularies', 'instruments', 'tree'],
    queryFn: async () => {
      const { data } = await api.get('/vocabularies/instruments/tree');
      return data as { tree: VocabularyHierarchyNode[] };
    },
    staleTime: 30 * 60 * 1000,
  });
}

// Search genres
export function useGenreSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: ['vocabularies', 'genres', 'search', query],
    queryFn: async () => {
      if (!query || query.length < 2) return { genres: [], total: 0 };
      const { data } = await api.get('/vocabularies/genres', {
        params: { q: query, limit: 20 },
      });
      return data as { genres: VocabularyConcept[]; total: number };
    },
    enabled: enabled && query.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

// Get all genres
export function useGenres() {
  return useQuery({
    queryKey: ['vocabularies', 'genres', 'all'],
    queryFn: async () => {
      const { data } = await api.get('/vocabularies/genres');
      return data as { genres: VocabularyConcept[]; total: number };
    },
    staleTime: 30 * 60 * 1000,
  });
}

// Get genre hierarchy tree
export function useGenreTree() {
  return useQuery({
    queryKey: ['vocabularies', 'genres', 'tree'],
    queryFn: async () => {
      const { data } = await api.get('/vocabularies/genres/tree');
      return data as { tree: VocabularyHierarchyNode[] };
    },
    staleTime: 30 * 60 * 1000,
  });
}

// Get extended metadata for a title
export function useTitleMetadata(titleId: string) {
  return useQuery({
    queryKey: ['music-pieces', 'metadata', titleId],
    queryFn: async () => {
      const { data } = await api.get(`/music-pieces/title-metadata/${titleId}`);
      return data;
    },
    enabled: !!titleId,
  });
}

// Update extended metadata
export function useUpdateTitleMetadata() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      titleId,
      metadata,
    }: {
      titleId: string;
      metadata: {
        workNumber?: string;
        movementNumber?: number;
        movementTitle?: string;
        lyricist?: string;
        rights?: string;
        source?: string;
        instruments?: TitleInstrument[];
        genres?: string[];
      };
    }) => {
      const { data } = await api.patch(`/music-pieces/title-metadata/${titleId}`, metadata);
      return data;
    },
    onSuccess: (_, { titleId }) => {
      queryClient.invalidateQueries({ queryKey: ['music-pieces', 'metadata', titleId] });
      queryClient.invalidateQueries({ queryKey: ['music-pieces'] });
    },
  });
}

// Upload MusicXML
export function useUploadMusicXML() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ titleId, file }: { titleId: string; file: File }) => {
      const formData = new FormData();
      formData.append('musicxml', file);

      const { data } = await api.post(`/music-pieces/title-musicxml/${titleId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: (_, { titleId }) => {
      queryClient.invalidateQueries({ queryKey: ['music-pieces', 'metadata', titleId] });
      queryClient.invalidateQueries({ queryKey: ['music-pieces'] });
    },
  });
}

// Delete MusicXML metadata
export function useDeleteMusicXML() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (titleId: string) => {
      const { data } = await api.delete(`/music-pieces/title-musicxml/${titleId}`);
      return data;
    },
    onSuccess: (_, titleId) => {
      queryClient.invalidateQueries({ queryKey: ['music-pieces', 'metadata', titleId] });
    },
  });
}

// Lookup concepts by URIs
export function useLookupConcepts(uris: string[]) {
  return useQuery({
    queryKey: ['vocabularies', 'lookup', uris],
    queryFn: async () => {
      if (uris.length === 0) return { concepts: [] };
      const { data } = await api.get('/vocabularies/lookup', {
        params: { uris: uris.join(',') },
      });
      return data as { concepts: VocabularyConcept[] };
    },
    enabled: uris.length > 0,
    staleTime: 30 * 60 * 1000,
  });
}
