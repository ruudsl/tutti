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
