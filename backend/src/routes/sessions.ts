import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';

const router = Router();

/**
 * @swagger
 * /sessions:
 *   get:
 *     summary: Get all active sessions for current user
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active sessions
 */
router.get('/', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const sessions = db.prepare(`
        SELECT id, ip_address, user_agent, last_active, created_at, expires_at
        FROM user_sessions
        WHERE user_id = ? AND expires_at > datetime('now')
        ORDER BY last_active DESC
    `).all(req.user!.id);

    // Get current session token hash
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    const currentTokenHash = token ? crypto.createHash('sha256').update(token).digest('hex') : null;

    res.json(sessions.map((s: any) => ({
        id: s.id,
        ipAddress: s.ip_address,
        userAgent: s.user_agent,
        lastActive: s.last_active,
        createdAt: s.created_at,
        expiresAt: s.expires_at,
        isCurrent: currentTokenHash ? db.prepare(
            'SELECT token_hash FROM user_sessions WHERE id = ?'
        ).get(s.id)?.token_hash === currentTokenHash : false,
    })));
}));

/**
 * @swagger
 * /sessions/{id}:
 *   delete:
 *     summary: Revoke a specific session
 *     tags: [Sessions]
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
 *         description: Session revoked
 */
router.delete('/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(
        'DELETE FROM user_sessions WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.user!.id);

    if (result.changes === 0) {
        throw new ApiError(404, 'Sessie niet gevonden.');
    }

    logger.info(`User ${req.user!.id} revoked session ${req.params.id}`);

    res.json({ message: 'Sessie beëindigd.' });
}));

/**
 * @swagger
 * /sessions/all:
 *   delete:
 *     summary: Revoke all sessions except current
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All other sessions revoked
 */
router.delete('/all', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    // Get current session token hash
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
        throw new ApiError(400, 'Geen geldig token.');
    }

    const currentTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const result = db.prepare(
        'DELETE FROM user_sessions WHERE user_id = ? AND token_hash != ?'
    ).run(req.user!.id, currentTokenHash);

    logger.info(`User ${req.user!.id} revoked ${result.changes} sessions`);

    res.json({
        message: 'Alle andere sessies beëindigd.',
        revokedCount: result.changes,
    });
}));

// Helper function to register a session (called from auth routes)
export function registerSession(
    userId: string,
    token: string,
    ipAddress: string | undefined,
    userAgent: string | undefined,
    expiresInDays: number = 7
): string {
    const id = uuidv4();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    db.prepare(`
        INSERT INTO user_sessions (id, user_id, token_hash, ip_address, user_agent, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId, tokenHash, ipAddress || null, userAgent || null, expiresAt.toISOString());

    // Clean up expired sessions
    db.prepare("DELETE FROM user_sessions WHERE expires_at < datetime('now')").run();

    return id;
}

// Helper function to update session activity
export function updateSessionActivity(token: string): void {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    db.prepare(
        'UPDATE user_sessions SET last_active = CURRENT_TIMESTAMP WHERE token_hash = ?'
    ).run(tokenHash);
}

export default router;
