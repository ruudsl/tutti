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
  notes?: string
): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/practice', { musicTitleId, durationMinutes, notes });
  return data;
};

export const deletePracticeLog = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/practice/${id}`);
  return data;
};
