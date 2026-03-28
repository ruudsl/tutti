/**
 * Migration: Seating Arrangement
 * Created at: 2026-03-28
 *
 * This migration adds tables for orchestra seating arrangements.
 */

import db from '../database/connection';

/**
 * Run the migration
 */
export function up(): void {
    // Seating sections (rows in the arrangement)
    db.exec(`
        CREATE TABLE IF NOT EXISTS seating_sections (
            id TEXT PRIMARY KEY,
            orchestra_id TEXT NOT NULL,
            name TEXT NOT NULL,
            row_number INTEGER NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE,
            UNIQUE(orchestra_id, row_number)
        )
    `);

    // Instrument groups within a section/row
    db.exec(`
        CREATE TABLE IF NOT EXISTS seating_section_instruments (
            id TEXT PRIMARY KEY,
            section_id TEXT NOT NULL,
            instrument_id TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (section_id) REFERENCES seating_sections(id) ON DELETE CASCADE,
            FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE,
            UNIQUE(section_id, instrument_id)
        )
    `);

    // Fixed seat assignments (who normally sits where)
    db.exec(`
        CREATE TABLE IF NOT EXISTS seating_assignments (
            id TEXT PRIMARY KEY,
            orchestra_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            section_id TEXT NOT NULL,
            position_in_section INTEGER NOT NULL DEFAULT 0,
            seat_label TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (section_id) REFERENCES seating_sections(id) ON DELETE CASCADE,
            UNIQUE(orchestra_id, user_id)
        )
    `);

    // Neighbor relationships (seating preferences)
    db.exec(`
        CREATE TABLE IF NOT EXISTS seating_neighbors (
            id TEXT PRIMARY KEY,
            orchestra_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            neighbor_user_id TEXT NOT NULL,
            preference TEXT NOT NULL DEFAULT 'preferred',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (neighbor_user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(orchestra_id, user_id, neighbor_user_id)
        )
    `);

    // Per-rehearsal seating (generated based on attendees)
    db.exec(`
        CREATE TABLE IF NOT EXISTS rehearsal_seating (
            id TEXT PRIMARY KEY,
            rehearsal_id TEXT NOT NULL,
            user_id TEXT,
            spond_member_id TEXT,
            member_name TEXT NOT NULL,
            instrument_name TEXT,
            section_id TEXT,
            row_number INTEGER NOT NULL,
            position_in_row INTEGER NOT NULL,
            is_conductor BOOLEAN DEFAULT 0,
            generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (rehearsal_id) REFERENCES rehearsals(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (section_id) REFERENCES seating_sections(id) ON DELETE SET NULL
        )
    `);

    // ===========================================
    // INDEXES
    // ===========================================

    db.exec('CREATE INDEX IF NOT EXISTS idx_seating_sections_orchestra ON seating_sections(orchestra_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_seating_section_instruments_section ON seating_section_instruments(section_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_seating_assignments_orchestra ON seating_assignments(orchestra_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_seating_assignments_user ON seating_assignments(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_seating_neighbors_orchestra ON seating_neighbors(orchestra_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_seating_neighbors_user ON seating_neighbors(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_rehearsal_seating_rehearsal ON rehearsal_seating(rehearsal_id)');
}

/**
 * Rollback the migration
 */
export function down(): void {
    const tables = [
        'rehearsal_seating',
        'seating_neighbors',
        'seating_assignments',
        'seating_section_instruments',
        'seating_sections',
    ];

    for (const table of tables) {
        db.exec(`DROP TABLE IF EXISTS ${table}`);
    }
}
