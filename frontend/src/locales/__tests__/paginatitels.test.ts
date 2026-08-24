/**
 * Elke useDocumentTitle-sleutel moet in alle drie de talen bestaan.
 *
 * Van de 65 sleutels die de pagina's opvragen stonden er 61 in geen enkel
 * vertaalbestand. i18next geeft dan de sleutel zelf terug, en useDocumentTitle
 * zet die rechtstreeks in document.title. In het tabblad van de browser stond
 * dus letterlijk `pageTitle.dashboard`, en datzelfde kwam in bladwijzers en in
 * de geschiedenis terecht.
 *
 * Waarom translations.test.ts dit niet ving: die test leest t()-aanroepen uit
 * de broncode. `useDocumentTitle('pageTitle.dashboard')` is geen t()-aanroep -
 * de t() zit in de hook, met een variabele als argument. Er is geen tekst in
 * de bron waar die controle iets aan heeft, en dus viel de hele categorie
 * buiten beeld.
 *
 * De controle op het type erbij: een sleutel die naar een groep wijst geeft
 * in document.title `[object Object]`.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import nl from '../nl.json';
import en from '../en.json';
import de from '../de.json';

const talen: Record<string, unknown> = { nl, en, de };
const bronmap = path.join(__dirname, '../..');

/** Alle sleutels die via useDocumentTitle worden opgevraagd. */
function verzamelSleutels(): string[] {
  const gevonden = new Set<string>();

  const loop = (map: string): void => {
    for (const item of fs.readdirSync(map, { withFileTypes: true })) {
      const pad = path.join(map, item.name);
      if (item.isDirectory()) {
        if (item.name === '__tests__' || item.name === 'node_modules') continue;
        loop(pad);
        continue;
      }
      if (!/\.tsx?$/.test(item.name) || /\.test\./.test(item.name)) continue;
      const bron = fs.readFileSync(pad, 'utf8');
      for (const treffer of bron.matchAll(/useDocumentTitle\(\s*'([^']+)'/g)) {
        gevonden.add(treffer[1]);
      }
    }
  };

  loop(bronmap);
  return [...gevonden].sort();
}

function waardeVan(taal: unknown, sleutel: string): unknown {
  return sleutel.split('.').reduce<unknown>((huidig, deel) => {
    if (huidig && typeof huidig === 'object') return (huidig as Record<string, unknown>)[deel];
    return undefined;
  }, taal);
}

describe('paginatitels', () => {
  const sleutels = verzamelSleutels();

  it('vindt de sleutels in de broncode', () => {
    // Zou deze lus niets vinden, dan zeggen de tests hieronder ook niets meer.
    expect(sleutels.length).toBeGreaterThan(50);
  });

  for (const taal of Object.keys(talen)) {
    it(`heeft elke titel in ${taal}`, () => {
      const ontbreekt = sleutels.filter((s) => typeof waardeVan(talen[taal], s) !== 'string');
      expect(ontbreekt).toEqual([]);
    });
  }

  it('verwijst nergens naar een sleutel die zelf niet bestaat', () => {
    // De titels zijn grotendeels verwijzingen in i18next-vorm: $t(nav.leden).
    // Wijst zo'n verwijzing naar niets, dan komt de hele tekst `$t(nav.leden)`
    // in het tabblad te staan - net zo kapot als een ontbrekende sleutel, maar
    // op een manier die de controle hierboven niet ziet.
    const kapot: string[] = [];

    for (const [naam, taal] of Object.entries(talen)) {
      for (const sleutel of sleutels) {
        const waarde = waardeVan(taal, sleutel);
        if (typeof waarde !== 'string') continue;
        for (const treffer of waarde.matchAll(/\$t\(([^)]+)\)/g)) {
          if (typeof waardeVan(taal, treffer[1].trim()) !== 'string') {
            kapot.push(`${naam}: ${sleutel} verwijst naar ${treffer[1].trim()}`);
          }
        }
      }
    }

    expect(kapot).toEqual([]);
  });
});
