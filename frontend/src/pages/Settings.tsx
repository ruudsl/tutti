import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getSettings, updateSettings, uploadLogo, removeLogo } from '../api';
import { showSuccess, showError } from '../utils/toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { AssociationSettings } from '../types';

export default function Settings() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.settings');
  const [settings, setSettings] = useState<AssociationSettings | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await getSettings();
      setSettings(data);
      setDisplayName(data.displayName || '');
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateSettings({ displayName: displayName.trim() || undefined });
      showSuccess(t('settings.saved'));
      await loadSettings();
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
      await loadSettings();
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
      await loadSettings();
      window.dispatchEvent(new Event('settings-updated'));
    } catch (error: any) {
      showError(error.response?.data?.error || t('settings.errorRemovingLogo'));
    }
  };

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

      <div className="card">
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
    </div>
  );
}
