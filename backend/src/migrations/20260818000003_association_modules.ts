/**
 * Migration: modules aan/uit per vereniging
 * Created at: 2026-08-18
 *
 * Een beheerder kan losse modules uitzetten om het aanbod in te dammen. De
 * tabel bevat alleen afwijkingen van de standaard uit
 * backend/src/modules/registry.ts; geen rij betekent dat de standaard geldt.
 *
 * Uitzetten verbergt en verwijdert niets: de gegevens van een uitgezette
 * module blijven ongewijzigd staan en komen bij aanzetten weer tevoorschijn.
 */

import db from '../database/connection';
import logger from '../utils/logger';

export const up = (): void => {
  logger.info('Running migration: association_modules (up)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS association_modules (
        id TEXT PRIMARY KEY,
        association_id TEXT NOT NULL,
        module_key TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_by TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE(association_id, module_key)
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_association_modules_association ON association_modules(association_id)');

  logger.info('Migration completed: association_modules');
};

export const down = (): void => {
  logger.info('Running migration: association_modules (down)');

  db.exec('DROP TABLE IF EXISTS association_modules');

  logger.info('Rollback completed: association_modules');
};
