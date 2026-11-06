/**
 * De startlijst voor de beheerder van een nieuwe vereniging.
 *
 * docs/PILOT_ONBOARDING.md §2 zet de eerste week op een rij, maar in de app
 * zelf stond nergens wat er nog moest. Een beheerder die zonder handleiding
 * begon, zag een leeg dashboard. Hier staat per stap of hij gedaan is,
 * afgelezen aan de gegevens zelf: niets hoeft met de hand afgevinkt te
 * worden, en een stap die later ongedaan wordt (de SMTP gaat uit) komt
 * vanzelf terug.
 *
 * E-mail staat bovenaan en krijgt op het dashboard ook een eigen waarschuwing:
 * zonder SMTP verstuurt Tutti niets, ook geen "Wachtwoord vergeten", terwijl
 * dat scherm de gebruiker wel "E-mail verzonden" laat zien.
 */

import db from '../database/connection';

export type StartStap = 'email' | 'tweestap' | 'modules' | 'orkesten' | 'leden' | 'repetities' | 'bewaartermijnen';

export interface StartlijstStap {
  sleutel: StartStap;
  gedaan: boolean;
}

/** Kan deze vereniging mail versturen? Dezelfde volgorde als utils/email.ts. */
export function kanMailVersturen(associationId: string): boolean {
  const eigen = db
    .prepare('SELECT 1 FROM associations WHERE id = ? AND smtp_enabled = 1 AND smtp_host IS NOT NULL')
    .get(associationId);
  return !!eigen || !!process.env.SMTP_HOST;
}

const telt = (sql: string, ...params: unknown[]) =>
  ((db.prepare(sql).get(...params) as { n: number } | undefined)?.n ?? 0) > 0;

export function startlijst(associationId: string, beheerderId: string): StartlijstStap[] {
  return [
    { sleutel: 'email', gedaan: kanMailVersturen(associationId) },
    {
      sleutel: 'tweestap',
      gedaan: telt('SELECT COUNT(*) AS n FROM users WHERE id = ? AND mfa_enabled = 1', beheerderId),
    },
    // Een rij in association_modules betekent dat de beheerder een module
    // aan- of uitgezet heeft: hij heeft er dan naar gekeken.
    {
      sleutel: 'modules',
      gedaan: telt('SELECT COUNT(*) AS n FROM association_modules WHERE association_id = ?', associationId),
    },
    {
      sleutel: 'orkesten',
      gedaan: telt('SELECT COUNT(*) AS n FROM orchestras WHERE association_id = ?', associationId),
    },
    // Meer dan alleen de beheerder zelf.
    {
      sleutel: 'leden',
      gedaan:
        (
          db
            .prepare('SELECT COUNT(*) AS n FROM users WHERE association_id = ? AND deleted_at IS NULL AND id != ?')
            .get(associationId, beheerderId) as { n: number }
        ).n > 0,
    },
    {
      sleutel: 'repetities',
      gedaan: telt('SELECT COUNT(*) AS n FROM rehearsals WHERE association_id = ?', associationId),
    },
    {
      sleutel: 'bewaartermijnen',
      gedaan: telt('SELECT COUNT(*) AS n FROM data_retention_settings WHERE association_id = ?', associationId),
    },
  ];
}
