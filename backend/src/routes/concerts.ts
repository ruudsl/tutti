import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { withTransaction, getPaginationParams, createPaginatedResult } from '../utils/database';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

// Default concert types (used when association has no custom types)
const DEFAULT_CONCERT_TYPES = [
    { value: 'concert', label: 'Concert' },
    { value: 'christmas', label: 'Kerstconcert' },
    { value: 'summer', label: 'Zomerconcert' },
    { value: 'spring', label: 'Voorjaarsconcert' },
    { value: 'new_year', label: 'Nieuwjaarsconcert' },
    { value: 'march', label: 'Mars/Parade' },
    { value: 'competition', label: 'Concours' },
    { value: 'festival', label: 'Festival' },
    { value: 'serenade', label: 'Serenade' },
    { value: 'ceremony', label: 'Ceremonie' },
    { value: 'other', label: 'Overig' },
];

const MEDIA_TYPES = [
    { value: 'photo', label: 'Foto' },
    { value: 'video', label: 'Video' },
    { value: 'audio', label: 'Audio' },
    { value: 'poster', label: 'Poster' },
    { value: 'program', label: 'Programmaboekje' },
];

// Validation schemas
const createConcertSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht'),
    date: z.string().min(1, 'Datum is verplicht'),
    endDate: z.string().optional(),
    location: z.string().optional(),
    venueType: z.string().optional(),
    concertType: z.string().optional(),
    description: z.string().optional(),
    notes: z.string().optional(),
});

const updateConcertSchema = createConcertSchema.partial();

const createProgramItemSchema = z.object({
    musicTitleId: z.string().uuid().optional().nullable(),
    title: z.string().min(1, 'Titel is verplicht'),
    composer: z.string().optional(),
    arranger: z.string().optional(),
    sortOrder: z.number().int().min(0).default(0),
    notes: z.string().optional(),
    partOfSet: z.string().optional(),
});

const updateProgramItemSchema = createProgramItemSchema.partial();

const createMediaSchema = z.object({
    mediaType: z.string().min(1, 'Type is verplicht'),
    url: z.string().url().optional(),
    description: z.string().optional(),
});

const createAttendanceSchema = z.object({
    userId: z.string().uuid().optional().nullable(),
    memberName: z.string().min(1, 'Naam is verplicht'),
    instrumentPlayed: z.string().optional(),
    notes: z.string().optional(),
});

/**
 * @swagger
 * /concerts/types:
 *   get:
 *     summary: Get concert types and media types
 *     tags: [Concerts]
 */
router.get('/types', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    // Get custom concert types for this association
    const customTypes = db.prepare(`
        SELECT id, value, label, sort_order
        FROM concert_types
        WHERE association_id = ?
        ORDER BY sort_order, label
    `).all(req.user!.associationId) as { id: string; value: string; label: string; sort_order: number }[];

    // Use custom types if available, otherwise use defaults
    const concertTypes = customTypes.length > 0
        ? customTypes.map(t => ({ value: t.value, label: t.label }))
        : DEFAULT_CONCERT_TYPES;

    res.json({
        concertTypes,
        mediaTypes: MEDIA_TYPES,
    });
}));

// ==================== CONCERT TYPES CRUD ====================

/**
 * @swagger
 * /concerts/concert-types:
 *   get:
 *     summary: Get all concert types for this association (for admin)
 *     tags: [Concerts]
 */
router.get('/concert-types', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const types = db.prepare(`
        SELECT id, value, label, sort_order
        FROM concert_types
        WHERE association_id = ?
        ORDER BY sort_order, label
    `).all(req.user!.associationId);

    res.json({
        types: types.map((t: any) => ({
            id: t.id,
            value: t.value,
            label: t.label,
            sortOrder: t.sort_order,
        })),
        defaults: DEFAULT_CONCERT_TYPES,
    });
}));

/**
 * @swagger
 * /concerts/concert-types:
 *   post:
 *     summary: Create a new concert type
 *     tags: [Concerts]
 */
router.post('/concert-types', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { value, label, sortOrder } = req.body;

    if (!value || !label) {
        throw new ApiError(400, 'Value en label zijn verplicht.');
    }

    // Check for duplicate value
    const existing = db.prepare(`
        SELECT id FROM concert_types WHERE association_id = ? AND value = ?
    `).get(req.user!.associationId, value);

    if (existing) {
        throw new ApiError(409, 'Een concert type met deze waarde bestaat al.');
    }

    const id = uuidv4();
    const order = sortOrder ?? 0;

    db.prepare(`
        INSERT INTO concert_types (id, association_id, value, label, sort_order)
        VALUES (?, ?, ?, ?, ?)
    `).run(id, req.user!.associationId, value, label, order);

    logger.info(`Concert type created: ${label}`, { id, createdBy: req.user!.id });

    res.status(201).json({
        id,
        value,
        label,
        sortOrder: order,
        message: 'Concert type aangemaakt.',
    });
}));

/**
 * @swagger
 * /concerts/concert-types/{id}:
 *   put:
 *     summary: Update a concert type
 *     tags: [Concerts]
 */
router.put('/concert-types/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { value, label, sortOrder } = req.body;

    const existing = db.prepare(`
        SELECT * FROM concert_types WHERE id = ? AND association_id = ?
    `).get(req.params.id, req.user!.associationId);

    if (!existing) {
        throw new ApiError(404, 'Concert type niet gevonden.');
    }

    // Check for duplicate value (if changing)
    if (value && value !== (existing as any).value) {
        const duplicate = db.prepare(`
            SELECT id FROM concert_types WHERE association_id = ? AND value = ? AND id != ?
        `).get(req.user!.associationId, value, req.params.id);

        if (duplicate) {
            throw new ApiError(409, 'Een concert type met deze waarde bestaat al.');
        }
    }

    db.prepare(`
        UPDATE concert_types SET
            value = COALESCE(?, value),
            label = COALESCE(?, label),
            sort_order = COALESCE(?, sort_order)
        WHERE id = ?
    `).run(value, label, sortOrder, req.params.id);

    logger.info(`Concert type updated: ${req.params.id}`, { updatedBy: req.user!.id });

    res.json({ message: 'Concert type bijgewerkt.' });
}));

/**
 * @swagger
 * /concerts/concert-types/{id}:
 *   delete:
 *     summary: Delete a concert type
 *     tags: [Concerts]
 */
router.delete('/concert-types/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(`
        DELETE FROM concert_types WHERE id = ? AND association_id = ?
    `).run(req.params.id, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Concert type niet gevonden.');
    }

    logger.info(`Concert type deleted: ${req.params.id}`, { deletedBy: req.user!.id });

    res.json({ message: 'Concert type verwijderd.' });
}));

/**
 * @swagger
 * /concerts/concert-types/init-defaults:
 *   post:
 *     summary: Initialize concert types with defaults
 *     tags: [Concerts]
 */
router.post('/concert-types/init-defaults', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    // Check if already has custom types
    const existingCount = db.prepare(`
        SELECT COUNT(*) as count FROM concert_types WHERE association_id = ?
    `).get(req.user!.associationId) as { count: number };

    if (existingCount.count > 0) {
        throw new ApiError(400, 'Er bestaan al concert types. Verwijder deze eerst.');
    }

    // Insert defaults
    withTransaction(() => {
        const stmt = db.prepare(`
            INSERT INTO concert_types (id, association_id, value, label, sort_order)
            VALUES (?, ?, ?, ?, ?)
        `);

        DEFAULT_CONCERT_TYPES.forEach((type, index) => {
            stmt.run(uuidv4(), req.user!.associationId, type.value, type.label, index);
        });
    });

    logger.info('Concert types initialized with defaults', { associationId: req.user!.associationId });

    res.status(201).json({ message: 'Standaard concert types aangemaakt.' });
}));

/**
 * @swagger
 * /concerts/statistics:
 *   get:
 *     summary: Get concert statistics
 *     tags: [Concerts]
 */
router.get('/statistics', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    // Total concerts
    const totalConcerts = db.prepare(`
        SELECT COUNT(*) as count FROM concerts WHERE association_id = ?
    `).get(req.user!.associationId) as { count: number };

    // Concerts per year
    const concertsPerYear = db.prepare(`
        SELECT strftime('%Y', date) as year, COUNT(*) as count
        FROM concerts
        WHERE association_id = ?
        GROUP BY strftime('%Y', date)
        ORDER BY year DESC
        LIMIT 10
    `).all(req.user!.associationId);

    // Most played pieces
    const mostPlayedPieces = db.prepare(`
        SELECT cp.title, COUNT(*) as play_count,
               MAX(c.date) as last_played
        FROM concert_program cp
        JOIN concerts c ON cp.concert_id = c.id
        WHERE c.association_id = ?
        GROUP BY LOWER(cp.title)
        ORDER BY play_count DESC
        LIMIT 20
    `).all(req.user!.associationId);

    // Concerts per type
    const concertsPerType = db.prepare(`
        SELECT concert_type, COUNT(*) as count
        FROM concerts
        WHERE association_id = ? AND concert_type IS NOT NULL
        GROUP BY concert_type
        ORDER BY count DESC
    `).all(req.user!.associationId);

    res.json({
        totalConcerts: totalConcerts.count,
        concertsPerYear: concertsPerYear.map((r: any) => ({
            year: r.year,
            count: r.count,
        })),
        mostPlayedPieces: mostPlayedPieces.map((r: any) => ({
            title: r.title,
            playCount: r.play_count,
            lastPlayed: r.last_played,
        })),
        concertsPerType: concertsPerType.map((r: any) => ({
            type: r.concert_type,
            count: r.count,
        })),
    });
}));

/**
 * @swagger
 * /concerts/piece-history/{title}:
 *   get:
 *     summary: Get when a specific piece was last played
 *     tags: [Concerts]
 */
router.get('/piece-history/:title', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const title = decodeURIComponent(req.params.title);

    const history = db.prepare(`
        SELECT c.id, c.name as concert_name, c.date, c.location, cp.notes
        FROM concert_program cp
        JOIN concerts c ON cp.concert_id = c.id
        WHERE c.association_id = ? AND LOWER(cp.title) = LOWER(?)
        ORDER BY c.date DESC
    `).all(req.user!.associationId, title);

    res.json({
        title,
        playCount: history.length,
        lastPlayed: history.length > 0 ? (history[0] as any).date : null,
        history: history.map((h: any) => ({
            concertId: h.id,
            concertName: h.concert_name,
            date: h.date,
            location: h.location,
            notes: h.notes,
        })),
    });
}));

/**
 * @swagger
 * /concerts/buma-stemra-export:
 *   get:
 *     summary: Export played pieces for Buma/Stemra report
 *     tags: [Concerts]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date of the period (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date of the period (YYYY-MM-DD)
 */
router.get('/buma-stemra-export', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    // Default to last year if no dates provided
    const today = new Date();
    const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());

    const startDate = (req.query.startDate as string) || oneYearAgo.toISOString().split('T')[0];
    const endDate = (req.query.endDate as string) || today.toISOString().split('T')[0];

    // Get all concerts and their program items within the date range
    const pieces = db.prepare(`
        SELECT
            c.name as concert_name,
            c.date as concert_date,
            c.location as concert_location,
            cp.title,
            COALESCE(cp.composer, mt.composer) as composer,
            COALESCE(cp.arranger, mt.arranger) as arranger,
            COALESCE(mt.duration_seconds, 0) as duration_seconds
        FROM concerts c
        JOIN concert_program cp ON c.id = cp.concert_id
        LEFT JOIN music_titles mt ON cp.music_title_id = mt.id
        WHERE c.association_id = ?
          AND c.date >= ?
          AND c.date <= ?
        ORDER BY c.date ASC, cp.sort_order ASC
    `).all(req.user!.associationId, startDate, endDate) as any[];

    // Format duration as MM:SS
    const formatDuration = (seconds: number): string => {
        if (!seconds || seconds <= 0) return '';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Generate CSV content
    let csv = 'Concert,Datum,Locatie,Titel,Componist,Arrangeur,Duur\n';

    for (const piece of pieces) {
        const row = [
            `"${(piece.concert_name || '').replace(/"/g, '""')}"`,
            piece.concert_date || '',
            `"${(piece.concert_location || '').replace(/"/g, '""')}"`,
            `"${(piece.title || '').replace(/"/g, '""')}"`,
            `"${(piece.composer || '').replace(/"/g, '""')}"`,
            `"${(piece.arranger || '').replace(/"/g, '""')}"`,
            formatDuration(piece.duration_seconds),
        ];
        csv += row.join(',') + '\n';
    }

    // Add summary at the end
    const totalPieces = pieces.length;
    const uniqueConcerts = new Set(pieces.map(p => p.concert_date + p.concert_name)).size;
    const totalDuration = pieces.reduce((sum, p) => sum + (p.duration_seconds || 0), 0);

    csv += '\n';
    csv += `Periode,${startDate} t/m ${endDate}\n`;
    csv += `Totaal concerten,${uniqueConcerts}\n`;
    csv += `Totaal stukken,${totalPieces}\n`;
    csv += `Totale speelduur,${formatDuration(totalDuration)}\n`;

    // Set headers for CSV download
    const filename = `buma_stemra_${startDate}_${endDate}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Add BOM for Excel UTF-8 compatibility
    res.send('\ufeff' + csv);
}));

// ==================== CONCERTS ====================

/**
 * @swagger
 * /concerts:
 *   get:
 *     summary: Get all concerts
 *     tags: [Concerts]
 */
router.get('/', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page, limit, offset } = getPaginationParams(req.query);
    const search = req.query.search as string | undefined;
    const year = req.query.year as string | undefined;
    const concertType = req.query.concertType as string | undefined;

    let whereClause = 'WHERE c.association_id = ?';
    const params: any[] = [req.user!.associationId];

    if (search) {
        whereClause += ` AND (LOWER(c.name) LIKE ? OR LOWER(c.location) LIKE ?)`;
        const searchTerm = `%${search.toLowerCase()}%`;
        params.push(searchTerm, searchTerm);
    }

    if (year) {
        whereClause += ` AND strftime('%Y', c.date) = ?`;
        params.push(year);
    }

    if (concertType) {
        whereClause += ' AND c.concert_type = ?';
        params.push(concertType);
    }

    const countResult = db.prepare(`
        SELECT COUNT(*) as total FROM concerts c ${whereClause}
    `).get(...params) as { total: number };

    const concerts = db.prepare(`
        SELECT c.*,
               (SELECT COUNT(*) FROM concert_program WHERE concert_id = c.id) as program_count,
               (SELECT COUNT(*) FROM concert_attendance WHERE concert_id = c.id) as attendance_count,
               (SELECT COUNT(*) FROM concert_media WHERE concert_id = c.id) as media_count,
               u.first_name as created_by_first_name, u.last_name as created_by_last_name
        FROM concerts c
        LEFT JOIN users u ON c.created_by = u.id
        ${whereClause}
        ORDER BY c.date DESC
        LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const result = concerts.map((concert: any) => ({
        id: concert.id,
        name: concert.name,
        date: concert.date,
        endDate: concert.end_date,
        location: concert.location,
        venueType: concert.venue_type,
        concertType: concert.concert_type,
        description: concert.description,
        notes: concert.notes,
        programCount: concert.program_count,
        attendanceCount: concert.attendance_count,
        mediaCount: concert.media_count,
        createdBy: concert.created_by ? {
            id: concert.created_by,
            firstName: concert.created_by_first_name,
            lastName: concert.created_by_last_name,
        } : null,
        createdAt: concert.created_at,
        updatedAt: concert.updated_at,
    }));

    res.json(createPaginatedResult(result, countResult.total, page, limit));
}));

/**
 * @swagger
 * /concerts/years:
 *   get:
 *     summary: Get list of years with concerts
 *     tags: [Concerts]
 */
router.get('/years', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const years = db.prepare(`
        SELECT DISTINCT strftime('%Y', date) as year
        FROM concerts
        WHERE association_id = ?
        ORDER BY year DESC
    `).all(req.user!.associationId);

    res.json(years.map((y: any) => y.year));
}));

/**
 * @swagger
 * /concerts/{id}:
 *   get:
 *     summary: Get single concert with full details
 *     tags: [Concerts]
 */
router.get('/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const concert = db.prepare(`
        SELECT c.*, u.first_name as created_by_first_name, u.last_name as created_by_last_name
        FROM concerts c
        LEFT JOIN users u ON c.created_by = u.id
        WHERE c.id = ? AND c.association_id = ?
    `).get(req.params.id, req.user!.associationId) as any;

    if (!concert) {
        throw new ApiError(404, 'Concert niet gevonden.');
    }

    // Get program
    const program = db.prepare(`
        SELECT cp.*,
               mt.youtube_url,
               mt.duration_seconds,
               COALESCE(cp.composer, mt.composer) as resolved_composer
        FROM concert_program cp
        LEFT JOIN music_titles mt ON cp.music_title_id = mt.id
        WHERE cp.concert_id = ?
        ORDER BY cp.sort_order
    `).all(req.params.id);

    // Get media
    const media = db.prepare(`
        SELECT cm.*, u.first_name, u.last_name
        FROM concert_media cm
        LEFT JOIN users u ON cm.uploaded_by = u.id
        WHERE cm.concert_id = ?
        ORDER BY cm.created_at DESC
    `).all(req.params.id);

    // Get attendance
    const attendance = db.prepare(`
        SELECT ca.*, u.first_name, u.last_name, u.email
        FROM concert_attendance ca
        LEFT JOIN users u ON ca.user_id = u.id
        WHERE ca.concert_id = ?
        ORDER BY ca.member_name
    `).all(req.params.id);

    res.json({
        id: concert.id,
        name: concert.name,
        date: concert.date,
        endDate: concert.end_date,
        location: concert.location,
        venueType: concert.venue_type,
        concertType: concert.concert_type,
        description: concert.description,
        notes: concert.notes,
        createdBy: concert.created_by ? {
            id: concert.created_by,
            firstName: concert.created_by_first_name,
            lastName: concert.created_by_last_name,
        } : null,
        createdAt: concert.created_at,
        updatedAt: concert.updated_at,
        program: program.map((p: any) => ({
            id: p.id,
            musicTitleId: p.music_title_id,
            title: p.title,
            composer: p.resolved_composer || p.composer,
            arranger: p.arranger,
            sortOrder: p.sort_order,
            notes: p.notes,
            partOfSet: p.part_of_set,
            youtubeUrl: p.youtube_url,
            durationSeconds: p.duration_seconds,
        })),
        media: media.map((m: any) => ({
            id: m.id,
            mediaType: m.media_type,
            url: m.url,
            filePath: m.file_path,
            description: m.description,
            uploadedBy: m.uploaded_by ? {
                id: m.uploaded_by,
                firstName: m.first_name,
                lastName: m.last_name,
            } : null,
            createdAt: m.created_at,
        })),
        attendance: attendance.map((a: any) => ({
            id: a.id,
            user: a.user_id ? {
                id: a.user_id,
                firstName: a.first_name,
                lastName: a.last_name,
                email: a.email,
            } : null,
            memberName: a.member_name,
            instrumentPlayed: a.instrument_played,
            notes: a.notes,
        })),
    });
}));

/**
 * @swagger
 * /concerts:
 *   post:
 *     summary: Create new concert
 *     tags: [Concerts]
 */
router.post('/', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createConcertSchema.parse(req.body);

    const id = uuidv4();

    db.prepare(`
        INSERT INTO concerts (
            id, association_id, name, date, end_date, location,
            venue_type, concert_type, description, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, req.user!.associationId, data.name, data.date, data.endDate || null,
        data.location || null, data.venueType || null, data.concertType || null,
        data.description || null, data.notes || null, req.user!.id
    );

    logger.info(`Concert created: ${data.name}`, { id, createdBy: req.user!.id });

    res.status(201).json({
        id,
        message: 'Concert succesvol aangemaakt.',
    });
}));

/**
 * @swagger
 * /concerts/{id}:
 *   put:
 *     summary: Update concert
 *     tags: [Concerts]
 */
router.put('/:id', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateConcertSchema.parse(req.body);

    const existing = db.prepare('SELECT * FROM concerts WHERE id = ? AND association_id = ?')
        .get(req.params.id, req.user!.associationId);

    if (!existing) {
        throw new ApiError(404, 'Concert niet gevonden.');
    }

    db.prepare(`
        UPDATE concerts SET
            name = COALESCE(?, name),
            date = COALESCE(?, date),
            end_date = COALESCE(?, end_date),
            location = COALESCE(?, location),
            venue_type = COALESCE(?, venue_type),
            concert_type = COALESCE(?, concert_type),
            description = COALESCE(?, description),
            notes = COALESCE(?, notes),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        data.name, data.date, data.endDate, data.location,
        data.venueType, data.concertType, data.description, data.notes,
        req.params.id
    );

    logger.info(`Concert updated: ${req.params.id}`, { updatedBy: req.user!.id });

    res.json({ message: 'Concert succesvol bijgewerkt.' });
}));

/**
 * @swagger
 * /concerts/{id}:
 *   delete:
 *     summary: Delete concert
 *     tags: [Concerts]
 */
router.delete('/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare('DELETE FROM concerts WHERE id = ? AND association_id = ?')
        .run(req.params.id, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Concert niet gevonden.');
    }

    logger.info(`Concert deleted: ${req.params.id}`, { deletedBy: req.user!.id });

    res.json({ message: 'Concert succesvol verwijderd.' });
}));

// ==================== CONCERT PROGRAM ====================

/**
 * @swagger
 * /concerts/{id}/program:
 *   post:
 *     summary: Add item to concert program
 *     tags: [Concerts]
 */
router.post('/:id/program', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createProgramItemSchema.parse(req.body);

    const concert = db.prepare('SELECT id FROM concerts WHERE id = ? AND association_id = ?')
        .get(req.params.id, req.user!.associationId);

    if (!concert) {
        throw new ApiError(404, 'Concert niet gevonden.');
    }

    const id = uuidv4();

    // Get max sort order
    const maxOrder = db.prepare(`
        SELECT MAX(sort_order) as max_order FROM concert_program WHERE concert_id = ?
    `).get(req.params.id) as { max_order: number | null };

    const sortOrder = data.sortOrder ?? ((maxOrder.max_order ?? -1) + 1);

    db.prepare(`
        INSERT INTO concert_program (id, concert_id, music_title_id, title, composer, arranger, sort_order, notes, part_of_set)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.params.id, data.musicTitleId || null, data.title, data.composer || null, data.arranger || null, sortOrder, data.notes || null, data.partOfSet || null);

    logger.info(`Program item added to concert: ${req.params.id}`, { programId: id, title: data.title });

    res.status(201).json({ id, message: 'Programma item toegevoegd.' });
}));

/**
 * @swagger
 * /concerts/{id}/program/{programId}:
 *   put:
 *     summary: Update program item
 *     tags: [Concerts]
 */
router.put('/:id/program/:programId', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateProgramItemSchema.parse(req.body);

    const item = db.prepare(`
        SELECT cp.* FROM concert_program cp
        JOIN concerts c ON cp.concert_id = c.id
        WHERE cp.id = ? AND c.association_id = ?
    `).get(req.params.programId, req.user!.associationId);

    if (!item) {
        throw new ApiError(404, 'Programma item niet gevonden.');
    }

    db.prepare(`
        UPDATE concert_program SET
            music_title_id = COALESCE(?, music_title_id),
            title = COALESCE(?, title),
            composer = COALESCE(?, composer),
            arranger = COALESCE(?, arranger),
            sort_order = COALESCE(?, sort_order),
            notes = COALESCE(?, notes),
            part_of_set = COALESCE(?, part_of_set)
        WHERE id = ?
    `).run(data.musicTitleId, data.title, data.composer, data.arranger, data.sortOrder, data.notes, data.partOfSet, req.params.programId);

    res.json({ message: 'Programma item bijgewerkt.' });
}));

/**
 * @swagger
 * /concerts/{id}/program/{programId}:
 *   delete:
 *     summary: Remove program item
 *     tags: [Concerts]
 */
router.delete('/:id/program/:programId', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(`
        DELETE FROM concert_program
        WHERE id = ? AND concert_id IN (
            SELECT id FROM concerts WHERE association_id = ?
        )
    `).run(req.params.programId, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Programma item niet gevonden.');
    }

    res.json({ message: 'Programma item verwijderd.' });
}));

/**
 * @swagger
 * /concerts/{id}/program/reorder:
 *   put:
 *     summary: Reorder program items
 *     tags: [Concerts]
 */
router.put('/:id/program/reorder', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { items } = req.body; // Array of { id, sortOrder }

    if (!Array.isArray(items)) {
        throw new ApiError(400, 'Items array is verplicht.');
    }

    const concert = db.prepare('SELECT id FROM concerts WHERE id = ? AND association_id = ?')
        .get(req.params.id, req.user!.associationId);

    if (!concert) {
        throw new ApiError(404, 'Concert niet gevonden.');
    }

    withTransaction(() => {
        const stmt = db.prepare('UPDATE concert_program SET sort_order = ? WHERE id = ? AND concert_id = ?');
        for (const item of items) {
            stmt.run(item.sortOrder, item.id, req.params.id);
        }
    });

    res.json({ message: 'Volgorde bijgewerkt.' });
}));

/**
 * @swagger
 * /concerts/{id}/program/export:
 *   get:
 *     summary: Export program as text
 *     tags: [Concerts]
 */
router.get('/:id/program/export', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const concert = db.prepare(`
        SELECT * FROM concerts WHERE id = ? AND association_id = ?
    `).get(req.params.id, req.user!.associationId) as any;

    if (!concert) {
        throw new ApiError(404, 'Concert niet gevonden.');
    }

    const program = db.prepare(`
        SELECT * FROM concert_program WHERE concert_id = ? ORDER BY sort_order
    `).all(req.params.id);

    let text = `${concert.name}\n`;
    text += `${concert.date}${concert.location ? ` - ${concert.location}` : ''}\n\n`;
    text += `Programma:\n`;
    text += `-`.repeat(40) + `\n`;

    let currentSet = '';
    program.forEach((item: any, index: number) => {
        if (item.part_of_set && item.part_of_set !== currentSet) {
            currentSet = item.part_of_set;
            text += `\n${currentSet}\n`;
        }

        text += `${index + 1}. ${item.title}`;
        if (item.arranger) {
            text += ` (arr. ${item.arranger})`;
        }
        text += `\n`;
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${concert.name.replace(/[^a-zA-Z0-9]/g, '_')}_programma.txt"`);
    res.send(text);
}));

// ==================== CONCERT MEDIA ====================

/**
 * @swagger
 * /concerts/{id}/media:
 *   post:
 *     summary: Add media to concert
 *     tags: [Concerts]
 */
router.post('/:id/media', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createMediaSchema.parse(req.body);

    const concert = db.prepare('SELECT id FROM concerts WHERE id = ? AND association_id = ?')
        .get(req.params.id, req.user!.associationId);

    if (!concert) {
        throw new ApiError(404, 'Concert niet gevonden.');
    }

    const id = uuidv4();

    db.prepare(`
        INSERT INTO concert_media (id, concert_id, media_type, url, description, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, req.params.id, data.mediaType, data.url || null, data.description || null, req.user!.id);

    logger.info(`Media added to concert: ${req.params.id}`, { mediaId: id, type: data.mediaType });

    res.status(201).json({ id, message: 'Media toegevoegd.' });
}));

/**
 * @swagger
 * /concerts/{id}/media/{mediaId}:
 *   delete:
 *     summary: Remove media from concert
 *     tags: [Concerts]
 */
router.delete('/:id/media/:mediaId', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(`
        DELETE FROM concert_media
        WHERE id = ? AND concert_id IN (
            SELECT id FROM concerts WHERE association_id = ?
        )
    `).run(req.params.mediaId, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Media niet gevonden.');
    }

    res.json({ message: 'Media verwijderd.' });
}));

// ==================== CONCERT ATTENDANCE ====================

/**
 * @swagger
 * /concerts/{id}/attendance:
 *   post:
 *     summary: Add attendance record
 *     tags: [Concerts]
 */
router.post('/:id/attendance', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createAttendanceSchema.parse(req.body);

    const concert = db.prepare('SELECT id FROM concerts WHERE id = ? AND association_id = ?')
        .get(req.params.id, req.user!.associationId);

    if (!concert) {
        throw new ApiError(404, 'Concert niet gevonden.');
    }

    // Check for duplicate user attendance
    if (data.userId) {
        const existing = db.prepare(`
            SELECT id FROM concert_attendance WHERE concert_id = ? AND user_id = ?
        `).get(req.params.id, data.userId);

        if (existing) {
            throw new ApiError(409, 'Dit lid is al geregistreerd voor dit concert.');
        }
    }

    const id = uuidv4();

    db.prepare(`
        INSERT INTO concert_attendance (id, concert_id, user_id, member_name, instrument_played, notes)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, req.params.id, data.userId || null, data.memberName, data.instrumentPlayed || null, data.notes || null);

    logger.info(`Attendance added to concert: ${req.params.id}`, { attendanceId: id, memberName: data.memberName });

    res.status(201).json({ id, message: 'Bezetting toegevoegd.' });
}));

/**
 * @swagger
 * /concerts/{id}/attendance/bulk:
 *   post:
 *     summary: Add multiple attendance records at once
 *     tags: [Concerts]
 */
router.post('/:id/attendance/bulk', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
        throw new ApiError(400, 'userIds array is verplicht.');
    }

    const concert = db.prepare('SELECT id FROM concerts WHERE id = ? AND association_id = ?')
        .get(req.params.id, req.user!.associationId);

    if (!concert) {
        throw new ApiError(404, 'Concert niet gevonden.');
    }

    // Get user details
    const placeholders = userIds.map(() => '?').join(',');
    const users = db.prepare(`
        SELECT u.id, u.first_name, u.last_name,
               GROUP_CONCAT(i.name) as instruments
        FROM users u
        LEFT JOIN user_instruments ui ON u.id = ui.user_id
        LEFT JOIN instruments i ON ui.instrument_id = i.id
        WHERE u.id IN (${placeholders}) AND u.association_id = ?
        GROUP BY u.id
    `).all(...userIds, req.user!.associationId);

    const ids: string[] = [];

    withTransaction(() => {
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO concert_attendance (id, concert_id, user_id, member_name, instrument_played)
            VALUES (?, ?, ?, ?, ?)
        `);

        for (const user of users as any[]) {
            const id = uuidv4();
            const memberName = `${user.first_name} ${user.last_name}`;
            stmt.run(id, req.params.id, user.id, memberName, user.instruments);
            ids.push(id);
        }
    });

    logger.info(`Bulk attendance added to concert: ${req.params.id}`, { count: ids.length });

    res.status(201).json({
        ids,
        count: ids.length,
        message: `${ids.length} leden toegevoegd aan bezetting.`,
    });
}));

/**
 * @swagger
 * /concerts/{id}/attendance/{attendanceId}:
 *   put:
 *     summary: Update attendance record
 *     tags: [Concerts]
 */
router.put('/:id/attendance/:attendanceId', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createAttendanceSchema.partial().parse(req.body);

    const existing = db.prepare(`
        SELECT ca.* FROM concert_attendance ca
        JOIN concerts c ON ca.concert_id = c.id
        WHERE ca.id = ? AND c.association_id = ?
    `).get(req.params.attendanceId, req.user!.associationId);

    if (!existing) {
        throw new ApiError(404, 'Bezetting record niet gevonden.');
    }

    db.prepare(`
        UPDATE concert_attendance SET
            member_name = COALESCE(?, member_name),
            instrument_played = COALESCE(?, instrument_played),
            notes = COALESCE(?, notes)
        WHERE id = ?
    `).run(data.memberName, data.instrumentPlayed, data.notes, req.params.attendanceId);

    res.json({ message: 'Bezetting bijgewerkt.' });
}));

/**
 * @swagger
 * /concerts/{id}/attendance/{attendanceId}:
 *   delete:
 *     summary: Remove attendance record
 *     tags: [Concerts]
 */
router.delete('/:id/attendance/:attendanceId', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(`
        DELETE FROM concert_attendance
        WHERE id = ? AND concert_id IN (
            SELECT id FROM concerts WHERE association_id = ?
        )
    `).run(req.params.attendanceId, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Bezetting record niet gevonden.');
    }

    res.json({ message: 'Bezetting verwijderd.' });
}));

export default router;
