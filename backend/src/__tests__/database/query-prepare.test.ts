/**
 * Elke SQL-query in de bron moet door SQLite geaccepteerd worden.
 *
 * SQLite controleert tabel- en kolomnamen pas bij het voorbereiden van een
 * query, niet bij het compileren van TypeScript. Een verwijzing naar een
 * kolom die niet bestaat blijft daardoor stil tot een gebruiker de route
 * aanroept — en bij code die nergens wordt aangeroepen zelfs dan niet.
 *
 * Zo bleken de kortingsfuncties in services/ticketing te vragen naar
 * current_uses, min_order_total, max_discount_amount, restricted_emails,
 * concert_id en group_discount_config: geen daarvan bestaat. De migratie die
 * de tabellen aanmaakt gebruikt uses_count, min_order_amount, concert_ids en
 * een aparte tabel ticket_group_discounts.
 *
 * Deze test biedt elke query aan de testdatabase aan en meldt alleen fouten
 * over ontbrekende tabellen of kolommen. Queries die om een andere reden niet
 * te vertalen zijn (bijvoorbeeld doordat er een stuk SQL wordt ingevoegd)
 * worden overgeslagen: die kan deze test niet beoordelen.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import '../setup';
import db from '../../database/connection';

const BRON = path.join(__dirname, '../..');

function bronbestanden(map: string): string[] {
  const uit: string[] = [];
  for (const naam of fs.readdirSync(map)) {
    const vol = path.join(map, naam);
    if (fs.statSync(vol).isDirectory()) {
      if (naam === '__tests__' || naam === 'node_modules') continue;
      uit.push(...bronbestanden(vol));
    } else if (naam.endsWith('.ts')) {
      uit.push(vol);
    }
  }
  return uit;
}

/** Een query die met een ingevoegd stuk SQL werkt, kan deze test niet nabouwen. */
function isVolledigeQuery(sql: string): boolean {
  return /^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i.test(sql) && !sql.includes('${');
}

/**
 * Tabellen die de bron zelf aanmaakt op het moment dat hij ze nodig heeft
 * staan niet in het schema, maar bestaan in productie wel.
 */
function tabellenDieDeBronZelfAanmaakt(bestanden: string[]): Set<string> {
  const namen = new Set<string>();
  for (const bestand of bestanden) {
    const inhoud = fs.readFileSync(bestand, 'utf-8');
    for (const m of inhoud.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/gi)) {
      namen.add(m[1]);
    }
  }
  return namen;
}

/**
 * Bekende openstaande gevallen: queries die vandaag stuklopen zodra ze worden
 * aangeroepen. De lijst is leeg, en dat hoort zo te blijven.
 *
 * Hij begon op dertig regels. Zet er alleen iets bij als je een fout echt hebt
 * nagelopen en hem bewust laat liggen; haal de regel weg zodra hij verholpen
 * is. De test hieronder dwingt dat laatste af, zodat de lijst niet stilletjes
 * gevallen blijft afdekken die allang zijn opgelost.
 */
const OPENSTAAND = new Set([]);

describe('Elke query is voor te bereiden', () => {
  let problemen: string[];
  let gecontroleerd: number;
  let nietMeerOvertreden: string[];

  beforeAll(() => {
    problemen = [];
    gecontroleerd = 0;
    const nogGezien = new Set<string>();

    const alleBestanden = bronbestanden(BRON);
    const zelfAangemaakt = tabellenDieDeBronZelfAanmaakt(alleBestanden);

    for (const bestand of alleBestanden) {
      // Migraties bouwen het schema juist op; hun queries draaien tegen een
      // database die op dat moment nog anders is.
      if (bestand.includes(`${path.sep}migrations${path.sep}`)) continue;
      if (bestand.includes(`${path.sep}database${path.sep}`)) continue;

      const inhoud = fs.readFileSync(bestand, 'utf-8');

      for (const letterlijk of inhoud.match(/`[^`]*`/g) ?? []) {
        const sql = letterlijk.slice(1, -1);
        if (!isVolledigeQuery(sql)) continue;

        try {
          // EXPLAIN laat SQLite de query vertalen zonder hem uit te voeren;
          // ontbrekende tabellen en kolommen komen daarbij aan het licht.
          db.prepare(`EXPLAIN ${sql}`).all();
          gecontroleerd++;
        } catch (error) {
          const melding = error instanceof Error ? error.message : String(error);
          // Elke volledige query hoort te vertalen. Een fout hier betekent dat
          // de query nooit kan draaien, wat de reden ook is: een kolom die niet
          // bestaat ("no such column", of bij een INSERT "has no column named"),
          // maar net zo goed een aggregaat in een WHERE ("misuse of aggregate").
          // Daarom niet op een lijstje meldingen filteren.

          const ontbrekendeTabel = melding.match(/no such table: (\w+)/)?.[1];
          if (ontbrekendeTabel && zelfAangemaakt.has(ontbrekendeTabel)) continue;

          const bestandsnaam = path.relative(BRON, bestand);
          if (OPENSTAAND.has(`${bestandsnaam} — ${melding}`)) {
            nogGezien.add(`${bestandsnaam} — ${melding}`);
            continue;
          }

          const positie = inhoud.indexOf(letterlijk);
          const regel = inhoud.slice(0, positie).split('\n').length;
          problemen.push(`${bestandsnaam}:${regel} — ${melding}`);
        }
      }
    }

    nietMeerOvertreden = [...OPENSTAAND].filter((regel) => !nogGezien.has(regel)).sort();
  });

  it('kijkt een noemenswaardig aantal queries na', () => {
    // Zonder deze ondergrens zou de test stilletjes niets meer controleren
    // als het uitpakken van de bron ooit stukgaat.
    expect(gecontroleerd).toBeGreaterThan(200);
  });

  it('noemt geen tabellen of kolommen die niet bestaan', () => {
    expect(problemen).toEqual([]);
  });

  it('houdt de lijst met openstaande gevallen actueel', () => {
    // Een regel die niemand meer overtreedt hoort weg, anders dekt de lijst
    // op den duur fouten toe die allang verholpen zijn.
    expect(nietMeerOvertreden).toEqual([]);
  });
});
