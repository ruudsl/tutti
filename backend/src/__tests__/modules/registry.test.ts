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

  /**
   * Modules die geen eigen pagina hebben, en dus geen navigatiepad.
   *
   * De regel is: een module verbergt een stuk navigatie. Spond is de
   * uitzondering - die koppeling staat als kaart op het repetitiescherm en
   * heeft geen eigen menu-item. Er valt dus niets uit de navigatie te halen;
   * de frontend haalt de kaart zelf weg op de modulestand.
   *
   * Deze lijst staat er zodat het een bewuste uitzondering blijft. Wie een
   * module toevoegt zonder navigatiepad moet hem hier noemen, en dan is de
   * vraag "waar wordt dit dan wel verborgen?" niet te ontlopen.
   */
  const MODULES_ZONDER_PAGINA = new Set(['spond']);

  it('geeft elke module minstens een API-pad', () => {
    for (const module of MODULES) {
      expect(module.apiPrefixes.length, module.key).toBeGreaterThan(0);
    }
  });

  it('geeft elke module een navigatiepad, behalve de modules zonder eigen pagina', () => {
    const zonderPad = MODULES.filter((m) => m.navPaths.length === 0).map((m) => m.key);
    expect(zonderPad.sort()).toEqual([...MODULES_ZONDER_PAGINA].sort());
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
    //
    // spond.ts doet dat ook, maar om een andere reden: twee van de dertien
    // routes daar zijn geen koppeling maar kern - "ben ik aanwezig" en "zet
    // mij op aanwezig". Die staan alleen in dat bestand omdat ze ooit samen
    // met de synchronisatie zijn geschreven. Een guard op de mount zou het
    // uitzetten van de module elk lid zijn eigen aanwezigheid afnemen.
    const guardedElsewhere = new Set(['ticketing', 'spond']);

    const unguarded = MODULES.filter((m) => !guarded.has(m.key) && !guardedElsewhere.has(m.key)).map((m) => m.key);

    expect(unguarded).toEqual([]);
  });
});

describe('elke module hoort bij een groep', () => {
  /**
   * Het beheerscherm zet de modules onder kopjes. Een module zonder groep, of
   * met een groep die de frontend niet kent, belandt onder "Overig" - dat valt
   * niet op tot een beheerder zich afvraagt waarom er een kopje bij staat.
   * Deze test vangt dat bij het toevoegen van een module in plaats van erna.
   */
  const GROEPEN = ['music', 'planning', 'communication', 'assets', 'finance'];

  it('kent aan elke module een van de bekende groepen toe', () => {
    const zonderGroep = MODULES.filter((m) => !GROEPEN.includes(m.category)).map((m) => `${m.key}: ${m.category}`);
    expect(zonderGroep).toEqual([]);
  });

  it('laat geen groep leeg', () => {
    const gebruikt = new Set(MODULES.map((m) => m.category));
    const leeg = GROEPEN.filter((g) => !gebruikt.has(g as (typeof MODULES)[number]['category']));
    expect(leeg).toEqual([]);
  });

  it('geeft de groep mee in de instellingenroute', () => {
    const routeSource = fs.readFileSync(path.join(__dirname, '../../routes/modules.ts'), 'utf-8');
    expect(routeSource).toMatch(/category: m\.category/);
  });
});
