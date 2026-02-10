import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * @swagger
 * /activity/log:
 *   post:
 *     summary: Log a user activity (view, download)
 *     tags: [Activity]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [actionType, entityType, entityId]
 *             properties:
 *               actionType:
 *                 type: string
 *                 enum: [view, download]
 *               entityType:
 *                 type: string
 *                 enum: [music_piece, music_title]
 *               entityId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Activity logged
 */
router.post('/log', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { actionType, entityType, entityId, metadata } = req.body;

  if (!actionType || !entityType || !entityId) {
    return res.status(400).json({ error: 'actionType, entityType en entityId zijn verplicht' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO activity_log (id, user_id, action_type, entity_type, entity_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.user!.id, actionType, entityType, entityId, metadata ? JSON.stringify(metadata) : null);

  res.status(201).json({ success: true, id });
}));

/**
 * @swagger
 * /activity/stats:
 *   get:
 *     summary: Get activity statistics (top pieces, user activity, totals)
 *     tags: [Activity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to look back
 *     responses:
 *       200:
 *         description: Activity statistics
 */
router.get('/stats', authenticateToken, requireRole('music_committee', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { period = '30' } = req.query;

  const days = parseInt(period as string) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  // Top 10 most viewed/downloaded pieces
  const topPieces = db.prepare(`
    SELECT
      mp.id,
      mp.title,
      mp.arranger,
      COUNT(*) as count
    FROM activity_log al
    JOIN music_pieces mp ON al.entity_id = mp.id
    WHERE al.entity_type = 'music_piece'
      AND al.action_type IN ('view', 'download')
      AND al.created_at >= ?
      AND mp.association_id = ?
    GROUP BY mp.id
    ORDER BY count DESC
    LIMIT 10
  `).all(startDateStr, req.user!.associationId);

  // Activity by day
  const recentActivity = db.prepare(`
    SELECT
      date(al.created_at) as date,
      SUM(CASE WHEN al.action_type = 'download' THEN 1 ELSE 0 END) as downloads,
      SUM(CASE WHEN al.action_type = 'view' THEN 1 ELSE 0 END) as views
    FROM activity_log al
    JOIN users u ON al.user_id = u.id
    WHERE al.created_at >= ?
      AND u.association_id = ?
    GROUP BY date(al.created_at)
    ORDER BY date DESC
    LIMIT 30
  `).all(startDateStr, req.user!.associationId);

  // Top users by activity
  const userActivity = db.prepare(`
    SELECT
      u.id,
      u.first_name || ' ' || u.last_name as name,
      SUM(CASE WHEN al.action_type = 'download' THEN 1 ELSE 0 END) as downloads,
      SUM(CASE WHEN al.action_type = 'view' THEN 1 ELSE 0 END) as views
    FROM activity_log al
    JOIN users u ON al.user_id = u.id
    WHERE al.created_at >= ?
      AND u.association_id = ?
    GROUP BY u.id
    ORDER BY (downloads + views) DESC
    LIMIT 10
  `).all(startDateStr, req.user!.associationId);

  // Total stats
  const totals = db.prepare(`
    SELECT
      COUNT(*) as total_activities,
      COUNT(DISTINCT al.user_id) as active_users,
      SUM(CASE WHEN al.action_type = 'download' THEN 1 ELSE 0 END) as total_downloads,
      SUM(CASE WHEN al.action_type = 'view' THEN 1 ELSE 0 END) as total_views
    FROM activity_log al
    JOIN users u ON al.user_id = u.id
    WHERE al.created_at >= ?
      AND u.association_id = ?
  `).get(startDateStr, req.user!.associationId);

  res.json({
    topPieces,
    recentActivity,
    userActivity,
    totals,
    period: days,
  });
}));

/**
 * @swagger
 * /activity/feed:
 *   get:
 *     summary: Get recent activity feed
 *     tags: [Activity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: List of recent activities
 */
router.get('/feed', authenticateToken, requireRole('music_committee', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { limit = '50' } = req.query;

  const activities = db.prepare(`
    SELECT
      al.id,
      al.action_type,
      al.entity_type,
      al.entity_id,
      al.created_at,
      u.first_name || ' ' || u.last_name as user_name,
      CASE
        WHEN al.entity_type = 'music_title' THEN (SELECT title FROM music_titles WHERE id = al.entity_id)
        WHEN al.entity_type = 'music_piece' THEN (SELECT title FROM music_pieces WHERE id = al.entity_id)
        ELSE NULL
      END as entity_name
    FROM activity_log al
    JOIN users u ON al.user_id = u.id
    WHERE u.association_id = ?
    ORDER BY al.created_at DESC
    LIMIT ?
  `).all(req.user!.associationId, parseInt(limit as string));

  res.json(activities);
}));

export default router;
