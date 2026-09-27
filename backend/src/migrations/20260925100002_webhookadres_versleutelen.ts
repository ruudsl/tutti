/**
 * Migration: webhook-adres van de opstellingsmelding versleuteld opslaan
 * Created at: 2026-09-25
 *
 * `seating_notification_settings.webhook_url` stond als klaartekst in de
 * database. Voor een webhook van Slack, Discord, Make of n8n is het adres zelf
 * het geheim: wie het kent, kan berichten in het kanaal van de vereniging
 * zetten. Wie een back-up of het databasebestand in handen krijgt, had het.
 *
 * Voortaan versleutelt de code het adres bij het opslaan met
 * utils/encryption.ts, net als de andere geheimen van koppelingen
 * (20260925100001_koppelingsgeheimen_versleutelen). Deze migratie doet dat
 * voor de adressen die er al staan.
 *
 * Idempotent: een waarde die al cijfertekst is wordt overgeslagen.
 *
 * `down` ontsleutelt alles weer naar klaartekst, ook wat na deze migratie is
 * opgeslagen: de vorige versie van de code leest alleen klaartekst.
 */

import db from '../database/connection';
import logger from '../utils/logger';
import { decrypt, encrypt, isEncrypted } from '../utils/encryption';

function gevuldeWaarden(): { id: string; waarde: string }[] {
  return db
    .prepare(
      `SELECT id, webhook_url AS waarde FROM seating_notification_settings
       WHERE webhook_url IS NOT NULL AND webhook_url != ''`,
    )
    .all() as { id: string; waarde: string }[];
}

export const up = (): void => {
  logger.info('Running migration: webhookadres_versleutelen (up)');

  const rijen = gevuldeWaarden();
  const bijwerken = db.prepare('UPDATE seating_notification_settings SET webhook_url = ? WHERE id = ?');
  let versleuteld = 0;
  for (const { id, waarde } of rijen) {
    if (isEncrypted(waarde)) continue;
    // Geen try/catch: zonder bruikbaar ENCRYPTION_SECRET moet de migratie
    // stoppen, niet als gedaan worden geboekt met de klaartekst nog erin.
    bijwerken.run(encrypt(waarde), id);
    versleuteld++;
  }
  logger.info(`  seating_notification_settings.webhook_url: ${versleuteld} van ${rijen.length} waarden versleuteld`);

  logger.info('Migration completed: webhookadres_versleutelen');
};

export const down = (): void => {
  logger.info('Running migration: webhookadres_versleutelen (down)');

  const rijen = gevuldeWaarden();
  const bijwerken = db.prepare('UPDATE seating_notification_settings SET webhook_url = ? WHERE id = ?');
  let ontsleuteld = 0;
  let mislukt = 0;
  for (const { id, waarde } of rijen) {
    if (!isEncrypted(waarde)) continue;
    try {
      bijwerken.run(decrypt(waarde), id);
      ontsleuteld++;
    } catch {
      mislukt++;
    }
  }
  logger.info(`  seating_notification_settings.webhook_url: ${ontsleuteld} van ${rijen.length} waarden ontsleuteld`);
  if (mislukt > 0) {
    logger.warn(
      `  seating_notification_settings.webhook_url: ${mislukt} waarden niet te ontsleutelen; ongewijzigd gelaten`,
    );
  }

  logger.info('Migration completed: webhookadres_versleutelen (down)');
};
