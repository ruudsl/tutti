import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { SpondClient, encryptPassword, decryptPassword } from '../services/spond';
import logger from '../utils/logger';

const router = Router();

// ========================
// SPOND CONFIG
// ========================

/**
 * GET /spond/config - Get Spond configuration (without password)
 */
router.get('/config', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const config = db.prepare(`
        SELECT id, username, group_id, sync_enabled, last_sync, created_at
        FROM spond_config
        WHERE association_id = ?
    `).get(req.user!.associationId) as any;

    if (!config) {
        return res.json({ configured: false });
    }

    res.json({
        configured: true,
        username: config.username,
        groupId: config.group_id,
        syncEnabled: !!config.sync_enabled,
        lastSync: config.last_sync,
    });
}));

/**
 * PUT /spond/config - Save/update Spond configuration
 */
router.put('/config', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { username, password, groupId, syncEnabled } = req.body;

    if (!username || !password) {
        throw new ApiError(400, 'Gebruikersnaam en wachtwoord zijn verplicht.');
    }

    // Verify credentials by attempting login
    try {
        const client = new SpondClient(username, password);
        await client.login();
    } catch {
        throw new ApiError(400, 'Kon niet inloggen bij Spond. Controleer de inloggegevens.');
    }

    const encryptedPassword = encryptPassword(password);

    const existing = db.prepare('SELECT id FROM spond_config WHERE association_id = ?').get(req.user!.associationId) as any;

    if (existing) {
        db.prepare(`
            UPDATE spond_config
            SET username = ?, password_encrypted = ?, group_id = ?, sync_enabled = ?
            WHERE association_id = ?
        `).run(username, encryptedPassword, groupId || null, syncEnabled ? 1 : 0, req.user!.associationId);
    } else {
        db.prepare(`
            INSERT INTO spond_config (id, association_id, username, password_encrypted, group_id, sync_enabled)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), req.user!.associationId, username, encryptedPassword, groupId || null, syncEnabled ? 1 : 0);
    }

    logger.info('Spond config updated', { associationId: req.user!.associationId });

    res.json({ message: 'Spond-configuratie opgeslagen.' });
}));

/**
 * DELETE /spond/config - Remove Spond configuration
 */
router.delete('/config', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    db.prepare('DELETE FROM spond_config WHERE association_id = ?').run(req.user!.associationId);
    logger.info('Spond config removed', { associationId: req.user!.associationId });
    res.json({ message: 'Spond-configuratie verwijderd.' });
}));

// ========================
// SPOND GROUPS
// ========================

/**
 * GET /spond/groups - Fetch Spond groups (live from Spond API)
 */
router.get('/groups', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const config = db.prepare(`
        SELECT username, password_encrypted FROM spond_config WHERE association_id = ?
    `).get(req.user!.associationId) as any;

    if (!config) {
        throw new ApiError(400, 'Spond is niet geconfigureerd.');
    }

    const password = decryptPassword(config.password_encrypted);
    const client = new SpondClient(config.username, password);
    const groups = await client.getGroups();

    res.json(groups);
}));

// ========================
// SPOND SYNC
// ========================

/**
 * POST /spond/sync - Sync attendance from Spond for upcoming rehearsals
 */
router.post('/sync', authenticateToken, requireRole('admin', 'music_committee', 'conductor'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const spondConfig = db.prepare(`
        SELECT username, password_encrypted, group_id, sync_enabled
        FROM spond_config
        WHERE association_id = ?
    `).get(req.user!.associationId) as any;

    if (!spondConfig || !spondConfig.group_id) {
        throw new ApiError(400, 'Spond is niet geconfigureerd of er is geen groep geselecteerd.');
    }

    const password = decryptPassword(spondConfig.password_encrypted);
    const client = new SpondClient(spondConfig.username, password);

    // Get upcoming rehearsals (next 3 months)
    const today = new Date().toISOString().split('T')[0];
    const threeMonths = new Date();
    threeMonths.setMonth(threeMonths.getMonth() + 3);
    const endDate = threeMonths.toISOString().split('T')[0];

    const rehearsals = db.prepare(`
        SELECT id, date, start_time, end_time, spond_event_id
        FROM rehearsals
        WHERE association_id = ? AND date >= ? AND date <= ? AND type != 'cancelled'
        ORDER BY date
    `).all(req.user!.associationId, today, endDate) as any[];

    // Fetch Spond events
    const events = await client.getEvents(spondConfig.group_id, today, endDate);

    let synced = 0;

    for (const rehearsal of rehearsals) {
        // Find matching Spond event by date
        const rehearsalDate = rehearsal.date;
        const matchingEvent = events.find(e => {
            const eventDate = e.startTimestamp.split('T')[0];
            return eventDate === rehearsalDate;
        });

        if (!matchingEvent) continue;

        // Link event if not already linked
        if (!rehearsal.spond_event_id) {
            db.prepare('UPDATE rehearsals SET spond_event_id = ? WHERE id = ?')
                .run(matchingEvent.id, rehearsal.id);
        }

        // Clear existing attendance for this rehearsal
        db.prepare('DELETE FROM rehearsal_attendance WHERE rehearsal_id = ?')
            .run(rehearsal.id);

        // Insert attendance from Spond
        const insertStmt = db.prepare(`
            INSERT INTO rehearsal_attendance (id, rehearsal_id, spond_member_id, member_name, status)
            VALUES (?, ?, ?, ?, ?)
        `);

        for (const response of matchingEvent.responses) {
            const name = `${response.firstName} ${response.lastName}`.trim() || 'Onbekend';
            const status = response.status === 'unanswered' ? 'unknown' : response.status;
            insertStmt.run(uuidv4(), rehearsal.id, response.id, name, status);
        }

        synced++;
    }

    // Update last sync timestamp
    db.prepare('UPDATE spond_config SET last_sync = CURRENT_TIMESTAMP WHERE association_id = ?')
        .run(req.user!.associationId);

    logger.info(`Spond sync completed: ${synced} rehearsals synced`, { associationId: req.user!.associationId });

    res.json({
        message: `${synced} repetities gesynchroniseerd met Spond.`,
        synced,
        total: rehearsals.length,
    });
}));

/**
 * POST /spond/sync/:rehearsalId - Sync a single rehearsal's attendance from Spond
 */
router.post('/sync/:rehearsalId', authenticateToken, requireRole('admin', 'music_committee', 'conductor'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { rehearsalId } = req.params;

    const rehearsal = db.prepare(`
        SELECT id, date, spond_event_id
        FROM rehearsals
        WHERE id = ? AND association_id = ?
    `).get(rehearsalId, req.user!.associationId) as any;

    if (!rehearsal) {
        throw new ApiError(404, 'Repetitie niet gevonden.');
    }

    const spondConfig = db.prepare(`
        SELECT username, password_encrypted, group_id
        FROM spond_config
        WHERE association_id = ?
    `).get(req.user!.associationId) as any;

    if (!spondConfig || !spondConfig.group_id) {
        throw new ApiError(400, 'Spond is niet geconfigureerd.');
    }

    const password = decryptPassword(spondConfig.password_encrypted);
    const client = new SpondClient(spondConfig.username, password);

    // Fetch events around this rehearsal's date
    const date = new Date(rehearsal.date);
    const dayBefore = new Date(date);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const dayAfter = new Date(date);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const events = await client.getEvents(
        spondConfig.group_id,
        dayBefore.toISOString().split('T')[0],
        dayAfter.toISOString().split('T')[0],
    );

    const matchingEvent = events.find(e => {
        const eventDate = e.startTimestamp.split('T')[0];
        return eventDate === rehearsal.date;
    });

    if (!matchingEvent) {
        throw new ApiError(404, 'Geen bijpassend Spond-event gevonden voor deze datum.');
    }

    // Link event
    if (!rehearsal.spond_event_id) {
        db.prepare('UPDATE rehearsals SET spond_event_id = ? WHERE id = ?')
            .run(matchingEvent.id, rehearsal.id);
    }

    // Clear and re-insert attendance
    db.prepare('DELETE FROM rehearsal_attendance WHERE rehearsal_id = ?')
        .run(rehearsal.id);

    const insertStmt = db.prepare(`
        INSERT INTO rehearsal_attendance (id, rehearsal_id, spond_member_id, member_name, status)
        VALUES (?, ?, ?, ?, ?)
    `);

    for (const response of matchingEvent.responses) {
        const name = `${response.firstName} ${response.lastName}`.trim() || 'Onbekend';
        const status = response.status === 'unanswered' ? 'unknown' : response.status;
        insertStmt.run(uuidv4(), rehearsal.id, response.id, name, status);
    }

    logger.info(`Spond sync for rehearsal ${rehearsalId}`, { associationId: req.user!.associationId });

    res.json({
        message: 'Aanwezigheid gesynchroniseerd.',
        attendanceCount: matchingEvent.responses.length,
    });
}));

export default router;
