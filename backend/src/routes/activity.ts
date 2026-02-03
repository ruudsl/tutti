import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Log an activity
router.post('/log', authenticateToken, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { actionType, entityType, entityId, metadata } = req.body;

  if (!actionType || !entityType || !entityId) {
    return res.status(400).json({ error: 'actionType, entityType en entityId zijn verplicht' });
  }

  try {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO activity_log (id, user_id, action_type, entity_type, entity_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, authReq.user!.id, actionType, entityType, entityId, metadata ? JSON.stringify(metadata) : null);

    res.status(201).json({ success: true, id });
  } catch (error) {
    console.error('Error logging activity:', error);
    res.status(500).json({ error: 'Fout bij loggen van activiteit' });
  }
});

// Get activity statistics
router.get('/stats', authenticateToken, requireRole('music_committee', 'admin'), (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { period = '30' } = req.query;

  const days = parseInt(period as string) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  try {
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
    `).all(startDateStr, authReq.user!.associationId);

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
    `).all(startDateStr, authReq.user!.associationId);

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
    `).all(startDateStr, authReq.user!.associationId);

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
    `).get(startDateStr, authReq.user!.associationId);

    res.json({
      topPieces,
      recentActivity,
      userActivity,
      totals,
      period: days,
    });
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    res.status(500).json({ error: 'Fout bij ophalen van statistieken' });
  }
});

// Get recent activity feed
router.get('/feed', authenticateToken, requireRole('music_committee', 'admin'), (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { limit = '50' } = req.query;

  try {
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
    `).all(authReq.user!.associationId, parseInt(limit as string));

    res.json(activities);
  } catch (error) {
    console.error('Error fetching activity feed:', error);
    res.status(500).json({ error: 'Fout bij ophalen van activiteiten' });
  }
});

export default router;
