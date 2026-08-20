import db from '../database/connection';
import logger from '../utils/logger';

/**
 * Attendance status types
 */
export type AttendanceStatus = 'accepted' | 'declined' | 'waiting' | 'unknown';

/**
 * Trend direction types
 */
export type TrendDirection = 'improving' | 'declining' | 'stable';

/**
 * Member attendance summary
 */
export interface MemberAttendance {
  userId: string | null;
  memberName: string;
  totalEvents: number;
  attended: number;
  declined: number;
  waiting: number;
  unknown: number;
  attendanceRate: number;
  trend: TrendDirection;
  patterns: string[];
}

/**
 * Orchestra attendance summary
 */
export interface OrchestraAttendance {
  orchestraId: string;
  orchestraName: string;
  totalEvents: number;
  averageAttendance: number;
  averageAttendanceRate: number;
  trend: TrendDirection;
}

/**
 * Attendance trend data point
 */
export interface TrendDataPoint {
  date: string;
  totalMembers: number;
  attended: number;
  declined: number;
  attendanceRate: number;
}

/**
 * Absence pattern
 */
export interface AbsencePattern {
  pattern: string;
  patternType: 'day_of_week' | 'time_period' | 'frequency';
  memberCount: number;
  members: { userId: string | null; memberName: string; occurrences: number }[];
}

/**
 * Period comparison data
 */
export interface PeriodComparison {
  currentPeriod: {
    label: string;
    startDate: string;
    endDate: string;
    totalEvents: number;
    averageAttendanceRate: number;
  };
  previousPeriod: {
    label: string;
    startDate: string;
    endDate: string;
    totalEvents: number;
    averageAttendanceRate: number;
  };
  change: number;
  trend: TrendDirection;
}

/**
 * Overview statistics
 */
export interface AttendanceOverview {
  totalRehearsals: number;
  totalConcerts: number;
  averageRehearsalAttendance: number;
  averageConcertAttendance: number;
  overallAttendanceRate: number;
  trend: TrendDirection;
  periodComparison: PeriodComparison;
}

/**
 * Date range filter
 */
export interface DateRange {
  startDate?: string;
  endDate?: string;
}

/**
 * Day of week names
 */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Calculate trend direction based on two values
 */
function calculateTrend(current: number, previous: number): TrendDirection {
  const difference = current - previous;
  const threshold = 5; // 5% threshold for stable

  if (difference > threshold) {
    return 'improving';
  } else if (difference < -threshold) {
    return 'declining';
  }
  return 'stable';
}

/**
 * Get date range strings for a period
 */
function getDateRange(
  period: 'week' | 'month' | 'quarter' | 'year',
  offset: number = 0,
): { startDate: string; endDate: string } {
  const now = new Date();
  let startDate: Date;
  let endDate: Date;

  switch (period) {
    case 'week':
      endDate = new Date(now);
      endDate.setDate(endDate.getDate() - offset * 7);
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'month':
      endDate = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0);
      startDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      break;
    case 'quarter': {
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const targetQuarter = currentQuarter - offset;
      const year = now.getFullYear() + Math.floor(targetQuarter / 4);
      const quarter = ((targetQuarter % 4) + 4) % 4;
      startDate = new Date(year, quarter * 3, 1);
      endDate = new Date(year, quarter * 3 + 3, 0);
      break;
    }
    case 'year': {
      const targetYear = now.getFullYear() - offset;
      startDate = new Date(targetYear, 0, 1);
      endDate = new Date(targetYear, 11, 31);
      break;
    }
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
}

/**
 * Get attendance overview statistics
 */
export function getAttendanceOverview(
  associationId: string,
  orchestraId?: string,
  dateRange?: DateRange,
): AttendanceOverview {
  const now = new Date();
  const defaultStartDate = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split('T')[0];
  const defaultEndDate = now.toISOString().split('T')[0];

  const startDate = dateRange?.startDate || defaultStartDate;
  const endDate = dateRange?.endDate || defaultEndDate;

  // Calculate previous period
  const periodLength = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
  const prevEndDate = new Date(new Date(startDate).getTime() - 1000 * 60 * 60 * 24).toISOString().split('T')[0];
  const prevStartDate = new Date(new Date(prevEndDate).getTime() - periodLength * 1000 * 60 * 60 * 24)
    .toISOString()
    .split('T')[0];

  // Build query for rehearsals
  let rehearsalQuery = `
        SELECT
            COUNT(DISTINCT r.id) as total_rehearsals,
            AVG(CASE WHEN ra.status = 'accepted' THEN 1 ELSE 0 END) * 100 as avg_attendance_rate
        FROM rehearsals r
        LEFT JOIN rehearsal_attendance ra ON r.id = ra.rehearsal_id
        WHERE r.association_id = ?
        AND r.date >= ? AND r.date <= ?
        AND r.type != 'cancelled'
    `;
  const rehearsalParams: (string | null)[] = [associationId, startDate, endDate];

  if (orchestraId) {
    rehearsalQuery += ' AND (r.orchestra_id = ? OR r.orchestra_id IS NULL)';
    rehearsalParams.push(orchestraId);
  }

  const rehearsalStats = db.prepare(rehearsalQuery).get(...rehearsalParams) as {
    total_rehearsals: number;
    avg_attendance_rate: number | null;
  };

  // Build query for concerts
  const concertQuery = `
        SELECT
            COUNT(DISTINCT c.id) as total_concerts
        FROM concerts c
        WHERE c.association_id = ?
        AND c.date >= ? AND c.date <= ?
    `;
  // Een concert hangt in dit schema niet aan een orkest: concerts heeft geen
  // orchestra_id. Filteren op orkest kan hier dus niet, en gebeurt alleen bij
  // de repetities hierboven.
  const concertParams: (string | null)[] = [associationId, startDate, endDate];

  const concertStats = db.prepare(concertQuery).get(...concertParams) as {
    total_concerts: number;
  };

  // Get concert attendance count
  const concertAttendanceQuery = `
        SELECT
            COUNT(DISTINCT ca.user_id) as avg_attendance
        FROM concert_attendance ca
        JOIN concerts c ON ca.concert_id = c.id
        WHERE c.association_id = ?
        AND c.date >= ? AND c.date <= ?
    `;
  const concertAttendance = db.prepare(concertAttendanceQuery).get(...concertParams) as {
    avg_attendance: number;
  };

  // Calculate previous period stats for comparison
  const prevRehearsalQuery = rehearsalQuery.replace(
    'AND r.date >= ? AND r.date <= ?',
    'AND r.date >= ? AND r.date <= ?',
  );
  const prevRehearsalParams = [...rehearsalParams];
  prevRehearsalParams[1] = prevStartDate;
  prevRehearsalParams[2] = prevEndDate;

  const prevRehearsalStats = db.prepare(prevRehearsalQuery).get(...prevRehearsalParams) as {
    total_rehearsals: number;
    avg_attendance_rate: number | null;
  };

  const currentRate = rehearsalStats.avg_attendance_rate || 0;
  const previousRate = prevRehearsalStats.avg_attendance_rate || 0;

  return {
    totalRehearsals: rehearsalStats.total_rehearsals || 0,
    totalConcerts: concertStats.total_concerts || 0,
    averageRehearsalAttendance: Math.round(currentRate),
    averageConcertAttendance: concertAttendance.avg_attendance || 0,
    overallAttendanceRate: Math.round(currentRate),
    trend: calculateTrend(currentRate, previousRate),
    periodComparison: {
      currentPeriod: {
        label: 'Current period',
        startDate,
        endDate,
        totalEvents: rehearsalStats.total_rehearsals || 0,
        averageAttendanceRate: Math.round(currentRate),
      },
      previousPeriod: {
        label: 'Previous period',
        startDate: prevStartDate,
        endDate: prevEndDate,
        totalEvents: prevRehearsalStats.total_rehearsals || 0,
        averageAttendanceRate: Math.round(previousRate),
      },
      change: Math.round(currentRate - previousRate),
      trend: calculateTrend(currentRate, previousRate),
    },
  };
}

/**
 * Get attendance trends over time
 */
export function getAttendanceTrends(
  associationId: string,
  orchestraId?: string,
  dateRange?: DateRange,
  groupBy: 'day' | 'week' | 'month' = 'week',
): TrendDataPoint[] {
  const now = new Date();
  const defaultStartDate = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split('T')[0];
  const defaultEndDate = now.toISOString().split('T')[0];

  const startDate = dateRange?.startDate || defaultStartDate;
  const endDate = dateRange?.endDate || defaultEndDate;

  let dateFormat: string;
  switch (groupBy) {
    case 'day':
      dateFormat = '%Y-%m-%d';
      break;
    case 'week':
      dateFormat = '%Y-W%W';
      break;
    case 'month':
      dateFormat = '%Y-%m';
      break;
  }

  let query = `
        SELECT
            strftime('${dateFormat}', r.date) as period,
            COUNT(DISTINCT ra.id) as total_members,
            SUM(CASE WHEN ra.status = 'accepted' THEN 1 ELSE 0 END) as attended,
            SUM(CASE WHEN ra.status = 'declined' THEN 1 ELSE 0 END) as declined
        FROM rehearsals r
        LEFT JOIN rehearsal_attendance ra ON r.id = ra.rehearsal_id
        WHERE r.association_id = ?
        AND r.date >= ? AND r.date <= ?
        AND r.type != 'cancelled'
    `;
  const params: (string | null)[] = [associationId, startDate, endDate];

  if (orchestraId) {
    query += ' AND (r.orchestra_id = ? OR r.orchestra_id IS NULL)';
    params.push(orchestraId);
  }

  query += ` GROUP BY strftime('${dateFormat}', r.date) ORDER BY period`;

  const rows = db.prepare(query).all(...params) as {
    period: string;
    total_members: number;
    attended: number;
    declined: number;
  }[];

  return rows.map((row) => ({
    date: row.period,
    totalMembers: row.total_members,
    attended: row.attended,
    declined: row.declined,
    attendanceRate: row.total_members > 0 ? Math.round((row.attended / row.total_members) * 100) : 0,
  }));
}

/**
 * Get per-member attendance breakdown
 */
export function getMemberAttendance(
  associationId: string,
  orchestraId?: string,
  dateRange?: DateRange,
): MemberAttendance[] {
  const now = new Date();
  const defaultStartDate = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split('T')[0];
  const defaultEndDate = now.toISOString().split('T')[0];

  const startDate = dateRange?.startDate || defaultStartDate;
  const endDate = dateRange?.endDate || defaultEndDate;

  // Calculate previous period for trend
  const periodLength = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
  const prevEndDate = new Date(new Date(startDate).getTime() - 1000 * 60 * 60 * 24).toISOString().split('T')[0];
  const prevStartDate = new Date(new Date(prevEndDate).getTime() - periodLength * 1000 * 60 * 60 * 24)
    .toISOString()
    .split('T')[0];

  // Current period query
  let query = `
        SELECT
            ra.user_id,
            ra.member_name,
            COUNT(*) as total_events,
            SUM(CASE WHEN ra.status = 'accepted' THEN 1 ELSE 0 END) as attended,
            SUM(CASE WHEN ra.status = 'declined' THEN 1 ELSE 0 END) as declined,
            SUM(CASE WHEN ra.status = 'waiting' THEN 1 ELSE 0 END) as waiting,
            SUM(CASE WHEN ra.status = 'unknown' THEN 1 ELSE 0 END) as unknown
        FROM rehearsal_attendance ra
        JOIN rehearsals r ON ra.rehearsal_id = r.id
        WHERE r.association_id = ?
        AND r.date >= ? AND r.date <= ?
        AND r.type != 'cancelled'
    `;
  const params: (string | null)[] = [associationId, startDate, endDate];

  if (orchestraId) {
    query += ' AND (r.orchestra_id = ? OR r.orchestra_id IS NULL)';
    params.push(orchestraId);
  }

  query += ' GROUP BY COALESCE(ra.user_id, ra.member_name), ra.member_name ORDER BY attended DESC';

  const currentRows = db.prepare(query).all(...params) as {
    user_id: string | null;
    member_name: string;
    total_events: number;
    attended: number;
    declined: number;
    waiting: number;
    unknown: number;
  }[];

  // Previous period query for trend calculation
  const prevParams = [...params];
  prevParams[1] = prevStartDate;
  prevParams[2] = prevEndDate;

  const prevRows = db.prepare(query).all(...prevParams) as {
    user_id: string | null;
    member_name: string;
    total_events: number;
    attended: number;
    declined: number;
    waiting: number;
    unknown: number;
  }[];

  // Create a map of previous attendance rates
  const prevRates = new Map<string, number>();
  prevRows.forEach((row) => {
    const key = row.user_id || row.member_name;
    const rate = row.total_events > 0 ? (row.attended / row.total_events) * 100 : 0;
    prevRates.set(key, rate);
  });

  // Get absence patterns for each member
  const patterns = getAbsencePatterns(associationId, orchestraId, dateRange);
  const memberPatterns = new Map<string, string[]>();

  patterns.forEach((pattern) => {
    pattern.members.forEach((member) => {
      const key = member.userId || member.memberName;
      if (!memberPatterns.has(key)) {
        memberPatterns.set(key, []);
      }
      memberPatterns.get(key)!.push(pattern.pattern);
    });
  });

  return currentRows.map((row) => {
    const key = row.user_id || row.member_name;
    const currentRate = row.total_events > 0 ? (row.attended / row.total_events) * 100 : 0;
    const prevRate = prevRates.get(key) || 0;

    return {
      userId: row.user_id,
      memberName: row.member_name,
      totalEvents: row.total_events,
      attended: row.attended,
      declined: row.declined,
      waiting: row.waiting,
      unknown: row.unknown,
      attendanceRate: Math.round(currentRate),
      trend: calculateTrend(currentRate, prevRate),
      patterns: memberPatterns.get(key) || [],
    };
  });
}

/**
 * Get per-orchestra attendance breakdown
 */
export function getOrchestraAttendance(associationId: string, dateRange?: DateRange): OrchestraAttendance[] {
  const now = new Date();
  const defaultStartDate = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split('T')[0];
  const defaultEndDate = now.toISOString().split('T')[0];

  const startDate = dateRange?.startDate || defaultStartDate;
  const endDate = dateRange?.endDate || defaultEndDate;

  // Calculate previous period for trend
  const periodLength = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
  const prevEndDate = new Date(new Date(startDate).getTime() - 1000 * 60 * 60 * 24).toISOString().split('T')[0];
  const prevStartDate = new Date(new Date(prevEndDate).getTime() - periodLength * 1000 * 60 * 60 * 24)
    .toISOString()
    .split('T')[0];

  const query = `
        SELECT
            o.id as orchestra_id,
            o.name as orchestra_name,
            COUNT(DISTINCT r.id) as total_events,
            AVG(
                CASE
                    WHEN (SELECT COUNT(*) FROM rehearsal_attendance WHERE rehearsal_id = r.id) > 0
                    THEN (
                        SELECT COUNT(*) * 100.0 / (SELECT COUNT(*) FROM rehearsal_attendance WHERE rehearsal_id = r.id)
                        FROM rehearsal_attendance
                        WHERE rehearsal_id = r.id AND status = 'accepted'
                    )
                    ELSE 0
                END
            ) as avg_attendance_rate,
            (
                SELECT AVG(cnt) FROM (
                    SELECT COUNT(*) as cnt
                    FROM rehearsal_attendance ra2
                    JOIN rehearsals r2 ON ra2.rehearsal_id = r2.id
                    WHERE r2.orchestra_id = o.id
                    AND ra2.status = 'accepted'
                    AND r2.date >= ? AND r2.date <= ?
                    GROUP BY r2.id
                )
            ) as avg_attendance
        FROM orchestras o
        LEFT JOIN rehearsals r ON (r.orchestra_id = o.id OR r.orchestra_id IS NULL)
            AND r.association_id = o.association_id
            AND r.date >= ? AND r.date <= ?
            AND r.type != 'cancelled'
        WHERE o.association_id = ?
        GROUP BY o.id, o.name
        ORDER BY avg_attendance_rate DESC
    `;

  const currentRows = db.prepare(query).all(startDate, endDate, startDate, endDate, associationId) as {
    orchestra_id: string;
    orchestra_name: string;
    total_events: number;
    avg_attendance_rate: number | null;
    avg_attendance: number | null;
  }[];

  // Previous period query
  const prevRows = db.prepare(query).all(prevStartDate, prevEndDate, prevStartDate, prevEndDate, associationId) as {
    orchestra_id: string;
    orchestra_name: string;
    total_events: number;
    avg_attendance_rate: number | null;
    avg_attendance: number | null;
  }[];

  const prevRates = new Map<string, number>();
  prevRows.forEach((row) => {
    prevRates.set(row.orchestra_id, row.avg_attendance_rate || 0);
  });

  return currentRows.map((row) => {
    const currentRate = row.avg_attendance_rate || 0;
    const prevRate = prevRates.get(row.orchestra_id) || 0;

    return {
      orchestraId: row.orchestra_id,
      orchestraName: row.orchestra_name,
      totalEvents: row.total_events || 0,
      averageAttendance: Math.round(row.avg_attendance || 0),
      averageAttendanceRate: Math.round(currentRate),
      trend: calculateTrend(currentRate, prevRate),
    };
  });
}

/**
 * Find common absence patterns
 */
export function getAbsencePatterns(
  associationId: string,
  orchestraId?: string,
  dateRange?: DateRange,
): AbsencePattern[] {
  const now = new Date();
  const defaultStartDate = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split('T')[0];
  const defaultEndDate = now.toISOString().split('T')[0];

  const startDate = dateRange?.startDate || defaultStartDate;
  const endDate = dateRange?.endDate || defaultEndDate;

  const patterns: AbsencePattern[] = [];

  // Pattern 1: Day of week absences
  let dayQuery = `
        SELECT
            ra.user_id,
            ra.member_name,
            CAST(strftime('%w', r.date) AS INTEGER) as day_of_week,
            COUNT(*) as absences
        FROM rehearsal_attendance ra
        JOIN rehearsals r ON ra.rehearsal_id = r.id
        WHERE r.association_id = ?
        AND r.date >= ? AND r.date <= ?
        AND r.type != 'cancelled'
        AND ra.status = 'declined'
    `;
  const dayParams: (string | null)[] = [associationId, startDate, endDate];

  if (orchestraId) {
    dayQuery += ' AND (r.orchestra_id = ? OR r.orchestra_id IS NULL)';
    dayParams.push(orchestraId);
  }

  dayQuery += ' GROUP BY ra.user_id, ra.member_name, day_of_week HAVING COUNT(*) >= 3';

  const dayRows = db.prepare(dayQuery).all(...dayParams) as {
    user_id: string | null;
    member_name: string;
    day_of_week: number;
    absences: number;
  }[];

  // Group by day of week
  const dayGroups = new Map<number, { userId: string | null; memberName: string; occurrences: number }[]>();
  dayRows.forEach((row) => {
    if (!dayGroups.has(row.day_of_week)) {
      dayGroups.set(row.day_of_week, []);
    }
    dayGroups.get(row.day_of_week)!.push({
      userId: row.user_id,
      memberName: row.member_name,
      occurrences: row.absences,
    });
  });

  dayGroups.forEach((members, dayOfWeek) => {
    if (members.length > 0) {
      patterns.push({
        pattern: `Often absent on ${DAY_NAMES[dayOfWeek]}s`,
        patternType: 'day_of_week',
        memberCount: members.length,
        members: members.sort((a, b) => b.occurrences - a.occurrences),
      });
    }
  });

  // Pattern 2: High absence frequency
  let freqQuery = `
        SELECT
            ra.user_id,
            ra.member_name,
            COUNT(*) as total,
            SUM(CASE WHEN ra.status = 'declined' THEN 1 ELSE 0 END) as declined
        FROM rehearsal_attendance ra
        JOIN rehearsals r ON ra.rehearsal_id = r.id
        WHERE r.association_id = ?
        AND r.date >= ? AND r.date <= ?
        AND r.type != 'cancelled'
    `;
  const freqParams: (string | null)[] = [associationId, startDate, endDate];

  if (orchestraId) {
    freqQuery += ' AND (r.orchestra_id = ? OR r.orchestra_id IS NULL)';
    freqParams.push(orchestraId);
  }

  freqQuery += ' GROUP BY ra.user_id, ra.member_name HAVING (declined * 1.0 / total) > 0.5 AND total >= 5';

  const freqRows = db.prepare(freqQuery).all(...freqParams) as {
    user_id: string | null;
    member_name: string;
    total: number;
    declined: number;
  }[];

  if (freqRows.length > 0) {
    patterns.push({
      pattern: 'Frequently absent (>50% of events)',
      patternType: 'frequency',
      memberCount: freqRows.length,
      members: freqRows
        .map((row) => ({
          userId: row.user_id,
          memberName: row.member_name,
          occurrences: row.declined,
        }))
        .sort((a, b) => b.occurrences - a.occurrences),
    });
  }

  return patterns;
}

/**
 * Export attendance data to CSV format
 */
export function exportAttendanceToCSV(associationId: string, orchestraId?: string, dateRange?: DateRange): string {
  const now = new Date();
  const defaultStartDate = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split('T')[0];
  const defaultEndDate = now.toISOString().split('T')[0];

  const startDate = dateRange?.startDate || defaultStartDate;
  const endDate = dateRange?.endDate || defaultEndDate;

  // Get all rehearsals in range
  let rehearsalQuery = `
        SELECT r.id, r.date, r.start_time, r.end_time, r.location, r.type, o.name as orchestra_name
        FROM rehearsals r
        LEFT JOIN orchestras o ON r.orchestra_id = o.id
        WHERE r.association_id = ?
        AND r.date >= ? AND r.date <= ?
        AND r.type != 'cancelled'
    `;
  const params: (string | null)[] = [associationId, startDate, endDate];

  if (orchestraId) {
    rehearsalQuery += ' AND (r.orchestra_id = ? OR r.orchestra_id IS NULL)';
    params.push(orchestraId);
  }

  rehearsalQuery += ' ORDER BY r.date';

  const rehearsals = db.prepare(rehearsalQuery).all(...params) as {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    location: string | null;
    type: string;
    orchestra_name: string | null;
  }[];

  // Get attendance for each rehearsal
  const attendanceQuery = `
        SELECT ra.member_name, ra.status
        FROM rehearsal_attendance ra
        WHERE ra.rehearsal_id = ?
        ORDER BY ra.member_name
    `;

  // Collect all unique members
  const allMembers = new Set<string>();
  const rehearsalAttendance = new Map<string, Map<string, string>>();

  rehearsals.forEach((rehearsal) => {
    const attendance = db.prepare(attendanceQuery).all(rehearsal.id) as {
      member_name: string;
      status: string;
    }[];

    const attendanceMap = new Map<string, string>();
    attendance.forEach((a) => {
      allMembers.add(a.member_name);
      attendanceMap.set(a.member_name, a.status);
    });
    rehearsalAttendance.set(rehearsal.id, attendanceMap);
  });

  // Build CSV
  const members = Array.from(allMembers).sort();
  const headers = ['Date', 'Time', 'Location', 'Orchestra', 'Type', ...members];
  const rows: string[][] = [headers];

  rehearsals.forEach((rehearsal) => {
    const attendanceMap = rehearsalAttendance.get(rehearsal.id)!;
    const row = [
      rehearsal.date,
      `${rehearsal.start_time}-${rehearsal.end_time}`,
      rehearsal.location || '',
      rehearsal.orchestra_name || 'All',
      rehearsal.type,
      ...members.map((member) => {
        const status = attendanceMap.get(member);
        if (status === 'accepted') return 'Present';
        if (status === 'declined') return 'Absent';
        if (status === 'waiting') return 'Undecided';
        return 'Unknown';
      }),
    ];
    rows.push(row);
  });

  // Add summary row
  const summaryRow = [
    'SUMMARY',
    '',
    '',
    '',
    '',
    ...members.map((member) => {
      let attended = 0;
      let total = 0;
      rehearsals.forEach((rehearsal) => {
        const attendanceMap = rehearsalAttendance.get(rehearsal.id)!;
        if (attendanceMap.has(member)) {
          total++;
          if (attendanceMap.get(member) === 'accepted') {
            attended++;
          }
        }
      });
      return total > 0 ? `${Math.round((attended / total) * 100)}%` : 'N/A';
    }),
  ];
  rows.push(summaryRow);

  // Convert to CSV string
  return rows
    .map((row) =>
      row
        .map((cell) => {
          // Escape quotes and wrap in quotes if contains comma or quote
          if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        })
        .join(','),
    )
    .join('\n');
}

/**
 * Compare two periods
 */
export function comparePeriods(
  associationId: string,
  period: 'week' | 'month' | 'quarter' | 'year',
  orchestraId?: string,
): PeriodComparison {
  const current = getDateRange(period, 0);
  const previous = getDateRange(period, 1);

  // Get attendance stats for current period
  let currentQuery = `
        SELECT
            COUNT(DISTINCT r.id) as total_events,
            AVG(CASE WHEN ra.status = 'accepted' THEN 1 ELSE 0 END) * 100 as avg_rate
        FROM rehearsals r
        LEFT JOIN rehearsal_attendance ra ON r.id = ra.rehearsal_id
        WHERE r.association_id = ?
        AND r.date >= ? AND r.date <= ?
        AND r.type != 'cancelled'
    `;
  const currentParams: (string | null)[] = [associationId, current.startDate, current.endDate];

  if (orchestraId) {
    currentQuery += ' AND (r.orchestra_id = ? OR r.orchestra_id IS NULL)';
    currentParams.push(orchestraId);
  }

  const currentStats = db.prepare(currentQuery).get(...currentParams) as {
    total_events: number;
    avg_rate: number | null;
  };

  // Get attendance stats for previous period
  const previousParams: (string | null)[] = [associationId, previous.startDate, previous.endDate];
  if (orchestraId) {
    previousParams.push(orchestraId);
  }

  const previousStats = db.prepare(currentQuery).get(...previousParams) as {
    total_events: number;
    avg_rate: number | null;
  };

  const currentRate = currentStats.avg_rate || 0;
  const previousRate = previousStats.avg_rate || 0;

  const periodLabels: Record<string, string> = {
    week: 'This week vs last week',
    month: 'This month vs last month',
    quarter: 'This quarter vs last quarter',
    year: 'This year vs last year',
  };

  return {
    currentPeriod: {
      label: `Current ${period}`,
      startDate: current.startDate,
      endDate: current.endDate,
      totalEvents: currentStats.total_events || 0,
      averageAttendanceRate: Math.round(currentRate),
    },
    previousPeriod: {
      label: `Previous ${period}`,
      startDate: previous.startDate,
      endDate: previous.endDate,
      totalEvents: previousStats.total_events || 0,
      averageAttendanceRate: Math.round(previousRate),
    },
    change: Math.round(currentRate - previousRate),
    trend: calculateTrend(currentRate, previousRate),
  };
}
