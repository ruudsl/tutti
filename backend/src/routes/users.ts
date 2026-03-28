import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from '../database/connection';
import config from '../config';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { createUserSchema, updateUserSchema } from '../validation/schemas';
import { withTransaction, getPaginationParams, createPaginatedResult } from '../utils/database';
import logger from '../utils/logger';
import { logAuditEvent } from './audit-logs';

const router = Router();

// Profile photo upload configuration
const profilePhotoDir = path.resolve(config.uploadDir, 'profile-photos');
if (!fs.existsSync(profilePhotoDir)) {
    fs.mkdirSync(profilePhotoDir, { recursive: true });
}

const profilePhotoStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, profilePhotoDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `profile-${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
    },
});

const profilePhotoUpload = multer({
    storage: profilePhotoStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
    fileFilter: (_req, file, cb) => {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Alleen PNG, JPG of WebP bestanden zijn toegestaan.'));
        }
    },
});

// ========================================
// MEMBER DIRECTORY (Smoelenboek)
// ========================================

/**
 * GET /users/directory
 * Public member directory (all authenticated users can see)
 */
router.get('/directory', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const orchestraId = req.query.orchestraId as string | undefined;
    const instrumentId = req.query.instrumentId as string | undefined;
    const search = req.query.search as string | undefined;

    let whereClause = 'WHERE u.association_id = ?';
    const params: any[] = [req.user!.associationId];

    if (search) {
        whereClause += ` AND (LOWER(u.first_name) LIKE ? OR LOWER(u.last_name) LIKE ?)`;
        const searchTerm = `%${search.toLowerCase()}%`;
        params.push(searchTerm, searchTerm);
    }

    // Get all members
    const users = db.prepare(`
        SELECT u.id, u.first_name, u.last_name, u.profile_photo_path
        FROM users u
        ${whereClause}
        ORDER BY u.last_name, u.first_name
    `).all(...params) as { id: string; first_name: string; last_name: string; profile_photo_path: string | null }[];

    // Get instruments and orchestras for all users in batch
    const result = users.map(user => {
        const instruments = db.prepare(`
            SELECT i.id, i.name, i.tuning
            FROM instruments i
            JOIN user_instruments ui ON i.id = ui.instrument_id
            WHERE ui.user_id = ?
        `).all(user.id) as { id: string; name: string; tuning: string | null }[];

        const orchestras = db.prepare(`
            SELECT o.id, o.name
            FROM orchestras o
            JOIN user_orchestras uo ON o.id = uo.orchestra_id
            WHERE uo.user_id = ?
        `).all(user.id) as { id: string; name: string }[];

        return {
            id: user.id,
            firstName: user.first_name,
            lastName: user.last_name,
            photoUrl: user.profile_photo_path ? `/api/users/${user.id}/photo` : null,
            instruments,
            orchestras,
        };
    }).filter(user => {
        // Apply orchestra filter
        if (orchestraId && !user.orchestras.some(o => o.id === orchestraId)) {
            return false;
        }
        // Apply instrument filter
        if (instrumentId && !user.instruments.some(i => i.id === instrumentId)) {
            return false;
        }
        return true;
    });

    res.json(result);
}));

// ========================================
// PROFILE PHOTO ENDPOINTS
// ========================================

/**
 * GET /users/:id/photo
 * Serve a user's profile photo (any authenticated user)
 */
router.get('/:id/photo', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = db.prepare(
        'SELECT profile_photo_path FROM users WHERE id = ? AND association_id = ?'
    ).get(req.params.id, req.user!.associationId) as { profile_photo_path: string | null } | undefined;

    if (!user || !user.profile_photo_path) {
        throw new ApiError(404, 'Profielfoto niet gevonden.');
    }

    const photoPath = path.resolve(user.profile_photo_path);
    if (!fs.existsSync(photoPath)) {
        throw new ApiError(404, 'Profielfoto niet gevonden.');
    }

    res.set('Cache-Control', 'public, max-age=3600');
    res.sendFile(photoPath);
}));

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
    // Use custom pagination with higher limit for users (up to 1000)
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit as string) || 25));
    const offset = (page - 1) * limit;
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
        SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.association_id, u.created_at, u.last_login,
               u.profile_photo_path, a.name as association_name
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
            lastLogin: user.last_login,
            photoUrl: user.profile_photo_path ? `/api/users/${user.id}/photo` : null,
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
               u.profile_photo_path, a.name as association_name
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
        photoUrl: user.profile_photo_path ? `/api/users/${user.id}/photo` : null,
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

    // Log audit event
    logAuditEvent(
        req.user!.id,
        'create',
        'user',
        userId,
        `${data.firstName} ${data.lastName}`,
        { email: data.email, role: data.role },
        req.ip,
        req.get('user-agent')
    );

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

    // Log audit event
    logAuditEvent(
        req.user!.id,
        'update',
        'user',
        req.params.id,
        data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : undefined,
        {
            ...(data.email && { email: data.email }),
            ...(data.firstName && { firstName: data.firstName }),
            ...(data.lastName && { lastName: data.lastName }),
            ...(data.role && { role: data.role }),
            ...(data.password && { password: '***' }),
        },
        req.ip,
        req.get('user-agent')
    );

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

    // Get user info before deletion for audit log
    const userToDelete = db.prepare(
        'SELECT first_name, last_name, email FROM users WHERE id = ? AND association_id = ?'
    ).get(req.params.id, req.user!.associationId) as { first_name: string; last_name: string; email: string } | undefined;

    if (!userToDelete) {
        throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    const result = db.prepare('DELETE FROM users WHERE id = ? AND association_id = ?').run(
        req.params.id,
        req.user!.associationId
    );

    if (result.changes === 0) {
        throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    logger.info(`User deleted: ${req.params.id}`, { deletedBy: req.user!.id });

    // Log audit event
    logAuditEvent(
        req.user!.id,
        'delete',
        'user',
        req.params.id,
        `${userToDelete.first_name} ${userToDelete.last_name}`,
        { email: userToDelete.email },
        req.ip,
        req.get('user-agent')
    );

    res.json({ message: 'Gebruiker succesvol verwijderd.' });
}));

/**
 * POST /users/:id/photo
 * Upload a profile photo for a user (admin only, or via Entra sync)
 */
router.post('/:id/photo', authenticateToken, requireRole('admin'), profilePhotoUpload.single('photo'), asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
        throw new ApiError(400, 'Geen bestand geüpload.');
    }

    // Verify user exists and belongs to same association
    const user = db.prepare(
        'SELECT id, profile_photo_path FROM users WHERE id = ? AND association_id = ?'
    ).get(req.params.id, req.user!.associationId) as { id: string; profile_photo_path: string | null } | undefined;

    if (!user) {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    // Remove old photo if exists
    if (user.profile_photo_path) {
        const oldPath = path.resolve(user.profile_photo_path);
        if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
        }
    }

    // Update database with new photo path
    db.prepare('UPDATE users SET profile_photo_path = ? WHERE id = ?').run(req.file.path, req.params.id);

    logger.info(`Profile photo uploaded for user ${req.params.id}`, { uploadedBy: req.user!.id });

    res.json({
        photoUrl: `/api/users/${req.params.id}/photo`,
        message: 'Profielfoto geüpload.',
    });
}));

/**
 * @swagger
 * /users/export-data:
 *   get:
 *     summary: Export all user data (GDPR/AVG compliance)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: JSON file with all user data
 */
router.get('/export-data', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;

    // Get user profile
    const user = db.prepare(`
        SELECT id, email, first_name, last_name, role, status, created_at, last_login,
               profile_photo_path, private_email, onboarded_at, offboarded_at
        FROM users WHERE id = ?
    `).get(userId) as any;

    // Get user's instruments
    const instruments = db.prepare(`
        SELECT i.name, i.tuning FROM user_instruments ui
        JOIN instruments i ON ui.instrument_id = i.id
        WHERE ui.user_id = ?
    `).all(userId);

    // Get user's orchestras
    const orchestras = db.prepare(`
        SELECT o.name FROM user_orchestras uo
        JOIN orchestras o ON uo.orchestra_id = o.id
        WHERE uo.user_id = ?
    `).all(userId);

    // Get user's favorites
    const favorites = db.prepare(`
        SELECT mt.title, mt.arranger, uf.created_at as favorited_at
        FROM user_favorites uf
        JOIN music_titles mt ON uf.music_title_id = mt.id
        WHERE uf.user_id = ?
    `).all(userId);

    // Get user's practice logs
    const practiceLogs = db.prepare(`
        SELECT mt.title, pl.duration_minutes, pl.notes, pl.practiced_at
        FROM practice_logs pl
        JOIN music_titles mt ON pl.music_title_id = mt.id
        WHERE pl.user_id = ?
        ORDER BY pl.practiced_at DESC
    `).all(userId);

    // Get user's recent views
    const recentViews = db.prepare(`
        SELECT item_type, item_title, viewed_at
        FROM user_recent_views
        WHERE user_id = ?
        ORDER BY viewed_at DESC
    `).all(userId);

    // Get user's annotations count
    const annotationCount = db.prepare(`
        SELECT COUNT(*) as count FROM pdf_annotations WHERE user_id = ?
    `).get(userId) as { count: number };

    // Get user's equipment loans
    const equipmentLoans = db.prepare(`
        SELECT e.instrument_type, e.brand_model, el.loan_date, el.return_date
        FROM equipment_loans el
        JOIN equipment e ON el.equipment_id = e.id
        WHERE el.user_id = ?
    `).all(userId);

    // Get user's uniform assignments
    const uniformAssignments = db.prepare(`
        SELECT ui.item_type, ui.size_standard, ua.assigned_date, ua.returned_date
        FROM uniform_assignments ua
        JOIN uniform_items ui ON ua.uniform_item_id = ui.id
        WHERE ua.user_id = ?
    `).all(userId);

    // Get user's activity log
    const activityLog = db.prepare(`
        SELECT action, details, ip_address, created_at
        FROM activity_log
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 1000
    `).all(userId);

    // Get seating preferences
    const seatingPreferences = db.prepare(`
        SELECT u.first_name || ' ' || u.last_name as neighbor_name, sn.preference
        FROM seating_neighbors sn
        JOIN users u ON sn.neighbor_user_id = u.id
        WHERE sn.user_id = ?
    `).all(userId);

    const exportData = {
        exportDate: new Date().toISOString(),
        profile: {
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role,
            status: user.status,
            createdAt: user.created_at,
            lastLogin: user.last_login,
            privateEmail: user.private_email,
            onboardedAt: user.onboarded_at,
            offboardedAt: user.offboarded_at,
        },
        instruments,
        orchestras,
        favorites,
        practiceLogs,
        recentViews,
        annotationCount: annotationCount.count,
        equipmentLoans,
        uniformAssignments,
        activityLog,
        seatingPreferences,
    };

    logger.info(`User ${userId} exported their data`);

    // Set response headers for JSON download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="mijn-data-${new Date().toISOString().split('T')[0]}.json"`);

    res.json(exportData);
}));

export default router;
