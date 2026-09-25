/**
 * Genres en instrumenten per vereniging (besluit september 2026; migratie
 * 20260924200000_genres_en_instrumenten_per_vereniging).
 *
 * - Standaard (`association_id` leeg): voor iedereen, beheerd door de
 *   superbeheerder.
 * - Eigen (`association_id` gevuld): alleen voor die vereniging.
 * - Verborgen (`catalogus_verborgen`): een standaarditem dat een vereniging
 *   niet in haar keuzelijsten wil zien.
 *
 * Twee vragen, twee antwoorden:
 * - Wat ziet een vereniging in een keuzelijst, en waaraan koppelt een import
 *   of een naam? `zichtbaar`: standaard en niet verborgen, of eigen.
 * - Waar mag een verzoek naar verwijzen? `bruikbaar`: standaard (ook
 *   verborgen, want wat er al aan hangt moet te bewerken blijven) of eigen.
 *   Nooit een eigen item van een andere vereniging.
 */

import db from '../database/connection';
import { ApiError } from '../middleware/errorHandler';

export type CatalogusSoort = 'genre' | 'instrument';

const TABEL: Record<CatalogusSoort, 'genres' | 'instruments'> = { genre: 'genres', instrument: 'instruments' };

/**
 * SQL-voorwaarde voor "zichtbaar voor de vereniging" op alias `a` (de
 * genres- of instruments-tabel). Hoort bij `zichtbaarParams`.
 */
export function zichtbaarVoorwaarde(a: string): string {
  return `((${a}.association_id IS NULL AND NOT EXISTS (
      SELECT 1 FROM catalogus_verborgen v
      WHERE v.association_id = ? AND v.soort = ? AND v.item_id = ${a}.id
    )) OR ${a}.association_id = ?)`;
}

export function zichtbaarParams(associationId: string | null | undefined, soort: CatalogusSoort): unknown[] {
  const vereniging = associationId ?? '';
  return [vereniging, soort, vereniging];
}

/** SQL-voorwaarde voor "bruikbaar voor de vereniging" op alias `a`; één parameter: de vereniging. */
export function bruikbaarVoorwaarde(a: string): string {
  return `(${a}.association_id IS NULL OR ${a}.association_id = ?)`;
}

export interface CatalogusItem {
  id: string;
  association_id: string | null;
}

export function catalogusItem(soort: CatalogusSoort, id: string): CatalogusItem | undefined {
  return db.prepare(`SELECT id, association_id FROM ${TABEL[soort]} WHERE id = ?`).get(id) as CatalogusItem | undefined;
}

/**
 * Gooi een 400 als een van de ids niet bestaat of een eigen item van een
 * andere vereniging is. Lege en ontbrekende waarden slaat hij over.
 */
export function eisBruikbaar(
  soort: CatalogusSoort,
  ids: string | null | undefined | (string | null | undefined)[],
  associationId: string | null | undefined,
): void {
  const lijst = [...new Set((Array.isArray(ids) ? ids : [ids]).filter((id): id is string => !!id))];
  if (lijst.length === 0) return;
  const gevonden = db
    .prepare(
      `SELECT COUNT(*) AS n FROM ${TABEL[soort]} t
       WHERE t.id IN (${lijst.map(() => '?').join(',')}) AND ${bruikbaarVoorwaarde('t')}`,
    )
    .get(...lijst, associationId ?? '') as { n: number };
  if (gevonden.n !== lijst.length) {
    throw new ApiError(400, soort === 'genre' ? 'Onbekend genre.' : 'Onbekend instrument.');
  }
}

/**
 * De instrumenten die de vereniging ziet, op naam en op andere naam (kleine
 * letters) naar het id. Voor imports en bestandsnamen: laad hem één keer en
 * zoek er in een lus in. Voorrang, van laag naar hoog: andere naam van een
 * standaardinstrument, naam van een standaardinstrument, andere naam van een
 * eigen instrument, naam van een eigen instrument.
 */
export function instrumentenOpNaam(associationId: string | null | undefined): Map<string, string> {
  const rijen = db
    .prepare(
      `SELECT naam, id FROM (
         SELECT LOWER(ia.alias) AS naam, i.id AS id, (i.association_id IS NOT NULL) * 2 AS rang
         FROM instrument_aliases ia JOIN instruments i ON i.id = ia.instrument_id
         WHERE ${zichtbaarVoorwaarde('i')}
         UNION ALL
         SELECT LOWER(i.name), i.id, (i.association_id IS NOT NULL) * 2 + 1
         FROM instruments i
         WHERE ${zichtbaarVoorwaarde('i')}
       ) ORDER BY rang`,
    )
    .all(...zichtbaarParams(associationId, 'instrument'), ...zichtbaarParams(associationId, 'instrument')) as {
    naam: string;
    id: string;
  }[];
  const kaart = new Map<string, string>();
  for (const { naam, id } of rijen) kaart.set(naam, id);
  return kaart;
}

/** Eén instrument op naam of andere naam, uit wat de vereniging ziet. */
export function zoekInstrument(naam: string, associationId: string | null | undefined): string | null {
  const gezocht = naam?.toLowerCase().trim();
  if (!gezocht) return null;
  return instrumentenOpNaam(associationId).get(gezocht) ?? null;
}

/** De genres die de vereniging ziet, op naam (kleine letters) naar het id; een eigen genre wint. */
export function genresOpNaam(associationId: string | null | undefined): Map<string, string> {
  const rijen = db
    .prepare(
      `SELECT LOWER(g.name) AS naam, g.id FROM genres g
       WHERE ${zichtbaarVoorwaarde('g')}
       ORDER BY g.association_id IS NOT NULL`,
    )
    .all(...zichtbaarParams(associationId, 'genre')) as { naam: string; id: string }[];
  return new Map(rijen.map(({ naam, id }) => [naam, id]));
}

export function isSuperbeheerder(userId: string): boolean {
  return !!db.prepare('SELECT 1 FROM super_admins WHERE user_id = ?').get(userId);
}

export function isVerborgen(associationId: string, soort: CatalogusSoort, id: string): boolean {
  return !!db
    .prepare('SELECT 1 FROM catalogus_verborgen WHERE association_id = ? AND soort = ? AND item_id = ?')
    .get(associationId, soort, id);
}

export function verberg(associationId: string, soort: CatalogusSoort, id: string): void {
  db.prepare('INSERT OR IGNORE INTO catalogus_verborgen (association_id, soort, item_id) VALUES (?, ?, ?)').run(
    associationId,
    soort,
    id,
  );
}

export function toon(associationId: string, soort: CatalogusSoort, id: string): void {
  db.prepare('DELETE FROM catalogus_verborgen WHERE association_id = ? AND soort = ? AND item_id = ?').run(
    associationId,
    soort,
    id,
  );
}
