/**
 * Migration: Repertoire Statistics
 * Created at: 2026-03-28
 *
 * This migration adds columns for tracking performance statistics on music titles:
 * - performance_count: Total number of times a piece has been performed
 * - last_performed: Date of the most recent performance
 *
 * These columns serve as cached values for quick lookups in repertoire statistics.
 */

import db from '../database/connection';

/**
 * Run the migration
 */
export function up(): void {
    // Check if columns already exist to make migration idempotent
    const tableInfo = db.prepare("PRAGMA table_info(music_titles)").all() as { name: string }[];
    const existingColumns = tableInfo.map(col => col.name);

    // Add performance_count column if not exists
    if (!existingColumns.includes('performance_count')) {
        db.exec(`
            ALTER TABLE music_titles ADD COLUMN performance_count INTEGER DEFAULT 0
        `);
    }

    // Add last_performed column if not exists
    if (!existingColumns.includes('last_performed')) {
        db.exec(`
            ALTER TABLE music_titles ADD COLUMN last_performed TEXT
        `);
    }

    // Create indexes for efficient queries
    db.exec('CREATE INDEX IF NOT EXISTS idx_music_titles_performance_count ON music_titles(performance_count)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_music_titles_last_performed ON music_titles(last_performed)');

    // Backfill performance statistics for existing titles
    // This updates the cached values based on existing concert_program and rehearsal_pieces data
    const titles = db.prepare(`SELECT id FROM music_titles`).all() as { id: string }[];

    const updateStmt = db.prepare(`
        UPDATE music_titles
        SET performance_count = (
            SELECT COUNT(*) FROM concert_program cp
            JOIN concerts c ON cp.concert_id = c.id
            WHERE cp.music_title_id = music_titles.id
        ) + (
            SELECT COUNT(*) FROM rehearsal_pieces rp
            JOIN rehearsals r ON rp.rehearsal_id = r.id
            WHERE LOWER(rp.title) = LOWER(music_titles.title)
            AND r.association_id = music_titles.association_id
        ),
        last_performed = COALESCE(
            (SELECT MAX(c.date) FROM concert_program cp
             JOIN concerts c ON cp.concert_id = c.id
             WHERE cp.music_title_id = music_titles.id),
            (SELECT MAX(r.date) FROM rehearsal_pieces rp
             JOIN rehearsals r ON rp.rehearsal_id = r.id
             WHERE LOWER(rp.title) = LOWER(music_titles.title)
             AND r.association_id = music_titles.association_id)
        )
        WHERE id = ?
    `);

    for (const title of titles) {
        updateStmt.run(title.id);
    }
}

/**
 * Rollback the migration
 */
export function down(): void {
    // Drop indexes first
    db.exec('DROP INDEX IF EXISTS idx_music_titles_performance_count');
    db.exec('DROP INDEX IF EXISTS idx_music_titles_last_performed');

    // SQLite doesn't support DROP COLUMN directly in older versions
    // We need to recreate the table without those columns
    // However, for simplicity in a rollback scenario, we'll leave the columns
    // as they won't cause issues if they exist but aren't used

    // If full removal is needed, the following approach should be used:
    // 1. Create a new table without the columns
    // 2. Copy data from old table
    // 3. Drop old table
    // 4. Rename new table

    // For now, we just reset the values
    db.exec(`
        UPDATE music_titles
        SET performance_count = 0, last_performed = NULL
    `);
}
