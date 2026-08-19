/**
 * Queries mogen geen kolommen noemen die niet bestaan.
 *
 * Dit is deze maand drie keer misgegaan, en elke keer pas ontdekt toen iemand
 * de route daadwerkelijk aanriep:
 *
 *   - de gegevensexport uit artikel 20 van de AVG vroeg `action`, `details` en
 *     `ip_address` uit activity_log; die tabel heeft action_type, entity_type,
 *     entity_id en metadata, en houdt geen ip-adres bij;
 *   - het versturen van een e-mailcampagne filterde op `u.is_active`;
 *   - het opzoeken van leden die nog niet gestemd hadden deed hetzelfde.
 *
 * De users-tabel heeft geen is_active maar status. SQLite merkt dat pas bij
 * het uitvoeren, dus een typefout blijft stil tot een gebruiker erop stuit.
 *
 * Deze test kijkt de bron na op verwijzingen naar kolommen die op users niet
 * bestaan. Dat vangt de hele klasse in plaats van de drie gevallen.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import '../setup';
import db from '../../database/connection';

const BRON = path.join(__dirname, '../..');

/** Alle kolomnamen van een tabel, uit de database zelf. */
function kolommenVan(tabel: string): Set<string> {
  const rijen = db.prepare(`PRAGMA table_info(${tabel})`).all() as Array<{ name: string }>;
  return new Set(rijen.map((r) => r.name));
}

/** Loop alle bronbestanden af, zonder tests en zonder gebouwde uitvoer. */
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

describe('Queries noemen bestaande kolommen', () => {
  // De database is pas klaar nadat de opzet gedraaid heeft, dus niet op het
  // niveau van het describe-blok opvragen.
  let kolommen: Set<string>;

  beforeAll(() => {
    kolommen = kolommenVan('users');
  });

  it('de users-tabel heeft status en geen is_active', () => {
    // Als dit ooit omkeert, hoort de test hieronder mee te veranderen in
    // plaats van stilletjes niets meer na te kijken.
    expect(kolommen.has('status')).toBe(true);
    expect(kolommen.has('is_active')).toBe(false);
  });

  it('geen enkele query filtert op een kolom die users niet heeft', () => {
    const problemen: string[] = [];

    for (const bestand of bronbestanden(BRON)) {
      const inhoud = fs.readFileSync(bestand, 'utf-8');

      // Per query kijken en niet per bestand. Een alias als `ua` kan in het
      // ene statement voor users staan en in het andere voor
      // user_associations; wie dat door elkaar haalt krijgt meldingen die
      // nergens op slaan. En een letter als `c` is buiten SQL vaak gewoon een
      // variabele in een map-aanroep.
      for (const query of inhoud.match(/`[^`]*`/g) ?? []) {
        if (!/\b(SELECT|UPDATE|DELETE)\b/i.test(query)) continue;

        const aliassen = new Set<string>();
        for (const m of query.matchAll(/\busers\s+(?:AS\s+)?([a-z]\w*)\b/gi)) {
          const alias = m[1].toUpperCase();
          if (['ON', 'SET', 'WHERE', 'WHEN'].includes(alias)) continue;
          aliassen.add(m[1]);
        }
        if (aliassen.size === 0) continue;

        for (const alias of aliassen) {
          for (const m of query.matchAll(new RegExp(`\\b${alias}\\.(\\w+)\\b`, 'g'))) {
            const kolom = m[1];
            if (kolommen.has(kolom)) continue;
            if (!/^[a-z][a-z0-9_]*$/.test(kolom)) continue;

            const positie = inhoud.indexOf(query) + (m.index ?? 0);
            const regel = inhoud.slice(0, positie).split('\n').length;
            problemen.push(`${path.relative(BRON, bestand)}:${regel} verwijst naar ${alias}.${kolom}`);
          }
        }
      }
    }

    expect(problemen).toEqual([]);
  });
});
