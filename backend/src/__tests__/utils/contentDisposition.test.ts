/**
 * De kopregel Content-Disposition voor downloads.
 *
 * Bij bladmuziek is een titel met een niet-ASCII teken eerder regel dan
 * uitzondering. De oude, met de hand samengestelde kopregel liet daar twee
 * dingen misgaan: een teken tot U+00FF kwam als vervangingsteken aan, en een
 * teken daarboven liet Node de hele kopregel weigeren. Deze tests leggen vast
 * dat de naam nu in beide vormen meegaat.
 */

import { describe, it, expect } from 'vitest';
import '../setup';
import { bijlageKopregel, veiligeBestandsnaam } from '../../utils/contentDisposition';

/** Haalt de waarde van `filename*=UTF-8''...` weer uit de kopregel. */
function leesGecodeerdeNaam(kopregel: string): string {
  const treffer = kopregel.match(/filename\*=UTF-8''([^;]+)/);
  if (!treffer) throw new Error(`Geen filename* in kopregel: ${kopregel}`);
  return decodeURIComponent(treffer[1]);
}

/** Haalt de waarde van `filename="..."` weer uit de kopregel. */
function leesTerugvalNaam(kopregel: string): string {
  const treffer = kopregel.match(/filename="([^"]*)"/);
  if (!treffer) throw new Error(`Geen filename in kopregel: ${kopregel}`);
  return treffer[1];
}

describe('bijlageKopregel', () => {
  it('stuurt een umlaut ongeschonden mee in filename*', () => {
    const kopregel = bijlageKopregel('Frühlingsstimmen.pdf');

    expect(kopregel).toContain("filename*=UTF-8''");
    expect(leesGecodeerdeNaam(kopregel)).toBe('Frühlingsstimmen.pdf');
  });

  it('stuurt een tilde ongeschonden mee in filename*', () => {
    expect(leesGecodeerdeNaam(bijlageKopregel('Españita.zip'))).toBe('Españita.zip');
  });

  it('geeft daarnaast een ASCII-terugval voor oude clients', () => {
    const kopregel = bijlageKopregel('Café Chantant.zip');

    expect(leesTerugvalNaam(kopregel)).toBe('Caf_ Chantant.zip');
  });

  it('gebruikt geen vraagteken in de terugval, want dat mag Windows niet in een bestandsnaam', () => {
    expect(leesTerugvalNaam(bijlageKopregel('Mañana.pdf'))).not.toContain('?');
  });

  it('houdt de kopregel schrijfbaar bij een teken boven U+00FF', () => {
    // Zonder kodering weigerde Node deze kopregel met ERR_INVALID_CHAR, wat de
    // download een foutmelding 500 maakte in plaats van een verminkte naam.
    const kopregel = bijlageKopregel('Dvořák.zip');

    expect(kopregel).toMatch(/^[ -~]*$/);
    expect(leesGecodeerdeNaam(kopregel)).toBe('Dvořák.zip');
  });

  it('laat een naam die al ASCII is met rust', () => {
    const kopregel = bijlageKopregel('Mars der Medici.pdf');

    expect(leesTerugvalNaam(kopregel)).toBe('Mars der Medici.pdf');
    expect(leesGecodeerdeNaam(kopregel)).toBe('Mars der Medici.pdf');
  });

  it('weert een regelovergang, zodat niemand een eigen kopregel kan meesturen', () => {
    const kopregel = bijlageKopregel('mars\r\nSet-Cookie: sessie=gestolen.zip');

    expect(kopregel).not.toContain('\r');
    expect(kopregel).not.toContain('\n');
  });

  it('weert een aanhalingsteken, zodat de terugval niet vroegtijdig sluit', () => {
    expect(leesTerugvalNaam(bijlageKopregel('een "mars".zip'))).toBe('een _mars_.zip');
  });

  it('kodeert de tekens die encodeURIComponent laat staan maar RFC 5987 verbiedt', () => {
    const kopregel = bijlageKopregel("Ma'ana (deel 1).pdf");

    const gecodeerd = kopregel.slice(kopregel.indexOf("UTF-8''") + 7);
    expect(gecodeerd).not.toMatch(/['()]/);
    expect(leesGecodeerdeNaam(kopregel)).toBe("Ma'ana (deel 1).pdf");
  });
});

describe('veiligeBestandsnaam', () => {
  it('laat niet-ASCII letters staan, anders dan het oude kaalslaan', () => {
    expect(veiligeBestandsnaam('Frühlingsstimmen')).toBe('Frühlingsstimmen');
  });

  it('haalt de schuine strepen uit een naam die een pad probeert te zijn', () => {
    const naam = veiligeBestandsnaam('../../etc/passwd');

    expect(naam).not.toContain('/');
    expect(naam.startsWith('.')).toBe(false);
  });

  it('valt terug op een standaardnaam als er niets bruikbaars overblijft', () => {
    expect(veiligeBestandsnaam('///', 'muzieklijst.zip')).toBe('___');
    expect(veiligeBestandsnaam('', 'muzieklijst.zip')).toBe('muzieklijst.zip');
  });

  it('haalt beginpunten ook weg als er spaties voor staan', () => {
    // De volgorde van opschonen deed hier eerst het verkeerde: er werd op
    // beginpunten gefilterd vóórdat de spaties eraf gingen, dus ^ sloeg op de
    // spatie in plaats van op de punt. Een lijst met een naam als
    // "  ..verborgen" leverde dan een bestand op dat op Unix niet in de map
    // te zien is.
    expect(veiligeBestandsnaam('  ..verborgen')).toBe('verborgen');
    expect(veiligeBestandsnaam(' . ', 'muzieklijst.zip')).toBe('muzieklijst.zip');
  });

  it('overleeft een naam die op een halve emoji wordt afgekapt', () => {
    // Afkappen op een vaste lengte kan een surrogaatpaar doormidden snijden, en
    // daar gooit encodeURIComponent een URIError op.
    const lang = 'a'.repeat(149) + '🎺.zip';

    expect(() => bijlageKopregel(lang)).not.toThrow();
  });
});
