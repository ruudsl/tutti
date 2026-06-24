/**
 * Migration: Add missing columns to stage_layouts
 * Created at: 2026-06-04
 *
 * Adds venue_name, thumbnail_url columns and creates concert_stage_assignments table
 */

import db from '../database/connection';

/**
 * Run the migration
 */
export function up(): void {
  // Add venue_name column to stage_layouts if it doesn't exist
  const stageLayoutsInfo = db.prepare("PRAGMA table_info(stage_layouts)").all() as Array<{ name: string }>;
  const hasVenueName = stageLayoutsInfo.some((col) => col.name === 'venue_name');
  const hasThumbnailUrl = stageLayoutsInfo.some((col) => col.name === 'thumbnail_url');

  if (!hasVenueName) {
    db.exec('ALTER TABLE stage_layouts ADD COLUMN venue_name TEXT');
  }

  if (!hasThumbnailUrl) {
    db.exec('ALTER TABLE stage_layouts ADD COLUMN thumbnail_url TEXT');
  }

  // Create concert_stage_assignments table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS concert_stage_assignments (
      id TEXT PRIMARY KEY,
      concert_id TEXT NOT NULL,
      layout_id TEXT NOT NULL,
      assignments_data TEXT NOT NULL DEFAULT '{}',
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
      FOREIGN KEY (layout_id) REFERENCES stage_layouts(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_concert_stage_concert ON concert_stage_assignments(concert_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_concert_stage_layout ON concert_stage_assignments(layout_id)');
}

/**
 * Rollback the migration
 */
export function down(): void {
  // SQLite doesn't support DROP COLUMN easily, so we just drop the new table
  db.exec('DROP TABLE IF EXISTS concert_stage_assignments');
}
