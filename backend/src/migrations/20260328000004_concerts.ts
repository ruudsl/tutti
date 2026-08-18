/**
 * Migration: Concerts Archive
 * Created at: 2026-03-28
 *
 * This migration adds tables for concert management and archives.
 */

import db from '../database/connection';

/**
 * Run the migration
 */
export function up(): void {
  // Concert types (customizable per association)
  db.exec(`
        CREATE TABLE IF NOT EXISTS concert_types (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,
            value TEXT NOT NULL,
            label TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            UNIQUE(association_id, value)
        )
    `);

  // Concerts
  db.exec(`
        CREATE TABLE IF NOT EXISTS concerts (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,
            name TEXT NOT NULL,
            date TEXT NOT NULL,
            end_date TEXT,
            location TEXT,
            venue_type TEXT,
            concert_type TEXT,
            description TEXT,
            notes TEXT,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

  // Concert program (played pieces)
  db.exec(`
        CREATE TABLE IF NOT EXISTS concert_program (
            id TEXT PRIMARY KEY,
            concert_id TEXT NOT NULL,
            music_title_id TEXT,
            title TEXT NOT NULL,
            composer TEXT,
            arranger TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            part_of_set TEXT,
            FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
            FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE SET NULL
        )
    `);

  // Concert media (photos, videos, audio, posters)
  db.exec(`
        CREATE TABLE IF NOT EXISTS concert_media (
            id TEXT PRIMARY KEY,
            concert_id TEXT NOT NULL,
            media_type TEXT NOT NULL,
            url TEXT,
            file_path TEXT,
            description TEXT,
            uploaded_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
            FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

  // Concert attendance (who played)
  db.exec(`
        CREATE TABLE IF NOT EXISTS concert_attendance (
            id TEXT PRIMARY KEY,
            concert_id TEXT NOT NULL,
            user_id TEXT,
            member_name TEXT NOT NULL,
            instrument_played TEXT,
            notes TEXT,
            FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
            UNIQUE(concert_id, user_id)
        )
    `);

  // ===========================================
  // INDEXES
  // ===========================================

  db.exec('CREATE INDEX IF NOT EXISTS idx_concerts_association ON concerts(association_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_concerts_date ON concerts(date)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_concerts_type ON concerts(concert_type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_concert_program_concert ON concert_program(concert_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_concert_program_title ON concert_program(music_title_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_concert_media_concert ON concert_media(concert_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_concert_attendance_concert ON concert_attendance(concert_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_concert_attendance_user ON concert_attendance(user_id)');
}

/**
 * Rollback the migration
 */
export function down(): void {
  const tables = ['concert_attendance', 'concert_media', 'concert_program', 'concerts', 'concert_types'];

  for (const table of tables) {
    db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
}
