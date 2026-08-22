import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSmtpConfig, saveSmtpConfig, removeSmtpConfig, testSmtpConfig } from '../../api';
import { showSuccess, showError } from '../../utils/toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { foutmelding } from './foutmelding';

/**
 * De uitgaande mailserver.
 *
 * Dit was de zwaarste knoop van de pagina: negen `useState`, een effect en drie
 * handlers, allemaal in de gedeelde functie. Alleen de opmaak verplaatsen zou
 * twintig props hebben opgeleverd; door de query en de toestand mee te verhuizen
 * heeft deze sectie er nul nodig.
 *
 * De query blijft onvoorwaardelijk draaien: deze kaart staat er altijd, dus de
 * gegevens zijn ook altijd nodig.
 */
export function SmtpSectie() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: smtpConfig = null } = useQuery({
    queryKey: ['smtpConfig'],
    queryFn: getSmtpConfig,
    staleTime: 5 * 60 * 1000,
  });

  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [bevestigVerwijderen, setBevestigVerwijderen] = useState(false);

  const ververs = () => void queryClient.invalidateQueries({ queryKey: ['smtpConfig'] });

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
      ververs();
    } catch (error) {
      showError(foutmelding(error, t('settings.smtp.errorSaving')));
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleSmtpRemove = async () => {
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
      ververs();
    } catch (error) {
      showError(foutmelding(error, t('settings.smtp.errorRemoving')));
    }
  };

  const handleSmtpTest = async () => {
    setSmtpTesting(true);
    try {
      const result = await testSmtpConfig();
      showSuccess(result.message);
    } catch (error) {
      showError(foutmelding(error, t('settings.smtp.testFailed')));
    } finally {
      setSmtpTesting(false);
    }
  };

  return (
    <>
      <div className="card mb-3">
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
              <div
                className="form-group"
                style={{ flex: 1, display: 'flex', alignItems: 'flex-end', paddingBottom: '1rem' }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
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
                placeholder={
                  smtpConfig?.configured ? t('settings.smtp.passwordUnchanged') : t('settings.smtp.passwordPlaceholder')
                }
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
                <input type="checkbox" checked={smtpEnabled} onChange={(e) => setSmtpEnabled(e.target.checked)} />
                {t('settings.smtp.enabled')}
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-primary" disabled={smtpSaving}>
                {smtpSaving ? t('common.loading') : t('common.save')}
              </button>
              {smtpConfig?.configured && (
                <>
                  <button type="button" className="btn btn-outline" onClick={handleSmtpTest} disabled={smtpTesting}>
                    {smtpTesting ? t('common.loading') : t('settings.smtp.test')}
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => setBevestigVerwijderen(true)}>
                    {t('settings.smtp.remove')}
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>

      {bevestigVerwijderen && (
        <ConfirmDialog
          title={t('common.delete')}
          message={t('settings.smtp.removeConfirm')}
          confirmLabel={t('common.delete')}
          onConfirm={() => {
            setBevestigVerwijderen(false);
            void handleSmtpRemove();
          }}
          onCancel={() => setBevestigVerwijderen(false)}
          variant="danger"
        />
      )}
    </>
  );
}
