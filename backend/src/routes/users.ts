import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { createUserSchema, updateUserSchema } from '../validation/schemas';
import { withTransaction, getPaginationParams, createPaginatedResult } from '../utils/database';
import logger from '../utils/logger';

const router = Router();

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page (max 100)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *     responses:
 *       200:
 *         description: List of users with pagination
 */
router.get('/', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page, limit, offset } = getPaginationParams(req.query);
    const search = req.query.search as string | undefined;

    let whereClause = 'WHERE u.association_id = ?';
    const params: any[] = [req.user!.associationId];

    if (search) {
        whereClause += ` AND (LOWER(u.first_name) LIKE ? OR LOWER(u.last_name) LIKE ? OR LOWER(u.email) LIKE ?)`;
        const searchTerm = `%${search.toLowerCase()}%`;
        params.push(searchTerm, searchTerm, searchTerm);
    }

    // Get total count
    const countResult = db.prepare(`
        SELECT COUNT(*) as total FROM users u ${whereClause}
    `).get(...params) as { total: number };

    // Get paginated users
    const users = db.prepare(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.association_id, u.created_at,
               a.name as association_name
        FROM users u
        LEFT JOIN associations a ON u.association_id = a.id
        ${whereClause}
        ORDER BY u.last_name, u.first_name
        LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    // Get instruments and orchestras for each user
    const result = users.map((user: any) => {
        const instruments = db.prepare(`
            SELECT i.id, i.name, i.tuning
            FROM instruments i
            JOIN user_instruments ui ON i.id = ui.instrument_id
            WHERE ui.user_id = ?
        `).all(user.id);

        const orchestras = db.prepare(`
            SELECT o.id, o.name
            FROM orchestras o
            JOIN user_orchestras uo ON o.id = uo.orchestra_id
            WHERE uo.user_id = ?
        `).all(user.id);

        return {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role,
            associationId: user.association_id,
            associationName: user.association_name,
            createdAt: user.created_at,
            instruments,
            orchestras,
        };
    });

    res.json(createPaginatedResult(result, countResult.total, page, limit));
}));

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get single user by ID
 *     tags: [Users]
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
 *         description: User details
 *       404:
 *         description: User not found
 */
router.get('/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = db.prepare(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.association_id, u.created_at,
               a.name as association_name
        FROM users u
        LEFT JOIN associations a ON u.association_id = a.id
        WHERE u.id = ? AND u.association_id = ?
    `).get(req.params.id, req.user!.associationId) as any;

    if (!user) {
        throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    const instruments = db.prepare(`
        SELECT i.id, i.name, i.tuning
        FROM instruments i
        JOIN user_instruments ui ON i.id = ui.instrument_id
        WHERE ui.user_id = ?
    `).all(user.id);

    const orchestras = db.prepare(`
        SELECT o.id, o.name
        FROM orchestras o
        JOIN user_orchestras uo ON o.id = uo.orchestra_id
        WHERE uo.user_id = ?
    `).all(user.id);

    res.json({
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        associationId: user.association_id,
        associationName: user.association_name,
        createdAt: user.created_at,
        instruments,
        orchestras,
    });
}));

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create new user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - firstName
 *               - lastName
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, music_committee, member]
 *               instrumentIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               orchestraIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: User created successfully
 */
router.post('/', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createUserSchema.parse(req.body);

    // Check if email already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(data.email);
    if (existing) {
        throw new ApiError(409, 'Email is al in gebruik.');
    }

    const userId = uuidv4();
    const passwordHash = bcrypt.hashSync(data.password, 10);

    // Use transaction to ensure atomicity
    withTransaction(() => {
        db.prepare(`
            INSERT INTO users (id, email, password_hash, first_name, last_name, role, association_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(userId, data.email, passwordHash, data.firstName, data.lastName, data.role, req.user!.associationId);

        // Add instruments
        if (data.instrumentIds && data.instrumentIds.length > 0) {
            const insertInstrument = db.prepare('INSERT INTO user_instruments (user_id, instrument_id) VALUES (?, ?)');
            for (const instrumentId of data.instrumentIds) {
                insertInstrument.run(userId, instrumentId);
            }
        }

        // Add orchestras
        if (data.orchestraIds && data.orchestraIds.length > 0) {
            const insertOrchestra = db.prepare('INSERT INTO user_orchestras (user_id, orchestra_id) VALUES (?, ?)');
            for (const orchestraId of data.orchestraIds) {
                insertOrchestra.run(userId, orchestraId);
            }
        }
    });

    logger.info(`User created: ${data.email}`, { userId, createdBy: req.user!.id });

    res.status(201).json({
        id: userId,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        message: 'Gebruiker succesvol aangemaakt.',
    });
}));

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Update user
 *     tags: [Users]
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
 *               email:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               role:
 *                 type: string
 *               password:
 *                 type: string
 *               instrumentIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               orchestraIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: User updated successfully
 */
router.put('/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateUserSchema.parse(req.body);

    // Check if user exists and belongs to same association
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND association_id = ?').get(
        req.params.id,
        req.user!.associationId
    );

    if (!user) {
        throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    // Check email uniqueness if changed
    if (data.email) {
        const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(data.email, req.params.id);
        if (existing) {
            throw new ApiError(409, 'Email is al in gebruik.');
        }
    }

    // Use transaction to ensure atomicity
    withTransaction(() => {
        // Update basic info
        if (data.password) {
            const passwordHash = bcrypt.hashSync(data.password, 10);
            db.prepare(`
                UPDATE users SET email = COALESCE(?, email), first_name = COALESCE(?, first_name),
                       last_name = COALESCE(?, last_name), role = COALESCE(?, role), password_hash = ?
                WHERE id = ?
            `).run(data.email, data.firstName, data.lastName, data.role, passwordHash, req.params.id);
        } else {
            db.prepare(`
                UPDATE users SET email = COALESCE(?, email), first_name = COALESCE(?, first_name),
                       last_name = COALESCE(?, last_name), role = COALESCE(?, role)
                WHERE id = ?
            `).run(data.email, data.firstName, data.lastName, data.role, req.params.id);
        }

        // Update instruments (only if provided)
        if (data.instrumentIds !== undefined) {
            db.prepare('DELETE FROM user_instruments WHERE user_id = ?').run(req.params.id);
            if (data.instrumentIds.length > 0) {
                const insertInstrument = db.prepare('INSERT INTO user_instruments (user_id, instrument_id) VALUES (?, ?)');
                for (const instrumentId of data.instrumentIds) {
                    insertInstrument.run(req.params.id, instrumentId);
                }
            }
        }

        // Update orchestras (only if provided)
        if (data.orchestraIds !== undefined) {
            db.prepare('DELETE FROM user_orchestras WHERE user_id = ?').run(req.params.id);
            if (data.orchestraIds.length > 0) {
                const insertOrchestra = db.prepare('INSERT INTO user_orchestras (user_id, orchestra_id) VALUES (?, ?)');
                for (const orchestraId of data.orchestraIds) {
                    insertOrchestra.run(req.params.id, orchestraId);
                }
            }
        }
    });

    logger.info(`User updated: ${req.params.id}`, { updatedBy: req.user!.id });

    res.json({ message: 'Gebruiker succesvol bijgewerkt.' });
}));

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete user
 *     tags: [Users]
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
 *         description: User deleted successfully
 */
router.delete('/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    // Prevent self-deletion
    if (req.params.id === req.user!.id) {
        throw new ApiError(400, 'Je kunt jezelf niet verwijderen.');
    }

    const result = db.prepare('DELETE FROM users WHERE id = ? AND association_id = ?').run(
        req.params.id,
        req.user!.associationId
    );

    if (result.changes === 0) {
        throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    logger.info(`User deleted: ${req.params.id}`, { deletedBy: req.user!.id });

    res.json({ message: 'Gebruiker succesvol verwijderd.' });
}));

export default router;
