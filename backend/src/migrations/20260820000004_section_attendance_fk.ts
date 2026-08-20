/**
 * Migration: verwijzing naar een niet-bestaande tabel weghalen
 * Created at: 2026-08-20
 *
 * section_attendance_stats verwijst met een foreign key naar sections(id).
 * Die tabel bestaat nergens. SQLite zoekt zo'n verwijzing pas op bij het
 * uitvoeren, en dan niet alleen bij een invoeging in deze tabel: ook bij het
 * verwijderen van een rij waar hij aan hangt. Het gevolg was dat
 * DELETE FROM associations WHERE id = ? stukliep op "no such table:
 * main.sections", en een vereniging dus helemaal niet te verwijderen was.
 *
 * De tabel wordt opnieuw opgebouwd zonder die verwijzing. section_id blijft
 * gewoon staan als kolom: welke tabel er bedoeld was, is uit de code niet op
 * te maken — niets leest of schrijft deze tabel — en dan een verwijzing naar
 * seating_sections verzinnen legt een verband vast dat er misschien niet is.
 * Komt die tabel er ooit, dan hoort de foreign key er alsnog bij.
 */

import db from '../database/connection';
import logger from '../utils/logger';

function verwijstNaarSections(): boolean {
  const rij = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'section_attendance_stats'")
    .get() as { sql: string } | undefined;
  return Boolean(rij?.sql && /REFERENCES\s+sections\s*\(/i.test(rij.sql));
}

export const up = (): void => {
  logger.info('Running migration: section_attendance_fk (up)');

  if (!verwijstNaarSections()) {
    logger.info('Migration completed: section_attendance_fk (niets te doen)');
    return;
  }

  db.exec(`
    CREATE TABLE section_attendance_stats_nieuw (
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
      FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE SET NULL
    );

    INSERT INTO section_attendance_stats_nieuw
      SELECT id, association_id, section_id, period_type, period_start, period_end,
             season_id, total_events, average_attendance_rate, total_members, calculated_at
      FROM section_attendance_stats;

    DROP TABLE section_attendance_stats;
    ALTER TABLE section_attendance_stats_nieuw RENAME TO section_attendance_stats;

    CREATE INDEX IF NOT EXISTS idx_section_attendance_association ON section_attendance_stats(association_id);
    CREATE INDEX IF NOT EXISTS idx_section_attendance_section ON section_attendance_stats(section_id);
  `);

  logger.info('Migration completed: section_attendance_fk');
};

export const down = (): void => {
  logger.info('Running migration: section_attendance_fk (down)');

  // Terugzetten zou de verwijzing naar een tabel die niet bestaat herstellen,
  // en daarmee het verwijderen van verenigingen opnieuw stukmaken.
  logger.info('Rollback completed: section_attendance_fk (verwijzing blijft weg)');
};
