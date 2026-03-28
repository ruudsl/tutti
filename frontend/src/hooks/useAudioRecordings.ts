import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

interface AudioRecording {
  id: string;
  title: string;
  description?: string;
  filePath: string;
  fileSize: number;
  durationSeconds: number;
  mimeType: string;
  isPublic: boolean;
  createdAt: string;
  recordedBy: {
    id: string;
    name: string;
  };
  orchestra?: {
    id: string;
    name: string;
  };
  rehearsal?: {
    id: string;
  };
  musicTitle?: {
    id: string;
    title: string;
  };
  section?: {
    id: string;
    name: string;
  };
}

interface CreateRecordingData {
  audio: Blob;
  title: string;
  description?: string;
  orchestraId?: string;
  rehearsalId?: string;
  musicTitleId?: string;
  sectionInstrumentId?: string;
  durationSeconds: number;
  isPublic?: boolean;
}

export function useAudioRecordings(filters?: {
  orchestraId?: string;
  rehearsalId?: string;
  musicTitleId?: string;
  onlyPublic?: boolean;
}) {
  return useQuery({
    queryKey: ['audio-recordings', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.orchestraId) params.append('orchestraId', filters.orchestraId);
      if (filters?.rehearsalId) params.append('rehearsalId', filters.rehearsalId);
      if (filters?.musicTitleId) params.append('musicTitleId', filters.musicTitleId);
      if (filters?.onlyPublic) params.append('onlyPublic', 'true');

      const response = await api.get<AudioRecording[]>(`/audio-recordings?${params}`);
      return response.data;
    },
  });
}

export function useAudioRecording(id: string) {
  return useQuery({
    queryKey: ['audio-recording', id],
    queryFn: async () => {
      const response = await api.get<AudioRecording>(`/audio-recordings/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateRecording() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateRecordingData) => {
      const formData = new FormData();
      formData.append('audio', data.audio, 'recording.webm');
      formData.append('title', data.title);
      if (data.description) formData.append('description', data.description);
      if (data.orchestraId) formData.append('orchestraId', data.orchestraId);
      if (data.rehearsalId) formData.append('rehearsalId', data.rehearsalId);
      if (data.musicTitleId) formData.append('musicTitleId', data.musicTitleId);
      if (data.sectionInstrumentId) formData.append('sectionInstrumentId', data.sectionInstrumentId);
      formData.append('durationSeconds', data.durationSeconds.toString());
      if (data.isPublic !== undefined) formData.append('isPublic', data.isPublic.toString());

      const response = await api.post('/audio-recordings', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audio-recordings'] });
    },
  });
}

export function useUpdateRecording() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<AudioRecording>) => {
      const response = await api.patch(`/audio-recordings/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audio-recordings'] });
    },
  });
}

export function useDeleteRecording() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/audio-recordings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audio-recordings'] });
    },
  });
}
