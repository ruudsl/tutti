/**
 * Migration: geheimen van koppelingen versleuteld opslaan
 * Created at: 2026-09-25
 *
 * Het SMTP-wachtwoord, de tokens voor Telegram, WhatsApp en Twilio, het
 * clientgeheim van Entra ID en de Google-tokens stonden als klaartekst in de
 * database. Wie een back-up of het databasebestand in handen krijgt, kon
 * daarmee mail versturen namens de vereniging, berichten sturen via haar bot
 * en haar Microsoft-tenant uitlezen.
 *
 * Voortaan versleutelt de code ze bij het opslaan met utils/encryption.ts, net
 * als de Mollie-sleutel per vereniging. Deze migratie doet dat voor de waarden
 * die er al staan.
 *
 * Idempotent: een waarde die al cijfertekst is wordt overgeslagen. Een kolom
 * die in deze installatie niet bestaat ook: google_calendar_client_secret komt
 * uit database/init.ts, en die draait pas na de migraties.
 *
 * `down` ontsleutelt alles weer naar klaartekst, ook wat na deze migratie is
 * opgeslagen: de vorige versie van de code leest alleen klaartekst.
 */

import db from '../database/connection';
import logger from '../utils/logger';
import { decrypt, encrypt, isEncrypted } from '../utils/encryption';

/** Vaste lijst: een migratie hoort niet mee te veranderen met de code. */
const KOLOMMEN: { tabel: string; kolom: string }[] = [
  { tabel: 'associations', kolom: 'smtp_pass' },
  { tabel: 'associations', kolom: 'microsoft_client_secret' },
  { tabel: 'associations', kolom: 'telegram_bot_token' },
  { tabel: 'associations', kolom: 'whatsapp_access_token' },
  { tabel: 'associations', kolom: 'twilio_auth_token' },
  { tabel: 'associations', kolom: 'google_calendar_client_secret' },
  { tabel: 'seating_notification_settings', kolom: 'twilio_auth_token' },
  { tabel: 'user_calendar_settings', kolom: 'google_refresh_token' },
  { tabel: 'user_calendar_settings', kolom: 'google_access_token' },
];

function kolomBestaat(tabel: string, kolom: string): boolean {
  const kolommen = db.prepare(`PRAGMA table_info(${tabel})`).all() as { name: string }[];
  return kolommen.some((k) => k.name === kolom);
}

function gevuldeWaarden(tabel: string, kolom: string): { rij: number; waarde: string }[] {
  return db
    .prepare(`SELECT rowid AS rij, ${kolom} AS waarde FROM ${tabel} WHERE ${kolom} IS NOT NULL AND ${kolom} != ''`)
    .all() as { rij: number; waarde: string }[];
}

export const up = (): void => {
  logger.info('Running migration: koppelingsgeheimen_versleutelen (up)');

  for (const { tabel, kolom } of KOLOMMEN) {
    if (!kolomBestaat(tabel, kolom)) continue;

    const rijen = gevuldeWaarden(tabel, kolom);
    const bijwerken = db.prepare(`UPDATE ${tabel} SET ${kolom} = ? WHERE rowid = ?`);
    let versleuteld = 0;
    for (const { rij, waarde } of rijen) {
      if (isEncrypted(waarde)) continue;
      // Geen try/catch: zonder bruikbaar ENCRYPTION_SECRET moet de migratie
      // stoppen, niet als gedaan worden geboekt met de klaartekst nog erin.
      bijwerken.run(encrypt(waarde), rij);
      versleuteld++;
    }
    logger.info(`  ${tabel}.${kolom}: ${versleuteld} van ${rijen.length} waarden versleuteld`);
  }

  logger.info('Migration completed: koppelingsgeheimen_versleutelen');
};

export const down = (): void => {
  logger.info('Running migration: koppelingsgeheimen_versleutelen (down)');

  for (const { tabel, kolom } of KOLOMMEN) {
    if (!kolomBestaat(tabel, kolom)) continue;

    const rijen = gevuldeWaarden(tabel, kolom);
    const bijwerken = db.prepare(`UPDATE ${tabel} SET ${kolom} = ? WHERE rowid = ?`);
    let ontsleuteld = 0;
    let mislukt = 0;
    for (const { rij, waarde } of rijen) {
      if (!isEncrypted(waarde)) continue;
      try {
        bijwerken.run(decrypt(waarde), rij);
        ontsleuteld++;
      } catch {
        mislukt++;
      }
    }
    logger.info(`  ${tabel}.${kolom}: ${ontsleuteld} van ${rijen.length} waarden ontsleuteld`);
    if (mislukt > 0) {
      logger.warn(`  ${tabel}.${kolom}: ${mislukt} waarden niet te ontsleutelen; ongewijzigd gelaten`);
    }
  }

  logger.info('Migration completed: koppelingsgeheimen_versleutelen (down)');
};
