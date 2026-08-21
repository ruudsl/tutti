/**
 * Een wijzigingsschema mag geen standaardwaarden meedragen.
 *
 * `z.object({...}).partial()` maakt elk veld optioneel, maar laat een
 * `.default()` gewoon staan. Zod vult die standaard dan alsnog in voor een veld
 * dat de aanvraag niet noemde. Op een aanmaakroute is dat precies goed; op een
 * wijzigingsroute betekent het dat een PUT met één veld de rest terugzet naar
 * de fabrieksstand.
 *
 * Dat is hier echt gebeurd: `PUT /discount-codes/:id` met alleen een
 * omschrijving zette een uitgezette kortingscode weer aan, gooide de minimale
 * bestelwaarde op nul en de limiet per koper terug op een. De beheerder kreeg
 * "opgeslagen" te zien en had ondertussen een misbruikte code heropend.
 *
 * `wijzigingsschema()` in utils/schema.ts pelt die schil eraf. Deze test
 * bewaakt de eigenschap zelf over alle routebestanden, zodat het niet opnieuw
 * per geval ontdekt hoeft te worden.
 *
 * Wat deze test NIET dekt: een schema zonder `.partial()` dat op een route
 * hangt die toevoegen en bijwerken combineert. Dat was het geval bij de
 * stoelen in venue-layouts.ts, waar `seatType` en `isAvailable` bij elke
 * verplaatsing werden teruggezet. Die vorm is uit de tekst niet te herkennen -
 * daar moet je weten wat de route doet.
 *
 * Alleen standaardwaarden op het BOVENSTE niveau tellen. `.partial()` raakt
 * geneste velden niet, dus een `.default()` binnen een array-element (zoals
 * `quantity` in uniforms.ts) is geen probleem: wie die array meestuurt vervangt
 * hem in zijn geheel.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROUTES_MAP = path.join(__dirname, '../../routes');
const VALIDATIE_MAP = path.join(__dirname, '../../validation');

/** De tekst tussen `z.object({` en de bijbehorende sluithaak. */
function objectInhoud(bron: string, naam: string): string | null {
  const start = new RegExp(`\\b(?:const|let|var)\\s+${naam}\\s*=\\s*z\\s*\\.?\\s*\\n?\\s*\\.?object\\(\\s*\\{`).exec(
    bron,
  );
  if (!start) return null;

  const eerste = bron.indexOf('{', start.index);
  let diepte = 0;
  for (let i = eerste; i < bron.length; i++) {
    const teken = bron[i];
    if (teken === '{' || teken === '(' || teken === '[') diepte++;
    else if (teken === '}' || teken === ')' || teken === ']') {
      diepte--;
      if (diepte === 0) return bron.slice(eerste, i + 1);
    }
  }
  return null;
}

/** Standaardwaarden die direct op een veld van dit object staan. */
function standaardwaardenOpTopniveau(inhoud: string): number {
  let diepte = 0;
  let aantal = 0;
  const patroon = /[{()[\]}]|\.default\(/g;
  let m: RegExpExecArray | null;

  while ((m = patroon.exec(inhoud)) !== null) {
    const teken = m[0];
    if (teken === '.default(') {
      if (diepte === 1) aantal++;
    } else if (teken === '{' || teken === '(' || teken === '[') {
      diepte++;
    } else {
      diepte--;
    }
  }
  return aantal;
}

function lees(map: string): { naam: string; bron: string }[] {
  return fs
    .readdirSync(map)
    .filter((n) => n.endsWith('.ts'))
    .sort()
    .map((naam) => ({ naam, bron: fs.readFileSync(path.join(map, naam), 'utf-8') }));
}

const bestanden = [...lees(ROUTES_MAP), ...lees(VALIDATIE_MAP)];

/**
 * Zoek het schema op: eerst in het bestand zelf, dan pas elders.
 *
 * Die volgorde is niet vrijblijvend. `createLayoutSchema` bestaat twee keer -
 * in stage-layouts.ts met vijf standaardwaarden, en in venue-layouts.ts zonder.
 * Zoeken op naam over alle bestanden pakte de eerste op alfabet en meldde
 * venue-layouts.ts ten onrechte. Een naam is alleen betekenisvol binnen zijn
 * eigen bestand; de uitwijk naar elders is er voor schema's die centraal in
 * validation/schemas.ts staan.
 */
function zoekInhoud(eigenBron: string, naam: string): string | null {
  const eigen = objectInhoud(eigenBron, naam);
  if (eigen) return eigen;

  for (const { bron } of bestanden) {
    const inhoud = objectInhoud(bron, naam);
    if (inhoud) return inhoud;
  }
  return null;
}

describe('wijzigingsschemas dragen geen standaardwaarden mee', () => {
  it('vindt bestanden om te controleren', () => {
    expect(bestanden.length).toBeGreaterThan(50);
  });

  it('vindt daadwerkelijk .partial()-gebruik', () => {
    // Zonder deze controle zou de test stilletjes slagen als de schrijfwijze
    // ooit verandert en het patroon nergens meer herkend wordt.
    const totaal = bestanden.reduce(
      (som, { bron }) =>
        som + [...bron.matchAll(/([A-Za-z_$][\w$]*)\s*\n?\s*(?:\.omit\([^)]*\)\s*)?\.partial\(\)/g)].length,
      0,
    );
    expect(totaal).toBeGreaterThan(10);
  });

  it.each(bestanden.map((b) => b.naam))('%s', (naam) => {
    const bron = bestanden.find((b) => b.naam === naam)!.bron;
    const problemen: string[] = [];

    for (const m of bron.matchAll(/([A-Za-z_$][\w$]*)\s*\n?\s*(?:\.omit\([^)]*\)\s*)?\.partial\(\)/g)) {
      const schema = m[1];
      if (schema === 'z') continue;

      const inhoud = zoekInhoud(bron, schema);
      if (!inhoud) continue; // schema van elders; niet te lezen uit de tekst

      const aantal = standaardwaardenOpTopniveau(inhoud);
      if (aantal > 0) {
        const regel = bron.slice(0, m.index).split('\n').length;
        problemen.push(
          `${schema}.partial() (regel ${regel}) houdt ${aantal} standaardwaarde(n) op het bovenste niveau - ` +
            `gebruik wijzigingsschema() uit utils/schema.ts`,
        );
      }
    }

    expect(problemen).toEqual([]);
  });
});
