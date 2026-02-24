import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { showSuccess, showError } from '../utils/toast';
import {
  getSeatingNotificationSettings,
  saveSeatingNotificationSettings,
  deleteSeatingNotificationSettings,
  sendSeatingNotification,
  testTwilioConnection,
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
  const [isTesting, setIsTesting] = useState(false);

  const [formData, setFormData] = useState({
    notification_type: 'whatsapp' as 'webhook' | 'whatsapp',
    webhook_url: '',
    twilio_account_sid: '',
    twilio_auth_token: '',
    twilio_whatsapp_from: '',
    twilio_whatsapp_to: '',
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
          notification_type: data.notification_type || 'whatsapp',
          webhook_url: data.webhook_url || '',
          twilio_account_sid: data.twilio_account_sid || '',
          twilio_auth_token: data.twilio_auth_token || '',
          twilio_whatsapp_from: data.twilio_whatsapp_from || '',
          twilio_whatsapp_to: data.twilio_whatsapp_to || '',
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
        notification_type: formData.notification_type,
        webhook_url: formData.notification_type === 'webhook' ? formData.webhook_url : undefined,
        twilio_account_sid: formData.notification_type === 'whatsapp' ? formData.twilio_account_sid : undefined,
        twilio_auth_token: formData.notification_type === 'whatsapp' ? formData.twilio_auth_token : undefined,
        twilio_whatsapp_from: formData.notification_type === 'whatsapp' ? formData.twilio_whatsapp_from : undefined,
        twilio_whatsapp_to: formData.notification_type === 'whatsapp' ? formData.twilio_whatsapp_to : undefined,
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
        notification_type: 'whatsapp',
        webhook_url: '',
        twilio_account_sid: '',
        twilio_auth_token: '',
        twilio_whatsapp_from: '',
        twilio_whatsapp_to: '',
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

  const handleTestTwilio = async () => {
    if (!formData.twilio_account_sid || !formData.twilio_auth_token || !formData.twilio_whatsapp_from || !formData.twilio_whatsapp_to) {
      showError(t('seating.notifications.fillAllTwilioFields'));
      return;
    }

    setIsTesting(true);
    try {
      // For testing, use the first number in the comma-separated list
      const firstNumber = formData.twilio_whatsapp_to.split(',')[0].trim();
      await testTwilioConnection({
        account_sid: formData.twilio_account_sid,
        auth_token: formData.twilio_auth_token,
        whatsapp_from: formData.twilio_whatsapp_from,
        whatsapp_to: firstNumber,
      });
      showSuccess(t('seating.notifications.testSent'));
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    } finally {
      setIsTesting(false);
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
        {/* Notification Type Selection */}
        <div className="form-group">
          <label>{t('seating.notifications.type')}</label>
          <div className="btn-group" style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className={`btn ${formData.notification_type === 'whatsapp' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFormData({ ...formData, notification_type: 'whatsapp' })}
            >
              📱 WhatsApp
            </button>
            <button
              type="button"
              className={`btn ${formData.notification_type === 'webhook' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFormData({ ...formData, notification_type: 'webhook' })}
            >
              🔗 Webhook
            </button>
          </div>
        </div>

        {/* WhatsApp/Twilio Settings */}
        {formData.notification_type === 'whatsapp' && (
          <div style={{ padding: '1rem', background: 'var(--bg-color)', borderRadius: '8px', marginBottom: '1rem' }}>
            <h4 style={{ marginTop: 0 }}>Twilio WhatsApp</h4>
            <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
              {t('seating.notifications.twilioHelp')}
            </p>

            <div className="form-group">
              <label htmlFor="twilioAccountSid">Account SID</label>
              <input
                type="text"
                id="twilioAccountSid"
                value={formData.twilio_account_sid}
                onChange={(e) => setFormData({ ...formData, twilio_account_sid: e.target.value })}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </div>

            <div className="form-group">
              <label htmlFor="twilioAuthToken">Auth Token</label>
              <input
                type="password"
                id="twilioAuthToken"
                value={formData.twilio_auth_token}
                onChange={(e) => setFormData({ ...formData, twilio_auth_token: e.target.value })}
                placeholder="••••••••••••••••"
              />
            </div>

            <div className="form-group">
              <label htmlFor="twilioFrom">{t('seating.notifications.twilioFrom')}</label>
              <input
                type="text"
                id="twilioFrom"
                value={formData.twilio_whatsapp_from}
                onChange={(e) => setFormData({ ...formData, twilio_whatsapp_from: e.target.value })}
                placeholder="+14155238886"
              />
              <small className="form-help">{t('seating.notifications.twilioFromHelp')}</small>
            </div>

            <div className="form-group">
              <label htmlFor="twilioTo">{t('seating.notifications.twilioTo')}</label>
              <input
                type="text"
                id="twilioTo"
                value={formData.twilio_whatsapp_to}
                onChange={(e) => setFormData({ ...formData, twilio_whatsapp_to: e.target.value })}
                placeholder="+31612345678, +31687654321"
              />
              <small className="form-help">{t('seating.notifications.twilioToHelp')}</small>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleTestTwilio}
              disabled={isTesting}
            >
              {isTesting ? t('common.loading') : t('seating.notifications.testConnection')}
            </button>
          </div>
        )}

        {/* Webhook Settings */}
        {formData.notification_type === 'webhook' && (
          <div className="form-group">
            <label htmlFor="webhookUrl">{t('seating.notifications.webhookUrl')}</label>
            <input
              type="url"
              id="webhookUrl"
              value={formData.webhook_url}
              onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
              placeholder="https://..."
            />
            <small className="form-help">{t('seating.notifications.webhookHelp')}</small>
          </div>
        )}

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

      {/* Setup Instructions */}
      {formData.notification_type === 'whatsapp' && (
        <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--bg-color)', borderRadius: '8px' }}>
          <h4 style={{ marginBottom: '0.5rem' }}>{t('seating.notifications.setupTitle')}</h4>
          <ol style={{ fontSize: '0.875rem', color: 'var(--text-light-color)', paddingLeft: '1.5rem', margin: 0 }}>
            <li>{t('seating.notifications.step1')}</li>
            <li>{t('seating.notifications.step2')}</li>
            <li>{t('seating.notifications.step3')}</li>
            <li>{t('seating.notifications.step4')}</li>
            <li>{t('seating.notifications.step5')}</li>
          </ol>
        </div>
      )}

      {formData.notification_type === 'webhook' && (
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
    "rows": [
      { "row": 1, "chairs": 8 },
      { "row": 2, "chairs": 10 }
    ]
  },
  "message": "🎵 Opstelling Groot Orkest\\n..."
}`}
          </pre>
        </div>
      )}
    </div>
  );
}
