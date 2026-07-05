/**
 * Migration: MFA recovery codes
 * Created at: 2026-07-05
 *
 * - mfa_recovery_codes: one-time recovery codes for MFA. Only SHA-256 hashes
 *   of the codes are stored; the plaintext is shown to the user exactly once
 *   when MFA is enabled or when the codes are regenerated. A code is marked
 *   as used via used_at instead of being deleted, preserving an audit trail.
 */

import db from '../database/connection';

/**
 * Run the migration
 */
export function up(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      used_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user ON mfa_recovery_codes(user_id)');
}

/**
 * Rollback the migration
 */
export function down(): void {
  db.exec('DROP INDEX IF EXISTS idx_mfa_recovery_codes_user');
  db.exec('DROP TABLE IF EXISTS mfa_recovery_codes');
}
