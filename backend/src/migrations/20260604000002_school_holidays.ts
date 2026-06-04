/**
 * Migration: School Holidays and Holiday Settings
 * Created at: 2026-06-04
 *
 * This migration adds tables for school holiday management and association settings.
 */

import db from '../database/connection';

/**
 * Run the migration
 */
export function up(): void {
    // ===========================================
    // SCHOOL HOLIDAYS TABLE
    // ===========================================

    db.exec(`
        CREATE TABLE IF NOT EXISTS school_holidays (
            id TEXT PRIMARY KEY,
            association_id TEXT,
            name TEXT NOT NULL,
            region TEXT,
            country TEXT DEFAULT 'NL',
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            year INTEGER NOT NULL,
            holiday_type TEXT,
            is_custom BOOLEAN DEFAULT FALSE,
            source TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
        )
    `);

    // ===========================================
    // ASSOCIATION HOLIDAY SETTINGS TABLE
    // ===========================================

    db.exec(`
        CREATE TABLE IF NOT EXISTS association_holiday_settings (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL UNIQUE,
            region TEXT DEFAULT 'midden',
            show_holidays_in_calendar BOOLEAN DEFAULT TRUE,
            auto_block_rehearsals BOOLEAN DEFAULT FALSE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
        )
    `);

    // ===========================================
    // INDEXES
    // ===========================================

    db.exec('CREATE INDEX IF NOT EXISTS idx_school_holidays_association ON school_holidays(association_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_school_holidays_region ON school_holidays(region)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_school_holidays_year ON school_holidays(year)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_school_holidays_dates ON school_holidays(start_date, end_date)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_school_holidays_type ON school_holidays(holiday_type)');
}

/**
 * Rollback the migration
 */
export function down(): void {
    const tables = [
        'association_holiday_settings',
        'school_holidays',
    ];

    for (const table of tables) {
        db.exec(`DROP TABLE IF EXISTS ${table}`);
    }
}
