/**
 * De registry en de padenkaart van de frontend moeten hetzelfde zeggen.
 *
 * Een module bestaat op twee plekken: backend/src/modules/registry.ts bepaalt
 * wat er is en wat er standaard aan staat, frontend/src/utils/modules.ts
 * bepaalt welke paden verdwijnen. Lopen die uiteen, dan verdwijnt een
 * menu-item zonder dat de API dichtgaat, of andersom - en dat merk je pas als
 * een gebruiker ertegenaan loopt.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MODULES } from '../../modules/registry';

const frontendMap = fs.readFileSync(path.join(__dirname, '../../../../frontend/src/utils/modules.ts'), 'utf-8');
const indexSource = fs.readFileSync(path.join(__dirname, '../../index.ts'), 'utf-8');

/** De paden uit MODULE_BY_PATH in de frontend, met hun modulesleutel. */
function frontendPaths(): Map<string, string> {
  const block = frontendMap.slice(frontendMap.indexOf('MODULE_BY_PATH'), frontendMap.indexOf('export function'));
  return new Map([...block.matchAll(/'(\/[a-z-]+)':\s*'([a-z-]+)'/g)].map((m) => [m[1], m[2]]));
}

describe('moduleregistry', () => {
  it('heeft unieke sleutels', () => {
    const keys = MODULES.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('geeft elke module een titel en een omschrijving die iets uitlegt', () => {
    for (const module of MODULES) {
      expect(module.title.trim().length, module.key).toBeGreaterThan(0);
      // De omschrijving moet zeggen wat er verdwijnt, niet alleen de naam herhalen.
      expect(module.description.trim().length, module.key).toBeGreaterThan(40);
    }
  });

  it('geeft elke module minstens een API-pad en een navigatiepad', () => {
    for (const module of MODULES) {
      expect(module.apiPrefixes.length, module.key).toBeGreaterThan(0);
      expect(module.navPaths.length, module.key).toBeGreaterThan(0);
    }
  });

  it('kent geen twee modules die hetzelfde navigatiepad claimen', () => {
    const seen = new Map<string, string>();
    for (const module of MODULES) {
      for (const navPath of module.navPaths) {
        expect(seen.has(navPath), `${navPath} zit in zowel ${seen.get(navPath)} als ${module.key}`).toBe(false);
        seen.set(navPath, module.key);
      }
    }
  });
});

describe('registry en frontend lopen niet uiteen', () => {
  it('kent in de frontend alleen sleutels die de backend ook kent', () => {
    const known = new Set(MODULES.map((m) => m.key));
    const unknown = [...frontendPaths().entries()].filter(([, key]) => !known.has(key));

    expect(unknown).toEqual([]);
  });

  it('verbergt in de frontend elk navigatiepad uit de registry', () => {
    const mapped = frontendPaths();
    const missing: string[] = [];

    for (const module of MODULES) {
      for (const navPath of module.navPaths) {
        if (mapped.get(navPath) !== module.key) {
          missing.push(`${navPath} hoort bij ${module.key} maar staat in de frontend als ${mapped.get(navPath)}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });
});

describe('elke module is ook aan de API-kant afgeschermd', () => {
  /**
   * Zonder guard op de mount blijft de API gewoon antwoorden terwijl het
   * menu-item weg is. Dan is de module verstopt, niet uit.
   */
  it('heeft voor elke module een requireModule-guard in index.ts', () => {
    const guarded = new Set([...indexSource.matchAll(/requireModule\('([a-z-]+)'\)/g)].map((m) => m[1]));

    // tickets.ts zet de guard in de router zelf, omdat die router aan /api hangt
    // en paden onder twee voorvoegsels bedient.
    const guardedElsewhere = new Set(['ticketing']);

    const unguarded = MODULES.filter((m) => !guarded.has(m.key) && !guardedElsewhere.has(m.key)).map((m) => m.key);

    expect(unguarded).toEqual([]);
  });
});
