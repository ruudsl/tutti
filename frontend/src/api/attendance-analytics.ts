/**
 * Attendance Analytics API
 * API functions for attendance statistics and analytics
 */

import api from './client';

// Types
export interface AttendanceOverview {
  avgAttendanceRate: number;
  totalMembers: number;
  totalRehearsals: number;
  acceptedCount: number;
  declinedCount: number;
  currentMonthRate: number;
  previousMonthRate: number;
  trend: number;
}

export interface AttendanceTrend {
  month: string;
  attendanceRate: number;
  uniqueAttendees: number;
  totalRehearsals: number;
}

export interface SectionAttendance {
  instrumentId: string;
  instrument: string;
  attendanceRate: number;
  memberCount: number;
  totalResponses: number;
}

export interface MemberAttendanceStats {
  id: string;
  firstName: string;
  lastName: string;
  attendanceRate: number;
  presentCount: number;
  totalCount: number;
  instrument: string | null;
}

export interface AtRiskMember {
  id: string;
  firstName: string;
  lastName: string;
  recentRate: number;
  previousRate: number;
  trend: number;
  riskLevel: 'high' | 'medium' | 'low';
}

export interface AttendancePrediction {
  rehearsalId: string;
  date: string;
  predictedCount: number;
  predictedRate: number;
  dayOfWeek: number;
  understaffedSections: { instrument: string; expected: number; needed: number }[];
}

export interface DayOfWeekStats {
  dayOfWeek: number;
  rehearsalCount: number;
  attendanceRate: number;
}

export interface LeaderboardMember {
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

export async function getAttendanceOverview(orchestraId?: string): Promise<AttendanceOverview> {
  const params = orchestraId ? { orchestraId } : {};
  const { data } = await api.get('/analytics/attendance/overview', { params });
  return data;
}

export async function getAttendanceTrends(months = 12, orchestraId?: string): Promise<AttendanceTrend[]> {
  const params: Record<string, string | number> = { months };
  if (orchestraId) params.orchestraId = orchestraId;
  const { data } = await api.get('/analytics/attendance/trends', { params });
  return data;
}

export async function getAttendanceBySection(orchestraId?: string): Promise<SectionAttendance[]> {
  const params = orchestraId ? { orchestraId } : {};
  const { data } = await api.get('/analytics/attendance/by-section', { params });
  return data;
}

export async function getAttendanceByMember(
  options?: { limit?: number; sortBy?: 'rate_asc' | 'rate_desc' | 'name'; orchestraId?: string }
): Promise<MemberAttendanceStats[]> {
  const params: Record<string, string | number> = {};
  if (options?.limit) params.limit = options.limit;
  if (options?.sortBy) params.sortBy = options.sortBy;
  if (options?.orchestraId) params.orchestraId = options.orchestraId;
  const { data } = await api.get('/analytics/attendance/by-member', { params });
  return data;
}

export async function getAtRiskMembers(orchestraId?: string): Promise<AtRiskMember[]> {
  const params = orchestraId ? { orchestraId } : {};
  const { data } = await api.get('/analytics/attendance/at-risk', { params });
  return data;
}

export async function getAttendancePredictions(limit = 5, orchestraId?: string): Promise<AttendancePrediction[]> {
  const params: Record<string, string | number> = { limit };
  if (orchestraId) params.orchestraId = orchestraId;
  const { data } = await api.get('/analytics/attendance/predictions', { params });
  return data;
}

export async function getAttendanceByDayOfWeek(orchestraId?: string): Promise<DayOfWeekStats[]> {
  const params = orchestraId ? { orchestraId } : {};
  const { data } = await api.get('/analytics/attendance/by-day-of-week', { params });
  return data;
}

export async function getAttendanceLeaderboard(limit = 10, orchestraId?: string): Promise<LeaderboardMember[]> {
  const params: Record<string, string | number> = { limit };
  if (orchestraId) params.orchestraId = orchestraId;
  const { data } = await api.get('/analytics/attendance/leaderboard', { params });
  return data;
}
