/**
 * Migration: achtergrondtaken
 * Created at: 2026-09-23
 *
 * Achtergrondwerk stond tot nu toe alleen in het geheugen van het proces: een
 * setTimeout per planner, en verder niets. Een herstart - elke uitrol is er
 * een - gooide lopend werk weg zonder spoor, en een mislukte taak kwam in het
 * logboek terecht en nergens anders. Deze tabel is de wachtrij in de
 * database; de werker staat in src/taken/wachtrij.ts.
 *
 * - `sleutel` is uniek en optioneel. Wie een taak twee keer inplant met
 *   dezelfde sleutel krijgt er één: zo draait een periodieke taak één keer
 *   per tijdvak, ook als het proces halverwege herstart.
 * - `eigenaar` en `vergrendeld_tot` zijn de sluis. Een werker pakt een taak
 *   met een UPDATE die alleen slaagt als de taak nog vrij is, en de
 *   vergrendeling verloopt, zodat een taak van een omgevallen proces niet
 *   eeuwig op "bezig" blijft staan.
 * - `association_id` is leeg voor systeemtaken (back-up, opschonen) en gevuld
 *   voor werk dat bij één vereniging hoort, zodat een beheerder later alleen
 *   de eigen taken te zien krijgt.
 */

import db from '../database/connection';
import logger from '../utils/logger';

export const up = (): void => {
  logger.info('Running migration: achtergrondtaken (up)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS achtergrondtaken (
      id TEXT PRIMARY KEY,
      soort TEXT NOT NULL,
      sleutel TEXT UNIQUE,
      gegevens TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'wachtend'
        CHECK (status IN ('wachtend', 'bezig', 'gelukt', 'mislukt')),
      pogingen INTEGER NOT NULL DEFAULT 0,
      gepland_op TEXT NOT NULL,
      eigenaar TEXT,
      vergrendeld_tot TEXT,
      laatste_fout TEXT,
      association_id TEXT,
      aangemaakt_op TEXT NOT NULL,
      bijgewerkt_op TEXT NOT NULL,
      afgerond_op TEXT,
      FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
    )
  `);

  // De werker zoekt bij elke tik naar wat klaarstaat: wachtend en aan de
  // beurt, of bezig met een verlopen vergrendeling.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_achtergrondtaken_aan_de_beurt
      ON achtergrondtaken(status, gepland_op)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_achtergrondtaken_vereniging
      ON achtergrondtaken(association_id)
  `);

  logger.info('Migration completed: achtergrondtaken');
};

export const down = (): void => {
  logger.info('Running migration: achtergrondtaken (down)');

  db.exec('DROP INDEX IF EXISTS idx_achtergrondtaken_aan_de_beurt');
  db.exec('DROP INDEX IF EXISTS idx_achtergrondtaken_vereniging');
  db.exec('DROP TABLE IF EXISTS achtergrondtaken');

  logger.info('Rollback completed: achtergrondtaken');
};
