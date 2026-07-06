import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { showSuccess, showError } from '../utils/toast';
import { ConfirmDialog } from './ConfirmDialog';
import {
  getNotificationChannels,
  getNotificationPreferences,
  updateNotificationPreferences,
  getTelegramLinkUrl,
  unlinkTelegram,
  linkWhatsApp,
  verifyWhatsApp,
  unlinkWhatsApp,
  type NotificationChannel,
  type NotificationPreferences as Preferences,
} from '../api';

interface Props {
  onClose?: () => void;
}

export default function NotificationPreferences({ onClose }: Props) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [preferences, setPreferences] = useState<Preferences | null>(null);

  // Telegram linking
  const [telegramLinkUrl, setTelegramLinkUrl] = useState<string | null>(null);
  const [telegramLinkCode, setTelegramLinkCode] = useState<string | null>(null);
  const [isLinkingTelegram, setIsLinkingTelegram] = useState(false);
  const [isUnlinkingTelegram, setIsUnlinkingTelegram] = useState(false);

  // WhatsApp linking
  const [whatsAppPhone, setWhatsAppPhone] = useState('');
  const [whatsAppVerificationCode, setWhatsAppVerificationCode] = useState('');
  const [isLinkingWhatsApp, setIsLinkingWhatsApp] = useState(false);
  const [isVerifyingWhatsApp, setIsVerifyingWhatsApp] = useState(false);
  const [isUnlinkingWhatsApp, setIsUnlinkingWhatsApp] = useState(false);
  const [whatsAppPendingVerification, setWhatsAppPendingVerification] = useState(false);

  // Unlink confirmation dialog ('telegram' | 'whatsapp' | null)
  const [confirmAction, setConfirmAction] = useState<null | 'telegram' | 'whatsapp'>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [channelsData, prefsData] = await Promise.all([getNotificationChannels(), getNotificationPreferences()]);
      setChannels(channelsData);
      setPreferences(prefsData);
    } catch (error) {
      console.error('Failed to load notification preferences:', error);
      showError(t('notificationPrefs.loadError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!preferences) return;

    setIsSaving(true);
    try {
      await updateNotificationPreferences({
        emailEnabled: preferences.channels.email.enabled,
        pushEnabled: preferences.channels.push.enabled,
        whatsappEnabled: preferences.channels.whatsapp.enabled,
        telegramEnabled: preferences.channels.telegram.enabled,
        newMusic: preferences.notificationTypes.new_music?.enabled ?? true,
        rehearsalChanges: preferences.notificationTypes.rehearsal_change?.enabled ?? true,
        seatingUpdates: preferences.notificationTypes.seating_update?.enabled ?? true,
        chatMessages: preferences.notificationTypes.chat_message?.enabled ?? true,
        practiceReminders: preferences.notificationTypes.practice_reminder?.enabled ?? true,
        concertReminders: preferences.notificationTypes.concert_reminder?.enabled ?? true,
      });
      showSuccess(t('notificationPrefs.saved'));
      onClose?.();
    } catch (error) {
      console.error('Failed to save preferences:', error);
      showError(t('notificationPrefs.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleLinkTelegram = async () => {
    setIsLinkingTelegram(true);
    try {
      const result = await getTelegramLinkUrl();
      setTelegramLinkUrl(result.url);
      setTelegramLinkCode(result.code);
    } catch (error: any) {
      showError(error.response?.data?.error || t('notificationPrefs.telegram.linkError'));
    } finally {
      setIsLinkingTelegram(false);
    }
  };

  const handleUnlinkTelegram = async () => {
    setIsUnlinkingTelegram(true);
    try {
      await unlinkTelegram();
      await loadData();
      setTelegramLinkUrl(null);
      setTelegramLinkCode(null);
      showSuccess(t('notificationPrefs.telegram.unlinked'));
    } catch (error: any) {
      showError(error.response?.data?.error || t('notificationPrefs.telegram.unlinkError'));
    } finally {
      setIsUnlinkingTelegram(false);
      setConfirmAction(null);
    }
  };

  const handleLinkWhatsApp = async () => {
    if (!whatsAppPhone) {
      showError(t('notificationPrefs.whatsapp.phoneRequired'));
      return;
    }

    setIsLinkingWhatsApp(true);
    try {
      await linkWhatsApp(whatsAppPhone);
      setWhatsAppPendingVerification(true);
      showSuccess(t('notificationPrefs.whatsapp.codeSent'));
    } catch (error: any) {
      showError(error.response?.data?.error || t('notificationPrefs.whatsapp.linkError'));
    } finally {
      setIsLinkingWhatsApp(false);
    }
  };

  const handleVerifyWhatsApp = async () => {
    if (!whatsAppVerificationCode) {
      showError(t('notificationPrefs.whatsapp.codeRequired'));
      return;
    }

    setIsVerifyingWhatsApp(true);
    try {
      await verifyWhatsApp(whatsAppVerificationCode);
      await loadData();
      setWhatsAppPendingVerification(false);
      setWhatsAppPhone('');
      setWhatsAppVerificationCode('');
      showSuccess(t('notificationPrefs.whatsapp.verified'));
    } catch (error: any) {
      showError(error.response?.data?.error || t('notificationPrefs.whatsapp.verifyError'));
    } finally {
      setIsVerifyingWhatsApp(false);
    }
  };

  const handleUnlinkWhatsApp = async () => {
    setIsUnlinkingWhatsApp(true);
    try {
      await unlinkWhatsApp();
      await loadData();
      showSuccess(t('notificationPrefs.whatsapp.unlinked'));
    } catch (error: any) {
      showError(error.response?.data?.error || t('notificationPrefs.whatsapp.unlinkError'));
    } finally {
      setIsUnlinkingWhatsApp(false);
      setConfirmAction(null);
    }
  };

  const toggleChannel = (channel: 'email' | 'push' | 'whatsapp' | 'telegram') => {
    if (!preferences) return;
    setPreferences({
      ...preferences,
      channels: {
        ...preferences.channels,
        [channel]: {
          ...preferences.channels[channel],
          enabled: !preferences.channels[channel].enabled,
        },
      },
    });
  };

  const toggleNotificationType = (type: string) => {
    if (!preferences) return;
    const currentType = preferences.notificationTypes[type as keyof typeof preferences.notificationTypes];
    setPreferences({
      ...preferences,
      notificationTypes: {
        ...preferences.notificationTypes,
        [type]: {
          ...currentType,
          enabled: !(currentType?.enabled ?? true),
        },
      },
    });
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading">{t('common.loading')}</div>
      </div>
    );
  }

  const notificationTypes = [
    { key: 'new_music', label: t('notificationPrefs.types.newMusic') },
    { key: 'rehearsal_change', label: t('notificationPrefs.types.rehearsalChanges') },
    { key: 'seating_update', label: t('notificationPrefs.types.seatingUpdates') },
    { key: 'chat_message', label: t('notificationPrefs.types.chatMessages') },
    { key: 'practice_reminder', label: t('notificationPrefs.types.practiceReminders') },
    { key: 'concert_reminder', label: t('notificationPrefs.types.concertReminders') },
  ];

  return (
    <div className="notification-preferences">
      <h3>{t('notificationPrefs.title')}</h3>
      <p className="text-muted mb-3">{t('notificationPrefs.description')}</p>

      {/* Notification Channels Section */}
      <div className="card mb-3">
        <div className="card-header">
          <span className="card-title">{t('notificationPrefs.channels.title')}</span>
        </div>
        <div className="card-body">
          {/* Email */}
          <div className="channel-item">
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={preferences?.channels.email.enabled ?? true}
                onChange={() => toggleChannel('email')}
              />
              <span>
                <strong>{t('notificationPrefs.channels.email')}</strong>
                {preferences?.channels.email.address && (
                  <span className="text-muted ml-2">({preferences.channels.email.address})</span>
                )}
              </span>
            </label>
          </div>

          {/* Push Notifications */}
          <div className="channel-item">
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={preferences?.channels.push.enabled ?? true}
                onChange={() => toggleChannel('push')}
                disabled={!channels.find((c) => c.channel === 'push')?.configured}
              />
              <span>
                <strong>{t('notificationPrefs.channels.push')}</strong>
                {!channels.find((c) => c.channel === 'push')?.configured && (
                  <span className="text-muted ml-2">({t('notificationPrefs.channels.notConfigured')})</span>
                )}
              </span>
            </label>
          </div>

          {/* Telegram */}
          <div className="channel-item">
            <div className="channel-header">
              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={preferences?.channels.telegram.enabled ?? false}
                  onChange={() => toggleChannel('telegram')}
                  disabled={!preferences?.channels.telegram.verified}
                />
                <span>
                  <strong>{t('notificationPrefs.channels.telegram')}</strong>
                </span>
              </label>
            </div>

            {channels.find((c) => c.channel === 'telegram')?.configured ? (
              <div className="channel-details ml-4 mt-2">
                {preferences?.channels.telegram.verified ? (
                  <div className="linked-status">
                    <span className="status-badge status-success">{t('notificationPrefs.telegram.linked')}</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary ml-2"
                      onClick={() => setConfirmAction('telegram')}
                      disabled={isUnlinkingTelegram}
                    >
                      {isUnlinkingTelegram ? t('common.loading') : t('notificationPrefs.telegram.unlink')}
                    </button>
                  </div>
                ) : telegramLinkUrl ? (
                  <div className="link-section">
                    <p className="text-muted mb-2">{t('notificationPrefs.telegram.clickLink')}</p>
                    <a
                      href={telegramLinkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary btn-sm"
                    >
                      {t('notificationPrefs.telegram.openTelegram')}
                    </a>
                    <p className="text-muted mt-2" style={{ fontSize: '0.8rem' }}>
                      {t('notificationPrefs.telegram.codeInfo')}: <code>{telegramLinkCode}</code>
                    </p>
                    <button type="button" className="btn btn-sm btn-secondary mt-2" onClick={loadData}>
                      {t('notificationPrefs.telegram.checkStatus')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={handleLinkTelegram}
                    disabled={isLinkingTelegram}
                  >
                    {isLinkingTelegram ? t('common.loading') : t('notificationPrefs.telegram.link')}
                  </button>
                )}
              </div>
            ) : (
              <span className="text-muted ml-4">({t('notificationPrefs.channels.notConfigured')})</span>
            )}
          </div>

          {/* WhatsApp */}
          <div className="channel-item">
            <div className="channel-header">
              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={preferences?.channels.whatsapp.enabled ?? false}
                  onChange={() => toggleChannel('whatsapp')}
                  disabled={!preferences?.channels.whatsapp.verified}
                />
                <span>
                  <strong>{t('notificationPrefs.channels.whatsapp')}</strong>
                </span>
              </label>
            </div>

            {channels.find((c) => c.channel === 'whatsapp')?.configured ? (
              <div className="channel-details ml-4 mt-2">
                {preferences?.channels.whatsapp.verified ? (
                  <div className="linked-status">
                    <span className="status-badge status-success">
                      {t('notificationPrefs.whatsapp.linked')}
                      {preferences.channels.whatsapp.phoneNumber && (
                        <span className="ml-1">({preferences.channels.whatsapp.phoneNumber})</span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary ml-2"
                      onClick={() => setConfirmAction('whatsapp')}
                      disabled={isUnlinkingWhatsApp}
                    >
                      {isUnlinkingWhatsApp ? t('common.loading') : t('notificationPrefs.whatsapp.unlink')}
                    </button>
                  </div>
                ) : whatsAppPendingVerification ? (
                  <div className="verification-section">
                    <p className="text-muted mb-2">{t('notificationPrefs.whatsapp.enterCode')}</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="form-control"
                        value={whatsAppVerificationCode}
                        onChange={(e) => setWhatsAppVerificationCode(e.target.value)}
                        placeholder="123456"
                        maxLength={6}
                        style={{ maxWidth: '120px' }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleVerifyWhatsApp}
                        disabled={isVerifyingWhatsApp}
                      >
                        {isVerifyingWhatsApp ? t('common.loading') : t('notificationPrefs.whatsapp.verify')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setWhatsAppPendingVerification(false)}
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="link-section">
                    <p className="text-muted mb-2">{t('notificationPrefs.whatsapp.enterPhone')}</p>
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        className="form-control"
                        value={whatsAppPhone}
                        onChange={(e) => setWhatsAppPhone(e.target.value)}
                        placeholder="+31612345678"
                        style={{ maxWidth: '180px' }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={handleLinkWhatsApp}
                        disabled={isLinkingWhatsApp}
                      >
                        {isLinkingWhatsApp ? t('common.loading') : t('notificationPrefs.whatsapp.sendCode')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <span className="text-muted ml-4">({t('notificationPrefs.channels.notConfigured')})</span>
            )}
          </div>
        </div>
      </div>

      {/* Notification Types Section */}
      <div className="card mb-3">
        <div className="card-header">
          <span className="card-title">{t('notificationPrefs.types.title')}</span>
        </div>
        <div className="card-body">
          {notificationTypes.map(({ key, label }) => (
            <div key={key} className="notification-type-item">
              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={
                    preferences?.notificationTypes[key as keyof typeof preferences.notificationTypes]?.enabled ?? true
                  }
                  onChange={() => toggleNotificationType(key)}
                />
                <span>{label}</span>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <div className="btn-group">
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? t('common.loading') : t('common.save')}
        </button>
        {onClose && (
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
        )}
      </div>

      <style>{`
        .notification-preferences .channel-item {
          padding: 0.75rem 0;
          border-bottom: 1px solid var(--border-color);
        }
        .notification-preferences .channel-item:last-child {
          border-bottom: none;
        }
        .notification-preferences .notification-type-item {
          padding: 0.5rem 0;
        }
        .notification-preferences .status-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.875rem;
        }
        .notification-preferences .status-success {
          background: var(--success-bg, #d4edda);
          color: var(--success, #155724);
        }
        .notification-preferences .linked-status {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .notification-preferences .ml-1 { margin-left: 0.25rem; }
        .notification-preferences .ml-2 { margin-left: 0.5rem; }
        .notification-preferences .ml-4 { margin-left: 1rem; }
        .notification-preferences .mt-2 { margin-top: 0.5rem; }
        .notification-preferences .mb-2 { margin-bottom: 0.5rem; }
        .notification-preferences .mb-3 { margin-bottom: 1rem; }
        .notification-preferences .gap-2 { gap: 0.5rem; }
        .notification-preferences .flex { display: flex; }
      `}</style>

      {confirmAction && (
        <ConfirmDialog
          title={t('common.confirm')}
          message={
            confirmAction === 'telegram'
              ? t('notificationPrefs.telegram.unlinkConfirm')
              : t('notificationPrefs.whatsapp.unlinkConfirm')
          }
          confirmLabel={t('common.confirm')}
          variant="danger"
          isLoading={confirmAction === 'telegram' ? isUnlinkingTelegram : isUnlinkingWhatsApp}
          onConfirm={confirmAction === 'telegram' ? handleUnlinkTelegram : handleUnlinkWhatsApp}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
