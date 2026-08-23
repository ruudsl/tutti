/**
 * Tests voor de invallers en oud-leden (externe muzikanten).
 *
 * Deze lijst wordt gebruikt om een gat in een sectie te vullen: wie speelt er
 * hoorn, hoe goed, en heeft die de vorige keer meegespeeld. De api-laag stelt
 * hier zelf queryreeksen samen met URLSearchParams, en dat is precies waar het
 * misgaat als er niet op gelet wordt.
 *
 * Twee dingen die hier echt fout kunnen gaan:
 *
 * De naam van de instrumentfilter verschilt per route, en dat is geen
 * slordigheid maar de werkelijkheid: de lijstroute leest `instrumentId`, de
 * zoekroute leest `instrument`. Wie ze verwisselt krijgt geen foutmelding maar
 * een ander antwoord - bij de lijst álle muzikanten in plaats van de
 * hoornisten, bij het zoeken een harde 400 omdat de verplichte parameter
 * ontbreekt. Deze tests leggen beide namen apart vast.
 *
 * De actief-filter is een driestand, geen tweestand. `isActive` mag `true`,
 * `false` of helemaal niet meegaan; de server vergelijkt met de tekst 'true'
 * en zet dat om naar 1 of 0. Zou `false` hier wegvallen (het klassieke
 * `if (filters.isActive)`), dan kon je nooit meer alleen de inactieve
 * muzikanten opvragen - de lijst zou er gewoon ongefilterd uitzien.
 *
 * De paden zijn vergeleken met backend/src/routes/external-musicians.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startNepserver, stopNepserver, antwoordMet, antwoordMetFout, laatsteVerzoek } from './nepserver';
import { serverroutes, serverBiedtAan } from './serverroutes';
import {
  getExternalMusicians,
  getExternalMusician,
  createExternalMusician,
  updateExternalMusician,
  deleteExternalMusician,
  searchExternalMusiciansByInstrument,
  addInstrumentToMusician,
  removeInstrumentFromMusician,
} from '../external-musicians';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

describe('lijst met filters', () => {
  it('stuurt het instrument mee onder instrumentId, zoals de lijstroute het leest', async () => {
    antwoordMet([]);

    await getExternalMusicians({ instrumentId: 'i-hoorn', type: 'substitute' });

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().query.get('instrumentId')).toBe('i-hoorn');
    expect(laatsteVerzoek().query.get('type')).toBe('substitute');
    // De zoekroute leest `instrument`; hier zou die naam niets doen en kwam de
    // hele lijst terug alsof er niet gefilterd was.
    expect(laatsteVerzoek().query.has('instrument')).toBe(false);
  });

  it('stuurt isActive=false ook echt mee, want dat is een geldige keuze', async () => {
    antwoordMet([]);

    await getExternalMusicians({ isActive: false });

    // Dit is het verschil tussen "toon de gestopte muzikanten" en "toon
    // iedereen". Een `if (filters.isActive)` zou false laten wegvallen en het
    // tweede doen terwijl het scherm het eerste belooft.
    expect(laatsteVerzoek().query.get('isActive')).toBe('false');
  });

  it('laat isActive weg als er geen keuze gemaakt is', async () => {
    antwoordMet([]);

    await getExternalMusicians({ type: 'alumni' });

    expect(laatsteVerzoek().query.has('isActive')).toBe(false);
  });

  it('codeert een zoekterm met een apostrof of accent heel', async () => {
    antwoordMet([]);

    await getExternalMusicians({ search: "d'Hondt & Sá" });

    // De server plakt hier een LIKE-patroon omheen; als de ampersand de
    // queryreeks in tweeën knipt, zoekt hij op een halve naam.
    expect(laatsteVerzoek().query.get('search')).toBe("d'Hondt & Sá");
  });

  it('geeft de samengevoegde instrumentnamen door zoals de server ze levert', async () => {
    antwoordMet([
      {
        id: 'em1',
        firstName: 'Carla',
        lastName: 'Vermeer',
        email: null,
        phone: null,
        musicianType: 'substitute',
        notes: null,
        isActive: true,
        rating: 4,
        lastPlayedDate: '2026-05-10',
        totalPerformances: 6,
        instrumentNames: 'Hoorn, Trompet',
        createdBy: null,
        createdByName: null,
        createdAt: 'x',
        updatedAt: 'y',
      },
    ]);

    const muzikanten = await getExternalMusicians();

    // `instrumentNames` is één tekst met komma's (GROUP_CONCAT), geen lijst.
    // Wie er `.map` op doet, krijgt losse letters te zien.
    expect(muzikanten[0].instrumentNames).toBe('Hoorn, Trompet');
    expect(muzikanten[0].isActive).toBe(true);
  });
});

describe('zoeken per instrument', () => {
  it('stuurt het instrument mee onder instrument, zoals de zoekroute het leest', async () => {
    antwoordMet([]);

    await searchExternalMusiciansByInstrument('i-hoorn');

    expect(laatsteVerzoek().pad.split('?')[0]).toBe('/external-musicians/search');
    // De server werpt een 400 als `instrument` ontbreekt. Zou hier
    // `instrumentId` staan, dan faalde elke zoekopdracht - ook een geldige.
    expect(laatsteVerzoek().query.get('instrument')).toBe('i-hoorn');
  });

  it('stuurt niveau en activiteit alleen mee als erom gevraagd is', async () => {
    antwoordMet([]);
    await searchExternalMusiciansByInstrument('i-hoorn', { skillLevel: 'professional', activeOnly: true });
    expect(laatsteVerzoek().query.get('skillLevel')).toBe('professional');
    // De server doet `activeOnly === 'true'`; alleen die letterlijke tekst
    // telt.
    expect(laatsteVerzoek().query.get('activeOnly')).toBe('true');

    antwoordMet([]);
    await searchExternalMusiciansByInstrument('i-hoorn', { activeOnly: false });
    expect(laatsteVerzoek().query.has('activeOnly')).toBe(false);
  });

  it('geeft per treffer ook het niveau op dat instrument terug', async () => {
    antwoordMet([
      {
        id: 'em1',
        firstName: 'Carla',
        lastName: 'Vermeer',
        skillLevel: 'professional',
        isPrimary: true,
        instrumentName: 'Hoorn',
        instrumentTuning: 'F',
      },
    ]);

    const treffers = await searchExternalMusiciansByInstrument('i-hoorn');

    // Dit zijn de velden die de zoekroute extra geeft en de lijstroute niet:
    // ze komen uit de koppeltabel, niet uit de muzikant zelf.
    expect(treffers[0].skillLevel).toBe('professional');
    expect(treffers[0].isPrimary).toBe(true);
    expect(treffers[0].instrumentTuning).toBe('F');
  });

  it('laat een 400 door als het instrument ontbreekt', async () => {
    antwoordMetFout(400, { error: 'Instrument parameter is verplicht' });

    await expect(searchExternalMusiciansByInstrument('')).rejects.toMatchObject({
      response: { status: 400 },
    });
  });
});

describe('één muzikant', () => {
  it('haalt het detail op met instrumenten en recente inzet', async () => {
    antwoordMet({
      id: 'em1',
      firstName: 'Carla',
      lastName: 'Vermeer',
      instruments: [
        { id: 'ki1', instrumentId: 'i-hoorn', instrumentName: 'Hoorn', skillLevel: 'professional', isPrimary: true },
      ],
      recentAssignments: [
        {
          id: 'a1',
          eventType: 'concert',
          eventDate: '2026-05-10',
          eventName: 'Voorjaarsconcert',
          instrumentName: 'Hoorn',
          status: 'confirmed',
          feeAmount: 12500,
        },
      ],
    });

    const muzikant = await getExternalMusician('em1');

    expect(laatsteVerzoek().pad).toBe('/external-musicians/em1');
    expect(muzikant.instruments[0].instrumentName).toBe('Hoorn');
    // De vergoeding staat in centen; het is een getal en geen tekst, anders
    // rekent het scherm er verkeerd mee.
    expect(muzikant.recentAssignments[0].feeAmount).toBe(12500);
  });

  it('maakt een muzikant aan en stuurt de instrumenten als lijst mee', async () => {
    antwoordMet({ id: 'em9', message: 'Muzikant toegevoegd' }, { status: 201 });

    await createExternalMusician({
      firstName: 'Carla',
      lastName: 'Vermeer',
      musicianType: 'substitute',
      instruments: [{ instrumentId: 'i-hoorn', skillLevel: 'professional', isPrimary: true }],
    });

    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/external-musicians');
    expect(laatsteVerzoek().body).toEqual({
      firstName: 'Carla',
      lastName: 'Vermeer',
      musicianType: 'substitute',
      instruments: [{ instrumentId: 'i-hoorn', skillLevel: 'professional', isPrimary: true }],
    });
  });

  it('wijzigt met PUT, want de server kent op dit pad geen PATCH', async () => {
    antwoordMet({ message: 'Bijgewerkt' });

    await updateExternalMusician('em1', { isActive: false });

    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/external-musicians/em1');
    expect(laatsteVerzoek().body).toEqual({ isActive: false });
  });

  it('stuurt een leeggemaakt e-mailadres als null mee, en laat het niet weg', async () => {
    // null betekent "wissen", een ontbrekend veld betekent "laat staan". Het
    // type staat null uitdrukkelijk toe; als het onderweg wegviel, bleef het
    // oude adres staan terwijl het formulier leeg was.
    antwoordMet({ message: 'Bijgewerkt' });

    await updateExternalMusician('em1', { email: null });

    expect(laatsteVerzoek().body).toEqual({ email: null });
  });

  it('verwijdert een muzikant', async () => {
    antwoordMet({ message: 'Verwijderd' });

    await deleteExternalMusician('em1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/external-musicians/em1');
  });
});

describe('instrumenten koppelen', () => {
  it('voegt een instrument toe met de gegevens in de body', async () => {
    antwoordMet({ id: 'ki9', message: 'Instrument toegevoegd' }, { status: 201 });

    await addInstrumentToMusician('em1', { instrumentId: 'i-trompet', skillLevel: 'advanced', isPrimary: false });

    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/external-musicians/em1/instruments');
    expect(laatsteVerzoek().body).toEqual({
      instrumentId: 'i-trompet',
      skillLevel: 'advanced',
      isPrimary: false,
    });
  });

  it('ontkoppelt op het instrument-id in het pad', async () => {
    antwoordMet({ message: 'Verwijderd' });

    await removeInstrumentFromMusician('em1', 'i-trompet');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/external-musicians/em1/instruments/i-trompet');
  });
});

describe('de paden komen overeen met wat de server aanbiedt', () => {
  const routes = serverroutes('external-musicians.ts');

  const aanroepen: [string, () => Promise<unknown>][] = [
    ['getExternalMusicians', () => getExternalMusicians()],
    ['getExternalMusician', () => getExternalMusician('em1')],
    ['createExternalMusician', () => createExternalMusician({ firstName: 'A', lastName: 'B', musicianType: 'guest' })],
    ['updateExternalMusician', () => updateExternalMusician('em1', {})],
    ['deleteExternalMusician', () => deleteExternalMusician('em1')],
    ['searchExternalMusiciansByInstrument', () => searchExternalMusiciansByInstrument('i-hoorn')],
    ['addInstrumentToMusician', () => addInstrumentToMusician('em1', { instrumentId: 'i-hoorn' })],
    ['removeInstrumentFromMusician', () => removeInstrumentFromMusician('em1', 'i-hoorn')],
  ];

  it.each(aanroepen)(
    '%s raakt een bestaande route in backend/src/routes/external-musicians.ts',
    async (_naam, aanroep) => {
      antwoordMet([]);
      await aanroep().catch(() => undefined);
      const { methode, pad } = laatsteVerzoek();

      expect(serverBiedtAan(routes, '/external-musicians', methode, pad)).toBe(true);
    },
  );

  it('let op de valstrik dat /search niet als /:id gelezen wordt', () => {
    // /search staat in de router boven /:id. Zou die volgorde omdraaien, dan
    // ging zoeken op zoek naar een muzikant met het id "search" en gaf het
    // altijd 404 - met een zoekbalk die er verder normaal uitziet.
    const opGet = routes.filter((r) => r.methode === 'get').map((r) => r.patroon);

    expect(opGet.indexOf('/search')).toBeLessThan(opGet.indexOf('/:id'));
  });
});
