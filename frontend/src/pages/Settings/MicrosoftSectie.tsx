import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { saveMicrosoftConfig, removeMicrosoftConfig } from '../../api';
import { showSuccess, showError } from '../../utils/toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import type { MicrosoftConfig } from '../../types';
import { foutmelding } from './foutmelding';

/**
 * Aanmelden met een Microsoft-account.
 *
 * De opgehaalde configuratie komt als prop binnen en niet uit een eigen query,
 * omdat de pagina er zelf ook naar kijkt: `configured` bepaalt of de sectie met
 * de M365-groepen verschijnt en of die zijn gegevens ophaalt. Eén query op één
 * plek, in plaats van twee componenten die dezelfde sleutel aanvragen.
 *
 * Het formulier zelf - de ingetypte velden, het geheim dat na opslaan weer
 * gewist wordt, de bevestiging voor het weghalen - hoort bij deze sectie.
 */
export function MicrosoftSectie({ config }: { config: MicrosoftConfig | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [msClientId, setMsClientId] = useState('');
  const [msClientSecret, setMsClientSecret] = useState('');
  const [msTenantId, setMsTenantId] = useState('');
  const [msEnabled, setMsEnabled] = useState(false);
  const [msSaving, setMsSaving] = useState(false);
  const [bevestigVerwijderen, setBevestigVerwijderen] = useState(false);

  const ververs = () => void queryClient.invalidateQueries({ queryKey: ['microsoftConfig'] });

  // Neemt de opgehaalde gegevens over in het formulier. Ongewijzigd gedrag: dit
  // effect kijkt alleen naar de query en niet naar de velden zelf, dus het
  // probleem van het naamveld in de organisatiesectie speelt hier niet.
  useEffect(() => {
    if (config) {
      setMsClientId(config.clientId || '');
      setMsTenantId(config.tenantId || '');
      setMsEnabled(config.enabled);
    }
  }, [config]);

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
      ververs();
    } catch (error) {
      showError(foutmelding(error, t('settings.microsoft.errorSaving')));
    } finally {
      setMsSaving(false);
    }
  };

  const handleMicrosoftRemove = async () => {
    try {
      await removeMicrosoftConfig();
      showSuccess(t('settings.microsoft.removed'));
      setMsClientId('');
      setMsClientSecret('');
      setMsTenantId('');
      setMsEnabled(false);
      ververs();
    } catch (error) {
      showError(foutmelding(error, t('settings.microsoft.errorRemoving')));
    }
  };

  return (
    <>
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
                placeholder={
                  config?.configured
                    ? t('settings.microsoft.secretUnchanged')
                    : t('settings.microsoft.clientSecretPlaceholder')
                }
              />
            </div>

            {config?.configured && (
              <div className="form-group">
                <label className="form-label">{t('settings.microsoft.redirectUri')}</label>
                <input
                  type="text"
                  className="form-control"
                  value={config.redirectUri}
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
                <input type="checkbox" checked={msEnabled} onChange={(e) => setMsEnabled(e.target.checked)} />
                {t('settings.microsoft.enabled')}
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={msSaving}>
                {msSaving ? t('common.loading') : t('common.save')}
              </button>
              {config?.configured && (
                <button type="button" className="btn btn-outline" onClick={() => setBevestigVerwijderen(true)}>
                  {t('settings.microsoft.remove')}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {bevestigVerwijderen && (
        <ConfirmDialog
          title={t('common.delete')}
          message={t('settings.microsoft.removeConfirm')}
          confirmLabel={t('common.delete')}
          onConfirm={() => {
            setBevestigVerwijderen(false);
            void handleMicrosoftRemove();
          }}
          onCancel={() => setBevestigVerwijderen(false)}
          variant="danger"
        />
      )}
    </>
  );
}
