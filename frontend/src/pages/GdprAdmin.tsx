import { currentLocale } from '../utils/locale';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { FormField } from '../components/FormField';
import { showSuccess, showError } from '../utils/toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface DeletionRequest {
  id: string;
  userId: string;
  email: string;
  name: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  requestedAt: string;
  processedAt?: string;
  processedBy?: string;
}

interface RetentionSetting {
  dataType: string;
  retentionDays: number;
  description: string;
}

interface RetentionSettings {
  settings: RetentionSetting[];
  lastCleanup?: string;
  nextCleanup?: string;
}

async function fetchDeletionRequests(): Promise<DeletionRequest[]> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/gdpr/deletion-requests`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch deletion requests');
  const data = await res.json();
  return data.requests.map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    email: r.email,
    name: `${r.first_name} ${r.last_name}`,
    reason: r.reason,
    status: r.status,
    requestedAt: r.created_at,
    processedAt: r.processed_at,
    processedBy: r.processed_by_name,
  }));
}

async function processDeletionRequest(requestId: string, action: 'approve' | 'reject', notes?: string): Promise<void> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/gdpr/deletion-requests/${requestId}/process`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, notes }),
  });
  if (!res.ok) throw new Error('Failed to process deletion request');
}

async function fetchRetentionSettings(): Promise<RetentionSettings> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/gdpr/retention-settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch retention settings');
  const data = await res.json();
  return {
    settings: data.settings.map((s: any) => ({
      dataType: s.data_type,
      retentionDays: s.retention_days,
      description: s.description || '',
    })),
  };
}

async function updateRetentionSettings(settings: RetentionSetting[]): Promise<void> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/gdpr/retention-settings`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      settings: settings.map((s) => ({
        data_type: s.dataType,
        retention_days: s.retentionDays,
        auto_delete: s.retentionDays > 0,
      })),
    }),
  });
  if (!res.ok) throw new Error('Failed to update retention settings');
}

async function runCleanup(): Promise<{ deleted: Record<string, number> }> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/gdpr/cleanup`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to run cleanup');
  const data = await res.json();
  return { deleted: data.deletedCounts || {} };
}

export default function GdprAdmin() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  useDocumentTitle('pageTitle.gdprAdmin');

  const [activeTab, setActiveTab] = useState<'requests' | 'retention'>('requests');
  const [selectedRequest, setSelectedRequest] = useState<DeletionRequest | null>(null);
  const [processAction, setProcessAction] = useState<'approve' | 'reject' | null>(null);
  const [processNotes, setProcessNotes] = useState('');
  const [editingSettings, setEditingSettings] = useState<RetentionSetting[] | null>(null);

  const { data: requests, isLoading: loadingRequests } = useQuery({
    queryKey: ['gdpr-deletion-requests'],
    queryFn: fetchDeletionRequests,
  });

  const { data: retentionData, isLoading: loadingRetention } = useQuery({
    queryKey: ['gdpr-retention-settings'],
    queryFn: fetchRetentionSettings,
  });

  const processMutation = useMutation({
    mutationFn: () => {
      if (!selectedRequest || !processAction) throw new Error('Invalid state');
      return processDeletionRequest(selectedRequest.id, processAction, processNotes);
    },
    onSuccess: () => {
      showSuccess(processAction === 'approve' ? t('gdprAdmin.requestApproved') : t('gdprAdmin.requestRejected'));
      queryClient.invalidateQueries({ queryKey: ['gdpr-deletion-requests'] });
      setSelectedRequest(null);
      setProcessAction(null);
      setProcessNotes('');
    },
    onError: () => {
      showError(t('errors.generic'));
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: () => {
      if (!editingSettings) throw new Error('No settings to save');
      return updateRetentionSettings(editingSettings);
    },
    onSuccess: () => {
      showSuccess(t('gdprAdmin.settingsSaved'));
      queryClient.invalidateQueries({ queryKey: ['gdpr-retention-settings'] });
      setEditingSettings(null);
    },
    onError: () => {
      showError(t('errors.generic'));
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: runCleanup,
    onSuccess: (data) => {
      const total = Object.values(data.deleted).reduce((a, b) => a + b, 0);
      showSuccess(t('gdprAdmin.cleanupComplete', { count: total }));
      queryClient.invalidateQueries({ queryKey: ['gdpr-retention-settings'] });
    },
    onError: () => {
      showError(t('errors.generic'));
    },
  });

  const pendingRequests = requests?.filter((r) => r.status === 'pending') || [];
  const processedRequests = requests?.filter((r) => r.status !== 'pending') || [];

  const getStatusBadge = (status: DeletionRequest['status']) => {
    const styles: Record<string, string> = {
      pending: 'badge-warning',
      approved: 'badge-info',
      completed: 'badge-success',
      rejected: 'badge-danger',
    };
    return styles[status] || '';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(currentLocale(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{t('gdprAdmin.title', 'GDPR Beheer')}</h1>
      </div>

      <div className="tabs mb-4">
        <button className={`tab ${activeTab === 'requests' ? 'active' : ''}`} onClick={() => setActiveTab('requests')}>
          <Icon name="user" size={16} />
          {t('gdprAdmin.deletionRequests', 'Verwijderingsverzoeken')}
          {pendingRequests.length > 0 && <span className="badge badge-warning ml-2">{pendingRequests.length}</span>}
        </button>
        <button
          className={`tab ${activeTab === 'retention' ? 'active' : ''}`}
          onClick={() => setActiveTab('retention')}
        >
          <Icon name="calendar" size={16} />
          {t('gdprAdmin.retentionSettings', 'Bewaartermijnen')}
        </button>
      </div>

      {activeTab === 'requests' && (
        <div>
          {loadingRequests ? (
            <div className="loading">
              <div className="spinner" />
            </div>
          ) : (
            <>
              {pendingRequests.length > 0 && (
                <div className="card mb-4">
                  <div className="card-header">
                    <h2 className="card-title">{t('gdprAdmin.pendingRequests', 'Openstaande verzoeken')}</h2>
                  </div>
                  <div className="card-body p-0">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('common.user', 'Gebruiker')}</th>
                          <th>{t('common.email', 'E-mail')}</th>
                          <th>{t('gdprAdmin.reason', 'Reden')}</th>
                          <th>{t('gdprAdmin.requestedAt', 'Aangevraagd')}</th>
                          <th>{t('common.actions', 'Acties')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingRequests.map((request) => (
                          <tr key={request.id}>
                            <td>{request.name}</td>
                            <td>{request.email}</td>
                            <td>{request.reason || '-'}</td>
                            <td>{formatDate(request.requestedAt)}</td>
                            <td>
                              <div className="flex gap-2">
                                <button
                                  className="btn btn-sm btn-success"
                                  onClick={() => {
                                    setSelectedRequest(request);
                                    setProcessAction('approve');
                                  }}
                                  title={t('gdprAdmin.approve', 'Goedkeuren')}
                                >
                                  <Icon name="check" size={14} />
                                </button>
                                <button
                                  className="btn btn-sm btn-danger"
                                  onClick={() => {
                                    setSelectedRequest(request);
                                    setProcessAction('reject');
                                  }}
                                  title={t('gdprAdmin.reject', 'Afwijzen')}
                                >
                                  <Icon name="close" size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">{t('gdprAdmin.processedRequests', 'Verwerkte verzoeken')}</h2>
                </div>
                <div className="card-body p-0">
                  {processedRequests.length === 0 ? (
                    <div className="p-4 text-center text-muted">
                      {t('gdprAdmin.noProcessedRequests', 'Geen verwerkte verzoeken')}
                    </div>
                  ) : (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('common.user', 'Gebruiker')}</th>
                          <th>{t('common.email', 'E-mail')}</th>
                          <th>{t('common.status', 'Status')}</th>
                          <th>{t('gdprAdmin.processedAt', 'Verwerkt')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {processedRequests.map((request) => (
                          <tr key={request.id}>
                            <td>{request.name}</td>
                            <td>{request.email}</td>
                            <td>
                              <span className={`badge ${getStatusBadge(request.status)}`}>
                                {t(`gdprAdmin.status.${request.status}`, request.status)}
                              </span>
                            </td>
                            <td>{request.processedAt ? formatDate(request.processedAt) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'retention' && (
        <div>
          {loadingRetention ? (
            <div className="loading">
              <div className="spinner" />
            </div>
          ) : (
            <>
              <div className="card mb-4">
                <div className="card-header flex justify-between items-center">
                  <h2 className="card-title">{t('gdprAdmin.dataRetention', 'Gegevensretentie')}</h2>
                  {!editingSettings && (
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => setEditingSettings(retentionData?.settings || [])}
                    >
                      <Icon name="pencil" size={14} />
                      {t('common.edit', 'Bewerken')}
                    </button>
                  )}
                </div>
                <div className="card-body">
                  {editingSettings ? (
                    <div>
                      {editingSettings.map((setting, index) => (
                        // Met de hand gekoppeld: tussen label en veld staat de
                        // uitleg, en het veld zit met de eenheid in een eigen
                        // omhulsel. FormField kloont maar één kind. De uitleg
                        // hangt via aria-describedby aan het veld.
                        <div key={setting.dataType} className="form-group">
                          <label className="form-label" htmlFor={`bewaartermijn-${setting.dataType}`}>
                            {t(`gdprAdmin.dataTypes.${setting.dataType}`, setting.dataType)}
                          </label>
                          <p id={`bewaartermijn-${setting.dataType}-uitleg`} className="text-muted text-sm mb-2">
                            {setting.description}
                          </p>
                          <div className="flex items-center gap-2">
                            <input
                              id={`bewaartermijn-${setting.dataType}`}
                              aria-describedby={`bewaartermijn-${setting.dataType}-uitleg`}
                              type="number"
                              className="form-control"
                              style={{ width: '120px' }}
                              value={setting.retentionDays}
                              min={0}
                              onChange={(e) => {
                                const newSettings = [...editingSettings];
                                newSettings[index] = {
                                  ...setting,
                                  retentionDays: parseInt(e.target.value) || 0,
                                };
                                setEditingSettings(newSettings);
                              }}
                            />
                            <span>{t('gdprAdmin.days', 'dagen')}</span>
                            <span className="text-muted text-sm">
                              (0 = {t('gdprAdmin.noExpiration', 'geen vervaldatum')})
                            </span>
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-2 mt-4">
                        <button
                          className="btn btn-primary"
                          onClick={() => updateSettingsMutation.mutate()}
                          disabled={updateSettingsMutation.isPending}
                        >
                          {updateSettingsMutation.isPending ? t('common.saving') : t('common.save')}
                        </button>
                        <button className="btn btn-outline" onClick={() => setEditingSettings(null)}>
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('gdprAdmin.dataType', 'Gegevenstype')}</th>
                          <th>{t('gdprAdmin.retention', 'Bewaartermijn')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {retentionData?.settings.map((setting) => (
                          <tr key={setting.dataType}>
                            <td>
                              <div>
                                <strong>{t(`gdprAdmin.dataTypes.${setting.dataType}`, setting.dataType)}</strong>
                                <p className="text-muted text-sm mb-0">{setting.description}</p>
                              </div>
                            </td>
                            <td>
                              {setting.retentionDays === 0
                                ? t('gdprAdmin.noExpiration', 'Geen vervaldatum')
                                : `${setting.retentionDays} ${t('gdprAdmin.days', 'dagen')}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">{t('gdprAdmin.cleanup', 'Opschonen')}</h2>
                </div>
                <div className="card-body">
                  <p className="mb-3">
                    {t(
                      'gdprAdmin.cleanupDescription',
                      'Verwijder verlopen gegevens op basis van de hierboven geconfigureerde bewaartermijnen.',
                    )}
                  </p>
                  {retentionData?.lastCleanup && (
                    <p className="text-muted text-sm mb-3">
                      {t('gdprAdmin.lastCleanup', 'Laatste opschoning')}: {formatDate(retentionData.lastCleanup)}
                    </p>
                  )}
                  <button
                    className="btn btn-warning"
                    onClick={() => cleanupMutation.mutate()}
                    disabled={cleanupMutation.isPending}
                  >
                    <Icon name="trash" size={16} />
                    {cleanupMutation.isPending
                      ? t('gdprAdmin.cleaning', 'Bezig met opschonen...')
                      : t('gdprAdmin.runCleanup', 'Opschoning uitvoeren')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {selectedRequest && processAction && (
        <ConfirmDialog
          title={
            processAction === 'approve'
              ? t('gdprAdmin.confirmApprove', 'Verzoek goedkeuren')
              : t('gdprAdmin.confirmReject', 'Verzoek afwijzen')
          }
          message={
            <div>
              <p className="mb-3">
                {processAction === 'approve'
                  ? t(
                      'gdprAdmin.approveWarning',
                      'Dit zal alle gegevens van deze gebruiker permanent verwijderen. Dit kan niet ongedaan worden gemaakt.',
                    )
                  : t('gdprAdmin.rejectInfo', 'De gebruiker wordt geïnformeerd dat hun verzoek is afgewezen.')}
              </p>
              <div className="alert alert-info mb-3">
                <strong>{selectedRequest.name}</strong> ({selectedRequest.email})
              </div>
              <FormField
                label={
                  <>
                    {t('gdprAdmin.notes', 'Notities')} ({t('common.optional')})
                  </>
                }
              >
                <textarea
                  className="form-control"
                  rows={3}
                  value={processNotes}
                  onChange={(e) => setProcessNotes(e.target.value)}
                  placeholder={t('gdprAdmin.notesPlaceholder', 'Voeg eventuele notities toe...')}
                />
              </FormField>
            </div>
          }
          confirmLabel={
            processAction === 'approve'
              ? t('gdprAdmin.confirmApproveButton', 'Ja, verwijderen')
              : t('gdprAdmin.confirmRejectButton', 'Afwijzen')
          }
          cancelLabel={t('common.cancel')}
          onConfirm={() => processMutation.mutate()}
          onCancel={() => {
            setSelectedRequest(null);
            setProcessAction(null);
            setProcessNotes('');
          }}
          isLoading={processMutation.isPending}
          variant={processAction === 'approve' ? 'danger' : 'warning'}
        />
      )}
    </div>
  );
}
