import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  isRead: boolean;
  createdAt: string;
  readAt?: string;
}

interface NotificationPreferences {
  newMusic: boolean;
  rehearsalChanges: boolean;
  seatingUpdates: boolean;
  chatMessages: boolean;
  practiceReminders: boolean;
  concertReminders: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
}

/**
 * @description Hook for fetching user notifications with optional filtering.
 * Automatically refetches every minute to keep notifications current.
 *
 * @param {Object} options - Filter options
 * @param {boolean} options.unreadOnly - Only fetch unread notifications
 * @param {string} options.type - Filter by notification type
 * @param {number} options.limit - Maximum number of notifications to fetch
 *
 * @returns {UseQueryResult<Notification[]>} React Query result with notifications array
 *
 * @example
 * ```tsx
 * function NotificationList() {
 *   const { data: notifications, isLoading } = useNotifications({
 *     unreadOnly: true,
 *     limit: 10
 *   });
 *
 *   if (isLoading) return <Spinner />;
 *   return <NotificationItems items={notifications} />;
 * }
 * ```
 */
export function useNotifications(options?: { unreadOnly?: boolean; type?: string; limit?: number }) {
  return useQuery({
    queryKey: ['notifications', options],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.unreadOnly) params.append('unreadOnly', 'true');
      if (options?.type) params.append('type', options.type);
      if (options?.limit) params.append('limit', options.limit.toString());

      const response = await api.get<Notification[]>(`/notifications?${params}`);
      return response.data;
    },
    refetchInterval: 60000, // Refresh every minute
  });
}

/**
 * @description Hook for fetching the count of unread notifications.
 * Refetches every 30 seconds to keep the count current.
 *
 * @returns {UseQueryResult<number>} React Query result with unread count
 *
 * @example
 * ```tsx
 * function NotificationBadge() {
 *   const { data: count } = useUnreadNotificationCount();
 *   return count > 0 ? <Badge>{count}</Badge> : null;
 * }
 * ```
 */
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ['unread-notification-count'],
    queryFn: async () => {
      const response = await api.get<{ count: number }>('/notifications/unread-count');
      return response.data.count;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

/**
 * @description Hook for marking a single notification as read.
 * Automatically invalidates notification queries on success.
 *
 * @returns {UseMutationResult} React Query mutation for marking notification read
 *
 * @example
 * ```tsx
 * function NotificationItem({ notification }: { notification: Notification }) {
 *   const markRead = useMarkNotificationRead();
 *
 *   return (
 *     <div onClick={() => markRead.mutate(notification.id)}>
 *       {notification.title}
 *     </div>
 *   );
 * }
 * ```
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      await api.post(`/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notification-count'] });
    },
  });
}

/**
 * @description Hook for marking all notifications as read.
 * Automatically invalidates notification queries on success.
 *
 * @returns {UseMutationResult} React Query mutation for marking all read
 *
 * @example
 * ```tsx
 * function NotificationHeader() {
 *   const markAllRead = useMarkAllNotificationsRead();
 *
 *   return (
 *     <button onClick={() => markAllRead.mutate()}>
 *       Mark all as read
 *     </button>
 *   );
 * }
 * ```
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await api.post('/notifications/read-all');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notification-count'] });
    },
  });
}

/**
 * @description Hook for fetching user's notification preferences.
 *
 * @returns {UseQueryResult<NotificationPreferences>} React Query result with preferences
 *
 * @example
 * ```tsx
 * function NotificationSettings() {
 *   const { data: prefs, isLoading } = useNotificationPreferences();
 *
 *   if (isLoading) return <Spinner />;
 *   return (
 *     <form>
 *       <Checkbox checked={prefs.emailEnabled} label="Email notifications" />
 *       <Checkbox checked={prefs.pushEnabled} label="Push notifications" />
 *     </form>
 *   );
 * }
 * ```
 */
export function useNotificationPreferences() {
  return useQuery({
    queryKey: ['notification-preferences'],
    queryFn: async () => {
      const response = await api.get<NotificationPreferences>('/notifications/preferences');
      return response.data;
    },
  });
}

/**
 * @description Hook for updating user's notification preferences.
 * Automatically invalidates preferences query on success.
 *
 * @returns {UseMutationResult} React Query mutation for updating preferences
 *
 * @example
 * ```tsx
 * function EmailToggle() {
 *   const { data: prefs } = useNotificationPreferences();
 *   const updatePrefs = useUpdateNotificationPreferences();
 *
 *   return (
 *     <Switch
 *       checked={prefs?.emailEnabled}
 *       onChange={(checked) => updatePrefs.mutate({ emailEnabled: checked })}
 *     />
 *   );
 * }
 * ```
 */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (preferences: Partial<NotificationPreferences>) => {
      const response = await api.patch('/notifications/preferences', preferences);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
  });
}

/**
 * @description Hook for registering a push notification subscription with the server.
 *
 * @returns {UseMutationResult} React Query mutation for registering subscription
 *
 * @example
 * ```tsx
 * async function enablePushNotifications() {
 *   const registration = await navigator.serviceWorker.ready;
 *   const subscription = await registration.pushManager.subscribe({ ... });
 *   registerPush.mutate(subscription);
 * }
 * ```
 */
export function useRegisterPushSubscription() {
  return useMutation({
    mutationFn: async (subscription: PushSubscription) => {
      const json = subscription.toJSON();
      await api.post('/notifications/push-subscription', {
        endpoint: json.endpoint,
        keys: json.keys,
      });
    },
  });
}

/**
 * @description Hook for unregistering a push notification subscription from the server.
 *
 * @returns {UseMutationResult} React Query mutation for unregistering subscription
 *
 * @example
 * ```tsx
 * function disablePushNotifications() {
 *   const subscription = await registration.pushManager.getSubscription();
 *   if (subscription) {
 *     await subscription.unsubscribe();
 *     unregisterPush.mutate(subscription.endpoint);
 *   }
 * }
 * ```
 */
export function useUnregisterPushSubscription() {
  return useMutation({
    mutationFn: async (endpoint: string) => {
      await api.delete('/notifications/push-subscription', { data: { endpoint } });
    },
  });
}

/**
 * @description Hook for fetching the VAPID public key needed for push notifications.
 *
 * @returns {UseQueryResult<string>} React Query result with VAPID public key
 *
 * @example
 * ```tsx
 * function PushSetup() {
 *   const { data: vapidKey } = useVapidPublicKey();
 *
 *   const subscribe = async () => {
 *     const registration = await navigator.serviceWorker.ready;
 *     await registration.pushManager.subscribe({
 *       userVisibleOnly: true,
 *       applicationServerKey: vapidKey
 *     });
 *   };
 * }
 * ```
 */
export function useVapidPublicKey() {
  return useQuery({
    queryKey: ['vapid-public-key'],
    queryFn: async () => {
      const response = await api.get<{ publicKey: string }>('/notifications/vapid-public-key');
      return response.data.publicKey;
    },
    retry: false,
  });
}
