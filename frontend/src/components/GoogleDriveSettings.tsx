import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getGoogleDriveSettings, updateGoogleDriveSettings, deleteGoogleDriveSettings } from '../api';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';
import { ConfirmDialog } from './ConfirmDialog';
import { FormField } from './FormField';

export function GoogleDriveSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const { data: config } = useQuery({
    queryKey: ['googleDriveConfig'],
    queryFn: getGoogleDriveSettings,
  });

  useEffect(() => {
    if (config) {
      setClientId(config.clientId || '');
      setApiKey(config.apiKey || '');
      setEnabled(config.enabled);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: () => updateGoogleDriveSettings({ clientId, apiKey, enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['googleDriveConfig'] });
      showSuccess(t('googleDriveSettings.saved', 'Google Drive instellingen opgeslagen.'));
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteGoogleDriveSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['googleDriveConfig'] });
      setClientId('');
      setApiKey('');
      setEnabled(false);
      showSuccess(t('googleDriveSettings.removed', 'Google Drive instellingen verwijderd.'));
    },
    onError: (error) => showError(getErrorMessage(error)),
    onSettled: () => setConfirmRemove(false),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId.trim() || !apiKey.trim()) {
      showError(t('googleDriveSettings.requiredFields', 'Client ID en API Key zijn verplicht.'));
      return;
    }
    saveMutation.mutate();
  };

  const handleRemove = () => {
    setConfirmRemove(true);
  };

  return (
    <div className="card mt-2">
      <div className="card-header">
        <span className="card-title">{t('googleDriveSettings.title', 'Google Drive integratie')}</span>
      </div>
      <div className="card-body">
        <p className="mb-2">
          {t(
            'googleDriveSettings.description',
            'Sta gebruikers toe om bladmuziek te importeren vanuit Google Drive. Maak een OAuth Client ID en API Key aan in de Google Cloud Console.',
          )}
        </p>
        <p className="mb-2">
          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">
            {t('googleDriveSettings.consoleLink', 'Open Google Cloud Console →')}
          </a>
        </p>
        <form onSubmit={handleSubmit}>
          <FormField label={t('googleDriveSettings.clientId', 'OAuth Client ID')}>
            <input
              type="text"
              className="form-control"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="123456789-abc.apps.googleusercontent.com"
              autoComplete="off"
            />
          </FormField>
          <FormField label={t('googleDriveSettings.apiKey', 'API Key')}>
            <input
              type="password"
              className="form-control"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza..."
              autoComplete="off"
            />
          </FormField>
          <div className="form-group">
            <label className="form-check">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />{' '}
              {t('googleDriveSettings.enable', 'Google Drive import inschakelen')}
            </label>
          </div>
          <div className="flex gap-1">
            <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? t('common.saving', 'Opslaan...') : t('common.save')}
            </button>
            {config?.configured && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleRemove}
                disabled={deleteMutation.isPending}
              >
                {t('common.remove', 'Verwijderen')}
              </button>
            )}
          </div>
        </form>
      </div>
      {confirmRemove && (
        <ConfirmDialog
          title={t('common.confirmDeleteTitle')}
          message={t('googleDriveSettings.confirmRemove', 'Weet je zeker dat je deze instellingen wilt verwijderen?')}
          confirmLabel={t('common.delete')}
          variant="danger"
          isLoading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setConfirmRemove(false)}
        />
      )}
    </div>
  );
}
