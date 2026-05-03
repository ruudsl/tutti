import type { Database } from 'better-sqlite3';

export const up = (db: Database): void => {
  // Add deleted_at column to users table for soft delete
  db.exec(`
    ALTER TABLE users ADD COLUMN deleted_at DATETIME DEFAULT NULL
  `);

  // Add deleted_at column to music_pieces table
  db.exec(`
    ALTER TABLE music_pieces ADD COLUMN deleted_at DATETIME DEFAULT NULL
  `);

  // Add deleted_at column to music_titles table
  db.exec(`
    ALTER TABLE music_titles ADD COLUMN deleted_at DATETIME DEFAULT NULL
  `);

  // Add deleted_at column to music_lists table
  db.exec(`
    ALTER TABLE music_lists ADD COLUMN deleted_at DATETIME DEFAULT NULL
  `);

  // Add deleted_at column to concerts table
  db.exec(`
    ALTER TABLE concerts ADD COLUMN deleted_at DATETIME DEFAULT NULL
  `);

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
};

export const down = (db: Database): void => {
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
};
