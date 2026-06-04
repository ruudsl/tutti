/**
 * Attendance Analytics Hooks
 * React Query hooks for attendance statistics and analytics
 */

import { useQuery } from '@tanstack/react-query';
import {
  getAttendanceOverview,
  getAttendanceTrends,
  getAttendanceBySection,
  getAttendanceByMember,
  getAtRiskMembers,
  getAttendancePredictions,
  getAttendanceByDayOfWeek,
  getAttendanceLeaderboard,
  type AttendanceOverview,
  type AttendanceTrend,
  type SectionAttendance,
  type MemberAttendanceStats,
  type AtRiskMember,
  type AttendancePrediction,
  type DayOfWeekStats,
  type LeaderboardMember,
} from '../api';

// Query keys
export const attendanceAnalyticsKeys = {
  all: ['attendanceAnalytics'] as const,
  overview: (orchestraId?: string) => [...attendanceAnalyticsKeys.all, 'overview', orchestraId] as const,
  trends: (months: number, orchestraId?: string) => [...attendanceAnalyticsKeys.all, 'trends', months, orchestraId] as const,
  bySection: (orchestraId?: string) => [...attendanceAnalyticsKeys.all, 'bySection', orchestraId] as const,
  byMember: (options?: { limit?: number; sortBy?: string; orchestraId?: string }) =>
    [...attendanceAnalyticsKeys.all, 'byMember', options] as const,
  atRisk: (orchestraId?: string) => [...attendanceAnalyticsKeys.all, 'atRisk', orchestraId] as const,
  predictions: (limit: number, orchestraId?: string) => [...attendanceAnalyticsKeys.all, 'predictions', limit, orchestraId] as const,
  byDayOfWeek: (orchestraId?: string) => [...attendanceAnalyticsKeys.all, 'byDayOfWeek', orchestraId] as const,
  leaderboard: (limit: number, orchestraId?: string) => [...attendanceAnalyticsKeys.all, 'leaderboard', limit, orchestraId] as const,
};

/**
 * Hook to fetch attendance overview statistics
 */
export function useAttendanceOverview(orchestraId?: string) {
  return useQuery<AttendanceOverview>({
    queryKey: attendanceAnalyticsKeys.overview(orchestraId),
    queryFn: () => getAttendanceOverview(orchestraId),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch attendance trends over time
 */
export function useAttendanceTrends(months = 12, orchestraId?: string) {
  return useQuery<AttendanceTrend[]>({
    queryKey: attendanceAnalyticsKeys.trends(months, orchestraId),
    queryFn: () => getAttendanceTrends(months, orchestraId),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch attendance by instrument section
 */
export function useAttendanceBySection(orchestraId?: string) {
  return useQuery<SectionAttendance[]>({
    queryKey: attendanceAnalyticsKeys.bySection(orchestraId),
    queryFn: () => getAttendanceBySection(orchestraId),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch attendance by member
 */
export function useAttendanceByMember(options?: {
  limit?: number;
  sortBy?: 'rate_asc' | 'rate_desc' | 'name';
  orchestraId?: string;
}) {
  return useQuery<MemberAttendanceStats[]>({
    queryKey: attendanceAnalyticsKeys.byMember(options),
    queryFn: () => getAttendanceByMember(options),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch at-risk members (declining attendance)
 */
export function useAtRiskMembers(orchestraId?: string) {
  return useQuery<AtRiskMember[]>({
    queryKey: attendanceAnalyticsKeys.atRisk(orchestraId),
    queryFn: () => getAtRiskMembers(orchestraId),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch attendance predictions for upcoming rehearsals
 */
export function useAttendancePredictions(limit = 5, orchestraId?: string) {
  return useQuery<AttendancePrediction[]>({
    queryKey: attendanceAnalyticsKeys.predictions(limit, orchestraId),
    queryFn: () => getAttendancePredictions(limit, orchestraId),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch attendance by day of week
 */
export function useAttendanceByDayOfWeek(orchestraId?: string) {
  return useQuery<DayOfWeekStats[]>({
    queryKey: attendanceAnalyticsKeys.byDayOfWeek(orchestraId),
    queryFn: () => getAttendanceByDayOfWeek(orchestraId),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch attendance leaderboard
 */
export function useAttendanceLeaderboard(limit = 10, orchestraId?: string) {
  return useQuery<LeaderboardMember[]>({
    queryKey: attendanceAnalyticsKeys.leaderboard(limit, orchestraId),
    queryFn: () => getAttendanceLeaderboard(limit, orchestraId),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
