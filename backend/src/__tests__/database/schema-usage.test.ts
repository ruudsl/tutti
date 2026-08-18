/**
 * Regressietest: elke INSERT in de route-bestanden moet op het echte schema passen.
 *
 * Zes van de achttien roadmap-features bleken kapot omdat de code naar tabellen
 * en kolommen schreef die nergens waren aangemaakt. Zo'n INSERT faalt pas op het
 * moment dat een gebruiker de functie aanroept, met een 500 en niets in de UI.
 * Voorbeelden die dit heeft gevonden:
 *
 *   - polls.is_date_poll bestond niet         -> peiling aanmaken faalde altijd
 *   - email_campaign_attachments ontbrak      -> bijlage bij mailing faalde
 *   - equipment_damage_reports ontbrak        -> schade melden faalde
 *   - transactions.total_amount vs .amount    -> transactie boeken faalde
 *   - equipment_loans bestond twee keer in schema.ts met verschillende kolommen;
 *     door CREATE TABLE IF NOT EXISTS won de eerste en kreeg equipment.ts stil
 *     de verkeerde tabel
 *
 * Een INSERT noemt zowel de tabel als de kolommen, dus dat is te controleren
 * zonder de SQL uit te voeren. De test draait over alle route-bestanden, niet
 * alleen de bekende gevallen, zodat nieuwe code dezelfde fout niet kan maken.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import '../setup';
import db from '../../database/connection';

const routesDir = path.join(__dirname, '../../routes');

/** Alle tabellen met hun kolommen, uit de gemigreerde testdatabase. */
function readSchema(): Map<string, Set<string>> {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')").all() as {
    name: string;
  }[];

  return new Map(
    tables.map((t) => {
      const columns = db.prepare(`PRAGMA table_info("${t.name}")`).all() as { name: string }[];
      return [t.name.toLowerCase(), new Set(columns.map((c) => c.name.toLowerCase()))];
    }),
  );
}

/**
 * Alle `INSERT INTO tabel (kolommen)` uit een bronbestand.
 *
 * Genoeg om zowel `INSERT INTO x (...)` als `INSERT OR REPLACE INTO x (...)`
 * te vangen; inserts zonder kolomlijst komen in deze codebase niet voor en
 * zouden hier ook niets toevoegen.
 */
function extractInserts(source: string): { table: string; columns: string[] }[] {
  const pattern = /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gis;
  const found: { table: string; columns: string[] }[] = [];

  for (const match of source.matchAll(pattern)) {
    const columns = match[2]
      .split(',')
      .map((c) =>
        c
          .trim()
          .replace(/^["`[]|["`\]]$/g, '')
          .toLowerCase(),
      )
      .filter((c) => /^[a-z_][a-z0-9_]*$/.test(c));

    if (columns.length > 0) {
      found.push({ table: match[1].toLowerCase(), columns });
    }
  }

  return found;
}

const routeFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith('.ts'));

describe('SQL in de route-bestanden past op het schema', () => {
  it('vindt route-bestanden om te controleren', () => {
    expect(routeFiles.length).toBeGreaterThan(20);
  });

  it.each(routeFiles)('%s schrijft alleen naar bestaande tabellen en kolommen', (file) => {
    const schema = readSchema();
    const source = fs.readFileSync(path.join(routesDir, file), 'utf-8');
    const problems: string[] = [];

    for (const { table, columns } of extractInserts(source)) {
      const known = schema.get(table);

      if (!known) {
        problems.push(`tabel bestaat niet: ${table}`);
        continue;
      }

      for (const column of columns) {
        if (!known.has(column)) {
          problems.push(`kolom bestaat niet: ${table}.${column}`);
        }
      }
    }

    expect(problems).toEqual([]);
  });
});

describe('schema.ts definieert geen tabel twee keer', () => {
  /**
   * Twee CREATE TABLE IF NOT EXISTS met dezelfde naam is geen fout in SQLite:
   * de tweede wordt stilzwijgend overgeslagen. De code die op de tweede vorm
   * rekent, praat dan tegen de eerste tabel. Zo raakte de apparatuurmodule
   * kapot zonder dat er ergens een foutmelding kwam.
   */
  it('heeft unieke tabelnamen', () => {
    const schemaSource = fs.readFileSync(path.join(__dirname, '../../database/schema.ts'), 'utf-8');
    // Alleen echte DDL: die staat in schema.ts aan het begin van een regel.
    // Zo blijft een zin als "beide heetten CREATE TABLE IF NOT EXISTS" in een
    // toelichting buiten beschouwing.
    const names = [...schemaSource.matchAll(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gim)].map(
      (m) => m[1].toLowerCase(),
    );

    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

    expect([...new Set(duplicates)]).toEqual([]);
  });
});
