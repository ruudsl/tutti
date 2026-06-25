/**
 * Polls API Module
 *
 * Provides functions for managing polls, voting, and poll comments.
 * Supports single-choice, multiple-choice, and ranked voting.
 *
 * @module api/polls
 */

import api from './client';

/** Type of voting allowed in a poll */
export type PollType = 'single' | 'multiple' | 'ranked';

/** Current status of a poll */
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

/**
 * Retrieves a list of polls with optional filtering.
 *
 * @description Fetches all polls accessible to the current user, with optional filters
 * for status, creator, or search term.
 * @param {PollFilters} [filters] - Optional filters to apply
 * @param {PollStatus} [filters.status] - Filter by poll status
 * @param {string} [filters.createdBy] - Filter by creator user ID
 * @param {string} [filters.search] - Search term for poll title/description
 * @returns {Promise<Poll[]>} Array of polls matching the filters
 * @throws {AxiosError} When the request fails or user is unauthorized
 * @example
 * // Get all active polls
 * const activePolls = await getPolls({ status: 'active' });
 *
 * // Search for polls
 * const results = await getPolls({ search: 'rehearsal' });
 */
export async function getPolls(filters?: PollFilters): Promise<Poll[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.createdBy) params.set('createdBy', filters.createdBy);
  if (filters?.search) params.set('search', filters.search);

  const query = params.toString();
  const response = await api.get(`/polls${query ? `?${query}` : ''}`);
  return response.data;
}

/**
 * Retrieves detailed information about a specific poll.
 *
 * @description Fetches complete poll data including options, vote counts, comments,
 * and the current user's voting status.
 * @param {string} id - The unique poll identifier
 * @returns {Promise<PollDetail>} Detailed poll information including options and votes
 * @throws {AxiosError} When poll is not found (404) or user lacks access (403)
 */
export async function getPoll(id: string): Promise<PollDetail> {
  const response = await api.get(`/polls/${id}`);
  return response.data;
}

/**
 * Creates a new poll.
 *
 * @description Creates a poll with specified options and settings. The poll starts
 * in draft status unless startsAt is set to a past date.
 * @param {CreatePollData} data - Poll creation data
 * @param {string} data.title - Poll title
 * @param {string} [data.description] - Optional poll description
 * @param {PollType} data.pollType - Voting type (single, multiple, or ranked)
 * @param {Array<{text: string, description?: string}>} data.options - Poll options
 * @returns {Promise<{id: string, message: string}>} Created poll ID and success message
 * @throws {AxiosError} When validation fails (422) or user lacks permission (403)
 */
export async function createPoll(data: CreatePollData): Promise<{ id: string; message: string }> {
  const response = await api.post('/polls', data);
  return response.data;
}

/**
 * Updates an existing poll.
 *
 * @description Updates poll properties. Most fields can only be modified while
 * the poll is in draft status.
 * @param {string} id - The poll identifier
 * @param {UpdatePollData} data - Fields to update
 * @returns {Promise<{message: string}>} Success message
 * @throws {AxiosError} When poll not found (404), validation fails (422), or poll is not editable
 */
export async function updatePoll(id: string, data: UpdatePollData): Promise<{ message: string }> {
  const response = await api.put(`/polls/${id}`, data);
  return response.data;
}

/**
 * Changes the status of a poll.
 *
 * @description Transitions poll between states: draft -> active -> closed -> archived.
 * Cannot revert to previous states.
 * @param {string} id - The poll identifier
 * @param {PollStatus} status - The new status to set
 * @returns {Promise<{message: string}>} Success message
 * @throws {AxiosError} When transition is invalid or user lacks permission
 */
export async function changePollStatus(id: string, status: PollStatus): Promise<{ message: string }> {
  const response = await api.post(`/polls/${id}/status`, { status });
  return response.data;
}

/**
 * Deletes a poll.
 *
 * @description Permanently removes a poll and all associated votes and comments.
 * Only the creator or an admin can delete a poll.
 * @param {string} id - The poll identifier
 * @returns {Promise<{message: string}>} Success message
 * @throws {AxiosError} When poll not found (404) or user lacks permission (403)
 */
export async function deletePoll(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/polls/${id}`);
  return response.data;
}

// Options

/**
 * Adds a new option to a poll.
 *
 * @description Adds a voting option to an existing poll. Only works for polls in draft status.
 * @param {string} pollId - The poll identifier
 * @param {Object} data - Option data
 * @param {string} data.text - The option text
 * @param {string} [data.description] - Optional description for the option
 * @returns {Promise<{id: string, message: string}>} Created option ID and success message
 * @throws {AxiosError} When poll not found, not in draft status, or user lacks permission
 */
export async function addPollOption(pollId: string, data: { text: string; description?: string }): Promise<{ id: string; message: string }> {
  const response = await api.post(`/polls/${pollId}/options`, data);
  return response.data;
}

/**
 * Updates an existing poll option.
 *
 * @description Modifies the text or description of a poll option.
 * Only works for polls in draft status.
 * @param {string} pollId - The poll identifier
 * @param {string} optionId - The option identifier
 * @param {Object} data - Fields to update
 * @param {string} [data.text] - New option text
 * @param {string} [data.description] - New option description
 * @returns {Promise<{message: string}>} Success message
 * @throws {AxiosError} When poll/option not found or poll is not in draft status
 */
export async function updatePollOption(pollId: string, optionId: string, data: { text?: string; description?: string }): Promise<{ message: string }> {
  const response = await api.put(`/polls/${pollId}/options/${optionId}`, data);
  return response.data;
}

/**
 * Deletes a poll option.
 *
 * @description Removes an option from a poll. Only works for polls in draft status.
 * @param {string} pollId - The poll identifier
 * @param {string} optionId - The option identifier to delete
 * @returns {Promise<{message: string}>} Success message
 * @throws {AxiosError} When poll/option not found or poll is not in draft status
 */
export async function deletePollOption(pollId: string, optionId: string): Promise<{ message: string }> {
  const response = await api.delete(`/polls/${pollId}/options/${optionId}`);
  return response.data;
}

/**
 * Reorders poll options.
 *
 * @description Sets the display order of poll options. All option IDs must be provided.
 * @param {string} pollId - The poll identifier
 * @param {string[]} optionIds - Array of option IDs in the desired order
 * @returns {Promise<{message: string}>} Success message
 * @throws {AxiosError} When poll not found, IDs are incomplete, or poll is not in draft status
 */
export async function reorderPollOptions(pollId: string, optionIds: string[]): Promise<{ message: string }> {
  const response = await api.put(`/polls/${pollId}/options/reorder`, { optionIds });
  return response.data;
}

// Voting

/**
 * Submits a vote on a poll.
 *
 * @description Casts the user's vote for one or more options. For ranked polls,
 * ranks must be provided. Replaces any previous vote by the same user.
 * @param {string} pollId - The poll identifier
 * @param {VoteData} data - Vote data
 * @param {string[]} data.optionIds - Array of option IDs to vote for
 * @param {Record<string, number>} [data.ranks] - For ranked polls, mapping of option ID to rank
 * @returns {Promise<{message: string}>} Success message
 * @throws {AxiosError} When poll is not active, user already voted (if not allowed), or validation fails
 * @example
 * // Single choice vote
 * await submitVote('poll-123', { optionIds: ['option-1'] });
 *
 * // Ranked choice vote
 * await submitVote('poll-123', {
 *   optionIds: ['opt-a', 'opt-b', 'opt-c'],
 *   ranks: { 'opt-a': 1, 'opt-b': 2, 'opt-c': 3 }
 * });
 */
export async function submitVote(pollId: string, data: VoteData): Promise<{ message: string }> {
  const response = await api.post(`/polls/${pollId}/vote`, data);
  return response.data;
}

/**
 * Retracts the user's vote from a poll.
 *
 * @description Removes the current user's vote from a poll. Only works if the poll
 * is still active and allows vote changes.
 * @param {string} pollId - The poll identifier
 * @returns {Promise<{message: string}>} Success message
 * @throws {AxiosError} When poll is not active or user has not voted
 */
export async function retractVote(pollId: string): Promise<{ message: string }> {
  const response = await api.delete(`/polls/${pollId}/vote`);
  return response.data;
}

// Comments

/**
 * Retrieves comments for a poll.
 *
 * @description Fetches all comments on a poll, including replies. Only available
 * if the poll has comments enabled.
 * @param {string} pollId - The poll identifier
 * @returns {Promise<PollComment[]>} Array of comments with nested replies
 * @throws {AxiosError} When poll not found or comments are disabled
 */
export async function getPollComments(pollId: string): Promise<PollComment[]> {
  const response = await api.get(`/polls/${pollId}/comments`);
  return response.data;
}

/**
 * Adds a comment to a poll.
 *
 * @description Posts a new comment or reply on a poll. Requires comments to be enabled.
 * @param {string} pollId - The poll identifier
 * @param {Object} data - Comment data
 * @param {string} data.content - The comment text
 * @param {string} [data.parentId] - Parent comment ID for replies
 * @returns {Promise<PollComment & {message: string}>} Created comment with success message
 * @throws {AxiosError} When poll not found, comments disabled, or content is empty
 */
export async function addPollComment(pollId: string, data: { content: string; parentId?: string }): Promise<PollComment & { message: string }> {
  const response = await api.post(`/polls/${pollId}/comments`, data);
  return response.data;
}

/**
 * Updates a poll comment.
 *
 * @description Modifies the content of an existing comment. Only the author can edit.
 * @param {string} pollId - The poll identifier
 * @param {string} commentId - The comment identifier
 * @param {string} content - New comment content
 * @returns {Promise<{message: string}>} Success message
 * @throws {AxiosError} When comment not found or user is not the author
 */
export async function updatePollComment(pollId: string, commentId: string, content: string): Promise<{ message: string }> {
  const response = await api.put(`/polls/${pollId}/comments/${commentId}`, { content });
  return response.data;
}

/**
 * Deletes a poll comment.
 *
 * @description Removes a comment from a poll. Only the author or admin can delete.
 * @param {string} pollId - The poll identifier
 * @param {string} commentId - The comment identifier
 * @returns {Promise<{message: string}>} Success message
 * @throws {AxiosError} When comment not found or user lacks permission
 */
export async function deletePollComment(pollId: string, commentId: string): Promise<{ message: string }> {
  const response = await api.delete(`/polls/${pollId}/comments/${commentId}`);
  return response.data;
}

// Send reminder to non-voters

/**
 * Sends a reminder to users who haven't voted yet.
 *
 * @description Sends notification to all eligible voters who have not yet cast a vote.
 * Only available to poll creator or admin.
 * @param {string} pollId - The poll identifier
 * @returns {Promise<{message: string, sent: number}>} Success message and count of reminders sent
 * @throws {AxiosError} When poll not found, not active, or user lacks permission
 */
export async function sendPollReminder(pollId: string): Promise<{ message: string; sent: number }> {
  const response = await api.post(`/polls/${pollId}/remind`);
  return response.data;
}

// Create rehearsal from winning poll option

/** Data for creating a rehearsal from a poll's winning option */
export interface CreateRehearsalFromPollData {
  /** Orchestra ID to assign the rehearsal to */
  orchestraId?: string;
  /** Location for the rehearsal */
  location?: string;
  /** Additional notes for the rehearsal */
  notes?: string;
}

/**
 * Creates a rehearsal from the winning poll option.
 *
 * @description Converts the winning date/time option from a poll into an actual
 * rehearsal event. The poll must be closed and have date-formatted options.
 * @param {string} pollId - The poll identifier
 * @param {CreateRehearsalFromPollData} [data] - Optional rehearsal details
 * @param {string} [data.orchestraId] - Orchestra to assign the rehearsal to
 * @param {string} [data.location] - Rehearsal location
 * @param {string} [data.notes] - Additional notes
 * @returns {Promise<Object>} Created rehearsal details
 * @returns {string} return.message - Success message
 * @returns {string} return.rehearsalId - ID of the created rehearsal
 * @returns {string} return.date - Date of the rehearsal
 * @returns {string} return.winningOption - The winning poll option text
 * @returns {number} return.voteCount - Number of votes for the winning option
 * @throws {AxiosError} When poll not closed, no clear winner, or invalid date format
 * @example
 * const result = await createRehearsalFromPoll('poll-123', {
 *   orchestraId: 'orch-456',
 *   location: 'Main Hall'
 * });
 * console.log(`Rehearsal created for ${result.date}`);
 */
export async function createRehearsalFromPoll(
  pollId: string,
  data?: CreateRehearsalFromPollData
): Promise<{
  message: string;
  rehearsalId: string;
  date: string;
  winningOption: string;
  voteCount: number;
}> {
  const response = await api.post(`/polls/${pollId}/create-rehearsal`, data || {});
  return response.data;
}
