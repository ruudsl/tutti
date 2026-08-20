import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import logger from '../utils/logger';
import { sendEmail } from '../utils/email';
import { sendWhatsAppNotification, isWhatsAppConfigured } from './whatsapp';
import { sendTelegramNotification, isTelegramConfigured } from './telegram';
import webpush from 'web-push';

// Configure web-push if VAPID keys are set
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@harmonie.app';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Notification types
export type NotificationType =
  | 'new_music'
  | 'rehearsal_change'
  | 'seating_update'
  | 'chat_message'
  | 'practice_reminder'
  | 'concert_reminder'
  | 'announcement'
  | 'general';

// Notification channels
export type NotificationChannel = 'email' | 'push' | 'whatsapp' | 'telegram';

// Map notification type to preference field
const typeToPreference: Record<NotificationType, string> = {
  new_music: 'new_music',
  rehearsal_change: 'rehearsal_changes',
  seating_update: 'seating_updates',
  chat_message: 'chat_messages',
  practice_reminder: 'practice_reminders',
  concert_reminder: 'concert_reminders',
  announcement: 'announcements',
  general: 'general',
};

// Channel priority order (default)
const DEFAULT_CHANNEL_PRIORITY: NotificationChannel[] = ['push', 'email', 'telegram', 'whatsapp'];

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, any>;
  channels?: NotificationChannel[]; // Override channels to use
  associationId?: string; // For email config
}

export interface ChannelPreference {
  channel: NotificationChannel;
  enabled: boolean;
  notificationTypes: NotificationType[];
}

export interface UserNotificationPreferences {
  userId: string;
  channels: {
    email: { enabled: boolean; address?: string };
    push: { enabled: boolean };
    whatsapp: { enabled: boolean; verified: boolean; phoneNumber?: string };
    telegram: { enabled: boolean; verified: boolean; chatId?: string };
  };
  notificationTypes: {
    [key in NotificationType]?: {
      enabled: boolean;
      channels: NotificationChannel[];
    };
  };
}

/**
 * Get available notification channels
 */
export function getAvailableChannels(): { channel: NotificationChannel; configured: boolean; name: string }[] {
  return [
    { channel: 'email', configured: true, name: 'E-mail' },
    { channel: 'push', configured: !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY), name: 'Push notificaties' },
    { channel: 'whatsapp', configured: isWhatsAppConfigured(), name: 'WhatsApp' },
    { channel: 'telegram', configured: isTelegramConfigured(), name: 'Telegram' },
  ];
}

/**
 * Get user's notification preferences including channel settings
 */
export function getUserPreferences(userId: string): UserNotificationPreferences {
  // Get base notification preferences
  let prefs = db
    .prepare(
      `
        SELECT * FROM notification_preferences WHERE user_id = ?
    `,
    )
    .get(userId) as any;

  // Create default preferences if not exists
  if (!prefs) {
    const id = uuidv4();
    db.prepare(
      `
            INSERT INTO notification_preferences (id, user_id) VALUES (?, ?)
        `,
    ).run(id, userId);
    prefs = db.prepare(`SELECT * FROM notification_preferences WHERE id = ?`).get(id);
  }

  // Get user email
  const user = db.prepare(`SELECT email FROM users WHERE id = ?`).get(userId) as { email: string } | undefined;

  // Get channel-specific preferences
  const channelPrefs = db
    .prepare(
      `
        SELECT channel, enabled, settings FROM notification_channel_preferences
        WHERE user_id = ?
    `,
    )
    .all(userId) as { channel: NotificationChannel; enabled: number; settings: string | null }[];

  const channelPrefsMap: Record<string, { enabled: boolean; settings: any }> = {};
  for (const cp of channelPrefs) {
    channelPrefsMap[cp.channel] = {
      enabled: !!cp.enabled,
      settings: cp.settings ? JSON.parse(cp.settings) : {},
    };
  }

  // Get linked notification channels (WhatsApp, Telegram)
  const linkedChannels = db
    .prepare(
      `
        SELECT channel_type, channel_id, verified FROM user_notification_channels
        WHERE user_id = ?
    `,
    )
    .all(userId) as { channel_type: string; channel_id: string; verified: number }[];

  const linkedChannelsMap: Record<string, { channelId: string; verified: boolean }> = {};
  for (const lc of linkedChannels) {
    linkedChannelsMap[lc.channel_type] = {
      channelId: lc.channel_id,
      verified: !!lc.verified,
    };
  }

  return {
    userId,
    channels: {
      email: {
        enabled: channelPrefsMap.email?.enabled ?? !!prefs.email_enabled,
        address: user?.email,
      },
      push: {
        enabled: channelPrefsMap.push?.enabled ?? !!prefs.push_enabled,
      },
      whatsapp: {
        enabled: channelPrefsMap.whatsapp?.enabled ?? false,
        verified: linkedChannelsMap.whatsapp?.verified ?? false,
        phoneNumber: linkedChannelsMap.whatsapp?.channelId,
      },
      telegram: {
        enabled: channelPrefsMap.telegram?.enabled ?? false,
        verified: linkedChannelsMap.telegram?.verified ?? false,
        chatId: linkedChannelsMap.telegram?.channelId,
      },
    },
    notificationTypes: {
      new_music: {
        enabled: !!prefs.new_music,
        channels: getChannelsForType(userId, 'new_music', prefs),
      },
      rehearsal_change: {
        enabled: !!prefs.rehearsal_changes,
        channels: getChannelsForType(userId, 'rehearsal_change', prefs),
      },
      seating_update: {
        enabled: !!prefs.seating_updates,
        channels: getChannelsForType(userId, 'seating_update', prefs),
      },
      chat_message: {
        enabled: !!prefs.chat_messages,
        channels: getChannelsForType(userId, 'chat_message', prefs),
      },
      practice_reminder: {
        enabled: !!prefs.practice_reminders,
        channels: getChannelsForType(userId, 'practice_reminder', prefs),
      },
      concert_reminder: {
        enabled: !!prefs.concert_reminders,
        channels: getChannelsForType(userId, 'concert_reminder', prefs),
      },
      announcement: {
        enabled: !!prefs.announcements,
        channels: getChannelsForType(userId, 'announcement', prefs),
      },
      general: {
        enabled: !!prefs.general,
        channels: getChannelsForType(userId, 'general', prefs),
      },
    },
  };
}

/**
 * Get enabled channels for a notification type
 */
function getChannelsForType(userId: string, type: NotificationType, prefs: any): NotificationChannel[] {
  // Check if there's a type-specific channel preference
  const typePrefs = db
    .prepare(
      `
        SELECT channels FROM notification_type_channels
        WHERE user_id = ? AND notification_type = ?
    `,
    )
    .get(userId, type) as { channels: string } | undefined;

  if (typePrefs) {
    return JSON.parse(typePrefs.channels);
  }

  // Fall back to global channel preferences
  const channels: NotificationChannel[] = [];
  if (prefs.email_enabled) channels.push('email');
  if (prefs.push_enabled) channels.push('push');

  // Check if WhatsApp and Telegram are enabled and verified
  const linkedChannels = db
    .prepare(
      `
        SELECT unc.channel_type
        FROM user_notification_channels unc
        JOIN notification_channel_preferences ncp ON unc.user_id = ncp.user_id AND unc.channel_type = ncp.channel
        WHERE unc.user_id = ? AND unc.verified = 1 AND ncp.enabled = 1
    `,
    )
    .all(userId) as { channel_type: string }[];

  for (const lc of linkedChannels) {
    if (lc.channel_type === 'whatsapp' || lc.channel_type === 'telegram') {
      channels.push(lc.channel_type as NotificationChannel);
    }
  }

  return channels;
}

/**
 * Update user's notification preferences
 */
export function updateUserPreferences(
  userId: string,
  updates: Partial<{
    emailEnabled: boolean;
    pushEnabled: boolean;
    whatsappEnabled: boolean;
    telegramEnabled: boolean;
    newMusic: boolean;
    rehearsalChanges: boolean;
    seatingUpdates: boolean;
    chatMessages: boolean;
    practiceReminders: boolean;
    concertReminders: boolean;
    announcements: boolean;
    general: boolean;
  }>,
): void {
  // Ensure preferences exist
  const existing = db.prepare(`SELECT id FROM notification_preferences WHERE user_id = ?`).get(userId);
  if (!existing) {
    db.prepare(`INSERT INTO notification_preferences (id, user_id) VALUES (?, ?)`).run(uuidv4(), userId);
  }

  const sqlUpdates: string[] = [];
  const params: any[] = [];

  // Map preference names to columns
  const fieldMap: Record<string, string> = {
    emailEnabled: 'email_enabled',
    pushEnabled: 'push_enabled',
    newMusic: 'new_music',
    rehearsalChanges: 'rehearsal_changes',
    seatingUpdates: 'seating_updates',
    chatMessages: 'chat_messages',
    practiceReminders: 'practice_reminders',
    concertReminders: 'concert_reminders',
    announcements: 'announcements',
    general: 'general',
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    if ((updates as any)[key] !== undefined) {
      sqlUpdates.push(`${column} = ?`);
      params.push((updates as any)[key] ? 1 : 0);
    }
  }

  if (sqlUpdates.length > 0) {
    sqlUpdates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(userId);
    db.prepare(`UPDATE notification_preferences SET ${sqlUpdates.join(', ')} WHERE user_id = ?`).run(...params);
  }

  // Handle WhatsApp and Telegram channel preferences
  for (const channel of ['whatsapp', 'telegram'] as const) {
    const enabledKey = `${channel}Enabled` as keyof typeof updates;
    if (updates[enabledKey] !== undefined) {
      const existingPref = db
        .prepare(
          `
                SELECT id FROM notification_channel_preferences WHERE user_id = ? AND channel = ?
            `,
        )
        .get(userId, channel);

      if (existingPref) {
        db.prepare(
          `
                    UPDATE notification_channel_preferences SET enabled = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ? AND channel = ?
                `,
        ).run(updates[enabledKey] ? 1 : 0, userId, channel);
      } else {
        db.prepare(
          `
                    INSERT INTO notification_channel_preferences (id, user_id, channel, enabled)
                    VALUES (?, ?, ?, ?)
                `,
        ).run(uuidv4(), userId, channel, updates[enabledKey] ? 1 : 0);
      }
    }
  }
}

/**
 * Update channel preferences for a specific notification type
 */
export function updateTypeChannels(
  userId: string,
  notificationType: NotificationType,
  channels: NotificationChannel[],
): void {
  const existing = db
    .prepare(
      `
        SELECT id FROM notification_type_channels WHERE user_id = ? AND notification_type = ?
    `,
    )
    .get(userId, notificationType);

  if (existing) {
    db.prepare(
      `
            UPDATE notification_type_channels SET channels = ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND notification_type = ?
        `,
    ).run(JSON.stringify(channels), userId, notificationType);
  } else {
    db.prepare(
      `
            INSERT INTO notification_type_channels (id, user_id, notification_type, channels)
            VALUES (?, ?, ?, ?)
        `,
    ).run(uuidv4(), userId, notificationType, JSON.stringify(channels));
  }
}

/**
 * Send notification to user via appropriate channels
 */
export async function sendNotification(payload: NotificationPayload): Promise<{
  success: boolean;
  channels: { channel: NotificationChannel; success: boolean; error?: string }[];
}> {
  const { userId, type, title, body, data, channels: overrideChannels, associationId } = payload;

  // Check user preferences for this notification type
  const prefs = db
    .prepare(
      `
        SELECT * FROM notification_preferences WHERE user_id = ?
    `,
    )
    .get(userId) as any;

  const prefKey = typeToPreference[type];
  if (prefs && prefKey && prefs[prefKey] === 0) {
    // User has disabled this notification type
    return { success: true, channels: [] };
  }

  // Determine which channels to use
  let channelsToUse: NotificationChannel[];
  if (overrideChannels) {
    channelsToUse = overrideChannels;
  } else {
    channelsToUse = getChannelsForType(userId, type, prefs || {});
    if (channelsToUse.length === 0 && !prefs) {
      // Alleen terugvallen op de standaardkanalen wanneer het lid nog nooit
      // iets heeft ingesteld. Bestaan er wel voorkeuren en komt daar niets
      // uit, dan is dat een keuze: alles uit hoort ook alles uit te blijven.
      channelsToUse = ['email', 'push'];
    }
  }

  // Create notification record
  const notificationId = uuidv4();
  db.prepare(
    `
        INSERT INTO notifications (id, user_id, type, title, body, data)
        VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(notificationId, userId, type, title, body, data ? JSON.stringify(data) : null);

  const results: { channel: NotificationChannel; success: boolean; error?: string }[] = [];

  // Send via each channel
  for (const channel of channelsToUse) {
    try {
      let success = false;

      switch (channel) {
        case 'email':
          success = await sendEmailNotification(userId, title, body, data, associationId);
          if (success) {
            db.prepare(`UPDATE notifications SET sent_email = 1 WHERE id = ?`).run(notificationId);
          }
          break;

        case 'push':
          success = await sendPushNotification(userId, title, body, { ...data, notificationId });
          if (success) {
            db.prepare(`UPDATE notifications SET sent_push = 1 WHERE id = ?`).run(notificationId);
          }
          break;

        case 'whatsapp':
          success = await sendWhatsAppNotification(userId, title, body, data);
          break;

        case 'telegram':
          success = await sendTelegramNotification(userId, title, body, data);
          break;
      }

      results.push({ channel, success });
    } catch (error: any) {
      logger.error(`Failed to send ${channel} notification:`, error);
      results.push({ channel, success: false, error: error.message });
    }
  }

  return {
    success: results.some((r) => r.success),
    channels: results,
  };
}

/**
 * Send email notification
 */
async function sendEmailNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>,
  associationId?: string,
): Promise<boolean> {
  const user = db.prepare(`SELECT email, first_name FROM users WHERE id = ?`).get(userId) as
    { email: string; first_name: string } | undefined;
  if (!user) {
    return false;
  }

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const actionUrl = data?.url ? `${frontendUrl}${data.url}` : frontendUrl;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #3b82f6; color: white; padding: 20px; border-radius: 6px 6px 0 0; }
    .content { padding: 20px; border: 1px solid #eee; border-top: none; border-radius: 0 0 6px 6px; }
    .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">${title}</h2>
    </div>
    <div class="content">
      <p>Hallo ${user.first_name},</p>
      <p>${body}</p>
      ${data?.url ? `<a href="${actionUrl}" class="button">Bekijken in app</a>` : ''}
    </div>
    <div class="footer">
      <p>Je ontvangt deze e-mail omdat je notificaties hebt ingeschakeld in de Harmonie app.</p>
      <p>Met vriendelijke groet,<br>Het Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return sendEmail({
    to: user.email,
    subject: `Harmonie: ${title}`,
    text: `Hallo ${user.first_name},\n\n${body}\n\n${data?.url ? `Bekijk in app: ${actionUrl}` : ''}\n\nMet vriendelijke groet,\nHet Harmonie Team`,
    html,
    associationId,
  });
}

/**
 * Send push notification
 */
async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>,
): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return false;
  }

  const subscriptions = db
    .prepare(
      `
        SELECT * FROM push_subscriptions WHERE user_id = ?
    `,
    )
    .all(userId) as any[];

  if (subscriptions.length === 0) {
    return false;
  }

  let success = false;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh_key,
            auth: sub.auth_key,
          },
        },
        JSON.stringify({ title, body, data }),
      );
      success = true;
    } catch (error: any) {
      logger.error(`Failed to send push notification: ${error.message}`);
      // Remove invalid subscription
      if (error.statusCode === 410 || error.statusCode === 404) {
        db.prepare(`DELETE FROM push_subscriptions WHERE id = ?`).run(sub.id);
      }
    }
  }

  return success;
}

/**
 * Send notification to all users in an orchestra
 */
export async function notifyOrchestra(
  orchestraId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, any>,
  excludeUserId?: string,
): Promise<void> {
  const users = db
    .prepare(
      `
        SELECT user_id FROM user_orchestras WHERE orchestra_id = ?
    `,
    )
    .all(orchestraId) as { user_id: string }[];

  for (const { user_id } of users) {
    if (user_id !== excludeUserId) {
      await sendNotification({ userId: user_id, type, title, body, data });
    }
  }
}

/**
 * Send notification to all users with a specific instrument
 */
export async function notifyInstrumentSection(
  instrumentId: string,
  orchestraId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, any>,
  excludeUserId?: string,
): Promise<void> {
  const users = db
    .prepare(
      `
        SELECT ui.user_id FROM user_instruments ui
        JOIN user_orchestras uo ON ui.user_id = uo.user_id
        WHERE ui.instrument_id = ? AND uo.orchestra_id = ?
    `,
    )
    .all(instrumentId, orchestraId) as { user_id: string }[];

  for (const { user_id } of users) {
    if (user_id !== excludeUserId) {
      await sendNotification({ userId: user_id, type, title, body, data });
    }
  }
}

/**
 * Send notification to all active users in an association
 */
export async function notifyAssociation(
  associationId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, any>,
  excludeUserId?: string,
): Promise<void> {
  const users = db
    .prepare(
      `
        SELECT id FROM users WHERE association_id = ? AND status = 'active'
    `,
    )
    .all(associationId) as { id: string }[];

  for (const { id } of users) {
    if (id !== excludeUserId) {
      await sendNotification({ userId: id, type, title, body, data, associationId });
    }
  }
}

export default {
  getAvailableChannels,
  getUserPreferences,
  updateUserPreferences,
  updateTypeChannels,
  sendNotification,
  notifyOrchestra,
  notifyInstrumentSection,
  notifyAssociation,
};
