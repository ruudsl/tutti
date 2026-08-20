/**
 * Migration: instelling voor repetities in de openbare agenda
 * Created at: 2026-08-20
 *
 * routes/calendar.ts leest al sinds jaar en dag associations.show_rehearsals_public
 * om te bepalen of repetities in de openbare agenda mogen staan, maar die kolom
 * is nooit aangemaakt. De query liep dus stuk op "no such column" en de hele
 * openbare agenda gaf een fout terug.
 *
 * De standaard is 0: repetities blijven verborgen tenzij een beheerder ze
 * bewust openbaar maakt. Dat is de veilige kant, want een repetitierooster
 * zegt iets over waar leden op welk moment zijn.
 */

import db from '../database/connection';
import logger from '../utils/logger';

function heeftKolom(tabel: string, kolom: string): boolean {
  const kolommen = db.prepare(`PRAGMA table_info(${tabel})`).all() as Array<{ name: string }>;
  return kolommen.some((k) => k.name === kolom);
}

export const up = (): void => {
  logger.info('Running migration: public_calendar (up)');

  if (!heeftKolom('associations', 'show_rehearsals_public')) {
    db.exec('ALTER TABLE associations ADD COLUMN show_rehearsals_public INTEGER NOT NULL DEFAULT 0');
  }

  logger.info('Migration completed: public_calendar');
};

export const down = (): void => {
  logger.info('Running migration: public_calendar (down)');

  // SQLite kan pas sinds 3.35 kolommen laten vallen; de kolom laten staan is
  // hier onschadelijk, want zonder de code eromheen wordt hij niet gelezen.
  logger.info('Rollback completed: public_calendar (kolom blijft staan)');
};
