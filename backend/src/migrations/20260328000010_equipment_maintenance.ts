/**
 * Migration: Equipment Maintenance Log
 * Created at: 2026-03-28
 *
 * This migration adds a detailed maintenance log table for tracking
 * equipment maintenance history with costs and performed_by details.
 */

import db from '../database/connection';

/**
 * Run the migration
 */
export function up(): void {
  // Equipment maintenance log for detailed maintenance history
  db.exec(`
        CREATE TABLE IF NOT EXISTS equipment_maintenance_log (
            id TEXT PRIMARY KEY,
            equipment_id TEXT NOT NULL,
            maintenance_date TEXT NOT NULL,
            performed_by TEXT,
            description TEXT NOT NULL,
            cost REAL,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT,
            FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

  // Indexes for efficient querying
  db.exec('CREATE INDEX IF NOT EXISTS idx_maintenance_log_equipment ON equipment_maintenance_log(equipment_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_maintenance_log_date ON equipment_maintenance_log(maintenance_date)');

  // Add maintenance_notes column to equipment table if it doesn't exist
  // SQLite doesn't support IF NOT EXISTS for ADD COLUMN, so we check first
  const columns = db.prepare(`PRAGMA table_info(equipment)`).all() as { name: string }[];
  const hasMaintenanceNotes = columns.some((col) => col.name === 'maintenance_notes');

  if (!hasMaintenanceNotes) {
    db.exec(`ALTER TABLE equipment ADD COLUMN maintenance_notes TEXT`);
  }
}

/**
 * Rollback the migration
 */
export function down(): void {
  db.exec('DROP TABLE IF EXISTS equipment_maintenance_log');
  // Note: SQLite doesn't support DROP COLUMN, so we leave maintenance_notes
}
