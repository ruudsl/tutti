/** Het tabblad met het aanwezigheidsoverzicht. Letterlijk overgenomen uit Rehearsals.tsx. */

import { useTranslation } from 'react-i18next';
import { SkeletonTable } from '../../components/Skeleton';
import { FormField } from '../../components/FormField';
import type { AttendanceMember } from '../../api';
import type { Orchestra } from '../../types';

export function AttendanceTab({
  attendanceFrom,
  setAttendanceFrom,
  attendanceTo,
  setAttendanceTo,
  orchestras,
  attendanceOrchestraId,
  setAttendanceOrchestraId,
  attendanceRehearsalCount,
  attendanceLoading,
  sortedAttendance,
  attendanceSortBy,
  setAttendanceSortBy,
}: {
  attendanceFrom: string;
  setAttendanceFrom: (waarde: string) => void;
  attendanceTo: string;
  setAttendanceTo: (waarde: string) => void;
  orchestras: Orchestra[];
  attendanceOrchestraId: string;
  setAttendanceOrchestraId: (waarde: string) => void;
  attendanceRehearsalCount: number;
  attendanceLoading: boolean;
  sortedAttendance: AttendanceMember[];
  attendanceSortBy: 'name' | 'rate' | 'count';
  setAttendanceSortBy: (waarde: 'name' | 'rate' | 'count') => void;
}) {
  const { t } = useTranslation();

  return (
    <div>
      {/* Filters */}
      <div className="card mb-3">
        <div className="card-body">
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'end', flexWrap: 'wrap' }}>
            <FormField style={{ flex: 1, minWidth: '140px' }} label={t('rehearsals.attendance.from')}>
              <input
                type="date"
                className="form-control"
                value={attendanceFrom}
                onChange={(e) => setAttendanceFrom(e.target.value)}
              />
            </FormField>
            <FormField style={{ flex: 1, minWidth: '140px' }} label={t('rehearsals.attendance.to')}>
              <input
                type="date"
                className="form-control"
                value={attendanceTo}
                onChange={(e) => setAttendanceTo(e.target.value)}
              />
            </FormField>
            {orchestras.length > 0 && (
              <FormField style={{ flex: 1, minWidth: '160px' }} label={t('rehearsals.orchestra')}>
                <select
                  className="form-control form-select"
                  value={attendanceOrchestraId}
                  onChange={(e) => setAttendanceOrchestraId(e.target.value)}
                >
                  <option value="">{t('rehearsals.allOrchestras')}</option>
                  {orchestras.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
          </div>
          {attendanceRehearsalCount > 0 && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-light)' }}>
              {t('rehearsals.attendance.rehearsalCount', { count: attendanceRehearsalCount })}
            </div>
          )}
        </div>
      </div>

      {/* Attendance table */}
      {attendanceLoading ? (
        <SkeletonTable rows={8} columns={5} />
      ) : sortedAttendance.length === 0 ? (
        <p className="piece-meta" style={{ padding: '1rem' }}>
          {t('rehearsals.attendance.noData')}
        </p>
      ) : (
        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer' }} onClick={() => setAttendanceSortBy('name')}>
                    {t('rehearsals.attendance.name')} {attendanceSortBy === 'name' ? '▼' : ''}
                  </th>
                  <th style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => setAttendanceSortBy('count')}>
                    {t('rehearsals.attendance.present')} {attendanceSortBy === 'count' ? '▼' : ''}
                  </th>
                  <th style={{ textAlign: 'center' }}>{t('rehearsals.attendance.absent')}</th>
                  <th style={{ textAlign: 'center' }}>{t('rehearsals.attendance.unknown')}</th>
                  <th
                    style={{ cursor: 'pointer', textAlign: 'center', minWidth: '120px' }}
                    onClick={() => setAttendanceSortBy('rate')}
                  >
                    {t('rehearsals.attendance.percentage')} {attendanceSortBy === 'rate' ? '▼' : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedAttendance.map((member, i) => {
                  const rate = member.total > 0 ? Math.round((member.accepted / member.total) * 100) : 0;
                  return (
                    <tr key={member.spondMemberId || member.name + i}>
                      <td style={{ fontWeight: 500 }}>{member.name}</td>
                      <td style={{ textAlign: 'center', color: 'var(--success)' }}>{member.accepted}</td>
                      <td style={{ textAlign: 'center', color: 'var(--danger)' }}>{member.declined}</td>
                      <td style={{ textAlign: 'center', color: 'var(--text-light)' }}>{member.unknown}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                          <div
                            style={{
                              width: '60px',
                              height: '8px',
                              background: 'var(--border)',
                              borderRadius: '4px',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${rate}%`,
                                height: '100%',
                                background:
                                  rate >= 75
                                    ? 'var(--success)'
                                    : rate >= 50
                                      ? 'var(--warning, orange)'
                                      : 'var(--danger)',
                                borderRadius: '4px',
                              }}
                            />
                          </div>
                          <span style={{ fontSize: '0.8rem', fontWeight: 'bold', minWidth: '35px' }}>{rate}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
