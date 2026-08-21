/**
 * Muziek delen tussen verenigingen.
 *
 * Vier regels dragen alles hier:
 *
 * 1. **Koppelen gaat via een code.** Er is bewust geen lijst van verenigingen
 *    op het platform. Een vereniging maakt een code aan, geeft die buiten Tutti
 *    om door, en de ander voert hem in. Je weet dus altijd met wie je gekoppeld
 *    bent, want je hebt die ander zelf gesproken.
 * 2. **Delen gaat per titel, met uitzonderingen.** Een titel wordt opengezet
 *    voor bepaalde gekoppelde verenigingen. Losse partijen kunnen daarvan
 *    worden uitgesloten - een dirigentenpartituur bijvoorbeeld. Zo'n
 *    uitsluiting hoort bij de partij en geldt dus voor alle partners.
 * 3. **Een bestand komt er niet vanzelf uit.** Een partner ziet de catalogus:
 *    welke stukken er zijn en welke partijen erbij horen. Voor het bestand zelf
 *    dient hij een verzoek in en beslist de eigenaar per keer.
 * 4. **Intern blijft intern.** `internal_notes` gaat nooit mee.
 *
 * Let op bij het lezen: music_pieces heeft geen verwijzing naar music_titles.
 * Een partij hoort bij een titel doordat titel en arrangeur overeenkomen binnen
 * dezelfde vereniging. Dat is het bestaande model; `partijenVanTitel` is de
 * enige plek die dat weet.
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';

/**
 * Tekens voor een koppelcode. Zonder O/0 en I/1/L, want deze code wordt
 * overgetypt van een briefje of voorgelezen door de telefoon.
 */
const CODETEKENS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Hoe lang een verse koppelcode bruikbaar blijft. */
export const CODE_GELDIG_UREN = 72;

/** Hoe lang toegang tot een vrijgegeven bestand standaard duurt. */
export const TOEGANG_GELDIG_DAGEN = 30;

export interface Koppelcode {
  code: string;
  expiresAt: string;
}

function willekeurigeCode(): string {
  const blok = () => Array.from({ length: 4 }, () => CODETEKENS[crypto.randomInt(CODETEKENS.length)]).join('');
  return `${blok()}-${blok()}`;
}

/**
 * Maakt een nieuwe koppelcode voor een vereniging.
 *
 * Openstaande codes van dezelfde vereniging worden ingetrokken. Anders
 * stapelen ze zich op en blijft een code die je ooit hebt rondgestuurd
 * bruikbaar terwijl je denkt dat de nieuwe de oude vervangt.
 */
export function maakKoppelcode(associationId: string, userId: string): Koppelcode {
  db.prepare('DELETE FROM association_link_codes WHERE association_id = ? AND used_at IS NULL').run(associationId);

  // Een botsing is bij 31^8 mogelijkheden onwaarschijnlijk, maar de kolom is
  // UNIQUE en een 500 bij het aanmaken van een code is een slechte ruil voor
  // een lus die vrijwel nooit een tweede ronde doet.
  for (let poging = 0; poging < 10; poging++) {
    const code = willekeurigeCode();
    const bezet = db.prepare('SELECT 1 FROM association_link_codes WHERE code = ?').get(code);
    if (bezet) continue;

    const vervalt = new Date(Date.now() + CODE_GELDIG_UREN * 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO association_link_codes (id, association_id, code, created_by, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(uuidv4(), associationId, code, userId, vervalt);

    return { code, expiresAt: vervalt };
  }

  throw new Error('Kon geen vrije koppelcode maken');
}

export type InwisselFout = 'onbekend' | 'verlopen' | 'gebruikt' | 'eigen-vereniging' | 'al-gekoppeld';

export interface InwisselResultaat {
  fout?: InwisselFout;
  partnerId?: string;
  partnerNaam?: string;
}

/**
 * Wisselt een koppelcode in en maakt het partnerschap actief.
 *
 * De code is eenmalig. Het partnerschap dat eruit komt staat meteen op
 * `active` met `share_music` aan: beide kanten hebben er bewust voor gekozen -
 * de een door de code te maken, de ander door hem in te voeren - dus een
 * losse goedkeuringsstap erna voegt niets toe.
 */
export function wisselKoppelcodeIn(code: string, associationId: string, userId: string): InwisselResultaat {
  const rij = db
    .prepare(
      `SELECT id, association_id, expires_at, used_at FROM association_link_codes
       WHERE code = ?`,
    )
    .get(code.trim().toUpperCase()) as
    { id: string; association_id: string; expires_at: string; used_at: string | null } | undefined;

  if (!rij) return { fout: 'onbekend' };
  if (rij.used_at) return { fout: 'gebruikt' };
  if (new Date(rij.expires_at).getTime() <= Date.now()) return { fout: 'verlopen' };
  if (rij.association_id === associationId) return { fout: 'eigen-vereniging' };

  const eigenaar = rij.association_id;
  const bestaand = db
    .prepare(
      `SELECT id, status FROM association_partnerships
       WHERE (association_a_id = ? AND association_b_id = ?)
          OR (association_a_id = ? AND association_b_id = ?)`,
    )
    .get(eigenaar, associationId, associationId, eigenaar) as { id: string; status: string } | undefined;

  if (bestaand && bestaand.status === 'active') return { fout: 'al-gekoppeld' };

  if (bestaand) {
    db.prepare(
      `UPDATE association_partnerships
       SET status = 'active', share_music = 1, approved_by = ?, approved_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(userId, bestaand.id);
  } else {
    db.prepare(
      `INSERT INTO association_partnerships
         (id, association_a_id, association_b_id, partnership_type, share_music, status, requested_by, approved_by, approved_at)
       VALUES (?, ?, ?, 'sharing', 1, 'active', ?, ?, CURRENT_TIMESTAMP)`,
    ).run(uuidv4(), eigenaar, associationId, userId, userId);
  }

  db.prepare(
    'UPDATE association_link_codes SET used_at = CURRENT_TIMESTAMP, used_by_association_id = ? WHERE id = ?',
  ).run(associationId, rij.id);

  const partner = db.prepare('SELECT name FROM associations WHERE id = ?').get(eigenaar) as
    { name: string } | undefined;

  return { partnerId: eigenaar, partnerNaam: partner?.name };
}

export interface GekoppeldeVereniging {
  id: string;
  name: string;
  displayName: string | null;
}

/** De verenigingen waarmee een actief muziekpartnerschap bestaat. */
export function gekoppeldeVerenigingen(associationId: string): GekoppeldeVereniging[] {
  return db
    .prepare(
      `SELECT a.id, a.name, a.display_name AS displayName
       FROM association_partnerships ap
       JOIN associations a
         ON a.id = CASE WHEN ap.association_a_id = ? THEN ap.association_b_id ELSE ap.association_a_id END
       WHERE (ap.association_a_id = ? OR ap.association_b_id = ?)
         AND ap.status = 'active'
         AND ap.share_music = 1
         AND COALESCE(a.is_active, 1) = 1
       ORDER BY a.name`,
    )
    .all(associationId, associationId, associationId) as GekoppeldeVereniging[];
}

/** Is er een actief muziekpartnerschap tussen deze twee? */
export function isGekoppeld(associationId: string, partnerId: string): boolean {
  return gekoppeldeVerenigingen(associationId).some((v) => v.id === partnerId);
}

export interface Partij {
  id: string;
  instrumentName: string | null;
  tuning: string | null;
  groupNumber: string | null;
  originalFilename: string;
  uitgesloten: boolean;
}

/**
 * De partijen die bij een titel horen.
 *
 * music_pieces verwijst niet naar music_titles; de koppeling loopt over de
 * tekst van titel en arrangeur binnen dezelfde vereniging. `IS` in plaats van
 * `=` bij de arrangeur, omdat die bij beide kanten NULL kan zijn en NULL = NULL
 * in SQL niet waar is.
 */
export function partijenVanTitel(titelId: string): Partij[] {
  return db
    .prepare(
      `SELECT mp.id, i.name AS instrumentName, mp.tuning, mp.group_number AS groupNumber,
              mp.original_filename AS originalFilename,
              CASE WHEN mse.id IS NULL THEN 0 ELSE 1 END AS uitgeslotenVlag
       FROM music_titles mt
       JOIN music_pieces mp
         ON mp.title = mt.title AND mp.arranger IS mt.arranger
        AND mp.association_id = mt.association_id
       LEFT JOIN instruments i ON i.id = mp.instrument_id
       LEFT JOIN music_share_exclusions mse ON mse.music_piece_id = mp.id
       WHERE mt.id = ? AND mp.deleted_at IS NULL
       ORDER BY i.name, mp.group_number`,
    )
    .all(titelId)
    .map((r) => {
      const rij = r as Partij & { uitgeslotenVlag: number };
      return {
        id: rij.id,
        instrumentName: rij.instrumentName,
        tuning: rij.tuning,
        groupNumber: rij.groupNumber,
        originalFilename: rij.originalFilename,
        uitgesloten: !!rij.uitgeslotenVlag,
      };
    });
}

/**
 * Mag deze vereniging deze titel zien?
 *
 * Er moet een deling zijn voor precies deze partner, en het partnerschap moet
 * op dit moment actief zijn. Een deling die blijft staan nadat een partnerschap
 * is beeindigd geeft dus niets - dat is de reden dat beide voorwaarden hier
 * samen staan en niet alleen bij het aanmaken worden gecontroleerd.
 */
export function magTitelZien(kijkerAssociationId: string, titelId: string): boolean {
  const deling = db
    .prepare(
      `SELECT mt.association_id AS eigenaar
       FROM music_title_shares mts
       JOIN music_titles mt ON mt.id = mts.music_title_id
       WHERE mts.music_title_id = ? AND mts.partner_association_id = ? AND mt.deleted_at IS NULL`,
    )
    .get(titelId, kijkerAssociationId) as { eigenaar: string } | undefined;

  if (!deling) return false;
  return isGekoppeld(kijkerAssociationId, deling.eigenaar);
}

/**
 * Mag deze vereniging dit bestand ophalen?
 *
 * Alleen met een goedgekeurd verzoek dat nog niet is verlopen, en alleen zolang
 * de titel ook echt gedeeld blijft. Trekt de eigenaar de deling in, dan vervalt
 * de toegang meteen - een eerdere goedkeuring is geen blijvend recht.
 */
export function magBestandOphalen(kijkerAssociationId: string, partijId: string): boolean {
  // De vervaldatum staat als ISO-tekst in de kolom ('2026-09-20T12:00:00.000Z')
  // en wordt als tekst vergeleken. CURRENT_TIMESTAMP levert '2026-09-20
  // 12:00:00': dezelfde volgorde tot en met de datum, maar op positie elf staat
  // een 'T' tegenover een spatie, en 'T' is groter. Elke vervaltijd van vandaag
  // gold daardoor als toekomst en de toegang liep pas om middernacht af. Nu
  // gaat het nu-moment in dezelfde ISO-vorm mee als parameter.
  const verzoek = db
    .prepare(
      `SELECT id FROM music_file_requests
       WHERE music_piece_id = ? AND requesting_association_id = ? AND status = 'approved'
         AND (access_expires_at IS NULL OR access_expires_at > ?)`,
    )
    .get(partijId, kijkerAssociationId, new Date().toISOString());

  if (!verzoek) return false;

  const titel = titelVanPartij(partijId);
  if (!titel) return false;
  if (isUitgesloten(partijId)) return false;

  return magTitelZien(kijkerAssociationId, titel.id);
}

/** De titel waar een partij bij hoort, via titel en arrangeur binnen de vereniging. */
export function titelVanPartij(partijId: string): { id: string; associationId: string } | undefined {
  return db
    .prepare(
      `SELECT mt.id, mt.association_id AS associationId
       FROM music_pieces mp
       JOIN music_titles mt
         ON mt.title = mp.title AND mt.arranger IS mp.arranger
        AND mt.association_id = mp.association_id
       WHERE mp.id = ? AND mp.deleted_at IS NULL AND mt.deleted_at IS NULL`,
    )
    .get(partijId) as { id: string; associationId: string } | undefined;
}

/** Staat deze partij op de uitzonderingenlijst? */
export function isUitgesloten(partijId: string): boolean {
  return !!db.prepare('SELECT 1 FROM music_share_exclusions WHERE music_piece_id = ?').get(partijId);
}
