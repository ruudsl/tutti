import api from './client';

export type PollType = 'single' | 'multiple' | 'ranked';
export type PollStatus = 'draft' | 'active' | 'closed' | 'archived';

export interface PollOption {
  id: string;
  text: string;
  description?: string;
  sortOrder: number;
  voteCount?: number;
  voters?: { id: string; name: string }[];
}

export interface PollComment {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PollVote {
  optionId: string;
  rank?: number;
}

export interface Poll {
  id: string;
  title: string;
  description?: string;
  pollType: PollType;
  status: PollStatus;
  isAnonymous: boolean;
  showResultsBeforeClose: boolean;
  allowComments: boolean;
  maxSelections?: number;
  startsAt?: string;
  endsAt?: string;
  targetOrchestras?: string[];
  targetRoles?: string[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  closedAt?: string;
  optionCount: number;
  voteCount: number;
  hasVoted: boolean;
}

export interface PollDetail extends Omit<Poll, 'optionCount' | 'voteCount'> {
  options: PollOption[];
  totalVoters: number;
  userVotes: PollVote[];
  canSeeResults: boolean;
  comments: PollComment[];
}

export interface CreatePollData {
  title: string;
  description?: string;
  pollType: PollType;
  isAnonymous?: boolean;
  showResultsBeforeClose?: boolean;
  allowComments?: boolean;
  maxSelections?: number;
  startsAt?: string;
  endsAt?: string;
  targetOrchestras?: string[];
  targetRoles?: string[];
  options: { text: string; description?: string }[];
}

export interface UpdatePollData {
  title?: string;
  description?: string;
  pollType?: PollType;
  isAnonymous?: boolean;
  showResultsBeforeClose?: boolean;
  allowComments?: boolean;
  maxSelections?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  targetOrchestras?: string[];
  targetRoles?: string[];
}

export interface PollFilters {
  status?: PollStatus;
  createdBy?: string;
  search?: string;
}

export interface VoteData {
  optionIds: string[];
  ranks?: Record<string, number>;
}

// Polls
export async function getPolls(filters?: PollFilters): Promise<Poll[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.createdBy) params.set('createdBy', filters.createdBy);
  if (filters?.search) params.set('search', filters.search);

  const query = params.toString();
  const response = await api.get(`/polls${query ? `?${query}` : ''}`);
  return response.data;
}

export async function getPoll(id: string): Promise<PollDetail> {
  const response = await api.get(`/polls/${id}`);
  return response.data;
}

export async function createPoll(data: CreatePollData): Promise<{ id: string; message: string }> {
  const response = await api.post('/polls', data);
  return response.data;
}

export async function updatePoll(id: string, data: UpdatePollData): Promise<{ message: string }> {
  const response = await api.put(`/polls/${id}`, data);
  return response.data;
}

export async function changePollStatus(id: string, status: PollStatus): Promise<{ message: string }> {
  const response = await api.post(`/polls/${id}/status`, { status });
  return response.data;
}

export async function deletePoll(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/polls/${id}`);
  return response.data;
}

// Options
export async function addPollOption(pollId: string, data: { text: string; description?: string }): Promise<{ id: string; message: string }> {
  const response = await api.post(`/polls/${pollId}/options`, data);
  return response.data;
}

export async function updatePollOption(pollId: string, optionId: string, data: { text?: string; description?: string }): Promise<{ message: string }> {
  const response = await api.put(`/polls/${pollId}/options/${optionId}`, data);
  return response.data;
}

export async function deletePollOption(pollId: string, optionId: string): Promise<{ message: string }> {
  const response = await api.delete(`/polls/${pollId}/options/${optionId}`);
  return response.data;
}

export async function reorderPollOptions(pollId: string, optionIds: string[]): Promise<{ message: string }> {
  const response = await api.put(`/polls/${pollId}/options/reorder`, { optionIds });
  return response.data;
}

// Voting
export async function submitVote(pollId: string, data: VoteData): Promise<{ message: string }> {
  const response = await api.post(`/polls/${pollId}/vote`, data);
  return response.data;
}

export async function retractVote(pollId: string): Promise<{ message: string }> {
  const response = await api.delete(`/polls/${pollId}/vote`);
  return response.data;
}

// Comments
export async function getPollComments(pollId: string): Promise<PollComment[]> {
  const response = await api.get(`/polls/${pollId}/comments`);
  return response.data;
}

export async function addPollComment(pollId: string, data: { content: string; parentId?: string }): Promise<PollComment & { message: string }> {
  const response = await api.post(`/polls/${pollId}/comments`, data);
  return response.data;
}

export async function updatePollComment(pollId: string, commentId: string, content: string): Promise<{ message: string }> {
  const response = await api.put(`/polls/${pollId}/comments/${commentId}`, { content });
  return response.data;
}

export async function deletePollComment(pollId: string, commentId: string): Promise<{ message: string }> {
  const response = await api.delete(`/polls/${pollId}/comments/${commentId}`);
  return response.data;
}
