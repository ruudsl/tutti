import { Router, Response, Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import {
  getAvailableChannels,
  getUserPreferences,
  updateUserPreferences,
  updateTypeChannels,
  NotificationType,
  NotificationChannel,
} from '../services/notifications';
import {
  generateLinkUrl as generateTelegramLinkUrl,
  processUpdate as processTelegramUpdate,
  isTelegramConfigured,
  TelegramUpdate,
} from '../services/telegram';
import {
  generateVerificationCode,
  sendVerificationCode,
  verifyWebhook as verifyWhatsAppWebhook,
  parseWebhookPayload as parseWhatsAppWebhookPayload,
  isWhatsAppConfigured,
} from '../services/whatsapp';

const router = Router();

/**
 * @swagger
 * /notifications/channels:
 *   get:
 *     summary: Get available notification channels
 *     tags: [Notification Channels]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/channels',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const channels = getAvailableChannels();
    res.json(channels);
  }),
);

/**
 * @swagger
 * /notifications/preferences:
 *   get:
 *     summary: Get user notification preferences
 *     tags: [Notification Channels]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/preferences',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const preferences = getUserPreferences(req.user!.id);
    res.json(preferences);
  }),
);

/**
 * @swagger
 * /notifications/preferences:
 *   put:
 *     summary: Update user notification preferences
 *     tags: [Notification Channels]
 *     security:
 *       - bearerAuth: []
 */
router.put(
  '/preferences',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const {
      emailEnabled,
      pushEnabled,
      whatsappEnabled,
      telegramEnabled,
      newMusic,
      rehearsalChanges,
      seatingUpdates,
      chatMessages,
      practiceReminders,
      concertReminders,
    } = req.body;

    updateUserPreferences(req.user!.id, {
      emailEnabled,
      pushEnabled,
      whatsappEnabled,
      telegramEnabled,
      newMusic,
      rehearsalChanges,
      seatingUpdates,
      chatMessages,
      practiceReminders,
      concertReminders,
    });

    res.json({ message: 'Voorkeuren bijgewerkt' });
  }),
);

/**
 * @swagger
 * /notifications/preferences/type/{type}:
 *   put:
 *     summary: Update channels for a specific notification type
 *     tags: [Notification Channels]
 *     security:
 *       - bearerAuth: []
 */
router.put(
  '/preferences/type/:type',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { type } = req.params;
    const { channels } = req.body;

    const validTypes: NotificationType[] = [
      'new_music',
      'rehearsal_change',
      'seating_update',
      'chat_message',
      'practice_reminder',
      'concert_reminder',
      'announcement',
      'general',
    ];

    if (!validTypes.includes(type as NotificationType)) {
      throw new ApiError(400, 'Ongeldig notificatie type');
    }

    const validChannels: NotificationChannel[] = ['email', 'push', 'whatsapp', 'telegram'];
    const filteredChannels = (channels as string[]).filter((c) => validChannels.includes(c as NotificationChannel));

    updateTypeChannels(req.user!.id, type as NotificationType, filteredChannels as NotificationChannel[]);

    res.json({ message: 'Kanaal voorkeuren bijgewerkt' });
  }),
);

// ==================== TELEGRAM ====================

/**
 * @swagger
 * /notifications/telegram/link:
 *   post:
 *     summary: Generate Telegram link code
 *     tags: [Notification Channels]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/telegram/link',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!isTelegramConfigured()) {
      throw new ApiError(503, 'Telegram is niet geconfigureerd');
    }

    const result = await generateTelegramLinkUrl(req.user!.id);
    if (!result) {
      throw new ApiError(500, 'Kon geen Telegram link genereren');
    }

    res.json({
      code: result.code,
      url: result.url,
      expiresIn: 600, // 10 minutes
    });
  }),
);

/**
 * @swagger
 * /notifications/telegram/status:
 *   get:
 *     summary: Get Telegram connection status
 *     tags: [Notification Channels]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/telegram/status',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const channel = db
      .prepare(
        `
        SELECT channel_id, verified, created_at FROM user_notification_channels
        WHERE user_id = ? AND channel_type = 'telegram'
    `,
      )
      .get(req.user!.id) as { channel_id: string; verified: number; created_at: string } | undefined;

    res.json({
      linked: !!channel,
      verified: channel?.verified ? true : false,
      linkedAt: channel?.created_at || null,
    });
  }),
);

/**
 * @swagger
 * /notifications/telegram/unlink:
 *   delete:
 *     summary: Unlink Telegram account
 *     tags: [Notification Channels]
 *     security:
 *       - bearerAuth: []
 */
router.delete(
  '/telegram/unlink',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    db.prepare(
      `
        DELETE FROM user_notification_channels
        WHERE user_id = ? AND channel_type = 'telegram'
    `,
    ).run(req.user!.id);

    res.json({ message: 'Telegram account ontkoppeld' });
  }),
);

/**
 * @swagger
 * /notifications/telegram/webhook:
 *   post:
 *     summary: Telegram webhook endpoint
 *     tags: [Notification Channels]
 */
router.post(
  '/telegram/webhook',
  asyncHandler(async (req: Request, res: Response) => {
    const update = req.body as TelegramUpdate;

    // Process the update asynchronously
    processTelegramUpdate(update).catch((error) => {
      logger.error('Error processing Telegram update:', error);
    });

    // Always respond quickly to Telegram
    res.sendStatus(200);
  }),
);

// ==================== WHATSAPP ====================

/**
 * @swagger
 * /notifications/whatsapp/link:
 *   post:
 *     summary: Start WhatsApp linking process
 *     tags: [Notification Channels]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/whatsapp/link',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!isWhatsAppConfigured()) {
      throw new ApiError(503, 'WhatsApp is niet geconfigureerd');
    }

    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      throw new ApiError(400, 'Telefoonnummer is verplicht');
    }

    // Normalize phone number
    const normalizedNumber = phoneNumber.replace(/[^0-9+]/g, '');
    if (normalizedNumber.length < 10) {
      throw new ApiError(400, 'Ongeldig telefoonnummer');
    }

    // Generate verification code
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store pending verification
    const existingPending = db
      .prepare(
        `
        SELECT id FROM whatsapp_verifications WHERE user_id = ?
    `,
      )
      .get(req.user!.id);

    if (existingPending) {
      db.prepare(
        `
            UPDATE whatsapp_verifications
            SET phone_number = ?, code = ?, expires_at = ?, created_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        `,
      ).run(normalizedNumber, code, expiresAt.toISOString(), req.user!.id);
    } else {
      db.prepare(
        `
            INSERT INTO whatsapp_verifications (id, user_id, phone_number, code, expires_at)
            VALUES (?, ?, ?, ?, ?)
        `,
      ).run(uuidv4(), req.user!.id, normalizedNumber, code, expiresAt.toISOString());
    }

    // Send verification code via WhatsApp
    const sent = await sendVerificationCode(normalizedNumber, code);
    if (!sent) {
      throw new ApiError(500, 'Kon verificatiecode niet verzenden');
    }

    res.json({
      message: 'Verificatiecode verzonden naar WhatsApp',
      phoneNumber: normalizedNumber.slice(0, -4) + '****', // Mask last 4 digits
      expiresIn: 600,
    });
  }),
);

/**
 * @swagger
 * /notifications/whatsapp/verify:
 *   post:
 *     summary: Verify WhatsApp code
 *     tags: [Notification Channels]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/whatsapp/verify',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { code } = req.body;

    if (!code) {
      throw new ApiError(400, 'Verificatiecode is verplicht');
    }

    // Find pending verification
    const verification = db
      .prepare(
        `
        SELECT * FROM whatsapp_verifications
        WHERE user_id = ? AND code = ? AND expires_at > datetime('now')
    `,
      )
      .get(req.user!.id, code) as { id: string; phone_number: string } | undefined;

    if (!verification) {
      throw new ApiError(400, 'Ongeldige of verlopen verificatiecode');
    }

    // Delete any existing WhatsApp channel for this user
    db.prepare(
      `
        DELETE FROM user_notification_channels
        WHERE user_id = ? AND channel_type = 'whatsapp'
    `,
    ).run(req.user!.id);

    // Create verified channel
    db.prepare(
      `
        INSERT INTO user_notification_channels (id, user_id, channel_type, channel_id, verified, created_at)
        VALUES (?, ?, 'whatsapp', ?, 1, CURRENT_TIMESTAMP)
    `,
    ).run(uuidv4(), req.user!.id, verification.phone_number);

    // Enable WhatsApp channel in preferences
    const existingPref = db
      .prepare(
        `
        SELECT id FROM notification_channel_preferences WHERE user_id = ? AND channel = 'whatsapp'
    `,
      )
      .get(req.user!.id);

    if (existingPref) {
      db.prepare(
        `
            UPDATE notification_channel_preferences SET enabled = 1, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND channel = 'whatsapp'
        `,
      ).run(req.user!.id);
    } else {
      db.prepare(
        `
            INSERT INTO notification_channel_preferences (id, user_id, channel, enabled)
            VALUES (?, ?, 'whatsapp', 1)
        `,
      ).run(uuidv4(), req.user!.id);
    }

    // Delete verification record
    db.prepare(`DELETE FROM whatsapp_verifications WHERE id = ?`).run(verification.id);

    res.json({ message: 'WhatsApp nummer geverifieerd' });
  }),
);

/**
 * @swagger
 * /notifications/whatsapp/status:
 *   get:
 *     summary: Get WhatsApp connection status
 *     tags: [Notification Channels]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/whatsapp/status',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const channel = db
      .prepare(
        `
        SELECT channel_id, verified, created_at FROM user_notification_channels
        WHERE user_id = ? AND channel_type = 'whatsapp'
    `,
      )
      .get(req.user!.id) as { channel_id: string; verified: number; created_at: string } | undefined;

    res.json({
      linked: !!channel,
      verified: channel?.verified ? true : false,
      phoneNumber: channel ? channel.channel_id.slice(0, -4) + '****' : null,
      linkedAt: channel?.created_at || null,
    });
  }),
);

/**
 * @swagger
 * /notifications/whatsapp/unlink:
 *   delete:
 *     summary: Unlink WhatsApp number
 *     tags: [Notification Channels]
 *     security:
 *       - bearerAuth: []
 */
router.delete(
  '/whatsapp/unlink',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    db.prepare(
      `
        DELETE FROM user_notification_channels
        WHERE user_id = ? AND channel_type = 'whatsapp'
    `,
    ).run(req.user!.id);

    res.json({ message: 'WhatsApp nummer ontkoppeld' });
  }),
);

/**
 * @swagger
 * /notifications/whatsapp/webhook:
 *   get:
 *     summary: WhatsApp webhook verification (GET)
 *     tags: [Notification Channels]
 */
router.get('/whatsapp/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'] as string;
  const token = req.query['hub.verify_token'] as string;
  const challenge = req.query['hub.challenge'] as string;

  const result = verifyWhatsAppWebhook(mode, token, challenge);
  if (result) {
    res.status(200).send(result);
  } else {
    res.sendStatus(403);
  }
});

/**
 * @swagger
 * /notifications/whatsapp/webhook:
 *   post:
 *     summary: WhatsApp webhook endpoint (POST)
 *     tags: [Notification Channels]
 */
router.post(
  '/whatsapp/webhook',
  asyncHandler(async (req: Request, res: Response) => {
    const payload = req.body;

    // Parse delivery status
    const status = parseWhatsAppWebhookPayload(payload);
    if (status) {
      logger.info(`WhatsApp delivery status: ${status.messageId} - ${status.status}`);
      // Could store status in database for tracking
    }

    // Always respond with 200 to WhatsApp
    res.sendStatus(200);
  }),
);

export default router;
