/**
 * Automated Database Backup Scheduler
 *
 * Periodically copies the SQLite database file to a backup directory and
 * removes backups older than the configured retention period.
 *
 * Configuration (environment variables):
 * - BACKUP_ENABLED:         'false' disables the scheduler (default: true)
 * - BACKUP_INTERVAL_HOURS:  hours between backups (default: 24)
 * - BACKUP_RETENTION_DAYS:  days to keep old backups (default: 14)
 * - BACKUP_DIR:             backup directory (default: 'backups/' next to the database)
 */

import path from 'path';
import fs from 'fs';
import db from '../database/connection';
import logger from '../utils/logger';
import config from '../config';

const DEFAULT_INTERVAL_HOURS = 24;
const DEFAULT_RETENTION_DAYS = 14;

// Short delay before the first backup after startup
const INITIAL_DELAY_MS = 60 * 1000;

const BACKUP_FILE_PATTERN = /^tutti-backup-\d{4}-\d{2}-\d{2}-\d{4}\.sqlite$/;

let schedulerRunning = false;
let backupTimer: NodeJS.Timeout | null = null;

/**
 * Resolve the backup directory: BACKUP_DIR env var, or 'backups/' next to the database file.
 */
export function getBackupDir(): string {
  return process.env.BACKUP_DIR || path.join(path.dirname(config.dbPath), 'backups');
}

function isBackupEnabled(): boolean {
  return process.env.BACKUP_ENABLED !== 'false';
}

function getIntervalHours(): number {
  const parsed = parseFloat(process.env.BACKUP_INTERVAL_HOURS || '');
  return parsed > 0 ? parsed : DEFAULT_INTERVAL_HOURS;
}

function getRetentionDays(): number {
  const parsed = parseFloat(process.env.BACKUP_RETENTION_DAYS || '');
  return parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
}

/**
 * Build a backup filename like tutti-backup-2026-07-05-0300.sqlite (local time).
 */
function buildBackupFilename(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `tutti-backup-${yyyy}-${mm}-${dd}-${hh}${min}.sqlite`;
}

/**
 * Delete backups older than the retention period.
 * Only touches files matching the backup filename pattern.
 */
function cleanupOldBackups(backupDir: string): number {
  const retentionDays = getRetentionDays();
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let removed = 0;

  try {
    if (!fs.existsSync(backupDir)) return 0;

    const files = fs.readdirSync(backupDir).filter((f) => BACKUP_FILE_PATTERN.test(f));
    for (const file of files) {
      const filePath = path.join(backupDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          removed++;
          logger.info(`Removed expired backup: ${file}`);
        }
      } catch (err) {
        logger.warn(`Failed to inspect/remove backup file ${file}`, { error: err });
      }
    }
  } catch (err) {
    logger.error('Backup retention cleanup failed', { error: err });
  }

  return removed;
}

/**
 * Perform a single backup run: flush pending writes, copy the database file,
 * and clean up expired backups.
 */
export function runBackup(): { file: string | null; removed: number } {
  const backupDir = getBackupDir();

  try {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Make sure the on-disk file reflects the latest in-memory state
    db.flush();

    if (!fs.existsSync(config.dbPath)) {
      logger.warn(`Backup skipped: database file not found at ${config.dbPath}`);
      return { file: null, removed: 0 };
    }

    const filename = buildBackupFilename();
    const targetPath = path.join(backupDir, filename);
    fs.copyFileSync(config.dbPath, targetPath);
    logger.info(`Database backup created: ${targetPath}`);

    const removed = cleanupOldBackups(backupDir);

    return { file: targetPath, removed };
  } catch (err) {
    logger.error('Scheduled database backup failed', { error: err });
    return { file: null, removed: 0 };
  }
}

function scheduleNextBackup(delayMs: number): void {
  if (!schedulerRunning) return;

  backupTimer = setTimeout(() => {
    backupTimer = null;
    if (!schedulerRunning) return;

    runBackup();
    scheduleNextBackup(getIntervalHours() * 60 * 60 * 1000);
  }, delayMs);

  if (typeof backupTimer.unref === 'function') {
    backupTimer.unref();
  }
}

/**
 * Start the backup scheduler
 */
export function startScheduler(): void {
  if (!isBackupEnabled()) {
    logger.info('Database backup scheduler disabled (BACKUP_ENABLED=false)');
    return;
  }

  if (schedulerRunning) {
    logger.warn('Database backup scheduler already running');
    return;
  }

  schedulerRunning = true;
  logger.info('Database backup scheduler started', {
    intervalHours: getIntervalHours(),
    retentionDays: getRetentionDays(),
    backupDir: getBackupDir(),
  });

  // First backup shortly after startup, then on the configured interval
  scheduleNextBackup(INITIAL_DELAY_MS);
}

/**
 * Stop the backup scheduler
 */
export function stopScheduler(): void {
  schedulerRunning = false;
  if (backupTimer) {
    clearTimeout(backupTimer);
    backupTimer = null;
  }
  logger.info('Database backup scheduler stopped');
}
