/**
 * De kern van nl.json moet elke tekst bevatten die de hoofdbundel gebruikt.
 *
 * Alleen die kern komt mee in de hoofdbundel (zie tekstenKernPlugin.ts); de
 * rest van nl.json wordt na de eerste weergave opgehaald. Een onderdeel dat
 * met een gewone import vanuit main.tsx bereikbaar is en een sleutel buiten
 * de kern gebruikt, toont op het inlogscherm even die kale sleutel.
 *
 * Welke onderdelen dat zijn, volgt deze test zelf: hij loopt de imports vanaf
 * main.tsx na, net als de bundelaar, en slaat lazy() en `import()` over - die
 * komen in een eigen chunk en wachten via tekstenGereed() op de volledige
 * teksten. Wie een component met nieuwe teksten eager aan App.tsx of Login.tsx
 * hangt, krijgt hier een rode test in plaats van een kale sleutel in productie.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import kern from 'virtual:teksten-kern';
import nl from '../nl.json';

const bronmap = path.join(__dirname, '../..');

/** Het bestand achter een relatieve import, of null voor css, json en dergelijke. */
function vindBestand(vanaf: string, spec: string): string | null {
  const basis = path.resolve(path.dirname(vanaf), spec);
  for (const kandidaat of [basis, `${basis}.ts`, `${basis}.tsx`, `${basis}/index.ts`, `${basis}/index.tsx`]) {
    if (/\.tsx?$/.test(kandidaat) && fs.existsSync(kandidaat) && fs.statSync(kandidaat).isFile()) return kandidaat;
  }
  return null;
}

/**
 * Alle eigen bronbestanden die vanaf main.tsx met een gewone import
 * bereikbaar zijn. `import type` levert geen code op en telt niet mee;
 * `import()` wordt een eigen chunk.
 */
function eagerBestanden(): string[] {
  const gezien = new Set<string>();
  const wachtrij = [path.join(bronmap, 'main.tsx')];
  const statisch = /^\s*(?:import|export)\s+(?!type\b)(?:[^'"`;]*?\sfrom\s+)?['"](\.[^'"]+)['"]/gm;

  while (wachtrij.length > 0) {
    const bestand = wachtrij.pop()!;
    if (gezien.has(bestand)) continue;
    gezien.add(bestand);

    const bron = fs.readFileSync(bestand, 'utf8');
    let treffer: RegExpExecArray | null;
    statisch.lastIndex = 0;
    while ((treffer = statisch.exec(bron)) !== null) {
      const doel = vindBestand(bestand, treffer[1]);
      if (doel) wachtrij.push(doel);
    }
  }
  return [...gezien];
}

/** De sleutels die een bestand letterlijk opvraagt via t() of useDocumentTitle(). */
function sleutelsIn(bestand: string): string[] {
  // Zonder commentaar: een voorbeeld in een docblok (`showUndoToast(t('...'))`)
  // is geen tekst die het inlogscherm toont.
  const bron = fs
    .readFileSync(bestand, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const sleutels: string[] = [];
  const patronen = [/\bt\(\s*(['"])([\w.-]+)\1/g, /useDocumentTitle\(\s*(['"])([\w.-]+)\1/g];
  for (const patroon of patronen) {
    let treffer: RegExpExecArray | null;
    while ((treffer = patroon.exec(bron)) !== null) {
      // Alleen iets dat op een sleutel lijkt.
      if (treffer[2].includes('.')) sleutels.push(treffer[2]);
    }
  }
  return sleutels;
}

function haal(teksten: unknown, sleutel: string): unknown {
  return sleutel.split('.').reduce<unknown>((hier, deel) => {
    if (typeof hier !== 'object' || hier === null) return undefined;
    return (hier as Record<string, unknown>)[deel];
  }, teksten);
}

/** Bestaat de sleutel als tekst, zelf of als meervoudsvorm (`_one`/`_other`)? */
function heeftTekst(teksten: unknown, sleutel: string): boolean {
  return [sleutel, `${sleutel}_one`, `${sleutel}_other`].some((s) => typeof haal(teksten, s) === 'string');
}

describe('de kern van de Nederlandse teksten', () => {
  const bestanden = eagerBestanden();

  it('vindt de onderdelen van de hoofdbundel', () => {
    // Een controle op de controle: vindt de importwandeling niets, dan slaagt
    // de test hieronder altijd.
    const namen = bestanden.map((b) => path.relative(bronmap, b));
    expect(namen).toContain('App.tsx');
    expect(namen).toContain('pages/Login.tsx');
    expect(namen).toContain('i18n.ts');
    // En lui geladen pagina's horen er niet bij.
    expect(namen).not.toContain('pages/Dashboard.tsx');
  });

  it('bevat elke sleutel die de hoofdbundel opvraagt', () => {
    const ontbrekend: string[] = [];
    for (const bestand of bestanden) {
      for (const sleutel of sleutelsIn(bestand)) {
        // Een sleutel die in nl.json zelf niet bestaat is een ander probleem,
        // en translations.test.ts vangt dat al.
        if (!heeftTekst(nl, sleutel)) continue;
        if (!heeftTekst(kern, sleutel)) ontbrekend.push(`${sleutel} (${path.relative(bronmap, bestand)})`);
      }
    }
    expect(ontbrekend).toEqual([]);
  });

  it('laat geen verwijzing binnen de kern in het niets wijzen', () => {
    const verwijzingen = JSON.stringify(kern).match(/\$t\(([\w.-]+)\)/g) ?? [];
    const kaal = verwijzingen.map((v) => v.slice(3, -1)).filter((sleutel) => !heeftTekst(kern, sleutel));
    expect(kaal).toEqual([]);
  });

  it('blijft een klein deel van het geheel', () => {
    // De kern heeft alleen zin zolang hij klein is. Groeit hij ongemerkt naar
    // een groot deel van nl.json - een hele groep erbij waar één sleutel had
    // volstaan - dan zit alles weer in de hoofdbundel en merkt niemand het.
    const kernGrootte = JSON.stringify(kern).length;
    const geheel = JSON.stringify(nl).length;
    expect(kernGrootte / geheel).toBeLessThan(0.1);
  });

  it('neemt de teksten ongewijzigd over uit nl.json', () => {
    expect(haal(kern, 'auth.login')).toBe(haal(nl, 'auth.login'));
    expect(haal(kern, 'pageTitle.login')).toBe(haal(nl, 'pageTitle.login'));
  });
});
