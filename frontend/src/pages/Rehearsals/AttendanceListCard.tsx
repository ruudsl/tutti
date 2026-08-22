/** De kaart met wie er komt, in het detailscherm. Letterlijk overgenomen uit Rehearsals.tsx. */

import { useTranslation } from 'react-i18next';
import type { RehearsalDetail, SpondConfig } from '../../types';

export function AttendanceListCard({
  selectedRehearsal,
  isManager,
  spondConfig,
  isSyncing,
  handleSyncRehearsal,
}: {
  selectedRehearsal: RehearsalDetail;
  isManager: boolean | null;
  spondConfig: SpondConfig | null;
  isSyncing: boolean;
  handleSyncRehearsal: (rehearsalId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">{t('rehearsals.attendance.title')}</h2>
        {isManager && spondConfig?.configured && spondConfig.groupId && (
          <button
            className="btn btn-outline btn-sm"
            onClick={() => handleSyncRehearsal(selectedRehearsal.id)}
            disabled={isSyncing}
          >
            {isSyncing ? t('rehearsals.spond.syncing') : t('rehearsals.spond.syncNow')}
          </button>
        )}
      </div>
      <div className="card-body">
        {selectedRehearsal.attendance.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
            {selectedRehearsal.attendance.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor:
                      a.status === 'accepted'
                        ? 'var(--success)'
                        : a.status === 'declined'
                          ? 'var(--danger)'
                          : 'var(--secondary)',
                  }}
                />
                <span style={{ fontSize: '0.875rem' }}>{a.member_name}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="piece-meta">
            {spondConfig?.configured && spondConfig.groupId
              ? t('rehearsals.spond.syncNow')
              : t('rehearsals.spond.notConfigured')}
          </p>
        )}
      </div>
    </div>
  );
}
