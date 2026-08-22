import { Router, Response } from 'express';
import db from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { hashToken } from '../utils/sessionStore';
import logger from '../utils/logger';
import { logAuditEvent } from './audit-logs';

// Re-export session helpers from their new home so existing imports keep working
export { registerSession, updateSessionActivity, revokeUserSessions } from '../utils/sessionStore';

const router = Router();

function getRequestToken(req: AuthRequest): string | undefined {
  const authHeader = req.headers.authorization;
  return (authHeader && authHeader.split(' ')[1]) || (req.query.token as string | undefined);
}

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
// expires_at wordt als ISO-tekst weggeschreven ('2026-08-21T09:00:00.000Z'),
// datetime('now') levert een spatie ('2026-08-21 19:00:00'). Een kale
// tekstvergelijking laat de 'T' van de spatie winnen, waardoor een sessie die
// vandaag verliep de rest van de dag nog als actief in het overzicht stond.
// datetime() legt beide kanten op hetzelfde formaat.
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const sessions = db
      .prepare(
        `
        SELECT id, token_hash, ip_address, user_agent, last_active, created_at, expires_at
        FROM user_sessions
        WHERE user_id = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
        ORDER BY last_active DESC
    `,
      )
      .all(req.user!.id);

    // Get current session token hash
    const token = getRequestToken(req);
    const currentTokenHash = token ? hashToken(token) : null;

    res.json(
      sessions.map((s: any) => ({
        id: s.id,
        ipAddress: s.ip_address,
        userAgent: s.user_agent,
        lastActive: s.last_active,
        createdAt: s.created_at,
        expiresAt: s.expires_at,
        isCurrent: currentTokenHash !== null && s.token_hash === currentTokenHash,
      })),
    );
  }),
);

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
// NOTE: this route must be registered BEFORE '/:id', otherwise 'all' is
// matched as a session id and the request 404s.
router.delete(
  '/all',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Get current session token hash
    const token = getRequestToken(req);

    if (!token) {
      throw new ApiError(400, 'Geen geldig token.');
    }

    const currentTokenHash = hashToken(token);

    const result = db
      .prepare(
        `
        UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND token_hash != ? AND revoked_at IS NULL
    `,
      )
      .run(req.user!.id, currentTokenHash);

    logger.info(`User ${req.user!.id} revoked ${result.changes} sessions`);

    logAuditEvent(
      req.user!.id,
      'sessions_revoked_all',
      'user',
      req.user!.id,
      'Alle andere sessies beëindigd',
      { revokedCount: result.changes },
      req.ip,
      req.get('user-agent'),
    );

    res.json({
      message: 'Alle andere sessies beëindigd.',
      revokedCount: result.changes,
    });
  }),
);

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
router.delete(
  '/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db
      .prepare(
        `
        UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND revoked_at IS NULL
    `,
      )
      .run(req.params.id, req.user!.id);

    if (result.changes === 0) {
      throw new ApiError(404, 'Sessie niet gevonden.');
    }

    logger.info(`User ${req.user!.id} revoked session ${req.params.id}`);

    logAuditEvent(
      req.user!.id,
      'session_revoked',
      'session',
      req.params.id,
      'Sessie beëindigd',
      undefined,
      req.ip,
      req.get('user-agent'),
    );

    res.json({ message: 'Sessie beëindigd.' });
  }),
);

export default router;
