import api from './client';

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

export const updateIssueStatus = async (id: string, status: string, resolutionNotes?: string): Promise<PieceIssue> => {
  const { data } = await api.patch(`/issues/${id}/status`, { status, resolutionNotes });
  return data;
};

export const deleteIssue = async (id: string): Promise<void> => {
  await api.delete(`/issues/${id}`);
};
