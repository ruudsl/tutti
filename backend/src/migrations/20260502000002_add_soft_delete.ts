import db from '../database/connection';
import logger from '../utils/logger';

// Fresh installs create these columns via schema.ts; only add them when
// they are still missing (existing databases).
const columnExists = (table: string, column: string): boolean => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some((c) => c.name === column);
};

export const up = (): void => {
  logger.info('Running migration: add_soft_delete (up)');

  // Add deleted_at column for soft delete to each table (when missing)
  for (const table of ['users', 'music_pieces', 'music_titles', 'music_lists', 'concerts']) {
    if (!columnExists(table, 'deleted_at')) {
      db.exec(`
        ALTER TABLE ${table} ADD COLUMN deleted_at DATETIME DEFAULT NULL
      `);
    }
  }

  // Add indexes for soft-delete queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_music_pieces_deleted_at ON music_pieces(deleted_at)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_music_titles_deleted_at ON music_titles(deleted_at)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_music_lists_deleted_at ON music_lists(deleted_at)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_concerts_deleted_at ON concerts(deleted_at)
  `);

  // Create view for active users (not deleted)
  db.exec(`
    CREATE VIEW IF NOT EXISTS active_users AS
    SELECT * FROM users WHERE deleted_at IS NULL
  `);

  // Create view for active music pieces
  db.exec(`
    CREATE VIEW IF NOT EXISTS active_music_pieces AS
    SELECT * FROM music_pieces WHERE deleted_at IS NULL
  `);

  logger.info('Migration completed: add_soft_delete');
};

export const down = (): void => {
  logger.info('Running migration: add_soft_delete (down)');

  // Drop views first
  db.exec(`DROP VIEW IF EXISTS active_users`);
  db.exec(`DROP VIEW IF EXISTS active_music_pieces`);

  // Drop indexes
  db.exec(`DROP INDEX IF EXISTS idx_users_deleted_at`);
  db.exec(`DROP INDEX IF EXISTS idx_music_pieces_deleted_at`);
  db.exec(`DROP INDEX IF EXISTS idx_music_titles_deleted_at`);
  db.exec(`DROP INDEX IF EXISTS idx_music_lists_deleted_at`);
  db.exec(`DROP INDEX IF EXISTS idx_concerts_deleted_at`);

  // SQLite doesn't support DROP COLUMN directly in older versions
  // For production, you'd need to recreate tables without these columns
  // For now, we leave the columns as they don't cause issues

  logger.info('Rollback completed: add_soft_delete');
};
