/**
 * Migration: Stage Layouts, Seasons, and Attendance Analytics
 * Created at: 2026-06-04
 *
 * Creates tables for:
 * - Stage layout designer (podiumindelingen)
 * - Season planning and management
 * - Attendance analytics and statistics
 */

import db from '../database/connection';

/**
 * Run the migration
 */
export function up(): void {
  // Stage Layouts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS stage_layouts (
      id TEXT PRIMARY KEY,
      association_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      stage_width INTEGER DEFAULT 1000,
      stage_depth INTEGER DEFAULT 600,
      layout_data TEXT NOT NULL DEFAULT '{}',
      is_template INTEGER DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_stage_layouts_association ON stage_layouts(association_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_stage_layouts_template ON stage_layouts(is_template)');

  // Seasons table
  db.exec(`
    CREATE TABLE IF NOT EXISTS seasons (
      id TEXT PRIMARY KEY,
      association_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT DEFAULT 'planning' CHECK(status IN ('planning', 'active', 'completed', 'archived')),
      budget REAL,
      notes TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_seasons_association ON seasons(association_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_seasons_status ON seasons(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_seasons_dates ON seasons(start_date, end_date)');

  // Season Events junction table
  db.exec(`
    CREATE TABLE IF NOT EXISTS season_events (
      id TEXT PRIMARY KEY,
      season_id TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK(event_type IN ('rehearsal', 'concert', 'other')),
      event_id TEXT NOT NULL,
      event_date TEXT,
      event_name TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_season_events_season ON season_events(season_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_season_events_event ON season_events(event_type, event_id)');

  // Season Templates table
  db.exec(`
    CREATE TABLE IF NOT EXISTS season_templates (
      id TEXT PRIMARY KEY,
      association_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      template_data TEXT NOT NULL DEFAULT '{}',
      is_default INTEGER DEFAULT 0,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_season_templates_association ON season_templates(association_id)');

  // Attendance Analytics - we track aggregate stats
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance_stats (
      id TEXT PRIMARY KEY,
      association_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      period_type TEXT NOT NULL CHECK(period_type IN ('weekly', 'monthly', 'quarterly', 'yearly', 'season')),
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      season_id TEXT,
      total_events INTEGER DEFAULT 0,
      attended_events INTEGER DEFAULT 0,
      excused_absences INTEGER DEFAULT 0,
      unexcused_absences INTEGER DEFAULT 0,
      late_arrivals INTEGER DEFAULT 0,
      attendance_rate REAL DEFAULT 0,
      punctuality_rate REAL DEFAULT 0,
      calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE SET NULL
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_attendance_stats_association ON attendance_stats(association_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_attendance_stats_user ON attendance_stats(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_attendance_stats_period ON attendance_stats(period_type, period_start)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_attendance_stats_season ON attendance_stats(season_id)');

  // Section attendance stats for group analytics
  db.exec(`
    CREATE TABLE IF NOT EXISTS section_attendance_stats (
      id TEXT PRIMARY KEY,
      association_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      period_type TEXT NOT NULL CHECK(period_type IN ('weekly', 'monthly', 'quarterly', 'yearly', 'season')),
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      season_id TEXT,
      total_events INTEGER DEFAULT 0,
      average_attendance_rate REAL DEFAULT 0,
      total_members INTEGER DEFAULT 0,
      calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
      FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
      FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE SET NULL
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_section_attendance_association ON section_attendance_stats(association_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_section_attendance_section ON section_attendance_stats(section_id)');
}

/**
 * Rollback the migration
 */
export function down(): void {
  db.exec('DROP TABLE IF EXISTS section_attendance_stats');
  db.exec('DROP TABLE IF EXISTS attendance_stats');
  db.exec('DROP TABLE IF EXISTS season_templates');
  db.exec('DROP TABLE IF EXISTS season_events');
  db.exec('DROP TABLE IF EXISTS seasons');
  db.exec('DROP TABLE IF EXISTS stage_layouts');
}
