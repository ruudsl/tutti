/**
 * Een cache die niet per gebruiker varieert lekt tussen leden.
 *
 * cacheMiddleware slaat een antwoord op onder methode, url en - standaard -
 * de vereniging. Hangt het antwoord ook van de rol of van de persoon af, dan
 * moet varyByUser aan. Staat dat niet aan, dan vult wie als eerste vraagt de
 * cache voor de hele vereniging.
 *
 * Dat was op vier plaatsen misgegaan, en het waren geen theoretische lekken:
 *
 *   /custom-fields/definitions      admin_only velden bij elk lid
 *   /posts                          concepten en geplande berichten bij elk lid
 *   /polls                          concepten, gerichte peilingen, stemstatus
 *   /tasks?assignedTo=me            de taken van het lid dat als eerste vroeg
 *
 * Deze test leest de routebestanden en houdt de lijst leeg. Hij kijkt naar de
 * bron en niet naar draaiend gedrag, omdat het gedrag pas verkeerd is bij de
 * tweede aanvraag binnen de bewaartijd - precies het geval dat je in een
 * gewone test niet tegenkomt.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROUTES = path.join(__dirname, '../../routes');

/** Haal de router.get(...)-blokken uit een bestand. */
function routeBlokken(bron: string): { pad: string; blok: string }[] {
  const blokken: { pad: string; blok: string }[] = [];
  const patroon = /router\.get\(\s*'([^']+)',([\s\S]*?)\n\);/g;
  let treffer: RegExpExecArray | null;
  while ((treffer = patroon.exec(bron)) !== null) {
    blokken.push({ pad: treffer[1], blok: treffer[2] });
  }
  return blokken;
}

/** De opties waarmee de cache in dit blok is opgezet, of null als er geen cache is. */
function cacheOpties(blok: string, bron: string): string | null {
  const direct = blok.match(/cacheMiddleware\(([^)]*)\)/);
  if (direct) return direct[1];

  for (const [, naam, opties] of bron.matchAll(/const (\w+) = cacheMiddleware\(([^)]*)\)/g)) {
    if (new RegExp(`\\b${naam}\\b`).test(blok)) return opties;
  }
  return null;
}

describe('cache varieert waar dat moet', () => {
  const bestanden = fs.readdirSync(ROUTES).filter((b) => b.endsWith('.ts'));

  it('vindt de routebestanden', () => {
    expect(bestanden.length).toBeGreaterThan(20);
  });

  it('zet varyByUser aan op elk gecachet antwoord dat van de gebruiker afhangt', () => {
    const overtreders: string[] = [];

    for (const bestand of bestanden) {
      const bron = fs.readFileSync(path.join(ROUTES, bestand), 'utf8');
      if (!bron.includes('cacheMiddleware')) continue;

      for (const { pad, blok } of routeBlokken(bron)) {
        const opties = cacheOpties(blok, bron);
        if (opties === null || opties.includes('varyByUser')) continue;

        // Laat de commentaarregels buiten beschouwing: een toelichting die
        // req.user!.role noemt is geen gebruik ervan.
        const code = blok
          .split('\n')
          .filter((r) => !r.trim().startsWith('//') && !r.trim().startsWith('*'))
          .join('\n');

        if (/req\.user!?\.(role|id)\b/.test(code)) {
          overtreders.push(`${bestand} ${pad}`);
        }
      }
    }

    expect(overtreders).toEqual([]);
  });
});
