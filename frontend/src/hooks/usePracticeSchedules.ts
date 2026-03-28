import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

interface PracticeSchedule {
  id: string;
  targetDate: string;
  priority: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  musicTitle: {
    id: string;
    title: string;
    composer?: string;
    arranger?: string;
  };
  orchestra: {
    id: string;
    name: string;
  };
  createdBy: {
    name: string;
  };
  milestoneCount: number;
  completedMilestones: number;
  progress: number;
}

interface PracticeScheduleDetail extends PracticeSchedule {
  milestones: Milestone[];
}

interface Milestone {
  id: string;
  title: string;
  description?: string;
  targetDate: string;
  isCompleted: boolean;
  completedAt?: string;
  sortOrder: number;
  sectionsCompleted: number;
  totalSections: number;
  sectionProgress: SectionProgress[];
}

interface SectionProgress {
  id: string;
  instrument: {
    id: string;
    name: string;
    tuning?: string;
  };
  status: 'pending' | 'in_progress' | 'completed';
  notes?: string;
  updatedBy?: string;
  updatedAt: string;
}

interface CreateScheduleData {
  musicTitleId: string;
  orchestraId: string;
  targetDate: string;
  priority?: number;
  notes?: string;
  milestones?: Array<{
    title: string;
    description?: string;
    targetDate: string;
  }>;
}

export function usePracticeSchedules(filters?: {
  orchestraId?: string;
  musicTitleId?: string;
  upcoming?: boolean;
}) {
  return useQuery({
    queryKey: ['practice-schedules', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.orchestraId) params.append('orchestraId', filters.orchestraId);
      if (filters?.musicTitleId) params.append('musicTitleId', filters.musicTitleId);
      if (filters?.upcoming) params.append('upcoming', 'true');

      const response = await api.get<PracticeSchedule[]>(`/practice-schedules?${params}`);
      return response.data;
    },
  });
}

export function usePracticeSchedule(id: string) {
  return useQuery({
    queryKey: ['practice-schedule', id],
    queryFn: async () => {
      const response = await api.get<PracticeScheduleDetail>(`/practice-schedules/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreatePracticeSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateScheduleData) => {
      const response = await api.post('/practice-schedules', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-schedules'] });
    },
  });
}

export function useUpdatePracticeSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<PracticeSchedule>) => {
      const response = await api.patch(`/practice-schedules/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['practice-schedule'] });
    },
  });
}

export function useDeletePracticeSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/practice-schedules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-schedules'] });
    },
  });
}

export function useAddMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ scheduleId, ...data }: {
      scheduleId: string;
      title: string;
      description?: string;
      targetDate: string;
    }) => {
      const response = await api.post(`/practice-schedules/${scheduleId}/milestones`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['practice-schedules'] });
    },
  });
}

export function useUpdateMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ milestoneId, ...data }: {
      milestoneId: string;
      title?: string;
      description?: string;
      targetDate?: string;
      isCompleted?: boolean;
    }) => {
      const response = await api.patch(`/practice-schedules/milestones/${milestoneId}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['practice-schedules'] });
    },
  });
}

export function useDeleteMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (milestoneId: string) => {
      await api.delete(`/practice-schedules/milestones/${milestoneId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['practice-schedules'] });
    },
  });
}

export function useUpdateSectionProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ milestoneId, instrumentId, status, notes }: {
      milestoneId: string;
      instrumentId: string;
      status: 'pending' | 'in_progress' | 'completed';
      notes?: string;
    }) => {
      const response = await api.post(
        `/practice-schedules/milestones/${milestoneId}/section-progress`,
        { instrumentId, status, notes }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-schedule'] });
    },
  });
}

export function useInitializeSections() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scheduleId: string) => {
      const response = await api.post(`/practice-schedules/${scheduleId}/initialize-sections`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['practice-schedule'] });
    },
  });
}
