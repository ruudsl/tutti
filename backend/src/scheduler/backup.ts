/**
 * Automated Database Backup
 *
 * Periodically copies the SQLite database file to a backup directory and
 * removes backups older than the configured retention period.
 *
 * Configuration (environment variables):
 * - BACKUP_ENABLED:         'false' disables the backup job (default: true)
 * - BACKUP_INTERVAL_HOURS:  hours between backups (default: 24)
 * - BACKUP_RETENTION_DAYS:  days to keep old backups (default: 14)
 * - BACKUP_PRE_RESTORE_RETENTION_DAYS: dagen dat de kopie van vóór een
 *                           terugzetting (pre-restore/) blijft staan (standaard: 30)
 * - BACKUP_DIR:             backup directory (default: 'backups/' next to the database)
 *
 * Versleuteling: staat ENCRYPTION_SECRET ingesteld, dan wordt elke kopie met
 * die sleutel versleuteld (AES-256-GCM, utils/encryption.ts) en krijgt hij de
 * extensie .sqlite.enc. Ontsleutelen voor een terugzetting:
 * `npm run backup:ontsleutel --workspace=backend -- <bestand>`. Zonder
 * ENCRYPTION_SECRET blijft de kopie leesbaar en staat er een waarschuwing in
 * het logboek; zie heeftEigenSleutel voor waarom JWT_SECRET hier niet telt.
 *
 * Alle kopieën worden geschreven met modus 0600: alleen het serverproces.
 */

import path from 'path';
import fs from 'fs';
import db from '../database/connection';
import logger from '../utils/logger';
import config from '../config';
import { heeftEigenSleutel, versleutelBuffer } from '../utils/encryption';
import { schrijfPriveBestand } from '../utils/priveBestand';

const DEFAULT_INTERVAL_HOURS = 24;
const DEFAULT_RETENTION_DAYS = 14;
const DEFAULT_PRE_RESTORE_RETENTION_DAYS = 30;

const BACKUP_FILE_PATTERN = /^tutti-backup-\d{4}-\d{2}-\d{2}-\d{4}\.sqlite(\.enc)?$/;
const PRE_RESTORE_FILE_PATTERN = /^pre-restore-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sqlite(\.enc)?$/;

/**
 * Resolve the backup directory: BACKUP_DIR env var, or 'backups/' next to the database file.
 */
export function getBackupDir(): string {
  return process.env.BACKUP_DIR || path.join(path.dirname(config.dbPath), 'backups');
}

export function isBackupEnabled(): boolean {
  return process.env.BACKUP_ENABLED !== 'false';
}

export function getIntervalHours(): number {
  const parsed = parseFloat(process.env.BACKUP_INTERVAL_HOURS || '');
  return parsed > 0 ? parsed : DEFAULT_INTERVAL_HOURS;
}

function getRetentionDays(): number {
  const parsed = parseFloat(process.env.BACKUP_RETENTION_DAYS || '');
  return parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
}

function getPreRestoreRetentionDays(): number {
  const parsed = parseFloat(process.env.BACKUP_PRE_RESTORE_RETENTION_DAYS || '');
  return parsed > 0 ? parsed : DEFAULT_PRE_RESTORE_RETENTION_DAYS;
}

/** Waar de kopie van vóór een terugzetting staat (routes/backup.ts). */
export function getPreRestoreDir(): string {
  return path.join(getBackupDir(), 'pre-restore');
}

/**
 * Schrijf een kopie van de database: versleuteld als er een eigen sleutel is,
 * en in elk geval alleen leesbaar voor het serverproces.
 *
 * @param basisPad - het pad zonder de extensie .enc; die komt erachter als de
 *   kopie versleuteld wordt.
 * @returns het pad van het geschreven bestand.
 */
export function schrijfDatabasekopie(basisPad: string, inhoud: Buffer): string {
  if (heeftEigenSleutel()) {
    const doel = `${basisPad}.enc`;
    schrijfPriveBestand(doel, versleutelBuffer(inhoud));
    return doel;
  }
  logger.warn(
    'Kopie van de database is niet versleuteld: stel ENCRYPTION_SECRET in om reservekopieën te versleutelen',
    { bestand: path.basename(basisPad) },
  );
  schrijfPriveBestand(basisPad, inhoud);
  return basisPad;
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
function cleanupOldBackups(
  backupDir: string,
  patroon = BACKUP_FILE_PATTERN,
  retentionDays = getRetentionDays(),
): number {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let removed = 0;

  try {
    if (!fs.existsSync(backupDir)) return 0;

    const files = fs.readdirSync(backupDir).filter((f) => patroon.test(f));
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

    // Lezen en zelf schrijven in plaats van copyFileSync: die neemt de modus
    // van het bronbestand over, en de kopie moet versleuteld kunnen worden.
    const filename = buildBackupFilename();
    const targetPath = schrijfDatabasekopie(path.join(backupDir, filename), fs.readFileSync(config.dbPath));
    logger.info(`Database backup created: ${targetPath}`);

    // Oude back-ups, en de kopieën van vóór een terugzetting. Die laatste
    // werden nooit opgeruimd en stapelden zich op: elke terugzetting een
    // volledige database erbij.
    const removed =
      cleanupOldBackups(backupDir) +
      cleanupOldBackups(getPreRestoreDir(), PRE_RESTORE_FILE_PATTERN, getPreRestoreRetentionDays());

    return { file: targetPath, removed };
  } catch (err) {
    logger.error('Scheduled database backup failed', { error: err });
    return { file: null, removed: 0 };
  }
}
