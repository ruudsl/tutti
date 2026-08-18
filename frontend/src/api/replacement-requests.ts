import api from './client';

// Types
export interface ReplacementRequest {
  id: string;
  eventType: 'concert' | 'rehearsal';
  eventId: string;
  eventDate: string;
  eventName: string | null;
  eventLocation: string | null;
  instrumentId: string;
  instrumentName: string;
  instrumentTuning: string | null;
  positionsNeeded: number;
  positionsFilled: number;
  urgency: 'low' | 'normal' | 'high' | 'critical';
  status: 'open' | 'partially_filled' | 'filled' | 'cancelled';
  notes: string | null;
  deadline: string | null;
  assignmentCount: number;
  confirmedCount: number;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReplacementAssignment {
  id: string;
  externalMusicianId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  musicianType: string;
  rating: number | null;
  status: 'pending' | 'confirmed' | 'declined' | 'completed' | 'no_show';
  invitedAt: string;
  respondedAt: string | null;
  feeAmount: number | null;
  notes: string | null;
}

export interface ReplacementRequestDetail extends ReplacementRequest {
  assignments: ReplacementAssignment[];
}

export interface CreateReplacementRequestData {
  eventType: 'concert' | 'rehearsal';
  eventId: string;
  eventDate: string;
  instrumentId: string;
  positionsNeeded?: number;
  urgency?: 'low' | 'normal' | 'high' | 'critical';
  notes?: string | null;
  deadline?: string | null;
}

export interface UpdateReplacementRequestData {
  positionsNeeded?: number;
  urgency?: 'low' | 'normal' | 'high' | 'critical';
  status?: 'open' | 'partially_filled' | 'filled' | 'cancelled';
  notes?: string | null;
  deadline?: string | null;
}

export interface InviteMusicianData {
  externalMusicianId: string;
  notes?: string | null;
  feeAmount?: number | null;
}

export interface UpdateAssignmentData {
  status: 'pending' | 'confirmed' | 'declined' | 'completed' | 'no_show';
  notes?: string | null;
  feeAmount?: number | null;
}

export interface SuggestionRequest {
  id: string;
  instrumentId: string;
  instrumentName: string;
  positionsNeeded: number;
  positionsFilled: number;
  urgency: string;
}

export interface SuggestedMusician {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  musicianType: string;
  rating: number | null;
  totalPerformances: number;
  lastPlayedDate: string | null;
  skillLevel: string | null;
  isPrimary: boolean;
}

export interface ReplacementSuggestion {
  request: SuggestionRequest;
  suggestedMusicians: SuggestedMusician[];
}

// API Functions

export const getReplacementRequests = async (filters?: {
  status?: string;
  eventType?: string;
  instrumentId?: string;
  urgency?: string;
}): Promise<ReplacementRequest[]> => {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.eventType) params.set('eventType', filters.eventType);
  if (filters?.instrumentId) params.set('instrumentId', filters.instrumentId);
  if (filters?.urgency) params.set('urgency', filters.urgency);

  const { data } = await api.get(`/replacement-requests?${params.toString()}`);
  return data;
};

export const getReplacementRequest = async (id: string): Promise<ReplacementRequestDetail> => {
  const { data } = await api.get(`/replacement-requests/${id}`);
  return data;
};

export const createReplacementRequest = async (
  requestData: CreateReplacementRequestData,
): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/replacement-requests', requestData);
  return data;
};

export const updateReplacementRequest = async (
  id: string,
  requestData: UpdateReplacementRequestData,
): Promise<{ message: string }> => {
  const { data } = await api.put(`/replacement-requests/${id}`, requestData);
  return data;
};

export const cancelReplacementRequest = async (id: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/replacement-requests/${id}`);
  return data;
};

export const inviteMusician = async (
  requestId: string,
  inviteData: InviteMusicianData,
): Promise<{ id: string; message: string }> => {
  const { data } = await api.post(`/replacement-requests/${requestId}/invite`, inviteData);
  return data;
};

export const updateAssignment = async (
  requestId: string,
  assignmentId: string,
  assignmentData: UpdateAssignmentData,
): Promise<{ message: string }> => {
  const { data } = await api.put(`/replacement-requests/${requestId}/assignments/${assignmentId}`, assignmentData);
  return data;
};

export const getReplacementSuggestions = async (
  eventId: string,
  eventType?: string,
): Promise<ReplacementSuggestion[]> => {
  const params = new URLSearchParams();
  if (eventType) params.set('eventType', eventType);

  const { data } = await api.get(`/replacement-requests/suggestions/${eventId}?${params.toString()}`);
  return data;
};
