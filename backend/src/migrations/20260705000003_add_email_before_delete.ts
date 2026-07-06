import db from '../database/connection';
import logger from '../utils/logger';

export const up = (): void => {
  logger.info('Running migration: add_email_before_delete (up)');

  // When a user is soft-deleted, the email column is mutated to
  // `deleted-<timestamp>-<original>` to free up the unique email address.
  // The original address is preserved here so it can be restored.
  // Fresh installs create this column via schema.ts; only add it when
  // it is still missing (existing databases).
  const columns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'email_before_delete')) {
    db.exec(`
      ALTER TABLE users ADD COLUMN email_before_delete TEXT DEFAULT NULL
    `);
  }

  logger.info('Migration completed: add_email_before_delete');
};

export const down = (): void => {
  logger.info('Running migration: add_email_before_delete (down)');

  // SQLite doesn't support DROP COLUMN directly in older versions.
  // The column is nullable and harmless, so we leave it in place.

  logger.info('Rollback completed: add_email_before_delete');
};
