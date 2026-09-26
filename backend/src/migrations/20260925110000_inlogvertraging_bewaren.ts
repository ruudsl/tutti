/**
 * Migration: inlogvertraging bewaren
 * Created at: 2026-09-25
 *
 * De oplopende wachttijd na mislukte inlogpogingen (utils/inlogvertraging.ts)
 * stond alleen in het geheugen van het proces. Een herstart zette elke teller
 * terug op nul.
 *
 * Deze migratie maakt de tabel waarin de tellers nu staan. De sleutel is een
 * HMAC-SHA256 van het opgegeven e-mailadres plus IP-adres (wachtwoordstap) of
 * van het account (tweede stap), met een sleutel die van het servergeheim is
 * afgeleid. Er staat dus geen e-mailadres of IP-adres leesbaar in.
 *
 * Tijden zijn milliseconden sinds 1970, zoals de module ze al rekende.
 * Bestaande rijen zijn er niet: de oude tellers stonden in het geheugen.
 *
 * `down` haalt de tabel weg; de tellers staan dan weer alleen in het geheugen
 * van een oudere versie en beginnen daar op nul.
 */

import db from '../database/connection';
import logger from '../utils/logger';

export function up(): void {
  logger.info('Running migration: inlogvertraging_bewaren (up)');
  db.exec(`
    CREATE TABLE IF NOT EXISTS inlogvertragingen (
      sleutel_hash TEXT PRIMARY KEY,
      mislukt INTEGER NOT NULL,
      wachten_tot INTEGER NOT NULL,
      laatste INTEGER NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_inlogvertragingen_laatste ON inlogvertragingen(laatste)');
  logger.info('Migration completed: inlogvertraging_bewaren');
}

export function down(): void {
  logger.info('Running migration: inlogvertraging_bewaren (down)');
  db.exec('DROP INDEX IF EXISTS idx_inlogvertragingen_laatste');
  db.exec('DROP TABLE IF EXISTS inlogvertragingen');
  logger.info('Rollback completed: inlogvertraging_bewaren');
}
