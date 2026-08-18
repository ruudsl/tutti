/**
 * Migration: Rehearsals and Spond Integration
 * Created at: 2026-03-28
 *
 * This migration adds tables for rehearsal management and Spond integration.
 */

import db from '../database/connection';

/**
 * Run the migration
 */
export function up(): void {
  // ===========================================
  // REHEARSAL MANAGEMENT
  // ===========================================

  // Default rehearsal days (weekly recurring)
  db.exec(`
        CREATE TABLE IF NOT EXISTS rehearsal_default_days (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,
            orchestra_id TEXT,
            day_of_week INTEGER NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            location TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE SET NULL
        )
    `);

  // Individual rehearsals
  db.exec(`
        CREATE TABLE IF NOT EXISTS rehearsals (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,
            orchestra_id TEXT,
            date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            location TEXT,
            type TEXT NOT NULL DEFAULT 'regular',
            notes TEXT,
            spond_event_id TEXT,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE SET NULL,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

  // Rehearsal pieces
  db.exec(`
        CREATE TABLE IF NOT EXISTS rehearsal_pieces (
            id TEXT PRIMARY KEY,
            rehearsal_id TEXT NOT NULL,
            title TEXT NOT NULL,
            notes TEXT,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (rehearsal_id) REFERENCES rehearsals(id) ON DELETE CASCADE
        )
    `);

  // ===========================================
  // SPOND INTEGRATION
  // ===========================================

  // Spond configuration
  db.exec(`
        CREATE TABLE IF NOT EXISTS spond_config (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL UNIQUE,
            username TEXT NOT NULL,
            password_encrypted TEXT NOT NULL,
            group_id TEXT,
            sync_enabled BOOLEAN DEFAULT 0,
            last_sync DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
        )
    `);

  // Spond groups per orchestra
  db.exec(`
        CREATE TABLE IF NOT EXISTS spond_orchestra_groups (
            id TEXT PRIMARY KEY,
            orchestra_id TEXT NOT NULL UNIQUE,
            spond_group_id TEXT NOT NULL,
            spond_group_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE
        )
    `);

  // Spond member links
  db.exec(`
        CREATE TABLE IF NOT EXISTS spond_member_links (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,
            spond_member_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            spond_member_name TEXT,
            spond_member_email TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(association_id, spond_member_id)
        )
    `);

  // Rehearsal attendance
  db.exec(`
        CREATE TABLE IF NOT EXISTS rehearsal_attendance (
            id TEXT PRIMARY KEY,
            rehearsal_id TEXT NOT NULL,
            user_id TEXT,
            spond_member_id TEXT,
            member_name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'unknown',
            FOREIGN KEY (rehearsal_id) REFERENCES rehearsals(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

  // ===========================================
  // INDEXES
  // ===========================================

  db.exec('CREATE INDEX IF NOT EXISTS idx_spond_member_links_spond_id ON spond_member_links(spond_member_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_spond_member_links_user ON spond_member_links(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_spond_member_links_email ON spond_member_links(spond_member_email)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_rehearsals_association ON rehearsals(association_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_rehearsals_date ON rehearsals(date)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_rehearsal_pieces_rehearsal ON rehearsal_pieces(rehearsal_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_rehearsal_attendance_rehearsal ON rehearsal_attendance(rehearsal_id)');
}

/**
 * Rollback the migration
 */
export function down(): void {
  const tables = [
    'rehearsal_attendance',
    'spond_member_links',
    'spond_orchestra_groups',
    'spond_config',
    'rehearsal_pieces',
    'rehearsals',
    'rehearsal_default_days',
  ];

  for (const table of tables) {
    db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
}
