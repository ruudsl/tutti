import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import db from '../database/connection';
import archiver from 'archiver';
import logger from '../utils/logger';

const router = Router();

interface DataCategory {
  name: string;
  count: number;
  description: string;
}

/**
 * @swagger
 * /gdpr/data-summary:
 *   get:
 *     summary: Get summary of user's stored data
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Summary of data categories
 */
router.get('/data-summary', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const categories: DataCategory[] = [
    {
      name: 'profile',
      count: 1,
      description: 'Your profile information including name, email, and preferences',
    },
    {
      name: 'sessions',
      count: db.prepare('SELECT COUNT(*) as count FROM user_sessions WHERE user_id = ?').get(userId)?.count || 0,
      description: 'Login sessions and device information',
    },
    {
      name: 'favorites',
      count: db.prepare('SELECT COUNT(*) as count FROM user_favorites WHERE user_id = ?').get(userId)?.count || 0,
      description: 'Your favorited music pieces',
    },
    {
      name: 'practiceHistory',
      count: db.prepare('SELECT COUNT(*) as count FROM practice_logs WHERE user_id = ?').get(userId)?.count || 0,
      description: 'Your practice session history',
    },
    {
      name: 'activityLog',
      count: db.prepare('SELECT COUNT(*) as count FROM activity_log WHERE user_id = ?').get(userId)?.count || 0,
      description: 'Your activity log (views, downloads)',
    },
    {
      name: 'annotations',
      count: db.prepare('SELECT COUNT(*) as count FROM pdf_annotations WHERE user_id = ?').get(userId)?.count || 0,
      description: 'Your PDF annotations',
    },
    {
      name: 'audioRecordings',
      count: db.prepare('SELECT COUNT(*) as count FROM audio_recordings WHERE user_id = ?').get(userId)?.count || 0,
      description: 'Your audio recordings',
    },
    {
      name: 'issues',
      count: db.prepare('SELECT COUNT(*) as count FROM issues WHERE reporter_id = ?').get(userId)?.count || 0,
      description: 'Issues you have reported',
    },
    {
      name: 'notificationPreferences',
      count: db.prepare('SELECT COUNT(*) as count FROM notification_preferences WHERE user_id = ?').get(userId)?.count || 0,
      description: 'Your notification preferences',
    },
  ];

  res.json({
    userId,
    exportDate: new Date().toISOString(),
    categories: categories.filter(c => c.count > 0 || c.name === 'profile'),
    totalRecords: categories.reduce((sum, c) => sum + c.count, 0),
  });
}));

/**
 * @swagger
 * /gdpr/export:
 *   get:
 *     summary: Export all user data as JSON
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: ZIP file containing all user data
 */
router.get('/export', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const format = req.query.format === 'zip' ? 'zip' : 'json';

  logger.info(`GDPR data export requested by user ${userId}`);

  // Gather all user data
  const userData = {
    exportInfo: {
      exportDate: new Date().toISOString(),
      userId,
      format: 'GDPR Data Export',
      version: '1.0',
    },

    profile: db.prepare(`
      SELECT
        id, email, first_name, last_name, role, status,
        mfa_enabled, last_login, created_at,
        private_email
      FROM users WHERE id = ?
    `).get(userId),

    instruments: db.prepare(`
      SELECT i.id, i.name, i.tuning, i.family
      FROM instruments i
      JOIN user_instruments ui ON ui.instrument_id = i.id
      WHERE ui.user_id = ?
    `).all(userId),

    orchestras: db.prepare(`
      SELECT o.id, o.name
      FROM orchestras o
      JOIN user_orchestras uo ON uo.orchestra_id = o.id
      WHERE uo.user_id = ?
    `).all(userId),

    sessions: db.prepare(`
      SELECT id, ip_address, user_agent, last_active, created_at, expires_at
      FROM user_sessions WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId),

    favorites: db.prepare(`
      SELECT uf.id, uf.created_at, mt.title, mt.composer, mt.arranger
      FROM user_favorites uf
      JOIN music_titles mt ON mt.id = uf.music_title_id
      WHERE uf.user_id = ?
      ORDER BY uf.created_at DESC
    `).all(userId),

    recentViews: db.prepare(`
      SELECT urv.id, urv.viewed_at, mt.title
      FROM user_recent_views urv
      JOIN music_titles mt ON mt.id = urv.music_title_id
      WHERE urv.user_id = ?
      ORDER BY urv.viewed_at DESC
    `).all(userId),

    practiceHistory: db.prepare(`
      SELECT pl.id, pl.duration_minutes, pl.notes, pl.started_at, pl.ended_at,
             mt.title as music_title
      FROM practice_logs pl
      LEFT JOIN music_titles mt ON mt.id = pl.music_title_id
      WHERE pl.user_id = ?
      ORDER BY pl.started_at DESC
    `).all(userId),

    activityLog: db.prepare(`
      SELECT id, action_type, entity_type, entity_id, created_at
      FROM activity_log WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 1000
    `).all(userId),

    annotations: db.prepare(`
      SELECT pa.id, pa.page_number, pa.annotation_type, pa.content,
             pa.position_x, pa.position_y, pa.created_at, pa.updated_at,
             mp.title as music_piece_title
      FROM pdf_annotations pa
      LEFT JOIN music_pieces mp ON mp.id = pa.music_piece_id
      WHERE pa.user_id = ?
      ORDER BY pa.created_at DESC
    `).all(userId),

    audioRecordings: db.prepare(`
      SELECT ar.id, ar.title, ar.duration_seconds, ar.created_at,
             mt.title as music_title
      FROM audio_recordings ar
      LEFT JOIN music_titles mt ON mt.id = ar.music_title_id
      WHERE ar.user_id = ?
      ORDER BY ar.created_at DESC
    `).all(userId),

    reportedIssues: db.prepare(`
      SELECT i.id, i.page_number, i.measure_number, i.description,
             i.status, i.created_at,
             mp.title as music_piece_title
      FROM issues i
      LEFT JOIN music_pieces mp ON mp.id = i.music_piece_id
      WHERE i.reporter_id = ?
      ORDER BY i.created_at DESC
    `).all(userId),

    notificationPreferences: db.prepare(`
      SELECT * FROM notification_preferences WHERE user_id = ?
    `).get(userId),

    seatingPreferences: db.prepare(`
      SELECT sp.id, sp.preference_type, sp.created_at,
             u.first_name || ' ' || u.last_name as neighbor_name
      FROM seating_preferences sp
      LEFT JOIN users u ON u.id = sp.neighbor_user_id
      WHERE sp.user_id = ?
    `).all(userId),
  };

  // Remove sensitive data
  if (userData.profile) {
    delete (userData.profile as any).password_hash;
    delete (userData.profile as any).mfa_secret;
    delete (userData.profile as any).microsoft_id;
  }

  if (format === 'zip') {
    // Create ZIP archive
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="gdpr-export-${userId}-${Date.now()}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    // Add main data file
    archive.append(JSON.stringify(userData, null, 2), { name: 'data.json' });

    // Add README
    archive.append(`
GDPR Data Export
================

This archive contains all personal data stored about you in the Harmonie Music App.

Files included:
- data.json: All your personal data in JSON format

Data categories:
- Profile: Your account information
- Instruments: Instruments you play
- Orchestras: Orchestras you belong to
- Sessions: Your login sessions
- Favorites: Music you've favorited
- Practice History: Your practice sessions
- Activity Log: Your viewing/download activity
- Annotations: Your PDF annotations
- Audio Recordings: Your recorded practice sessions
- Reported Issues: Issues you've reported
- Preferences: Your notification and seating preferences

Export Date: ${new Date().toISOString()}

For questions about your data, contact your association administrator.
    `.trim(), { name: 'README.txt' });

    await archive.finalize();
  } else {
    // Return JSON directly
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="gdpr-export-${userId}-${Date.now()}.json"`);
    res.json(userData);
  }

  logger.info(`GDPR data export completed for user ${userId}`);
}));

/**
 * @swagger
 * /gdpr/delete-request:
 *   post:
 *     summary: Request account deletion (GDPR right to be forgotten)
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Deletion request submitted
 */
router.post('/delete-request', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  // Create deletion request (actual deletion requires admin approval)
  const existing = db.prepare(
    'SELECT id FROM deletion_requests WHERE user_id = ? AND status = ?'
  ).get(userId, 'pending');

  if (existing) {
    return res.json({
      message: 'You already have a pending deletion request.',
      requestId: existing.id,
    });
  }

  const requestId = crypto.randomUUID();

  // Check if table exists, create if not
  db.exec(`
    CREATE TABLE IF NOT EXISTS deletion_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME,
      processed_by TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.prepare(`
    INSERT INTO deletion_requests (id, user_id, reason)
    VALUES (?, ?, ?)
  `).run(requestId, userId, req.body.reason || null);

  logger.info(`GDPR deletion request submitted by user ${userId}`);

  res.json({
    message: 'Your deletion request has been submitted. An administrator will process it within 30 days.',
    requestId,
  });
}));

export default router;
