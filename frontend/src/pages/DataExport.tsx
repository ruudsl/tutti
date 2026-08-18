import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { showSuccess, showError } from '../utils/toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon, type IconName } from '../components/Icon';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface DataCategory {
  name: string;
  count: number;
  description: string;
}

interface DataSummary {
  userId: string;
  exportDate: string;
  categories: DataCategory[];
  totalRecords: number;
}

async function getDataSummary(): Promise<DataSummary> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/gdpr/data-summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch data summary');
  return res.json();
}

async function downloadExport(format: 'json' | 'zip'): Promise<void> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/gdpr/export?format=${format}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error('Failed to download export');

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = format === 'zip' ? 'gdpr-export.zip' : 'gdpr-export.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

async function requestDeletion(reason?: string): Promise<{ message: string; requestId: string }> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/gdpr/delete-request`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error('Failed to submit deletion request');
  return res.json();
}

const categoryIcons: Record<string, IconName> = {
  profile: 'user',
  sessions: 'lock',
  favorites: 'heart',
  practiceHistory: 'music',
  activityLog: 'chart',
  annotations: 'pencil',
  audioRecordings: 'mic',
  issues: 'pencil',
  notificationPreferences: 'bell',
};

export default function DataExport() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.dataExport');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [exportFormat, setExportFormat] = useState<'json' | 'zip'>('zip');

  const {
    data: summary,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['gdpr-summary'],
    queryFn: getDataSummary,
  });

  const exportMutation = useMutation({
    mutationFn: () => downloadExport(exportFormat),
    onSuccess: () => {
      showSuccess(t('dataExport.downloadStarted'));
    },
    onError: () => {
      showError(t('errors.generic'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => requestDeletion(deleteReason),
    onSuccess: (data) => {
      showSuccess(data.message);
      setShowDeleteConfirm(false);
      setDeleteReason('');
    },
    onError: () => {
      showError(t('errors.generic'));
    },
  });

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="alert alert-danger">{t('errors.generic')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>{t('dataExport.title')}</h1>

      <div className="grid grid-2 gap-3">
        {/* Data Overview */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t('dataExport.yourData')}</h2>
          </div>
          <div className="card-body">
            <p className="piece-meta mb-3">{t('dataExport.dataDescription')}</p>

            <div className="mb-3">
              {summary?.categories.map((category) => (
                <div key={category.name} className="data-category">
                  <div className="data-category-name">
                    <Icon name={categoryIcons[category.name] || 'folder'} size={18} />
                    <span>{t(`dataExport.categories.${category.name}`)}</span>
                  </div>
                  <span className="data-category-count">
                    {category.count} {t('common.records')}
                  </span>
                </div>
              ))}
            </div>

            <div className="text-secondary" style={{ fontSize: '0.875rem' }}>
              {t('dataExport.totalRecords', { count: summary?.totalRecords || 0 })}
            </div>
          </div>
        </div>

        {/* Export Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t('dataExport.exportTitle')}</h2>
          </div>
          <div className="card-body">
            <div className="data-export-card">
              <div className="data-export-icon">
                <Icon name="download" size={48} />
              </div>
              <h3>{t('dataExport.downloadYourData')}</h3>
              <p className="piece-meta">{t('dataExport.downloadDescription')}</p>

              <div className="flex gap-2 justify-center mt-3">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="format"
                    value="zip"
                    checked={exportFormat === 'zip'}
                    onChange={() => setExportFormat('zip')}
                  />
                  ZIP
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="format"
                    value="json"
                    checked={exportFormat === 'json'}
                    onChange={() => setExportFormat('json')}
                  />
                  JSON
                </label>
              </div>

              <button
                className="btn btn-primary mt-3"
                onClick={() => exportMutation.mutate()}
                disabled={exportMutation.isPending}
              >
                {exportMutation.isPending ? t('common.loading') : t('dataExport.downloadButton')}
              </button>

              <div className="data-export-info">{t('dataExport.gdprInfo')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Account Section */}
      <div className="card mt-3">
        <div className="card-header">
          <h2 className="card-title" style={{ color: 'var(--danger)' }}>
            {t('dataExport.deleteAccountTitle')}
          </h2>
        </div>
        <div className="card-body">
          <p className="piece-meta mb-3">{t('dataExport.deleteAccountDescription')}</p>

          <div className="alert alert-warning mb-3">
            <strong>{t('common.warning')}:</strong> {t('dataExport.deleteWarning')}
          </div>

          <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)}>
            {t('dataExport.requestDeletion')}
          </button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title={t('dataExport.confirmDeleteTitle')}
          message={
            <div>
              <p className="mb-3">{t('dataExport.confirmDeleteMessage')}</p>
              <div className="form-group">
                <label className="form-label">
                  {t('dataExport.deleteReason')} ({t('common.optional')})
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder={t('dataExport.deleteReasonPlaceholder')}
                />
              </div>
            </div>
          }
          confirmLabel={t('dataExport.confirmDelete')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => {
            setShowDeleteConfirm(false);
            setDeleteReason('');
          }}
          isLoading={deleteMutation.isPending}
          variant="danger"
        />
      )}
    </div>
  );
}
