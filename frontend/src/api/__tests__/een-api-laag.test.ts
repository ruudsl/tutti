/**
 * Waaktest: er is één api-laag, en `../api` komt erbij uit.
 *
 * Deze applicatie had twee bestanden die hetzelfde beloofden. `src/api.ts` was
 * het oude bestand van ruim vierduizend regels; `src/api/` is de opsplitsing
 * daarvan in domeinmodules. Beide bestonden jarenlang naast elkaar.
 *
 * Dat was niet zomaar dubbel werk. `import ... from '../api'` komt volgens de
 * gewone moduleregels áltijd bij een bestand `api.ts` uit - een bestand wint
 * van een map ernaast met dezelfde naam. Alles in de map dat niet expliciet
 * via `../api/<module>` werd aangeroepen draaide dus nooit, en `index.ts` -
 * bijna tweehonderd regels herexport - was helemaal onbereikbaar.
 *
 * Zo kon dezelfde functie in de ene laag gerepareerd worden en in de andere
 * stuk blijven staan. `downloadMusicPiece` las in de map wél `filename*`
 * (RFC 5987) en in api.ts niet; de aanroepers kregen api.ts, dus bladmuziek
 * met een ü of ñ in de naam kwam binnen als "Fr?hlingsstimmen.pdf". Die
 * reparatie had nooit gedraaid.
 *
 * Nu is er nog één laag. Deze test bewaakt dat het zo blijft: een nieuw
 * `src/api.ts` zou de hele map in één klap weer onbereikbaar maken, zonder dat
 * er ook maar iets rood wordt - de applicatie blijft namelijk gewoon werken,
 * met de verkeerde helft van de code.
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');

describe('er is één api-laag', () => {
  it('heeft geen src/api.ts naast de map src/api/', () => {
    // Elk van deze zou de map schaduwen; TypeScript en Vite lopen de lijst in
    // deze volgorde af en pakken de eerste die bestaat.
    const schaduwen = ['api.ts', 'api.tsx', 'api.js', 'api.jsx', 'api.d.ts'].filter((naam) =>
      existsSync(join(SRC, naam)),
    );

    expect(schaduwen).toEqual([]);
  });

  it('heeft een index.ts in de map, want daar komt `../api` op uit', () => {
    expect(existsSync(join(SRC, 'api', 'index.ts'))).toBe(true);
  });

  it('levert via `../api` dezelfde axios-instantie als de modules gebruiken', async () => {
    // De oude src/api.ts maakte zijn eigen axios-instantie aan, met een eigen
    // kopie van de twee interceptors. Waren die twee instanties uit elkaar
    // gelopen, dan handelde de ene helft van de applicatie een verlopen sessie
    // anders af dan de andere.
    const viaIndex = (await import('../index')).default;
    const viaClient = (await import('../client')).default;

    expect(viaIndex).toBe(viaClient);
  });
});
