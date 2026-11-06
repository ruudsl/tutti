/**
 * Waaktest: wie het token van de gebruiker meestuurt, doet dat via de api-laag.
 *
 * Een eigen `fetch` met `localStorage.getItem('token')` werkt tot de sessie
 * verloopt. Dan antwoordt de server 401, maar de interceptor in client.ts -
 * die het token wist en naar het inlogscherm stuurt - ziet het verzoek nooit.
 * De gebruiker blijft op een pagina die stilletjes niets doet. Het zoeken in
 * de app deed dit; de geschiedenis van deze repository heeft er twintig van
 * opgeruimd (1f363ed).
 *
 * Deze test leest de bronbestanden als tekst. Een bestand dat zowel zelf
 * `fetch(` doet als het token uit localStorage leest, staat hieronder, of de
 * test faalt. Andere tokens (een toegangstoken van Google of Microsoft in de
 * bestandskiezer) vallen er niet onder; de service worker heeft geen toegang
 * tot de api-laag en is uitgezonderd.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(process.cwd(), 'src');

/**
 * Bestaande gevallen die nog naar de api-laag moeten. Haal er een weg zodra
 * het is omgezet; de test faalt ook als een bestand hier staat dat het niet
 * meer doet, zodat de lijst alleen korter kan worden.
 */
const NOG_OM_TE_ZETTEN: Record<string, string> = {
  'components/PdfThumbnail.tsx': 'haalt de pdf als ArrayBuffer op; kan via api met responseType arraybuffer',
  'lib/pdfCache.ts': 'zelfde: pdf als ArrayBuffer',
  'lib/offlineDb.ts': 'speelt de offline wachtrij af; valt zonder VITE_API_URL terug op localhost:3001',
  'hooks/useOfflineData.ts': 'speelt offline mutaties af',
};

function bronbestanden(map: string): string[] {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) return naam === '__tests__' ? [] : bronbestanden(pad);
    if (!/\.tsx?$/.test(naam) || /\.test\.tsx?$/.test(naam) || naam === 'sw-custom.ts') return [];
    return [pad];
  });
}

function kaleFetchMetToken(): string[] {
  return bronbestanden(SRC)
    .filter((pad) => {
      const tekst = readFileSync(pad, 'utf8');
      return /\bfetch\(/.test(tekst) && /localStorage\.getItem\(\s*['"]token['"]\s*\)/.test(tekst);
    })
    .map((pad) => relative(SRC, pad).split('\\').join('/'))
    .sort();
}

describe('het token gaat alleen via de api-laag mee', () => {
  it('heeft geen nieuwe bestanden met een eigen fetch en het token', () => {
    const nieuw = kaleFetchMetToken().filter((pad) => !(pad in NOG_OM_TE_ZETTEN));

    expect(nieuw).toEqual([]);
  });

  it('heeft geen bestanden op de uitzonderingslijst die al zijn omgezet', () => {
    const gevonden = new Set(kaleFetchMetToken());
    const alOmgezet = Object.keys(NOG_OM_TE_ZETTEN).filter((pad) => !gevonden.has(pad));

    expect(alOmgezet).toEqual([]);
  });

  it('herkent het patroon in een voorbeeld', () => {
    // Controle op de controle: zonder dit zou een kapotte reguliere
    // expressie de eerste test altijd groen maken.
    const voorbeeld =
      "const t = localStorage.getItem('token'); await fetch('/api/x', { headers: { Authorization: t } });";
    expect(/\bfetch\(/.test(voorbeeld) && /localStorage\.getItem\(\s*['"]token['"]\s*\)/.test(voorbeeld)).toBe(true);
  });
});
