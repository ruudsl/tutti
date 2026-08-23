/**
 * Tests voor de uitvoeringsgeschiedenis.
 *
 * Dit zijn zeven leesfuncties boven op één tabel: welk stuk is wanneer op welk
 * concert gespeeld. De programmacommissie gebruikt ze om te zien wat er te
 * vaak of juist nooit langsgekomen is, dus een verkeerd antwoord is hier niet
 * "leeg scherm" maar "verkeerde beslissing".
 *
 * Wat er echt mis kan gaan:
 *
 * De naam van de zoekterm. De server leest `q`. Zou de frontend `query`,
 * `search` of `term` sturen, dan komt er geen fout maar een lege lijst - de
 * server ziet dan een zoekterm van nul tekens en antwoordt bewust met [].
 * Zoeken lijkt dan te werken en vindt nooit iets.
 *
 * De limiet. `most-played` en `by-composer` nemen `limit`; de server begrenst
 * die zelf op honderd. Valt de parameter weg, dan komen er stilzwijgend twintig
 * regels terug in plaats van de vijftig die het scherm vraagt - een lijst die
 * er compleet uitziet en het niet is.
 *
 * De vorm van het antwoord. De kolomnamen in de database zijn
 * `music_title_id`, `last_played`, `times_played`; de server zet ze om naar
 * kamelenkast. Deze tests leggen vast dat de api-laag die kamelenkast
 * ongewijzigd doorgeeft en er niet nogmaals aan sleutelt.
 *
 * De paden zijn vergeleken met backend/src/routes/performances.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startNepserver, stopNepserver, antwoordMet, antwoordMetFout, laatsteVerzoek } from './nepserver';
import { serverroutes, serverBiedtAan } from './serverroutes';
import {
  getPerformanceHistory,
  getLastPlayedPieces,
  getNeverPlayedPieces,
  getMostPlayedPieces,
  getPerformancesByYear,
  getPerformancesByComposer,
  searchPerformances,
} from '../performances';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

describe('geschiedenis van één stuk', () => {
  it('zoekt op titel-id als dat bekend is', async () => {
    antwoordMet([]);

    await getPerformanceHistory({ titleId: 'mt-7' });

    expect(laatsteVerzoek().pad).toBe('/performances/history');
    expect(laatsteVerzoek().query.get('titleId')).toBe('mt-7');
    expect(laatsteVerzoek().query.has('title')).toBe(false);
  });

  it('zoekt op losse titel als het stuk niet in de bibliotheek staat', async () => {
    antwoordMet([]);

    await getPerformanceHistory({ title: 'Ouverture 1812' });

    // De server doet hierop een LIKE. Een titel met een spatie moet dus heel
    // aankomen en niet op de spatie afgekapt worden.
    expect(laatsteVerzoek().query.get('title')).toBe('Ouverture 1812');
  });

  it('laat de 400 door die de server geeft als geen van beide is meegegeven', async () => {
    // Het type staat `getPerformanceHistory({})` toe - beide velden zijn
    // optioneel - maar de server eist er één. Dat is een echte val, en de
    // api-laag mag hem niet verbergen achter een lege lijst.
    antwoordMetFout(400, { error: 'Either titleId or title query parameter is required' });

    await expect(getPerformanceHistory({})).rejects.toMatchObject({ response: { status: 400 } });
  });

  it('geeft de concertgegevens per uitvoering door', async () => {
    antwoordMet([
      {
        id: 'cp1',
        title: 'Ouverture 1812',
        composer: 'Tsjaikovski',
        concertId: 'c3',
        concertName: 'Nieuwjaarsconcert',
        concertDate: '2026-01-05',
        concertLocation: 'De Harmonie',
      },
    ]);

    const geschiedenis = await getPerformanceHistory({ titleId: 'mt-7' });

    // Zonder de omzetting aan de serverkant zou hier concert_name staan en
    // toonde het scherm een lege kolom bij een rij die er wel is.
    expect(geschiedenis[0].concertName).toBe('Nieuwjaarsconcert');
    expect(geschiedenis[0].concertDate).toBe('2026-01-05');
  });
});

describe('lijsten zonder parameters', () => {
  it('haalt op wanneer elk stuk voor het laatst gespeeld is', async () => {
    antwoordMet([
      { title: 'Bolero', composer: 'Ravel', musicTitleId: 'mt-2', lastPlayed: '2025-06-14', timesPlayed: 3 },
    ]);

    const stukken = await getLastPlayedPieces();

    expect(laatsteVerzoek().pad).toBe('/performances/last-played');
    expect(laatsteVerzoek().queryreeks).toBe('');
    expect(stukken[0].lastPlayed).toBe('2025-06-14');
    expect(stukken[0].timesPlayed).toBe(3);
  });

  it('haalt de stukken op die nog nooit gespeeld zijn', async () => {
    antwoordMet([{ id: 'mt-9', title: 'Symfonie nr. 5', composer: 'Beethoven' }]);

    const stukken = await getNeverPlayedPieces();

    expect(laatsteVerzoek().pad).toBe('/performances/never-played');
    // Deze lijst komt uit de bibliotheek, niet uit de concertprogramma's;
    // daarom heeft hij wél een id en de vorige lijst niet.
    expect(stukken[0].id).toBe('mt-9');
  });

  it('haalt de verdeling per jaar op', async () => {
    antwoordMet([{ year: '2025', concertCount: 6, pieceCount: 41, uniquePieces: 33 }]);

    const jaren = await getPerformancesByYear();

    expect(laatsteVerzoek().pad).toBe('/performances/by-year');
    // `year` komt als tekst binnen (strftime aan de serverkant), niet als
    // getal. Wie er in het scherm mee rekent moet dat weten.
    expect(jaren[0].year).toBe('2025');
  });
});

describe('lijsten met een limiet', () => {
  it('stuurt de gevraagde limiet mee onder de naam limit', async () => {
    antwoordMet([]);

    await getMostPlayedPieces(50);

    expect(laatsteVerzoek().pad).toBe('/performances/most-played');
    expect(laatsteVerzoek().query.get('limit')).toBe('50');
  });

  it('laat limit helemaal weg als er geen limiet gevraagd is', async () => {
    // Een meegestuurde lege `limit=` zou door parseInt NaN worden; de server
    // valt dan op zijn eigen twintig terug. Hetzelfde eindresultaat, maar het
    // verschil tussen "niets gevraagd" en "iets onleesbaars gevraagd" hoort
    // zichtbaar te blijven.
    antwoordMet([]);

    await getMostPlayedPieces();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('geeft de teller en de twee datums per stuk door', async () => {
    antwoordMet([
      {
        title: 'Bolero',
        composer: 'Ravel',
        musicTitleId: 'mt-2',
        timesPlayed: 9,
        lastPlayed: '2026-03-01',
        firstPlayed: '2014-05-20',
      },
    ]);

    const stukken = await getMostPlayedPieces(10);

    expect(stukken[0].timesPlayed).toBe(9);
    expect(stukken[0].firstPlayed).toBe('2014-05-20');
  });

  it('haalt de componistenlijst op met dezelfde limietnaam', async () => {
    antwoordMet([{ composer: 'Ravel', timesPlayed: 12, uniquePieces: 4, lastPlayed: '2026-03-01' }]);

    const componisten = await getPerformancesByComposer(50);

    expect(laatsteVerzoek().pad).toBe('/performances/by-composer');
    expect(laatsteVerzoek().query.get('limit')).toBe('50');
    expect(componisten[0].uniquePieces).toBe(4);
  });
});

describe('zoeken', () => {
  it('stuurt de zoekterm onder de naam q, want daar kijkt de server naar', async () => {
    antwoordMet([]);

    await searchPerformances('Ravel');

    expect(laatsteVerzoek().pad).toBe('/performances/search');
    // Elke andere naam levert een lege lijst op zonder foutmelding: de server
    // ziet dan een zoekterm van nul tekens en antwoordt bewust met [].
    expect(laatsteVerzoek().query.get('q')).toBe('Ravel');
    expect(laatsteVerzoek().queryreeks).toBe('q=Ravel');
  });

  it('codeert een zoekterm met spaties en leestekens heel', async () => {
    antwoordMet([]);

    await searchPerformances('Also sprach Zarathustra, op. 30');

    expect(laatsteVerzoek().query.get('q')).toBe('Also sprach Zarathustra, op. 30');
  });

  it('stuurt ook een te korte zoekterm mee, en krijgt de lege lijst van de server', async () => {
    // De server kapt zelf af onder twee tekens. Zou de api-laag daar zelf op
    // vooruitlopen, dan zaten dezelfde regels op twee plekken en konden ze uit
    // elkaar lopen.
    antwoordMet([]);

    const resultaat = await searchPerformances('R');

    expect(laatsteVerzoek().query.get('q')).toBe('R');
    expect(resultaat).toEqual([]);
  });
});

describe('de paden komen overeen met wat de server aanbiedt', () => {
  const routes = serverroutes('performances.ts');

  const aanroepen: [string, () => Promise<unknown>][] = [
    ['getPerformanceHistory', () => getPerformanceHistory({ titleId: 'mt-1' })],
    ['getLastPlayedPieces', () => getLastPlayedPieces()],
    ['getNeverPlayedPieces', () => getNeverPlayedPieces()],
    ['getMostPlayedPieces', () => getMostPlayedPieces(10)],
    ['getPerformancesByYear', () => getPerformancesByYear()],
    ['getPerformancesByComposer', () => getPerformancesByComposer(10)],
    ['searchPerformances', () => searchPerformances('Ravel')],
  ];

  it.each(aanroepen)('%s raakt een bestaande route in backend/src/routes/performances.ts', async (_naam, aanroep) => {
    antwoordMet([]);
    await aanroep().catch(() => undefined);
    const { methode, pad } = laatsteVerzoek();

    expect(serverBiedtAan(routes, '/performances', methode, pad)).toBe(true);
  });
});
