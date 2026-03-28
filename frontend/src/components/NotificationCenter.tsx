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

  return (
    <div className="dropdown dropdown-end">
      <button
        className="btn btn-ghost btn-circle"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="indicator">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {unreadCount && unreadCount > 0 && (
            <span className="badge badge-primary badge-xs indicator-item">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </button>
      {isOpen && (
        <div className="dropdown-content z-50 mt-2 w-80 bg-base-100 rounded-box shadow-lg border">
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
    <div className="max-h-96 overflow-hidden flex flex-col">
      <div className="p-3 border-b flex justify-between items-center bg-base-200">
        <span className="font-semibold">{t('notifications.title')}</span>
        <button
          className="btn btn-ghost btn-xs"
          onClick={() => markAllRead.mutate()}
          disabled={markAllRead.isPending}
        >
          {t('notifications.markAllRead')}
        </button>
      </div>
      <div className="overflow-y-auto flex-1">
        {isLoading ? (
          <div className="flex justify-center p-4">
            <span className="loading loading-spinner" />
          </div>
        ) : notifications?.length === 0 ? (
          <div className="text-center p-4 text-base-content/60">
            {t('notifications.empty')}
          </div>
        ) : (
          notifications?.map((notification) => (
            <button
              key={notification.id}
              className={`w-full p-3 text-left hover:bg-base-200 border-b ${
                !notification.isRead ? 'bg-primary/5' : ''
              }`}
              onClick={() => handleClick(notification)}
            >
              <div className="flex gap-3">
                <span className="text-xl">{getIcon(notification.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{notification.title}</div>
                  <div className="text-sm text-base-content/70 line-clamp-2">
                    {notification.body}
                  </div>
                  <div className="text-xs text-base-content/50 mt-1">
                    {formatDistanceToNow(new Date(notification.createdAt), {
                      addSuffix: true,
                      locale,
                    })}
                  </div>
                </div>
                {!notification.isRead && (
                  <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-2" />
                )}
              </div>
            </button>
          ))
        )}
      </div>
      <div className="p-2 border-t bg-base-200">
        <a href="/notifications" className="btn btn-ghost btn-sm btn-block">
          {t('notifications.viewAll')}
        </a>
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
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
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
