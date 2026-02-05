import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';

const router = Router();

// Roles that can manage rehearsals
const REHEARSAL_MANAGERS = ['admin', 'music_committee', 'conductor'];

// ========================
// DEFAULT DAYS (recurring schedule)
// ========================

/**
 * GET /rehearsals/default-days - Get default rehearsal days
 */
router.get('/default-days', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const days = db.prepare(`
        SELECT id, day_of_week, start_time, end_time, location
        FROM rehearsal_default_days
        WHERE association_id = ?
        ORDER BY day_of_week, start_time
    `).all(req.user!.associationId);

    res.json(days);
}));

/**
 * POST /rehearsals/default-days - Add a default rehearsal day
 */
router.post('/default-days', authenticateToken, requireRole(...REHEARSAL_MANAGERS), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { dayOfWeek, startTime, endTime, location } = req.body;

    if (dayOfWeek === undefined || dayOfWeek < 0 || dayOfWeek > 6) {
        throw new ApiError(400, 'Ongeldige dag van de week (0-6).');
    }
    if (!startTime || !endTime) {
        throw new ApiError(400, 'Begin- en eindtijd zijn verplicht.');
    }

    const id = uuidv4();
    db.prepare(`
        INSERT INTO rehearsal_default_days (id, association_id, day_of_week, start_time, end_time, location)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, req.user!.associationId, dayOfWeek, startTime, endTime, location || null);

    logger.info('Default rehearsal day added', { id, dayOfWeek, associationId: req.user!.associationId });

    res.status(201).json({ id, dayOfWeek, startTime, endTime, location });
}));

/**
 * PUT /rehearsals/default-days/:id - Update a default rehearsal day
 */
router.put('/default-days/:id', authenticateToken, requireRole(...REHEARSAL_MANAGERS), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { dayOfWeek, startTime, endTime, location } = req.body;

    const existing = db.prepare('SELECT id FROM rehearsal_default_days WHERE id = ? AND association_id = ?').get(id, req.user!.associationId) as any;
    if (!existing) {
        throw new ApiError(404, 'Standaard repetitiedag niet gevonden.');
    }

    db.prepare(`
        UPDATE rehearsal_default_days
        SET day_of_week = ?, start_time = ?, end_time = ?, location = ?
        WHERE id = ? AND association_id = ?
    `).run(dayOfWeek, startTime, endTime, location || null, id, req.user!.associationId);

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
        SELECT day_of_week, start_time, end_time, location
        FROM rehearsal_default_days
        WHERE association_id = ?
    `).all(req.user!.associationId) as any[];

    if (defaults.length === 0) {
        throw new ApiError(400, 'Geen standaard repetitiedagen ingesteld.');
    }

    // Get existing rehearsals in the range to avoid duplicates
    const existingDates = new Set(
        (db.prepare(`
            SELECT date FROM rehearsals
            WHERE association_id = ? AND date >= ? AND date <= ?
        `).all(req.user!.associationId, startDate, endDate) as any[]).map(r => r.date)
    );

    const created: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        const dateStr = d.toISOString().split('T')[0];

        if (existingDates.has(dateStr)) continue;

        const matching = defaults.filter(def => def.day_of_week === dayOfWeek);
        for (const def of matching) {
            const id = uuidv4();
            db.prepare(`
                INSERT INTO rehearsals (id, association_id, date, start_time, end_time, location, type, created_by)
                VALUES (?, ?, ?, ?, ?, ?, 'regular', ?)
            `).run(id, req.user!.associationId, dateStr, def.start_time, def.end_time, def.location, req.user!.id);
            created.push(dateStr);
        }
    }

    logger.info(`Generated ${created.length} rehearsals`, { associationId: req.user!.associationId });

    res.json({ message: `${created.length} repetities aangemaakt.`, count: created.length });
}));

// ========================
// REHEARSALS (individual)
// ========================

/**
 * GET /rehearsals - Get rehearsals (optionally filtered by date range)
 */
router.get('/', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { startDate, endDate } = req.query;

    let sql = `
        SELECT r.*, u.first_name || ' ' || u.last_name as created_by_name,
            (SELECT COUNT(*) FROM rehearsal_pieces rp WHERE rp.rehearsal_id = r.id) as piece_count,
            (SELECT COUNT(*) FROM rehearsal_attendance ra WHERE ra.rehearsal_id = r.id AND ra.status = 'accepted') as accepted_count,
            (SELECT COUNT(*) FROM rehearsal_attendance ra WHERE ra.rehearsal_id = r.id AND ra.status = 'declined') as declined_count
        FROM rehearsals r
        LEFT JOIN users u ON r.created_by = u.id
        WHERE r.association_id = ?
    `;
    const params: any[] = [req.user!.associationId];

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
        SELECT r.*, u.first_name || ' ' || u.last_name as created_by_name
        FROM rehearsals r
        LEFT JOIN users u ON r.created_by = u.id
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
    const { date, startTime, endTime, location, type, notes } = req.body;

    if (!date || !startTime || !endTime) {
        throw new ApiError(400, 'Datum, begin- en eindtijd zijn verplicht.');
    }

    const validTypes = ['regular', 'extra', 'cancelled'];
    if (type && !validTypes.includes(type)) {
        throw new ApiError(400, 'Ongeldig type. Gebruik regular, extra of cancelled.');
    }

    const id = uuidv4();
    db.prepare(`
        INSERT INTO rehearsals (id, association_id, date, start_time, end_time, location, type, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user!.associationId, date, startTime, endTime, location || null, type || 'regular', notes || null, req.user!.id);

    logger.info('Rehearsal created', { id, date, type, associationId: req.user!.associationId });

    res.status(201).json({ id, date, startTime, endTime, location, type: type || 'regular', notes });
}));

/**
 * PUT /rehearsals/:id - Update a rehearsal
 */
router.put('/:id', authenticateToken, requireRole(...REHEARSAL_MANAGERS), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { date, startTime, endTime, location, type, notes } = req.body;

    const existing = db.prepare('SELECT id FROM rehearsals WHERE id = ? AND association_id = ?').get(id, req.user!.associationId) as any;
    if (!existing) {
        throw new ApiError(404, 'Repetitie niet gevonden.');
    }

    db.prepare(`
        UPDATE rehearsals
        SET date = ?, start_time = ?, end_time = ?, location = ?, type = ?, notes = ?
        WHERE id = ? AND association_id = ?
    `).run(date, startTime, endTime, location || null, type || 'regular', notes || null, id, req.user!.associationId);

    res.json({ message: 'Repetitie bijgewerkt.' });
}));

/**
 * DELETE /rehearsals/:id - Delete a rehearsal
 */
router.delete('/:id', authenticateToken, requireRole(...REHEARSAL_MANAGERS), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const result = db.prepare('DELETE FROM rehearsals WHERE id = ? AND association_id = ?').run(id, req.user!.associationId);
    if (result.changes === 0) {
        throw new ApiError(404, 'Repetitie niet gevonden.');
    }

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
