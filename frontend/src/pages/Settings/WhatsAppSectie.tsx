import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getWhatsAppConfig, saveWhatsAppConfig, deleteWhatsAppConfig } from '../../api';
import { showSuccess, showError } from '../../utils/toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { foutmelding } from './foutmelding';

/**
 * Berichten via WhatsApp, met twee aanbieders om uit te kiezen.
 *
 * De velden van de aanbieder die niet gekozen is blijven gewoon in de toestand
 * staan; alleen de gekozen helft gaat mee in het verzoek. Dat was zo en blijft
 * zo. Query en toestand horen bij deze kaart, die er altijd staat.
 */
export function WhatsAppSectie() {
  const { t } = useTranslation();
  const aanbiederKopId = useId();
  const queryClient = useQueryClient();

  const { data: whatsappConfig = null } = useQuery({
    queryKey: ['whatsappConfig'],
    queryFn: getWhatsAppConfig,
    staleTime: 5 * 60 * 1000,
  });

  const [whatsappProvider, setWhatsappProvider] = useState<'meta' | 'twilio'>('meta');
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappMetaPhoneNumberId, setWhatsappMetaPhoneNumberId] = useState('');
  const [whatsappMetaAccessToken, setWhatsappMetaAccessToken] = useState('');
  const [whatsappTwilioAccountSid, setWhatsappTwilioAccountSid] = useState('');
  const [whatsappTwilioAuthToken, setWhatsappTwilioAuthToken] = useState('');
  const [whatsappTwilioFrom, setWhatsappTwilioFrom] = useState('');
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const [bevestigVerwijderen, setBevestigVerwijderen] = useState(false);

  const ververs = () => void queryClient.invalidateQueries({ queryKey: ['whatsappConfig'] });

  useEffect(() => {
    if (whatsappConfig) {
      setWhatsappProvider(whatsappConfig.provider || 'meta');
      setWhatsappEnabled(whatsappConfig.enabled || false);
      setWhatsappMetaPhoneNumberId(whatsappConfig.meta?.phoneNumberId || '');
      setWhatsappTwilioAccountSid(whatsappConfig.twilio?.accountSid || '');
      setWhatsappTwilioFrom(whatsappConfig.twilio?.whatsappFrom || '');
    }
  }, [whatsappConfig]);

  const handleWhatsAppSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setWhatsappSaving(true);
    try {
      const result = await saveWhatsAppConfig({
        provider: whatsappProvider,
        enabled: whatsappEnabled,
        meta:
          whatsappProvider === 'meta'
            ? {
                phoneNumberId: whatsappMetaPhoneNumberId.trim() || undefined,
                accessToken: whatsappMetaAccessToken.trim() || undefined,
              }
            : undefined,
        twilio:
          whatsappProvider === 'twilio'
            ? {
                accountSid: whatsappTwilioAccountSid.trim() || undefined,
                authToken: whatsappTwilioAuthToken.trim() || undefined,
                whatsappFrom: whatsappTwilioFrom.trim() || undefined,
              }
            : undefined,
      });
      showSuccess(result.message || t('settings.whatsapp.saved'));
      setWhatsappMetaAccessToken('');
      setWhatsappTwilioAuthToken('');
      ververs();
    } catch (error) {
      showError(foutmelding(error, t('settings.whatsapp.errorSaving')));
    } finally {
      setWhatsappSaving(false);
    }
  };

  const handleWhatsAppDelete = async () => {
    try {
      const result = await deleteWhatsAppConfig();
      showSuccess(result.message || t('settings.whatsapp.deleted'));
      setWhatsappMetaPhoneNumberId('');
      setWhatsappMetaAccessToken('');
      setWhatsappTwilioAccountSid('');
      setWhatsappTwilioAuthToken('');
      setWhatsappTwilioFrom('');
      setWhatsappEnabled(false);
      ververs();
    } catch (error) {
      showError(foutmelding(error, t('settings.whatsapp.errorRemoving')));
    }
  };

  return (
    <>
      <div className="card mb-3">
        <div className="card-header">
          <h2 className="card-title">{t('settings.whatsapp.title')}</h2>
        </div>
        <div className="card-body">
          <p className="piece-meta mb-3">{t('settings.whatsapp.description')}</p>

          <form onSubmit={handleWhatsAppSave}>
            {/* Geen veldlabel maar een groepskop: hieronder staan twee
                keuzerondjes die elk al in hun eigen label zitten. Voor rondjes
                is role="radiogroup" de juiste groepsrol. */}
            <div className="form-group">
              <span className="form-label" id={aanbiederKopId}>
                {t('settings.whatsapp.provider')}
              </span>
              <div
                role="radiogroup"
                aria-labelledby={aanbiederKopId}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="whatsappProvider"
                    value="meta"
                    checked={whatsappProvider === 'meta'}
                    onChange={() => setWhatsappProvider('meta')}
                  />
                  {t('settings.whatsapp.metaProvider')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="whatsappProvider"
                    value="twilio"
                    checked={whatsappProvider === 'twilio'}
                    onChange={() => setWhatsappProvider('twilio')}
                  />
                  {t('settings.whatsapp.twilioProvider')}
                </label>
              </div>
            </div>

            {whatsappProvider === 'meta' && (
              <>
                <div className="form-group">
                  <label htmlFor="whatsappMetaPhoneNumberId" className="form-label">
                    {t('settings.whatsapp.phoneNumberId')}
                  </label>
                  <input
                    type="text"
                    id="whatsappMetaPhoneNumberId"
                    className="form-control"
                    value={whatsappMetaPhoneNumberId}
                    onChange={(e) => setWhatsappMetaPhoneNumberId(e.target.value)}
                    placeholder={whatsappConfig?.meta?.phoneNumberId || t('settings.whatsapp.phoneNumberIdPlaceholder')}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="whatsappMetaAccessToken" className="form-label">
                    {t('settings.whatsapp.accessToken')}
                  </label>
                  <input
                    type="password"
                    id="whatsappMetaAccessToken"
                    className="form-control"
                    value={whatsappMetaAccessToken}
                    onChange={(e) => setWhatsappMetaAccessToken(e.target.value)}
                    placeholder={
                      whatsappConfig?.meta?.configured && whatsappConfig.meta.accessTokenPreview
                        ? whatsappConfig.meta.accessTokenPreview
                        : t('settings.whatsapp.accessTokenPlaceholder')
                    }
                  />
                </div>
              </>
            )}

            {whatsappProvider === 'twilio' && (
              <>
                <div className="form-group">
                  <label htmlFor="whatsappTwilioAccountSid" className="form-label">
                    {t('settings.whatsapp.accountSid')}
                  </label>
                  <input
                    type="text"
                    id="whatsappTwilioAccountSid"
                    className="form-control"
                    value={whatsappTwilioAccountSid}
                    onChange={(e) => setWhatsappTwilioAccountSid(e.target.value)}
                    placeholder={whatsappConfig?.twilio?.accountSid || t('settings.whatsapp.accountSidPlaceholder')}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="whatsappTwilioAuthToken" className="form-label">
                    {t('settings.whatsapp.authToken')}
                  </label>
                  <input
                    type="password"
                    id="whatsappTwilioAuthToken"
                    className="form-control"
                    value={whatsappTwilioAuthToken}
                    onChange={(e) => setWhatsappTwilioAuthToken(e.target.value)}
                    placeholder={
                      whatsappConfig?.twilio?.configured && whatsappConfig.twilio.authTokenPreview
                        ? whatsappConfig.twilio.authTokenPreview
                        : t('settings.whatsapp.authTokenPlaceholder')
                    }
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="whatsappTwilioFrom" className="form-label">
                    {t('settings.whatsapp.from')}
                  </label>
                  <input
                    type="text"
                    id="whatsappTwilioFrom"
                    className="form-control"
                    value={whatsappTwilioFrom}
                    onChange={(e) => setWhatsappTwilioFrom(e.target.value)}
                    placeholder="whatsapp:+14155238886"
                  />
                  <p className="piece-meta" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {t('settings.whatsapp.fromHelp')}
                  </p>
                </div>
              </>
            )}

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={whatsappEnabled}
                  onChange={(e) => setWhatsappEnabled(e.target.checked)}
                />
                {t('settings.whatsapp.enable')}
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={whatsappSaving}>
                {whatsappSaving ? t('common.loading') : t('common.save')}
              </button>
              {whatsappConfig?.configured && (
                <button type="button" className="btn btn-outline" onClick={() => setBevestigVerwijderen(true)}>
                  {t('settings.whatsapp.remove')}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {bevestigVerwijderen && (
        <ConfirmDialog
          title={t('common.delete')}
          message={t('settings.whatsapp.removeConfirm')}
          confirmLabel={t('common.delete')}
          onConfirm={() => {
            setBevestigVerwijderen(false);
            void handleWhatsAppDelete();
          }}
          onCancel={() => setBevestigVerwijderen(false)}
          variant="danger"
        />
      )}
    </>
  );
}
