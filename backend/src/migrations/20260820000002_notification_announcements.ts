/**
 * Migration: mededelingen en algemene meldingen uitzetbaar maken
 * Created at: 2026-08-20
 *
 * services/notifications koppelt de meldingsoorten 'announcement' en
 * 'general' aan de kolommen announcements en general in
 * notification_preferences, maar die zijn nooit aangemaakt. De controle las
 * daardoor undefined, wat nooit gelijk is aan 0, en liet alles door: een lid
 * kon deze twee soorten niet uitzetten.
 *
 * De standaard is 1, gelijk aan de andere soorten, zodat bestaande leden
 * blijven krijgen wat ze nu ook krijgen.
 */

import db from '../database/connection';
import logger from '../utils/logger';

function heeftKolom(tabel: string, kolom: string): boolean {
  const kolommen = db.prepare(`PRAGMA table_info(${tabel})`).all() as Array<{ name: string }>;
  return kolommen.some((k) => k.name === kolom);
}

export const up = (): void => {
  logger.info('Running migration: notification_announcements (up)');

  for (const kolom of ['announcements', 'general']) {
    if (!heeftKolom('notification_preferences', kolom)) {
      db.exec(`ALTER TABLE notification_preferences ADD COLUMN ${kolom} BOOLEAN DEFAULT 1`);
    }
  }

  logger.info('Migration completed: notification_announcements');
};

export const down = (): void => {
  logger.info('Running migration: notification_announcements (down)');

  // SQLite kan pas sinds 3.35 kolommen laten vallen; laten staan is hier
  // onschadelijk, want zonder de code eromheen wordt er niets gelezen.
  logger.info('Rollback completed: notification_announcements (kolommen blijven staan)');
};
