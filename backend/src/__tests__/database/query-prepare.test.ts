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
 * Bekende openstaande gevallen. Elke regel is een query die vandaag stukloopt
 * zodra hij wordt aangeroepen; ze staan hier zodat deze test meteen bewaakt
 * dat er geen nieuwe bij komen, en tegelijk laat zien wat er nog te doen is.
 *
 * Werk je er een weg, haal de regel dan hier weg — de test wordt vanzelf
 * strenger. Voeg hier niets aan toe zonder de fout echt na te lopen.
 */
const OPENSTAAND = new Set([
  'routes/accounting.ts — no such column: ba.account_holder_name',
  'routes/calendar.ts — no such column: google_calendar_client_id',
  'routes/calendar.ts — no such column: start_time',
  'routes/calendar.ts — no such column: show_rehearsals_public',
  'routes/concerts.ts — no such column: instrument',
  'routes/external-musicians.ts — no such column: title',
  'routes/imslp.ts — no such column: association_id',
  'routes/performances.ts — no such column: mt.list_id',
  'routes/replacement-requests.ts — no such column: title',
  'routes/stage-layouts.ts — no such column: association_id',
  'scheduler/email-digest.ts — no such table: user_notification_preferences',
  'scheduler/gdpr-cleanup.ts — no such column: ended_at',
  'scheduler/gdpr-cleanup.ts — no such column: user_id',
  'scheduler/gdpr-cleanup.ts — no such column: updated_at',
  'services/maintenanceAlerts.ts — no such column: status',
  'services/ticketing.ts — no such column: tt.to_email',
  'services/ticketing.ts — no such column: updated_at',
  'services/ticketing.ts — no such column: completed_at',
  'services/ticketing.ts — no such table: scanner_tokens',
  'services/ticketing.ts — no such table: offline_scan_log',
  'services/workflowEngine.ts — no such table: group_members',
]);

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
          if (!/no such (column|table)/i.test(melding)) continue;

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
