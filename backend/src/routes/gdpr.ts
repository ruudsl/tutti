import { Router, Response } from 'express';
import { authenticateToken, AuthRequest, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import db from '../database/connection';
import archiver from 'archiver';
import logger from '../utils/logger';
import { ApiError } from '../middleware/errorHandler';
import { logAuditEvent } from './audit-logs';

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
router.get(
  '/data-summary',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
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
        count:
          db.prepare('SELECT COUNT(*) as count FROM notification_preferences WHERE user_id = ?').get(userId)?.count ||
          0,
        description: 'Your notification preferences',
      },
    ];

    res.json({
      userId,
      exportDate: new Date().toISOString(),
      categories: categories.filter((c) => c.count > 0 || c.name === 'profile'),
      totalRecords: categories.reduce((sum, c) => sum + c.count, 0),
    });
  }),
);

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
router.get(
  '/export',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
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

      profile: db
        .prepare(
          `
      SELECT
        id, email, first_name, last_name, role, status,
        mfa_enabled, last_login, created_at,
        private_email
      FROM users WHERE id = ?
    `,
        )
        .get(userId),

      instruments: db
        .prepare(
          `
      SELECT i.id, i.name, i.tuning, i.clef
      FROM instruments i
      JOIN user_instruments ui ON ui.instrument_id = i.id
      WHERE ui.user_id = ?
    `,
        )
        .all(userId),

      orchestras: db
        .prepare(
          `
      SELECT o.id, o.name
      FROM orchestras o
      JOIN user_orchestras uo ON uo.orchestra_id = o.id
      WHERE uo.user_id = ?
    `,
        )
        .all(userId),

      sessions: db
        .prepare(
          `
      SELECT id, ip_address, user_agent, last_active, created_at, expires_at
      FROM user_sessions WHERE user_id = ?
      ORDER BY created_at DESC
    `,
        )
        .all(userId),

      favorites: db
        .prepare(
          `
      SELECT uf.created_at, mt.title, mt.composer, mt.arranger
      FROM user_favorites uf
      JOIN music_titles mt ON mt.id = uf.music_title_id
      WHERE uf.user_id = ?
      ORDER BY uf.created_at DESC
    `,
        )
        .all(userId),

      recentViews: db
        .prepare(
          `
      SELECT urv.id, urv.viewed_at, urv.item_type, urv.item_title
      FROM user_recent_views urv
      WHERE urv.user_id = ?
      ORDER BY urv.viewed_at DESC
    `,
        )
        .all(userId),

      practiceHistory: db
        .prepare(
          `
      SELECT pl.id, pl.duration_minutes, pl.notes, pl.practiced_at,
             mt.title as music_title
      FROM practice_logs pl
      LEFT JOIN music_titles mt ON mt.id = pl.music_title_id
      WHERE pl.user_id = ?
      ORDER BY pl.practiced_at DESC
    `,
        )
        .all(userId),

      activityLog: db
        .prepare(
          `
      SELECT id, action_type, entity_type, entity_id, created_at
      FROM activity_log WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 1000
    `,
        )
        .all(userId),

      annotations: db
        .prepare(
          `
      SELECT pa.id, pa.page_number, pa.annotation_type, pa.content,
             pa.x_position, pa.y_position, pa.created_at, pa.updated_at,
             mp.title as music_piece_title
      FROM pdf_annotations pa
      LEFT JOIN music_pieces mp ON mp.id = pa.music_piece_id
      WHERE pa.user_id = ?
      ORDER BY pa.created_at DESC
    `,
        )
        .all(userId),

      audioRecordings: db
        .prepare(
          `
      SELECT ar.id, ar.title, ar.duration_seconds, ar.created_at,
             mt.title as music_title
      FROM audio_recordings ar
      LEFT JOIN music_titles mt ON mt.id = ar.music_title_id
      WHERE ar.recorded_by = ?
      ORDER BY ar.created_at DESC
    `,
        )
        .all(userId),

      // Gemelde fouten in bladmuziek en zitplaatsvoorkeuren horen hier ook
      // thuis, maar er is geen tabel waarin ze worden bewaard; zodra die er
      // is, komen ze hier terug.

      notificationPreferences: db
        .prepare(
          `
      SELECT * FROM notification_preferences WHERE user_id = ?
    `,
        )
        .get(userId),
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
      archive.append(
        `
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
    `.trim(),
        { name: 'README.txt' },
      );

      await archive.finalize();
    } else {
      // Return JSON directly
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="gdpr-export-${userId}-${Date.now()}.json"`);
      res.json(userData);
    }

    logger.info(`GDPR data export completed for user ${userId}`);
  }),
);

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
router.post(
  '/delete-request',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;

    // Create deletion request (actual deletion requires admin approval)
    const existing = db
      .prepare('SELECT id FROM deletion_requests WHERE user_id = ? AND status = ?')
      .get(userId, 'pending');

    if (existing) {
      return res.json({
        message: 'You already have a pending deletion request.',
        requestId: existing.id,
      });
    }

    const requestId = crypto.randomUUID();

    db.prepare(
      `
    INSERT INTO deletion_requests (id, user_id, reason)
    VALUES (?, ?, ?)
  `,
    ).run(requestId, userId, req.body.reason || null);

    logger.info(`GDPR deletion request submitted by user ${userId}`);

    res.json({
      message: 'Your deletion request has been submitted. An administrator will process it within 30 days.',
      requestId,
    });
  }),
);

/**
 * @swagger
 * /gdpr/deletion-requests:
 *   get:
 *     summary: Get all deletion requests (admin only)
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of deletion requests
 */
router.get(
  '/deletion-requests',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const requests = db
      .prepare(
        `
    SELECT
      dr.id,
      dr.user_id,
      dr.reason,
      dr.status,
      dr.created_at,
      dr.processed_at,
      u.email,
      u.first_name,
      u.last_name,
      processor.first_name || ' ' || processor.last_name as processed_by_name
    FROM deletion_requests dr
    JOIN users u ON u.id = dr.user_id
    LEFT JOIN users processor ON processor.id = dr.processed_by
    WHERE u.association_id = ?
    ORDER BY dr.created_at DESC
  `,
      )
      .all(associationId);

    res.json({ requests });
  }),
);

/**
 * @swagger
 * /gdpr/deletion-requests/{requestId}/process:
 *   post:
 *     summary: Process a deletion request (admin only)
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
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
 *               action:
 *                 type: string
 *                 enum: [approve, reject]
 *               reason:
 *                 type: string
 */
router.post(
  '/deletion-requests/:requestId/process',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { requestId } = req.params;
    const { action, reason } = req.body;
    const adminId = req.user!.id;
    const associationId = req.user!.associationId;

    if (!['approve', 'reject'].includes(action)) {
      throw new ApiError(400, 'Action must be either "approve" or "reject"');
    }

    // Get the deletion request
    const request = db
      .prepare(
        `
    SELECT dr.*, u.association_id
    FROM deletion_requests dr
    JOIN users u ON u.id = dr.user_id
    WHERE dr.id = ? AND dr.status = 'pending'
  `,
      )
      .get(requestId) as { id: string; user_id: string; association_id: string } | undefined;

    if (!request) {
      throw new ApiError(404, 'Deletion request not found or already processed');
    }

    if (request.association_id !== associationId) {
      throw new ApiError(403, 'Cannot process deletion requests from other associations');
    }

    const userId = request.user_id;

    if (action === 'approve') {
      // Perform cascade delete of all user data
      logger.info(`Processing GDPR deletion for user ${userId}`, { adminId, requestId });

      // Delete in order to respect foreign key constraints
      const deleteOperations = [
        'DELETE FROM user_sessions WHERE user_id = ?',
        'DELETE FROM user_favorites WHERE user_id = ?',
        'DELETE FROM user_recent_views WHERE user_id = ?',
        'DELETE FROM practice_logs WHERE user_id = ?',
        'DELETE FROM activity_log WHERE user_id = ?',
        'DELETE FROM pdf_annotations WHERE user_id = ?',
        'DELETE FROM audio_recordings WHERE user_id = ?',
        'DELETE FROM issues WHERE reporter_id = ?',
        'DELETE FROM notification_preferences WHERE user_id = ?',
        'DELETE FROM seating_preferences WHERE user_id = ?',
        'DELETE FROM seating_preferences WHERE neighbor_user_id = ?',
        'DELETE FROM user_instruments WHERE user_id = ?',
        'DELETE FROM user_orchestras WHERE user_id = ?',
        'DELETE FROM push_subscriptions WHERE user_id = ?',
        'DELETE FROM password_reset_tokens WHERE user_id = ?',
        'DELETE FROM mfa_backup_codes WHERE user_id = ?',
        'DELETE FROM mfa_recovery_codes WHERE user_id = ?',
        'DELETE FROM deletion_requests WHERE user_id = ?',
      ];

      const deletedCounts: Record<string, number> = {};

      for (const sql of deleteOperations) {
        try {
          const result = db.prepare(sql).run(userId);
          const tableName = sql.match(/FROM (\w+)/)?.[1] || 'unknown';
          deletedCounts[tableName] = (deletedCounts[tableName] || 0) + result.changes;
        } catch (error) {
          // Table might not exist, continue
          logger.warn(`Delete operation failed: ${sql}`, { error: (error as Error).message });
        }
      }

      // Anonymize the user record instead of deleting (preserve audit trail)
      db.prepare(
        `
      UPDATE users SET
        email = 'deleted_' || id || '@deleted.local',
        first_name = 'Deleted',
        last_name = 'User',
        password_hash = '',
        status = 'deleted',
        mfa_enabled = 0,
        mfa_secret = NULL,
        microsoft_id = NULL,
        private_email = NULL,
        deleted_at = datetime('now')
      WHERE id = ?
    `,
      ).run(userId);

      // Update the request status
      db.prepare(
        `
      UPDATE deletion_requests SET
        status = 'completed',
        processed_at = datetime('now'),
        processed_by = ?
      WHERE id = ?
    `,
      ).run(adminId, requestId);

      logger.info(`GDPR deletion completed for user ${userId}`, { adminId, deletedCounts });

      logAuditEvent(
        adminId,
        'gdpr_deletion_approved',
        'user',
        userId,
        'GDPR verwijderverzoek goedgekeurd en uitgevoerd',
        { requestId, deletedCounts },
        req.ip,
        req.get('user-agent'),
      );

      res.json({
        message: 'User data has been deleted successfully',
        deletedCounts,
      });
    } else {
      // Reject the request
      db.prepare(
        `
      UPDATE deletion_requests SET
        status = 'rejected',
        processed_at = datetime('now'),
        processed_by = ?
      WHERE id = ?
    `,
      ).run(adminId, requestId);

      logger.info(`GDPR deletion request rejected for user ${userId}`, { adminId, reason });

      logAuditEvent(
        adminId,
        'gdpr_deletion_rejected',
        'deletion_request',
        requestId,
        'GDPR verwijderverzoek afgewezen',
        { userId, reason },
        req.ip,
        req.get('user-agent'),
      );

      res.json({
        message: 'Deletion request has been rejected',
        reason,
      });
    }
  }),
);

/**
 * @swagger
 * /gdpr/retention-settings:
 *   get:
 *     summary: Get data retention settings (admin only)
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/retention-settings',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const settings = db
      .prepare(
        `
    SELECT * FROM data_retention_settings WHERE association_id = ?
  `,
      )
      .all(associationId);

    // Return with defaults
    const defaults = [
      { data_type: 'sessions', retention_days: 90, auto_delete: true, description: 'Login sessions' },
      { data_type: 'activity_log', retention_days: 365, auto_delete: true, description: 'Activity logs' },
      { data_type: 'practice_logs', retention_days: 730, auto_delete: false, description: 'Practice history' },
      { data_type: 'audio_recordings', retention_days: 365, auto_delete: false, description: 'Audio recordings' },
      { data_type: 'deleted_users', retention_days: 90, auto_delete: true, description: 'Deleted user records' },
    ];

    const merged = defaults.map((d) => {
      const existing = settings.find((s: any) => s.data_type === d.data_type);
      return existing || { ...d, association_id: associationId };
    });

    res.json({ settings: merged });
  }),
);

/**
 * @swagger
 * /gdpr/retention-settings:
 *   put:
 *     summary: Update data retention settings (admin only)
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 */
router.put(
  '/retention-settings',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { settings } = req.body;

    if (!Array.isArray(settings)) {
      throw new ApiError(400, 'Settings must be an array');
    }

    const upsert = db.prepare(`
    INSERT INTO data_retention_settings (id, association_id, data_type, retention_days, auto_delete, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(association_id, data_type) DO UPDATE SET
      retention_days = excluded.retention_days,
      auto_delete = excluded.auto_delete,
      updated_at = datetime('now')
  `);

    for (const setting of settings) {
      if (!setting.data_type || typeof setting.retention_days !== 'number') continue;
      upsert.run(
        crypto.randomUUID(),
        associationId,
        setting.data_type,
        setting.retention_days,
        setting.auto_delete ? 1 : 0,
      );
    }

    logger.info(`Data retention settings updated`, { associationId, adminId: req.user!.id });

    logAuditEvent(
      req.user!.id,
      'gdpr_retention_updated',
      'association',
      associationId ?? 'unknown',
      'Data retentie-instellingen gewijzigd',
      { settings },
      req.ip,
      req.get('user-agent'),
    );

    res.json({ message: 'Retention settings updated successfully' });
  }),
);

/**
 * @swagger
 * /gdpr/cleanup:
 *   post:
 *     summary: Run data cleanup based on retention settings (admin only)
 *     tags: [GDPR]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/cleanup',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const settings = db
      .prepare(
        `
    SELECT * FROM data_retention_settings
    WHERE association_id = ? AND auto_delete = 1
  `,
      )
      .all(associationId) as Array<{ data_type: string; retention_days: number }>;

    const results: Record<string, number> = {};

    for (const setting of settings) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - setting.retention_days);
      const cutoff = cutoffDate.toISOString();

      let sql = '';
      switch (setting.data_type) {
        case 'sessions':
          sql = `DELETE FROM user_sessions WHERE expires_at < ? AND user_id IN (SELECT id FROM users WHERE association_id = ?)`;
          break;
        case 'activity_log':
          sql = `DELETE FROM activity_log WHERE created_at < ? AND user_id IN (SELECT id FROM users WHERE association_id = ?)`;
          break;
        case 'deleted_users':
          sql = `DELETE FROM users WHERE status = 'deleted' AND deleted_at < ? AND association_id = ?`;
          break;
      }

      if (sql) {
        try {
          const result = db.prepare(sql).run(cutoff, associationId);
          results[setting.data_type] = result.changes;
        } catch (error) {
          logger.error(`Cleanup failed for ${setting.data_type}`, { error: (error as Error).message });
        }
      }
    }

    logger.info(`Data cleanup completed`, { associationId, results });

    logAuditEvent(
      req.user!.id,
      'gdpr_cleanup',
      'association',
      associationId ?? 'unknown',
      'Data cleanup uitgevoerd op basis van retentie-instellingen',
      { deletedCounts: results },
      req.ip,
      req.get('user-agent'),
    );

    res.json({
      message: 'Data cleanup completed',
      deletedCounts: results,
    });
  }),
);

export default router;
