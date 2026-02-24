import { Router, Request, Response } from 'express';
import db from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth';
import logger from '../utils/logger';
import twilio from 'twilio';

const router = Router();

interface NotificationSettings {
    id: string;
    orchestra_id: string;
    notification_type: 'webhook' | 'whatsapp';
    webhook_url: string | null;
    twilio_account_sid: string | null;
    twilio_auth_token: string | null;
    twilio_whatsapp_from: string | null;
    twilio_whatsapp_to: string | null;
    minutes_before: number;
    enabled: boolean;
    include_image: boolean;
    message_template: string | null;
    created_at: string;
    updated_at: string;
}

interface NotificationLog {
    id: string;
    rehearsal_id: string;
    orchestra_id: string;
    sent_at: string;
    status: string;
    error_message: string | null;
    webhook_response: string | null;
}

// Get notification settings for an orchestra
router.get('/settings/:orchestraId', authenticateToken, (req: Request, res: Response) => {
    try {
        const { orchestraId } = req.params;

        const settings = db.prepare(`
            SELECT * FROM seating_notification_settings WHERE orchestra_id = ?
        `).get(orchestraId) as NotificationSettings | undefined;

        if (!settings) {
            return res.json(null);
        }

        // Don't send the auth token back to the frontend
        res.json({
            ...settings,
            twilio_auth_token: settings.twilio_auth_token ? '••••••••' : null,
            enabled: Boolean(settings.enabled),
            include_image: Boolean(settings.include_image),
        });
    } catch (error) {
        logger.error('Error fetching notification settings', { error });
        res.status(500).json({ error: 'Failed to fetch notification settings' });
    }
});

// Create or update notification settings
router.put('/settings/:orchestraId', authenticateToken, (req: Request, res: Response) => {
    try {
        const { orchestraId } = req.params;
        const {
            notification_type,
            webhook_url,
            twilio_account_sid,
            twilio_auth_token,
            twilio_whatsapp_from,
            twilio_whatsapp_to,
            minutes_before,
            enabled,
            include_image,
            message_template
        } = req.body;

        const notifType = notification_type || 'webhook';

        // Validate based on type
        if (notifType === 'webhook' && !webhook_url) {
            return res.status(400).json({ error: 'webhook_url is required for webhook type' });
        }
        if (notifType === 'whatsapp') {
            if (!twilio_account_sid) {
                return res.status(400).json({ error: 'twilio_account_sid is required for WhatsApp' });
            }
            if (!twilio_whatsapp_from) {
                return res.status(400).json({ error: 'twilio_whatsapp_from is required for WhatsApp' });
            }
            if (!twilio_whatsapp_to) {
                return res.status(400).json({ error: 'twilio_whatsapp_to is required for WhatsApp' });
            }
        }

        const existing = db.prepare(`
            SELECT id, twilio_auth_token FROM seating_notification_settings WHERE orchestra_id = ?
        `).get(orchestraId) as { id: string; twilio_auth_token: string | null } | undefined;

        // Keep existing token if not changed (masked value sent back)
        const tokenToSave = twilio_auth_token === '••••••••'
            ? existing?.twilio_auth_token
            : twilio_auth_token;

        if (existing) {
            db.prepare(`
                UPDATE seating_notification_settings
                SET notification_type = ?, webhook_url = ?, twilio_account_sid = ?, twilio_auth_token = ?,
                    twilio_whatsapp_from = ?, twilio_whatsapp_to = ?,
                    minutes_before = ?, enabled = ?, include_image = ?, message_template = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE orchestra_id = ?
            `).run(
                notifType,
                webhook_url || null,
                twilio_account_sid || null,
                tokenToSave || null,
                twilio_whatsapp_from || null,
                twilio_whatsapp_to || null,
                minutes_before ?? 15,
                enabled ?? true,
                include_image ?? true,
                message_template || null,
                orchestraId
            );
        } else {
            const id = uuidv4();
            db.prepare(`
                INSERT INTO seating_notification_settings
                (id, orchestra_id, notification_type, webhook_url, twilio_account_sid, twilio_auth_token,
                 twilio_whatsapp_from, twilio_whatsapp_to, minutes_before, enabled, include_image, message_template)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                id,
                orchestraId,
                notifType,
                webhook_url || null,
                twilio_account_sid || null,
                twilio_auth_token || null,
                twilio_whatsapp_from || null,
                twilio_whatsapp_to || null,
                minutes_before ?? 15,
                enabled ?? true,
                include_image ?? true,
                message_template || null
            );
        }

        const settings = db.prepare(`
            SELECT * FROM seating_notification_settings WHERE orchestra_id = ?
        `).get(orchestraId) as NotificationSettings;

        res.json({
            ...settings,
            twilio_auth_token: settings.twilio_auth_token ? '••••••••' : null,
            enabled: Boolean(settings.enabled),
            include_image: Boolean(settings.include_image),
        });
    } catch (error) {
        logger.error('Error saving notification settings', { error });
        res.status(500).json({ error: 'Failed to save notification settings' });
    }
});

// Delete notification settings
router.delete('/settings/:orchestraId', authenticateToken, (req: Request, res: Response) => {
    try {
        const { orchestraId } = req.params;

        db.prepare(`DELETE FROM seating_notification_settings WHERE orchestra_id = ?`).run(orchestraId);

        res.json({ success: true });
    } catch (error) {
        logger.error('Error deleting notification settings', { error });
        res.status(500).json({ error: 'Failed to delete notification settings' });
    }
});

// Get notification logs for a rehearsal
router.get('/logs/:rehearsalId', authenticateToken, (req: Request, res: Response) => {
    try {
        const { rehearsalId } = req.params;

        const logs = db.prepare(`
            SELECT * FROM seating_notification_logs
            WHERE rehearsal_id = ?
            ORDER BY sent_at DESC
        `).all(rehearsalId) as NotificationLog[];

        res.json(logs);
    } catch (error) {
        logger.error('Error fetching notification logs', { error });
        res.status(500).json({ error: 'Failed to fetch notification logs' });
    }
});

// Helper function to send via WhatsApp
async function sendWhatsApp(settings: NotificationSettings, message: string): Promise<{ success: boolean; error?: string }> {
    if (!settings.twilio_account_sid || !settings.twilio_auth_token) {
        return { success: false, error: 'Twilio credentials not configured' };
    }

    try {
        const client = twilio(settings.twilio_account_sid, settings.twilio_auth_token);

        // Parse destination numbers (comma-separated)
        const destinations = settings.twilio_whatsapp_to?.split(',').map(n => n.trim()) || [];

        if (destinations.length === 0) {
            return { success: false, error: 'No WhatsApp destination numbers configured' };
        }

        const results: string[] = [];

        for (const to of destinations) {
            try {
                const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
                const fromNumber = settings.twilio_whatsapp_from?.startsWith('whatsapp:')
                    ? settings.twilio_whatsapp_from
                    : `whatsapp:${settings.twilio_whatsapp_from}`;

                await client.messages.create({
                    body: message,
                    from: fromNumber,
                    to: toNumber,
                });
                results.push(`Sent to ${to}`);
            } catch (sendError) {
                const errorMsg = sendError instanceof Error ? sendError.message : 'Unknown error';
                results.push(`Failed to send to ${to}: ${errorMsg}`);
            }
        }

        const allSuccessful = results.every(r => r.startsWith('Sent'));
        return {
            success: allSuccessful,
            error: allSuccessful ? undefined : results.join('; '),
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMsg };
    }
}

// Helper function to send via webhook
async function sendWebhook(settings: NotificationSettings, payload: Record<string, unknown>): Promise<{ success: boolean; error?: string; response?: string }> {
    if (!settings.webhook_url) {
        return { success: false, error: 'Webhook URL not configured' };
    }

    try {
        const response = await fetch(settings.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const responseText = await response.text();

        if (response.ok) {
            return { success: true, response: responseText.substring(0, 1000) };
        } else {
            return { success: false, error: `HTTP ${response.status}: ${responseText}` };
        }
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: errorMsg };
    }
}

// Send notification manually for a rehearsal (for testing or manual triggering)
router.post('/send/:rehearsalId', authenticateToken, async (req: Request, res: Response) => {
    try {
        const { rehearsalId } = req.params;

        // Get rehearsal details
        const rehearsal = db.prepare(`
            SELECT r.*, o.name as orchestra_name
            FROM rehearsals r
            LEFT JOIN orchestras o ON r.orchestra_id = o.id
            WHERE r.id = ?
        `).get(rehearsalId) as {
            id: string;
            date: string;
            start_time: string;
            end_time: string;
            location: string;
            orchestra_id: string;
            orchestra_name: string;
        } | undefined;

        if (!rehearsal) {
            return res.status(404).json({ error: 'Rehearsal not found' });
        }

        if (!rehearsal.orchestra_id) {
            return res.status(400).json({ error: 'Rehearsal has no orchestra assigned' });
        }

        // Get notification settings
        const settings = db.prepare(`
            SELECT * FROM seating_notification_settings WHERE orchestra_id = ? AND enabled = 1
        `).get(rehearsal.orchestra_id) as NotificationSettings | undefined;

        if (!settings) {
            return res.status(400).json({ error: 'No notification settings configured for this orchestra' });
        }

        // Get seating arrangement
        const seating = db.prepare(`
            SELECT rs.*, ss.name as section_name
            FROM rehearsal_seating rs
            LEFT JOIN seating_sections ss ON rs.section_id = ss.id
            WHERE rs.rehearsal_id = ?
            ORDER BY rs.row_number, rs.position_in_row
        `).all(rehearsalId) as {
            id: string;
            member_name: string;
            instrument_name: string | null;
            section_name: string | null;
            row_number: number;
            position_in_row: number;
            is_conductor: boolean;
        }[];

        if (seating.length === 0) {
            return res.status(400).json({ error: 'No seating arrangement generated for this rehearsal' });
        }

        // Group by row
        const rowsMap = new Map<number, typeof seating>();
        for (const seat of seating) {
            if (!rowsMap.has(seat.row_number)) {
                rowsMap.set(seat.row_number, []);
            }
            rowsMap.get(seat.row_number)!.push(seat);
        }

        const rows = Array.from(rowsMap.entries())
            .sort(([a], [b]) => a - b)
            .map(([rowNumber, seats]) => ({
                row: rowNumber,
                chairs: seats.length,
                members: seats.map(s => ({
                    name: s.member_name,
                    instrument: s.instrument_name,
                    isConductor: Boolean(s.is_conductor),
                })),
            }));

        // Build message
        const conductors = seating.filter(s => s.is_conductor);
        const regularMembers = seating.filter(s => !s.is_conductor);

        // Get attendance data (declined members)
        const attendance = db.prepare(`
            SELECT member_name, status
            FROM rehearsal_attendance
            WHERE rehearsal_id = ?
            ORDER BY member_name
        `).all(rehearsalId) as { member_name: string; status: string }[];

        const declinedMembers = attendance
            .filter(a => a.status === 'declined')
            .map(a => a.member_name);

        let messageText = settings.message_template || buildDefaultMessage(rehearsal, rows, conductors.length, regularMembers.length, declinedMembers);

        // Replace placeholders in template
        messageText = messageText
            .replace('{orchestra}', rehearsal.orchestra_name || 'Orkest')
            .replace('{date}', formatDate(rehearsal.date))
            .replace('{time}', rehearsal.start_time || '')
            .replace('{location}', rehearsal.location || '')
            .replace('{total_members}', String(regularMembers.length))
            .replace('{total_conductors}', String(conductors.length))
            .replace('{chairs_summary}', rows.map(r => `Rij ${r.row}: ${r.chairs}`).join(', '))
            .replace('{absent_count}', String(declinedMembers.length))
            .replace('{absent_members}', declinedMembers.join(', ') || 'Niemand');

        // Create log entry
        const logId = uuidv4();
        db.prepare(`
            INSERT INTO seating_notification_logs (id, rehearsal_id, orchestra_id, status)
            VALUES (?, ?, ?, 'pending')
        `).run(logId, rehearsalId, rehearsal.orchestra_id);

        // Send based on notification type
        let result: { success: boolean; error?: string; response?: string };

        if (settings.notification_type === 'whatsapp') {
            result = await sendWhatsApp(settings, messageText);
        } else {
            // Webhook payload
            const payload: Record<string, unknown> = {
                type: 'seating_notification',
                rehearsal: {
                    id: rehearsal.id,
                    date: rehearsal.date,
                    startTime: rehearsal.start_time,
                    endTime: rehearsal.end_time,
                    location: rehearsal.location,
                },
                orchestra: {
                    id: rehearsal.orchestra_id,
                    name: rehearsal.orchestra_name,
                },
                seating: {
                    totalMembers: regularMembers.length,
                    totalConductors: conductors.length,
                    rows,
                },
                message: messageText,
            };
            result = await sendWebhook(settings, payload);
        }

        if (result.success) {
            db.prepare(`
                UPDATE seating_notification_logs
                SET status = 'sent', webhook_response = ?, sent_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(result.response || 'WhatsApp message sent', logId);

            res.json({ success: true, message: 'Notification sent successfully' });
        } else {
            db.prepare(`
                UPDATE seating_notification_logs
                SET status = 'failed', error_message = ?, sent_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(result.error?.substring(0, 500), logId);

            logger.error('Notification failed', { error: result.error });
            res.status(500).json({ error: 'Failed to send notification', details: result.error });
        }
    } catch (error) {
        logger.error('Error sending notification', { error });
        res.status(500).json({ error: 'Failed to send notification' });
    }
});

// Test Twilio connection
router.post('/test-twilio', authenticateToken, async (req: Request, res: Response) => {
    try {
        const { account_sid, auth_token, whatsapp_from, whatsapp_to } = req.body;

        if (!account_sid || !auth_token || !whatsapp_from || !whatsapp_to) {
            return res.status(400).json({ error: 'All Twilio fields are required' });
        }

        const client = twilio(account_sid, auth_token);

        const fromNumber = whatsapp_from.startsWith('whatsapp:') ? whatsapp_from : `whatsapp:${whatsapp_from}`;
        const toNumber = whatsapp_to.startsWith('whatsapp:') ? whatsapp_to : `whatsapp:${whatsapp_to}`;

        await client.messages.create({
            body: '✅ Testbericht van Harmonie - WhatsApp koppeling werkt!',
            from: fromNumber,
            to: toNumber,
        });

        res.json({ success: true, message: 'Test message sent successfully' });
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Twilio test failed', { error: errorMsg });
        res.status(400).json({ error: `Twilio test failed: ${errorMsg}` });
    }
});

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
}

function buildDefaultMessage(
    rehearsal: { orchestra_name?: string; date: string; start_time?: string; location?: string },
    rows: { row: number; chairs: number }[],
    conductorCount: number,
    memberCount: number,
    declinedMembers: string[] = []
): string {
    const lines = [
        `🎵 Opstelling ${rehearsal.orchestra_name || 'Orkest'}`,
        `📅 ${formatDate(rehearsal.date)}${rehearsal.start_time ? ` om ${rehearsal.start_time}` : ''}`,
        rehearsal.location ? `📍 ${rehearsal.location}` : '',
        '',
        `👥 Totaal: ${memberCount} leden${conductorCount > 0 ? ` + ${conductorCount} dirigent${conductorCount > 1 ? 'en' : ''}` : ''}`,
        '',
        '🪑 Stoelen per rij:',
        ...rows.map(r => `  Rij ${r.row}: ${r.chairs} stoelen`),
    ];

    // Add absent members section if there are any
    if (declinedMembers.length > 0) {
        lines.push('');
        lines.push(`❌ Afgemeld (${declinedMembers.length}):`);
        lines.push(`  ${declinedMembers.join(', ')}`);
    }

    return lines.filter(Boolean).join('\n');
}

export default router;
