/**
 * Migration: de seizoenstabel laten kloppen met wat de applicatie doet
 * Created at: 2026-08-20
 *
 * Twee dingen stonden hier scheef, allebei met een 500 tot gevolg.
 *
 * 1. seasons.status stond op CHECK(status IN ('planning', 'active',
 *    'completed', 'archived')) met 'planning' als standaard, terwijl de route
 *    en het scherm draft, active en completed gebruiken. Een nieuw seizoen
 *    kwam dus binnen als 'planning' - een stand die het scherm niet kent - en
 *    de knop die de status doorzet stuurde 'draft' terug. Dat botste op de
 *    CHECK. De statusknop in de seizoensplanner werkte daardoor voor geen
 *    enkel nieuw seizoen.
 *
 *    De tabel wordt opnieuw opgebouwd met draft als standaard, bestaande
 *    'planning' wordt 'draft'. 'archived' blijft toegestaan: er kunnen rijen
 *    zijn die zo staan, en die weggooien is geen migratie maar dataverlies.
 *
 *    LET OP bij het herbouwen. connection.ts zet PRAGMA foreign_keys = ON, en
 *    dan voert DROP TABLE eerst een impliciete DELETE uit. Drie tabellen
 *    verwijzen naar seasons: season_events met ON DELETE CASCADE, en
 *    attendance_stats en section_attendance_stats met ON DELETE SET NULL. Zonder
 *    voorzorg wist dit dus alle evenementen van elk seizoen en verbreekt het de
 *    koppeling in de twee statistiektabellen - stilzwijgend, want de migratie
 *    meldt gewoon dat hij gelukt is.
 *
 *    De pragma uitzetten kan hier niet: de runner voert up() uit binnen een
 *    transactie, en PRAGMA foreign_keys doet daar niets. De rijen worden daarom
 *    eerst apart gezet en na de herbouw teruggeplaatst.
 *
 * 2. season_events.event_id stond op NOT NULL, terwijl POST /seasons/:id/events
 *    het veld als optioneel behandelt (`eventId || null`). Voor een evenement
 *    van het type 'other' is er ook niets om naar te wijzen. Een evenement
 *    toevoegen zonder bestaand concert of bestaande repetitie liep daardoor
 *    altijd stuk.
 */

import db from '../database/connection';
import logger from '../utils/logger';

function tabelSql(naam: string): string {
  const rij = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(naam) as
    { sql: string } | undefined;
  return rij?.sql ?? '';
}

export const up = (): void => {
  logger.info('Running migration: seasons_status_en_events (up)');

  if (/'planning'/.test(tabelSql('seasons'))) {
    // Zet de rijen apart die de impliciete DELETE van DROP TABLE zou meenemen.
    db.exec(`
      CREATE TEMP TABLE seizoen_evenementen_bewaard AS SELECT * FROM season_events;
      CREATE TEMP TABLE aanwezigheid_seizoen_bewaard AS
        SELECT id, season_id FROM attendance_stats WHERE season_id IS NOT NULL;
      CREATE TEMP TABLE sectie_aanwezigheid_seizoen_bewaard AS
        SELECT id, season_id FROM section_attendance_stats WHERE season_id IS NOT NULL;
    `);

    db.exec(`
      CREATE TABLE seasons_nieuw (
        id TEXT PRIMARY KEY,
        association_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'completed', 'archived')),
        budget REAL,
        notes TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        template_id TEXT,
        budget_total REAL,
        budget_allocated REAL DEFAULT 0,
        FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      );

      INSERT INTO seasons_nieuw
        SELECT id, association_id, name, description, start_date, end_date,
               CASE WHEN status = 'planning' THEN 'draft' ELSE status END,
               budget, notes, created_by, created_at, updated_at,
               template_id, budget_total, budget_allocated
        FROM seasons;

      DROP TABLE seasons;
      ALTER TABLE seasons_nieuw RENAME TO seasons;

      CREATE INDEX IF NOT EXISTS idx_seasons_association ON seasons(association_id);
      CREATE INDEX IF NOT EXISTS idx_seasons_status ON seasons(status);
      CREATE INDEX IF NOT EXISTS idx_seasons_dates ON seasons(start_date, end_date);
    `);

    // En zet ze terug. season_events is door de cascade leeggelopen; de twee
    // statistiektabellen hebben hun season_id op NULL gekregen.
    db.exec(`
      DELETE FROM season_events;
      INSERT INTO season_events SELECT * FROM seizoen_evenementen_bewaard;

      UPDATE attendance_stats
      SET season_id = (SELECT b.season_id FROM aanwezigheid_seizoen_bewaard b WHERE b.id = attendance_stats.id)
      WHERE id IN (SELECT id FROM aanwezigheid_seizoen_bewaard);

      UPDATE section_attendance_stats
      SET season_id = (
        SELECT b.season_id FROM sectie_aanwezigheid_seizoen_bewaard b WHERE b.id = section_attendance_stats.id
      )
      WHERE id IN (SELECT id FROM sectie_aanwezigheid_seizoen_bewaard);

      DROP TABLE seizoen_evenementen_bewaard;
      DROP TABLE aanwezigheid_seizoen_bewaard;
      DROP TABLE sectie_aanwezigheid_seizoen_bewaard;
    `);
  }

  if (/event_id\s+TEXT\s+NOT NULL/i.test(tabelSql('season_events'))) {
    db.exec(`
      CREATE TABLE season_events_nieuw (
        id TEXT PRIMARY KEY,
        season_id TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK(event_type IN ('rehearsal', 'concert', 'other')),
        event_id TEXT,
        event_date TEXT,
        event_name TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        planned_date TEXT,
        budget_amount REAL,
        FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
      );

      INSERT INTO season_events_nieuw
        SELECT id, season_id, event_type, event_id, event_date, event_name, notes,
               created_at, planned_date, budget_amount
        FROM season_events;

      DROP TABLE season_events;
      ALTER TABLE season_events_nieuw RENAME TO season_events;

      CREATE INDEX IF NOT EXISTS idx_season_events_season ON season_events(season_id);
      CREATE INDEX IF NOT EXISTS idx_season_events_event ON season_events(event_type, event_id);
    `);
  }

  logger.info('Migration completed: seasons_status_en_events');
};

export const down = (): void => {
  logger.info('Running migration: seasons_status_en_events (down)');

  // Terugzetten zou 'planning' als standaard herstellen en event_id weer
  // verplicht maken, en daarmee precies de twee fouten terugbrengen die deze
  // migratie weghaalt.
  logger.info('Rollback completed: seasons_status_en_events (blijft zoals het is)');
};
