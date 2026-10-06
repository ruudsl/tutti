/**
 * Titel, instrument en partijnummer uit de naam van een pdf-bestand
 * (utils/bestandsnaam.ts).
 *
 * Alleen de vorm met liggende streepjes werd gelezen. "Bolero - Trompet
 * 1.pdf" werd een stuk zonder instrument dat bij geen lid in Mijn Muziek
 * verscheen. Wat hier vastligt: de oude vorm werkt zoals altijd, gewone namen
 * worden gelezen, en een titel met een streepje of een nummer wordt niet ten
 * onrechte opgeknipt.
 */

import { describe, it, expect } from 'vitest';
import { leesBestandsnaam } from '../../utils/bestandsnaam';

const BEKEND = new Set(['trompet', 'klarinet', 'bb klarinet', 'hoorn', 'alt saxofoon', 'bugel']);
const kent = (naam: string) => BEKEND.has(naam.toLowerCase());

describe('de vorm met liggende streepjes', () => {
  it('leest alle zes de delen zoals altijd', () => {
    expect(leesBestandsnaam('The Pacific_Ted Ricketts_Bariton_Bb__sol.pdf', kent)).toEqual({
      title: 'The Pacific',
      arranger: 'Ted Ricketts',
      instrument: 'Bariton',
      tuning: 'Bb',
      groupNumber: null,
      clef: 'sol',
    });
  });
});

describe('gewone bestandsnamen', () => {
  it('leest titel, instrument en partijnummer na een streepje', () => {
    expect(leesBestandsnaam('Bolero - Trompet 1.pdf', kent)).toMatchObject({
      title: 'Bolero',
      instrument: 'Trompet',
      groupNumber: '1',
      tuning: null,
    });
  });

  it('herkent ook een gedachtestreepje en een titel met streepje erin', () => {
    expect(leesBestandsnaam('Ouverture - 1812 – Hoorn 2.PDF', kent)).toMatchObject({
      title: 'Ouverture - 1812',
      instrument: 'Hoorn',
      groupNumber: '2',
    });
  });

  it('haalt de stemming eruit, ervoor of na "in"', () => {
    expect(leesBestandsnaam('Bolero - Klarinet in Bb 2.pdf', kent)).toMatchObject({
      instrument: 'Klarinet',
      tuning: 'Bb',
      groupNumber: '2',
    });
    expect(leesBestandsnaam('Bolero - Hoorn in F.pdf', kent)).toMatchObject({ instrument: 'Hoorn', tuning: 'F' });
  });

  it('houdt de stemming bij het instrument als de vereniging die naam zo kent', () => {
    expect(leesBestandsnaam('Bolero - Bb Klarinet 1.pdf', kent)).toMatchObject({
      instrument: 'Bb Klarinet',
      tuning: null,
      groupNumber: '1',
    });
  });

  it('leest een naam zonder streepje als de laatste woorden een bekend instrument zijn', () => {
    expect(leesBestandsnaam('Mars der Medici Alt Saxofoon 2.pdf', kent)).toMatchObject({
      title: 'Mars der Medici',
      instrument: 'Alt Saxofoon',
      groupNumber: '2',
    });
  });
});

describe('wat niet opgeknipt wordt', () => {
  it('laat een titel met een ondertitel heel', () => {
    expect(leesBestandsnaam('Pirates of the Caribbean - Medley.pdf', kent)).toMatchObject({
      title: 'Pirates of the Caribbean - Medley',
      instrument: null,
    });
  });

  it('laat een titel met een nummer heel als er geen bekend instrument in staat', () => {
    expect(leesBestandsnaam('Symfonie 5.pdf', kent)).toMatchObject({ title: 'Symfonie 5', instrument: null });
    expect(leesBestandsnaam('Symfonie - 5.pdf', kent)).toMatchObject({ title: 'Symfonie - 5', instrument: null });
  });

  it('knipt zonder lijst van instrumenten alleen bij een streepje met nummer of stemming', () => {
    expect(leesBestandsnaam('Bolero - Trompet 1.pdf')).toMatchObject({ title: 'Bolero', instrument: 'Trompet' });
    expect(leesBestandsnaam('Bolero - Trompet.pdf')).toMatchObject({ title: 'Bolero - Trompet', instrument: null });
    expect(leesBestandsnaam('Bolero Trompet 1.pdf')).toMatchObject({ title: 'Bolero Trompet 1', instrument: null });
  });
});
