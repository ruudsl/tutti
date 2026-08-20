/**
 * De grenzen die bij het abonnement van een vereniging horen.
 *
 * De kolommen max_members, max_orchestras en max_storage_mb staan sinds de
 * multi-vereniging-migratie op associations en zijn door een super-admin in te
 * stellen. Ze werden alleen opgeslagen en teruggegeven: geen enkele route keek
 * ernaar, dus een vereniging met max_members op 100 kon er duizend hebben.
 *
 * Deze module maakt er een echte grens van. Een limiet die niet is ingevuld -
 * NULL, nul of negatief - betekent geen grens; zo blijft een bestaande
 * installatie werken die deze velden nooit heeft aangeraakt, en kan een
 * super-admin een vereniging bewust onbeperkt zetten.
 *
 * De telling gebeurt op het moment van toevoegen. Een vereniging die al boven
 * haar grens zit - omdat de grens later omlaag ging - raakt niemand kwijt; er
 * kan alleen niets meer bij.
 */

import db from '../database/connection';
import { ApiError } from '../middleware/errorHandler';

/** Een limietwaarde die niet is ingevuld betekent: geen grens. */
function isBegrensd(waarde: number | null | undefined): waarde is number {
  return typeof waarde === 'number' && waarde > 0;
}

function haalLimiet(associationId: string, kolom: 'max_members' | 'max_orchestras'): number | null {
  const rij = db.prepare(`SELECT ${kolom} AS limiet FROM associations WHERE id = ?`).get(associationId) as
    { limiet: number | null } | undefined;
  return rij?.limiet ?? null;
}

/**
 * Het aantal leden van een vereniging.
 *
 * Lidmaatschap loopt langs twee wegen: users.association_id voor de vereniging
 * waar iemand thuishoort, en user_associations voor wie bij meer dan een
 * vereniging speelt. Iemand die in beide staat telt een keer.
 */
export function telLeden(associationId: string): number {
  const rij = db
    .prepare(
      `
      SELECT COUNT(*) AS aantal FROM (
        SELECT id FROM users WHERE association_id = ? AND deleted_at IS NULL
        UNION
        SELECT u.id FROM users u
        JOIN user_associations ua ON u.id = ua.user_id
        WHERE ua.association_id = ? AND ua.status = 'active' AND u.deleted_at IS NULL
      )
    `,
    )
    .get(associationId, associationId) as { aantal: number };
  return rij.aantal;
}

/** Het aantal orkesten van een vereniging. */
export function telOrkesten(associationId: string): number {
  const rij = db.prepare('SELECT COUNT(*) AS aantal FROM orchestras WHERE association_id = ?').get(associationId) as {
    aantal: number;
  };
  return rij.aantal;
}

/**
 * Blokkeer het toevoegen van een lid zodra de grens bereikt is.
 *
 * Wordt aangeroepen voor het aanmaken, voor het versturen van een uitnodiging
 * en nogmaals bij het aannemen ervan: tussen die twee momenten kan een week
 * zitten waarin de vereniging alsnog volloopt.
 */
export function bewaakLedenLimiet(associationId: string): void {
  const limiet = haalLimiet(associationId, 'max_members');
  if (!isBegrensd(limiet)) return;

  if (telLeden(associationId) >= limiet) {
    throw new ApiError(
      409,
      `Deze vereniging heeft het maximum van ${limiet} leden bereikt. Verhoog de grens bij het abonnement of verwijder eerst een lid.`,
    );
  }
}

/** Blokkeer het toevoegen van een orkest zodra de grens bereikt is. */
export function bewaakOrkestLimiet(associationId: string): void {
  const limiet = haalLimiet(associationId, 'max_orchestras');
  if (!isBegrensd(limiet)) return;

  if (telOrkesten(associationId) >= limiet) {
    throw new ApiError(
      409,
      `Deze vereniging heeft het maximum van ${limiet} orkesten bereikt. Verhoog de grens bij het abonnement of verwijder eerst een orkest.`,
    );
  }
}
