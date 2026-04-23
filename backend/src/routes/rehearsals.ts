import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';

const router = Router();

// Roles that can manage rehearsals
const REHEARSAL_MANAGERS = ['admin', 'music_committee', 'conductor'];

/**
 * Get orchestra IDs that a user belongs to
 */
function getUserOrchestraIds(userId: string): string[] {
    const rows = db.prepare('SELECT orchestra_id FROM user_orchestras WHERE user_id = ?').all(userId) as { orchestra_id: string }[];
    return rows.map(r => r.orchestra_id);
}

// ========================
// DEFAULT DAYS (recurring schedule)
// ========================

/**
 * GET /rehearsals/default-days - Get default rehearsal days
 */
router.get('/default-days', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const days = db.prepare(`
        SELECT dd.id, dd.day_of_week, dd.start_time, dd.end_time, dd.location, dd.orchestra_id,
            o.name as orchestra_name
        FROM rehearsal_default_days dd
        LEFT JOIN orchestras o ON dd.orchestra_id = o.id
        WHERE dd.association_id = ?
        ORDER BY dd.day_of_week, dd.start_time
    `).all(req.user!.associationId);

    res.json(days);
}));

/**
 * POST /rehearsals/default-days - Add a default rehearsal day
 */
router.post('/default-days', authenticateToken, requireRole(...REHEARSAL_MANAGERS), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { dayOfWeek, startTime, endTime, location, orchestraId } = req.body;

    if (dayOfWeek === undefined || dayOfWeek < 0 || dayOfWeek > 6) {
        throw new ApiError(400, 'Ongeldige dag van de week (0-6).');
    }
    if (!startTime || !endTime) {
        throw new ApiError(400, 'Begin- en eindtijd zijn verplicht.');
    }

    // Validate orchestraId if provided
    if (orchestraId) {
        const orch = db.prepare('SELECT id FROM orchestras WHERE id = ? AND association_id = ?').get(orchestraId, req.user!.associationId) as any;
        if (!orch) throw new ApiError(400, 'Orkest niet gevonden.');
    }

    const id = uuidv4();
    db.prepare(`
        INSERT INTO rehearsal_default_days (id, association_id, orchestra_id, day_of_week, start_time, end_time, location)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user!.associationId, orchestraId || null, dayOfWeek, startTime, endTime, location || null);

    logger.info('Default rehearsal day added', { id, dayOfWeek, orchestraId, associationId: req.user!.associationId });

    res.status(201).json({ id, dayOfWeek, startTime, endTime, location, orchestraId: orchestraId || null });
}));

/**
 * PUT /rehearsals/default-days/:id - Update a default rehearsal day
 */
router.put('/default-days/:id', authenticateToken, requireRole(...REHEARSAL_MANAGERS), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { dayOfWeek, startTime, endTime, location, orchestraId } = req.body;

    const existing = db.prepare('SELECT id FROM rehearsal_default_days WHERE id = ? AND association_id = ?').get(id, req.user!.associationId) as any;
    if (!existing) {
        throw new ApiError(404, 'Standaard repetitiedag niet gevonden.');
    }

    db.prepare(`
        UPDATE rehearsal_default_days
        SET day_of_week = ?, start_time = ?, end_time = ?, location = ?, orchestra_id = ?
        WHERE id = ? AND association_id = ?
    `).run(dayOfWeek, startTime, endTime, location || null, orchestraId || null, id, req.user!.associationId);

    res.json({ message: 'Standaard repetitiedag bijgewerkt.' });
}));

/**
 * DELETE /rehearsals/default-days/:id - Delete a default rehearsal day
 */
router.delete('/default-days/:id', authenticateToken, requireRole(...REHEARSAL_MANAGERS), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const result = db.prepare('DELETE FROM rehearsal_default_days WHERE id = ? AND association_id = ?').run(id, req.user!.associationId);
    if (result.changes === 0) {
        throw new ApiError(404, 'Standaard repetitiedag niet gevonden.');
    }

    res.json({ message: 'Standaard repetitiedag verwijderd.' });
}));

/**
 * POST /rehearsals/generate - Generate rehearsals for a date range from default days
 */
router.post('/generate', authenticateToken, requireRole(...REHEARSAL_MANAGERS), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
        throw new ApiError(400, 'Begin- en einddatum zijn verplicht.');
    }

    const defaults = db.prepare(`
        SELECT day_of_week, start_time, end_time, location, orchestra_id
        FROM rehearsal_default_days
        WHERE association_id = ?
    `).all(req.user!.associationId) as any[];

    if (defaults.length === 0) {
        throw new ApiError(400, 'Geen standaard repetitiedagen ingesteld.');
    }

    // Get existing rehearsals in the range to avoid duplicates (check date + orchestra_id combo)
    const existingRehearsals = db.prepare(`
        SELECT date, orchestra_id FROM rehearsals
        WHERE association_id = ? AND date >= ? AND date <= ?
    `).all(req.user!.associationId, startDate, endDate) as any[];

    const existingSet = new Set(existingRehearsals.map(r => `${r.date}|${r.orchestra_id || ''}`));

    const created: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        const dateStr = d.toISOString().split('T')[0];

        const matching = defaults.filter(def => def.day_of_week === dayOfWeek);
        for (const def of matching) {
            const key = `${dateStr}|${def.orchestra_id || ''}`;
            if (existingSet.has(key)) continue;

            const id = uuidv4();
            db.prepare(`
                INSERT INTO rehearsals (id, association_id, orchestra_id, date, start_time, end_time, location, type, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'regular', ?)
            `).run(id, req.user!.associationId, def.orchestra_id || null, dateStr, def.start_time, def.end_time, def.location, req.user!.id);
            created.push(dateStr);
        }
    }

    logger.info(`Generated ${created.length} rehearsals`, { associationId: req.user!.associationId });

    res.json({ message: `${created.length} repetities aangemaakt.`, count: created.length });
}));

// ========================
// REHEARSALS (individual)
// ========================

// ========================
// ATTENDANCE SUMMARY (must be before /:id route)
// ========================

/**
 * GET /rehearsals/attendance/summary - Get attendance summary per person
 * Query params: from (YYYY-MM-DD), to (YYYY-MM-DD), orchestraId (optional)
 */
router.get('/attendance/summary', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const from = (req.query.from as string) || '';
    const to = (req.query.to as string) || '';
    const orchestraId = req.query.orchestraId as string | undefined;

    if (!from || !to) {
        throw new ApiError(400, 'Parameters "from" en "to" zijn verplicht (YYYY-MM-DD).');
    }

    // Get rehearsals in the date range for this association
    let rehearsalQuery = `
        SELECT r.id, r.date, r.orchestra_id, o.name as orchestra_name
        FROM rehearsals r
        LEFT JOIN orchestras o ON r.orchestra_id = o.id
        WHERE r.association_id = ? AND r.date >= ? AND r.date <= ? AND r.type != 'cancelled'
    `;
    const params: any[] = [req.user!.associationId, from, to];

    if (orchestraId) {
        rehearsalQuery += ' AND r.orchestra_id = ?';
        params.push(orchestraId);
    }

    rehearsalQuery += ' ORDER BY r.date';

    const rehearsals = db.prepare(rehearsalQuery).all(...params) as any[];
    const rehearsalIds = rehearsals.map(r => r.id);

    if (rehearsalIds.length === 0) {
        return res.json({ members: [], rehearsalCount: 0, rehearsals: [] });
    }

    // Get all attendance records for these rehearsals
    const placeholders = rehearsalIds.map(() => '?').join(',');
    const attendanceRows = db.prepare(`
        SELECT ra.rehearsal_id, ra.member_name, ra.spond_member_id, ra.user_id, ra.status
        FROM rehearsal_attendance ra
        WHERE ra.rehearsal_id IN (${placeholders})
    `).all(...rehearsalIds) as any[];

    // Aggregate per person (use spond_member_id or member_name as key)
    const memberMap = new Map<string, {
        name: string;
        spondMemberId: string | null;
        userId: string | null;
        accepted: number;
        declined: number;
        unknown: number;
        total: number;
    }>();

    for (const row of attendanceRows) {
        const key = row.spond_member_id || row.member_name;
        if (!memberMap.has(key)) {
            memberMap.set(key, {
                name: row.member_name,
                spondMemberId: row.spond_member_id,
                userId: row.user_id,
                accepted: 0,
                declined: 0,
                unknown: 0,
                total: 0,
            });
        }
        const member = memberMap.get(key)!;
        member.total++;
        if (row.status === 'accepted') member.accepted++;
        else if (row.status === 'declined') member.declined++;
        else member.unknown++;
    }

    // Sort by name
    const members = Array.from(memberMap.values())
        .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
        members,
        rehearsalCount: rehearsalIds.length,
        from,
        to,
    });
}));

/**
 * GET /rehearsals/upcoming - Get the next N upcoming rehearsals for the authenticated user
 * Filters by today's date and forward, limited to `limit` results (default 3)
 */
router.get('/upcoming', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const limit = parseInt((req.query.limit as string) || '3', 10);
    const isManager = REHEARSAL_MANAGERS.includes(req.user!.role);

    let sql = `
        SELECT r.*, u.first_name || ' ' || u.last_name as created_by_name,
            o.name as orchestra_name,
            (SELECT COUNT(*) FROM rehearsal_pieces rp WHERE rp.rehearsal_id = r.id) as piece_count,
            (SELECT COUNT(*) FROM rehearsal_attendance ra WHERE ra.rehearsal_id = r.id AND ra.status = 'accepted') as accepted_count,
            (SELECT COUNT(*) FROM rehearsal_attendance ra WHERE ra.rehearsal_id = r.id AND ra.status = 'declined') as declined_count
        FROM rehearsals r
        LEFT JOIN users u ON r.created_by = u.id
        LEFT JOIN orchestras o ON r.orchestra_id = o.id
        WHERE r.association_id = ?
        AND r.date >= date('now')
    `;
    const params: any[] = [req.user!.associationId];

    // Filter by user's orchestras for non-managers
    if (!isManager) {
        const orchestraIds = getUserOrchestraIds(req.user!.id);
        if (orchestraIds.length > 0) {
            const placeholders = orchestraIds.map(() => '?').join(', ');
            sql += ` AND (r.orchestra_id IS NULL OR r.orchestra_id IN (${placeholders}))`;
            params.push(...orchestraIds);
        } else {
            sql += ' AND r.orchestra_id IS NULL';
        }
    }

    sql += ' ORDER BY r.date, r.start_time';
    sql += ' LIMIT ?';
    params.push(limit);

    const rehearsals = db.prepare(sql).all(...params);

    res.json(rehearsals);
}));

/**
 * GET /rehearsals - Get rehearsals (optionally filtered by date range)
 * Regular members only see rehearsals for their orchestras (or orchestra_id=NULL which are for everyone)
 * Managers see all rehearsals
 */
router.get('/', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { startDate, endDate } = req.query;
    const isManager = REHEARSAL_MANAGERS.includes(req.user!.role);

    let sql = `
        SELECT r.*, u.first_name || ' ' || u.last_name as created_by_name,
            o.name as orchestra_name,
            (SELECT COUNT(*) FROM rehearsal_pieces rp WHERE rp.rehearsal_id = r.id) as piece_count,
            (SELECT COUNT(*) FROM rehearsal_attendance ra WHERE ra.rehearsal_id = r.id AND ra.status = 'accepted') as accepted_count,
            (SELECT COUNT(*) FROM rehearsal_attendance ra WHERE ra.rehearsal_id = r.id AND ra.status = 'declined') as declined_count
        FROM rehearsals r
        LEFT JOIN users u ON r.created_by = u.id
        LEFT JOIN orchestras o ON r.orchestra_id = o.id
        WHERE r.association_id = ?
    `;
    const params: any[] = [req.user!.associationId];

    // Filter by user's orchestras for non-managers
    if (!isManager) {
        const orchestraIds = getUserOrchestraIds(req.user!.id);
        if (orchestraIds.length > 0) {
            const placeholders = orchestraIds.map(() => '?').join(', ');
            sql += ` AND (r.orchestra_id IS NULL OR r.orchestra_id IN (${placeholders}))`;
            params.push(...orchestraIds);
        } else {
            // User not in any orchestra - only see rehearsals without orchestra
            sql += ' AND r.orchestra_id IS NULL';
        }
    }

    if (startDate) {
        sql += ' AND r.date >= ?';
        params.push(startDate);
    }
    if (endDate) {
        sql += ' AND r.date <= ?';
        params.push(endDate);
    }

    sql += ' ORDER BY r.date, r.start_time';

    const rehearsals = db.prepare(sql).all(...params);

    res.json(rehearsals);
}));

/**
 * GET /rehearsals/:id - Get a single rehearsal with pieces and attendance
 */
router.get('/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const rehearsal = db.prepare(`
        SELECT r.*, u.first_name || ' ' || u.last_name as created_by_name,
            o.name as orchestra_name
        FROM rehearsals r
        LEFT JOIN users u ON r.created_by = u.id
        LEFT JOIN orchestras o ON r.orchestra_id = o.id
        WHERE r.id = ? AND r.association_id = ?
    `).get(id, req.user!.associationId) as any;

    if (!rehearsal) {
        throw new ApiError(404, 'Repetitie niet gevonden.');
    }

    const pieces = db.prepare(`
        SELECT id, title, notes, sort_order
        FROM rehearsal_pieces
        WHERE rehearsal_id = ?
        ORDER BY sort_order
    `).all(id);

    const attendance = db.prepare(`
        SELECT id, user_id, spond_member_id, member_name, status
        FROM rehearsal_attendance
        WHERE rehearsal_id = ?
        ORDER BY member_name
    `).all(id);

    res.json({ ...rehearsal, pieces, attendance });
}));

/**
 * POST /rehearsals - Create a rehearsal
 */
router.post('/', authenticateToken, requireRole(...REHEARSAL_MANAGERS), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { date, startTime, endTime, location, type, notes, orchestraId } = req.body;

    if (!date || !startTime || !endTime) {
        throw new ApiError(400, 'Datum, begin- en eindtijd zijn verplicht.');
    }

    const validTypes = ['regular', 'extra', 'cancelled'];
    if (type && !validTypes.includes(type)) {
        throw new ApiError(400, 'Ongeldig type. Gebruik regular, extra of cancelled.');
    }

    if (orchestraId) {
        const orch = db.prepare('SELECT id FROM orchestras WHERE id = ? AND association_id = ?').get(orchestraId, req.user!.associationId) as any;
        if (!orch) throw new ApiError(400, 'Orkest niet gevonden.');
    }

    const id = uuidv4();
    db.prepare(`
        INSERT INTO rehearsals (id, association_id, orchestra_id, date, start_time, end_time, location, type, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user!.associationId, orchestraId || null, date, startTime, endTime, location || null, type || 'regular', notes || null, req.user!.id);

    logger.info('Rehearsal created', { id, date, type, orchestraId, associationId: req.user!.associationId });

    res.status(201).json({ id, date, startTime, endTime, location, type: type || 'regular', notes, orchestraId: orchestraId || null });
}));

/**
 * PUT /rehearsals/:id - Update a rehearsal
 */
router.put('/:id', authenticateToken, requireRole(...REHEARSAL_MANAGERS), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { date, startTime, endTime, location, type, notes, orchestraId } = req.body;

    const existing = db.prepare('SELECT id FROM rehearsals WHERE id = ? AND association_id = ?').get(id, req.user!.associationId) as any;
    if (!existing) {
        throw new ApiError(404, 'Repetitie niet gevonden.');
    }

    db.prepare(`
        UPDATE rehearsals
        SET date = ?, start_time = ?, end_time = ?, location = ?, type = ?, notes = ?, orchestra_id = ?
        WHERE id = ? AND association_id = ?
    `).run(date, startTime, endTime, location || null, type || 'regular', notes || null, orchestraId || null, id, req.user!.associationId);

    res.json({ message: 'Repetitie bijgewerkt.' });
}));

/**
 * DELETE /rehearsals/:id - Delete a rehearsal
 */
router.delete('/:id', authenticateToken, requireRole(...REHEARSAL_MANAGERS), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    // First verify the rehearsal exists and belongs to this association
    const rehearsal = db.prepare('SELECT id FROM rehearsals WHERE id = ? AND association_id = ?').get(id, req.user!.associationId) as any;
    if (!rehearsal) {
        throw new ApiError(404, 'Repetitie niet gevonden.');
    }

    // Explicitly clean up related records before deleting
    db.prepare('DELETE FROM rehearsal_attendance WHERE rehearsal_id = ?').run(id);
    db.prepare('DELETE FROM rehearsal_pieces WHERE rehearsal_id = ?').run(id);
    db.prepare('DELETE FROM rehearsals WHERE id = ?').run(id);

    res.json({ message: 'Repetitie verwijderd.' });
}));

// ========================
// REHEARSAL PIECES
// ========================

/**
 * PUT /rehearsals/:id/pieces - Set pieces for a rehearsal (replaces all)
 */
router.put('/:id/pieces', authenticateToken, requireRole(...REHEARSAL_MANAGERS), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { pieces } = req.body;

    const existing = db.prepare('SELECT id FROM rehearsals WHERE id = ? AND association_id = ?').get(id, req.user!.associationId) as any;
    if (!existing) {
        throw new ApiError(404, 'Repetitie niet gevonden.');
    }

    if (!Array.isArray(pieces)) {
        throw new ApiError(400, 'Stukken moeten een array zijn.');
    }

    // Delete existing pieces
    db.prepare('DELETE FROM rehearsal_pieces WHERE rehearsal_id = ?').run(id);

    // Insert new pieces
    const insertStmt = db.prepare(`
        INSERT INTO rehearsal_pieces (id, rehearsal_id, title, notes, sort_order)
        VALUES (?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < pieces.length; i++) {
        const piece = pieces[i];
        if (!piece.title) continue;
        insertStmt.run(uuidv4(), id, piece.title, piece.notes || null, i);
    }

    logger.info('Rehearsal pieces updated', { rehearsalId: id, pieceCount: pieces.length });

    res.json({ message: 'Repertoire bijgewerkt.' });
}));

export default router;
