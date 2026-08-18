/**
 * Migration: ontbrekende kolommen voor datumpeilingen
 * Created at: 2026-08-18
 *
 * routes/polls.ts schrijft en leest vier kolommen die nooit zijn aangemaakt:
 * polls.is_date_poll, polls.auto_create_rehearsal, polls.target_orchestra_id
 * en poll_options.option_value. Daardoor faalde POST /api/polls met
 * "table polls has no column named is_date_poll" en was de hele
 * peilingen-module onbruikbaar.
 *
 * Verse installaties krijgen de kolommen via schema.ts; deze migratie voegt ze
 * toe aan bestaande databases.
 */

import db from '../database/connection';
import logger from '../utils/logger';

/** Voeg een kolom alleen toe wanneer die nog niet bestaat. */
function addColumnIfMissing(table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    logger.info(`Added column ${table}.${column}`);
  }
}

export const up = (): void => {
  logger.info('Running migration: poll_date_columns (up)');

  addColumnIfMissing('polls', 'is_date_poll', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('polls', 'auto_create_rehearsal', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('polls', 'target_orchestra_id', 'TEXT DEFAULT NULL');
  addColumnIfMissing('poll_options', 'option_value', 'TEXT DEFAULT NULL');

  logger.info('Migration completed: poll_date_columns');
};

export const down = (): void => {
  logger.info('Running migration: poll_date_columns (down)');

  // SQLite kan kolommen niet betrouwbaar droppen in alle ondersteunde versies.
  // De kolommen zijn nullable of hebben een default en zijn verder onschadelijk,
  // dus ze blijven staan.

  logger.info('Rollback completed: poll_date_columns');
};
