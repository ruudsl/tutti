/**
 * GDPR Data Retention Cleanup Scheduler
 *
 * Automatically removes expired data based on retention settings.
 * Runs daily at a configured time (default: 3:00 AM).
 */

import db from '../database/connection';
import logger from '../utils/logger';

// Run cleanup check every hour
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

// Default cleanup hour (3 AM)
const DEFAULT_CLEANUP_HOUR = 3;

let schedulerRunning = false;
let timeoutHandle: NodeJS.Timeout | null = null;
let lastCleanupDate: string | null = null;

interface RetentionSetting {
  association_id: string;
  data_type: string;
  retention_days: number;
  auto_delete: number;
}

interface CleanupResult {
  association_id: string;
  data_type: string;
  deleted_count: number;
}

/**
 * Perform cleanup for a specific data type and association
 */
function cleanupDataType(
  associationId: string,
  dataType: string,
  retentionDays: number
): number {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoff = cutoffDate.toISOString();

  let deletedCount = 0;

  try {
    switch (dataType) {
      case 'sessions': {
        const result = db.prepare(`
          DELETE FROM user_sessions
          WHERE expires_at < ?
          AND user_id IN (SELECT id FROM users WHERE association_id = ?)
        `).run(cutoff, associationId);
        deletedCount = result.changes;
        break;
      }

      case 'activity_log': {
        const result = db.prepare(`
          DELETE FROM activity_log
          WHERE created_at < ?
          AND user_id IN (SELECT id FROM users WHERE association_id = ?)
        `).run(cutoff, associationId);
        deletedCount = result.changes;
        break;
      }

      case 'audit_logs': {
        const result = db.prepare(`
          DELETE FROM audit_logs
          WHERE created_at < ?
          AND user_id IN (SELECT id FROM users WHERE association_id = ?)
        `).run(cutoff, associationId);
        deletedCount = result.changes;
        break;
      }

      case 'practice_logs': {
        const result = db.prepare(`
          DELETE FROM practice_logs
          WHERE ended_at < ?
          AND user_id IN (SELECT id FROM users WHERE association_id = ?)
        `).run(cutoff, associationId);
        deletedCount = result.changes;
        break;
      }

      case 'audio_recordings': {
        const result = db.prepare(`
          DELETE FROM audio_recordings
          WHERE created_at < ?
          AND user_id IN (SELECT id FROM users WHERE association_id = ?)
        `).run(cutoff, associationId);
        deletedCount = result.changes;
        break;
      }

      case 'deleted_users': {
        const result = db.prepare(`
          DELETE FROM users
          WHERE status = 'deleted'
          AND updated_at < ?
          AND association_id = ?
        `).run(cutoff, associationId);
        deletedCount = result.changes;
        break;
      }

      case 'password_reset_tokens': {
        const result = db.prepare(`
          DELETE FROM password_reset_tokens
          WHERE expires_at < ?
          AND user_id IN (SELECT id FROM users WHERE association_id = ?)
        `).run(cutoff, associationId);
        deletedCount = result.changes;
        break;
      }

      case 'recent_views': {
        const result = db.prepare(`
          DELETE FROM user_recent_views
          WHERE viewed_at < ?
          AND user_id IN (SELECT id FROM users WHERE association_id = ?)
        `).run(cutoff, associationId);
        deletedCount = result.changes;
        break;
      }

      default:
        logger.warn(`Unknown data type for GDPR cleanup: ${dataType}`);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`GDPR cleanup failed for ${dataType}`, {
      associationId,
      error: errorMsg
    });
  }

  return deletedCount;
}

/**
 * Run the cleanup for all associations with auto_delete enabled
 */
async function runCleanup(): Promise<CleanupResult[]> {
  const results: CleanupResult[] = [];

  try {
    // Ensure retention settings table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS data_retention_settings (
        id TEXT PRIMARY KEY,
        association_id TEXT NOT NULL,
        data_type TEXT NOT NULL,
        retention_days INTEGER NOT NULL,
        auto_delete INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(association_id, data_type)
      )
    `);

    // Get all settings with auto_delete enabled
    const settings = db.prepare(`
      SELECT * FROM data_retention_settings
      WHERE auto_delete = 1 AND retention_days > 0
    `).all() as RetentionSetting[];

    for (const setting of settings) {
      const deletedCount = cleanupDataType(
        setting.association_id,
        setting.data_type,
        setting.retention_days
      );

      if (deletedCount > 0) {
        results.push({
          association_id: setting.association_id,
          data_type: setting.data_type,
          deleted_count: deletedCount,
        });
      }
    }

    // Also clean up global expired data (not association-specific)
    // Expired password reset tokens (older than 24 hours)
    try {
      const expiredTokens = db.prepare(`
        DELETE FROM password_reset_tokens WHERE expires_at < datetime('now')
      `).run();
      if (expiredTokens.changes > 0) {
        results.push({
          association_id: 'global',
          data_type: 'expired_tokens',
          deleted_count: expiredTokens.changes,
        });
      }
    } catch {
      // Table might not exist
    }

    // Expired sessions
    try {
      const expiredSessions = db.prepare(`
        DELETE FROM user_sessions WHERE expires_at < datetime('now')
      `).run();
      if (expiredSessions.changes > 0) {
        results.push({
          association_id: 'global',
          data_type: 'expired_sessions',
          deleted_count: expiredSessions.changes,
        });
      }
    } catch {
      // Table might not exist
    }

    // Log cleanup run
    if (results.length > 0) {
      const totalDeleted = results.reduce((sum, r) => sum + r.deleted_count, 0);
      logger.info('GDPR cleanup completed', {
        totalDeleted,
        details: results
      });
    }

    // Update last cleanup timestamp
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS gdpr_cleanup_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          records_deleted INTEGER,
          details TEXT
        )
      `);

      db.prepare(`
        INSERT INTO gdpr_cleanup_log (records_deleted, details)
        VALUES (?, ?)
      `).run(
        results.reduce((sum, r) => sum + r.deleted_count, 0),
        JSON.stringify(results)
      );

      // Keep only last 30 days of cleanup logs
      db.prepare(`
        DELETE FROM gdpr_cleanup_log
        WHERE run_at < datetime('now', '-30 days')
      `).run();
    } catch (error) {
      logger.warn('Failed to log GDPR cleanup', { error });
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('GDPR cleanup scheduler error', { error: errorMsg });
  }

  return results;
}

/**
 * Check if cleanup should run (once per day at configured hour)
 */
async function checkAndRunCleanup(): Promise<void> {
  if (!schedulerRunning) return;

  const now = new Date();
  const currentHour = now.getHours();
  const today = now.toISOString().split('T')[0];

  // Run cleanup at the configured hour, but only once per day
  const cleanupHour = parseInt(process.env.GDPR_CLEANUP_HOUR || '') || DEFAULT_CLEANUP_HOUR;

  if (currentHour === cleanupHour && lastCleanupDate !== today) {
    logger.info('Starting scheduled GDPR cleanup');
    lastCleanupDate = today;
    await runCleanup();
  }

  // Schedule next check
  if (schedulerRunning) {
    timeoutHandle = setTimeout(checkAndRunCleanup, CHECK_INTERVAL_MS);
  }
}

/**
 * Start the GDPR cleanup scheduler
 */
export function startScheduler(): void {
  if (schedulerRunning) {
    logger.warn('GDPR cleanup scheduler already running');
    return;
  }

  schedulerRunning = true;
  logger.info('GDPR cleanup scheduler started', {
    cleanupHour: process.env.GDPR_CLEANUP_HOUR || DEFAULT_CLEANUP_HOUR
  });

  // Start checking after a short delay
  timeoutHandle = setTimeout(checkAndRunCleanup, 10000);
}

/**
 * Stop the GDPR cleanup scheduler
 */
export function stopScheduler(): void {
  schedulerRunning = false;
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
  logger.info('GDPR cleanup scheduler stopped');
}

/**
 * Manually trigger cleanup (for API endpoint)
 */
export async function triggerCleanup(): Promise<CleanupResult[]> {
  logger.info('Manual GDPR cleanup triggered');
  return runCleanup();
}

/**
 * Get cleanup history
 */
export function getCleanupHistory(limit = 10): Array<{
  run_at: string;
  records_deleted: number;
  details: string;
}> {
  try {
    return db.prepare(`
      SELECT run_at, records_deleted, details
      FROM gdpr_cleanup_log
      ORDER BY run_at DESC
      LIMIT ?
    `).all(limit) as Array<{
      run_at: string;
      records_deleted: number;
      details: string;
    }>;
  } catch {
    return [];
  }
}
