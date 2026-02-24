import { Router, Request, Response } from 'express';
import db from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth';
import logger from '../utils/logger';

const router = Router();

interface NotificationSettings {
    id: string;
    orchestra_id: string;
    webhook_url: string;
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

        res.json({
            ...settings,
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
        const { webhook_url, minutes_before, enabled, include_image, message_template } = req.body;

        if (!webhook_url) {
            return res.status(400).json({ error: 'webhook_url is required' });
        }

        const existing = db.prepare(`
            SELECT id FROM seating_notification_settings WHERE orchestra_id = ?
        `).get(orchestraId) as { id: string } | undefined;

        if (existing) {
            db.prepare(`
                UPDATE seating_notification_settings
                SET webhook_url = ?, minutes_before = ?, enabled = ?, include_image = ?, message_template = ?, updated_at = CURRENT_TIMESTAMP
                WHERE orchestra_id = ?
            `).run(webhook_url, minutes_before ?? 15, enabled ?? true, include_image ?? true, message_template, orchestraId);
        } else {
            const id = uuidv4();
            db.prepare(`
                INSERT INTO seating_notification_settings (id, orchestra_id, webhook_url, minutes_before, enabled, include_image, message_template)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(id, orchestraId, webhook_url, minutes_before ?? 15, enabled ?? true, include_image ?? true, message_template);
        }

        const settings = db.prepare(`
            SELECT * FROM seating_notification_settings WHERE orchestra_id = ?
        `).get(orchestraId) as NotificationSettings;

        res.json({
            ...settings,
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

// Send notification manually for a rehearsal (for testing or manual triggering)
router.post('/send/:rehearsalId', authenticateToken, async (req: Request, res: Response) => {
    try {
        const { rehearsalId } = req.params;
        const { imageBase64 } = req.body; // Optional: frontend can provide a base64 image

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

        let messageText = settings.message_template || buildDefaultMessage(rehearsal, rows, conductors.length, regularMembers.length);

        // Replace placeholders in template
        messageText = messageText
            .replace('{orchestra}', rehearsal.orchestra_name || 'Orkest')
            .replace('{date}', formatDate(rehearsal.date))
            .replace('{time}', rehearsal.start_time || '')
            .replace('{location}', rehearsal.location || '')
            .replace('{total_members}', String(regularMembers.length))
            .replace('{total_conductors}', String(conductors.length))
            .replace('{chairs_summary}', rows.map(r => `Rij ${r.row}: ${r.chairs}`).join(', '));

        // Prepare webhook payload
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

        // Add image if provided
        if (imageBase64 && settings.include_image) {
            payload.image = imageBase64;
        }

        // Create log entry
        const logId = uuidv4();
        db.prepare(`
            INSERT INTO seating_notification_logs (id, rehearsal_id, orchestra_id, status)
            VALUES (?, ?, ?, 'pending')
        `).run(logId, rehearsalId, rehearsal.orchestra_id);

        // Send webhook
        try {
            const response = await fetch(settings.webhook_url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const responseText = await response.text();

            if (response.ok) {
                db.prepare(`
                    UPDATE seating_notification_logs
                    SET status = 'sent', webhook_response = ?, sent_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(responseText.substring(0, 1000), logId);

                res.json({ success: true, message: 'Notification sent successfully' });
            } else {
                throw new Error(`Webhook returned ${response.status}: ${responseText}`);
            }
        } catch (webhookError) {
            const errorMessage = webhookError instanceof Error ? webhookError.message : 'Unknown error';

            db.prepare(`
                UPDATE seating_notification_logs
                SET status = 'failed', error_message = ?, sent_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(errorMessage.substring(0, 500), logId);

            logger.error('Webhook failed', { error: webhookError, webhookUrl: settings.webhook_url });
            res.status(500).json({ error: 'Failed to send notification', details: errorMessage });
        }
    } catch (error) {
        logger.error('Error sending notification', { error });
        res.status(500).json({ error: 'Failed to send notification' });
    }
});

// Check for upcoming rehearsals and send notifications (called by scheduler)
router.post('/check-and-send', authenticateToken, async (req: Request, res: Response) => {
    try {
        const now = new Date();
        const results: { rehearsalId: string; status: string; error?: string }[] = [];

        // Get all enabled notification settings
        const allSettings = db.prepare(`
            SELECT sns.*, o.name as orchestra_name
            FROM seating_notification_settings sns
            JOIN orchestras o ON sns.orchestra_id = o.id
            WHERE sns.enabled = 1
        `).all() as (NotificationSettings & { orchestra_name: string })[];

        for (const settings of allSettings) {
            // Calculate the target time window
            const targetTime = new Date(now.getTime() + settings.minutes_before * 60 * 1000);
            const windowStart = new Date(targetTime.getTime() - 2 * 60 * 1000); // 2 min before
            const windowEnd = new Date(targetTime.getTime() + 2 * 60 * 1000); // 2 min after

            const today = now.toISOString().split('T')[0];
            const windowStartTime = windowStart.toTimeString().substring(0, 5);
            const windowEndTime = windowEnd.toTimeString().substring(0, 5);

            // Find rehearsals in the time window that haven't been notified
            const rehearsals = db.prepare(`
                SELECT r.*
                FROM rehearsals r
                WHERE r.orchestra_id = ?
                AND r.date = ?
                AND r.start_time >= ?
                AND r.start_time <= ?
                AND NOT EXISTS (
                    SELECT 1 FROM seating_notification_logs snl
                    WHERE snl.rehearsal_id = r.id
                    AND snl.status = 'sent'
                )
            `).all(settings.orchestra_id, today, windowStartTime, windowEndTime) as {
                id: string;
                date: string;
                start_time: string;
                end_time: string;
                location: string;
            }[];

            for (const rehearsal of rehearsals) {
                // Check if seating arrangement exists
                const seatingCount = db.prepare(`
                    SELECT COUNT(*) as count FROM rehearsal_seating WHERE rehearsal_id = ?
                `).get(rehearsal.id) as { count: number };

                if (seatingCount.count === 0) {
                    results.push({ rehearsalId: rehearsal.id, status: 'skipped', error: 'No seating arrangement' });
                    continue;
                }

                // Send notification (reuse the send logic)
                try {
                    const seating = db.prepare(`
                        SELECT rs.*, ss.name as section_name
                        FROM rehearsal_seating rs
                        LEFT JOIN seating_sections ss ON rs.section_id = ss.id
                        WHERE rs.rehearsal_id = ?
                        ORDER BY rs.row_number, rs.position_in_row
                    `).all(rehearsal.id) as {
                        member_name: string;
                        instrument_name: string | null;
                        row_number: number;
                        position_in_row: number;
                        is_conductor: boolean;
                    }[];

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

                    const conductors = seating.filter(s => s.is_conductor);
                    const regularMembers = seating.filter(s => !s.is_conductor);

                    let messageText = settings.message_template || buildDefaultMessage(
                        { ...rehearsal, orchestra_name: settings.orchestra_name },
                        rows,
                        conductors.length,
                        regularMembers.length
                    );

                    messageText = messageText
                        .replace('{orchestra}', settings.orchestra_name || 'Orkest')
                        .replace('{date}', formatDate(rehearsal.date))
                        .replace('{time}', rehearsal.start_time || '')
                        .replace('{location}', rehearsal.location || '')
                        .replace('{total_members}', String(regularMembers.length))
                        .replace('{total_conductors}', String(conductors.length))
                        .replace('{chairs_summary}', rows.map(r => `Rij ${r.row}: ${r.chairs}`).join(', '));

                    const payload = {
                        type: 'seating_notification',
                        rehearsal: {
                            id: rehearsal.id,
                            date: rehearsal.date,
                            startTime: rehearsal.start_time,
                            endTime: rehearsal.end_time,
                            location: rehearsal.location,
                        },
                        orchestra: {
                            id: settings.orchestra_id,
                            name: settings.orchestra_name,
                        },
                        seating: {
                            totalMembers: regularMembers.length,
                            totalConductors: conductors.length,
                            rows,
                        },
                        message: messageText,
                    };

                    const logId = uuidv4();
                    db.prepare(`
                        INSERT INTO seating_notification_logs (id, rehearsal_id, orchestra_id, status)
                        VALUES (?, ?, ?, 'pending')
                    `).run(logId, rehearsal.id, settings.orchestra_id);

                    const response = await fetch(settings.webhook_url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                    });

                    const responseText = await response.text();

                    if (response.ok) {
                        db.prepare(`
                            UPDATE seating_notification_logs
                            SET status = 'sent', webhook_response = ?, sent_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        `).run(responseText.substring(0, 1000), logId);
                        results.push({ rehearsalId: rehearsal.id, status: 'sent' });
                    } else {
                        throw new Error(`HTTP ${response.status}: ${responseText}`);
                    }
                } catch (sendError) {
                    const errorMessage = sendError instanceof Error ? sendError.message : 'Unknown error';
                    results.push({ rehearsalId: rehearsal.id, status: 'failed', error: errorMessage });
                }
            }
        }

        res.json({ results });
    } catch (error) {
        logger.error('Error in check-and-send', { error });
        res.status(500).json({ error: 'Failed to check and send notifications' });
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
    memberCount: number
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

    return lines.filter(Boolean).join('\n');
}

export default router;
