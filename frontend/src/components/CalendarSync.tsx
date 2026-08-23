import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
  getCalendarSettings,
  updateCalendarSettings,
  regenerateCalendarFeed,
  startGoogleAuth,
  disconnectGoogle,
  syncGoogleCalendar,
} from '../api';
import { showSuccess, showError } from '../utils/toast';
import { ConfirmDialog } from './ConfirmDialog';

interface CalendarSettings {
  feedUrl: string;
  includeRehearsals: boolean;
  includeConcerts: boolean;
  googleConnected: boolean;
  googleCalendarId: string | null;
  lastSync: string | null;
}

export function CalendarSync() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [settings, setSettings] = useState<CalendarSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showAppleInstructions, setShowAppleInstructions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | 'regenerate' | 'disconnect'>(null);

  useEffect(() => {
    loadSettings();

    // Handle OAuth callback results
    const calendarConnected = searchParams.get('calendar_connected');
    const calendarError = searchParams.get('calendar_error');

    if (calendarConnected === 'true') {
      showSuccess(t('calendar.googleConnected'));
      searchParams.delete('calendar_connected');
      setSearchParams(searchParams);
      loadSettings();
    }

    if (calendarError) {
      const errorMessages: Record<string, string> = {
        denied: t('calendar.errors.denied'),
        invalid: t('calendar.errors.invalid'),
        expired: t('calendar.errors.expired'),
        user_not_found: t('calendar.errors.userNotFound'),
        not_configured: t('calendar.errors.notConfigured'),
        token_exchange: t('calendar.errors.tokenExchange'),
      };
      showError(errorMessages[calendarError] || t('calendar.errors.unknown'));
      searchParams.delete('calendar_error');
      setSearchParams(searchParams);
    }
  }, []);

  const loadSettings = async () => {
    try {
      const data = await getCalendarSettings();
      setSettings(data);
    } catch (error: any) {
      console.error('Failed to load calendar settings:', error);
      // Zonder melding toont dit scherm een leeg feed-veld en de knop "koppel
      // Google", precies alsof het lid nog niets had ingesteld. Dat is niet te
      // onderscheiden van een echte lege stand, dus zeg dat het ophalen misging.
      showError(t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyFeedUrl = async () => {
    if (!settings?.feedUrl) return;
    try {
      await navigator.clipboard.writeText(settings.feedUrl);
      setCopied(true);
      showSuccess(t('calendar.feedCopied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showError(t('calendar.copyFailed'));
    }
  };

  const handleRegenerateFeed = async () => {
    setIsRegenerating(true);
    try {
      const data = await regenerateCalendarFeed();
      setSettings((prev) => (prev ? { ...prev, feedUrl: data.feedUrl } : null));
      showSuccess(t('calendar.feedRegenerated'));
    } catch (error: any) {
      showError(error.response?.data?.error || t('common.error'));
    } finally {
      setIsRegenerating(false);
      setConfirmAction(null);
    }
  };

  const handleToggleSetting = async (setting: 'includeRehearsals' | 'includeConcerts') => {
    if (!settings) return;
    const newValue = !settings[setting];

    try {
      await updateCalendarSettings({ [setting]: newValue });
      setSettings((prev) => (prev ? { ...prev, [setting]: newValue } : null));
      showSuccess(t('calendar.settingsUpdated'));
    } catch (error: any) {
      showError(error.response?.data?.error || t('common.error'));
    }
  };

  const handleConnectGoogle = async () => {
    try {
      const { authUrl } = await startGoogleAuth();
      window.location.href = authUrl;
    } catch (error: any) {
      showError(error.response?.data?.error || t('calendar.errors.notConfigured'));
    }
  };

  const handleDisconnectGoogle = async () => {
    setConfirmAction(null);
    try {
      await disconnectGoogle();
      setSettings((prev) =>
        prev ? { ...prev, googleConnected: false, googleCalendarId: null, lastSync: null } : null,
      );
      showSuccess(t('calendar.googleDisconnected'));
    } catch (error: any) {
      showError(error.response?.data?.error || t('common.error'));
    }
  };

  const handleSyncGoogle = async () => {
    setIsSyncing(true);
    try {
      const result = await syncGoogleCalendar();
      showSuccess(result.message);
      loadSettings();
    } catch (error: any) {
      showError(error.response?.data?.error || t('common.error'));
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return <div className="text-center py-4">{t('common.loading')}</div>;
  }

  return (
    <div>
      <h3>{t('calendar.title')}</h3>
      <p className="mb-3" style={{ color: 'var(--text-light)' }}>
        {t('calendar.description')}
      </p>

      {/* iCal Feed Section */}
      <div className="card mb-3">
        <div className="card-header">
          <span className="card-title">{t('calendar.feedTitle')}</span>
        </div>
        <div className="card-body">
          <p className="mb-2" style={{ color: 'var(--text-light)' }}>
            {t('calendar.feedDescription')}
          </p>

          {/* Feed URL */}
          <div className="flex gap-2 mb-3" style={{ alignItems: 'stretch' }}>
            <input
              type="text"
              className="form-control"
              value={settings?.feedUrl || ''}
              readOnly
              style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
            <button
              className={`btn ${copied ? 'btn-success' : 'btn-primary'}`}
              onClick={handleCopyFeedUrl}
              style={{ whiteSpace: 'nowrap' }}
            >
              {copied ? t('calendar.copied') : t('calendar.copy')}
            </button>
          </div>

          {/* Include options */}
          <div className="mb-3">
            <label className="flex gap-2" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings?.includeRehearsals ?? true}
                onChange={() => handleToggleSetting('includeRehearsals')}
              />
              <span>{t('calendar.includeRehearsals')}</span>
            </label>
            <label className="flex gap-2 mt-1" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings?.includeConcerts ?? true}
                onChange={() => handleToggleSetting('includeConcerts')}
              />
              <span>{t('calendar.includeConcerts')}</span>
            </label>
          </div>

          {/* Regenerate button */}
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setConfirmAction('regenerate')}
            disabled={isRegenerating}
          >
            {isRegenerating ? t('calendar.regenerating') : t('calendar.regenerateFeed')}
          </button>
          <p className="mt-1" style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>
            {t('calendar.regenerateNote')}
          </p>
        </div>
      </div>

      {/* Apple Calendar Instructions */}
      <div className="card mb-3">
        <div className="card-header">
          <span className="card-title">{t('calendar.appleTitle')}</span>
        </div>
        <div className="card-body">
          <button className="btn btn-outline" onClick={() => setShowAppleInstructions(!showAppleInstructions)}>
            {showAppleInstructions ? t('calendar.hideInstructions') : t('calendar.showInstructions')}
          </button>

          {showAppleInstructions && (
            <div className="mt-3">
              <h4 style={{ marginBottom: '0.5rem' }}>{t('calendar.appleInstructions.mac')}</h4>
              <ol style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                <li>{t('calendar.appleInstructions.macStep1')}</li>
                <li>{t('calendar.appleInstructions.macStep2')}</li>
                <li>{t('calendar.appleInstructions.macStep3')}</li>
                <li>{t('calendar.appleInstructions.macStep4')}</li>
              </ol>

              <h4 style={{ marginBottom: '0.5rem' }}>{t('calendar.appleInstructions.iphone')}</h4>
              <ol style={{ paddingLeft: '1.5rem' }}>
                <li>{t('calendar.appleInstructions.iphoneStep1')}</li>
                <li>{t('calendar.appleInstructions.iphoneStep2')}</li>
                <li>{t('calendar.appleInstructions.iphoneStep3')}</li>
                <li>{t('calendar.appleInstructions.iphoneStep4')}</li>
              </ol>
            </div>
          )}
        </div>
      </div>

      {/* Google Calendar Section */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">{t('calendar.googleTitle')}</span>
        </div>
        <div className="card-body">
          {settings?.googleConnected ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span style={{ color: 'var(--success)' }}>{t('calendar.googleConnectedStatus')}</span>
              </div>

              {settings.lastSync && (
                <p className="mb-2" style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>
                  {t('calendar.lastSync')}: {new Date(settings.lastSync).toLocaleString()}
                </p>
              )}

              <div className="flex gap-2">
                <button className="btn btn-primary" onClick={handleSyncGoogle} disabled={isSyncing}>
                  {isSyncing ? t('calendar.syncing') : t('calendar.syncNow')}
                </button>
                <button className="btn btn-outline" onClick={() => setConfirmAction('disconnect')}>
                  {t('calendar.disconnect')}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mb-2" style={{ color: 'var(--text-light)' }}>
                {t('calendar.googleDescription')}
              </p>
              <button className="btn btn-primary" onClick={handleConnectGoogle}>
                {t('calendar.connectGoogle')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Regenerate / Disconnect Confirmation */}
      {confirmAction && (
        <ConfirmDialog
          title={t('common.confirm')}
          message={confirmAction === 'regenerate' ? t('calendar.regenerateConfirm') : t('calendar.disconnectConfirm')}
          confirmLabel={t('common.confirm')}
          variant={confirmAction === 'regenerate' ? 'warning' : 'danger'}
          isLoading={confirmAction === 'regenerate' && isRegenerating}
          onConfirm={confirmAction === 'regenerate' ? handleRegenerateFeed : handleDisconnectGoogle}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

/**
 * AddToCalendar button component for rehearsals and concerts
 */
interface AddToCalendarButtonProps {
  type: 'rehearsal' | 'concert';
  id: string;
}

export function AddToCalendarButton({ type, id }: AddToCalendarButtonProps) {
  const { t } = useTranslation();
  const [showMenu, setShowMenu] = useState(false);

  const handleDownloadIcs = () => {
    const url = `/api/calendar/export/${type}/${id}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-${id}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setShowMenu(false);
  };

  const handleAddToGoogle = () => {
    // Open Google Calendar's import page
    const googleUrl = `https://calendar.google.com/calendar/r/settings/export`;
    window.open(googleUrl, '_blank');

    // Also download the ICS file
    handleDownloadIcs();
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="btn btn-sm btn-outline"
        onClick={() => setShowMenu(!showMenu)}
        title={t('calendar.addToCalendar')}
      >
        {t('calendar.addToCalendar')}
      </button>

      {showMenu && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999,
            }}
            onClick={() => setShowMenu(false)}
          />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '0.25rem',
              backgroundColor: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '0.5rem',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              zIndex: 1000,
              minWidth: '180px',
            }}
          >
            <button
              className="btn-menu-item"
              onClick={handleDownloadIcs}
              style={{
                display: 'block',
                width: '100%',
                padding: '0.75rem 1rem',
                textAlign: 'left',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
              }}
            >
              {t('calendar.downloadIcs')}
            </button>
            <button
              className="btn-menu-item"
              onClick={handleAddToGoogle}
              style={{
                display: 'block',
                width: '100%',
                padding: '0.75rem 1rem',
                textAlign: 'left',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
              }}
            >
              {t('calendar.addToGoogle')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
