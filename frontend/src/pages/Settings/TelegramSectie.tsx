import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getTelegramConfig, saveTelegramConfig, deleteTelegramConfig } from '../../api';
import { showSuccess, showError } from '../../utils/toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { foutmelding } from './foutmelding';

/**
 * Meldingen via een Telegram-bot.
 *
 * Query en toestand horen bij deze kaart. De kaart staat er altijd, dus de query
 * heeft geen `enabled` nodig.
 */
export function TelegramSectie() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: telegramConfig = null } = useQuery({
    queryKey: ['telegramConfig'],
    queryFn: getTelegramConfig,
    staleTime: 5 * 60 * 1000,
  });

  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramSaving, setTelegramSaving] = useState(false);
  const [bevestigVerwijderen, setBevestigVerwijderen] = useState(false);

  const ververs = () => void queryClient.invalidateQueries({ queryKey: ['telegramConfig'] });

  useEffect(() => {
    if (telegramConfig) {
      setTelegramEnabled(telegramConfig.enabled || false);
    }
  }, [telegramConfig]);

  const handleTelegramSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setTelegramSaving(true);
    try {
      const result = await saveTelegramConfig({
        botToken: telegramBotToken.trim() || undefined,
        enabled: telegramEnabled,
      });
      showSuccess(result.message || t('settings.telegram.saved'));
      setTelegramBotToken('');
      ververs();
    } catch (error) {
      showError(foutmelding(error, t('settings.telegram.errorSaving')));
    } finally {
      setTelegramSaving(false);
    }
  };

  const handleTelegramDelete = async () => {
    try {
      const result = await deleteTelegramConfig();
      showSuccess(result.message || t('settings.telegram.deleted'));
      setTelegramBotToken('');
      setTelegramEnabled(false);
      ververs();
    } catch (error) {
      showError(foutmelding(error, t('settings.telegram.errorRemoving')));
    }
  };

  return (
    <>
      <div className="card mb-3">
        <div className="card-header">
          <h2 className="card-title">{t('settings.telegram.title')}</h2>
        </div>
        <div className="card-body">
          <p className="piece-meta mb-3">{t('settings.telegram.description')}</p>

          <form onSubmit={handleTelegramSave}>
            <div className="form-group">
              <label htmlFor="telegramBotToken" className="form-label">
                {t('settings.telegram.botToken')}
              </label>
              <input
                type="password"
                id="telegramBotToken"
                className="form-control"
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
                placeholder={
                  telegramConfig?.configured && telegramConfig.tokenPreview
                    ? telegramConfig.tokenPreview
                    : t('settings.telegram.botTokenPlaceholder')
                }
              />
              <p className="piece-meta" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                {t('settings.telegram.botTokenHelp')}{' '}
                <a href="https://core.telegram.org/bots#6-botfather" target="_blank" rel="noopener noreferrer">
                  BotFather
                </a>
              </p>
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={telegramEnabled}
                  onChange={(e) => setTelegramEnabled(e.target.checked)}
                />
                {t('settings.telegram.enable')}
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={telegramSaving}>
                {telegramSaving ? t('common.loading') : t('common.save')}
              </button>
              {telegramConfig?.configured && (
                <button type="button" className="btn btn-outline" onClick={() => setBevestigVerwijderen(true)}>
                  {t('settings.telegram.remove')}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {bevestigVerwijderen && (
        <ConfirmDialog
          title={t('common.delete')}
          message={t('settings.telegram.removeConfirm')}
          confirmLabel={t('common.delete')}
          onConfirm={() => {
            setBevestigVerwijderen(false);
            void handleTelegramDelete();
          }}
          onCancel={() => setBevestigVerwijderen(false)}
          variant="danger"
        />
      )}
    </>
  );
}
