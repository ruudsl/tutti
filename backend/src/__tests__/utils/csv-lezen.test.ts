/**
 * Een CSV-bestand inlezen zoals Excel, LibreOffice en Google Sheets het
 * opslaan (utils/csvLezen.ts).
 */

import { describe, it, expect } from 'vitest';
import { leesCsv, MAX_TEKENS, raadScheidingsteken } from '../../utils/csvLezen';
import { csvBestand } from '../../utils/csv';

describe('het scheidingsteken raden', () => {
  it('herkent de puntkomma van Excel in Nederland', () => {
    expect(raadScheidingsteken('Voornaam;Achternaam;E-mail\nAnna;Jansen;a@x.nl')).toBe(';');
  });

  it('herkent de komma van Google Sheets', () => {
    expect(raadScheidingsteken('Titel,Componist\nBolero,Ravel')).toBe(',');
  });

  it('herkent een tab', () => {
    expect(raadScheidingsteken('Titel\tComponist\nBolero\tRavel')).toBe('\t');
  });

  it('telt een komma tussen aanhalingstekens niet mee', () => {
    expect(raadScheidingsteken('"Achternaam, voornaam";E-mail\n')).toBe(';');
  });
});

describe('een CSV-bestand lezen', () => {
  it('geeft de kopregel en de rijen apart terug', () => {
    const gelezen = leesCsv('Voornaam;Achternaam\nAnna;Jansen\nBram;de Vries\n');
    expect(gelezen.kopregel).toEqual(['Voornaam', 'Achternaam']);
    expect(gelezen.rijen).toEqual([
      ['Anna', 'Jansen'],
      ['Bram', 'de Vries'],
    ]);
  });

  it('haalt de BOM van Excel weg en leest CRLF-regels', () => {
    const gelezen = leesCsv('\uFEFFTitel;Componist\r\nBolero;Ravel\r\n');
    expect(gelezen.kopregel).toEqual(['Titel', 'Componist']);
    expect(gelezen.rijen).toEqual([['Bolero', 'Ravel']]);
  });

  it('leest velden tussen aanhalingstekens, met scheidingsteken, aanhalingsteken en regelovergang erin', () => {
    const gelezen = leesCsv('Titel;Opmerking\n"Mars; deel 1";"Zei ""hallo""\nen ging"\n');
    expect(gelezen.rijen).toEqual([['Mars; deel 1', 'Zei "hallo"\nen ging']]);
  });

  it('laat lege regels en regels met alleen scheidingstekens weg', () => {
    const gelezen = leesCsv('Titel;Componist\n\nBolero;Ravel\n;;\n');
    expect(gelezen.rijen).toEqual([['Bolero', 'Ravel']]);
  });

  it('haalt witruimte rond een veld weg', () => {
    expect(leesCsv('Titel ; Componist\n Bolero ;Ravel ').rijen).toEqual([['Bolero', 'Ravel']]);
  });

  it('leest een bestand zonder afsluitende regelovergang', () => {
    expect(leesCsv('Titel\nBolero').rijen).toEqual([['Bolero']]);
  });

  it('leest alleen tekst, en niet meer dan de grens', () => {
    // Een object met een verzonnen lengte zou de lezer anders eindeloos laten lopen.
    expect(() => leesCsv({ length: 1e12 })).toThrow(TypeError);
    expect(() => leesCsv('x'.repeat(MAX_TEKENS + 1))).toThrow(RangeError);
  });

  it('geeft een leeg bestand terug als leeg', () => {
    expect(leesCsv('')).toMatchObject({ kopregel: [], rijen: [] });
  });

  it('leest terug wat onze eigen export schrijft, ook de beschermde formuletekens', () => {
    const rijen = [
      ['=HYPERLINK("x")', 'Jan "Bassie" de Vries'],
      ['-12', 'regel\nover twee'],
    ];
    const tekst = csvBestand(['Titel', 'Naam'], rijen, ';');

    const gelezen = leesCsv(tekst);

    expect(gelezen.kopregel).toEqual(['Titel', 'Naam']);
    expect(gelezen.rijen).toEqual(rijen);
  });
});
