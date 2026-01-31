import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { createAssociationSchema, updateAssociationSchema } from '../validation/schemas';
import logger from '../utils/logger';

const router = Router();

/**
 * @swagger
 * /associations:
 *   get:
 *     summary: Get all associations (for sharing purposes)
 *     tags: [Associations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of associations
 */
router.get('/', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associations = db.prepare(`
        SELECT id, name, created_at
        FROM associations
        ORDER BY name
    `).all();

    res.json(associations.map((a: any) => ({
        id: a.id,
        name: a.name,
        createdAt: a.created_at,
    })));
}));

/**
 * @swagger
 * /associations/current:
 *   get:
 *     summary: Get current association
 *     tags: [Associations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current association details
 *       404:
 *         description: Association not found
 */
router.get('/current', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const association = db.prepare(`
        SELECT a.id, a.name, a.created_at,
               (SELECT COUNT(*) FROM users WHERE association_id = a.id) as member_count,
               (SELECT COUNT(*) FROM orchestras WHERE association_id = a.id) as orchestra_count
        FROM associations a
        WHERE a.id = ?
    `).get(req.user!.associationId) as any;

    if (!association) {
        throw new ApiError(404, 'Vereniging niet gevonden.');
    }

    res.json({
        id: association.id,
        name: association.name,
        createdAt: association.created_at,
        memberCount: association.member_count,
        orchestraCount: association.orchestra_count,
    });
}));

/**
 * @swagger
 * /associations/current:
 *   put:
 *     summary: Update current association
 *     tags: [Associations]
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
 *       200:
 *         description: Association updated successfully
 *       409:
 *         description: Association with this name already exists
 */
router.put('/current', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateAssociationSchema.parse(req.body);

    // Check name uniqueness
    const existing = db.prepare(
        'SELECT id FROM associations WHERE LOWER(name) = LOWER(?) AND id != ?'
    ).get(data.name.trim(), req.user!.associationId);

    if (existing) {
        throw new ApiError(409, 'Vereniging met deze naam bestaat al.');
    }

    db.prepare('UPDATE associations SET name = ? WHERE id = ?').run(
        data.name.trim(),
        req.user!.associationId
    );

    logger.info(`Association updated: ${req.user!.associationId}`, { updatedBy: req.user!.id });

    res.json({ message: 'Vereniging succesvol bijgewerkt.' });
}));

/**
 * @swagger
 * /associations:
 *   post:
 *     summary: Create new association (super admin - for multi-tenant setup)
 *     tags: [Associations]
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
 *         description: Association created successfully
 *       409:
 *         description: Association with this name already exists
 */
router.post('/', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createAssociationSchema.parse(req.body);

    // Check if name already exists
    const existing = db.prepare(
        'SELECT id FROM associations WHERE LOWER(name) = LOWER(?)'
    ).get(data.name.trim());

    if (existing) {
        throw new ApiError(409, 'Vereniging met deze naam bestaat al.');
    }

    const associationId = uuidv4();
    db.prepare('INSERT INTO associations (id, name) VALUES (?, ?)').run(
        associationId,
        data.name.trim()
    );

    logger.info(`Association created: ${data.name}`, { associationId, createdBy: req.user!.id });

    res.status(201).json({
        id: associationId,
        name: data.name.trim(),
        message: 'Vereniging succesvol aangemaakt.',
    });
}));

export default router;
