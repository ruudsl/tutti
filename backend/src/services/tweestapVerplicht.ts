/**
 * Tweestapsverificatie verplicht per vereniging (associations.tweestap_verplicht,
 * migratie 20261002200000_tweestap_verplicht).
 *
 * - `uit`      - niemand hoeft;
 * - `beheer`   - beheerders en bestuur moeten;
 * - `iedereen` - elk lid moet.
 *
 * Wie moet en het nog niet heeft, krijgt van authenticateToken een 403 met
 * CODE_TWEESTAP_INSTELLEN_VERPLICHT, behalve op de routes die nodig zijn om
 * het in te stellen (middleware/auth.ts). Uitzetten mag dan niet.
 *
 * Inloggen via Microsoft vraagt in Tutti geen tweede factor
 * (routes/microsoft-auth.ts); ook voor wie zo inlogt geldt de plicht, omdat
 * hetzelfde account meestal ook met een wachtwoord kan inloggen.
 */

import db from '../database/connection';

export const TWEESTAP_STANDEN = ['uit', 'beheer', 'iedereen'] as const;
export type TweestapStand = (typeof TWEESTAP_STANDEN)[number];

/** De rollen waarvoor `beheer` geldt. */
export const TWEESTAP_BEHEERROLLEN: readonly string[] = ['admin', 'board'];

/** Moet iemand met deze rol tweestapsverificatie hebben, bij deze stand? */
export function moetTweestapHebben(stand: string | null | undefined, rol: string | null | undefined): boolean {
  if (stand === 'iedereen') return true;
  if (stand === 'beheer') return TWEESTAP_BEHEERROLLEN.includes(rol ?? '');
  return false;
}

/** De stand van een vereniging; `uit` als er geen vereniging is. */
export function tweestapStand(associationId: string | null | undefined): TweestapStand {
  if (!associationId) return 'uit';
  const rij = db.prepare('SELECT tweestap_verplicht FROM associations WHERE id = ?').get(associationId) as
    { tweestap_verplicht: string | null } | undefined;
  const stand = rij?.tweestap_verplicht;
  return (TWEESTAP_STANDEN as readonly string[]).includes(stand ?? '') ? (stand as TweestapStand) : 'uit';
}

/**
 * Moet deze gebruiker, in deze vereniging, nog tweestapsverificatie
 * instellen? De rol is die uit het token: de rol in de vereniging waar het
 * verzoek over gaat.
 */
export function moetTweestapInstellen(
  mfaAan: boolean,
  rol: string | null | undefined,
  associationId: string | null | undefined,
): boolean {
  if (mfaAan) return false;
  return moetTweestapHebben(tweestapStand(associationId), rol);
}
