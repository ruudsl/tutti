import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { showSuccess, showError } from '../utils/toast';
import {
  getSeatingNotificationSettings,
  saveSeatingNotificationSettings,
  deleteSeatingNotificationSettings,
  sendSeatingNotification,
  type SeatingNotificationSettings as NotificationSettings,
} from '../api';

interface Props {
  orchestraId: string;
  rehearsalId?: string;
  onCaptureImage?: () => Promise<string | undefined>;
}

export default function SeatingNotificationSettings({ orchestraId, rehearsalId, onCaptureImage }: Props) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const [formData, setFormData] = useState({
    webhook_url: '',
    minutes_before: 15,
    enabled: true,
    include_image: true,
    message_template: '',
  });

  useEffect(() => {
    loadSettings();
  }, [orchestraId]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const data = await getSeatingNotificationSettings(orchestraId);
      setSettings(data);
      if (data) {
        setFormData({
          webhook_url: data.webhook_url,
          minutes_before: data.minutes_before,
          enabled: data.enabled,
          include_image: data.include_image,
          message_template: data.message_template || '',
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const result = await saveSeatingNotificationSettings(orchestraId, {
        webhook_url: formData.webhook_url,
        minutes_before: formData.minutes_before,
        enabled: formData.enabled,
        include_image: formData.include_image,
        message_template: formData.message_template || undefined,
      });
      setSettings(result);
      showSuccess(t('seating.notifications.saved'));
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('seating.notifications.deleteConfirm'))) return;
    try {
      await deleteSeatingNotificationSettings(orchestraId);
      setSettings(null);
      setFormData({
        webhook_url: '',
        minutes_before: 15,
        enabled: true,
        include_image: true,
        message_template: '',
      });
      showSuccess(t('seating.notifications.deleted'));
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    }
  };

  const handleTestSend = async () => {
    if (!rehearsalId) {
      showError(t('seating.notifications.selectRehearsalFirst'));
      return;
    }

    setIsSending(true);
    try {
      let imageBase64: string | undefined;
      if (onCaptureImage && formData.include_image) {
        imageBase64 = await onCaptureImage();
      }
      await sendSeatingNotification(rehearsalId, imageBase64);
      showSuccess(t('seating.notifications.sent'));
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return <div className="loading">{t('common.loading')}</div>;
  }

  return (
    <div className="notification-settings">
      <p className="text-muted" style={{ marginBottom: '1rem' }}>
        {t('seating.notifications.description')}
      </p>

      <form onSubmit={handleSave}>
        <div className="form-group">
          <label htmlFor="webhookUrl">{t('seating.notifications.webhookUrl')}</label>
          <input
            type="url"
            id="webhookUrl"
            value={formData.webhook_url}
            onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
            placeholder="https://..."
            required
          />
          <small className="form-help">{t('seating.notifications.webhookHelp')}</small>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="minutesBefore">{t('seating.notifications.minutesBefore')}</label>
            <input
              type="number"
              id="minutesBefore"
              value={formData.minutes_before}
              onChange={(e) => setFormData({ ...formData, minutes_before: parseInt(e.target.value) || 15 })}
              min="1"
              max="1440"
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label className="checkbox-item">
            <input
              type="checkbox"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
            />
            <span>{t('seating.notifications.enabled')}</span>
          </label>
        </div>

        <div className="form-group">
          <label className="checkbox-item">
            <input
              type="checkbox"
              checked={formData.include_image}
              onChange={(e) => setFormData({ ...formData, include_image: e.target.checked })}
            />
            <span>{t('seating.notifications.includeImage')}</span>
          </label>
        </div>

        <div className="form-group">
          <label htmlFor="messageTemplate">{t('seating.notifications.messageTemplate')}</label>
          <textarea
            id="messageTemplate"
            value={formData.message_template}
            onChange={(e) => setFormData({ ...formData, message_template: e.target.value })}
            rows={4}
            placeholder={t('seating.notifications.messagePlaceholder')}
          />
          <small className="form-help">
            {t('seating.notifications.templateHelp')}
          </small>
        </div>

        <div className="btn-group" style={{ marginTop: '1rem' }}>
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? t('common.loading') : t('common.save')}
          </button>
          {settings && (
            <button type="button" className="btn btn-danger" onClick={handleDelete}>
              {t('common.delete')}
            </button>
          )}
        </div>
      </form>

      {settings && rehearsalId && (
        <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
          <h4>{t('seating.notifications.testSection')}</h4>
          <p className="text-muted">{t('seating.notifications.testDescription')}</p>
          <button
            className="btn btn-secondary"
            onClick={handleTestSend}
            disabled={isSending}
          >
            {isSending ? t('common.loading') : t('seating.notifications.sendNow')}
          </button>
        </div>
      )}

      <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--bg-color)', borderRadius: '8px' }}>
        <h4 style={{ marginBottom: '0.5rem' }}>{t('seating.notifications.webhookFormat')}</h4>
        <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
          {t('seating.notifications.webhookFormatDescription')}
        </p>
        <pre style={{
          fontSize: '0.75rem',
          background: 'var(--surface-color)',
          padding: '0.75rem',
          borderRadius: '4px',
          overflow: 'auto',
          maxHeight: '200px'
        }}>
{`{
  "type": "seating_notification",
  "rehearsal": {
    "id": "...",
    "date": "2024-01-15",
    "startTime": "19:30",
    "location": "Repetitielokaal"
  },
  "orchestra": {
    "id": "...",
    "name": "Groot Orkest"
  },
  "seating": {
    "totalMembers": 42,
    "totalConductors": 1,
    "rows": [
      { "row": 1, "chairs": 8, "members": [...] },
      { "row": 2, "chairs": 10, "members": [...] }
    ]
  },
  "message": "Opstelling Groot Orkest\\n...",
  "image": "data:image/png;base64,..." // optioneel
}`}
        </pre>
      </div>
    </div>
  );
}
