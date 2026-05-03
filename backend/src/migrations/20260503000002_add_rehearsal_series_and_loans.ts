import db from '../database/connection';
import logger from '../utils/logger';

export const up = (): void => {
  logger.info('Running migration: add_rehearsal_series_and_loans (up)');

  // Add series_id column to rehearsals for linking recurring rehearsals
  db.exec(`
    ALTER TABLE rehearsals ADD COLUMN series_id TEXT DEFAULT NULL
  `);

  // Add index for series queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_rehearsals_series_id ON rehearsals(series_id)
  `);

  // Create loans table if it doesn't exist (for music title lending)
  db.exec(`
    CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY,
      music_title_id TEXT NOT NULL,
      borrower_name TEXT NOT NULL,
      borrower_email TEXT,
      borrower_organization TEXT,
      notes TEXT,
      date_out DATETIME DEFAULT CURRENT_TIMESTAMP,
      expected_return DATE,
      date_returned DATETIME,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'overdue', 'returned')),
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (music_title_id) REFERENCES music_titles(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // Add indexes for loan queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_loans_music_title_id ON loans(music_title_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_loans_date_out ON loans(date_out)
  `);

  logger.info('Migration completed: add_rehearsal_series_and_loans');
};

export const down = (): void => {
  logger.info('Running migration: add_rehearsal_series_and_loans (down)');

  // Drop indexes
  db.exec(`DROP INDEX IF EXISTS idx_rehearsals_series_id`);
  db.exec(`DROP INDEX IF EXISTS idx_loans_music_title_id`);
  db.exec(`DROP INDEX IF EXISTS idx_loans_status`);
  db.exec(`DROP INDEX IF EXISTS idx_loans_date_out`);

  // Drop loans table
  db.exec(`DROP TABLE IF EXISTS loans`);

  // Note: SQLite doesn't support DROP COLUMN in older versions
  // The series_id column will remain but is harmless

  logger.info('Rollback completed: add_rehearsal_series_and_loans');
};
