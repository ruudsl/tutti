/**
 * Waaktest: de twee api-lagen mogen niet uit elkaar lopen.
 *
 * Deze applicatie heeft twee bestanden die hetzelfde beloven. `src/api.ts` is
 * het oude bestand van ruim vierduizend regels; `src/api/` is de opsplitsing
 * daarvan in domeinmodules. De opsplitsing is destijds gemaakt, maar het oude
 * bestand is nooit weggehaald.
 *
 * Dat is niet zomaar dubbel werk. `import ... from '../api'` komt volgens de
 * gewone moduleregels áltijd bij `src/api.ts` uit - een bestand wint van een
 * map ernaast met dezelfde naam. Alles wat in de map staat en niet expliciet
 * via `../api/<module>` wordt aangeroepen, draait dus nooit.
 *
 * Zo kon het gebeuren dat dezelfde functie in de ene laag gerepareerd werd en
 * in de andere stuk bleef staan - in beide richtingen:
 *
 *   - `downloadMusicPiece` las in de map wél `filename*` (RFC 5987) en in
 *     api.ts niet. Aanroepers kregen api.ts, dus bladmuziek met een ü of ñ in
 *     de naam kwam binnen als "Fr?hlingsstimmen.pdf".
 *   - `getUsers` en `getUsersPaginated` waren in api.ts gerepareerd en bleven
 *     in de map stuk: paginagrootte onder de verkeerde naam, en een
 *     paginering die nooit voorbij de eerste pagina kwam.
 *   - `getRecentActivity` riep in de map een route aan die de server niet kent.
 *
 * Zolang beide lagen bestaan houdt deze test ze gelijk. Bij het samenvoegen
 * verdwijnt `src/api.ts` en mag dit bestand mee weg - de kop hieronder legt
 * uit waarom het er ooit stond.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Vanaf de projectmap, niet vanaf import.meta.url: dat laatste levert onder
// de jsdom-omgeving een pad op dat los staat van de schijf.
const API_MAP = join(process.cwd(), 'src', 'api');
const API_BESTAND = join(process.cwd(), 'src', 'api.ts');

/**
 * Per geëxporteerde functie de tekst van die functie alleen: vanaf de
 * `export`-regel tot en met de eerste regel die op kolom 0 sluit. Zonder die
 * grens sleept een functie de interfaces en het commentaar erna mee, en dan
 * verschilt alles van alles.
 */
function functies(pad: string): Map<string, string> {
  const regels = readFileSync(pad, 'utf-8').split('\n');
  const uit = new Map<string, string>();
  regels.forEach((regel, i) => {
    const m = /^export (?:const|(?:async )?function) (\w+)/.exec(regel);
    if (!m) return;
    let j = i;
    while (j < regels.length && !/^\}[;,]?\s*$/.test(regels[j])) j++;
    uit.set(m[1], regels.slice(i, j + 1).join('\n'));
  });
  return uit;
}

/**
 * Commentaar weg, witruimte gelijk, en de naam van de axios-instantie gelijk:
 * api.ts noemt hem `api`, sommige modules `client`. Een verschil in naamgeving
 * of opmaak is geen gedragsverschil en hoort deze test niet te laten vallen.
 */
function genormaliseerd(blok: string): string {
  return blok
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bclient\./g, 'api.');
}

/**
 * Namen die in beide lagen voorkomen maar bewust iets anders betekenen.
 * `src/api/events.ts` gaat over losse evenementen, api.ts over repetities en
 * Spond. Dat zijn twee functies die toevallig hetzelfde heten; `api/index.ts`
 * hernoemt ze dan ook bij het herexporteren, naar updateEventAttendance en
 * getEventAttendanceSummary. Ze horen dus níet gelijk te zijn.
 */
const BEWUST_ANDERS = new Set(['events.ts::updateMyAttendance', 'events.ts::getAttendanceSummary']);

/**
 * Verschillen die alleen over de naam van een parameter gaan. Die zijn
 * onschuldig, maar wel een verschil in tekst; ze staan hier zodat de test niet
 * gaat piepen over iets wat niemand merkt.
 */
const ALLEEN_EEN_PARAMETERNAAM = new Set([
  'music.ts::updateMusicList',
  'onboarding.ts::createM365GroupMapping',
  'onboarding.ts::createInstrumentJobTitleMapping',
]);

describe('de twee api-lagen beloven hetzelfde', () => {
  const inApiBestand = functies(API_BESTAND);
  const modules = readdirSync(API_MAP).filter((n) => n.endsWith('.ts') && n !== 'index.ts' && n !== 'client.ts');

  const dubbel: { sleutel: string; hier: string; daar: string }[] = [];
  for (const module of modules) {
    for (const [naam, tekst] of functies(join(API_MAP, module))) {
      const inBestand = inApiBestand.get(naam);
      if (inBestand) dubbel.push({ sleutel: `${module}::${naam}`, hier: inBestand, daar: tekst });
    }
  }

  it('vindt de dubbele functies überhaupt', () => {
    // Zakt dit getal ineens in, dan is de vergelijking hierboven stuk en zegt
    // de test hieronder niets meer.
    expect(dubbel.length).toBeGreaterThan(300);
  });

  it('houdt elke dubbele functie in beide lagen gelijk', () => {
    const uiteen = dubbel
      .filter(({ sleutel }) => !BEWUST_ANDERS.has(sleutel) && !ALLEEN_EEN_PARAMETERNAAM.has(sleutel))
      .filter(({ hier, daar }) => genormaliseerd(hier) !== genormaliseerd(daar))
      .map(({ sleutel }) => sleutel);

    expect(uiteen).toEqual([]);
  });

  it('houdt de uitzonderingenlijst eerlijk', () => {
    // Een uitzondering voor iets wat niet meer bestaat, of wat inmiddels tóch
    // gelijk is, verbergt de volgende afwijking. Dus die hoort weg.
    const sleutels = new Set(dubbel.map((d) => d.sleutel));
    for (const uitzondering of [...BEWUST_ANDERS, ...ALLEEN_EEN_PARAMETERNAAM]) {
      expect(sleutels.has(uitzondering)).toBe(true);
    }

    const onnodig = [...ALLEEN_EEN_PARAMETERNAAM].filter((sleutel) => {
      const d = dubbel.find((x) => x.sleutel === sleutel)!;
      return genormaliseerd(d.hier) === genormaliseerd(d.daar);
    });
    expect(onnodig).toEqual([]);
  });
});
