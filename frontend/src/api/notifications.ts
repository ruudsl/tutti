import api from './client';

export interface NotificationChannel {
  channel: 'email' | 'push' | 'whatsapp' | 'telegram';
  configured: boolean;
  name: string;
}

export interface NotificationPreferences {
  userId: string;
  channels: {
    email: { enabled: boolean; address?: string };
    push: { enabled: boolean };
    whatsapp: { enabled: boolean; verified: boolean; phoneNumber?: string };
    telegram: { enabled: boolean; verified: boolean; chatId?: string };
  };
  notificationTypes: {
    new_music?: { enabled: boolean; channels: string[] };
    rehearsal_change?: { enabled: boolean; channels: string[] };
    seating_update?: { enabled: boolean; channels: string[] };
    chat_message?: { enabled: boolean; channels: string[] };
    practice_reminder?: { enabled: boolean; channels: string[] };
    concert_reminder?: { enabled: boolean; channels: string[] };
  };
}

export const getNotificationChannels = async (): Promise<NotificationChannel[]> => {
  const { data } = await api.get('/notification-channels/channels');
  return data;
};

export const getNotificationPreferences = async (): Promise<NotificationPreferences> => {
  const { data } = await api.get('/notification-channels/preferences');
  return data;
};

export const updateNotificationPreferences = async (prefs: {
  emailEnabled?: boolean;
  pushEnabled?: boolean;
  whatsappEnabled?: boolean;
  telegramEnabled?: boolean;
  newMusic?: boolean;
  rehearsalChanges?: boolean;
  seatingUpdates?: boolean;
  chatMessages?: boolean;
  practiceReminders?: boolean;
  concertReminders?: boolean;
}): Promise<void> => {
  await api.put('/notification-channels/preferences', prefs);
};

// Telegram
export const getTelegramLinkUrl = async (): Promise<{ code: string; url: string; expiresIn: number }> => {
  const { data } = await api.post('/notification-channels/telegram/link');
  return data;
};

export const getTelegramStatus = async (): Promise<{ linked: boolean; verified: boolean; linkedAt: string | null }> => {
  const { data } = await api.get('/notification-channels/telegram/status');
  return data;
};

export const unlinkTelegram = async (): Promise<void> => {
  await api.delete('/notification-channels/telegram/unlink');
};

// WhatsApp
export const linkWhatsApp = async (phoneNumber: string): Promise<{ message: string; phoneNumber: string; expiresIn: number }> => {
  const { data } = await api.post('/notification-channels/whatsapp/link', { phoneNumber });
  return data;
};

export const verifyWhatsApp = async (code: string): Promise<void> => {
  await api.post('/notification-channels/whatsapp/verify', { code });
};

export const getWhatsAppStatus = async (): Promise<{ linked: boolean; verified: boolean; phoneNumber: string | null; linkedAt: string | null }> => {
  const { data } = await api.get('/notification-channels/whatsapp/status');
  return data;
};

export const unlinkWhatsApp = async (): Promise<void> => {
  await api.delete('/notification-channels/whatsapp/unlink');
};
