/**
 * Migration: Session and login security
 * Created at: 2026-07-05
 *
 * - users.password_changed_at: timestamp of the last password change/reset,
 *   used to invalidate JWTs issued before that moment (jwt.iat check).
 * - users.failed_login_attempts + users.locked_until: account lockout against
 *   brute-force login attempts (exponential backoff from 5 failed attempts).
 * - user_sessions.revoked_at: soft revocation marker, so the auth middleware
 *   can distinguish an explicitly revoked session (401) from a legacy token
 *   without a session record (lazily registered).
 * - Index on user_sessions.token_hash: the auth middleware looks sessions up
 *   by token hash on every request.
 */

import db from '../database/connection';

function columnExists(table: string, column: string): boolean {
  const info = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return info.some((col) => col.name === column);
}

/**
 * Run the migration
 */
export function up(): void {
  if (!columnExists('users', 'password_changed_at')) {
    db.exec('ALTER TABLE users ADD COLUMN password_changed_at TEXT');
  }

  if (!columnExists('users', 'failed_login_attempts')) {
    db.exec('ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0');
  }

  if (!columnExists('users', 'locked_until')) {
    db.exec('ALTER TABLE users ADD COLUMN locked_until TEXT');
  }

  if (!columnExists('user_sessions', 'revoked_at')) {
    db.exec('ALTER TABLE user_sessions ADD COLUMN revoked_at TEXT');
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash)');
}

/**
 * Rollback the migration
 */
export function down(): void {
  db.exec('DROP INDEX IF EXISTS idx_user_sessions_token_hash');

  // DROP COLUMN requires SQLite >= 3.35; guard each statement so a partial
  // rollback on older engines doesn't abort the whole down migration.
  const drops = [
    'ALTER TABLE user_sessions DROP COLUMN revoked_at',
    'ALTER TABLE users DROP COLUMN locked_until',
    'ALTER TABLE users DROP COLUMN failed_login_attempts',
    'ALTER TABLE users DROP COLUMN password_changed_at',
  ];

  for (const sql of drops) {
    try {
      db.exec(sql);
    } catch (err) {
      console.warn(`Rollback step skipped (${sql}):`, err instanceof Error ? err.message : err);
    }
  }
}
