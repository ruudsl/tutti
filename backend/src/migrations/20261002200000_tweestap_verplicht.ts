/**
 * Migration: tweestap_verplicht
 * Created at: 2026-10-02
 *
 * Een vereniging kan tweestapsverificatie verplicht stellen
 * (`associations.tweestap_verplicht`):
 *
 * - `uit`      - niemand hoeft; zoals het was, en de standaard;
 * - `beheer`   - beheerders en bestuur moeten;
 * - `iedereen` - elk lid moet.
 *
 * Wie moet en het nog niet heeft, kan na het inloggen alleen zijn profiel
 * bereiken om het in te stellen (middleware/auth.ts). Bestaande verenigingen
 * krijgen `uit`: er verandert niets tot een beheerder het aanzet.
 *
 * `down` haalt de kolom weer weg.
 */

import db from '../database/connection';
import logger from '../utils/logger';
import { withTransaction } from '../utils/database';

function heeftKolom(tabel: string, kolom: string): boolean {
  const kolommen = db.prepare(`PRAGMA table_info(${tabel})`).all() as { name: string }[];
  return kolommen.some((k) => k.name === kolom);
}

export function up(): void {
  logger.info('Running migration: tweestap_verplicht (up)');

  withTransaction(() => {
    if (!heeftKolom('associations', 'tweestap_verplicht')) {
      db.exec(
        "ALTER TABLE associations ADD COLUMN tweestap_verplicht TEXT NOT NULL DEFAULT 'uit' CHECK (tweestap_verplicht IN ('uit', 'beheer', 'iedereen'))",
      );
    }
  });

  logger.info('Migration completed: tweestap_verplicht');
}

export function down(): void {
  logger.info('Running migration: tweestap_verplicht (down)');

  withTransaction(() => {
    if (heeftKolom('associations', 'tweestap_verplicht')) {
      db.exec('ALTER TABLE associations DROP COLUMN tweestap_verplicht');
    }
  });

  logger.info('Migration rolled back: tweestap_verplicht');
}
