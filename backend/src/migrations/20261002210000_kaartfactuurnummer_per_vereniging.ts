/**
 * Migration: kaartfactuurnummer per vereniging
 * Created at: 2026-10-02
 *
 * services/invoices.ts nummert kaartfacturen per vereniging per dag
 * (`INV-20261002-0001`), maar `ticket_invoices.invoice_number` was uniek over
 * de hele installatie. De tweede vereniging die op een dag een kaart
 * verkocht, kreeg daardoor `UNIQUE constraint failed` en geen factuur.
 * Besluit oktober 2026: het nummer is uniek per vereniging, zoals bij
 * `invoices` en `transactions`.
 *
 * De beperking stond in de tabeldefinitie; SQLite kan die alleen weghalen door
 * de tabel opnieuw op te bouwen. `invoice_line_items` verwijst ernaar met
 * ON DELETE CASCADE, dus de foreign keys gaan tijdens de migratie uit (zie
 * voerUit in runner.ts) - anders nam het weggooien van de oude tabel alle
 * factuurregels mee.
 *
 * De nieuwe tabel is de oude definitie zonder `UNIQUE` op het nummer, gelezen
 * uit de database zelf: een kolom die hier niet bekend is, blijft. De sleutel
 * wordt een unieke index op `(COALESCE(association_id, ''), invoice_number)`;
 * `COALESCE` omdat NULL anders nooit gelijk is aan NULL.
 *
 * `down` zet de oude beperking terug. Dat lukt alleen zolang geen twee
 * verenigingen hetzelfde nummer hebben; anders stopt hij met een melding en
 * blijft alles zoals het is.
 */

import db from '../database/connection';
import logger from '../utils/logger';

export const zonderForeignKeys = true;

const TABEL = 'ticket_invoices';
const SLEUTEL = 'idx_ticket_invoices_nummer_per_vereniging';
const SLEUTEL_SQL = `CREATE UNIQUE INDEX ${SLEUTEL} ON ${TABEL}(COALESCE(association_id, ''), invoice_number)`;

const UNIEK_NUMMER = /invoice_number\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i;

function definitie(): string | undefined {
  return (
    db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(TABEL) as
      { sql: string } | undefined
  )?.sql;
}

function kolomnamen(): string[] {
  return (db.prepare(`PRAGMA table_info(${TABEL})`).all() as { name: string }[]).map((k) => k.name);
}

/** Eigen indexen en triggers (de automatische unieke indexen horen bij de definitie). */
function bijbehorend(): string[] {
  return (
    db
      .prepare("SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type IN ('index', 'trigger') AND sql IS NOT NULL")
      .all(TABEL) as { sql: string }[]
  )
    .map((r) => r.sql)
    .filter((sql) => !sql.includes(SLEUTEL));
}

/** Bouw de tabel opnieuw op met `nieuweDefinitie` en neem rijen, indexen en triggers mee. */
function herbouw(nieuweDefinitie: string, extra: string[]): void {
  const behouden = bijbehorend();
  const lijst = kolomnamen().join(', ');
  const tijdelijk = nieuweDefinitie.replace(
    /CREATE TABLE\s+(IF NOT EXISTS\s+)?"?ticket_invoices"?/i,
    'CREATE TABLE ticket_invoices_nieuw',
  );
  db.exec(tijdelijk);
  db.exec(`INSERT INTO ticket_invoices_nieuw (${lijst}) SELECT ${lijst} FROM ${TABEL}`);
  db.exec(`DROP TABLE ${TABEL}`);
  db.exec(`ALTER TABLE ticket_invoices_nieuw RENAME TO ${TABEL}`);
  for (const sql of [...behouden, ...extra]) db.exec(sql);
}

export const up = (): void => {
  logger.info('Running migration: kaartfactuurnummer_per_vereniging (up)');

  const sql = definitie();
  if (!sql || !UNIEK_NUMMER.test(sql)) {
    logger.info('Migration kaartfactuurnummer_per_vereniging: niets te doen');
    return;
  }

  herbouw(sql.replace(UNIEK_NUMMER, 'invoice_number TEXT NOT NULL'), [SLEUTEL_SQL]);

  logger.info('Migration completed: kaartfactuurnummer_per_vereniging');
};

export const down = (): void => {
  logger.info('Running migration: kaartfactuurnummer_per_vereniging (down)');

  const sql = definitie();
  if (!sql || UNIEK_NUMMER.test(sql)) return;

  const dubbel = db
    .prepare(`SELECT invoice_number FROM ${TABEL} GROUP BY invoice_number HAVING COUNT(*) > 1 LIMIT 1`)
    .get() as { invoice_number: string } | undefined;
  if (dubbel) {
    throw new Error(
      `Terugdraaien kan niet: factuurnummer ${dubbel.invoice_number} komt bij meer dan één vereniging voor.`,
    );
  }

  db.exec(`DROP INDEX IF EXISTS ${SLEUTEL}`);
  herbouw(sql.replace(/invoice_number\s+TEXT\s+NOT\s+NULL/i, 'invoice_number TEXT NOT NULL UNIQUE'), []);

  logger.info('Migration rolled back: kaartfactuurnummer_per_vereniging');
};
