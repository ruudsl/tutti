import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { createAnnotationSchema, updateAnnotationSchema } from '../validation/schemas';
import logger from '../utils/logger';

const router = Router();

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

export default router;
