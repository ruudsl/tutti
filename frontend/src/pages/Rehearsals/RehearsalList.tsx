/** De lijst met komende repetities. Letterlijk overgenomen uit Rehearsals.tsx. */

import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/Icon';
import { ResponsiveTable, ColumnDefinition } from '../../components/ResponsiveTable';
import { Tooltip } from '../../components/Tooltip';
import type { Holiday } from '../../api';
import type { Rehearsal } from '../../types';
import { formatDate, getTypeStyle } from './hulpfuncties';

export function RehearsalList({
  upcoming,
  isManager,
  getHolidayForDate,
  handleOpenDetail,
  handleEdit,
  setDeletingRehearsalId,
}: {
  upcoming: Rehearsal[];
  isManager: boolean | null;
  getHolidayForDate: (date: string) => Holiday | undefined;
  handleOpenDetail: (id: string) => void;
  handleEdit: (r: Rehearsal) => void;
  setDeletingRehearsalId: (id: string | null) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          {t('rehearsals.upcoming')} ({upcoming.length})
        </h2>
      </div>
      <div className="card-body flush">
        <ResponsiveTable<Rehearsal>
          data={upcoming}
          keyExtractor={(r) => r.id}
          emptyMessage={t('rehearsals.noRehearsals')}
          emptyIcon="calendar"
          hoverable
          onRowClick={(r) => handleOpenDetail(r.id)}
          columns={[
            {
              id: 'date',
              header: t('rehearsals.date'),
              accessor: (r) => {
                const holiday = getHolidayForDate(r.date);
                return (
                  <div style={getTypeStyle(r.type)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong>{formatDate(r.date, t)}</strong>
                      {holiday && (
                        <Tooltip content={t('holidays.rehearsalInHoliday', { name: holiday.name })} position="top">
                          <span
                            style={{
                              backgroundColor: 'var(--warning)',
                              color: 'white',
                              padding: '0.1rem 0.3rem',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '0.65rem',
                              fontWeight: 500,
                            }}
                          >
                            {t('holidays.isHoliday')}
                          </span>
                        </Tooltip>
                      )}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                      {r.start_time} - {r.end_time}
                    </div>
                  </div>
                );
              },
              priority: 1,
              showInCard: true,
            },
            {
              id: 'location',
              header: t('rehearsals.location'),
              accessor: (r) => r.location || '-',
              priority: 2,
              hideOnMobile: true,
            },
            {
              id: 'orchestra',
              header: t('rehearsals.orchestra'),
              accessor: (r) => r.orchestra_name || t('rehearsals.allOrchestras'),
              priority: 3,
              hideOnMobile: true,
            },
            {
              id: 'type',
              header: t('rehearsals.type'),
              accessor: (r) =>
                r.type !== 'regular' ? (
                  <span
                    className={`badge badge-${r.type === 'extra' ? 'warning' : 'danger'}`}
                    style={{ fontSize: '0.7rem' }}
                  >
                    {t(`rehearsals.types.${r.type}`)}
                  </span>
                ) : (
                  <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
                    {t('rehearsals.types.regular')}
                  </span>
                ),
              priority: 4,
              hideOnMobile: true,
            },
            {
              id: 'pieces',
              header: t('rehearsals.pieces'),
              accessor: (r) =>
                r.piece_count > 0 ? (
                  <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>
                    {r.piece_count}
                  </span>
                ) : (
                  '-'
                ),
              priority: 5,
              hideOnMobile: true,
              align: 'center',
            },
            {
              id: 'attendance',
              header: t('rehearsals.attendance.title'),
              accessor: (r) =>
                r.accepted_count > 0 || r.declined_count > 0 ? (
                  <span style={{ fontSize: '0.75rem' }}>
                    <span
                      style={{
                        color: 'var(--success)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.15rem',
                      }}
                    >
                      <Icon name="check" size={12} />
                      {r.accepted_count}
                    </span>{' '}
                    <span
                      style={{
                        color: 'var(--danger)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.15rem',
                      }}
                    >
                      <Icon name="close" size={12} />
                      {r.declined_count}
                    </span>
                  </span>
                ) : (
                  '-'
                ),
              priority: 3,
              hideOnMobile: true,
              align: 'center',
            },
            ...(isManager
              ? ([
                  {
                    id: 'actions',
                    header: t('common.actions'),
                    accessor: (r: Rehearsal): ReactNode => (
                      <div
                        style={{ display: 'flex', gap: '0.25rem' }}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        <Tooltip content={t('common.edit')} position="top">
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => handleEdit(r)}
                            style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
                            aria-label={t('common.edit')}
                          >
                            <Icon name="pencil" size={14} />
                          </button>
                        </Tooltip>
                        <Tooltip content={t('common.delete')} position="top">
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => setDeletingRehearsalId(r.id)}
                            style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', color: 'var(--danger)' }}
                            aria-label={t('common.delete')}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </Tooltip>
                      </div>
                    ),
                    priority: 1,
                    showInCard: false,
                    sortable: false,
                  },
                ] as ColumnDefinition<Rehearsal>[])
              : []),
          ]}
        />
      </div>
    </div>
  );
}
