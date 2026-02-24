import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { SpondClient, encryptPassword, decryptPassword } from '../services/spond';
import logger from '../utils/logger';

const router = Router();

/** Convert "HH:MM" time string to minutes since midnight */
export function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

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

/**
 * GET /spond/orchestra-groups - Get orchestra-to-Spond-group mappings
 */
router.get('/orchestra-groups', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const mappings = db.prepare(`
        SELECT sog.id, sog.orchestra_id, sog.spond_group_id, sog.spond_group_name, o.name as orchestra_name
        FROM spond_orchestra_groups sog
        JOIN orchestras o ON sog.orchestra_id = o.id
        WHERE o.association_id = ?
    `).all(req.user!.associationId);

    res.json(mappings);
}));

/**
 * PUT /spond/orchestra-groups/:orchestraId - Set Spond group for an orchestra
 */
router.put('/orchestra-groups/:orchestraId', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orchestraId } = req.params;
    const { spondGroupId, spondGroupName } = req.body;

    // Verify orchestra belongs to association
    const orchestra = db.prepare(`
        SELECT id FROM orchestras WHERE id = ? AND association_id = ?
    `).get(orchestraId, req.user!.associationId);

    if (!orchestra) {
        throw new ApiError(404, 'Orkest niet gevonden.');
    }

    if (!spondGroupId) {
        // Remove mapping
        db.prepare('DELETE FROM spond_orchestra_groups WHERE orchestra_id = ?').run(orchestraId);
        return res.json({ message: 'Spond-groep verwijderd voor dit orkest.' });
    }

    const existing = db.prepare('SELECT id FROM spond_orchestra_groups WHERE orchestra_id = ?').get(orchestraId) as any;

    if (existing) {
        db.prepare(`
            UPDATE spond_orchestra_groups
            SET spond_group_id = ?, spond_group_name = ?
            WHERE orchestra_id = ?
        `).run(spondGroupId, spondGroupName || null, orchestraId);
    } else {
        db.prepare(`
            INSERT INTO spond_orchestra_groups (id, orchestra_id, spond_group_id, spond_group_name)
            VALUES (?, ?, ?, ?)
        `).run(uuidv4(), orchestraId, spondGroupId, spondGroupName || null);
    }

    logger.info('Spond orchestra group mapping updated', { orchestraId, spondGroupId });
    res.json({ message: 'Spond-groep gekoppeld aan orkest.' });
}));

// ========================
// SPOND MEMBER LINKS
// ========================

/**
 * GET /spond/member-links - Get all Spond member to user links
 */
router.get('/member-links', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const links = db.prepare(`
        SELECT sml.id, sml.spond_member_id, sml.user_id, sml.spond_member_name,
               u.first_name, u.last_name, u.email
        FROM spond_member_links sml
        JOIN users u ON sml.user_id = u.id
        WHERE sml.association_id = ?
    `).all(req.user!.associationId);

    res.json(links);
}));

/**
 * POST /spond/member-links - Link a Spond member to a user
 */
router.post('/member-links', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { spondMemberId, userId, spondMemberName } = req.body;

    if (!spondMemberId || !userId) {
        throw new ApiError(400, 'Spond member ID en user ID zijn verplicht.');
    }

    // Verify user belongs to association
    const user = db.prepare('SELECT id FROM users WHERE id = ? AND association_id = ?')
        .get(userId, req.user!.associationId);

    if (!user) {
        throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    // Insert or update
    const existing = db.prepare(`
        SELECT id FROM spond_member_links WHERE association_id = ? AND spond_member_id = ?
    `).get(req.user!.associationId, spondMemberId) as any;

    if (existing) {
        db.prepare(`
            UPDATE spond_member_links SET user_id = ?, spond_member_name = ? WHERE id = ?
        `).run(userId, spondMemberName || null, existing.id);
    } else {
        db.prepare(`
            INSERT INTO spond_member_links (id, association_id, spond_member_id, user_id, spond_member_name)
            VALUES (?, ?, ?, ?, ?)
        `).run(uuidv4(), req.user!.associationId, spondMemberId, userId, spondMemberName || null);
    }

    res.json({ message: 'Spond-lid gekoppeld aan gebruiker.' });
}));

/**
 * DELETE /spond/member-links/:id - Remove a member link
 */
router.delete('/member-links/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    db.prepare(`
        DELETE FROM spond_member_links
        WHERE id = ? AND association_id = ?
    `).run(id, req.user!.associationId);

    res.json({ message: 'Koppeling verwijderd.' });
}));

// ========================
// SPOND SYNC
// ========================

/**
 * POST /spond/sync - Sync attendance from Spond for upcoming rehearsals
 * Now supports orchestra-specific Spond groups and user matching
 */
router.post('/sync', authenticateToken, requireRole('admin', 'music_committee', 'conductor'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const spondConfig = db.prepare(`
        SELECT username, password_encrypted, group_id, sync_enabled
        FROM spond_config
        WHERE association_id = ?
    `).get(req.user!.associationId) as any;

    if (!spondConfig) {
        throw new ApiError(400, 'Spond is niet geconfigureerd.');
    }

    const password = decryptPassword(spondConfig.password_encrypted);
    const client = new SpondClient(spondConfig.username, password);

    // Get upcoming rehearsals (next 3 months) - now including orchestra_id
    const today = new Date().toISOString().split('T')[0];
    const threeMonths = new Date();
    threeMonths.setMonth(threeMonths.getMonth() + 3);
    const endDate = threeMonths.toISOString().split('T')[0];

    const rehearsals = db.prepare(`
        SELECT id, orchestra_id, date, start_time, end_time, spond_event_id
        FROM rehearsals
        WHERE association_id = ? AND date >= ? AND date <= ? AND type != 'cancelled'
        ORDER BY orchestra_id, date
    `).all(req.user!.associationId, today, endDate) as any[];

    // Get orchestra-specific Spond group mappings
    const orchestraGroups = db.prepare(`
        SELECT sog.orchestra_id, sog.spond_group_id
        FROM spond_orchestra_groups sog
        JOIN orchestras o ON sog.orchestra_id = o.id
        WHERE o.association_id = ?
    `).all(req.user!.associationId) as any[];

    const orchestraGroupMap = new Map(orchestraGroups.map(og => [og.orchestra_id, og.spond_group_id]));

    // Get existing member links for user matching
    const memberLinks = db.prepare(`
        SELECT spond_member_id, user_id FROM spond_member_links WHERE association_id = ?
    `).all(req.user!.associationId) as any[];
    const memberLinkMap = new Map(memberLinks.map(ml => [ml.spond_member_id, ml.user_id]));

    // Build user lookup by name for fallback matching
    const users = db.prepare(`
        SELECT id, first_name, last_name FROM users WHERE association_id = ?
    `).all(req.user!.associationId) as any[];
    const usersByName = new Map<string, string>();
    for (const u of users) {
        const fullName = `${u.first_name} ${u.last_name}`.toLowerCase().trim();
        usersByName.set(fullName, u.id);
    }

    // Collect all unique Spond group IDs we need to fetch
    const groupsToFetch = new Set<string>();
    if (spondConfig.group_id) groupsToFetch.add(spondConfig.group_id);
    for (const groupId of orchestraGroupMap.values()) {
        groupsToFetch.add(groupId);
    }

    if (groupsToFetch.size === 0) {
        throw new ApiError(400, 'Geen Spond-groepen geconfigureerd.');
    }

    // Fetch events from all configured Spond groups
    const allEvents = new Map<string, any[]>(); // groupId -> events
    for (const groupId of groupsToFetch) {
        try {
            const events = await client.getEvents(groupId, today, endDate);
            allEvents.set(groupId, events);
            logger.info(`Fetched ${events.length} events from Spond group ${groupId}`);
        } catch (err) {
            logger.warn(`Failed to fetch events from Spond group ${groupId}`, { error: err });
            allEvents.set(groupId, []);
        }
    }

    // Clear all existing spond_event_id links so we can re-match cleanly
    db.prepare(`
        UPDATE rehearsals SET spond_event_id = NULL
        WHERE association_id = ? AND date >= ? AND date <= ?
    `).run(req.user!.associationId, today, endDate);

    let synced = 0;
    const matchedEventIds = new Set<string>();

    // Group rehearsals by orchestra for proper matching
    const rehearsalsByOrchestra = new Map<string | null, any[]>();
    for (const rehearsal of rehearsals) {
        const key = rehearsal.orchestra_id || '__all__';
        if (!rehearsalsByOrchestra.has(key)) rehearsalsByOrchestra.set(key, []);
        rehearsalsByOrchestra.get(key)!.push(rehearsal);
    }

    for (const [orchestraKey, orchestraRehearsals] of rehearsalsByOrchestra) {
        // Determine which Spond group to use for this orchestra
        let groupId: string | null = null;
        if (orchestraKey !== '__all__') {
            groupId = orchestraGroupMap.get(orchestraKey) || spondConfig.group_id;
        } else {
            groupId = spondConfig.group_id;
        }

        if (!groupId) {
            logger.warn(`No Spond group for orchestra ${orchestraKey}, skipping`);
            continue;
        }

        const events = allEvents.get(groupId) || [];

        // Build a lookup: date -> list of events on that date
        const eventsByDate = new Map<string, typeof events>();
        for (const event of events) {
            const eventDate = event.startTimestamp.split('T')[0];
            if (!eventsByDate.has(eventDate)) eventsByDate.set(eventDate, []);
            eventsByDate.get(eventDate)!.push(event);
        }

        for (const rehearsal of orchestraRehearsals) {
            const sameDayEvents = (eventsByDate.get(rehearsal.date) || [])
                .filter(e => !matchedEventIds.has(e.id));

            let matchingEvent;

            if (sameDayEvents.length === 1) {
                matchingEvent = sameDayEvents[0];
            } else if (sameDayEvents.length > 1 && rehearsal.start_time) {
                // Multiple events on same day: find closest by start time
                const rehearsalMinutes = timeToMinutes(rehearsal.start_time);
                matchingEvent = sameDayEvents.reduce((best, e) => {
                    const eventTime = e.startTimestamp.split('T')[1]?.substring(0, 5) || '00:00';
                    const eventMinutes = timeToMinutes(eventTime);
                    const bestTime = best.startTimestamp.split('T')[1]?.substring(0, 5) || '00:00';
                    const bestMinutes = timeToMinutes(bestTime);
                    return Math.abs(eventMinutes - rehearsalMinutes) < Math.abs(bestMinutes - rehearsalMinutes) ? e : best;
                });
            }

            if (!matchingEvent) continue;
            matchedEventIds.add(matchingEvent.id);

            // Link event
            db.prepare('UPDATE rehearsals SET spond_event_id = ? WHERE id = ?')
                .run(matchingEvent.id, rehearsal.id);

            // Clear existing attendance for this rehearsal
            db.prepare('DELETE FROM rehearsal_attendance WHERE rehearsal_id = ?')
                .run(rehearsal.id);

            // Insert attendance from Spond with user matching
            const insertStmt = db.prepare(`
                INSERT INTO rehearsal_attendance (id, rehearsal_id, user_id, spond_member_id, member_name, status)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            for (const response of matchingEvent.responses) {
                const name = `${response.firstName} ${response.lastName}`.trim() || 'Onbekend';
                const status = response.status === 'unanswered' ? 'unknown' : response.status;

                // Try to match to a user: first by explicit link, then by name
                let userId: string | null = memberLinkMap.get(response.id) || null;
                if (!userId) {
                    userId = usersByName.get(name.toLowerCase().trim()) || null;

                    // If matched by name, save the link for future syncs
                    if (userId) {
                        try {
                            db.prepare(`
                                INSERT OR IGNORE INTO spond_member_links (id, association_id, spond_member_id, user_id, spond_member_name)
                                VALUES (?, ?, ?, ?, ?)
                            `).run(uuidv4(), req.user!.associationId, response.id, userId, name);
                            memberLinkMap.set(response.id, userId);
                        } catch {
                            // Ignore duplicate insert errors
                        }
                    }
                }

                insertStmt.run(uuidv4(), rehearsal.id, userId, response.id, name, status);
            }

            synced++;
        }
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
 * Now supports orchestra-specific Spond groups and user matching
 */
router.post('/sync/:rehearsalId', authenticateToken, requireRole('admin', 'music_committee', 'conductor'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { rehearsalId } = req.params;

    const rehearsal = db.prepare(`
        SELECT id, orchestra_id, date, start_time, spond_event_id
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

    if (!spondConfig) {
        throw new ApiError(400, 'Spond is niet geconfigureerd.');
    }

    // Determine which Spond group to use based on orchestra
    let groupId = spondConfig.group_id;
    if (rehearsal.orchestra_id) {
        const orchestraGroup = db.prepare(`
            SELECT spond_group_id FROM spond_orchestra_groups WHERE orchestra_id = ?
        `).get(rehearsal.orchestra_id) as any;
        if (orchestraGroup) {
            groupId = orchestraGroup.spond_group_id;
        }
    }

    if (!groupId) {
        throw new ApiError(400, 'Geen Spond-groep geconfigureerd voor dit orkest.');
    }

    const password = decryptPassword(spondConfig.password_encrypted);
    const client = new SpondClient(spondConfig.username, password);

    // Get member links and user lookup for matching
    const memberLinks = db.prepare(`
        SELECT spond_member_id, user_id FROM spond_member_links WHERE association_id = ?
    `).all(req.user!.associationId) as any[];
    const memberLinkMap = new Map(memberLinks.map(ml => [ml.spond_member_id, ml.user_id]));

    const users = db.prepare(`
        SELECT id, first_name, last_name FROM users WHERE association_id = ?
    `).all(req.user!.associationId) as any[];
    const usersByName = new Map<string, string>();
    for (const u of users) {
        const fullName = `${u.first_name} ${u.last_name}`.toLowerCase().trim();
        usersByName.set(fullName, u.id);
    }

    // Fetch events around this rehearsal's date
    const date = new Date(rehearsal.date);
    const dayBefore = new Date(date);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const dayAfter = new Date(date);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const events = await client.getEvents(
        groupId,
        dayBefore.toISOString().split('T')[0],
        dayAfter.toISOString().split('T')[0],
    );

    let matchingEvent;

    // 1. If already linked to a specific Spond event, use that
    if (rehearsal.spond_event_id) {
        matchingEvent = events.find(e => e.id === rehearsal.spond_event_id);
    }

    // 2. Otherwise, match by date + closest start time
    if (!matchingEvent) {
        const sameDayEvents = events.filter(e => {
            const eventDate = e.startTimestamp.split('T')[0];
            return eventDate === rehearsal.date;
        });

        if (sameDayEvents.length === 1) {
            matchingEvent = sameDayEvents[0];
        } else if (sameDayEvents.length > 1 && rehearsal.start_time) {
            const rehearsalMinutes = timeToMinutes(rehearsal.start_time);
            matchingEvent = sameDayEvents.reduce((best, e) => {
                const eventTime = e.startTimestamp.split('T')[1]?.substring(0, 5) || '00:00';
                const eventMinutes = timeToMinutes(eventTime);
                const bestTime = best.startTimestamp.split('T')[1]?.substring(0, 5) || '00:00';
                const bestMinutes = timeToMinutes(bestTime);
                return Math.abs(eventMinutes - rehearsalMinutes) < Math.abs(bestMinutes - rehearsalMinutes) ? e : best;
            });
        } else if (sameDayEvents.length > 1) {
            matchingEvent = sameDayEvents[0];
        }
    }

    if (!matchingEvent) {
        throw new ApiError(404, 'Geen bijpassend Spond-event gevonden voor deze datum.');
    }

    // Link event
    if (!rehearsal.spond_event_id) {
        db.prepare('UPDATE rehearsals SET spond_event_id = ? WHERE id = ?')
            .run(matchingEvent.id, rehearsal.id);
    }

    // Clear and re-insert attendance with user matching
    db.prepare('DELETE FROM rehearsal_attendance WHERE rehearsal_id = ?')
        .run(rehearsal.id);

    const insertStmt = db.prepare(`
        INSERT INTO rehearsal_attendance (id, rehearsal_id, user_id, spond_member_id, member_name, status)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const response of matchingEvent.responses) {
        const name = `${response.firstName} ${response.lastName}`.trim() || 'Onbekend';
        const status = response.status === 'unanswered' ? 'unknown' : response.status;

        // Try to match to a user: first by explicit link, then by name
        let userId: string | null = memberLinkMap.get(response.id) || null;
        if (!userId) {
            userId = usersByName.get(name.toLowerCase().trim()) || null;

            // If matched by name, save the link for future syncs
            if (userId) {
                try {
                    db.prepare(`
                        INSERT OR IGNORE INTO spond_member_links (id, association_id, spond_member_id, user_id, spond_member_name)
                        VALUES (?, ?, ?, ?, ?)
                    `).run(uuidv4(), req.user!.associationId, response.id, userId, name);
                    memberLinkMap.set(response.id, userId);
                } catch {
                    // Ignore duplicate insert errors
                }
            }
        }

        insertStmt.run(uuidv4(), rehearsal.id, userId, response.id, name, status);
    }

    logger.info(`Spond sync for rehearsal ${rehearsalId}`, { associationId: req.user!.associationId });

    res.json({
        message: 'Aanwezigheid gesynchroniseerd.',
        attendanceCount: matchingEvent.responses.length,
    });
}));

export default router;
