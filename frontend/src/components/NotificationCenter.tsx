import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { nl, enUS } from 'date-fns/locale';
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  useVapidPublicKey,
  useRegisterPushSubscription,
} from '../hooks/useNotifications';

export function NotificationBell() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const { data: unreadCount } = useUnreadNotificationCount();
  const count = typeof unreadCount === 'number' ? unreadCount : (unreadCount as any)?.count ?? 0;

  // Close dropdown on escape and click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.notification-bell-wrapper')) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [isOpen]);

  return (
    <div className="notification-bell-wrapper">
      <button
        className="notification-bell-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t('notifications.title', 'Meldingen')}
        aria-expanded={isOpen}
      >
        <span className="notification-bell-icon" aria-hidden="true">🔔</span>
        {count > 0 && (
          <span className="notification-bell-badge">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="notification-bell-dropdown">
          <NotificationDropdown onClose={() => setIsOpen(false)} />
        </div>
      )}
    </div>
  );
}

function NotificationDropdown({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { data: notifications, isLoading } = useNotifications({ limit: 10 });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const locale = i18n.language === 'nl' ? nl : enUS;

  const handleClick = async (notification: { id: string; isRead: boolean; data?: Record<string, any> }) => {
    if (!notification.isRead) {
      await markRead.mutateAsync(notification.id);
    }
    // Navigate based on notification type/data
    if (notification.data?.link) {
      window.location.href = notification.data.link;
    }
    onClose();
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'new_music':
        return '🎵';
      case 'rehearsal_change':
        return '📅';
      case 'seating_update':
        return '🪑';
      case 'chat_message':
        return '💬';
      case 'practice_reminder':
        return '🎺';
      case 'concert_reminder':
        return '🎭';
      default:
        return '🔔';
    }
  };

  return (
    <div className="notification-dropdown-panel">
      <div className="notification-dropdown-header">
        <span className="text-semibold">{t('notifications.title', 'Meldingen')}</span>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => markAllRead.mutate()}
          disabled={markAllRead.isPending}
        >
          {t('notifications.markAllRead', 'Alles als gelezen')}
        </button>
      </div>
      <div className="notification-dropdown-body">
        {isLoading ? (
          <div className="notification-loading">
            <div className="spinner" aria-hidden="true"></div>
          </div>
        ) : !notifications || notifications.length === 0 ? (
          <div className="notification-empty">
            <span className="notification-empty-icon" aria-hidden="true">🔔</span>
            <p className="text-light text-sm">{t('notifications.empty', 'Geen meldingen')}</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <button
              key={notification.id}
              className={`notification-item ${!notification.isRead ? 'unread' : ''}`}
              onClick={() => handleClick(notification)}
            >
              <span className="notification-item-icon" aria-hidden="true">{getIcon(notification.type)}</span>
              <div className="notification-item-content">
                <div className="notification-item-title">{notification.title}</div>
                <div className="notification-item-body">{notification.body}</div>
                <div className="notification-item-time">
                  {formatDistanceToNow(new Date(notification.createdAt), {
                    addSuffix: true,
                    locale,
                  })}
                </div>
              </div>
              {!notification.isRead && <span className="notification-item-dot" aria-hidden="true"></span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function NotificationPreferencesForm() {
  const { t } = useTranslation();
  const { data: preferences, isLoading } = useNotificationPreferences();
  const updatePreferences = useUpdateNotificationPreferences();
  const { data: vapidKey } = useVapidPublicKey();
  const registerPush = useRegisterPushSubscription();
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);

  useEffect(() => {
    if ('PushManager' in window && 'serviceWorker' in navigator) {
      setPushSupported(true);
      // Check if already subscribed
      navigator.serviceWorker.ready.then(async (registration) => {
        const subscription = await registration.pushManager.getSubscription();
        setPushSubscribed(!!subscription);
      });
    }
  }, []);

  const handleToggle = async (key: string, value: boolean) => {
    await updatePreferences.mutateAsync({ [key]: value });
  };

  const handlePushSubscribe = async () => {
    if (!vapidKey) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
      await registerPush.mutateAsync(subscription);
      setPushSubscribed(true);
    } catch (error) {
      console.error('Push subscription failed:', error);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center p-4"><span className="loading loading-spinner" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-3">{t('notifications.preferences.channels')}</h3>
        <div className="space-y-2">
          <label className="flex items-center justify-between">
            <span>{t('notifications.preferences.email')}</span>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={preferences?.emailEnabled}
              onChange={(e) => handleToggle('emailEnabled', e.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between">
            <span>{t('notifications.preferences.push')}</span>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={preferences?.pushEnabled}
              onChange={(e) => handleToggle('pushEnabled', e.target.checked)}
              disabled={!pushSupported}
            />
          </label>
          {pushSupported && preferences?.pushEnabled && !pushSubscribed && vapidKey && (
            <button className="btn btn-sm btn-primary mt-2" onClick={handlePushSubscribe}>
              {t('notifications.enablePush')}
            </button>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-3">{t('notifications.preferences.types')}</h3>
        <div className="space-y-2">
          <label className="flex items-center justify-between">
            <div>
              <div>{t('notifications.types.newMusic')}</div>
              <div className="text-sm text-base-content/60">{t('notifications.types.newMusicDesc')}</div>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={preferences?.newMusic}
              onChange={(e) => handleToggle('newMusic', e.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between">
            <div>
              <div>{t('notifications.types.rehearsalChanges')}</div>
              <div className="text-sm text-base-content/60">{t('notifications.types.rehearsalChangesDesc')}</div>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={preferences?.rehearsalChanges}
              onChange={(e) => handleToggle('rehearsalChanges', e.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between">
            <div>
              <div>{t('notifications.types.seatingUpdates')}</div>
              <div className="text-sm text-base-content/60">{t('notifications.types.seatingUpdatesDesc')}</div>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={preferences?.seatingUpdates}
              onChange={(e) => handleToggle('seatingUpdates', e.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between">
            <div>
              <div>{t('notifications.types.chatMessages')}</div>
              <div className="text-sm text-base-content/60">{t('notifications.types.chatMessagesDesc')}</div>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={preferences?.chatMessages}
              onChange={(e) => handleToggle('chatMessages', e.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between">
            <div>
              <div>{t('notifications.types.practiceReminders')}</div>
              <div className="text-sm text-base-content/60">{t('notifications.types.practiceRemindersDesc')}</div>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={preferences?.practiceReminders}
              onChange={(e) => handleToggle('practiceReminders', e.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between">
            <div>
              <div>{t('notifications.types.concertReminders')}</div>
              <div className="text-sm text-base-content/60">{t('notifications.types.concertRemindersDesc')}</div>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={preferences?.concertReminders}
              onChange={(e) => handleToggle('concertReminders', e.target.checked)}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
