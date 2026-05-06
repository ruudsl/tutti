import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { cacheMiddleware, cacheInvalidator } from '../middleware/cache';
import { createOrchestraSchema, updateOrchestraSchema } from '../validation/schemas';
import logger from '../utils/logger';
import { logAuditEvent } from './audit-logs';

const router = Router();

// Cache path for invalidation
const CACHE_PATH = '/api/orchestras';

/**
 * @swagger
 * /orchestras:
 *   get:
 *     summary: Get all orchestras for current association
 *     tags: [Orchestras]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of orchestras
 */
router.get('/', authenticateToken, cacheMiddleware({ ttlSeconds: 300, varyByAssociation: true }), asyncHandler(async (req: AuthRequest, res: Response) => {
    const orchestras = db.prepare(`
        SELECT o.id, o.name, o.created_at,
               (SELECT COUNT(*) FROM user_orchestras WHERE orchestra_id = o.id) as member_count,
               (SELECT COUNT(*) FROM music_lists WHERE orchestra_id = o.id) as list_count
        FROM orchestras o
        WHERE o.association_id = ?
        ORDER BY o.name
    `).all(req.user!.associationId);

    res.json(orchestras.map((o: any) => ({
        id: o.id,
        name: o.name,
        createdAt: o.created_at,
        memberCount: o.member_count,
        listCount: o.list_count,
    })));
}));

/**
 * @swagger
 * /orchestras/{id}:
 *   get:
 *     summary: Get single orchestra with members
 *     tags: [Orchestras]
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
 *         description: Orchestra details with members and lists
 *       404:
 *         description: Orchestra not found
 */
router.get('/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const orchestra = db.prepare(`
        SELECT id, name, created_at
        FROM orchestras
        WHERE id = ? AND association_id = ?
    `).get(req.params.id, req.user!.associationId) as any;

    if (!orchestra) {
        throw new ApiError(404, 'Orkest niet gevonden.');
    }

    // Get members
    const members = db.prepare(`
        SELECT u.id, u.first_name, u.last_name, u.email
        FROM users u
        JOIN user_orchestras uo ON u.id = uo.user_id
        WHERE uo.orchestra_id = ?
        ORDER BY u.last_name, u.first_name
    `).all(req.params.id);

    // Get music lists
    const lists = db.prepare(`
        SELECT ml.id, ml.name, ml.created_at,
               (SELECT COUNT(*) FROM music_list_pieces WHERE music_list_id = ml.id) as piece_count
        FROM music_lists ml
        WHERE ml.orchestra_id = ?
        ORDER BY ml.name
    `).all(req.params.id);

    res.json({
        id: orchestra.id,
        name: orchestra.name,
        createdAt: orchestra.created_at,
        members: members.map((m: any) => ({
            id: m.id,
            firstName: m.first_name,
            lastName: m.last_name,
            email: m.email,
        })),
        lists: lists.map((l: any) => ({
            id: l.id,
            name: l.name,
            createdAt: l.created_at,
            pieceCount: l.piece_count,
        })),
    });
}));

/**
 * @swagger
 * /orchestras:
 *   post:
 *     summary: Create new orchestra
 *     tags: [Orchestras]
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
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Orchestra created successfully
 *       400:
 *         description: Orchestra with this name already exists
 */
router.post('/', authenticateToken, requireRole('admin'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createOrchestraSchema.parse(req.body);

    // Check if orchestra name already exists in this association
    const existing = db.prepare(
        'SELECT id FROM orchestras WHERE LOWER(name) = LOWER(?) AND association_id = ?'
    ).get(data.name.trim(), req.user!.associationId);

    if (existing) {
        throw new ApiError(409, 'Orkest met deze naam bestaat al.');
    }

    const orchestraId = uuidv4();
    db.prepare('INSERT INTO orchestras (id, name, association_id) VALUES (?, ?, ?)').run(
        orchestraId,
        data.name.trim(),
        req.user!.associationId
    );

    logger.info(`Orchestra created: ${data.name}`, { orchestraId, createdBy: req.user!.id });

    // Log audit event
    logAuditEvent(
        req.user!.id,
        'create',
        'orchestra',
        orchestraId,
        data.name.trim(),
        undefined,
        req.ip,
        req.get('user-agent')
    );

    res.status(201).json({
        id: orchestraId,
        name: data.name.trim(),
        message: 'Orkest succesvol aangemaakt.',
    });
}));

/**
 * @swagger
 * /orchestras/{id}:
 *   put:
 *     summary: Update orchestra
 *     tags: [Orchestras]
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
 *         description: Orchestra updated successfully
 *       404:
 *         description: Orchestra not found
 */
router.put('/:id', authenticateToken, requireRole('admin'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateOrchestraSchema.parse(req.body);

    const orchestra = db.prepare(
        'SELECT id FROM orchestras WHERE id = ? AND association_id = ?'
    ).get(req.params.id, req.user!.associationId);

    if (!orchestra) {
        throw new ApiError(404, 'Orkest niet gevonden.');
    }

    // Check name uniqueness
    const existing = db.prepare(
        'SELECT id FROM orchestras WHERE LOWER(name) = LOWER(?) AND association_id = ? AND id != ?'
    ).get(data.name.trim(), req.user!.associationId, req.params.id);

    if (existing) {
        throw new ApiError(409, 'Orkest met deze naam bestaat al.');
    }

    db.prepare('UPDATE orchestras SET name = ? WHERE id = ?').run(data.name.trim(), req.params.id);

    logger.info(`Orchestra updated: ${req.params.id}`, { updatedBy: req.user!.id });

    // Log audit event
    logAuditEvent(
        req.user!.id,
        'update',
        'orchestra',
        req.params.id,
        data.name.trim(),
        { name: data.name.trim() },
        req.ip,
        req.get('user-agent')
    );

    res.json({ message: 'Orkest succesvol bijgewerkt.' });
}));

/**
 * @swagger
 * /orchestras/{id}:
 *   delete:
 *     summary: Delete orchestra
 *     tags: [Orchestras]
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
 *         description: Orchestra deleted successfully
 *       404:
 *         description: Orchestra not found
 */
router.delete('/:id', authenticateToken, requireRole('admin'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    // Get orchestra name before deletion for audit log
    const orchestraToDelete = db.prepare(
        'SELECT name FROM orchestras WHERE id = ? AND association_id = ?'
    ).get(req.params.id, req.user!.associationId) as { name: string } | undefined;

    if (!orchestraToDelete) {
        throw new ApiError(404, 'Orkest niet gevonden.');
    }

    const result = db.prepare(
        'DELETE FROM orchestras WHERE id = ? AND association_id = ?'
    ).run(req.params.id, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Orkest niet gevonden.');
    }

    logger.info(`Orchestra deleted: ${req.params.id}`, { deletedBy: req.user!.id });

    // Log audit event
    logAuditEvent(
        req.user!.id,
        'delete',
        'orchestra',
        req.params.id,
        orchestraToDelete.name,
        undefined,
        req.ip,
        req.get('user-agent')
    );

    res.json({ message: 'Orkest succesvol verwijderd.' });
}));

export default router;
