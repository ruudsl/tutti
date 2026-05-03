import db from '../database/connection';
import logger from '../utils/logger';

export const up = (): void => {
  logger.info('Running migration: add_performance_indexes (up)');
  // Index for session cleanup queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at
    ON user_sessions(expires_at)
  `);

  // Compound index for attendance lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_rehearsal_attendance_compound
    ON rehearsal_attendance(rehearsal_id, user_id)
  `);

  // Index for equipment loans by user
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_equipment_loans_current_user
    ON equipment_loans(current_user_id)
  `);

  // Index for uniform loans by user
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_uniform_loans_user
    ON uniform_loans(user_id)
  `);

  // Index for notifications by user and read status
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read
    ON notifications(user_id, is_read)
  `);

  // Index for audit logs date filtering
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
    ON audit_logs(created_at)
  `);

  // Index for activity log by user
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_activity_log_user
    ON activity_log(user_id)
  `);

  // Index for practice logs by user and date
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_practice_logs_user_date
    ON practice_logs(user_id, started_at)
  `);

  // Index for music pieces by association and title
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_music_pieces_assoc_title
    ON music_pieces(association_id, title_id)
  `);

  // Index for concert tickets by concert
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_concert_tickets_concert
    ON concert_tickets(concert_id)
  `);
  logger.info('Migration completed: add_performance_indexes');
};

export const down = (): void => {
  logger.info('Running migration: add_performance_indexes (down)');
  db.exec(`DROP INDEX IF EXISTS idx_user_sessions_expires_at`);
  db.exec(`DROP INDEX IF EXISTS idx_rehearsal_attendance_compound`);
  db.exec(`DROP INDEX IF EXISTS idx_equipment_loans_current_user`);
  db.exec(`DROP INDEX IF EXISTS idx_uniform_loans_user`);
  db.exec(`DROP INDEX IF EXISTS idx_notifications_user_read`);
  db.exec(`DROP INDEX IF EXISTS idx_audit_logs_created_at`);
  db.exec(`DROP INDEX IF EXISTS idx_activity_log_user`);
  db.exec(`DROP INDEX IF EXISTS idx_practice_logs_user_date`);
  db.exec(`DROP INDEX IF EXISTS idx_music_pieces_assoc_title`);
  db.exec(`DROP INDEX IF EXISTS idx_concert_tickets_concert`);
  logger.info('Rollback completed: add_performance_indexes');
};
