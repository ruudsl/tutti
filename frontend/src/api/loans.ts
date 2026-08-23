import api from './client';

export interface Loan {
  id: string;
  music_title_id: string;
  borrower_name: string;
  borrower_email: string | null;
  borrower_organization: string | null;
  notes: string | null;
  date_out: string;
  expected_return: string | null;
  date_returned: string | null;
  status: 'active' | 'returned' | 'overdue';
  created_at: string;
  title_name?: string;
  title_arranger?: string;
  created_by_name?: string;
}

export const getLoans = async (filters?: { status?: string }): Promise<Loan[]> => {
  const { data } = await api.get('/loans', { params: filters });
  return data;
};

export const createLoan = async (loan: {
  musicTitleId: string;
  borrowerName: string;
  borrowerEmail?: string;
  borrowerOrganization?: string;
  notes?: string;
  expectedReturn?: string;
}): Promise<Loan> => {
  const { data } = await api.post('/loans', loan);
  return data;
};

export const updateLoan = async (
  id: string,
  updates: {
    borrowerName?: string;
    borrowerEmail?: string;
    borrowerOrganization?: string;
    notes?: string;
    expectedReturn?: string;
  },
): Promise<Loan> => {
  const { data } = await api.put(`/loans/${id}`, updates);
  return data;
};

export const returnLoan = async (id: string): Promise<Loan> => {
  const { data } = await api.post(`/loans/${id}/return`);
  return data;
};

export const deleteLoan = async (id: string): Promise<void> => {
  await api.delete(`/loans/${id}`);
};

// Loan history for a title
export interface LoanHistoryEntry {
  id: string;
  borrowerName: string;
  borrowerEmail: string | null;
  borrowerOrganization: string | null;
  notes: string | null;
  dateOut: string;
  expectedReturn: string | null;
  dateReturned: string | null;
  status: 'active' | 'returned' | 'overdue';
  createdAt: string;
  createdByName: string;
}

export interface TitleLoanHistory {
  title: {
    id: string;
    title: string;
    arranger: string | null;
  };
  statistics: {
    totalLoans: number;
    activeLoans: number;
    avgLoanDurationDays: number;
  };
  loans: LoanHistoryEntry[];
}

export const getTitleLoanHistory = async (titleId: string): Promise<TitleLoanHistory> => {
  const { data } = await api.get(`/loans/title/${titleId}/history`);
  return data;
};

/**
 * De tellers boven de uitleenlijst en de titels die nog uitgeleend kunnen
 * worden.
 *
 * Deze twee stonden als kale fetch in Loans.tsx, met een eigen token uit
 * localStorage. Beide routes vragen bovendien om de rol muziekcommissie of
 * beheerder; wie die niet heeft krijgt een 403, en dat is een antwoord dat je
 * niet zomaar door res.json() wilt halen.
 */
export interface LoanStats {
  total: number;
  active: number;
  overdue: number;
  returned: number;
}

export interface LoanableTitle {
  id: string;
  title: string;
  arranger: string | null;
  active_loans: number;
}

export const getLoanStats = async (): Promise<LoanStats> => {
  const { data } = await api.get('/loans/stats');
  return data;
};

export const getLoanableTitles = async (search?: string): Promise<LoanableTitle[]> => {
  const { data } = await api.get('/loans/available-titles', { params: { search } });
  return Array.isArray(data) ? data : [];
};
