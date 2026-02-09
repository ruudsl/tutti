import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { createMusicListSchema, updateMusicListSchema, reorderMusicListsSchema, addPieceToListSchema, addTitleToListSchema } from '../validation/schemas';
import { withTransaction } from '../utils/database';
import logger from '../utils/logger';

const router = Router();

/**
 * @swagger
 * /music-lists/orchestra/{orchestraId}:
 *   get:
 *     summary: Get all music lists for an orchestra
 *     tags: [Music Lists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orchestraId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of music lists
 *       404:
 *         description: Orchestra not found
 */
router.get('/orchestra/:orchestraId', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    // Verify orchestra belongs to user's association
    const orchestra = db.prepare(
        'SELECT id FROM orchestras WHERE id = ? AND association_id = ?'
    ).get(req.params.orchestraId, req.user!.associationId);

    if (!orchestra) {
        throw new ApiError(404, 'Orkest niet gevonden.');
    }

    const lists = db.prepare(`
        SELECT ml.id, ml.name, ml.position, ml.is_active, ml.created_at,
               ml.list_type, ml.concert_date, ml.concert_location,
               (SELECT COUNT(*) FROM music_list_pieces WHERE music_list_id = ml.id) as piece_count,
               (SELECT COUNT(DISTINCT mp.title) FROM music_pieces mp
                JOIN music_list_pieces mlp ON mp.id = mlp.music_piece_id
                WHERE mlp.music_list_id = ml.id) as title_count,
               (SELECT COALESCE(SUM(mt.duration_seconds), 0) FROM music_titles mt
                WHERE EXISTS (
                    SELECT 1 FROM music_pieces mp
                    JOIN music_list_pieces mlp ON mp.id = mlp.music_piece_id
                    WHERE mlp.music_list_id = ml.id
                    AND mp.title = mt.title
                    AND COALESCE(mp.arranger, '') = COALESCE(mt.arranger, '')
                )) as total_duration
        FROM music_lists ml
        WHERE ml.orchestra_id = ?
        ORDER BY ml.position, ml.name
    `).all(req.params.orchestraId);

    res.json(lists.map((l: any) => ({
        id: l.id,
        name: l.name,
        position: l.position,
        isActive: l.is_active === 1,
        createdAt: l.created_at,
        listType: l.list_type || 'regular',
        concertDate: l.concert_date || null,
        concertLocation: l.concert_location || null,
        pieceCount: l.piece_count,
        titleCount: l.title_count,
        totalDuration: l.total_duration,
    })));
}));

/**
 * @swagger
 * /music-lists/my-lists:
 *   get:
 *     summary: Get all music lists user has access to (through orchestras)
 *     tags: [Music Lists]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's music lists
 */
router.get('/my-lists', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    // For regular members, only show active lists
    const isPrivileged = req.user!.role === 'admin' || req.user!.role === 'music_committee';
    const activeFilter = isPrivileged ? '' : 'AND ml.is_active = 1';

    const lists = db.prepare(`
        SELECT ml.id, ml.name, ml.position, ml.is_active, ml.created_at,
               ml.list_type, ml.concert_date, ml.concert_location,
               o.name as orchestra_name, o.id as orchestra_id,
               (SELECT COUNT(*) FROM music_list_pieces WHERE music_list_id = ml.id) as piece_count,
               (SELECT COUNT(DISTINCT mp.title) FROM music_pieces mp
                JOIN music_list_pieces mlp ON mp.id = mlp.music_piece_id
                WHERE mlp.music_list_id = ml.id) as title_count,
               (SELECT COALESCE(SUM(mt.duration_seconds), 0) FROM music_titles mt
                WHERE EXISTS (
                    SELECT 1 FROM music_pieces mp
                    JOIN music_list_pieces mlp ON mp.id = mlp.music_piece_id
                    WHERE mlp.music_list_id = ml.id
                    AND mp.title = mt.title
                    AND COALESCE(mp.arranger, '') = COALESCE(mt.arranger, '')
                )) as total_duration
        FROM music_lists ml
        JOIN orchestras o ON ml.orchestra_id = o.id
        JOIN user_orchestras uo ON o.id = uo.orchestra_id
        WHERE uo.user_id = ? ${activeFilter}
        ORDER BY o.name, ml.position, ml.name
    `).all(req.user!.id);

    res.json(lists.map((l: any) => ({
        id: l.id,
        name: l.name,
        position: l.position,
        isActive: l.is_active === 1,
        createdAt: l.created_at,
        listType: l.list_type || 'regular',
        concertDate: l.concert_date || null,
        concertLocation: l.concert_location || null,
        orchestraId: l.orchestra_id,
        orchestraName: l.orchestra_name,
        pieceCount: l.piece_count,
        titleCount: l.title_count,
        totalDuration: l.total_duration,
    })));
}));

/**
 * @swagger
 * /music-lists/reorder:
 *   put:
 *     summary: Update list positions
 *     tags: [Music Lists]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orchestraId
 *               - listIds
 *             properties:
 *               orchestraId:
 *                 type: string
 *               listIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Order updated successfully
 */
router.put('/reorder', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = reorderMusicListsSchema.parse(req.body);

    // Verify orchestra belongs to user's association
    const orchestra = db.prepare(
        'SELECT id FROM orchestras WHERE id = ? AND association_id = ?'
    ).get(data.orchestraId, req.user!.associationId);

    if (!orchestra) {
        throw new ApiError(404, 'Orkest niet gevonden.');
    }

    // Update positions in transaction
    withTransaction(() => {
        const update = db.prepare('UPDATE music_lists SET position = ? WHERE id = ? AND orchestra_id = ?');
        for (let i = 0; i < data.listIds.length; i++) {
            update.run(i, data.listIds[i], data.orchestraId);
        }
    });

    logger.info(`Music lists reordered for orchestra ${data.orchestraId}`, { reorderedBy: req.user!.id });

    res.json({ message: 'Volgorde succesvol bijgewerkt.' });
}));

/**
 * @swagger
 * /music-lists/{id}:
 *   get:
 *     summary: Get single music list with pieces
 *     tags: [Music Lists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Music list details with pieces
 *       404:
 *         description: Music list not found
 */
router.get('/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const list = db.prepare(`
        SELECT ml.id, ml.name, ml.created_at, ml.orchestra_id, ml.list_type, ml.concert_date, ml.concert_location, o.name as orchestra_name
        FROM music_lists ml
        JOIN orchestras o ON ml.orchestra_id = o.id
        WHERE ml.id = ? AND o.association_id = ?
    `).get(req.params.id, req.user!.associationId) as any;

    if (!list) {
        throw new ApiError(404, 'Muzieklijst niet gevonden.');
    }

    // Get user's instruments for filtering
    const userInstruments = db.prepare(`
        SELECT instrument_id FROM user_instruments WHERE user_id = ?
    `).all(req.user!.id) as { instrument_id: string }[];

    const instrumentIds = userInstruments.map(i => i.instrument_id);

    // Get pieces in this list, filtered by user's instruments for regular members
    let pieces: any[];
    if (req.user!.role === 'admin' || req.user!.role === 'music_committee') {
        // Admins and music committee see all pieces
        pieces = db.prepare(`
            SELECT mp.id, mp.title, mp.arranger, mp.tuning, mp.group_number, mp.clef,
                   mp.youtube_url, mp.original_filename, mp.created_at,
                   i.id as instrument_id, i.name as instrument_name
            FROM music_pieces mp
            JOIN music_list_pieces mlp ON mp.id = mlp.music_piece_id
            LEFT JOIN instruments i ON mp.instrument_id = i.id
            WHERE mlp.music_list_id = ?
            ORDER BY mp.title, i.name, mp.group_number
        `).all(req.params.id);
    } else {
        // Regular members only see pieces for their instruments
        if (instrumentIds.length === 0) {
            pieces = [];
        } else {
            const placeholders = instrumentIds.map(() => '?').join(',');
            pieces = db.prepare(`
                SELECT mp.id, mp.title, mp.arranger, mp.tuning, mp.group_number, mp.clef,
                       mp.youtube_url, mp.original_filename, mp.created_at,
                       i.id as instrument_id, i.name as instrument_name
                FROM music_pieces mp
                JOIN music_list_pieces mlp ON mp.id = mlp.music_piece_id
                LEFT JOIN instruments i ON mp.instrument_id = i.id
                WHERE mlp.music_list_id = ? AND mp.instrument_id IN (${placeholders})
                ORDER BY mp.title, i.name, mp.group_number
            `).all(req.params.id, ...instrumentIds);
        }
    }

    res.json({
        id: list.id,
        name: list.name,
        createdAt: list.created_at,
        orchestraId: list.orchestra_id,
        orchestraName: list.orchestra_name,
        listType: list.list_type || 'regular',
        concertDate: list.concert_date || null,
        concertLocation: list.concert_location || null,
        pieces: pieces.map((p: any) => ({
            id: p.id,
            title: p.title,
            arranger: p.arranger,
            tuning: p.tuning,
            groupNumber: p.group_number,
            clef: p.clef,
            youtubeUrl: p.youtube_url,
            originalFilename: p.original_filename,
            createdAt: p.created_at,
            instrumentId: p.instrument_id,
            instrumentName: p.instrument_name,
        })),
    });
}));

/**
 * @swagger
 * /music-lists:
 *   post:
 *     summary: Create music list
 *     tags: [Music Lists]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - orchestraId
 *             properties:
 *               name:
 *                 type: string
 *               orchestraId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Music list created successfully
 */
router.post('/', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createMusicListSchema.parse(req.body);

    // Verify orchestra belongs to user's association
    const orchestra = db.prepare(
        'SELECT id FROM orchestras WHERE id = ? AND association_id = ?'
    ).get(data.orchestraId, req.user!.associationId);

    if (!orchestra) {
        throw new ApiError(404, 'Orkest niet gevonden.');
    }

    // Check if list name already exists for this orchestra
    const existing = db.prepare(
        'SELECT id FROM music_lists WHERE LOWER(name) = LOWER(?) AND orchestra_id = ?'
    ).get(data.name.trim(), data.orchestraId);

    if (existing) {
        throw new ApiError(409, 'Muzieklijst met deze naam bestaat al voor dit orkest.');
    }

    // Get next position
    const maxPos = db.prepare(
        'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM music_lists WHERE orchestra_id = ?'
    ).get(data.orchestraId) as { next_pos: number };

    const listId = uuidv4();
    db.prepare('INSERT INTO music_lists (id, name, orchestra_id, position, list_type, concert_date, concert_location) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        listId,
        data.name.trim(),
        data.orchestraId,
        maxPos.next_pos,
        data.listType || 'regular',
        data.concertDate || null,
        data.concertLocation || null
    );

    logger.info(`Music list created: ${data.name}`, { listId, orchestraId: data.orchestraId, createdBy: req.user!.id });

    res.status(201).json({
        id: listId,
        name: data.name.trim(),
        orchestraId: data.orchestraId,
        listType: data.listType || 'regular',
        concertDate: data.concertDate || null,
        concertLocation: data.concertLocation || null,
        message: 'Muzieklijst succesvol aangemaakt.',
    });
}));

/**
 * @swagger
 * /music-lists/{id}:
 *   put:
 *     summary: Update music list
 *     tags: [Music Lists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Music list updated successfully
 */
router.put('/:id', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateMusicListSchema.parse(req.body);

    const list = db.prepare(`
        SELECT ml.id, ml.orchestra_id
        FROM music_lists ml
        JOIN orchestras o ON ml.orchestra_id = o.id
        WHERE ml.id = ? AND o.association_id = ?
    `).get(req.params.id, req.user!.associationId) as any;

    if (!list) {
        throw new ApiError(404, 'Muzieklijst niet gevonden.');
    }

    // Check name uniqueness
    const existing = db.prepare(
        'SELECT id FROM music_lists WHERE LOWER(name) = LOWER(?) AND orchestra_id = ? AND id != ?'
    ).get(data.name.trim(), list.orchestra_id, req.params.id);

    if (existing) {
        throw new ApiError(409, 'Muzieklijst met deze naam bestaat al voor dit orkest.');
    }

    db.prepare('UPDATE music_lists SET name = ?, list_type = ?, concert_date = ?, concert_location = ? WHERE id = ?').run(
        data.name.trim(),
        data.listType || 'regular',
        data.concertDate || null,
        data.concertLocation || null,
        req.params.id
    );

    logger.info(`Music list updated: ${req.params.id}`, { updatedBy: req.user!.id });

    res.json({ message: 'Muzieklijst succesvol bijgewerkt.' });
}));

/**
 * @swagger
 * /music-lists/{id}/toggle-active:
 *   patch:
 *     summary: Toggle list active status
 *     tags: [Music Lists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Status toggled successfully
 */
router.patch('/:id/toggle-active', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const list = db.prepare(`
        SELECT ml.id, ml.is_active
        FROM music_lists ml
        JOIN orchestras o ON ml.orchestra_id = o.id
        WHERE ml.id = ? AND o.association_id = ?
    `).get(req.params.id, req.user!.associationId) as any;

    if (!list) {
        throw new ApiError(404, 'Muzieklijst niet gevonden.');
    }

    const newStatus = list.is_active === 1 ? 0 : 1;
    db.prepare('UPDATE music_lists SET is_active = ? WHERE id = ?').run(newStatus, req.params.id);

    logger.info(`Music list ${req.params.id} toggled to ${newStatus === 1 ? 'active' : 'inactive'}`, { toggledBy: req.user!.id });

    res.json({
        message: newStatus === 1 ? 'Lijst is nu actief.' : 'Lijst is nu inactief.',
        isActive: newStatus === 1,
    });
}));

/**
 * @swagger
 * /music-lists/{id}:
 *   delete:
 *     summary: Delete music list
 *     tags: [Music Lists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Music list deleted successfully
 */
router.delete('/:id', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const list = db.prepare(`
        SELECT ml.id
        FROM music_lists ml
        JOIN orchestras o ON ml.orchestra_id = o.id
        WHERE ml.id = ? AND o.association_id = ?
    `).get(req.params.id, req.user!.associationId);

    if (!list) {
        throw new ApiError(404, 'Muzieklijst niet gevonden.');
    }

    db.prepare('DELETE FROM music_lists WHERE id = ?').run(req.params.id);

    logger.info(`Music list deleted: ${req.params.id}`, { deletedBy: req.user!.id });

    res.json({ message: 'Muzieklijst succesvol verwijderd.' });
}));

/**
 * @swagger
 * /music-lists/{id}/pieces:
 *   post:
 *     summary: Add piece to list
 *     tags: [Music Lists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pieceId
 *             properties:
 *               pieceId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Piece added successfully
 */
router.post('/:id/pieces', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = addPieceToListSchema.parse(req.body);

    // Verify list belongs to user's association
    const list = db.prepare(`
        SELECT ml.id
        FROM music_lists ml
        JOIN orchestras o ON ml.orchestra_id = o.id
        WHERE ml.id = ? AND o.association_id = ?
    `).get(req.params.id, req.user!.associationId);

    if (!list) {
        throw new ApiError(404, 'Muzieklijst niet gevonden.');
    }

    // Verify piece exists and belongs to same association
    const piece = db.prepare(
        'SELECT id FROM music_pieces WHERE id = ? AND association_id = ?'
    ).get(data.pieceId, req.user!.associationId);

    if (!piece) {
        throw new ApiError(404, 'Muziekstuk niet gevonden.');
    }

    // Check if already in list
    const existing = db.prepare(
        'SELECT * FROM music_list_pieces WHERE music_list_id = ? AND music_piece_id = ?'
    ).get(req.params.id, data.pieceId);

    if (existing) {
        throw new ApiError(409, 'Muziekstuk staat al op deze lijst.');
    }

    db.prepare(
        'INSERT INTO music_list_pieces (music_list_id, music_piece_id) VALUES (?, ?)'
    ).run(req.params.id, data.pieceId);

    res.status(201).json({ message: 'Muziekstuk succesvol toegevoegd aan lijst.' });
}));

/**
 * @swagger
 * /music-lists/{id}/pieces/{pieceId}:
 *   delete:
 *     summary: Remove piece from list
 *     tags: [Music Lists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: pieceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Piece removed successfully
 */
router.delete('/:id/pieces/:pieceId', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    // Verify list belongs to user's association
    const list = db.prepare(`
        SELECT ml.id
        FROM music_lists ml
        JOIN orchestras o ON ml.orchestra_id = o.id
        WHERE ml.id = ? AND o.association_id = ?
    `).get(req.params.id, req.user!.associationId);

    if (!list) {
        throw new ApiError(404, 'Muzieklijst niet gevonden.');
    }

    const result = db.prepare(
        'DELETE FROM music_list_pieces WHERE music_list_id = ? AND music_piece_id = ?'
    ).run(req.params.id, req.params.pieceId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Muziekstuk niet gevonden op deze lijst.');
    }

    res.json({ message: 'Muziekstuk succesvol verwijderd van lijst.' });
}));

/**
 * @swagger
 * /music-lists/{id}/titles:
 *   post:
 *     summary: Add all pieces of a title to list
 *     tags: [Music Lists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *     responses:
 *       201:
 *         description: Pieces added successfully
 */
router.post('/:id/titles', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = addTitleToListSchema.parse(req.body);

    // Verify list belongs to user's association
    const list = db.prepare(`
        SELECT ml.id
        FROM music_lists ml
        JOIN orchestras o ON ml.orchestra_id = o.id
        WHERE ml.id = ? AND o.association_id = ?
    `).get(req.params.id, req.user!.associationId);

    if (!list) {
        throw new ApiError(404, 'Muzieklijst niet gevonden.');
    }

    // Get all pieces with this title
    const pieces = db.prepare(
        'SELECT id FROM music_pieces WHERE title = ? AND association_id = ?'
    ).all(data.title.trim(), req.user!.associationId) as { id: string }[];

    if (pieces.length === 0) {
        throw new ApiError(404, 'Geen muziekstukken gevonden met deze titel.');
    }

    // Add all pieces to list in transaction (ignore if already exists)
    let added = 0;
    withTransaction(() => {
        const insert = db.prepare(
            'INSERT OR IGNORE INTO music_list_pieces (music_list_id, music_piece_id) VALUES (?, ?)'
        );

        for (const piece of pieces) {
            const result = insert.run(req.params.id, piece.id);
            if (result.changes > 0) added++;
        }
    });

    res.status(201).json({
        message: `${added} van ${pieces.length} partijen toegevoegd aan de lijst.`,
        added,
        total: pieces.length,
    });
}));

/**
 * @swagger
 * /music-lists/{id}/titles:
 *   delete:
 *     summary: Remove all pieces of a title from list
 *     tags: [Music Lists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *     responses:
 *       200:
 *         description: Pieces removed successfully
 */
router.delete('/:id/titles', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { title } = req.body;

    if (!title) {
        throw new ApiError(400, 'Titel is verplicht.');
    }

    // Verify list belongs to user's association
    const list = db.prepare(`
        SELECT ml.id
        FROM music_lists ml
        JOIN orchestras o ON ml.orchestra_id = o.id
        WHERE ml.id = ? AND o.association_id = ?
    `).get(req.params.id, req.user!.associationId);

    if (!list) {
        throw new ApiError(404, 'Muzieklijst niet gevonden.');
    }

    // Get all pieces with this title
    const pieces = db.prepare(
        'SELECT id FROM music_pieces WHERE title = ? AND association_id = ?'
    ).all(title, req.user!.associationId) as { id: string }[];

    if (pieces.length === 0) {
        throw new ApiError(404, 'Geen muziekstukken gevonden met deze titel.');
    }

    // Remove all pieces from list in transaction
    let removed = 0;
    withTransaction(() => {
        const remove = db.prepare(
            'DELETE FROM music_list_pieces WHERE music_list_id = ? AND music_piece_id = ?'
        );

        for (const piece of pieces) {
            const result = remove.run(req.params.id, piece.id);
            if (result.changes > 0) removed++;
        }
    });

    res.json({
        message: `${removed} partijen verwijderd van de lijst.`,
        removed,
    });
}));

/**
 * @swagger
 * /music-lists/{id}/program-pdf:
 *   get:
 *     summary: Export concert program as PDF
 *     tags: [Music Lists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PDF program booklet
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/:id/program-pdf', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const list = db.prepare(`
        SELECT ml.id, ml.name, ml.list_type, ml.concert_date, ml.concert_location,
               ml.orchestra_id, o.name as orchestra_name, a.name as association_name,
               a.display_name as association_display_name
        FROM music_lists ml
        JOIN orchestras o ON ml.orchestra_id = o.id
        JOIN associations a ON o.association_id = a.id
        WHERE ml.id = ? AND o.association_id = ?
    `).get(req.params.id, req.user!.associationId) as any;

    if (!list) {
        throw new ApiError(404, 'Muzieklijst niet gevonden.');
    }

    // Get distinct titles on this list, ordered by position
    const titles = db.prepare(`
        SELECT DISTINCT mp.title, mp.arranger,
               mt.duration_seconds, mt.description
        FROM music_pieces mp
        JOIN music_list_pieces mlp ON mp.id = mlp.music_piece_id
        LEFT JOIN music_titles mt ON mp.title = mt.title
            AND COALESCE(mp.arranger, '') = COALESCE(mt.arranger, '')
            AND mt.association_id = ?
        WHERE mlp.music_list_id = ?
        ORDER BY mp.title
    `).all(req.user!.associationId, req.params.id) as any[];

    // Build PDF using pdf-lib
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const pageWidth = 595; // A4
    const pageHeight = 842;
    const margin = 60;
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const associationName = list.association_display_name || list.association_name || '';

    // Title page
    // Association name
    if (associationName) {
        const nameWidth = fontBold.widthOfTextAtSize(associationName, 14);
        page.drawText(associationName, {
            x: (pageWidth - nameWidth) / 2,
            y: y - 40,
            size: 14,
            font: fontBold,
            color: rgb(0.3, 0.3, 0.3),
        });
    }

    // Concert name
    const titleSize = 24;
    const titleText = list.name;
    const titleWidth = fontBold.widthOfTextAtSize(titleText, titleSize);
    page.drawText(titleText, {
        x: (pageWidth - titleWidth) / 2,
        y: y - 100,
        size: titleSize,
        font: fontBold,
        color: rgb(0, 0, 0),
    });

    // Orchestra
    const orchText = list.orchestra_name;
    const orchWidth = font.widthOfTextAtSize(orchText, 14);
    page.drawText(orchText, {
        x: (pageWidth - orchWidth) / 2,
        y: y - 135,
        size: 14,
        font,
        color: rgb(0.3, 0.3, 0.3),
    });

    // Date + Location
    let infoY = y - 180;
    if (list.concert_date) {
        const dateStr = new Date(list.concert_date).toLocaleDateString('nl-NL', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        const dateWidth = font.widthOfTextAtSize(dateStr, 12);
        page.drawText(dateStr, {
            x: (pageWidth - dateWidth) / 2,
            y: infoY,
            size: 12,
            font,
            color: rgb(0.4, 0.4, 0.4),
        });
        infoY -= 20;
    }
    if (list.concert_location) {
        const locWidth = font.widthOfTextAtSize(list.concert_location, 12);
        page.drawText(list.concert_location, {
            x: (pageWidth - locWidth) / 2,
            y: infoY,
            size: 12,
            font,
            color: rgb(0.4, 0.4, 0.4),
        });
    }

    // Program page
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;

    const programTitle = 'Programma';
    const ptWidth = fontBold.widthOfTextAtSize(programTitle, 18);
    page.drawText(programTitle, {
        x: (pageWidth - ptWidth) / 2,
        y,
        size: 18,
        font: fontBold,
    });
    y -= 40;

    // Draw a line
    page.drawLine({
        start: { x: margin, y },
        end: { x: pageWidth - margin, y },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
    });
    y -= 25;

    // Helper to format duration
    const formatDur = (secs: number) => {
        if (!secs) return '';
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // List titles
    for (let i = 0; i < titles.length; i++) {
        const t = titles[i];

        // Check if we need a new page
        if (y < margin + 60) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin;
        }

        // Number + Title
        const num = `${i + 1}.`;
        page.drawText(num, { x: margin, y, size: 12, font: fontBold });
        page.drawText(t.title, { x: margin + 25, y, size: 12, font: fontBold });

        // Duration on the right
        if (t.duration_seconds) {
            const durStr = formatDur(t.duration_seconds);
            const durWidth = font.widthOfTextAtSize(durStr, 10);
            page.drawText(durStr, {
                x: pageWidth - margin - durWidth,
                y,
                size: 10,
                font,
                color: rgb(0.5, 0.5, 0.5),
            });
        }
        y -= 18;

        // Arranger
        if (t.arranger) {
            page.drawText(t.arranger, {
                x: margin + 25,
                y,
                size: 10,
                font: fontItalic,
                color: rgb(0.4, 0.4, 0.4),
            });
            y -= 16;
        }

        y -= 10;
    }

    // Total duration at bottom
    const totalSeconds = titles.reduce((sum: number, t: any) => sum + (t.duration_seconds || 0), 0);
    if (totalSeconds > 0) {
        y -= 10;
        if (y < margin + 30) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            y = pageHeight - margin;
        }
        page.drawLine({
            start: { x: margin, y: y + 5 },
            end: { x: pageWidth - margin, y: y + 5 },
            thickness: 0.5,
            color: rgb(0.7, 0.7, 0.7),
        });
        const totalStr = `Totale speelduur: ${formatDur(totalSeconds)}`;
        const totalWidth = font.widthOfTextAtSize(totalStr, 10);
        page.drawText(totalStr, {
            x: pageWidth - margin - totalWidth,
            y: y - 12,
            size: 10,
            font,
            color: rgb(0.4, 0.4, 0.4),
        });
    }

    const pdfBytes = await pdfDoc.save();

    const filename = `${list.name.replace(/[^a-zA-Z0-9\s-]/g, '').trim()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(pdfBytes));
}));

export default router;
