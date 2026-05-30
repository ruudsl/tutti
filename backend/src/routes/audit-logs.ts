import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import { ipWhitelistMiddleware } from '../middleware/ipWhitelist';
import { asyncHandler } from '../middleware/errorHandler';
import db from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

const router = Router();

/**
 * Represents a single field change with before/after values
 */
export interface FieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Detailed changes object for audit logging
 */
export interface AuditChanges {
  fields?: FieldChange[];
  metadata?: Record<string, unknown>;
}

// All audit log routes require admin role and IP whitelist check
router.use(authenticateToken, requireRole('admin'), ipWhitelistMiddleware);

/**
 * @swagger
 * /audit-logs:
 *   get:
 *     summary: Get audit logs with filters and pagination
 *     tags: [Audit Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 25
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum: [create, update, delete, login, logout, upload]
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Paginated list of audit logs
 */
router.get('/', asyncHandler(async (req, res) => {
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

    // Parse changes JSON for display
    const logsWithParsedChanges = (logs as any[]).map(log => ({
      ...log,
      changes: log.changes ? JSON.parse(log.changes) : null,
    }));

    res.json({
      logs: logsWithParsedChanges,
      total,
      page: pageNum,
      pageSize: limit,
    });
}));

export default router;

/**
 * Compare two objects and return field-level changes
 * @param oldData The original object state
 * @param newData The new object state
 * @param fieldsToTrack Optional list of fields to track (tracks all if not specified)
 * @returns Array of field changes
 */
export function computeFieldChanges(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  fieldsToTrack?: string[]
): FieldChange[] {
  const changes: FieldChange[] = [];
  // Get unique fields from both old and new data
  const allFields: string[] = [];
  const seen: Record<string, boolean> = {};
  for (const key of Object.keys(oldData)) {
    if (!seen[key]) {
      allFields.push(key);
      seen[key] = true;
    }
  }
  for (const key of Object.keys(newData)) {
    if (!seen[key]) {
      allFields.push(key);
      seen[key] = true;
    }
  }
  const fields = fieldsToTrack ?? allFields;

  for (const field of fields) {
    const oldValue = oldData[field];
    const newValue = newData[field];

    // Skip if values are equal (using JSON stringify for deep comparison)
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
      continue;
    }

    // Mask sensitive fields
    const sensitiveFields = ['password', 'passwordHash', 'token', 'secret', 'apiKey'];
    if (sensitiveFields.includes(field.toLowerCase())) {
      changes.push({
        field,
        oldValue: oldValue !== undefined ? '[REDACTED]' : undefined,
        newValue: newValue !== undefined ? '[REDACTED]' : undefined,
      });
    } else {
      changes.push({
        field,
        oldValue,
        newValue,
      });
    }
  }

  return changes;
}

/**
 * Log audit event with field-level change tracking
 * @param userId The user performing the action
 * @param action The action type (create, update, delete, etc.)
 * @param entityType The type of entity being modified
 * @param entityId The ID of the entity
 * @param entityName Optional human-readable name of the entity
 * @param changes The changes object (can include field-level changes)
 * @param ipAddress Optional IP address of the request
 * @param userAgent Optional user agent of the request
 */
export function logAuditEvent(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  entityName?: string,
  changes?: AuditChanges | object,
  ipAddress?: string,
  userAgent?: string
): void {
  try {
    const id = uuidv4();
    const changesJson = changes ? JSON.stringify(changes) : null;

    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, entity_name, changes, ip_address, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(id, userId, action, entityType, entityId, entityName, changesJson, ipAddress, userAgent);

    logger.info(`Audit: ${action} ${entityType} ${entityId} by user ${userId}`, {
      hasFieldChanges: !!(changes as AuditChanges)?.fields?.length,
      changeCount: (changes as AuditChanges)?.fields?.length ?? 0,
    });
  } catch (error) {
    logger.error('Failed to log audit event:', error);
  }
}

/**
 * Log an update action with automatic field-level change tracking
 * @param userId The user performing the update
 * @param entityType The type of entity being updated
 * @param entityId The ID of the entity
 * @param entityName Optional human-readable name of the entity
 * @param oldData The original state of the entity
 * @param newData The new state of the entity
 * @param fieldsToTrack Optional list of fields to track
 * @param ipAddress Optional IP address of the request
 * @param userAgent Optional user agent of the request
 */
export function logAuditUpdate(
  userId: string,
  entityType: string,
  entityId: string,
  entityName: string | undefined,
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  fieldsToTrack?: string[],
  ipAddress?: string,
  userAgent?: string
): void {
  const fieldChanges = computeFieldChanges(oldData, newData, fieldsToTrack);

  // Only log if there are actual changes
  if (fieldChanges.length === 0) {
    logger.debug(`No changes detected for ${entityType} ${entityId}, skipping audit log`);
    return;
  }

  const changes: AuditChanges = {
    fields: fieldChanges,
    metadata: {
      trackedFields: fieldsToTrack ?? 'all',
      changeCount: fieldChanges.length,
    },
  };

  logAuditEvent(userId, 'update', entityType, entityId, entityName, changes, ipAddress, userAgent);
}
