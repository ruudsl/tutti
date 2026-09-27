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
import logger from '../utils/logger';

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

/**
 * Hoeveel leden er nog bij kunnen voordat de grens van het abonnement bereikt
 * is, of `null` als er geen grens is. Voor een import van veel leden tegelijk,
 * waar `bewaakLedenLimiet` per lid te laat zou zijn.
 */
export function ruimteVoorLeden(associationId: string): number | null {
  const limiet = haalLimiet(associationId, 'max_members');
  if (!isBegrensd(limiet)) return null;
  return Math.max(0, limiet - telLeden(associationId));
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

// ===========================================
// OPSLAG
// ===========================================

/**
 * De opslaggrens van een vereniging, in bytes; `null` is onbeperkt.
 *
 * De grens komt uit de eerste van deze drie die iets zegt:
 *
 * 1. `associations.opslag_limiet_bytes`, door een super-admin per vereniging
 *    gezet. Leeg betekent "volgens het abonnement", nul betekent bewust
 *    onbeperkt;
 * 2. `STORAGE_QUOTA_BYTES_<ABONNEMENT>` voor het abonnement van de vereniging,
 *    bijvoorbeeld `STORAGE_QUOTA_BYTES_FREE=1073741824`;
 * 3. `STORAGE_QUOTA_BYTES` voor iedereen.
 *
 * Staat nergens iets, dan is er geen grens. Zo verandert er niets voor een
 * installatie die deze instellingen niet kent. In de omgeving betekent `0` of
 * `unlimited` onbeperkt, zodat bijvoorbeeld enterprise onbeperkt kan blijven
 * terwijl er voor de rest een standaardgrens geldt.
 *
 * max_storage_mb, dat al op associations stond, telt hier niet mee: zie de
 * migratie opslagquotum voor waarom.
 */
export type Opslaglimiet = number | null;

/**
 * Een grens uit de omgeving: `undefined` als hij niet is ingesteld, `null` voor
 * onbeperkt, anders het aantal bytes. Een waarde die geen getal is telt als
 * niet ingesteld, met een waarschuwing: een tikfout mag een vereniging niet
 * op slot zetten.
 */
function leesOmgevingsgrens(naam: string): Opslaglimiet | undefined {
  const ruw = process.env[naam]?.trim();
  if (!ruw) return undefined;
  if (ruw.toLowerCase() === 'unlimited') return null;
  if (!/^\d+$/.test(ruw)) {
    logger.warn(`${naam} is geen aantal bytes en wordt genegeerd`, { waarde: ruw });
    return undefined;
  }
  const bytes = Number(ruw);
  return bytes > 0 ? bytes : null;
}

/** De grens die bij een abonnement hoort, zonder eigen grens van de vereniging. */
export function opslaglimietVoorAbonnement(abonnement: string | null | undefined): Opslaglimiet {
  if (abonnement && /^[a-z0-9_]+$/i.test(abonnement)) {
    const perAbonnement = leesOmgevingsgrens(`STORAGE_QUOTA_BYTES_${abonnement.toUpperCase()}`);
    if (perAbonnement !== undefined) return perAbonnement;
  }
  const standaard = leesOmgevingsgrens('STORAGE_QUOTA_BYTES');
  return standaard === undefined ? null : standaard;
}

/**
 * De opslaggrens van een vereniging in bytes, of `null` voor onbeperkt. Zonder
 * vereniging is er niets om bij te tellen en dus ook geen grens.
 */
export function opslagLimiet(associationId: string | null): Opslaglimiet {
  if (!associationId) return null;
  const rij = db
    .prepare('SELECT opslag_limiet_bytes, subscription_tier FROM associations WHERE id = ?')
    .get(associationId) as { opslag_limiet_bytes: number | null; subscription_tier: string | null } | undefined;

  if (rij && rij.opslag_limiet_bytes !== null && rij.opslag_limiet_bytes !== undefined) {
    return isBegrensd(rij.opslag_limiet_bytes) ? rij.opslag_limiet_bytes : null;
  }
  return opslaglimietVoorAbonnement(rij?.subscription_tier);
}

/** Het opslaggebruik van een vereniging per soort, in bytes. */
export interface Opslaggebruik {
  bladmuziek: number;
  mp3: number;
  musicxml: number;
  opnames: number;
  wikibijlagen: number;
  mailbijlagen: number;
  totaal: number;
}

/**
 * Wat een vereniging aan opslag gebruikt, live opgeteld in één query.
 *
 * Wat meetelt, en waar de grootte staat:
 *
 * - bladmuziek (pdf): music_pieces.file_size - ook van verwijderde stukken, want
 *   die staan tot de AVG-opruiming nog op schijf;
 * - mp3's bij een titel: music_titles.mp3_file_size;
 * - MusicXML: staat als tekst in music_metadata.musicxml_raw, dus de lengte in
 *   bytes daarvan;
 * - audio-opnames: audio_recordings.file_size;
 * - wiki-bijlagen: wiki_attachments.file_size (via wiki_pages);
 * - bijlagen van mailcampagnes: email_campaign_attachments.file_size (via
 *   email_campaigns).
 *
 * Niet: profielfoto's, het logo van de vereniging, miniaturen en tijdelijke
 * bestanden van de pdf-hulpmiddelen. Die zijn klein, vervangen zichzelf of
 * worden opgeruimd.
 *
 * Omdat er niets wordt bijgehouden maar steeds wordt opgeteld, kan de telling
 * niet uit de pas lopen met de rijen; er is dus ook geen correctietaak nodig.
 * Een rij zonder grootte (een bestand dat bij de migratie al weg was) telt als
 * nul.
 */
export function opslagGebruik(associationId: string | null): Opslaggebruik {
  const rij = db
    .prepare(
      `
      SELECT
        (SELECT COALESCE(SUM(file_size), 0) FROM music_pieces WHERE association_id = ?) AS bladmuziek,
        (SELECT COALESCE(SUM(mp3_file_size), 0) FROM music_titles WHERE association_id = ?) AS mp3,
        (SELECT COALESCE(SUM(LENGTH(CAST(mm.musicxml_raw AS BLOB))), 0)
           FROM music_metadata mm JOIN music_titles mt ON mt.id = mm.music_title_id
          WHERE mt.association_id = ?) AS musicxml,
        (SELECT COALESCE(SUM(file_size), 0) FROM audio_recordings WHERE association_id = ?) AS opnames,
        (SELECT COALESCE(SUM(wa.file_size), 0)
           FROM wiki_attachments wa JOIN wiki_pages wp ON wp.id = wa.page_id
          WHERE wp.association_id = ?) AS wikibijlagen,
        (SELECT COALESCE(SUM(ea.file_size), 0)
           FROM email_campaign_attachments ea JOIN email_campaigns ec ON ec.id = ea.campaign_id
          WHERE ec.association_id = ?) AS mailbijlagen
    `,
    )
    .get(associationId, associationId, associationId, associationId, associationId, associationId) as Omit<
    Opslaggebruik,
    'totaal'
  >;

  const totaal = rij.bladmuziek + rij.mp3 + rij.musicxml + rij.opnames + rij.wikibijlagen + rij.mailbijlagen;
  return { ...rij, totaal };
}

/**
 * Hoeveel bytes er nog bij kunnen, of `null` als er geen grens is. Kan nul
 * zijn, nooit negatief: een vereniging die al boven haar grens zit (omdat die
 * later omlaag ging) raakt niets kwijt, er kan alleen niets meer bij.
 */
export function ruimteVoorOpslag(associationId: string | null): number | null {
  const limiet = opslagLimiet(associationId);
  if (limiet === null) return null;
  return Math.max(0, limiet - opslagGebruik(associationId).totaal);
}

/** De code in het antwoord bij 413, zodat de frontend een vertaalde melding kan tonen. */
export const OPSLAGLIMIET_CODE = 'OPSLAGLIMIET_BEREIKT';

function formatteerBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Weiger een schrijfactie die de opslaggrens zou overschrijden, met 413.
 *
 * @param bytes wat er bij komt.
 * @param vrijkomend wat er tegelijk verdwijnt, bij het vervangen van een
 *   bestand (een nieuwe mp3 over de oude heen).
 */
export function bewaakOpslag(associationId: string | null, bytes: number, vrijkomend = 0): void {
  const limiet = opslagLimiet(associationId);
  if (limiet === null) return;

  const gebruikt = opslagGebruik(associationId).totaal;
  if (gebruikt - vrijkomend + bytes > limiet) {
    throw new ApiError(
      413,
      `De opslaglimiet van deze vereniging is bereikt: ${formatteerBytes(gebruikt)} van ${formatteerBytes(limiet)} in gebruik, en hier komt ${formatteerBytes(bytes)} bij. Verwijder eerst bestanden of verhoog de grens bij het abonnement.`,
      true,
      OPSLAGLIMIET_CODE,
    );
  }
}
