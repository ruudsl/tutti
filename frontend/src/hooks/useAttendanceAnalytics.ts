/**
 * Attendance Analytics Hooks
 * React Query hooks for attendance statistics and analytics
 */

import { useQuery } from '@tanstack/react-query';
import {
  getRehearsalAttendanceOverview,
  getRehearsalAttendanceTrends,
  getRehearsalAttendanceBySection,
  getRehearsalAttendanceByMember,
  getRehearsalAtRiskMembers,
  getRehearsalAttendancePredictions,
  getRehearsalAttendanceByDayOfWeek,
  getRehearsalAttendanceLeaderboard,
  type RehearsalAttendanceOverview,
  type RehearsalAttendanceTrend,
  type RehearsalSectionAttendance,
  type RehearsalMemberAttendanceStats,
  type RehearsalAtRiskMember,
  type RehearsalAttendancePrediction,
  type RehearsalDayOfWeekStats,
  type RehearsalLeaderboardMember,
} from '../api/attendance-analytics';

// Re-export types for convenience
export type {
  RehearsalAttendanceOverview,
  RehearsalAttendanceTrend,
  RehearsalSectionAttendance,
  RehearsalMemberAttendanceStats,
  RehearsalAtRiskMember,
  RehearsalAttendancePrediction,
  RehearsalDayOfWeekStats,
  RehearsalLeaderboardMember,
};

// Query keys
export const attendanceAnalyticsKeys = {
  all: ['attendanceAnalytics'] as const,
  overview: (orchestraId?: string) => [...attendanceAnalyticsKeys.all, 'overview', orchestraId] as const,
  trends: (months: number, orchestraId?: string) =>
    [...attendanceAnalyticsKeys.all, 'trends', months, orchestraId] as const,
  bySection: (orchestraId?: string) => [...attendanceAnalyticsKeys.all, 'bySection', orchestraId] as const,
  byMember: (options?: { limit?: number; sortBy?: string; orchestraId?: string }) =>
    [...attendanceAnalyticsKeys.all, 'byMember', options] as const,
  atRisk: (orchestraId?: string) => [...attendanceAnalyticsKeys.all, 'atRisk', orchestraId] as const,
  predictions: (limit: number, orchestraId?: string) =>
    [...attendanceAnalyticsKeys.all, 'predictions', limit, orchestraId] as const,
  byDayOfWeek: (orchestraId?: string) => [...attendanceAnalyticsKeys.all, 'byDayOfWeek', orchestraId] as const,
  leaderboard: (limit: number, orchestraId?: string) =>
    [...attendanceAnalyticsKeys.all, 'leaderboard', limit, orchestraId] as const,
};

/**
 * Hook to fetch attendance overview statistics
 */
export function useAttendanceOverview(orchestraId?: string) {
  return useQuery<RehearsalAttendanceOverview>({
    queryKey: attendanceAnalyticsKeys.overview(orchestraId),
    queryFn: () => getRehearsalAttendanceOverview(orchestraId),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch attendance trends over time
 */
export function useAttendanceTrends(months = 12, orchestraId?: string) {
  return useQuery<RehearsalAttendanceTrend[]>({
    queryKey: attendanceAnalyticsKeys.trends(months, orchestraId),
    queryFn: () => getRehearsalAttendanceTrends(months, orchestraId),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch attendance by instrument section
 */
export function useAttendanceBySection(orchestraId?: string) {
  return useQuery<RehearsalSectionAttendance[]>({
    queryKey: attendanceAnalyticsKeys.bySection(orchestraId),
    queryFn: () => getRehearsalAttendanceBySection(orchestraId),
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
  return useQuery<RehearsalMemberAttendanceStats[]>({
    queryKey: attendanceAnalyticsKeys.byMember(options),
    queryFn: () => getRehearsalAttendanceByMember(options),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch at-risk members (declining attendance)
 */
export function useAtRiskMembers(orchestraId?: string) {
  return useQuery<RehearsalAtRiskMember[]>({
    queryKey: attendanceAnalyticsKeys.atRisk(orchestraId),
    queryFn: () => getRehearsalAtRiskMembers(orchestraId),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch attendance predictions for upcoming rehearsals
 */
export function useAttendancePredictions(limit = 5, orchestraId?: string) {
  return useQuery<RehearsalAttendancePrediction[]>({
    queryKey: attendanceAnalyticsKeys.predictions(limit, orchestraId),
    queryFn: () => getRehearsalAttendancePredictions(limit, orchestraId),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch attendance by day of week
 */
export function useAttendanceByDayOfWeek(orchestraId?: string) {
  return useQuery<RehearsalDayOfWeekStats[]>({
    queryKey: attendanceAnalyticsKeys.byDayOfWeek(orchestraId),
    queryFn: () => getRehearsalAttendanceByDayOfWeek(orchestraId),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch attendance leaderboard
 */
export function useAttendanceLeaderboard(limit = 10, orchestraId?: string) {
  return useQuery<RehearsalLeaderboardMember[]>({
    queryKey: attendanceAnalyticsKeys.leaderboard(limit, orchestraId),
    queryFn: () => getRehearsalAttendanceLeaderboard(limit, orchestraId),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
