/**
 * Elke route in spond.ts staat achter de module, op twee na.
 *
 * De guard staat hier per route en niet op de mount, omdat twee van de dertien
 * routes in dat bestand geen koppeling zijn maar kern:
 *
 *   PUT /spond/attendance/:rehearsalId            zet mij op aanwezig
 *   GET /spond/attendance/:rehearsalId/my-status  ben ik aanwezig
 *
 * Die heten wel /spond/..., maar ze horen bij repetities. Ze staan alleen in
 * dat bestand omdat ze ooit samen met de synchronisatie zijn geschreven. Een
 * guard op de mount zou het uitzetten van de module elk lid zijn eigen
 * aanwezigheid afnemen - en dat zou pas opvallen als iemand zich probeert af
 * te melden.
 *
 * Per route betekent wel: een nieuwe route kan de guard vergeten. Deze test
 * dwingt de keuze af in plaats van hem aan het geheugen over te laten.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const bron = fs.readFileSync(path.join(__dirname, '../../routes/spond.ts'), 'utf-8');

/** De routes die bewust zonder guard staan, omdat ze kern zijn. */
const KERNROUTES = ['/attendance/:rehearsalId', '/attendance/:rehearsalId/my-status'];

/** Elke `router.<methode>(` met het pad eronder en de middleware erachteraan. */
function routes(): { methode: string; pad: string; heeftGuard: boolean }[] {
  const regels = bron.split('\n');
  const gevonden: { methode: string; pad: string; heeftGuard: boolean }[] = [];

  for (let i = 0; i < regels.length; i++) {
    const start = regels[i].match(/^router\.(get|post|put|delete|patch)\($/);
    if (!start) continue;

    const pad = regels[i + 1]?.trim().replace(/^'|',$/g, '');
    // De middleware staat tussen het pad en de asyncHandler; verder dan tien
    // regels hoeft niet gekeken te worden.
    const kop = regels.slice(i + 2, i + 12).join('\n');
    const eind = kop.indexOf('asyncHandler');
    gevonden.push({
      methode: start[1].toUpperCase(),
      pad,
      heeftGuard: (eind === -1 ? kop : kop.slice(0, eind)).includes("requireModule('spond')"),
    });
  }

  return gevonden;
}

describe('spond-routes achter de module', () => {
  const alle = routes();

  it('vindt alle routes in het bestand', () => {
    // Zou deze telling instorten, dan zegt de test hieronder niets meer.
    expect(alle.length).toBeGreaterThanOrEqual(13);
  });

  it('zet de guard op elke route die bij de koppeling hoort', () => {
    const zonderGuard = alle
      .filter((r) => !KERNROUTES.includes(r.pad) && !r.heeftGuard)
      .map((r) => `${r.methode} ${r.pad}`);

    expect(zonderGuard).toEqual([]);
  });

  it('laat de twee kernroutes juist zonder guard', () => {
    const kern = alle.filter((r) => KERNROUTES.includes(r.pad));

    expect(kern.length).toBe(KERNROUTES.length);
    expect(kern.filter((r) => r.heeftGuard).map((r) => r.pad)).toEqual([]);
  });
});
