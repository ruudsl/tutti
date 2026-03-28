import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import webpush from 'web-push';

const router = Router();

// Configure web-push if VAPID keys are set
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@harmonie.app';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Get user's notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { unreadOnly, type, limit = '50', offset = '0' } = req.query;

    let query = `
        SELECT * FROM notifications WHERE user_id = ?
    `;
    const params: any[] = [req.user!.id];

    if (unreadOnly === 'true') {
        query += ' AND is_read = 0';
    }
    if (type) {
        query += ' AND type = ?';
        params.push(type);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string) || 50);
    params.push(parseInt(offset as string) || 0);

    const notifications = db.prepare(query).all(...params);

    res.json(notifications.map((n: any) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        data: n.data ? JSON.parse(n.data) : null,
        isRead: !!n.is_read,
        createdAt: n.created_at,
        readAt: n.read_at,
    })));
}));

/**
 * @swagger
 * /notifications/unread-count:
 *   get:
 *     summary: Get unread notification count
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.get('/unread-count', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(`
        SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0
    `).get(req.user!.id) as { count: number };

    res.json({ count: result.count });
}));

/**
 * @swagger
 * /notifications/{id}/read:
 *   post:
 *     summary: Mark a notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/read', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    db.prepare(`
        UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
    `).run(req.params.id, req.user!.id);

    res.json({ message: 'Notificatie gelezen' });
}));

/**
 * @swagger
 * /notifications/read-all:
 *   post:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.post('/read-all', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    db.prepare(`
        UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND is_read = 0
    `).run(req.user!.id);

    res.json({ message: 'Alle notificaties gelezen' });
}));

/**
 * @swagger
 * /notifications/preferences:
 *   get:
 *     summary: Get notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.get('/preferences', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    let prefs = db.prepare(`
        SELECT * FROM notification_preferences WHERE user_id = ?
    `).get(req.user!.id) as any;

    // Create default preferences if not exists
    if (!prefs) {
        const id = uuidv4();
        db.prepare(`
            INSERT INTO notification_preferences (id, user_id) VALUES (?, ?)
        `).run(id, req.user!.id);
        prefs = db.prepare(`SELECT * FROM notification_preferences WHERE id = ?`).get(id);
    }

    res.json({
        newMusic: !!prefs.new_music,
        rehearsalChanges: !!prefs.rehearsal_changes,
        seatingUpdates: !!prefs.seating_updates,
        chatMessages: !!prefs.chat_messages,
        practiceReminders: !!prefs.practice_reminders,
        concertReminders: !!prefs.concert_reminders,
        emailEnabled: !!prefs.email_enabled,
        pushEnabled: !!prefs.push_enabled,
    });
}));

/**
 * @swagger
 * /notifications/preferences:
 *   patch:
 *     summary: Update notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/preferences', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const {
        newMusic,
        rehearsalChanges,
        seatingUpdates,
        chatMessages,
        practiceReminders,
        concertReminders,
        emailEnabled,
        pushEnabled,
    } = req.body;

    // Ensure preferences exist
    const existing = db.prepare(`SELECT id FROM notification_preferences WHERE user_id = ?`).get(req.user!.id);
    if (!existing) {
        db.prepare(`INSERT INTO notification_preferences (id, user_id) VALUES (?, ?)`).run(uuidv4(), req.user!.id);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (newMusic !== undefined) {
        updates.push('new_music = ?');
        params.push(newMusic ? 1 : 0);
    }
    if (rehearsalChanges !== undefined) {
        updates.push('rehearsal_changes = ?');
        params.push(rehearsalChanges ? 1 : 0);
    }
    if (seatingUpdates !== undefined) {
        updates.push('seating_updates = ?');
        params.push(seatingUpdates ? 1 : 0);
    }
    if (chatMessages !== undefined) {
        updates.push('chat_messages = ?');
        params.push(chatMessages ? 1 : 0);
    }
    if (practiceReminders !== undefined) {
        updates.push('practice_reminders = ?');
        params.push(practiceReminders ? 1 : 0);
    }
    if (concertReminders !== undefined) {
        updates.push('concert_reminders = ?');
        params.push(concertReminders ? 1 : 0);
    }
    if (emailEnabled !== undefined) {
        updates.push('email_enabled = ?');
        params.push(emailEnabled ? 1 : 0);
    }
    if (pushEnabled !== undefined) {
        updates.push('push_enabled = ?');
        params.push(pushEnabled ? 1 : 0);
    }

    if (updates.length > 0) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(req.user!.id);
        db.prepare(`UPDATE notification_preferences SET ${updates.join(', ')} WHERE user_id = ?`).run(...params);
    }

    res.json({ message: 'Voorkeuren bijgewerkt' });
}));

/**
 * @swagger
 * /notifications/push-subscription:
 *   post:
 *     summary: Register push subscription
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.post('/push-subscription', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { endpoint, keys } = req.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
        throw new ApiError(400, 'Ongeldige push subscription data');
    }

    // Check if subscription already exists
    const existing = db.prepare(`
        SELECT id FROM push_subscriptions WHERE endpoint = ?
    `).get(endpoint);

    if (existing) {
        // Update existing
        db.prepare(`
            UPDATE push_subscriptions SET p256dh_key = ?, auth_key = ? WHERE endpoint = ?
        `).run(keys.p256dh, keys.auth, endpoint);
    } else {
        // Create new
        db.prepare(`
            INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh_key, auth_key)
            VALUES (?, ?, ?, ?, ?)
        `).run(uuidv4(), req.user!.id, endpoint, keys.p256dh, keys.auth);
    }

    res.json({ message: 'Push subscription geregistreerd' });
}));

/**
 * @swagger
 * /notifications/push-subscription:
 *   delete:
 *     summary: Unregister push subscription
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/push-subscription', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { endpoint } = req.body;

    if (!endpoint) {
        throw new ApiError(400, 'Endpoint is verplicht');
    }

    db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?`).run(endpoint, req.user!.id);

    res.json({ message: 'Push subscription verwijderd' });
}));

/**
 * @swagger
 * /notifications/vapid-public-key:
 *   get:
 *     summary: Get VAPID public key for push notifications
 *     tags: [Notifications]
 */
router.get('/vapid-public-key', (req, res) => {
    if (!VAPID_PUBLIC_KEY) {
        throw new ApiError(503, 'Push notifications niet geconfigureerd');
    }
    res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Helper function to send notification to a user
export async function sendNotification(
    userId: string,
    type: string,
    title: string,
    body: string,
    data?: Record<string, any>
): Promise<void> {
    // Check user preferences
    const prefs = db.prepare(`
        SELECT * FROM notification_preferences WHERE user_id = ?
    `).get(userId) as any;

    // Map notification type to preference
    const typeToPreference: Record<string, string> = {
        'new_music': 'new_music',
        'rehearsal_change': 'rehearsal_changes',
        'seating_update': 'seating_updates',
        'chat_message': 'chat_messages',
        'practice_reminder': 'practice_reminders',
        'concert_reminder': 'concert_reminders',
    };

    const prefKey = typeToPreference[type];
    if (prefs && prefKey && !prefs[prefKey]) {
        // User has disabled this notification type
        return;
    }

    // Create notification record
    const notificationId = uuidv4();
    db.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, data)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(notificationId, userId, type, title, body, data ? JSON.stringify(data) : null);

    // Send push notification if enabled
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && (!prefs || prefs.push_enabled)) {
        const subscriptions = db.prepare(`
            SELECT * FROM push_subscriptions WHERE user_id = ?
        `).all(userId) as any[];

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
                    JSON.stringify({
                        title,
                        body,
                        data: { ...data, notificationId },
                    })
                );

                // Mark as sent
                db.prepare(`UPDATE notifications SET sent_push = 1 WHERE id = ?`).run(notificationId);
            } catch (error: any) {
                logger.error(`Failed to send push notification: ${error.message}`);
                // Remove invalid subscription
                if (error.statusCode === 410 || error.statusCode === 404) {
                    db.prepare(`DELETE FROM push_subscriptions WHERE id = ?`).run(sub.id);
                }
            }
        }
    }
}

// Helper to notify all users in an orchestra
export async function notifyOrchestra(
    orchestraId: string,
    type: string,
    title: string,
    body: string,
    data?: Record<string, any>,
    excludeUserId?: string
): Promise<void> {
    const users = db.prepare(`
        SELECT user_id FROM user_orchestras WHERE orchestra_id = ?
    `).all(orchestraId) as { user_id: string }[];

    for (const { user_id } of users) {
        if (user_id !== excludeUserId) {
            await sendNotification(user_id, type, title, body, data);
        }
    }
}

// Helper to notify all users with a specific instrument
export async function notifyInstrumentSection(
    instrumentId: string,
    orchestraId: string,
    type: string,
    title: string,
    body: string,
    data?: Record<string, any>,
    excludeUserId?: string
): Promise<void> {
    const users = db.prepare(`
        SELECT ui.user_id FROM user_instruments ui
        JOIN user_orchestras uo ON ui.user_id = uo.user_id
        WHERE ui.instrument_id = ? AND uo.orchestra_id = ?
    `).all(instrumentId, orchestraId) as { user_id: string }[];

    for (const { user_id } of users) {
        if (user_id !== excludeUserId) {
            await sendNotification(user_id, type, title, body, data);
        }
    }
}

export default router;
