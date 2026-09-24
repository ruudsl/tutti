/**
 * GDPR Data Retention Cleanup Scheduler
 *
 * Automatically removes expired data based on retention settings.
 * Runs daily at a configured time (default: 3:00 AM).
 */

import path from 'path';
import fs from 'fs';
import db from '../database/connection';
import logger from '../utils/logger';

// Default cleanup hour (3 AM)
const DEFAULT_CLEANUP_HOUR = 3;

// Days a soft-deleted row (users, music_pieces, music_titles, music_lists,
// concerts) is kept before it is hard-deleted, incl. associated files.
const DEFAULT_SOFT_DELETE_RETENTION_DAYS = 30;

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');

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
 * Wis leden definitief, één voor één.
 *
 * Een lid dat ergens nog naar verwezen wordt zonder ON DELETE (een
 * chatbericht, een factuur die hij aanmaakte; zie docs/PIA.md §6) laat zich
 * niet wissen. Met één DELETE voor alle leden tegelijk hield zo'n lid ook het
 * wissen van alle anderen tegen, op de hele installatie, en stond dat alleen
 * in het logboek. Nu blijft alleen dat ene lid staan, en zegt het logboek
 * welk lid.
 */
export function wisLeden(ids: string[]): { gewist: string[]; geblokkeerd: string[] } {
  const gewist: string[] = [];
  const geblokkeerd: string[] = [];
  const wis = db.prepare('DELETE FROM users WHERE id = ?');
  for (const id of ids) {
    try {
      if (wis.run(id).changes > 0) gewist.push(id);
    } catch (error) {
      geblokkeerd.push(id);
      logger.warn('Lid kan niet definitief gewist worden: er wordt nog naar verwezen', {
        userId: id,
        error: (error as Error).message,
      });
    }
  }
  return { gewist, geblokkeerd };
}

/**
 * Perform cleanup for a specific data type and association
 */
function cleanupDataType(associationId: string, dataType: string, retentionDays: number): number {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoff = cutoffDate.toISOString();

  let deletedCount = 0;

  try {
    switch (dataType) {
      case 'sessions': {
        const result = db
          .prepare(
            `
          DELETE FROM user_sessions
          WHERE expires_at < ?
          AND user_id IN (SELECT id FROM users WHERE association_id = ?)
        `,
          )
          .run(cutoff, associationId);
        deletedCount = result.changes;
        break;
      }

      case 'activity_log': {
        const result = db
          .prepare(
            `
          DELETE FROM activity_log
          WHERE created_at < ?
          AND user_id IN (SELECT id FROM users WHERE association_id = ?)
        `,
          )
          .run(cutoff, associationId);
        deletedCount = result.changes;
        break;
      }

      case 'audit_logs': {
        const result = db
          .prepare(
            `
          DELETE FROM audit_logs
          WHERE created_at < ?
          AND user_id IN (SELECT id FROM users WHERE association_id = ?)
        `,
          )
          .run(cutoff, associationId);
        deletedCount = result.changes;
        break;
      }

      case 'practice_logs': {
        const result = db
          .prepare(
            `
          DELETE FROM practice_logs
          WHERE practiced_at < ?
          AND user_id IN (SELECT id FROM users WHERE association_id = ?)
        `,
          )
          .run(cutoff, associationId);
        deletedCount = result.changes;
        break;
      }

      case 'audio_recordings': {
        const result = db
          .prepare(
            `
          DELETE FROM audio_recordings
          WHERE created_at < ?
          AND recorded_by IN (SELECT id FROM users WHERE association_id = ?)
        `,
          )
          .run(cutoff, associationId);
        deletedCount = result.changes;
        break;
      }

      case 'deleted_users': {
        const ids = (
          db
            .prepare("SELECT id FROM users WHERE status = 'deleted' AND deleted_at < ? AND association_id = ?")
            .all(cutoff, associationId) as { id: string }[]
        ).map(({ id }) => id);
        deletedCount = wisLeden(ids).gewist.length;
        break;
      }

      case 'password_reset_tokens': {
        const result = db
          .prepare(
            `
          DELETE FROM password_reset_tokens
          WHERE expires_at < ?
          AND user_id IN (SELECT id FROM users WHERE association_id = ?)
        `,
          )
          .run(cutoff, associationId);
        deletedCount = result.changes;
        break;
      }

      case 'recent_views': {
        const result = db
          .prepare(
            `
          DELETE FROM user_recent_views
          WHERE viewed_at < ?
          AND user_id IN (SELECT id FROM users WHERE association_id = ?)
        `,
          )
          .run(cutoff, associationId);
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
      error: errorMsg,
    });
  }

  return deletedCount;
}

/**
 * Delete a file on disk, ignoring errors (file may already be gone)
 */
function removeFileSafely(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`Purged file: ${filePath}`);
    }
  } catch (error) {
    logger.warn(`Failed to purge file: ${filePath}`, { error });
  }
}

/**
 * Purge (hard-delete) soft-deleted rows whose deleted_at is older than
 * SOFT_DELETE_RETENTION_DAYS (env, default 30), including associated files
 * such as music piece PDFs and user profile photos.
 */
export function purgeSoftDeleted(): CleanupResult[] {
  const results: CleanupResult[] = [];

  const retentionDays =
    parseInt(process.env.SOFT_DELETE_RETENTION_DAYS || '', 10) || DEFAULT_SOFT_DELETE_RETENTION_DAYS;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoff = cutoffDate.toISOString();

  // Music pieces: remove the PDF file along with the row
  try {
    const pieces = db
      .prepare('SELECT id, file_path FROM music_pieces WHERE deleted_at IS NOT NULL AND deleted_at < ?')
      .all(cutoff) as { id: string; file_path: string | null }[];

    if (pieces.length > 0) {
      db.prepare('DELETE FROM music_pieces WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(cutoff);
      for (const piece of pieces) {
        if (piece.file_path) {
          removeFileSafely(path.join(UPLOAD_DIR, piece.file_path));
        }
      }
      results.push({ association_id: 'global', data_type: 'purged_music_pieces', deleted_count: pieces.length });
    }
  } catch (error) {
    logger.error('Soft-delete purge failed for music_pieces', { error });
  }

  // Users: remove the profile photo along with the row
  try {
    const users = db
      .prepare('SELECT id, profile_photo_path FROM users WHERE deleted_at IS NOT NULL AND deleted_at < ?')
      .all(cutoff) as { id: string; profile_photo_path: string | null }[];

    if (users.length > 0) {
      const gewist = new Set(wisLeden(users.map(({ id }) => id)).gewist);
      for (const user of users) {
        if (gewist.has(user.id) && user.profile_photo_path) {
          removeFileSafely(path.resolve(user.profile_photo_path));
        }
      }
      if (gewist.size > 0) {
        results.push({ association_id: 'global', data_type: 'purged_users', deleted_count: gewist.size });
      }
    }
  } catch (error) {
    logger.error('Soft-delete purge failed for users', { error });
  }

  // Tables without associated files
  for (const table of ['music_titles', 'music_lists', 'concerts']) {
    try {
      const result = db.prepare(`DELETE FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < ?`).run(cutoff);
      if (result.changes > 0) {
        results.push({ association_id: 'global', data_type: `purged_${table}`, deleted_count: result.changes });
      }
    } catch (error) {
      logger.error(`Soft-delete purge failed for ${table}`, { error });
    }
  }

  if (results.length > 0) {
    logger.info('Soft-delete purge completed', {
      retentionDays,
      details: results,
    });
  }

  return results;
}

/**
 * Run the cleanup for all associations with auto_delete enabled
 */
export async function runCleanup(): Promise<CleanupResult[]> {
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
    const settings = db
      .prepare(
        `
      SELECT * FROM data_retention_settings
      WHERE auto_delete = 1 AND retention_days > 0
    `,
      )
      .all() as RetentionSetting[];

    for (const setting of settings) {
      const deletedCount = cleanupDataType(setting.association_id, setting.data_type, setting.retention_days);

      if (deletedCount > 0) {
        results.push({
          association_id: setting.association_id,
          data_type: setting.data_type,
          deleted_count: deletedCount,
        });
      }
    }

    // Purge soft-deleted rows past the retention window (incl. files)
    results.push(...purgeSoftDeleted());

    // Also clean up global expired data (not association-specific)
    // Expired password reset tokens (older than 24 hours)
    try {
      const expiredTokens = db
        .prepare(
          `
        DELETE FROM password_reset_tokens WHERE expires_at < datetime('now')
      `,
        )
        .run();
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
      const expiredSessions = db
        .prepare(
          `
        DELETE FROM user_sessions WHERE expires_at < datetime('now')
      `,
        )
        .run();
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
        details: results,
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

      db.prepare(
        `
        INSERT INTO gdpr_cleanup_log (records_deleted, details)
        VALUES (?, ?)
      `,
      ).run(
        results.reduce((sum, r) => sum + r.deleted_count, 0),
        JSON.stringify(results),
      );

      // Keep only last 30 days of cleanup logs
      db.prepare(
        `
        DELETE FROM gdpr_cleanup_log
        WHERE run_at < datetime('now', '-30 days')
      `,
      ).run();
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
 * Het uur waarop de dagelijkse opschoning draait (GDPR_CLEANUP_HOUR, standaard
 * 3 uur 's nachts). De taak zelf staat in src/taken/index.ts.
 */
export function opschoonUur(): number {
  return parseInt(process.env.GDPR_CLEANUP_HOUR || '') || DEFAULT_CLEANUP_HOUR;
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
    return db
      .prepare(
        `
      SELECT run_at, records_deleted, details
      FROM gdpr_cleanup_log
      ORDER BY run_at DESC
      LIMIT ?
    `,
      )
      .all(limit) as Array<{
      run_at: string;
      records_deleted: number;
      details: string;
    }>;
  } catch {
    return [];
  }
}
