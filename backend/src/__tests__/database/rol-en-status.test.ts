/**
 * `role` en `status` zijn twee verschillende kolommen op users.
 *
 * - `role` is admin, music_committee, equipment_committee, uniforms_committee,
 *   conductor of member.
 * - `status` is active, inactive of pending.
 *
 * "Inactive" hoort bij de tweede. Op vier plekken stond `role != 'inactive'`,
 * en dat is altijd waar: het sluit niemand uit. De bedoeling was juist het
 * tegenovergestelde, want onboarding.ts zet bij het uitschrijven van een lid
 * `status = 'inactive'`.
 *
 * Wat er daardoor misging:
 *
 * | plek | gevolg |
 * | --- | --- |
 * | availability/team | wie de vereniging had verlaten stond nog in het overzicht van de dirigent |
 * | concerts (twee queries) | uitgeschreven leden telden mee in de opkomstvoorspelling en in member_count |
 * | scheduler/email-digest | de wekelijkse samenvatting bleef naar ex-leden gemaild |
 *
 * Deze test leest de bron en houdt de vergissing weg. Hij kijkt naar de
 * combinatie role + inactive, niet naar `role !=` in het algemeen: een rol
 * uitsluiten is op zichzelf een prima ding om te doen.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';

const BRON = path.join(__dirname, '../..');

function bronbestanden(map: string): string[] {
  const gevonden: string[] = [];
  for (const item of fs.readdirSync(map, { withFileTypes: true })) {
    const volledig = path.join(map, item.name);
    if (item.isDirectory()) {
      if (item.name === '__tests__' || item.name === 'node_modules') continue;
      gevonden.push(...bronbestanden(volledig));
    } else if (item.name.endsWith('.ts')) {
      gevonden.push(volledig);
    }
  }
  return gevonden;
}

describe('role en status worden niet verward', () => {
  let overtredingen: string[];

  beforeAll(() => {
    overtredingen = [];

    for (const bestand of bronbestanden(BRON)) {
      const inhoud = fs.readFileSync(bestand, 'utf-8');
      const regels = inhoud.split('\n');

      regels.forEach((regel, index) => {
        // `role` en `inactive` in dezelfde vergelijking. De prefix (u.role,
        // users.role) telt mee.
        if (/\b(?:\w+\.)?role\s*(?:!=|=|<>)\s*'inactive'/.test(regel)) {
          overtredingen.push(`${path.relative(BRON, bestand)}:${index + 1} — ${regel.trim()}`);
        }
      });
    }
  });

  it('gebruikt status en niet role om een uitgeschreven lid te herkennen', () => {
    expect(overtredingen).toEqual([]);
  });

  it('leest een noemenswaardig aantal bestanden', () => {
    // Zonder ondergrens zou deze test stilletjes niets meer controleren als
    // het aflopen van de bron ooit stukgaat.
    expect(bronbestanden(BRON).length).toBeGreaterThan(100);
  });
});
