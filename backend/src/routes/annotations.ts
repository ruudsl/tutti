import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { createAnnotationSchema, updateAnnotationSchema } from '../validation/schemas';
import logger from '../utils/logger';

const router = Router();

const sanitizeForLog = (value: unknown): string =>
    String(value).replace(/[\r\n\t]/g, ' ').replace(/[\x00-\x1F\x7F]/g, '');

/**
 * @swagger
 * /annotations/piece/{musicPieceId}:
 *   get:
 *     summary: Get all annotations for a music piece
 *     tags: [Annotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: musicPieceId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: number
 *         description: Filter by page number
 *     responses:
 *       200:
 *         description: List of annotations
 */
router.get('/piece/:musicPieceId', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { pageNumber } = req.query;

    let query = `
        SELECT id, page_number, annotation_type, x_position, y_position,
               width, height, content, color, created_at, updated_at
        FROM pdf_annotations
        WHERE user_id = ? AND music_piece_id = ?
    `;
    const params: any[] = [req.user!.id, req.params.musicPieceId];

    if (pageNumber) {
        query += ' AND page_number = ?';
        params.push(parseInt(pageNumber as string));
    }

    query += ' ORDER BY page_number, created_at';

    const annotations = db.prepare(query).all(...params);

    res.json(annotations.map((a: any) => ({
        id: a.id,
        pageNumber: a.page_number,
        annotationType: a.annotation_type,
        xPosition: a.x_position,
        yPosition: a.y_position,
        width: a.width,
        height: a.height,
        content: a.content,
        color: a.color,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
    })));
}));

/**
 * @swagger
 * /annotations:
 *   post:
 *     summary: Create a new annotation
 *     tags: [Annotations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - musicPieceId
 *               - pageNumber
 *               - annotationType
 *               - xPosition
 *               - yPosition
 *             properties:
 *               musicPieceId:
 *                 type: string
 *               pageNumber:
 *                 type: number
 *               annotationType:
 *                 type: string
 *                 enum: [highlight, note, drawing, text]
 *               xPosition:
 *                 type: number
 *               yPosition:
 *                 type: number
 *               width:
 *                 type: number
 *               height:
 *                 type: number
 *               content:
 *                 type: string
 *               color:
 *                 type: string
 *     responses:
 *       201:
 *         description: Annotation created
 */
router.post('/', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createAnnotationSchema.parse(req.body);

    // Verify piece exists
    const piece = db.prepare('SELECT id FROM music_pieces WHERE id = ?').get(data.musicPieceId);
    if (!piece) {
        throw new ApiError(404, 'Muziekstuk niet gevonden.');
    }

    const id = uuidv4();
    db.prepare(`
        INSERT INTO pdf_annotations
        (id, user_id, music_piece_id, page_number, annotation_type, x_position, y_position, width, height, content, color)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        req.user!.id,
        data.musicPieceId,
        data.pageNumber,
        data.annotationType,
        data.xPosition,
        data.yPosition,
        data.width || null,
        data.height || null,
        data.content || null,
        data.color || '#FFFF00'
    );

    logger.info(`User ${req.user!.id} created annotation on piece ${data.musicPieceId}`);

    res.status(201).json({
        id,
        message: 'Annotatie aangemaakt.',
    });
}));

/**
 * @swagger
 * /annotations/{id}:
 *   put:
 *     summary: Update an annotation
 *     tags: [Annotations]
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
 *             properties:
 *               xPosition:
 *                 type: number
 *               yPosition:
 *                 type: number
 *               width:
 *                 type: number
 *               height:
 *                 type: number
 *               content:
 *                 type: string
 *               color:
 *                 type: string
 *     responses:
 *       200:
 *         description: Annotation updated
 */
router.put('/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateAnnotationSchema.parse(req.body);

    // Verify annotation exists and belongs to user
    const annotation = db.prepare(
        'SELECT id FROM pdf_annotations WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user!.id);

    if (!annotation) {
        throw new ApiError(404, 'Annotatie niet gevonden.');
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.xPosition !== undefined) {
        updates.push('x_position = ?');
        params.push(data.xPosition);
    }
    if (data.yPosition !== undefined) {
        updates.push('y_position = ?');
        params.push(data.yPosition);
    }
    if (data.width !== undefined) {
        updates.push('width = ?');
        params.push(data.width);
    }
    if (data.height !== undefined) {
        updates.push('height = ?');
        params.push(data.height);
    }
    if (data.content !== undefined) {
        updates.push('content = ?');
        params.push(data.content);
    }
    if (data.color !== undefined) {
        updates.push('color = ?');
        params.push(data.color);
    }

    if (updates.length === 0) {
        res.json({ message: 'Geen wijzigingen.' });
        return;
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    db.prepare(`UPDATE pdf_annotations SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    res.json({ message: 'Annotatie bijgewerkt.' });
}));

/**
 * @swagger
 * /annotations/{id}:
 *   delete:
 *     summary: Delete an annotation
 *     tags: [Annotations]
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
 *         description: Annotation deleted
 */
router.delete('/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(
        'DELETE FROM pdf_annotations WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.user!.id);

    if (result.changes === 0) {
        throw new ApiError(404, 'Annotatie niet gevonden.');
    }

    res.json({ message: 'Annotatie verwijderd.' });
}));

/**
 * @swagger
 * /annotations/piece/{musicPieceId}:
 *   delete:
 *     summary: Delete all annotations for a piece
 *     tags: [Annotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: musicPieceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: All annotations deleted
 */
router.delete('/piece/:musicPieceId', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(
        'DELETE FROM pdf_annotations WHERE music_piece_id = ? AND user_id = ?'
    ).run(req.params.musicPieceId, req.user!.id);

    res.json({
        message: 'Alle annotaties verwijderd.',
        deleted: result.changes,
    });
}));

// ==================== ENHANCED ANNOTATIONS (with drawing data) ====================

/**
 * @swagger
 * /annotations/{musicPieceId}/{pageNumber}:
 *   get:
 *     summary: Get annotations for a specific page (enhanced format with drawing data)
 *     tags: [Annotations]
 */
router.get('/:musicPieceId/:pageNumber', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { musicPieceId, pageNumber } = req.params;
    const { includeShared } = req.query;

    let query = `
        SELECT id, music_piece_id, page_number, annotation_type, data,
               color, stroke_width, opacity, is_shared, created_at, updated_at
        FROM pdf_annotations
        WHERE music_piece_id = ? AND page_number = ?
          AND (user_id = ?${includeShared === 'true' ? ' OR is_shared = 1' : ''})
        ORDER BY created_at
    `;

    const annotations = db.prepare(query).all(musicPieceId, parseInt(pageNumber), req.user!.id);

    res.json(annotations.map((a: any) => ({
        id: a.id,
        musicPieceId: a.music_piece_id,
        pageNumber: a.page_number,
        annotationType: a.annotation_type,
        data: a.data,
        color: a.color,
        strokeWidth: a.stroke_width,
        opacity: a.opacity,
        isShared: !!a.is_shared,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
    })));
}));

/**
 * @swagger
 * /annotations/drawing:
 *   post:
 *     summary: Create a drawing annotation (freehand, highlight, stamp, shape, text)
 *     tags: [Annotations]
 */
router.post('/drawing', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { musicPieceId, pageNumber, annotationType, data, color, strokeWidth, opacity, isShared } = req.body;

    if (!musicPieceId || pageNumber === undefined || !annotationType || !data) {
        throw new ApiError(400, 'musicPieceId, pageNumber, annotationType en data zijn verplicht.');
    }

    const validTypes = ['freehand', 'highlight', 'text', 'stamp', 'shape'];
    if (!validTypes.includes(annotationType)) {
        throw new ApiError(400, `Ongeldig annotationType. Gebruik: ${validTypes.join(', ')}`);
    }

    // Verify piece exists
    const piece = db.prepare('SELECT id FROM music_pieces WHERE id = ?').get(musicPieceId);
    if (!piece) {
        throw new ApiError(404, 'Muziekstuk niet gevonden.');
    }

    const id = uuidv4();
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);

    db.prepare(`
        INSERT INTO pdf_annotations
        (id, music_piece_id, user_id, page_number, annotation_type, data, color, stroke_width, opacity, is_shared)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        musicPieceId,
        req.user!.id,
        pageNumber,
        annotationType,
        dataStr,
        color || '#FF0000',
        strokeWidth || 2,
        opacity || 1,
        isShared ? 1 : 0
    );

    logger.info(
        `User ${sanitizeForLog(req.user!.id)} created ${sanitizeForLog(annotationType)} annotation on piece ${sanitizeForLog(musicPieceId)} page ${sanitizeForLog(pageNumber)}`
    );

    res.status(201).json({
        id,
        musicPieceId,
        pageNumber,
        annotationType,
        data: dataStr,
        color: color || '#FF0000',
        strokeWidth: strokeWidth || 2,
        opacity: opacity || 1,
        isShared: !!isShared,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    });
}));

/**
 * @swagger
 * /annotations/drawing/{id}:
 *   put:
 *     summary: Update a drawing annotation
 *     tags: [Annotations]
 */
router.put('/drawing/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { data, color, strokeWidth, opacity, isShared } = req.body;

    // Verify annotation exists and belongs to user
    const annotation = db.prepare(
        'SELECT id FROM pdf_annotations WHERE id = ? AND user_id = ?'
    ).get(id, req.user!.id);

    if (!annotation) {
        throw new ApiError(404, 'Annotatie niet gevonden.');
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data !== undefined) {
        updates.push('data = ?');
        params.push(typeof data === 'string' ? data : JSON.stringify(data));
    }
    if (color !== undefined) {
        updates.push('color = ?');
        params.push(color);
    }
    if (strokeWidth !== undefined) {
        updates.push('stroke_width = ?');
        params.push(strokeWidth);
    }
    if (opacity !== undefined) {
        updates.push('opacity = ?');
        params.push(opacity);
    }
    if (isShared !== undefined) {
        updates.push('is_shared = ?');
        params.push(isShared ? 1 : 0);
    }

    if (updates.length === 0) {
        return res.json({ message: 'Geen wijzigingen.' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    db.prepare(`UPDATE pdf_annotations SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    res.json({ message: 'Annotatie bijgewerkt.' });
}));

/**
 * @swagger
 * /annotations/stamps:
 *   get:
 *     summary: Get available annotation stamps
 *     tags: [Annotations]
 */
router.get('/stamps', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const stamps = db.prepare(`
        SELECT id, name, category, svg_data, is_builtin, sort_order
        FROM annotation_stamps
        WHERE is_builtin = 1 OR association_id = ? OR user_id = ?
        ORDER BY category, sort_order, name
    `).all(req.user!.associationId, req.user!.id);

    res.json(stamps.map((s: any) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        svgData: s.svg_data,
        isBuiltin: !!s.is_builtin,
    })));
}));

/**
 * @swagger
 * /annotations/stamps:
 *   post:
 *     summary: Create a custom stamp
 *     tags: [Annotations]
 */
router.post('/stamps', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, category, svgData, isAssociationWide } = req.body;

    if (!name || !svgData) {
        throw new ApiError(400, 'Naam en SVG data zijn verplicht.');
    }

    const id = uuidv4();

    db.prepare(`
        INSERT INTO annotation_stamps (id, association_id, user_id, name, category, svg_data, is_builtin)
        VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(
        id,
        isAssociationWide ? req.user!.associationId : null,
        isAssociationWide ? null : req.user!.id,
        name,
        category || 'general',
        svgData
    );

    res.status(201).json({
        id,
        name,
        category: category || 'general',
        svgData,
        isBuiltin: false,
    });
}));

/**
 * @swagger
 * /annotations/stamps/{id}:
 *   delete:
 *     summary: Delete a custom stamp
 *     tags: [Annotations]
 */
router.delete('/stamps/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(`
        DELETE FROM annotation_stamps
        WHERE id = ? AND is_builtin = 0 AND (user_id = ? OR association_id = ?)
    `).run(req.params.id, req.user!.id, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Stempel niet gevonden of kan niet worden verwijderd.');
    }

    res.json({ message: 'Stempel verwijderd.' });
}));

export default router;
