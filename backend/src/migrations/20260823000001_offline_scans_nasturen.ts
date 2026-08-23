/**
 * Migration: het nasturen van offline gemaakte kaartscans
 * Created at: 2026-08-23
 *
 * De scanner aan de deur werkt door als het netwerk wegvalt en stuurt zijn
 * scans later na. Zonder een vastgelegd spoor van wat er al binnenkwam is dat
 * nasturen niet te herhalen: de scanner probeert het bij een haperende
 * verbinding gewoon nog een keer, en dan zou dezelfde lijst een tweede keer
 * worden verwerkt. Een kaart die de eerste keer netjes werd afgestempeld
 * verschijnt dan de tweede keer als botsing ("deze was al gebruikt"), en de
 * persoon die de waarschuwingen naloopt gaat achter een probleem aan dat niet
 * bestaat.
 *
 * Daarom houdt deze tabel per apparaat-scan bij dat hij verwerkt is, met de
 * uitkomst erbij. Een tweede aanbieding van dezelfde regel wordt daardoor
 * overgeslagen en levert hetzelfde antwoord op als de eerste.
 *
 * Bewust géén naam of e-mailadres van de koper in deze tabel: voor het
 * herkennen van een dubbele inzending is de kaartcode genoeg, en wat je niet
 * bewaart kan ook niet uitlekken. De rij hangt aan het concert en verdwijnt
 * mee als dat concert wordt opgeruimd.
 */

import db from '../database/connection';
import logger from '../utils/logger';

export const up = (): void => {
  logger.info('Running migration: offline_scans_nasturen (up)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_offline_scans (
      id TEXT PRIMARY KEY,
      concert_id TEXT NOT NULL,
      scan_id TEXT NOT NULL,
      qr_code TEXT NOT NULL,
      scanned_at TEXT NOT NULL,
      device_result TEXT,
      outcome TEXT NOT NULL,
      synced_by TEXT,
      synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
      FOREIGN KEY (synced_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Het apparaat verzint zelf een scan_id. Dat is alleen binnen zijn eigen
  // lijst uniek, dus de sleutel voor "heb ik deze al gehad" is het paar
  // concert + scan_id, en niet scan_id alleen: twee concerten op dezelfde
  // avond zouden anders elkaars scans als dubbel kunnen wegstrepen.
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_offline_scans_apparaat
      ON ticket_offline_scans(concert_id, scan_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ticket_offline_scans_code
      ON ticket_offline_scans(qr_code)
  `);

  logger.info('Migration completed: offline_scans_nasturen');
};

export const down = (): void => {
  logger.info('Running migration: offline_scans_nasturen (down)');

  db.exec('DROP INDEX IF EXISTS idx_ticket_offline_scans_apparaat');
  db.exec('DROP INDEX IF EXISTS idx_ticket_offline_scans_code');
  db.exec('DROP TABLE IF EXISTS ticket_offline_scans');

  logger.info('Rollback completed: offline_scans_nasturen');
};
