/**
 * `.partial()` op een aanmaakschema is geen wijzigingsschema.
 *
 * zod maakt met `.partial()` elk veld optioneel maar laat een `.default()`
 * staan. Een veld dat het verzoek niet noemt komt dan niet als `undefined`
 * binnen maar als de standaardwaarde - en die wordt gewoon weggeschreven, ook
 * door een `COALESCE(?, kolom)`, want een standaardwaarde is geen NULL.
 *
 * Dat ging op elf plaatsen mis. De ernstigste:
 *
 *   PUT /stage-layouts/:id      wiste de hele opstelling bij elke wijziging
 *   PATCH /posts/:id            zette een gepubliceerd bericht terug op concept
 *   PUT /uniforms/items/:id     zette een uitgegeven onderdeel op beschikbaar
 *   PUT /instrument-assets/:id  idem, en de toestand terug op 'good'
 *
 * Deze test doet twee dingen. Hij controleert de hulpfunctie zelf, en hij
 * leest de routebestanden om te voorkomen dat er weer een `.partial()` op een
 * schema met standaarden verschijnt.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { wijzigingsschema } from '../../utils/schema';

const ROUTES = path.join(__dirname, '../../routes');

describe('wijzigingsschema', () => {
  const basis = z.object({
    naam: z.string().min(1),
    status: z.enum(['available', 'issued']).default('available'),
    breedte: z.number().int().min(100).default(1000),
    losOptioneel: z.string().optional(),
  });

  it('laat een veld dat niet is meegestuurd weg', () => {
    expect(wijzigingsschema(basis).parse({ naam: 'x' })).toEqual({ naam: 'x' });
  });

  it('laat zien waarom het nodig is: partial() vult de standaarden wel in', () => {
    expect(basis.partial().parse({ naam: 'x' })).toEqual({ naam: 'x', status: 'available', breedte: 1000 });
  });

  it('neemt een veld dat wel is meegestuurd gewoon over', () => {
    expect(wijzigingsschema(basis).parse({ status: 'issued', breedte: 500 })).toEqual({
      status: 'issued',
      breedte: 500,
    });
  });

  it('blijft de waarde valideren', () => {
    expect(() => wijzigingsschema(basis).parse({ status: 'kwijt' })).toThrow();
    expect(() => wijzigingsschema(basis).parse({ breedte: 10 })).toThrow();
    expect(() => wijzigingsschema(basis).parse({ naam: '' })).toThrow();
  });

  it('maakt ook een verplicht veld optioneel', () => {
    expect(wijzigingsschema(basis).parse({})).toEqual({});
  });

  it('laat een veld zonder standaard met rust', () => {
    expect(wijzigingsschema(basis).parse({ losOptioneel: 'iets' })).toEqual({ losOptioneel: 'iets' });
  });
});

describe('geen partial() meer op een schema met standaarden', () => {
  /**
   * De velden met een .default() op het bovenste niveau van een z.object-blok.
   *
   * Alleen dat niveau telt. Een standaard die binnen een genest object staat -
   * bijvoorbeeld quantity in de requirements van een uniformset - is juist
   * gewenst: die geldt pas zodra dat geneste object wordt meegestuurd, en
   * `.partial()` raakt hem niet.
   */
  function veldenMetStandaard(bron: string, schemaNaam: string): string[] {
    const definitie = new RegExp(`const ${schemaNaam} = z\\.object\\(\\{([\\s\\S]*?)\\n\\}\\);`).exec(bron);
    if (!definitie) return [];

    const velden: string[] = [];

    // Deel het blok op in stukken per veld op het bovenste niveau.
    const stukken: { naam: string; tekst: string }[] = [];
    let diepte = 0;
    for (const regel of definitie[1].split('\n')) {
      const start = diepte === 0 ? /^\s{2}(\w+):/.exec(regel) : null;
      if (start) stukken.push({ naam: start[1], tekst: '' });
      if (stukken.length > 0) stukken[stukken.length - 1].tekst += regel + '\n';

      for (const teken of regel) {
        if (teken === '(' || teken === '{' || teken === '[') diepte++;
        if (teken === ')' || teken === '}' || teken === ']') diepte--;
      }
      if (diepte < 0) diepte = 0;
    }

    // Binnen een stuk telt alleen een .default() die niet in een haakjespaar
    // zit: `z.number().default(1)` wel, `z.array(z.object({ n: ... .default(1) }))`
    // niet.
    for (const { naam, tekst } of stukken) {
      let d = 0;
      for (let i = 0; i < tekst.length; i++) {
        if (d === 0 && tekst.startsWith('.default(', i)) {
          velden.push(naam);
          break;
        }
        const teken = tekst[i];
        if (teken === '(' || teken === '{' || teken === '[') d++;
        if (teken === ')' || teken === '}' || teken === ']') d--;
        if (d < 0) d = 0;
      }
    }

    return velden;
  }

  it('vindt geen enkel geval meer', () => {
    const overtreders: string[] = [];

    for (const bestand of fs.readdirSync(ROUTES).filter((b) => b.endsWith('.ts'))) {
      const bron = fs.readFileSync(path.join(ROUTES, bestand), 'utf8');

      for (const [, bronSchema] of bron.matchAll(/(?:const \w+ = )?(\w+)\.partial\(\)/g)) {
        const velden = veldenMetStandaard(bron, bronSchema);
        if (velden.length > 0) {
          overtreders.push(`${bestand}: ${bronSchema} (${velden.join(', ')})`);
        }
      }
    }

    expect(overtreders).toEqual([]);
  });
});
