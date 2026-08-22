/** Het dashboardtabblad. Letterlijk overgenomen uit Rehearsals.tsx. */

import AttendanceDashboard, {
  AttendanceMember as DashboardMember,
  RehearsalAttendance,
  AttendanceTrend,
  AttendanceFilters,
} from '../../components/AttendanceDashboard';
import type { AttendanceMember } from '../../api';
import type { Orchestra, Rehearsal } from '../../types';

export function DashboardTab({
  sortedAttendance,
  rehearsals,
  orchestras,
  setAttendanceFrom,
  setAttendanceTo,
  setAttendanceOrchestraId,
  attendanceLoading,
}: {
  sortedAttendance: AttendanceMember[];
  rehearsals: Rehearsal[];
  orchestras: Orchestra[];
  setAttendanceFrom: (waarde: string) => void;
  setAttendanceTo: (waarde: string) => void;
  setAttendanceOrchestraId: (waarde: string) => void;
  attendanceLoading: boolean;
}) {
  return (
    <AttendanceDashboard
      members={sortedAttendance.map(
        (m, i) =>
          ({
            id: m.spondMemberId || `member-${i}`,
            name: m.name,
            instrument: '',
            presentCount: m.accepted,
            absentCount: m.declined,
            attendanceRate: m.total > 0 ? (m.accepted / m.total) * 100 : 0,
          }) as DashboardMember,
      )}
      rehearsals={rehearsals.map(
        (r) =>
          ({
            id: r.id,
            date: r.date,
            totalMembers: r.accepted_count + r.declined_count,
            presentCount: r.accepted_count,
            absentCount: r.declined_count,
            attendanceRate:
              r.accepted_count + r.declined_count > 0
                ? (r.accepted_count / (r.accepted_count + r.declined_count)) * 100
                : 0,
          }) as RehearsalAttendance,
      )}
      trends={rehearsals.slice(0, 20).map(
        (r) =>
          ({
            date: r.date,
            attendanceRate:
              r.accepted_count + r.declined_count > 0
                ? (r.accepted_count / (r.accepted_count + r.declined_count)) * 100
                : 0,
            presentCount: r.accepted_count,
            totalMembers: r.accepted_count + r.declined_count,
          }) as AttendanceTrend,
      )}
      sections={orchestras.map((o) => o.name)}
      onFilterChange={(filters: AttendanceFilters) => {
        setAttendanceFrom(filters.dateFrom);
        setAttendanceTo(filters.dateTo);
        if (filters.section) {
          const orchestra = orchestras.find((o) => o.name === filters.section);
          setAttendanceOrchestraId(orchestra?.id || '');
        } else {
          setAttendanceOrchestraId('');
        }
      }}
      isLoading={attendanceLoading}
    />
  );
}
