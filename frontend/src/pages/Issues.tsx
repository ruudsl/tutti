import { currentLocale } from '../utils/locale';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '../hooks/useConfirm';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icon';
import { getIssues, getMyIssues, getIssueStats, updateIssueStatus, deleteIssue, type PieceIssue } from '../api';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ROLES } from '../utils/constants';
import { Modal } from '../components/Modal';
import { FormField } from '../components/FormField';

const STATUS_COLORS: Record<string, string> = {
  open: 'badge-warning',
  in_review: 'badge-info',
  resolved: 'badge-success',
  rejected: 'badge-danger',
};

export default function Issues() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const confirmDialog = useConfirm();
  useDocumentTitle('pageTitle.issues');
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [selectedIssue, setSelectedIssue] = useState<PieceIssue | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const isMusicCommittee = user?.role === ROLES.MUSIC_COMMITTEE || user?.role === ROLES.ADMIN;

  // Fetch issues based on user role
  const { data: issues = [], isLoading: issuesLoading } = useQuery({
    queryKey: ['issues', filterStatus, isMusicCommittee],
    queryFn: () => (isMusicCommittee ? getIssues({ status: filterStatus || undefined }) : getMyIssues()),
  });

  // Fetch stats for music committee
  const { data: stats } = useQuery({
    queryKey: ['issue-stats'],
    queryFn: getIssueStats,
    enabled: isMusicCommittee,
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      updateIssueStatus(id, status, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['issue-stats'] });
      showSuccess(t('issues.statusUpdated'));
      setSelectedIssue(null);
      setResolutionNotes('');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('issues.errorUpdateStatus'));
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteIssue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['issue-stats'] });
      showSuccess(t('issues.deleted'));
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('issues.errorDelete'));
    },
  });

  const handleStatusChange = (issue: PieceIssue, newStatus: string) => {
    if (newStatus === 'resolved' || newStatus === 'rejected') {
      setSelectedIssue(issue);
      setResolutionNotes('');
    } else {
      updateStatusMutation.mutate({ id: issue.id, status: newStatus });
    }
  };

  const handleDelete = async (issue: PieceIssue) => {
    if (await confirmDialog(t('issues.confirmDelete'))) {
      deleteMutation.mutate(issue.id);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(currentLocale(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (issuesLoading) {
    return (
      <div>
        <h1>{t('issues.title')}</h1>
        <SkeletonTable rows={5} columns={6} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>
          {t('issues.title')}
          <span className="badge badge-primary badge-title-count">{issues.length}</span>
        </h1>
      </div>

      {isMusicCommittee && stats && (
        <div className="stat-card-grid">
          <div className="card">
            <div className="card-body stat-inline">
              <div className="stat-number" style={{ color: 'var(--warning)' }}>
                {stats.open}
              </div>
              <div className="stat-label">{t('issues.status.open')}</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body stat-inline">
              <div className="stat-number" style={{ color: 'var(--info)' }}>
                {stats.in_review}
              </div>
              <div className="stat-label">{t('issues.status.in_review')}</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body stat-inline">
              <div className="stat-number" style={{ color: 'var(--success)' }}>
                {stats.resolved}
              </div>
              <div className="stat-label">{t('issues.status.resolved')}</div>
            </div>
          </div>
          <div className="card">
            <div className="card-body stat-inline">
              <div className="stat-number" style={{ color: 'var(--danger)' }}>
                {stats.rejected}
              </div>
              <div className="stat-label">{t('issues.status.rejected')}</div>
            </div>
          </div>
        </div>
      )}

      {isMusicCommittee && (
        <div className="card mb-2">
          <div className="card-body">
            <div className="flex gap-2">
              <select
                className="form-control form-select"
                aria-label={t('issues.filterStatus')}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{ maxWidth: '200px' }}
              >
                <option value="">{t('issues.allStatuses')}</option>
                <option value="open">{t('issues.status.open')}</option>
                <option value="in_review">{t('issues.status.in_review')}</option>
                <option value="resolved">{t('issues.status.resolved')}</option>
                <option value="rejected">{t('issues.status.rejected')}</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body flush">
          {issues.length > 0 ? (
            <table className="table mb-0">
              <thead>
                <tr>
                  <th scope="col">{t('issues.table.piece')}</th>
                  <th scope="col">{t('issues.table.location')}</th>
                  <th scope="col">{t('issues.table.description')}</th>
                  {isMusicCommittee && <th scope="col">{t('issues.table.reporter')}</th>}
                  <th scope="col">{t('issues.table.date')}</th>
                  <th scope="col">{t('issues.table.status')}</th>
                  <th scope="col" style={{ width: '100px' }}>
                    <span className="sr-only">{t('common.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id}>
                    <td>
                      <strong>{issue.piece_title}</strong>
                      {issue.piece_arranger && (
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>{issue.piece_arranger}</div>
                      )}
                      {issue.instrument_name && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{issue.instrument_name}</div>
                      )}
                    </td>
                    <td>
                      {issue.page_number && (
                        <div>
                          {t('issues.page')} {issue.page_number}
                        </div>
                      )}
                      {issue.measure_number && (
                        <div>
                          {t('issues.measure')} {issue.measure_number}
                        </div>
                      )}
                      {!issue.page_number && !issue.measure_number && '-'}
                    </td>
                    <td style={{ maxWidth: '300px' }}>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{issue.description}</div>
                      {issue.resolution_notes && (
                        <div
                          style={{
                            marginTop: '0.5rem',
                            padding: '0.5rem',
                            background: 'var(--background)',
                            borderRadius: '0.25rem',
                            fontSize: '0.875rem',
                          }}
                        >
                          <strong>{t('issues.response')}:</strong> {issue.resolution_notes}
                        </div>
                      )}
                    </td>
                    {isMusicCommittee && (
                      <td>
                        <div>{issue.reported_by_name}</div>
                        {issue.reported_by_email && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                            {issue.reported_by_email}
                          </div>
                        )}
                      </td>
                    )}
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(issue.created_at)}</td>
                    <td>
                      {isMusicCommittee && issue.status !== 'resolved' && issue.status !== 'rejected' ? (
                        <select
                          className={`form-control form-select ${STATUS_COLORS[issue.status]}`}
                          aria-label={t('issues.changeStatusFor', { title: issue.piece_title })}
                          value={issue.status}
                          onChange={(e) => handleStatusChange(issue, e.target.value)}
                          style={{ minWidth: '140px' }}
                        >
                          <option value="open">{t('issues.status.open')}</option>
                          <option value="in_review">{t('issues.status.in_review')}</option>
                          <option value="resolved">{t('issues.status.resolved')}</option>
                          <option value="rejected">{t('issues.status.rejected')}</option>
                        </select>
                      ) : (
                        <span className={`badge ${STATUS_COLORS[issue.status]}`}>
                          {t(`issues.status.${issue.status}`)}
                        </span>
                      )}
                    </td>
                    <td>
                      {(user?.role === ROLES.ADMIN || issue.status === 'open') && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(issue)}
                          title={t('common.delete')}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">
                <Icon name="clipboard" size={48} />
              </div>
              <p>{t('issues.noIssuesDescription')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Resolution Modal */}
      {selectedIssue && (
        <Modal
          title={selectedIssue.status === 'rejected' ? t('issues.rejectIssue') : t('issues.resolveIssue')}
          onClose={() => setSelectedIssue(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setSelectedIssue(null)}>
                {t('common.cancel')}
              </button>
              <div className="flex gap-2">
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    updateStatusMutation.mutate({
                      id: selectedIssue.id,
                      status: 'rejected',
                      notes: resolutionNotes,
                    });
                  }}
                >
                  {t('issues.reject')}
                </button>
                <button
                  className="btn btn-success"
                  onClick={() => {
                    updateStatusMutation.mutate({
                      id: selectedIssue.id,
                      status: 'resolved',
                      notes: resolutionNotes,
                    });
                  }}
                >
                  {t('issues.status.resolved')}
                </button>
              </div>
            </>
          }
        >
          {/* Opschriften boven een uitgelezen waarde, geen veldlabels: er staat
              geen bedienbaar veld onder, dus een <label> beloofde hier iets wat
              er niet is. */}
          <div className="form-group">
            <span className="form-label">{t('issues.table.piece')}</span>
            <p>
              <strong>{selectedIssue.piece_title}</strong>
            </p>
          </div>
          <div className="form-group">
            <span className="form-label">{t('issues.originalIssue')}</span>
            <p style={{ whiteSpace: 'pre-wrap' }}>{selectedIssue.description}</p>
          </div>
          <FormField label={`${t('issues.responseNotes')} (${t('common.optional')})`}>
            <textarea
              className="form-control"
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              rows={3}
              placeholder={t('issues.responseNotesPlaceholder')}
            />
          </FormField>
        </Modal>
      )}
    </div>
  );
}
