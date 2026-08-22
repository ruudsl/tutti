/**
 * Tests voor de instellingen van de query-cache.
 *
 * Dit bestand bevat geen logica die je stap voor stap kunt volgen, maar wel de
 * getallen en de regels die bepalen hoe de app zich gedraagt als het netwerk
 * tegenzit:
 *
 *   - hoe vaak er opnieuw geprobeerd wordt. Een verlopen sessie (401) of een
 *     verwijderd stuk (404) verandert niet door het nog eens te vragen; elke
 *     herhaling houdt de gebruiker alleen langer bij een draaiend rondje vast
 *     voordat hij de foutmelding ziet.
 *   - hoe lang gegevens vers heten en hoe lang ze bewaard blijven. Vervalt de
 *     bewaartermijn eerder dan de versheid, dan haalt de app alles opnieuw op
 *     zodra je een scherm terugkomt.
 *   - wat er in localStorage terechtkomt. Daar staat de grens tussen "handig
 *     offline" en "gegevens van het vorige lid staan nog op de gedeelde tablet".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { Query } from '@tanstack/react-query';
import {
  staleTimes,
  cacheTimes,
  queryClient,
  queryPersister,
  persistOptions,
  clearPersistedCache,
  queryKeys,
  moetOpnieuwProberen,
} from '../queryClient';

const MINUUT = 1000 * 60;
const PERSIST_SLEUTEL = 'harmonie-query-cache';

/** Een fout zoals axios die maakt bij een antwoord van de server. */
function serverfout(status: number): unknown {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: {} },
  });
}

/** Een fout zonder antwoord: kabel eruit, wifi weg, server onbereikbaar. */
function netwerkfout(): unknown {
  return Object.assign(new Error('Network Error'), { isAxiosError: true, response: undefined });
}

/** Een nagebootste query, genoeg voor `shouldDehydrateQuery`. */
function nepQuery(queryKey: unknown[], status: 'success' | 'error' | 'pending' = 'success'): Query {
  return { queryKey, state: { status } } as unknown as Query;
}

beforeEach(() => {
  localStorage.clear();
});

// =============================================================================
// Opnieuw proberen
// =============================================================================

describe('opnieuw proberen na een mislukte aanvraag', () => {
  it('probeert een serverfout één keer opnieuw', () => {
    // Een 500 of een 503 is vaak een hik van één seconde. Eén herhaling vangt
    // die op zonder de gebruiker iets te laten merken.
    expect(moetOpnieuwProberen(0, serverfout(500))).toBe(true);
    expect(moetOpnieuwProberen(0, serverfout(502))).toBe(true);
    expect(moetOpnieuwProberen(0, serverfout(503))).toBe(true);
  });

  it('probeert een netwerkfout één keer opnieuw', () => {
    expect(moetOpnieuwProberen(0, netwerkfout())).toBe(true);
  });

  it('houdt het na één herhaling voor gezien', () => {
    // Anders blijft een scherm bij een kapotte server minutenlang laden zonder
    // ooit iets te zeggen.
    expect(moetOpnieuwProberen(1, serverfout(500))).toBe(false);
    expect(moetOpnieuwProberen(1, netwerkfout())).toBe(false);
    expect(moetOpnieuwProberen(5, serverfout(500))).toBe(false);
  });

  it('probeert een verlopen sessie niet opnieuw', () => {
    // Een 401 wordt geen 200 door hem te herhalen. De herhaling stelde alleen
    // het inlogscherm uit, terwijl de gebruiker naar een draaiend rondje keek.
    expect(moetOpnieuwProberen(0, serverfout(401))).toBe(false);
  });

  it('probeert geen toegang en niet gevonden niet opnieuw', () => {
    expect(moetOpnieuwProberen(0, serverfout(403))).toBe(false);
    expect(moetOpnieuwProberen(0, serverfout(404))).toBe(false);
  });

  it('probeert een afgekeurde invoer niet opnieuw', () => {
    expect(moetOpnieuwProberen(0, serverfout(400))).toBe(false);
    expect(moetOpnieuwProberen(0, serverfout(409))).toBe(false);
    expect(moetOpnieuwProberen(0, serverfout(422))).toBe(false);
  });

  it('probeert een tijdslimiet en een snelheidsbegrenzing wél opnieuw', () => {
    // Dit zijn de twee 4xx-en die na een korte pauze wél kunnen slagen.
    expect(moetOpnieuwProberen(0, serverfout(408))).toBe(true);
    expect(moetOpnieuwProberen(0, serverfout(429))).toBe(true);
  });

  it('struikelt niet over een fout zonder antwoordveld', () => {
    expect(moetOpnieuwProberen(0, new Error('iets anders'))).toBe(true);
    expect(moetOpnieuwProberen(0, null)).toBe(true);
    expect(moetOpnieuwProberen(0, undefined)).toBe(true);
    expect(moetOpnieuwProberen(0, 'kapot')).toBe(true);
    expect(moetOpnieuwProberen(0, { response: { status: 'geen getal' } })).toBe(true);
  });

  it('hangt onder de standaardinstellingen van de client', () => {
    const retry = queryClient.getDefaultOptions().queries?.retry;
    expect(typeof retry).toBe('function');
    expect((retry as (n: number, e: unknown) => boolean)(0, serverfout(404))).toBe(false);
    expect((retry as (n: number, e: unknown) => boolean)(0, serverfout(500))).toBe(true);
  });

  it('herhaalt een mislukte wijziging nooit', () => {
    // Een tweede poging op een POST kan een tweede aanmelding, een tweede
    // bestelling of een tweede uitleen opleveren.
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(0);
  });
});

// =============================================================================
// Versheid en bewaartermijn
// =============================================================================

describe('standaardinstellingen', () => {
  it('houdt gegevens vijf minuten vers', () => {
    expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(5 * MINUUT);
  });

  it('bewaart gegevens een etmaal, ook als niets ze gebruikt', () => {
    // Lang bewaren is hier bewust: het is wat de app offline nog iets laat
    // tonen in plaats van een leeg scherm.
    expect(queryClient.getDefaultOptions().queries?.gcTime).toBe(24 * 60 * MINUUT);
  });

  it('haalt niets opnieuw op als het venster de aandacht terugkrijgt', () => {
    // Op een tablet in de repetitieruimte wisselt de aandacht voortdurend.
    // Elke wissel een ronde aanvragen maakt de app traag en het dataverbruik
    // groot.
    expect(queryClient.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });
});

describe('staleTimes', () => {
  it('houdt verwijzingsgegevens het langst vers', () => {
    expect(staleTimes.instruments).toBe(30 * MINUUT);
    expect(staleTimes.genres).toBe(30 * MINUUT);
    expect(staleTimes.orchestras).toBe(30 * MINUUT);
  });

  it('houdt gegevens die per minuut wisselen het kortst vers', () => {
    expect(staleTimes.ticketStats).toBe(30 * 1000);
    expect(staleTimes.attendees).toBe(30 * 1000);
    expect(staleTimes.tickets).toBe(1 * MINUUT);
  });

  it('houdt de volgorde aan: verwijzing langer vers dan inhoud, inhoud langer dan kaartverkoop', () => {
    // Deze volgorde is de hele bedoeling van de tabel. Raakt hij omgedraaid,
    // dan bevraagt de app instrumentenlijsten vaker dan de bezetting van een
    // zaal die op dat moment volloopt.
    expect(staleTimes.instruments).toBeGreaterThan(staleTimes.musicPieces);
    expect(staleTimes.musicPieces).toBeGreaterThan(staleTimes.tickets);
    expect(staleTimes.tickets).toBeGreaterThan(staleTimes.ticketStats);
  });

  it('kent geen enkele termijn van nul of minder', () => {
    for (const [naam, waarde] of Object.entries(staleTimes)) {
      expect(waarde, naam).toBeGreaterThan(0);
    }
  });
});

describe('cacheTimes', () => {
  it('bewaart alles langer dan het vers heet', () => {
    // Anders wordt iets weggegooid terwijl het nog als vers geldt: de app
    // denkt dat ze niets hoeft op te halen, vindt niets in de cache, en haalt
    // toch alles opnieuw op zodra je een scherm terugkomt.
    for (const naam of Object.keys(cacheTimes) as (keyof typeof cacheTimes)[]) {
      const vers = staleTimes[naam as keyof typeof staleTimes];
      expect(cacheTimes[naam], naam).toBeGreaterThanOrEqual(vers);
    }
  });

  it('bewaart verwijzingsgegevens een uur', () => {
    expect(cacheTimes.instruments).toBe(60 * MINUUT);
    expect(cacheTimes.users).toBe(60 * MINUUT);
  });
});

// =============================================================================
// Wat er in localStorage belandt
// =============================================================================

describe('persistOptions', () => {
  const magBewaard = (query: Query) => persistOptions.dehydrateOptions.shouldDehydrateQuery(query);

  it('bewaart verwijzingsgegevens', () => {
    expect(magBewaard(nepQuery(['instruments']))).toBe(true);
    expect(magBewaard(nepQuery(['genres']))).toBe(true);
    expect(magBewaard(nepQuery(['orchestras']))).toBe(true);
    expect(magBewaard(nepQuery(['vocabularies', 'instruments', 'all']))).toBe(true);
    expect(magBewaard(nepQuery(['holidays', '2026-01-01', '2026-12-31']))).toBe(true);
    expect(magBewaard(nepQuery(['packingTemplates']))).toBe(true);
  });

  it('bewaart geen persoonlijke gegevens', () => {
    // Dit is de grens die voorkomt dat het vorige lid op een gedeelde tablet
    // nog in localStorage staat.
    expect(magBewaard(nepQuery(['users']))).toBe(false);
    expect(magBewaard(nepQuery(['users', 'lid-1']))).toBe(false);
    expect(magBewaard(nepQuery(['tickets', 'my']))).toBe(false);
    expect(magBewaard(nepQuery(['favorites']))).toBe(false);
    expect(magBewaard(nepQuery(['association']))).toBe(false);
    expect(magBewaard(nepQuery(['musicPieces', {}]))).toBe(false);
  });

  it('bewaart niets van een query die is mislukt of nog loopt', () => {
    // Een mislukte query heeft geen gegevens; bewaren zou een lege lijst als
    // "de instrumenten" op schijf zetten.
    expect(magBewaard(nepQuery(['instruments'], 'error'))).toBe(false);
    expect(magBewaard(nepQuery(['instruments'], 'pending'))).toBe(false);
  });

  it('bewaart niets van een sleutel die niet met tekst begint', () => {
    expect(magBewaard(nepQuery([]))).toBe(false);
    expect(magBewaard(nepQuery([42]))).toBe(false);
    expect(magBewaard(nepQuery([{ soort: 'instruments' }]))).toBe(false);
  });

  it('kijkt alleen naar het eerste deel van de sleutel', () => {
    // VASTGELEGD GEDRAG: de vergelijking gaat over queryKey[0]. Vandaar dat
    // `queryKeys.concertTypes` (['concerts', 'types']) en
    // `queryKeys.equipmentTypes` (['equipment', 'types']) níét bewaard worden,
    // terwijl de losse sleutels 'concertTypes' en 'equipment-types' die
    // elders in de app worden gebruikt dat wél zijn. Dezelfde gegevens staan
    // dus onder twee namen, waarvan er één offline beschikbaar is en één niet.
    expect(magBewaard(nepQuery(['concertTypes']))).toBe(true);
    expect(magBewaard(nepQuery([...queryKeys.concertTypes]))).toBe(false);
    expect(magBewaard(nepQuery(['equipment-types']))).toBe(true);
    expect(magBewaard(nepQuery([...queryKeys.equipmentTypes]))).toBe(false);
  });

  it('gooit de bewaarde cache na een etmaal weg', () => {
    expect(persistOptions.maxAge).toBe(24 * 60 * MINUUT);
  });

  it('draagt een versiestempel, zodat een oude cache niet wordt teruggelezen', () => {
    // Verandert de vorm van wat er bewaard wordt, dan moet dit omhoog. Anders
    // leest een bijgewerkte app de cache van de vorige versie terug.
    expect(persistOptions.buster).toBeTruthy();
    expect(typeof persistOptions.buster).toBe('string');
  });
});

describe('queryPersister', () => {
  it('leest een geldige cache gewoon terug', async () => {
    const inhoud = { buster: 'v5', timestamp: Date.now(), clientState: { queries: [], mutations: [] } };
    localStorage.setItem(PERSIST_SLEUTEL, JSON.stringify(inhoud));

    const teruggelezen = await Promise.resolve(queryPersister?.restoreClient());
    expect(teruggelezen).toMatchObject({ buster: 'v5' });
  });

  it('valt niet om over een half geschreven cache', async () => {
    // Een tab die tijdens het schrijven wordt afgekapt laat halve JSON achter.
    // Klapt het teruglezen daarop, dan start de app niet meer op en helpt
    // alleen het wissen van de sitegegevens.
    localStorage.setItem(PERSIST_SLEUTEL, '{"clientState":{"quer');

    const teruggelezen = await Promise.resolve(queryPersister?.restoreClient());
    expect(teruggelezen).toBeUndefined();
  });

  it('ruimt de kapotte cache meteen op', async () => {
    localStorage.setItem(PERSIST_SLEUTEL, 'geen json');

    await Promise.resolve(queryPersister?.restoreClient());

    expect(localStorage.getItem(PERSIST_SLEUTEL)).toBeNull();
  });
});

describe('clearPersistedCache', () => {
  it('haalt de bewaarde cache uit localStorage', () => {
    localStorage.setItem(PERSIST_SLEUTEL, '{"clientState":{}}');

    clearPersistedCache();

    expect(localStorage.getItem(PERSIST_SLEUTEL)).toBeNull();
  });

  it('leegt ook de cache in het geheugen', () => {
    queryClient.setQueryData(['users'], [{ id: 'lid-1' }]);

    clearPersistedCache();

    expect(queryClient.getQueryData(['users'])).toBeUndefined();
  });

  it('logt uit, ook als localStorage weigert', () => {
    // In een privévenster kan removeItem gooien. Uitloggen mag daar niet op
    // blijven hangen; de cache in het geheugen moet hoe dan ook leeg.
    const weigeren = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    queryClient.setQueryData(['users'], [{ id: 'lid-1' }]);

    expect(() => clearPersistedCache()).not.toThrow();
    expect(queryClient.getQueryData(['users'])).toBeUndefined();

    weigeren.mockRestore();
  });
});

describe('de vlag om de cache te wissen bij het opstarten', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('wist de bewaarde cache als de vlag staat', async () => {
    // Gezet bij het wisselen van vereniging: de volgende start mag niets van
    // de vorige vereniging meer laten zien.
    localStorage.setItem('harmonie-clear-cache', '1');
    localStorage.setItem(PERSIST_SLEUTEL, '{"clientState":{}}');

    vi.resetModules();
    await import('../queryClient');

    expect(localStorage.getItem(PERSIST_SLEUTEL)).toBeNull();
    expect(localStorage.getItem('harmonie-clear-cache')).toBeNull();
  });

  it('laat de cache staan als de vlag niet staat', async () => {
    localStorage.setItem(PERSIST_SLEUTEL, '{"clientState":{}}');

    vi.resetModules();
    await import('../queryClient');

    expect(localStorage.getItem(PERSIST_SLEUTEL)).toBe('{"clientState":{}}');
  });
});

// =============================================================================
// Sleutels
// =============================================================================

describe('queryKeys', () => {
  it('laat een detailsleutel onder zijn lijstsleutel vallen', () => {
    // Daardoor maakt `invalidateQueries(['users'])` ook de losse gebruikers
    // ongeldig. Zonder die nesting blijft een zojuist gewijzigd lid met zijn
    // oude gegevens in beeld staan.
    expect(queryKeys.user('lid-1')[0]).toBe(queryKeys.users[0]);
    expect(queryKeys.instrument('i-1')[0]).toBe(queryKeys.instruments[0]);
    expect(queryKeys.orchestra('o-1')[0]).toBe(queryKeys.orchestras[0]);
    expect(queryKeys.genre('g-1')[0]).toBe(queryKeys.genres[0]);
  });

  it('geeft dezelfde invoer altijd dezelfde sleutel', () => {
    // React Query vergelijkt sleutels op inhoud. Een sleutel die per aanroep
    // verschilt, levert bij elke render een nieuwe query op.
    expect(queryKeys.musicPieces({ zoek: 'mars' })).toEqual(queryKeys.musicPieces({ zoek: 'mars' }));
    expect(queryKeys.concert('c-1')).toEqual(queryKeys.concert('c-1'));
  });

  it('scheidt sleutels met en zonder filter', () => {
    expect(queryKeys.musicPieces()).toEqual(['musicPieces', undefined]);
    expect(queryKeys.musicPieces({ zoek: 'mars' })).toEqual(['musicPieces', { zoek: 'mars' }]);
  });

  it('scheidt de detailsleutel van een lijst met dezelfde naam', () => {
    // ['musicLists', 'detail', id] botst niet met ['musicLists', orchestraId].
    expect(queryKeys.musicList('m-1')).toEqual(['musicLists', 'detail', 'm-1']);
    expect(queryKeys.musicLists('m-1')).toEqual(['musicLists', 'm-1']);
    expect(queryKeys.musicList('m-1')).not.toEqual(queryKeys.musicLists('m-1'));
  });

  it('zet alles rond kaartverkoop onder één noemer', () => {
    for (const sleutel of [
      queryKeys.myTickets,
      queryKeys.concertTickets('c-1'),
      queryKeys.ticketStats('c-1'),
      queryKeys.attendees('c-1'),
      queryKeys.transferableTickets,
      queryKeys.pendingTransfers,
    ]) {
      expect(sleutel[0]).toBe('tickets');
    }
  });

  it('houdt de sleutels van een genest onderdeel bij elkaar', () => {
    expect(queryKeys.uniformItems()[0]).toBe('uniforms');
    expect(queryKeys.uniformSets[0]).toBe('uniforms');
    expect(queryKeys.userUniforms('lid-1')).toEqual(['uniforms', 'user', 'lid-1']);
  });

  it('neemt alle onderdelen van een samengestelde sleutel mee', () => {
    // Laat je er één weg, dan delen twee verschillende zoekopdrachten één
    // cachevakje en ziet de gebruiker het antwoord op de vorige vraag.
    expect(queryKeys.titleMeta('Mars', 'Van der Roost')).not.toEqual(queryKeys.titleMeta('Mars', 'Sparke'));
    expect(queryKeys.annotations('stuk-1', 2)).not.toEqual(queryKeys.annotations('stuk-1', 3));
    expect(queryKeys.recentViews('musicTitle', 10)).not.toEqual(queryKeys.recentViews('musicTitle', 20));
  });
});

describe('een eigen client met dezelfde instellingen', () => {
  it('draagt de standaardinstellingen over aan een nieuwe client', () => {
    // Vangnet voor tests en verhalenboeken die hun eigen client maken: die
    // moeten hetzelfde gedrag krijgen als de app.
    const eigen = new QueryClient({ defaultOptions: queryClient.getDefaultOptions() });

    expect(eigen.getDefaultOptions().queries?.staleTime).toBe(5 * MINUUT);
    expect(typeof eigen.getDefaultOptions().queries?.retry).toBe('function');
  });
});
