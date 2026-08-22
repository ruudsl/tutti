/** De kaart waarop je je eigen aanwezigheid doorgeeft. Letterlijk overgenomen uit Rehearsals.tsx. */

import { useTranslation } from 'react-i18next';

export function MyAttendanceCard({
  myAttendanceStatus,
  handleUpdateMyAttendance,
  isUpdatingAttendance,
  canSyncToSpond,
}: {
  myAttendanceStatus: string;
  handleUpdateMyAttendance: (accepted: boolean) => void;
  isUpdatingAttendance: boolean;
  canSyncToSpond: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="card mb-3">
      <div className="card-header">
        <h2 className="card-title">{t('rehearsals.attendance.myAttendance')}</h2>
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>{t('rehearsals.attendance.currentStatus')}:</span>
            <span
              className={`badge badge-${myAttendanceStatus === 'accepted' ? 'success' : myAttendanceStatus === 'declined' ? 'danger' : 'secondary'}`}
            >
              {t(`rehearsals.attendance.statuses.${myAttendanceStatus}`)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={`btn ${myAttendanceStatus === 'accepted' ? 'btn-success' : 'btn-outline'} btn-sm`}
              onClick={() => handleUpdateMyAttendance(true)}
              disabled={isUpdatingAttendance || myAttendanceStatus === 'accepted'}
              style={
                myAttendanceStatus === 'accepted'
                  ? { backgroundColor: 'var(--success)', borderColor: 'var(--success)', color: 'white' }
                  : {}
              }
            >
              {isUpdatingAttendance ? '...' : t('rehearsals.attendance.accept')}
            </button>
            <button
              className={`btn ${myAttendanceStatus === 'declined' ? 'btn-danger' : 'btn-outline'} btn-sm`}
              onClick={() => handleUpdateMyAttendance(false)}
              disabled={isUpdatingAttendance || myAttendanceStatus === 'declined'}
              style={
                myAttendanceStatus === 'declined'
                  ? { backgroundColor: 'var(--danger)', borderColor: 'var(--danger)', color: 'white' }
                  : {}
              }
            >
              {isUpdatingAttendance ? '...' : t('rehearsals.attendance.decline')}
            </button>
          </div>
          {canSyncToSpond && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
              {t('rehearsals.attendance.willSyncToSpond')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
