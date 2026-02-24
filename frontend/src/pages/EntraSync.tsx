import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { showSuccess, showError } from '../utils/toast';
import {
  getJobTitleMappings,
  createJobTitleMapping,
  updateJobTitleMapping,
  deleteJobTitleMapping,
  getEntraUsers,
  importEntraUsers,
  syncEntraUsers,
  syncEntraPhotos,
  getInstruments,
  getMicrosoftConfig,
  type JobTitleMapping,
  type EntraUsersResponse,
} from '../api';
import type { Instrument, MicrosoftConfig } from '../types';
import { FormModal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';

export default function EntraSync() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.entraSync');

  // State
  const [activeTab, setActiveTab] = useState<'users' | 'mappings'>('users');
  const [msConfig, setMsConfig] = useState<MicrosoftConfig | null>(null);
  const [isConfigLoading, setIsConfigLoading] = useState(true);

  // Users state
  const [entraData, setEntraData] = useState<EntraUsersResponse | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingPhotos, setIsSyncingPhotos] = useState(false);
  const [userFilter, setUserFilter] = useState<'all' | 'not-imported' | 'imported'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Mappings state
  const [mappings, setMappings] = useState<JobTitleMapping[]>([]);
  const [isLoadingMappings, setIsLoadingMappings] = useState(false);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [showAddMappingModal, setShowAddMappingModal] = useState(false);
  const [editingMapping, setEditingMapping] = useState<JobTitleMapping | null>(null);
  const [deletingMapping, setDeletingMapping] = useState<JobTitleMapping | null>(null);
  const [mappingFormData, setMappingFormData] = useState({ jobTitle: '', instrumentId: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load Microsoft config on mount
  useEffect(() => {
    loadMicrosoftConfig();
    loadInstruments();
  }, []);

  // Load data when tab changes
  useEffect(() => {
    if (msConfig?.configured) {
      if (activeTab === 'users') {
        loadEntraUsers();
      } else {
        loadMappings();
      }
    }
  }, [activeTab, msConfig?.configured]);

  const loadMicrosoftConfig = async () => {
    try {
      const config = await getMicrosoftConfig();
      setMsConfig(config);
    } catch {
      // Not configured
    } finally {
      setIsConfigLoading(false);
    }
  };

  const loadInstruments = async () => {
    try {
      const data = await getInstruments();
      setInstruments(data);
    } catch (error) {
      console.error('Error loading instruments:', error);
    }
  };

  const loadEntraUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const data = await getEntraUsers();
      setEntraData(data);
    } catch (error: any) {
      showError(error.response?.data?.error || t('entraSync.errorLoadingUsers'));
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const loadMappings = async () => {
    setIsLoadingMappings(true);
    try {
      const data = await getJobTitleMappings();
      setMappings(data);
    } catch (error: any) {
      showError(error.response?.data?.error || t('entraSync.errorLoadingMappings'));
    } finally {
      setIsLoadingMappings(false);
    }
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    if (!entraData) return [];

    let users = entraData.users;

    // Apply filter
    if (userFilter === 'imported') {
      users = users.filter((u) => u.isImported);
    } else if (userFilter === 'not-imported') {
      users = users.filter((u) => !u.isImported);
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      users = users.filter(
        (u) =>
          u.displayName.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query) ||
          (u.jobTitle && u.jobTitle.toLowerCase().includes(query)) ||
          (u.department && u.department.toLowerCase().includes(query))
      );
    }

    return users;
  }, [entraData, userFilter, searchQuery]);

  // Toggle user selection
  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  // Select all visible non-imported users
  const selectAllNotImported = () => {
    const notImportedIds = filteredUsers.filter((u) => !u.isImported).map((u) => u.id);
    setSelectedUserIds(new Set(notImportedIds));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedUserIds(new Set());
  };

  // Import selected users
  const handleImportSelected = async () => {
    if (selectedUserIds.size === 0) {
      showError(t('entraSync.selectUsersFirst'));
      return;
    }

    setIsImporting(true);
    try {
      const result = await importEntraUsers(Array.from(selectedUserIds));
      showSuccess(result.message);
      setSelectedUserIds(new Set());
      await loadEntraUsers();
    } catch (error: any) {
      showError(error.response?.data?.error || t('entraSync.importError'));
    } finally {
      setIsImporting(false);
    }
  };

  // Sync all users
  const handleSyncAll = async (createNew: boolean) => {
    setIsSyncing(true);
    try {
      const result = await syncEntraUsers(createNew);
      showSuccess(result.message);
      await loadEntraUsers();
    } catch (error: any) {
      showError(error.response?.data?.error || t('entraSync.syncError'));
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync profile photos from M365
  const handleSyncPhotos = async () => {
    setIsSyncingPhotos(true);
    try {
      const result = await syncEntraPhotos();
      showSuccess(result.message);
    } catch (error: any) {
      showError(error.response?.data?.error || t('entraSync.syncPhotosError'));
    } finally {
      setIsSyncingPhotos(false);
    }
  };

  // Mapping handlers
  const handleCreateMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mappingFormData.jobTitle.trim() || !mappingFormData.instrumentId) {
      showError(t('entraSync.mappingFieldsRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      await createJobTitleMapping({
        jobTitle: mappingFormData.jobTitle.trim(),
        instrumentId: mappingFormData.instrumentId,
      });
      showSuccess(t('entraSync.mappingCreated'));
      setShowAddMappingModal(false);
      setMappingFormData({ jobTitle: '', instrumentId: '' });
      await loadMappings();
    } catch (error: any) {
      showError(error.response?.data?.error || t('entraSync.errorCreatingMapping'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMapping || !mappingFormData.instrumentId) return;

    setIsSubmitting(true);
    try {
      await updateJobTitleMapping(editingMapping.id, mappingFormData.instrumentId);
      showSuccess(t('entraSync.mappingUpdated'));
      setEditingMapping(null);
      setMappingFormData({ jobTitle: '', instrumentId: '' });
      await loadMappings();
    } catch (error: any) {
      showError(error.response?.data?.error || t('entraSync.errorUpdatingMapping'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMapping = async () => {
    if (!deletingMapping) return;

    setIsSubmitting(true);
    try {
      await deleteJobTitleMapping(deletingMapping.id);
      showSuccess(t('entraSync.mappingDeleted'));
      setDeletingMapping(null);
      await loadMappings();
    } catch (error: any) {
      showError(error.response?.data?.error || t('entraSync.errorDeletingMapping'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditMappingModal = (mapping: JobTitleMapping) => {
    setEditingMapping(mapping);
    setMappingFormData({ jobTitle: mapping.job_title, instrumentId: mapping.instrument_id });
  };

  // Create mapping from job title (quick action from users tab)
  const handleQuickCreateMapping = (jobTitle: string) => {
    setMappingFormData({ jobTitle, instrumentId: '' });
    setShowAddMappingModal(true);
    setActiveTab('mappings');
  };

  // Get unmapped job titles
  const unmappedJobTitles = useMemo(() => {
    if (!entraData) return [];
    const mappedTitles = new Set(mappings.map((m) => m.job_title.toLowerCase()));
    return entraData.uniqueJobTitles.filter((t) => !mappedTitles.has(t.toLowerCase()));
  }, [entraData, mappings]);

  if (isConfigLoading) {
    return (
      <div className="loading" role="status">
        <div className="spinner" aria-hidden="true"></div>
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  if (!msConfig?.configured) {
    return (
      <div>
        <h1 className="mb-3">{t('entraSync.title')}</h1>
        <div className="card">
          <div className="card-body">
            <p style={{ color: 'var(--text-secondary)' }}>{t('entraSync.notConfigured')}</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              {t('entraSync.configureInSettings')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-3">{t('entraSync.title')}</h1>

      {/* Tab navigation */}
      <div className="flex gap-2 mb-3">
        <button
          className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('users')}
        >
          {t('entraSync.tabUsers')}
        </button>
        <button
          className={`btn ${activeTab === 'mappings' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('mappings')}
        >
          {t('entraSync.tabMappings')}
          {unmappedJobTitles.length > 0 && (
            <span
              style={{
                marginLeft: '0.5rem',
                background: 'var(--warning)',
                color: 'white',
                borderRadius: '1rem',
                padding: '0.1rem 0.5rem',
                fontSize: '0.75rem',
              }}
            >
              {unmappedJobTitles.length}
            </span>
          )}
        </button>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t('entraSync.entraUsers')}</h2>
          </div>
          <div className="card-body">
            <p className="piece-meta mb-3">{t('entraSync.usersDescription')}</p>

            {/* Actions */}
            <div className="flex gap-2 mb-3 flex-wrap">
              <button
                className="btn btn-primary"
                onClick={loadEntraUsers}
                disabled={isLoadingUsers}
              >
                {isLoadingUsers ? t('common.loading') : t('entraSync.refresh')}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => handleSyncAll(false)}
                disabled={isSyncing}
              >
                {isSyncing ? t('common.loading') : t('entraSync.syncExisting')}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => handleSyncAll(true)}
                disabled={isSyncing}
              >
                {isSyncing ? t('common.loading') : t('entraSync.syncAndCreate')}
              </button>
              <button
                className="btn btn-outline"
                onClick={handleSyncPhotos}
                disabled={isSyncingPhotos}
                title={t('entraSync.syncPhotosDescription')}
              >
                {isSyncingPhotos ? t('common.loading') : t('entraSync.syncPhotos')}
              </button>
            </div>

            {/* Filters */}
            <div className="flex gap-2 mb-3 flex-wrap items-center">
              <input
                type="text"
                className="form-control"
                placeholder={t('entraSync.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ maxWidth: '300px' }}
              />
              <select
                className="form-control"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value as 'all' | 'not-imported' | 'imported')}
                style={{ maxWidth: '200px' }}
              >
                <option value="all">{t('entraSync.filterAll')}</option>
                <option value="not-imported">{t('entraSync.filterNotImported')}</option>
                <option value="imported">{t('entraSync.filterImported')}</option>
              </select>
            </div>

            {/* Selection actions */}
            {selectedUserIds.size > 0 && (
              <div
                className="flex gap-2 mb-3 items-center"
                style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: '0.5rem' }}
              >
                <span>
                  {t('entraSync.selectedCount', { count: selectedUserIds.size })}
                </span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleImportSelected}
                  disabled={isImporting}
                >
                  {isImporting ? t('common.loading') : t('entraSync.importSelected')}
                </button>
                <button className="btn btn-outline btn-sm" onClick={clearSelection}>
                  {t('entraSync.clearSelection')}
                </button>
              </div>
            )}

            {/* New departments notice */}
            {entraData && entraData.newDepartments && entraData.newDepartments.length > 0 && (
              <div
                className="mb-3"
                style={{
                  background: 'var(--info-bg, #cfe2ff)',
                  border: '1px solid var(--info, #0d6efd)',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1rem',
                  fontSize: '0.875rem',
                }}
              >
                <strong>{t('entraSync.newDepartmentsNotice')}</strong>
                <div className="flex gap-2 flex-wrap mt-1">
                  {entraData.newDepartments.map((dept) => (
                    <span
                      key={dept}
                      style={{
                        background: 'white',
                        borderRadius: '0.25rem',
                        padding: '0.1rem 0.5rem',
                      }}
                    >
                      {dept}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Stats */}
            {entraData && (
              <div className="flex gap-3 mb-3" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                <span>{t('entraSync.totalUsers', { count: entraData.totalCount })}</span>
                <span>|</span>
                <span>{t('entraSync.importedUsers', { count: entraData.importedCount })}</span>
                <span>|</span>
                <span>
                  {t('entraSync.notImportedUsers', { count: entraData.totalCount - entraData.importedCount })}
                </span>
              </div>
            )}

            {/* Users table */}
            {isLoadingUsers ? (
              <div className="loading">
                <div className="spinner"></div>
              </div>
            ) : filteredUsers.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>{t('entraSync.noUsersFound')}</p>
            ) : (
              <>
                <div className="flex gap-2 mb-2">
                  <button className="btn btn-outline btn-sm" onClick={selectAllNotImported}>
                    {t('entraSync.selectAllNotImported')}
                  </button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}></th>
                        <th>{t('entraSync.columnName')}</th>
                        <th>{t('entraSync.columnEmail')}</th>
                        <th>{t('entraSync.columnJobTitle')}</th>
                        <th>{t('entraSync.columnDepartment')}</th>
                        <th>{t('entraSync.columnStatus')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user) => (
                        <tr key={user.id} style={{ opacity: user.isImported ? 0.7 : 1 }}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedUserIds.has(user.id)}
                              onChange={() => toggleUserSelection(user.id)}
                              disabled={user.isImported}
                            />
                          </td>
                          <td>
                            <strong>{user.displayName}</strong>
                          </td>
                          <td>{user.email}</td>
                          <td>
                            {user.jobTitle ? (
                              <div className="flex items-center gap-2">
                                <span>{user.jobTitle}</span>
                                {user.hasMapping ? (
                                  <span
                                    style={{
                                      background: 'var(--success)',
                                      color: 'white',
                                      borderRadius: '0.25rem',
                                      padding: '0.1rem 0.4rem',
                                      fontSize: '0.7rem',
                                    }}
                                  >
                                    {t('entraSync.mapped')}
                                  </span>
                                ) : (
                                  <button
                                    className="btn btn-outline btn-sm"
                                    style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}
                                    onClick={() => handleQuickCreateMapping(user.jobTitle!)}
                                  >
                                    {t('entraSync.createMapping')}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-secondary)' }}>-</span>
                            )}
                          </td>
                          <td>
                            {user.departments && user.departments.length > 0 ? (
                              <div className="flex gap-1 flex-wrap">
                                {user.departments.map((dept, idx) => (
                                  <span
                                    key={idx}
                                    style={{
                                      background: 'var(--bg-secondary)',
                                      borderRadius: '0.25rem',
                                      padding: '0.1rem 0.4rem',
                                      fontSize: '0.8rem',
                                    }}
                                  >
                                    {dept}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-secondary)' }}>-</span>
                            )}
                          </td>
                          <td>
                            {user.isImported ? (
                              <span style={{ color: 'var(--success)' }}>{t('entraSync.imported')}</span>
                            ) : (
                              <span style={{ color: 'var(--warning)' }}>{t('entraSync.notImported')}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mappings Tab */}
      {activeTab === 'mappings' && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t('entraSync.jobTitleMappings')}</h2>
          </div>
          <div className="card-body">
            <p className="piece-meta mb-3">{t('entraSync.mappingsDescription')}</p>

            {/* Unmapped job titles warning */}
            {unmappedJobTitles.length > 0 && (
              <div
                className="mb-3"
                style={{
                  background: 'var(--warning-bg, #fff3cd)',
                  border: '1px solid var(--warning)',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                }}
              >
                <strong>{t('entraSync.unmappedJobTitles')}</strong>
                <div className="flex gap-2 flex-wrap mt-2">
                  {unmappedJobTitles.map((title) => (
                    <button
                      key={title}
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        setMappingFormData({ jobTitle: title, instrumentId: '' });
                        setShowAddMappingModal(true);
                      }}
                    >
                      {title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              className="btn btn-primary mb-3"
              onClick={() => {
                setMappingFormData({ jobTitle: '', instrumentId: '' });
                setShowAddMappingModal(true);
              }}
            >
              + {t('entraSync.addMapping')}
            </button>

            {isLoadingMappings ? (
              <div className="loading">
                <div className="spinner"></div>
              </div>
            ) : mappings.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>{t('entraSync.noMappings')}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('entraSync.columnJobTitle')}</th>
                    <th>{t('entraSync.columnInstrument')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((mapping) => (
                    <tr key={mapping.id}>
                      <td>
                        <strong>{mapping.job_title}</strong>
                      </td>
                      <td>
                        {mapping.instrument_name}
                        {mapping.instrument_tuning && (
                          <span style={{ color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>
                            ({mapping.instrument_tuning})
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => openEditMappingModal(mapping)}
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => setDeletingMapping(mapping)}
                          >
                            {t('common.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Mapping Modal */}
      {(showAddMappingModal || editingMapping) && (
        <FormModal
          title={editingMapping ? t('entraSync.editMapping') : t('entraSync.addMapping')}
          onClose={() => {
            setShowAddMappingModal(false);
            setEditingMapping(null);
            setMappingFormData({ jobTitle: '', instrumentId: '' });
          }}
          onSubmit={editingMapping ? handleUpdateMapping : handleCreateMapping}
          isSubmitting={isSubmitting}
        >
          <div className="form-group">
            <label className="form-label">{t('entraSync.jobTitleLabel')} *</label>
            <input
              type="text"
              className="form-control"
              value={mappingFormData.jobTitle}
              onChange={(e) => setMappingFormData({ ...mappingFormData, jobTitle: e.target.value })}
              placeholder={t('entraSync.jobTitlePlaceholder')}
              required
              disabled={!!editingMapping}
            />
            {!editingMapping && entraData && entraData.uniqueJobTitles.length > 0 && (
              <div className="mt-2">
                <small style={{ color: 'var(--text-secondary)' }}>{t('entraSync.suggestedJobTitles')}</small>
                <div className="flex gap-1 flex-wrap mt-1">
                  {entraData.uniqueJobTitles.slice(0, 10).map((title) => (
                    <button
                      key={title}
                      type="button"
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: '0.75rem' }}
                      onClick={() => setMappingFormData({ ...mappingFormData, jobTitle: title })}
                    >
                      {title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">{t('entraSync.instrumentLabel')} *</label>
            <select
              className="form-control"
              value={mappingFormData.instrumentId}
              onChange={(e) => setMappingFormData({ ...mappingFormData, instrumentId: e.target.value })}
              required
            >
              <option value="">{t('entraSync.selectInstrument')}</option>
              {instruments.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {instrument.name}
                  {instrument.tuning && ` (${instrument.tuning})`}
                </option>
              ))}
            </select>
          </div>
        </FormModal>
      )}

      {/* Delete Mapping Confirmation */}
      {deletingMapping && (
        <ConfirmDialog
          title={t('common.delete')}
          message={t('entraSync.deleteMappingConfirm', { jobTitle: deletingMapping.job_title })}
          confirmLabel={t('common.delete')}
          onConfirm={handleDeleteMapping}
          onCancel={() => setDeletingMapping(null)}
          isLoading={isSubmitting}
          variant="danger"
        />
      )}
    </div>
  );
}
