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

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ['notification-preferences'],
    queryFn: async () => {
      const response = await api.get<NotificationPreferences>('/notifications/preferences');
      return response.data;
    },
  });
}

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

export function useUnregisterPushSubscription() {
  return useMutation({
    mutationFn: async (endpoint: string) => {
      await api.delete('/notifications/push-subscription', { data: { endpoint } });
    },
  });
}

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
