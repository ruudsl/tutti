import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { getAuditLogs } from '../api';
import { SkeletonTableRow } from '../components/Skeleton';
import { Pagination } from '../components/Pagination';
import { FormField } from '../components/FormField';
import { Icon, type IconName } from '../components/Icon';

const ACTION_ICONS: Record<string, IconName> = {
  create: 'plus',
  update: 'pencil',
  delete: 'trash',
  login: 'lock',
  logout: 'logout',
  upload: 'upload',
  download: 'download',
  share: 'link',
  restore: 'refresh',
};

export default function AuditLogs() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.auditLogs');

  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // React Query for audit logs
  const { data, isLoading, error } = useQuery({
    queryKey: ['auditLogs', page, pageSize, actionFilter, entityFilter, userFilter, dateFrom, dateTo],
    queryFn: () =>
      getAuditLogs({
        page,
        pageSize,
        action: actionFilter || undefined,
        entityType: entityFilter || undefined,
        userId: userFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    staleTime: 30 * 1000, // 30 seconds for logs
  });

  const logs = data?.logs || [];
  const total = data?.total || 0;

  const totalPages = Math.ceil(total / pageSize);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const getActionIcon = (action: string): IconName => {
    return ACTION_ICONS[action] || 'clipboard';
  };

  /**
   * De server geeft `changes` al geparsed terug - routes/audit-logs.ts doet
   * `JSON.parse` voordat het antwoord de deur uit gaat. Hier stond nog een
   * tweede JSON.parse overheen, en die kan een object niet aan: JSON.parse
   * dwingt zijn argument eerst naar tekst af, een object wordt
   * "[object Object]", en daar slaat hij op af. De catch viel dan terug op het
   * kale object in een span, waar React de hele pagina op omgooit - niet alleen
   * die ene rij.
   *
   * Beide vormen worden nu verdragen: het object dat de server werkelijk
   * stuurt, en tekst die nog JSON is.
   */
  const formatChanges = (changes?: unknown) => {
    if (changes === null || changes === undefined || changes === '') return null;

    const ontleed = (): unknown => {
      if (typeof changes !== 'string') return changes;
      try {
        return JSON.parse(changes);
      } catch {
        // Geen JSON: dan is het gewone tekst en tonen we die zoals hij is.
        return undefined;
      }
    };

    const inhoud = ontleed();
    if (inhoud === undefined) {
      return <span className="text-light text-sm">{String(changes)}</span>;
    }

    return (
      <details className="audit-changes">
        <summary>{t('auditLogs.viewChanges')}</summary>
        <pre>{JSON.stringify(inhoud, null, 2)}</pre>
      </details>
    );
  };

  return (
    <div className="page">
      <h1>{t('auditLogs.title')}</h1>
      <p className="text-light mb-3">{t('auditLogs.description')}</p>

      {/* Filters */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="filter-bar">
            <FormField label={t('auditLogs.filterAction')}>
              <select
                className="form-control form-select"
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t('common.all')}</option>
                <option value="create">{t('auditLogs.actions.create')}</option>
                <option value="update">{t('auditLogs.actions.update')}</option>
                <option value="delete">{t('auditLogs.actions.delete')}</option>
                <option value="login">{t('auditLogs.actions.login')}</option>
                <option value="logout">{t('auditLogs.actions.logout')}</option>
                <option value="upload">{t('auditLogs.actions.upload')}</option>
                <option value="download">{t('auditLogs.actions.download')}</option>
              </select>
            </FormField>

            <FormField label={t('auditLogs.filterEntity')}>
              <select
                className="form-control form-select"
                value={entityFilter}
                onChange={(e) => {
                  setEntityFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t('common.all')}</option>
                <option value="user">{t('auditLogs.entities.user')}</option>
                <option value="music_piece">{t('auditLogs.entities.musicPiece')}</option>
                <option value="music_title">{t('auditLogs.entities.musicTitle')}</option>
                <option value="music_list">{t('auditLogs.entities.musicList')}</option>
                <option value="orchestra">{t('auditLogs.entities.orchestra')}</option>
                <option value="instrument">{t('auditLogs.entities.instrument')}</option>
                <option value="rehearsal">{t('auditLogs.entities.rehearsal')}</option>
                <option value="concert">{t('auditLogs.entities.concert')}</option>
              </select>
            </FormField>

            <FormField label={t('auditLogs.dateFrom')}>
              <input
                type="date"
                className="form-control"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
              />
            </FormField>

            <FormField label={t('auditLogs.dateTo')}>
              <input
                type="date"
                className="form-control"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
              />
            </FormField>

            <div className="form-group" style={{ alignSelf: 'flex-end' }}>
              <button
                className="btn btn-outline"
                onClick={() => {
                  setActionFilter('');
                  setEntityFilter('');
                  setUserFilter('');
                  setDateFrom('');
                  setDateTo('');
                  setPage(1);
                }}
              >
                {t('auditLogs.clearFilters')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            {t('auditLogs.results')}
            <span className="badge badge-secondary badge-title-count">{total}</span>
          </h2>
        </div>
        <div className="card-body flush">
          {error && <div className="alert alert-danger">{t('auditLogs.errorLoading')}</div>}

          {isLoading ? (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('auditLogs.table.date')}</th>
                  <th>{t('auditLogs.table.user')}</th>
                  <th>{t('auditLogs.table.action')}</th>
                  <th>{t('auditLogs.table.entity')}</th>
                  <th>{t('auditLogs.table.details')}</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map((i) => (
                  <SkeletonTableRow key={i} columns={5} />
                ))}
              </tbody>
            </table>
          ) : logs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <Icon name="clipboard" size={48} />
              </div>
              <p>{t('auditLogs.noLogs')}</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('auditLogs.table.date')}</th>
                  <th>{t('auditLogs.table.user')}</th>
                  <th>{t('auditLogs.table.action')}</th>
                  <th>{t('auditLogs.table.entity')}</th>
                  <th>{t('auditLogs.table.details')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-nowrap text-sm">{formatDate(log.createdAt)}</td>
                    <td>{log.userName}</td>
                    <td>
                      <span className="audit-action">
                        <Icon name={getActionIcon(log.action)} size={16} />
                        {t(`auditLogs.actions.${log.action}`, { defaultValue: log.action })}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-secondary">
                        {t(`auditLogs.entities.${log.entityType}`, { defaultValue: log.entityType })}
                      </span>
                      {log.entityName && <span className="ml-1 text-sm">{log.entityName}</span>}
                    </td>
                    <td>{formatChanges(log.changes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}
    </div>
  );
}
