import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings, uploadLogo, removeLogo, getMicrosoftConfig, saveMicrosoftConfig, removeMicrosoftConfig, getSmtpConfig, saveSmtpConfig, removeSmtpConfig, testSmtpConfig, getM365GroupMappings, createM365GroupMapping, updateM365GroupMapping, deleteM365GroupMapping, type M365GroupMapping } from '../api';
import { showSuccess, showError } from '../utils/toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAdminConcertTypes, useCreateConcertType, useUpdateConcertType, useDeleteConcertType, useInitDefaultConcertTypes } from '../hooks/useConcerts';
import { useOrchestras } from '../hooks/useOrchestras';
import { FormModal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';

export default function Settings() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.settings');
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // React Query for settings
  const { data: settings = null, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    staleTime: 5 * 60 * 1000,
  });

  // React Query for Microsoft config
  const { data: msConfig = null } = useQuery({
    queryKey: ['microsoftConfig'],
    queryFn: getMicrosoftConfig,
    staleTime: 5 * 60 * 1000,
  });

  // React Query for SMTP config
  const { data: smtpConfig = null } = useQuery({
    queryKey: ['smtpConfig'],
    queryFn: getSmtpConfig,
    staleTime: 5 * 60 * 1000,
  });

  // React Query for M365 group mappings
  const { data: m365GroupMappings = [], isLoading: m365MappingsLoading } = useQuery({
    queryKey: ['m365GroupMappings'],
    queryFn: getM365GroupMappings,
    staleTime: 5 * 60 * 1000,
  });

  // Initialize display name from settings
  useEffect(() => {
    if (settings?.displayName && !displayName) {
      setDisplayName(settings.displayName);
    }
  }, [settings, displayName]);

  // Microsoft config form state
  const [msClientId, setMsClientId] = useState('');
  const [msClientSecret, setMsClientSecret] = useState('');
  const [msTenantId, setMsTenantId] = useState('');
  const [msEnabled, setMsEnabled] = useState(false);
  const [msSaving, setMsSaving] = useState(false);

  // Initialize MS config form from query data
  useEffect(() => {
    if (msConfig) {
      setMsClientId(msConfig.clientId || '');
      setMsTenantId(msConfig.tenantId || '');
      setMsEnabled(msConfig.enabled);
    }
  }, [msConfig]);

  // SMTP config form state
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);

  // Initialize SMTP config form from query data
  useEffect(() => {
    if (smtpConfig) {
      setSmtpHost(smtpConfig.host || '');
      setSmtpPort(smtpConfig.port || 587);
      setSmtpSecure(smtpConfig.secure || false);
      setSmtpUser(smtpConfig.user || '');
      setSmtpFrom(smtpConfig.from || '');
      setSmtpEnabled(smtpConfig.enabled || false);
    }
  }, [smtpConfig]);

  // Concert types state
  const [showAddConcertTypeModal, setShowAddConcertTypeModal] = useState(false);
  const [editingConcertType, setEditingConcertType] = useState<{ id: string; value: string; label: string; sortOrder: number } | null>(null);
  const [deletingConcertType, setDeletingConcertType] = useState<{ id: string; label: string } | null>(null);
  const [concertTypeFormData, setConcertTypeFormData] = useState({ value: '', label: '', sortOrder: 0 });

  // M365 group mappings state
  const [showAddGroupMappingModal, setShowAddGroupMappingModal] = useState(false);
  const [editingGroupMapping, setEditingGroupMapping] = useState<M365GroupMapping | null>(null);
  const [deletingGroupMapping, setDeletingGroupMapping] = useState<M365GroupMapping | null>(null);
  const [groupMappingFormData, setGroupMappingFormData] = useState({ orchestraId: '', groupName: '', groupType: 'orchestra' as 'orchestra' | 'percussion' | 'special' });
  const [groupMappingSaving, setGroupMappingSaving] = useState(false);

  // Concert types hooks
  const { data: concertTypesData, isLoading: concertTypesLoading } = useAdminConcertTypes();

  // Orchestras for M365 group mappings
  const { data: orchestras = [] } = useOrchestras();
  const createConcertTypeMutation = useCreateConcertType();
  const updateConcertTypeMutation = useUpdateConcertType();
  const deleteConcertTypeMutation = useDeleteConcertType();
  const initDefaultsMutation = useInitDefaultConcertTypes();

  // Helper functions to refresh data
  const refreshSettings = () => queryClient.invalidateQueries({ queryKey: ['settings'] });
  const refreshMsConfig = () => queryClient.invalidateQueries({ queryKey: ['microsoftConfig'] });
  const refreshSmtpConfig = () => queryClient.invalidateQueries({ queryKey: ['smtpConfig'] });
  const refreshM365Mappings = () => queryClient.invalidateQueries({ queryKey: ['m365GroupMappings'] });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateSettings({ displayName: displayName.trim() || undefined });
      showSuccess(t('settings.saved'));
      refreshSettings();
      window.dispatchEvent(new Event('settings-updated'));
    } catch (error: any) {
      showError(error.response?.data?.error || t('settings.errorSaving'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showError(t('settings.invalidFileType'));
      return;
    }

    // Validate file size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      showError(t('settings.fileTooLarge'));
      return;
    }

    setIsUploadingLogo(true);
    try {
      await uploadLogo(file);
      showSuccess(t('settings.logoUploaded'));
      refreshSettings();
      window.dispatchEvent(new Event('settings-updated'));
    } catch (error: any) {
      showError(error.response?.data?.error || t('settings.errorUploadingLogo'));
    } finally {
      setIsUploadingLogo(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveLogo = async () => {
    if (!confirm(t('settings.removeLogoConfirm'))) return;

    try {
      await removeLogo();
      showSuccess(t('settings.logoRemoved'));
      refreshSettings();
      window.dispatchEvent(new Event('settings-updated'));
    } catch (error: any) {
      showError(error.response?.data?.error || t('settings.errorRemovingLogo'));
    }
  };

  const handleMicrosoftSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msClientId.trim() || !msTenantId.trim()) {
      showError(t('settings.microsoft.clientIdRequired'));
      return;
    }
    setMsSaving(true);
    try {
      await saveMicrosoftConfig({
        clientId: msClientId.trim(),
        clientSecret: msClientSecret.trim() || undefined,
        tenantId: msTenantId.trim(),
        enabled: msEnabled,
      });
      showSuccess(t('settings.microsoft.saved'));
      setMsClientSecret('');
      refreshMsConfig();
    } catch (error: any) {
      showError(error.response?.data?.error || t('settings.microsoft.errorSaving'));
    } finally {
      setMsSaving(false);
    }
  };

  const handleMicrosoftRemove = async () => {
    if (!confirm(t('settings.microsoft.removeConfirm'))) return;
    try {
      await removeMicrosoftConfig();
      showSuccess(t('settings.microsoft.removed'));
      setMsClientId('');
      setMsClientSecret('');
      setMsTenantId('');
      setMsEnabled(false);
      refreshMsConfig();
    } catch (error: any) {
      showError(error.response?.data?.error || t('settings.microsoft.errorRemoving'));
    }
  };

  const handleSmtpSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smtpHost.trim()) {
      showError(t('settings.smtp.hostRequired'));
      return;
    }
    setSmtpSaving(true);
    try {
      await saveSmtpConfig({
        host: smtpHost.trim(),
        port: smtpPort,
        secure: smtpSecure,
        user: smtpUser.trim(),
        password: smtpPassword.trim() || undefined,
        from: smtpFrom.trim(),
        enabled: smtpEnabled,
      });
      showSuccess(t('settings.smtp.saved'));
      setSmtpPassword('');
      refreshSmtpConfig();
    } catch (error: any) {
      showError(error.response?.data?.error || t('settings.smtp.errorSaving'));
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleSmtpRemove = async () => {
    if (!confirm(t('settings.smtp.removeConfirm'))) return;
    try {
      await removeSmtpConfig();
      showSuccess(t('settings.smtp.removed'));
      setSmtpHost('');
      setSmtpPort(587);
      setSmtpSecure(false);
      setSmtpUser('');
      setSmtpPassword('');
      setSmtpFrom('');
      setSmtpEnabled(false);
      refreshSmtpConfig();
    } catch (error: any) {
      showError(error.response?.data?.error || t('settings.smtp.errorRemoving'));
    }
  };

  const handleSmtpTest = async () => {
    setSmtpTesting(true);
    try {
      const result = await testSmtpConfig();
      showSuccess(result.message);
    } catch (error: any) {
      showError(error.response?.data?.error || t('settings.smtp.testFailed'));
    } finally {
      setSmtpTesting(false);
    }
  };

  // Concert type handlers
  const handleCreateConcertType = async (e: React.FormEvent) => {
    e.preventDefault();
    await createConcertTypeMutation.mutateAsync({
      value: concertTypeFormData.value,
      label: concertTypeFormData.label,
      sortOrder: concertTypeFormData.sortOrder,
    });
    setShowAddConcertTypeModal(false);
    setConcertTypeFormData({ value: '', label: '', sortOrder: 0 });
  };

  const handleUpdateConcertType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConcertType) return;
    await updateConcertTypeMutation.mutateAsync({
      id: editingConcertType.id,
      updates: {
        value: concertTypeFormData.value,
        label: concertTypeFormData.label,
        sortOrder: concertTypeFormData.sortOrder,
      },
    });
    setEditingConcertType(null);
    setConcertTypeFormData({ value: '', label: '', sortOrder: 0 });
  };

  const handleDeleteConcertType = async () => {
    if (!deletingConcertType) return;
    await deleteConcertTypeMutation.mutateAsync(deletingConcertType.id);
    setDeletingConcertType(null);
  };

  const handleInitDefaults = async () => {
    await initDefaultsMutation.mutateAsync();
  };

  const openEditConcertTypeModal = (type: { id: string; value: string; label: string; sortOrder: number }) => {
    setEditingConcertType(type);
    setConcertTypeFormData({ value: type.value, label: type.label, sortOrder: type.sortOrder });
  };

  // M365 group mapping handlers
  const handleCreateGroupMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupMappingFormData.groupName.trim()) {
      showError(t('settings.m365Groups.groupNameRequired'));
      return;
    }
    setGroupMappingSaving(true);
    try {
      await createM365GroupMapping({
        orchestraId: groupMappingFormData.orchestraId || undefined,
        groupName: groupMappingFormData.groupName.trim(),
        groupType: groupMappingFormData.groupType,
      });
      showSuccess(t('settings.m365Groups.created'));
      setShowAddGroupMappingModal(false);
      setGroupMappingFormData({ orchestraId: '', groupName: '', groupType: 'orchestra' });
      refreshM365Mappings();
    } catch (error: any) {
      showError(error.response?.data?.error || t('settings.m365Groups.errorCreating'));
    } finally {
      setGroupMappingSaving(false);
    }
  };

  const handleUpdateGroupMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroupMapping || !groupMappingFormData.groupName.trim()) {
      showError(t('settings.m365Groups.groupNameRequired'));
      return;
    }
    setGroupMappingSaving(true);
    try {
      await updateM365GroupMapping(editingGroupMapping.id, groupMappingFormData.groupName.trim());
      showSuccess(t('settings.m365Groups.updated'));
      setEditingGroupMapping(null);
      setGroupMappingFormData({ orchestraId: '', groupName: '', groupType: 'orchestra' });
      refreshM365Mappings();
    } catch (error: any) {
      showError(error.response?.data?.error || t('settings.m365Groups.errorUpdating'));
    } finally {
      setGroupMappingSaving(false);
    }
  };

  const handleDeleteGroupMapping = async () => {
    if (!deletingGroupMapping) return;
    try {
      await deleteM365GroupMapping(deletingGroupMapping.id);
      showSuccess(t('settings.m365Groups.deleted'));
      setDeletingGroupMapping(null);
      refreshM365Mappings();
    } catch (error: any) {
      showError(error.response?.data?.error || t('settings.m365Groups.errorDeleting'));
    }
  };

  const openEditGroupMappingModal = (mapping: M365GroupMapping) => {
    setEditingGroupMapping(mapping);
    setGroupMappingFormData({
      orchestraId: mapping.orchestraId || '',
      groupName: mapping.groupName,
      groupType: mapping.groupType,
    });
  };

  // Get orchestras that don't have a mapping yet (for the dropdown)
  const availableOrchestras = orchestras.filter(
    o => !m365GroupMappings.some(m => m.orchestraId === o.id && m.groupType === 'orchestra')
  );

  // Check if percussion group already exists
  const hasPercussionGroup = m365GroupMappings.some(m => m.groupType === 'percussion');

  if (isLoading) {
    return (
      <div className="loading" role="status" aria-label={t('accessibility.loadingContent')}>
        <div className="spinner" aria-hidden="true"></div>
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-3">{t('settings.title')}</h1>

      <div className="card mb-3">
        <div className="card-header">
          <h2 className="card-title">{t('settings.organization')}</h2>
        </div>
        <div className="card-body">
          <form onSubmit={handleSave}>
            <div className="form-group">
              <label htmlFor="displayName" className="form-label">
                {t('settings.organizationName')}
              </label>
              <input
                type="text"
                id="displayName"
                className="form-control"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('settings.organizationNamePlaceholder')}
                maxLength={100}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
            >
              {isSaving ? t('common.loading') : t('common.save')}
            </button>
          </form>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header">
          <h2 className="card-title">{t('settings.logo')}</h2>
        </div>
        <div className="card-body">
          <p className="piece-meta mb-2">{t('settings.logoDescription')}</p>
          <p className="piece-meta mb-3" style={{ fontSize: '0.8rem' }}>
            {t('settings.logoRequirements')}
          </p>

          {settings?.logoUrl && (
            <div className="mb-3" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <img
                src={settings.logoUrl}
                alt="Logo"
                style={{
                  width: '64px',
                  height: '64px',
                  objectFit: 'contain',
                  border: '1px solid var(--border)',
                  borderRadius: '0.5rem',
                  padding: '0.25rem',
                  background: 'white',
                }}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleRemoveLogo}
              >
                {t('settings.removeLogo')}
              </button>
            </div>
          )}

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={handleLogoUpload}
              style={{ display: 'none' }}
              id="logo-upload"
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingLogo}
            >
              {isUploadingLogo
                ? t('common.loading')
                : settings?.logoUrl
                  ? t('settings.changeLogo')
                  : t('settings.uploadLogo')}
            </button>
          </div>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header">
          <h2 className="card-title">{t('settings.microsoft.title')}</h2>
        </div>
        <div className="card-body">
          <p className="piece-meta mb-3">{t('settings.microsoft.description')}</p>

          <form onSubmit={handleMicrosoftSave}>
            <div className="form-group">
              <label htmlFor="msTenantId" className="form-label">
                {t('settings.microsoft.tenantId')}
              </label>
              <input
                type="text"
                id="msTenantId"
                className="form-control"
                value={msTenantId}
                onChange={(e) => setMsTenantId(e.target.value)}
                placeholder={t('settings.microsoft.tenantIdPlaceholder')}
              />
            </div>

            <div className="form-group">
              <label htmlFor="msClientId" className="form-label">
                {t('settings.microsoft.clientId')}
              </label>
              <input
                type="text"
                id="msClientId"
                className="form-control"
                value={msClientId}
                onChange={(e) => setMsClientId(e.target.value)}
                placeholder={t('settings.microsoft.clientIdPlaceholder')}
              />
            </div>

            <div className="form-group">
              <label htmlFor="msClientSecret" className="form-label">
                {t('settings.microsoft.clientSecret')}
              </label>
              <input
                type="password"
                id="msClientSecret"
                className="form-control"
                value={msClientSecret}
                onChange={(e) => setMsClientSecret(e.target.value)}
                placeholder={msConfig?.configured ? t('settings.microsoft.secretUnchanged') : t('settings.microsoft.clientSecretPlaceholder')}
              />
            </div>

            {msConfig?.configured && (
              <div className="form-group">
                <label className="form-label">{t('settings.microsoft.redirectUri')}</label>
                <input
                  type="text"
                  className="form-control"
                  value={msConfig.redirectUri}
                  readOnly
                  style={{ background: 'var(--bg)', fontSize: '0.85rem' }}
                />
                <p className="piece-meta" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  {t('settings.microsoft.redirectUriHelp')}
                </p>
              </div>
            )}

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={msEnabled}
                  onChange={(e) => setMsEnabled(e.target.checked)}
                />
                {t('settings.microsoft.enabled')}
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={msSaving}
              >
                {msSaving ? t('common.loading') : t('common.save')}
              </button>
              {msConfig?.configured && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleMicrosoftRemove}
                >
                  {t('settings.microsoft.remove')}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* M365 Group Mappings - only show when Microsoft is configured */}
      {msConfig?.configured && (
        <div className="card mb-3">
          <div className="card-header">
            <h2 className="card-title">{t('settings.m365Groups.title')}</h2>
          </div>
          <div className="card-body">
            <p className="piece-meta mb-3">{t('settings.m365Groups.description')}</p>

            {m365MappingsLoading ? (
              <p>{t('common.loading')}</p>
            ) : (
              <>
                <div className="flex justify-between items-center mb-3">
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setGroupMappingFormData({ orchestraId: '', groupName: '', groupType: 'orchestra' });
                      setShowAddGroupMappingModal(true);
                    }}
                  >
                    + {t('settings.m365Groups.add')}
                  </button>
                </div>

                {m365GroupMappings.length > 0 ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('settings.m365Groups.type')}</th>
                        <th>{t('settings.m365Groups.orchestra')}</th>
                        <th>{t('settings.m365Groups.groupName')}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {m365GroupMappings.map((mapping) => (
                        <tr key={mapping.id}>
                          <td>
                            <span className={`badge ${mapping.groupType === 'percussion' ? 'badge-warning' : mapping.groupType === 'special' ? 'badge-info' : 'badge-success'}`}>
                              {mapping.groupType === 'orchestra' ? t('settings.m365Groups.typeOrchestra') :
                               mapping.groupType === 'percussion' ? t('settings.m365Groups.typePercussion') :
                               t('settings.m365Groups.typeSpecial')}
                            </span>
                          </td>
                          <td>{mapping.orchestraName || '-'}</td>
                          <td><strong>{mapping.groupName}</strong></td>
                          <td>
                            <div className="flex gap-1">
                              <button
                                className="btn btn-outline btn-sm"
                                onClick={() => openEditGroupMappingModal(mapping)}
                              >
                                {t('common.edit')}
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => setDeletingGroupMapping(mapping)}
                              >
                                {t('common.delete')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ color: '#666' }}>
                    {t('settings.m365Groups.noMappings')}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{t('settings.smtp.title')}</h2>
        </div>
        <div className="card-body">
          <p className="piece-meta mb-3">{t('settings.smtp.description')}</p>

          <form onSubmit={handleSmtpSave}>
            <div className="form-group">
              <label htmlFor="smtpHost" className="form-label">
                {t('settings.smtp.host')}
              </label>
              <input
                type="text"
                id="smtpHost"
                className="form-control"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder={t('settings.smtp.hostPlaceholder')}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label htmlFor="smtpPort" className="form-label">
                  {t('settings.smtp.port')}
                </label>
                <input
                  type="number"
                  id="smtpPort"
                  className="form-control"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(Number(e.target.value))}
                  min={1}
                  max={65535}
                />
              </div>
              <div className="form-group" style={{ flex: 1, display: 'flex', alignItems: 'flex-end', paddingBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={smtpSecure}
                    onChange={(e) => setSmtpSecure(e.target.checked)}
                  />
                  {t('settings.smtp.secure')}
                </label>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="smtpUser" className="form-label">
                {t('settings.smtp.user')}
              </label>
              <input
                type="text"
                id="smtpUser"
                className="form-control"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder={t('settings.smtp.userPlaceholder')}
              />
            </div>

            <div className="form-group">
              <label htmlFor="smtpPassword" className="form-label">
                {t('settings.smtp.password')}
              </label>
              <input
                type="password"
                id="smtpPassword"
                className="form-control"
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                placeholder={smtpConfig?.configured ? t('settings.smtp.passwordUnchanged') : t('settings.smtp.passwordPlaceholder')}
              />
            </div>

            <div className="form-group">
              <label htmlFor="smtpFrom" className="form-label">
                {t('settings.smtp.from')}
              </label>
              <input
                type="text"
                id="smtpFrom"
                className="form-control"
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
                placeholder={t('settings.smtp.fromPlaceholder')}
              />
              <p className="piece-meta" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {t('settings.smtp.fromHelp')}
              </p>
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={smtpEnabled}
                  onChange={(e) => setSmtpEnabled(e.target.checked)}
                />
                {t('settings.smtp.enabled')}
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={smtpSaving}
              >
                {smtpSaving ? t('common.loading') : t('common.save')}
              </button>
              {smtpConfig?.configured && (
                <>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleSmtpTest}
                    disabled={smtpTesting}
                  >
                    {smtpTesting ? t('common.loading') : t('settings.smtp.test')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleSmtpRemove}
                  >
                    {t('settings.smtp.remove')}
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-header">
          <h2 className="card-title">{t('settings.concertTypes.title')}</h2>
        </div>
        <div className="card-body">
          <p className="piece-meta mb-3">{t('settings.concertTypes.description')}</p>

          {concertTypesLoading ? (
            <p>{t('common.loading')}</p>
          ) : (
            <>
              <div className="flex justify-between items-center mb-3">
                <div className="flex gap-2">
                  <button
                    className="btn btn-primary"
                    onClick={() => setShowAddConcertTypeModal(true)}
                  >
                    + {t('settings.concertTypes.add')}
                  </button>
                  {(!concertTypesData?.types || concertTypesData.types.length === 0) && (
                    <button
                      className="btn btn-outline"
                      onClick={handleInitDefaults}
                      disabled={initDefaultsMutation.isPending}
                    >
                      {initDefaultsMutation.isPending ? t('common.loading') : t('settings.concertTypes.initDefaults')}
                    </button>
                  )}
                </div>
              </div>

              {concertTypesData?.types && concertTypesData.types.length > 0 ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('settings.concertTypes.value')}</th>
                      <th>{t('settings.concertTypes.label')}</th>
                      <th>{t('settings.concertTypes.sortOrder')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {concertTypesData.types.map((type) => (
                      <tr key={type.id}>
                        <td><code>{type.value}</code></td>
                        <td><strong>{type.label}</strong></td>
                        <td>{type.sortOrder}</td>
                        <td>
                          <div className="flex gap-1">
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => openEditConcertTypeModal(type)}
                            >
                              {t('common.edit')}
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => setDeletingConcertType({ id: type.id, label: type.label })}
                            >
                              {t('common.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: '#666' }}>
                  {t('settings.concertTypes.noTypes')}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add/Edit Concert Type Modal */}
      {(showAddConcertTypeModal || editingConcertType) && (
        <FormModal
          title={editingConcertType ? t('settings.concertTypes.edit') : t('settings.concertTypes.add')}
          onClose={() => {
            setShowAddConcertTypeModal(false);
            setEditingConcertType(null);
            setConcertTypeFormData({ value: '', label: '', sortOrder: 0 });
          }}
          onSubmit={editingConcertType ? handleUpdateConcertType : handleCreateConcertType}
          isSubmitting={createConcertTypeMutation.isPending || updateConcertTypeMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">{t('settings.concertTypes.value')} *</label>
            <input
              type="text"
              className="form-control"
              value={concertTypeFormData.value}
              onChange={(e) => setConcertTypeFormData({ ...concertTypeFormData, value: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
              placeholder="bijv. christmas, summer, concert"
              required
            />
            <small style={{ color: '#666' }}>{t('settings.concertTypes.valueHelp')}</small>
          </div>
          <div className="form-group">
            <label className="form-label">{t('settings.concertTypes.label')} *</label>
            <input
              type="text"
              className="form-control"
              value={concertTypeFormData.label}
              onChange={(e) => setConcertTypeFormData({ ...concertTypeFormData, label: e.target.value })}
              placeholder="bijv. Kerstconcert, Zomerconcert"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('settings.concertTypes.sortOrder')}</label>
            <input
              type="number"
              className="form-control"
              value={concertTypeFormData.sortOrder}
              onChange={(e) => setConcertTypeFormData({ ...concertTypeFormData, sortOrder: parseInt(e.target.value) || 0 })}
              min="0"
            />
          </div>
        </FormModal>
      )}

      {/* Delete Concert Type Confirmation */}
      {deletingConcertType && (
        <ConfirmDialog
          title={t('common.delete')}
          message={t('settings.concertTypes.deleteConfirm', { label: deletingConcertType.label })}
          confirmLabel={t('common.delete')}
          onConfirm={handleDeleteConcertType}
          onCancel={() => setDeletingConcertType(null)}
          isLoading={deleteConcertTypeMutation.isPending}
          variant="danger"
        />
      )}

      {/* Add/Edit M365 Group Mapping Modal */}
      {(showAddGroupMappingModal || editingGroupMapping) && (
        <FormModal
          title={editingGroupMapping ? t('settings.m365Groups.edit') : t('settings.m365Groups.add')}
          onClose={() => {
            setShowAddGroupMappingModal(false);
            setEditingGroupMapping(null);
            setGroupMappingFormData({ orchestraId: '', groupName: '', groupType: 'orchestra' });
          }}
          onSubmit={editingGroupMapping ? handleUpdateGroupMapping : handleCreateGroupMapping}
          isSubmitting={groupMappingSaving}
        >
          {!editingGroupMapping && (
            <div className="form-group">
              <label className="form-label">{t('settings.m365Groups.type')} *</label>
              <select
                className="form-control"
                value={groupMappingFormData.groupType}
                onChange={(e) => setGroupMappingFormData({
                  ...groupMappingFormData,
                  groupType: e.target.value as 'orchestra' | 'percussion' | 'special',
                  orchestraId: e.target.value !== 'orchestra' ? '' : groupMappingFormData.orchestraId,
                })}
                required
              >
                <option value="orchestra">{t('settings.m365Groups.typeOrchestra')}</option>
                <option value="percussion" disabled={hasPercussionGroup}>{t('settings.m365Groups.typePercussion')}</option>
              </select>
            </div>
          )}

          {!editingGroupMapping && groupMappingFormData.groupType === 'orchestra' && (
            <div className="form-group">
              <label className="form-label">{t('settings.m365Groups.orchestra')} *</label>
              <select
                className="form-control"
                value={groupMappingFormData.orchestraId}
                onChange={(e) => setGroupMappingFormData({ ...groupMappingFormData, orchestraId: e.target.value })}
                required
              >
                <option value="">{t('settings.m365Groups.selectOrchestra')}</option>
                {availableOrchestras.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">{t('settings.m365Groups.groupName')} *</label>
            <input
              type="text"
              className="form-control"
              value={groupMappingFormData.groupName}
              onChange={(e) => setGroupMappingFormData({ ...groupMappingFormData, groupName: e.target.value })}
              placeholder={t('settings.m365Groups.groupNamePlaceholder')}
              required
            />
            <small style={{ color: '#666' }}>{t('settings.m365Groups.groupNameHelp')}</small>
          </div>
        </FormModal>
      )}

      {/* Delete M365 Group Mapping Confirmation */}
      {deletingGroupMapping && (
        <ConfirmDialog
          title={t('common.delete')}
          message={t('settings.m365Groups.deleteConfirm', { groupName: deletingGroupMapping.groupName })}
          confirmLabel={t('common.delete')}
          onConfirm={handleDeleteGroupMapping}
          onCancel={() => setDeletingGroupMapping(null)}
          variant="danger"
        />
      )}
    </div>
  );
}
