/**
 * Migration: oude cijfertekst opnieuw versleutelen met ENCRYPTION_SECRET
 * Created at: 2026-09-25
 *
 * Tot nu toe hing de sleutel voor opgeslagen geheimen aan JWT_SECRET (zolang
 * ENCRYPTION_SECRET ontbrak), en had het Spond-wachtwoord een eigen sleutel,
 * ook van JWT_SECRET afgeleid. Wie JWT_SECRET verving - na een lek, of omdat
 * het hostingplatform een nieuw genereerde - maakte daarmee ongemerkt ook de
 * MFA-geheimen, Mollie-sleutels en het Spond-wachtwoord onleesbaar.
 *
 * Deze migratie zet de bestaande cijfertekst zonder sleutelversie om naar
 * `v1`, afgeleid van ENCRYPTION_SECRET. Daarna hangt niets opgeslagens meer
 * aan JWT_SECRET. utils/encryption.ts kan oude cijfertekst blijven lezen, dus
 * een waarde die hier niet te ontsleutelen is blijft staan zoals hij stond.
 *
 * Idempotent: een waarde met sleutelversie wordt overgeslagen.
 *
 * `down` zet elke `v1`-waarde in deze kolommen terug naar het oude formaat,
 * met de sleutel die de vorige versie van de code in deze omgeving zou
 * gebruiken. Ook waarden die na deze migratie zijn opgeslagen: anders kan de
 * vorige versie ze niet lezen.
 *
 * Mollie-sleutels die nog als base64 staan en MFA-geheimen die nog als
 * klaartekst staan blijven ongemoeid; die zetten payment-settings.ts en
 * utils/mfa.ts zelf om bij het eerstvolgende gebruik.
 */

import db from '../database/connection';
import logger from '../utils/logger';
import { decrypt, encrypt, heeftOudFormaat, isEncrypted, versleutelInOudFormaat } from '../utils/encryption';

/** Vaste lijst: een migratie hoort niet mee te veranderen met de code. */
const KOLOMMEN: { tabel: string; kolom: string; soort: 'algemeen' | 'spond' }[] = [
  { tabel: 'spond_config', kolom: 'password_encrypted', soort: 'spond' },
  { tabel: 'payment_settings', kolom: 'mollie_api_key_encrypted', soort: 'algemeen' },
  { tabel: 'payment_settings', kolom: 'mollie_test_api_key_encrypted', soort: 'algemeen' },
  { tabel: 'users', kolom: 'mfa_secret', soort: 'algemeen' },
];

function kolomBestaat(tabel: string, kolom: string): boolean {
  const kolommen = db.prepare(`PRAGMA table_info(${tabel})`).all() as { name: string }[];
  return kolommen.some((k) => k.name === kolom);
}

/**
 * Loop de gevulde waarden van één kolom langs. Voor elke waarde waarvoor
 * `moetOm` waar is: ontsleutelen, en opnieuw versleutelen met `versleutel`.
 *
 * Alleen het ontsleutelen mag mislukken - die waarde blijft dan staan en telt
 * als mislukt. Een fout bij het versleutelen (geen of een ongeldig
 * ENCRYPTION_SECRET) breekt de migratie af, zodat hij niet als gedaan wordt
 * geboekt terwijl er niets is omgezet.
 */
function zetOm(
  tabel: string,
  kolom: string,
  moetOm: (waarde: string) => boolean,
  versleutel: (klaartekst: string) => string,
): { omgezet: number; mislukt: number; totaal: number } {
  if (!kolomBestaat(tabel, kolom)) return { omgezet: 0, mislukt: 0, totaal: 0 };

  const rijen = db
    .prepare(`SELECT rowid AS rij, ${kolom} AS waarde FROM ${tabel} WHERE ${kolom} IS NOT NULL AND ${kolom} != ''`)
    .all() as { rij: number; waarde: string }[];
  const bijwerken = db.prepare(`UPDATE ${tabel} SET ${kolom} = ? WHERE rowid = ?`);

  let omgezet = 0;
  let mislukt = 0;
  for (const { rij, waarde } of rijen) {
    if (!moetOm(waarde)) continue;
    let klaartekst: string;
    try {
      klaartekst = decrypt(waarde);
    } catch {
      mislukt++;
      continue;
    }
    bijwerken.run(versleutel(klaartekst), rij);
    omgezet++;
  }
  return { omgezet, mislukt, totaal: rijen.length };
}

export const up = (): void => {
  logger.info('Running migration: oude_cijfertekst_herversleutelen (up)');

  for (const { tabel, kolom } of KOLOMMEN) {
    const { omgezet, mislukt, totaal } = zetOm(tabel, kolom, heeftOudFormaat, encrypt);
    logger.info(`  ${tabel}.${kolom}: ${omgezet} van ${totaal} waarden omgezet naar de huidige sleutel`);
    if (mislukt > 0) {
      logger.warn(
        `  ${tabel}.${kolom}: ${mislukt} waarden niet te ontsleutelen met ENCRYPTION_SECRET of JWT_SECRET; ongewijzigd gelaten`,
      );
    }
  }

  logger.info('Migration completed: oude_cijfertekst_herversleutelen');
};

export const down = (): void => {
  logger.info('Running migration: oude_cijfertekst_herversleutelen (down)');

  for (const { tabel, kolom, soort } of KOLOMMEN) {
    const { omgezet, mislukt, totaal } = zetOm(
      tabel,
      kolom,
      (waarde) => isEncrypted(waarde) && !heeftOudFormaat(waarde),
      (klaartekst) => versleutelInOudFormaat(klaartekst, soort),
    );
    logger.info(`  ${tabel}.${kolom}: ${omgezet} van ${totaal} waarden teruggezet naar het oude formaat`);
    if (mislukt > 0) {
      logger.warn(`  ${tabel}.${kolom}: ${mislukt} waarden niet te ontsleutelen; ongewijzigd gelaten`);
    }
  }

  logger.info('Migration completed: oude_cijfertekst_herversleutelen (down)');
};
