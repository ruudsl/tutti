import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { getAuditLogs } from '../api';
import { SkeletonTableRow } from '../components/Skeleton';
import { Pagination } from '../components/Pagination';

interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName?: string;
  changes?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

const ACTION_ICONS: Record<string, string> = {
  create: '➕',
  update: '✏️',
  delete: '🗑️',
  login: '🔐',
  logout: '🚪',
  upload: '📤',
  download: '📥',
  share: '🔗',
  restore: '🔄',
};

export default function AuditLogs() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.auditLogs');

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    loadLogs();
  }, [page, actionFilter, entityFilter, userFilter, dateFrom, dateTo]);

  const loadLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response: AuditLogsResponse = await getAuditLogs({
        page,
        pageSize,
        action: actionFilter || undefined,
        entityType: entityFilter || undefined,
        userId: userFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setLogs(response.logs);
      setTotal(response.total);
    } catch (err) {
      setError(t('auditLogs.errorLoading'));
      console.error('Error loading audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const getActionIcon = (action: string) => {
    return ACTION_ICONS[action] || '📋';
  };

  const formatChanges = (changes?: string) => {
    if (!changes) return null;
    try {
      const parsed = JSON.parse(changes);
      return (
        <details className="audit-changes">
          <summary>{t('auditLogs.viewChanges')}</summary>
          <pre>{JSON.stringify(parsed, null, 2)}</pre>
        </details>
      );
    } catch {
      return <span className="text-light text-sm">{changes}</span>;
    }
  };

  return (
    <div>
      <h1 className="mb-3">{t('auditLogs.title')}</h1>
      <p className="text-light mb-3">{t('auditLogs.description')}</p>

      {/* Filters */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="filter-bar">
            <div className="form-group">
              <label className="form-label">{t('auditLogs.filterAction')}</label>
              <select
                className="form-control form-select"
                value={actionFilter}
                onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
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
            </div>

            <div className="form-group">
              <label className="form-label">{t('auditLogs.filterEntity')}</label>
              <select
                className="form-control form-select"
                value={entityFilter}
                onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
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
            </div>

            <div className="form-group">
              <label className="form-label">{t('auditLogs.dateFrom')}</label>
              <input
                type="date"
                className="form-control"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('auditLogs.dateTo')}</label>
              <input
                type="date"
                className="form-control"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              />
            </div>

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
          {error && (
            <div className="alert alert-danger">{error}</div>
          )}

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
              <div className="empty-icon">📋</div>
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
                    <td className="text-nowrap text-sm">
                      {formatDate(log.createdAt)}
                    </td>
                    <td>{log.userName}</td>
                    <td>
                      <span className="audit-action">
                        <span aria-hidden="true">{getActionIcon(log.action)}</span>
                        {t(`auditLogs.actions.${log.action}`, { defaultValue: log.action })}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-secondary">
                        {t(`auditLogs.entities.${log.entityType}`, { defaultValue: log.entityType })}
                      </span>
                      {log.entityName && (
                        <span className="ml-1 text-sm">{log.entityName}</span>
                      )}
                    </td>
                    <td>{formatChanges(log.changes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
