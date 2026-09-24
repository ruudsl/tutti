/**
 * Migration: genres en instrumenten per vereniging
 * Created at: 2026-09-24
 *
 * Genres en instrumenten waren één lijst voor de hele installatie: elke
 * beheerder kon er iets aan veranderen of uit weghalen, voor alle
 * verenigingen tegelijk. Besluit september 2026: ze kunnen per vereniging
 * verschillen.
 *
 * - De bestaande rijen blijven de standaardlijst (`association_id` leeg). Die
 *   beheert alleen de superbeheerder. Twaalf tabellen verwijzen naar
 *   instruments; elke vereniging een eigen kopie geven had al die verwijzingen
 *   moeten omzetten, en dat is niet nodig.
 * - Een vereniging voegt eigen genres en instrumenten toe (`association_id`
 *   gevuld); die ziet alleen zij.
 * - Een vereniging kan een standaarditem verbergen (`catalogus_verborgen`):
 *   dan staat het niet meer in haar keuzelijsten. Wat er al aan hangt, blijft.
 *
 * De unieke naam (genres: `name`; instrumenten: `name, tuning, clef`) gold
 * voor de hele installatie en geldt nu per vereniging, zodat twee verenigingen
 * allebei een eigen "Pop-rock" kunnen hebben. Die beperking stond in de
 * tabeldefinitie zelf; SQLite kan die alleen weghalen door de tabel opnieuw op
 * te bouwen. Daarom `zonderForeignKeys` (zie voerUit in runner.ts): met de
 * foreign keys aan zou het weggooien van de oude tabel via ON DELETE CASCADE
 * de instrumenten van leden, de sectiekanalen en de rest meenemen.
 *
 * De opbouw leest de echte kolommen, indexen en triggers uit de database
 * (PRAGMA table_info), zodat een installatie met een kolom die hier niet
 * bekend is die ook houdt.
 */

import db from '../database/connection';
import logger from '../utils/logger';

export const zonderForeignKeys = true;

interface Kolom {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

const TABELLEN = ['genres', 'instruments'] as const;
type Tabel = (typeof TABELLEN)[number];

/** De unieke sleutel per vereniging, als index; `COALESCE` omdat NULL anders nooit gelijk is aan NULL. */
const UNIEK_PER_VERENIGING: Record<Tabel, string> = {
  genres: "CREATE UNIQUE INDEX idx_genres_naam_per_vereniging ON genres(COALESCE(association_id, ''), name)",
  instruments:
    "CREATE UNIQUE INDEX idx_instruments_naam_per_vereniging ON instruments(COALESCE(association_id, ''), name, tuning, clef)",
};

/** De oorspronkelijke unieke sleutel, voor de terugweg. */
const UNIEK_INSTALLATIE: Record<Tabel, string> = {
  genres: 'UNIQUE(name)',
  instruments: 'UNIQUE(name, tuning, clef)',
};

function kolommen(tabel: Tabel): Kolom[] {
  return db.prepare(`PRAGMA table_info(${tabel})`).all() as Kolom[];
}

function heeftVereniging(tabel: Tabel): boolean {
  return kolommen(tabel).some((k) => k.name === 'association_id');
}

function kolomDefinitie(k: Kolom): string {
  return [
    k.name,
    k.type,
    k.pk ? 'PRIMARY KEY' : '',
    k.notnull && !k.pk ? 'NOT NULL' : '',
    k.dflt_value !== null ? `DEFAULT ${k.dflt_value}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Eigen indexen en triggers van de tabel (de automatische unieke index niet: die hoort bij de definitie). */
function bijbehorend(tabel: Tabel): string[] {
  return (
    db
      .prepare("SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type IN ('index', 'trigger') AND sql IS NOT NULL")
      .all(tabel) as { sql: string }[]
  ).map((r) => r.sql);
}

/**
 * Bouw `tabel` opnieuw op met `definitie` (kolommen en beperkingen) en neem
 * de rijen, indexen en triggers mee. De stappen 4-7 en 9 uit de procedure van
 * SQLite; de foreign keys staan uit (zie de kop).
 */
function herbouw(tabel: Tabel, definitie: string[], kolomnamen: string[], extra: string[]): void {
  const behouden = bijbehorend(tabel).filter((sql) => !/_per_vereniging\b/.test(sql));
  const lijst = kolomnamen.join(', ');
  db.exec(`CREATE TABLE ${tabel}_nieuw (${definitie.join(', ')})`);
  db.exec(`INSERT INTO ${tabel}_nieuw (${lijst}) SELECT ${lijst} FROM ${tabel}`);
  db.exec(`DROP TABLE ${tabel}`);
  db.exec(`ALTER TABLE ${tabel}_nieuw RENAME TO ${tabel}`);
  for (const sql of [...behouden, ...extra]) db.exec(sql);
}

export const up = (): void => {
  logger.info('Running migration: genres_en_instrumenten_per_vereniging (up)');

  for (const tabel of TABELLEN) {
    if (heeftVereniging(tabel)) continue;
    const huidig = kolommen(tabel);
    herbouw(
      tabel,
      [...huidig.map(kolomDefinitie), 'association_id TEXT REFERENCES associations(id) ON DELETE CASCADE'],
      huidig.map((k) => k.name),
      [UNIEK_PER_VERENIGING[tabel], `CREATE INDEX idx_${tabel}_vereniging ON ${tabel}(association_id)`],
    );
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS catalogus_verborgen (
      association_id TEXT NOT NULL REFERENCES associations(id) ON DELETE CASCADE,
      soort TEXT NOT NULL CHECK (soort IN ('genre', 'instrument')),
      item_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (association_id, soort, item_id)
    )
  `);

  logger.info('Migration completed: genres_en_instrumenten_per_vereniging');
};

/**
 * Wis de eigen items van verenigingen, met wat ernaar verwijst, zoals de
 * foreign keys dat met ON DELETE zouden doen. Die staan tijdens deze migratie
 * uit, dus het gebeurt hier met de hand. Een verwijzing zonder ON DELETE
 * (NO ACTION, RESTRICT) houdt de terugweg tegen: dan zou er iets verloren gaan
 * dat de terugweg niet mag weggooien.
 */
function wisEigenItems(tabel: Tabel): void {
  const eigen = `SELECT id FROM ${tabel} WHERE association_id IS NOT NULL`;
  const tabellen = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
    (r) => r.name,
  );
  for (const kind of tabellen) {
    const sleutels = db.prepare(`PRAGMA foreign_key_list(${kind})`).all() as {
      table: string;
      from: string;
      on_delete: string;
    }[];
    for (const fk of sleutels.filter((s) => s.table === tabel)) {
      if (fk.on_delete === 'CASCADE') {
        db.exec(`DELETE FROM ${kind} WHERE ${fk.from} IN (${eigen})`);
      } else if (fk.on_delete === 'SET NULL') {
        db.exec(`UPDATE ${kind} SET ${fk.from} = NULL WHERE ${fk.from} IN (${eigen})`);
      } else {
        const aantal = (
          db.prepare(`SELECT COUNT(*) AS n FROM ${kind} WHERE ${fk.from} IN (${eigen})`).get() as {
            n: number;
          }
        ).n;
        if (aantal > 0) {
          throw new Error(
            `Terugdraaien kan niet: ${aantal} rij(en) in ${kind} verwijzen naar een eigen ${tabel}-item van een vereniging.`,
          );
        }
      }
    }
  }
  db.exec(`DELETE FROM ${tabel} WHERE association_id IS NOT NULL`);
}

export const down = (): void => {
  logger.info('Running migration: genres_en_instrumenten_per_vereniging (down)');

  db.exec('DROP TABLE IF EXISTS catalogus_verborgen');

  for (const tabel of TABELLEN) {
    if (!heeftVereniging(tabel)) continue;
    wisEigenItems(tabel);
    const zonder = kolommen(tabel).filter((k) => k.name !== 'association_id');
    db.exec(`DROP INDEX IF EXISTS idx_${tabel}_vereniging`);
    db.exec(`DROP INDEX IF EXISTS idx_${tabel}_naam_per_vereniging`);
    herbouw(
      tabel,
      [...zonder.map(kolomDefinitie), UNIEK_INSTALLATIE[tabel]],
      zonder.map((k) => k.name),
      [],
    );
  }

  logger.info('Rollback completed: genres_en_instrumenten_per_vereniging');
};
