/**
 * Attendance Analytics API
 * API functions for attendance statistics and analytics
 */

import api from './client';

// Types - prefixed with "Rehearsal" to avoid conflicts with concert attendance types
export interface RehearsalAttendanceOverview {
  avgAttendanceRate: number;
  totalMembers: number;
  totalRehearsals: number;
  acceptedCount: number;
  declinedCount: number;
  currentMonthRate: number;
  previousMonthRate: number;
  trend: number;
}

export interface RehearsalAttendanceTrend {
  month: string;
  attendanceRate: number;
  uniqueAttendees: number;
  totalRehearsals: number;
}

export interface RehearsalSectionAttendance {
  instrumentId: string;
  instrument: string;
  attendanceRate: number;
  memberCount: number;
  totalResponses: number;
}

export interface RehearsalMemberAttendanceStats {
  id: string;
  firstName: string;
  lastName: string;
  attendanceRate: number;
  presentCount: number;
  totalCount: number;
  instrument: string | null;
}

export interface RehearsalAtRiskMember {
  id: string;
  firstName: string;
  lastName: string;
  recentRate: number;
  previousRate: number;
  trend: number;
  riskLevel: 'high' | 'medium' | 'low';
}

export interface RehearsalAttendancePrediction {
  rehearsalId: string;
  date: string;
  predictedCount: number;
  predictedRate: number;
  dayOfWeek: number;
  understaffedSections: { instrument: string; expected: number; needed: number }[];
}

export interface RehearsalDayOfWeekStats {
  dayOfWeek: number;
  rehearsalCount: number;
  attendanceRate: number;
}

export interface RehearsalLeaderboardMember {
  rank: number;
  id: string;
  firstName: string;
  lastName: string;
  attendanceRate: number;
  presentCount: number;
  totalCount: number;
  instrument: string | null;
}

// API Functions

export async function getRehearsalAttendanceOverview(orchestraId?: string): Promise<RehearsalAttendanceOverview> {
  const params = orchestraId ? { orchestraId } : {};
  const { data } = await api.get('/analytics/attendance/overview', { params });
  return data;
}

export async function getRehearsalAttendanceTrends(
  months = 12,
  orchestraId?: string,
): Promise<RehearsalAttendanceTrend[]> {
  const params: Record<string, string | number> = { months };
  if (orchestraId) params.orchestraId = orchestraId;
  const { data } = await api.get('/analytics/attendance/trends', { params });
  return data;
}

export async function getRehearsalAttendanceBySection(orchestraId?: string): Promise<RehearsalSectionAttendance[]> {
  const params = orchestraId ? { orchestraId } : {};
  const { data } = await api.get('/analytics/attendance/by-section', { params });
  return data;
}

export async function getRehearsalAttendanceByMember(options?: {
  limit?: number;
  sortBy?: 'rate_asc' | 'rate_desc' | 'name';
  orchestraId?: string;
}): Promise<RehearsalMemberAttendanceStats[]> {
  const params: Record<string, string | number> = {};
  if (options?.limit) params.limit = options.limit;
  if (options?.sortBy) params.sortBy = options.sortBy;
  if (options?.orchestraId) params.orchestraId = options.orchestraId;
  const { data } = await api.get('/analytics/attendance/by-member', { params });
  return data;
}

export async function getRehearsalAtRiskMembers(orchestraId?: string): Promise<RehearsalAtRiskMember[]> {
  const params = orchestraId ? { orchestraId } : {};
  const { data } = await api.get('/analytics/attendance/at-risk', { params });
  return data;
}

export async function getRehearsalAttendancePredictions(
  limit = 5,
  orchestraId?: string,
): Promise<RehearsalAttendancePrediction[]> {
  const params: Record<string, string | number> = { limit };
  if (orchestraId) params.orchestraId = orchestraId;
  const { data } = await api.get('/analytics/attendance/predictions', { params });
  return data;
}

export async function getRehearsalAttendanceByDayOfWeek(orchestraId?: string): Promise<RehearsalDayOfWeekStats[]> {
  const params = orchestraId ? { orchestraId } : {};
  const { data } = await api.get('/analytics/attendance/by-day-of-week', { params });
  return data;
}

export async function getRehearsalAttendanceLeaderboard(
  limit = 10,
  orchestraId?: string,
): Promise<RehearsalLeaderboardMember[]> {
  const params: Record<string, string | number> = { limit };
  if (orchestraId) params.orchestraId = orchestraId;
  const { data } = await api.get('/analytics/attendance/leaderboard', { params });
  return data;
}
