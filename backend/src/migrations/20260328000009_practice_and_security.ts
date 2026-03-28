/**
 * Migration: Practice Schedules and Security
 * Created at: 2026-03-28
 *
 * This migration adds tables for practice planning and IP whitelist security.
 */

import db from '../database/connection';

/**
 * Run the migration
 */
export function up(): void {
    // ===========================================
    // REHEARSAL PLANNER (Per-piece practice schedules)
    // ===========================================

    // Practice schedules per music piece
    db.exec(`
        CREATE TABLE IF NOT EXISTS practice_schedules (
            id TEXT PRIMARY KEY,
            music_title_id TEXT NOT NULL,
            orchestra_id TEXT NOT NULL,
            target_date TEXT NOT NULL,
            priority INTEGER DEFAULT 1,
            notes TEXT,
            created_by TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE CASCADE,
            FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(music_title_id, orchestra_id)
        )
    `);

    // Milestones/goals per practice schedule
    db.exec(`
        CREATE TABLE IF NOT EXISTS practice_schedule_milestones (
            id TEXT PRIMARY KEY,
            schedule_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            target_date TEXT NOT NULL,
            is_completed BOOLEAN DEFAULT 0,
            completed_at DATETIME,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (schedule_id) REFERENCES practice_schedules(id) ON DELETE CASCADE
        )
    `);

    // Per-section progress per milestone
    db.exec(`
        CREATE TABLE IF NOT EXISTS practice_section_progress (
            id TEXT PRIMARY KEY,
            milestone_id TEXT NOT NULL,
            instrument_id TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            notes TEXT,
            updated_by TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (milestone_id) REFERENCES practice_schedule_milestones(id) ON DELETE CASCADE,
            FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE,
            FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
            UNIQUE(milestone_id, instrument_id)
        )
    `);

    // ===========================================
    // SECURITY: IP WHITELIST
    // ===========================================

    // IP whitelist for admin route access control
    db.exec(`
        CREATE TABLE IF NOT EXISTS ip_whitelist (
            id TEXT PRIMARY KEY,
            association_id TEXT,
            ip_address TEXT NOT NULL,
            description TEXT,
            is_enabled BOOLEAN DEFAULT 1,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // ===========================================
    // INDEXES
    // ===========================================

    db.exec('CREATE INDEX IF NOT EXISTS idx_practice_schedules_title ON practice_schedules(music_title_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_practice_schedules_orchestra ON practice_schedules(orchestra_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_practice_schedules_date ON practice_schedules(target_date)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_practice_milestones_schedule ON practice_schedule_milestones(schedule_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_practice_section_progress_milestone ON practice_section_progress(milestone_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_practice_section_progress_instrument ON practice_section_progress(instrument_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_ip_whitelist_association ON ip_whitelist(association_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_ip_whitelist_enabled ON ip_whitelist(is_enabled)');
}

/**
 * Rollback the migration
 */
export function down(): void {
    const tables = [
        'ip_whitelist',
        'practice_section_progress',
        'practice_schedule_milestones',
        'practice_schedules',
    ];

    for (const table of tables) {
        db.exec(`DROP TABLE IF EXISTS ${table}`);
    }
}
