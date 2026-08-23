/**
 * Tests voor de tenue-api.
 *
 * Tenues zijn een klein onderdeel met twee scherpe randjes.
 *
 * Het eerste is de volgorde. `reorderOutfits` gaat naar PUT /outfits/reorder,
 * terwijl er ook een PATCH /outfits/:id bestaat. In Express is dat geen
 * botsing omdat de werkwoorden verschillen - maar zou het herordenen ooit als
 * PATCH of PUT op /:id geschreven worden, dan belandt het bij de route die één
 * tenue wijzigt, met een body vol `outfitIds` die daar niets betekent. De
 * server geeft dan 200 terug en de volgorde verandert niet. Daarom wordt hier
 * op het werkwoord én het pad getoetst.
 *
 * Het tweede is het verschil tussen de lijst en het detail. GET /outfits telt
 * per tenue hoe vaak het bij een concert gedragen is; GET /outfits/:id doet
 * dat niet. Het type beloofde dat getal op beide - zie de test daarover
 * hieronder - en dat leverde een stille `undefined` op in plaats van een
 * foutmelding.
 *
 * De paden zijn vergeleken met backend/src/routes/outfits.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startNepserver, stopNepserver, antwoordMet, antwoordMetFout, laatsteVerzoek } from './nepserver';
import { serverroutes, serverBiedtAan } from './serverroutes';
import {
  getOutfits,
  getOutfit,
  createOutfit,
  updateOutfit,
  deleteOutfit,
  linkOutfitToConcert,
  unlinkOutfitFromConcert,
  reorderOutfits,
} from '../outfits';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

describe('lijst en detail', () => {
  it('haalt de lijst op met het aantal keren dat een tenue gedragen is', async () => {
    antwoordMet([
      {
        id: 'o1',
        name: 'Rok en witte das',
        colorCode: '#000000',
        items: ['Rok', 'Witte das', 'Zwarte schoenen'],
        isDefault: true,
        sortOrder: 0,
        usageCount: 7,
        createdAt: '2026-01-01',
      },
    ]);

    const tenues = await getOutfits();

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/outfits');
    expect(tenues[0].usageCount).toBe(7);
    // `items` staat in de database als JSON-tekst en wordt aan de serverkant
    // uitgepakt. Kwam het hier als tekst binnen, dan zou `.slice(0, 3)` in het
    // scherm drie letters tonen in plaats van drie kledingstukken.
    expect(tenues[0].items).toEqual(['Rok', 'Witte das', 'Zwarte schoenen']);
  });

  it('haalt één tenue op met de concerten waarbij het gedragen is', async () => {
    antwoordMet({
      id: 'o1',
      name: 'Rok en witte das',
      items: [],
      isDefault: true,
      sortOrder: 0,
      createdByName: 'Anna de Groot',
      recentConcerts: [{ id: 'c1', name: 'Kerstconcert', date: '2026-12-20' }],
    });

    const tenue = await getOutfit('o1');

    expect(laatsteVerzoek().pad).toBe('/outfits/o1');
    expect(tenue.recentConcerts[0].name).toBe('Kerstconcert');
  });

  it('belooft geen usageCount op het detailantwoord, want de server geeft dat daar niet', async () => {
    antwoordMet({ id: 'o1', name: 'Rok', items: [], isDefault: false, sortOrder: 0, recentConcerts: [] });

    const tenue = await getOutfit('o1');

    // @ts-expect-error - `usageCount` hoort niet bij het detailantwoord; alleen
    // de lijstroute telt de concerten. Deze regel is de reparatie zelf: zolang
    // OutfitDetail gewoon Outfit uitbreidde, was dit een geldige uitdrukking
    // van het type `number` met de waarde `undefined`, en dan faalt `tsc` hier
    // op een ongebruikte @ts-expect-error. Precies de bedoeling.
    expect(tenue.usageCount).toBeUndefined();
  });

  it('laat een 404 door in plaats van hem als leeg tenue te verpakken', async () => {
    antwoordMetFout(404, { error: 'Outfit not found' });

    await expect(getOutfit('bestaat-niet')).rejects.toMatchObject({ response: { status: 404 } });
  });
});

describe('aanmaken en wijzigen', () => {
  it('stuurt de kledingstukken als lijst mee, niet als één tekst', async () => {
    antwoordMet({ id: 'o9', message: 'Tenue aangemaakt' });

    await createOutfit({ name: 'Zomerkleding', items: ['Wit overhemd', 'Zwarte broek'], isDefault: false });

    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/outfits');
    expect(laatsteVerzoek().body).toEqual({
      name: 'Zomerkleding',
      items: ['Wit overhemd', 'Zwarte broek'],
      isDefault: false,
    });
  });

  it('wijzigt met PATCH, want de server kent op /outfits/:id geen PUT', async () => {
    antwoordMet({ message: 'Bijgewerkt' });

    await updateOutfit('o1', { description: 'Alleen bij galaconcerten.' });

    // PUT op dit pad bestaat niet; alleen PUT /outfits/reorder. Een PUT hier
    // zou dus bij niets uitkomen.
    expect(laatsteVerzoek().methode).toBe('patch');
    expect(laatsteVerzoek().pad).toBe('/outfits/o1');
  });

  it('verwijdert een tenue', async () => {
    antwoordMet({ message: 'Verwijderd' });

    await deleteOutfit('o1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/outfits/o1');
  });
});

describe('koppelen aan concerten', () => {
  it('koppelt via beide ids in het pad en zonder body', async () => {
    antwoordMet({ message: 'Gekoppeld' });

    await linkOutfitToConcert('o1', 'c4');

    // De server haalt beide ids uit het pad; een body met { concertId } zou
    // genegeerd worden en de koppeling zou op het verkeerde concert landen.
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/outfits/o1/concerts/c4');
    expect(laatsteVerzoek().body).toBeUndefined();
  });

  it('ontkoppelt op hetzelfde pad met DELETE', async () => {
    antwoordMet({ message: 'Ontkoppeld' });

    await unlinkOutfitFromConcert('o1', 'c4');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/outfits/o1/concerts/c4');
  });
});

describe('herordenen', () => {
  it('gaat naar PUT /outfits/reorder en niet naar /outfits/:id', async () => {
    antwoordMet({ message: 'Volgorde bijgewerkt' });

    await reorderOutfits(['o3', 'o1', 'o2']);

    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/outfits/reorder');
  });

  it('stuurt de ids in de gekozen volgorde onder de sleutel outfitIds', async () => {
    // De server leest data.outfitIds en gebruikt de index in die lijst als
    // sort_order. Een andere sleutelnaam laat zod een 400 geven; een lijst in
    // de verkeerde volgorde geeft geen enkele fout, alleen een verkeerd
    // gesorteerd scherm.
    antwoordMet({ message: 'Volgorde bijgewerkt' });

    await reorderOutfits(['o3', 'o1', 'o2']);

    expect(laatsteVerzoek().body).toEqual({ outfitIds: ['o3', 'o1', 'o2'] });
  });

  it('laat een 400 door als een van de tenues niet van deze vereniging is', async () => {
    antwoordMetFout(400, { error: 'Some outfits not found or do not belong to this association' });

    await expect(reorderOutfits(['o1', 'vreemd'])).rejects.toMatchObject({ response: { status: 400 } });
  });
});

describe('de paden komen overeen met wat de server aanbiedt', () => {
  const routes = serverroutes('outfits.ts');

  const aanroepen: [string, () => Promise<unknown>][] = [
    ['getOutfits', () => getOutfits()],
    ['getOutfit', () => getOutfit('o1')],
    ['createOutfit', () => createOutfit({ name: 'X' })],
    ['updateOutfit', () => updateOutfit('o1', {})],
    ['deleteOutfit', () => deleteOutfit('o1')],
    ['linkOutfitToConcert', () => linkOutfitToConcert('o1', 'c1')],
    ['unlinkOutfitFromConcert', () => unlinkOutfitFromConcert('o1', 'c1')],
    ['reorderOutfits', () => reorderOutfits(['o1'])],
  ];

  it.each(aanroepen)('%s raakt een bestaande route in backend/src/routes/outfits.ts', async (_naam, aanroep) => {
    antwoordMet({});
    await aanroep().catch(() => undefined);
    const { methode, pad } = laatsteVerzoek();

    expect(serverBiedtAan(routes, '/outfits', methode, pad)).toBe(true);
  });
});
