import axios from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import logger from '../utils/logger';

// Telegram Bot API configuration (env var fallback)
const TELEGRAM_BOT_TOKEN_ENV = process.env.TELEGRAM_BOT_TOKEN;

export interface TelegramMessage {
  chatId: string | number;
  text: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disableNotification?: boolean;
  replyMarkup?: TelegramReplyMarkup;
}

export interface TelegramReplyMarkup {
  inline_keyboard?: Array<
    Array<{
      text: string;
      url?: string;
      callback_data?: string;
    }>
  >;
  keyboard?: Array<
    Array<{
      text: string;
    }>
  >;
  remove_keyboard?: boolean;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    chat: {
      id: number;
      type: 'private' | 'group' | 'supergroup' | 'channel';
      title?: string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    date: number;
    text?: string;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    message?: any;
    data?: string;
  };
}

/**
 * Resolve the Telegram bot token and API URL for a given association (or env fallback).
 * Returns null if no token is available.
 */
export function getTelegramConfig(associationId?: string): { botToken: string; apiUrl: string } | null {
  if (associationId) {
    try {
      const row = db
        .prepare(
          `
                SELECT telegram_bot_token, telegram_enabled
                FROM associations
                WHERE id = ?
            `,
        )
        .get(associationId) as { telegram_bot_token: string | null; telegram_enabled: number } | undefined;

      if (row && row.telegram_enabled && row.telegram_bot_token) {
        const botToken = row.telegram_bot_token;
        return { botToken, apiUrl: `https://api.telegram.org/bot${botToken}` };
      }
    } catch (error) {
      logger.debug('getTelegramConfig: DB lookup failed, falling back to env', error);
    }
  }

  // Fall back to environment variable
  if (TELEGRAM_BOT_TOKEN_ENV) {
    return {
      botToken: TELEGRAM_BOT_TOKEN_ENV,
      apiUrl: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN_ENV}`,
    };
  }

  return null;
}

/**
 * Check if Telegram Bot is configured.
 * - With associationId: true if DB config for that association OR env vars are set.
 * - Without associationId: true if ANY association has it configured OR env vars are set.
 */
export function isTelegramConfigured(associationId?: string): boolean {
  if (associationId) {
    return getTelegramConfig(associationId) !== null;
  }

  // No associationId: check env vars first
  if (TELEGRAM_BOT_TOKEN_ENV) {
    return true;
  }

  // Check if any association has Telegram enabled
  try {
    const row = db
      .prepare(
        `
            SELECT 1 FROM associations
            WHERE telegram_enabled = 1 AND telegram_bot_token IS NOT NULL
            LIMIT 1
        `,
      )
      .get();
    return !!row;
  } catch (error) {
    logger.debug('isTelegramConfigured: DB lookup failed', error);
    return false;
  }
}

/**
 * Send a message via Telegram Bot API
 */
export async function sendTelegramMessage(message: TelegramMessage, associationId?: string): Promise<number | null> {
  const config = getTelegramConfig(associationId);
  if (!config) {
    logger.warn('Telegram Bot not configured');
    return null;
  }

  try {
    const response = await axios.post(`${config.apiUrl}/sendMessage`, {
      chat_id: message.chatId,
      text: message.text,
      parse_mode: message.parseMode || 'HTML',
      disable_notification: message.disableNotification || false,
      reply_markup: message.replyMarkup,
    });

    if (response.data.ok) {
      const messageId = response.data.result.message_id;
      logger.info(`Telegram message sent successfully: ${messageId}`);
      return messageId;
    } else {
      logger.error('Telegram API error:', response.data.description);
      return null;
    }
  } catch (error: any) {
    logger.error('Failed to send Telegram message:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Send a notification via Telegram
 */
export async function sendTelegramNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>,
  associationId?: string,
): Promise<boolean> {
  // Get user's Telegram channel info
  const channel = db
    .prepare(
      `
        SELECT channel_id, verified FROM user_notification_channels
        WHERE user_id = ? AND channel_type = 'telegram' AND verified = 1
    `,
    )
    .get(userId) as { channel_id: string; verified: number } | undefined;

  if (!channel) {
    logger.debug(`No verified Telegram channel for user ${userId}`);
    return false;
  }

  // Format message with HTML
  const formattedMessage = `<b>${escapeHtml(title)}</b>\n\n${escapeHtml(body)}`;

  // Add optional link button if data contains url
  let replyMarkup: TelegramReplyMarkup | undefined;
  if (data?.url) {
    replyMarkup = {
      inline_keyboard: [[{ text: 'Openen in app', url: data.url }]],
    };
  }

  const messageId = await sendTelegramMessage(
    {
      chatId: channel.channel_id,
      text: formattedMessage,
      parseMode: 'HTML',
      replyMarkup,
    },
    associationId,
  );

  return messageId !== null;
}

/**
 * Escape HTML special characters for Telegram HTML mode
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Generate a unique link code for Telegram account linking
 */
export function generateLinkCode(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Store a pending link code
 */
export function storeLinkCode(userId: string, code: string): void {
  // Delete any existing pending codes for this user
  db.prepare(
    `
        DELETE FROM telegram_link_codes WHERE user_id = ?
    `,
  ).run(userId);

  // Store new code (expires in 10 minutes)
  db.prepare(
    `
        INSERT INTO telegram_link_codes (id, user_id, code, expires_at)
        VALUES (?, ?, ?, datetime('now', '+10 minutes'))
    `,
  ).run(uuidv4(), userId, code);
}

/**
 * Get bot username for deep link
 */
export async function getBotUsername(associationId?: string): Promise<string | null> {
  const config = getTelegramConfig(associationId);
  if (!config) {
    return null;
  }

  try {
    const response = await axios.get(`${config.apiUrl}/getMe`);
    if (response.data.ok) {
      return response.data.result.username;
    }
    return null;
  } catch (error) {
    logger.error('Failed to get Telegram bot info:', error);
    return null;
  }
}

/**
 * Generate a Telegram deep link for account linking
 */
export async function generateLinkUrl(
  userId: string,
  associationId?: string,
): Promise<{ code: string; url: string } | null> {
  const botUsername = await getBotUsername(associationId);
  if (!botUsername) {
    return null;
  }

  const code = generateLinkCode();
  storeLinkCode(userId, code);

  const url = `https://t.me/${botUsername}?start=${code}`;
  return { code, url };
}

/**
 * Handle /start command with link code
 */
export async function handleStartCommand(chatId: number, linkCode?: string, associationId?: string): Promise<string> {
  if (!linkCode) {
    return `Welkom bij de Harmonie notificatie bot!

Om notificaties te ontvangen, ga naar je profiel in de Harmonie app en klik op "Telegram koppelen". Je ontvangt dan een link om je account te koppelen.

Beschikbare commando's:
/start - Toon dit bericht
/stop - Stop met ontvangen van notificaties
/settings - Beheer je notificatie voorkeuren
/status - Toon je huidige koppeling status`;
  }

  // Verify link code and link account
  const linkData = db
    .prepare(
      `
        SELECT user_id FROM telegram_link_codes
        WHERE code = ? AND expires_at > datetime('now')
    `,
    )
    .get(linkCode) as { user_id: string } | undefined;

  if (!linkData) {
    return 'Deze link is ongeldig of verlopen. Ga naar je profiel in de Harmonie app om een nieuwe link te genereren.';
  }

  // Check if this chat is already linked to another user
  const existingChannel = db
    .prepare(
      `
        SELECT user_id FROM user_notification_channels
        WHERE channel_type = 'telegram' AND channel_id = ?
    `,
    )
    .get(chatId.toString()) as { user_id: string } | undefined;

  if (existingChannel && existingChannel.user_id !== linkData.user_id) {
    // Update the existing link to the new user
    db.prepare(
      `
            DELETE FROM user_notification_channels
            WHERE channel_type = 'telegram' AND channel_id = ?
        `,
    ).run(chatId.toString());
  }

  // Delete any existing Telegram channel for this user
  db.prepare(
    `
        DELETE FROM user_notification_channels
        WHERE user_id = ? AND channel_type = 'telegram'
    `,
  ).run(linkData.user_id);

  // Create or update the channel link
  db.prepare(
    `
        INSERT INTO user_notification_channels (id, user_id, channel_type, channel_id, verified, created_at)
        VALUES (?, ?, 'telegram', ?, 1, CURRENT_TIMESTAMP)
    `,
  ).run(uuidv4(), linkData.user_id, chatId.toString());

  // Delete the used link code
  db.prepare(`DELETE FROM telegram_link_codes WHERE code = ?`).run(linkCode);

  // Get user name for confirmation
  const user = db.prepare(`SELECT first_name, last_name FROM users WHERE id = ?`).get(linkData.user_id) as
    { first_name: string; last_name: string } | undefined;
  const userName = user ? `${user.first_name} ${user.last_name}` : 'onbekende gebruiker';

  return `Je Telegram account is succesvol gekoppeld aan ${userName}!

Je ontvangt nu notificaties van de Harmonie app op dit account.

Gebruik /settings om je voorkeuren aan te passen of /stop om notificaties uit te schakelen.`;
}

/**
 * Handle /stop command
 */
export async function handleStopCommand(chatId: number): Promise<string> {
  const channel = db
    .prepare(
      `
        SELECT id, user_id FROM user_notification_channels
        WHERE channel_type = 'telegram' AND channel_id = ?
    `,
    )
    .get(chatId.toString()) as { id: string; user_id: string } | undefined;

  if (!channel) {
    return 'Je Telegram account is niet gekoppeld aan een Harmonie account.';
  }

  // Delete the channel link
  db.prepare(`DELETE FROM user_notification_channels WHERE id = ?`).run(channel.id);

  return `Je Telegram notificaties zijn uitgeschakeld. Je kunt ze weer inschakelen via je profiel in de Harmonie app.`;
}

/**
 * Handle /settings command
 */
export async function handleSettingsCommand(
  chatId: number,
): Promise<{ text: string; replyMarkup?: TelegramReplyMarkup }> {
  const channel = db
    .prepare(
      `
        SELECT user_id FROM user_notification_channels
        WHERE channel_type = 'telegram' AND channel_id = ?
    `,
    )
    .get(chatId.toString()) as { user_id: string } | undefined;

  if (!channel) {
    return {
      text: 'Je Telegram account is niet gekoppeld aan een Harmonie account. Gebruik de Harmonie app om te koppelen.',
    };
  }

  // Get user preferences
  const prefs = db
    .prepare(
      `
        SELECT * FROM notification_preferences WHERE user_id = ?
    `,
    )
    .get(channel.user_id) as any;

  const enabledTypes: string[] = [];
  if (!prefs || prefs.new_music) enabledTypes.push('Nieuwe muziek');
  if (!prefs || prefs.rehearsal_changes) enabledTypes.push('Repetitie wijzigingen');
  if (!prefs || prefs.seating_updates) enabledTypes.push('Zitplaats updates');
  if (!prefs || prefs.chat_messages) enabledTypes.push('Chat berichten');
  if (!prefs || prefs.practice_reminders) enabledTypes.push('Oefenherinneringen');
  if (!prefs || prefs.concert_reminders) enabledTypes.push('Concert herinneringen');

  const text = `Je huidige notificatie instellingen:

${enabledTypes.length > 0 ? enabledTypes.map((t) => `- ${t}`).join('\n') : 'Geen notificaties ingeschakeld'}

Ga naar je profiel in de Harmonie app om je voorkeuren aan te passen.`;

  return { text };
}

/**
 * Handle /status command
 */
export async function handleStatusCommand(chatId: number): Promise<string> {
  const channel = db
    .prepare(
      `
        SELECT unc.user_id, u.first_name, u.last_name, u.email
        FROM user_notification_channels unc
        JOIN users u ON u.id = unc.user_id
        WHERE unc.channel_type = 'telegram' AND unc.channel_id = ?
    `,
    )
    .get(chatId.toString()) as { user_id: string; first_name: string; last_name: string; email: string } | undefined;

  if (!channel) {
    return 'Je Telegram account is niet gekoppeld aan een Harmonie account.';
  }

  return `Je Telegram account is gekoppeld aan:
- Naam: ${channel.first_name} ${channel.last_name}
- E-mail: ${channel.email}

Gebruik /stop om de koppeling te verwijderen.`;
}

/**
 * Process incoming Telegram update (webhook)
 */
export async function processUpdate(update: TelegramUpdate, associationId?: string): Promise<void> {
  if (update.message?.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text;

    let response: string | { text: string; replyMarkup?: TelegramReplyMarkup };

    if (text.startsWith('/start')) {
      const linkCode = text.split(' ')[1]; // /start <code>
      response = await handleStartCommand(chatId, linkCode, associationId);
    } else if (text === '/stop') {
      response = await handleStopCommand(chatId);
    } else if (text === '/settings') {
      response = await handleSettingsCommand(chatId);
    } else if (text === '/status') {
      response = await handleStatusCommand(chatId);
    } else {
      response = "Onbekend commando. Gebruik /start om de beschikbare commando's te zien.";
    }

    if (typeof response === 'string') {
      await sendTelegramMessage({ chatId, text: response }, associationId);
    } else {
      await sendTelegramMessage({ chatId, text: response.text, replyMarkup: response.replyMarkup }, associationId);
    }
  }

  // Handle callback queries (button presses) if needed in the future
  if (update.callback_query) {
    const config = getTelegramConfig(associationId);
    if (config) {
      await axios.post(`${config.apiUrl}/answerCallbackQuery`, {
        callback_query_id: update.callback_query.id,
      });
    }
  }
}

/**
 * Set up webhook for Telegram bot
 */
export async function setWebhook(webhookUrl: string, associationId?: string): Promise<boolean> {
  const config = getTelegramConfig(associationId);
  if (!config) {
    logger.warn('Telegram Bot not configured');
    return false;
  }

  try {
    const response = await axios.post(`${config.apiUrl}/setWebhook`, {
      url: webhookUrl,
      allowed_updates: ['message', 'callback_query'],
    });

    if (response.data.ok) {
      logger.info(`Telegram webhook set to: ${webhookUrl}`);
      return true;
    } else {
      logger.error('Failed to set Telegram webhook:', response.data.description);
      return false;
    }
  } catch (error: any) {
    logger.error('Failed to set Telegram webhook:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Delete webhook (switch to polling mode)
 */
export async function deleteWebhook(associationId?: string): Promise<boolean> {
  const config = getTelegramConfig(associationId);
  if (!config) {
    return false;
  }

  try {
    const response = await axios.post(`${config.apiUrl}/deleteWebhook`);
    return response.data.ok;
  } catch (error) {
    logger.error('Failed to delete Telegram webhook:', error);
    return false;
  }
}

export default {
  getTelegramConfig,
  isTelegramConfigured,
  sendTelegramMessage,
  sendTelegramNotification,
  generateLinkCode,
  generateLinkUrl,
  handleStartCommand,
  handleStopCommand,
  handleSettingsCommand,
  handleStatusCommand,
  processUpdate,
  setWebhook,
  deleteWebhook,
};
