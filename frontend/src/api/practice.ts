import api from './client';

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
  notes?: string,
): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/practice', { musicTitleId, durationMinutes, notes });
  return data;
};

export const deletePracticeLog = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/practice/${id}`);
  return data;
};

// Practice Goals
export interface PracticeGoal {
  id: string;
  goalType: 'daily' | 'weekly';
  targetMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeGoalsResponse {
  goals: PracticeGoal[];
  progress: {
    daily: number;
    weekly: number;
  };
}

export const getPracticeGoals = async (): Promise<PracticeGoalsResponse> => {
  const { data } = await api.get('/practice/goals');
  return data;
};

export const setPracticeGoal = async (
  goalType: 'daily' | 'weekly',
  targetMinutes: number,
): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/practice/goals', { goalType, targetMinutes });
  return data;
};

export const deletePracticeGoal = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/practice/goals/${id}`);
  return data;
};
