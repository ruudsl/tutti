import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import { ipWhitelistMiddleware } from '../middleware/ipWhitelist';
import db from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

const router = Router();

// All audit log routes require admin role and IP whitelist check
router.use(authenticateToken, requireRole('admin'), ipWhitelistMiddleware);

// Get audit logs with filters and pagination
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 25,
      action,
      entityType,
      userId,
      dateFrom,
      dateTo,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(pageSize as string, 10) || 25));
    const offset = (pageNum - 1) * limit;

    // Build WHERE clause
    const conditions: string[] = ['1=1'];
    const params: (string | number)[] = [];

    if (action) {
      conditions.push('al.action = ?');
      params.push(action as string);
    }

    if (entityType) {
      conditions.push('al.entity_type = ?');
      params.push(entityType as string);
    }

    if (userId) {
      conditions.push('al.user_id = ?');
      params.push(userId as string);
    }

    if (dateFrom) {
      conditions.push('al.created_at >= ?');
      params.push(dateFrom as string);
    }

    if (dateTo) {
      conditions.push('al.created_at <= ?');
      // Add time to include the whole day
      params.push((dateTo as string) + ' 23:59:59');
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as count
      FROM audit_logs al
      WHERE ${whereClause}
    `;
    const countResult = db.prepare(countQuery).get(...params) as { count: number };
    const total = countResult?.count || 0;

    // Get logs
    const logsQuery = `
      SELECT
        al.id,
        al.user_id as userId,
        u.first_name || ' ' || u.last_name as userName,
        al.action,
        al.entity_type as entityType,
        al.entity_id as entityId,
        al.entity_name as entityName,
        al.changes,
        al.ip_address as ipAddress,
        al.user_agent as userAgent,
        al.created_at as createdAt
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const logs = db.prepare(logsQuery).all(...params, limit, offset);

    res.json({
      logs,
      total,
      page: pageNum,
      pageSize: limit,
    });
  } catch (error) {
    logger.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

export default router;

// Helper function to log audit events (used by other routes)
export function logAuditEvent(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  entityName?: string,
  changes?: object,
  ipAddress?: string,
  userAgent?: string
) {
  try {
    const id = uuidv4();
    const changesJson = changes ? JSON.stringify(changes) : null;

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, entity_name, changes, ip_address, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(id, userId, action, entityType, entityId, entityName, changesJson, ipAddress, userAgent);

    logger.info(`Audit: ${action} ${entityType} ${entityId} by user ${userId}`);
  } catch (error) {
    logger.error('Failed to log audit event:', error);
  }
}
