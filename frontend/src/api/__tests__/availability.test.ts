/**
 * Tests voor de beschikbaarheid van leden.
 *
 * Een lid geeft per datum door of hij kan; de dirigent kijkt per datum wie er
 * is. Wat hier misgaat, gaat mis in de planning van een hele repetitie.
 *
 * De datum is hier geen gewoon veld maar de sleutel. Bij het opslaan gaat hij
 * in de body, bij het verwijderen in het pad, en bij het teamoverzicht in de
 * queryreeks - drie verschillende plaatsen voor dezelfde waarde. De server
 * eist het formaat YYYY-MM-DD met een reguliere uitdrukking; alles wat daar
 * niet aan voldoet, ook een geldige datum in een ander formaat, wordt
 * geweigerd. Deze tests leggen vast dat de datum ongewijzigd doorgaat en niet
 * onderweg door een Date-object heen gaat, want dat zou hem in een tijdzone
 * kunnen verschuiven en de opgave stilzwijgend een dag verzetten.
 *
 * Het tweede punt is de samenvatting bij het teamoverzicht. Die telt ook de
 * leden die niets ingevuld hebben als `unknown` - een apart getal dat niet uit
 * de andere drie af te leiden is. Verdwijnt dat, dan lijkt iedereen die niets
 * gezegd heeft afwezig.
 *
 * De paden zijn vergeleken met backend/src/routes/availability.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startNepserver, stopNepserver, antwoordMet, antwoordMetFout, laatsteVerzoek } from './nepserver';
import { serverroutes, serverBiedtAan } from './serverroutes';
import {
  getMyAvailability,
  getTeamAvailability,
  setAvailability,
  setBulkAvailability,
  removeAvailability,
} from '../availability';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

describe('mijn beschikbaarheid', () => {
  it('stuurt de periode mee onder fromDate en toDate', async () => {
    antwoordMet([]);

    await getMyAvailability('2026-09-01', '2026-12-31');

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/availability');
    // De server leest precies deze twee namen; `from`/`to` of `start`/`end`
    // zou hij negeren en dan komt de hele geschiedenis terug in plaats van
    // het gekozen seizoen.
    expect(laatsteVerzoek().query.get('fromDate')).toBe('2026-09-01');
    expect(laatsteVerzoek().query.get('toDate')).toBe('2026-12-31');
  });

  it('laat de periode weg als er geen begrenzing gevraagd is', async () => {
    antwoordMet([]);

    await getMyAvailability();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('geeft ook een lege notitie door als null, want dat is iets anders dan geen antwoord', async () => {
    antwoordMet([
      { id: 'b1', date: '2026-09-08', status: 'unavailable', notes: null, createdAt: 'x', updatedAt: 'y' },
      { id: 'b2', date: '2026-09-15', status: 'maybe', notes: 'Mogelijk dienst.', createdAt: 'x', updatedAt: 'y' },
    ]);

    const dagen = await getMyAvailability();

    expect(dagen[0].notes).toBeNull();
    expect(dagen[1].notes).toBe('Mogelijk dienst.');
  });
});

describe('teamoverzicht', () => {
  it('stuurt de datum als verplichte parameter mee', async () => {
    antwoordMet({ date: '2026-09-08', summary: {}, members: [] });

    await getTeamAvailability('2026-09-08');

    expect(laatsteVerzoek().pad).toBe('/availability/team');
    expect(laatsteVerzoek().query.get('date')).toBe('2026-09-08');
  });

  it('stuurt het orkest alleen mee als er een orkest gekozen is', async () => {
    antwoordMet({ date: '2026-09-08', summary: {}, members: [] });
    await getTeamAvailability('2026-09-08', 'ork-2');
    expect(laatsteVerzoek().query.get('orchestraId')).toBe('ork-2');

    antwoordMet({ date: '2026-09-08', summary: {}, members: [] });
    await getTeamAvailability('2026-09-08');
    // Een lege `orchestraId=` zou de server op een leeg orkest laten filteren:
    // nul leden, en dat leest als "niemand kan".
    expect(laatsteVerzoek().query.has('orchestraId')).toBe(false);
  });

  it('geeft de samenvatting inclusief de leden die niets ingevuld hebben', async () => {
    antwoordMet({
      date: '2026-09-08',
      summary: { available: 20, unavailable: 3, maybe: 2, unknown: 15, total: 40 },
      members: [
        { userId: 'g1', firstName: 'Anna', lastName: 'de Groot', status: 'available', notes: null },
        { userId: 'g2', firstName: 'Bram', lastName: 'Jansen', status: 'unknown', notes: null },
      ],
    });

    const team = await getTeamAvailability('2026-09-08');

    // `unknown` is niet af te leiden uit de andere drie zonder het totaal, en
    // het verschil telt: vijftien leden die niets gezegd hebben is iets heel
    // anders dan vijftien afmeldingen.
    expect(team.summary.unknown).toBe(15);
    expect(team.summary.total).toBe(40);
    expect(team.members[1].status).toBe('unknown');
  });

  it('laat een 403 door als de rol geen teamoverzicht mag zien', async () => {
    // De route staat achter requireRole('admin','conductor','section_leader').
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(getTeamAvailability('2026-09-08')).rejects.toMatchObject({ response: { status: 403 } });
  });
});

describe('beschikbaarheid opgeven', () => {
  it('zet datum, status en notitie in de body', async () => {
    antwoordMet({ id: 'b9', message: 'Beschikbaarheid ingesteld.' }, { status: 201 });

    const antwoord = await setAvailability('2026-09-08', 'unavailable', 'Op vakantie.');

    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/availability');
    expect(laatsteVerzoek().body).toEqual({
      date: '2026-09-08',
      status: 'unavailable',
      notes: 'Op vakantie.',
    });
    // 201 hoort een gewoon antwoord te zijn: de eerste opgave voor een datum
    // is een nieuwe rij, een tweede opgave is een wijziging met 200.
    expect(antwoord.id).toBe('b9');
  });

  it('stuurt de datum ongewijzigd als tekst, zonder omweg via een Date', async () => {
    antwoordMet({ id: 'b9', message: 'ok' });

    await setAvailability('2026-01-01', 'available');

    // Een Date-object zou hier als ISO-tijdstip in de body belanden
    // ('2025-12-31T23:00:00.000Z' in de Nederlandse wintertijd), en de
    // reguliere uitdrukking aan de serverkant zou dat weigeren - of erger,
    // een dag eerder opslaan.
    expect((laatsteVerzoek().body as { date: string }).date).toBe('2026-01-01');
  });

  it('laat de notitie weg als er geen notitie is', async () => {
    antwoordMet({ id: 'b9', message: 'ok' });

    await setAvailability('2026-09-08', 'available');

    expect(laatsteVerzoek().body).toEqual({ date: '2026-09-08', status: 'available' });
  });

  it('laat de 400 door bij een status die de server niet kent', async () => {
    antwoordMetFout(400, { error: 'Ongeldige status.' });

    await expect(setAvailability('2026-09-08', 'available')).rejects.toMatchObject({ response: { status: 400 } });
  });
});

describe('meerdere datums tegelijk', () => {
  it('gaat naar /availability/bulk met de datums als lijst', async () => {
    antwoordMet({ message: 'Bijgewerkt', created: 2, updated: 1 });

    const antwoord = await setBulkAvailability(['2026-09-08', '2026-09-15', '2026-09-22'], 'unavailable', 'Vakantie.');

    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/availability/bulk');
    expect(laatsteVerzoek().body).toEqual({
      dates: ['2026-09-08', '2026-09-15', '2026-09-22'],
      status: 'unavailable',
      notes: 'Vakantie.',
    });
    // De server telt nieuw en gewijzigd apart; het scherm meldt daarmee
    // hoeveel datums er echt bij kwamen.
    expect(antwoord.created).toBe(2);
    expect(antwoord.updated).toBe(1);
  });

  it('laat de 400 door als er meer dan negentig datums meegaan', async () => {
    // De server begrenst op negentig. Zou de api-laag dat zelf afkappen, dan
    // kreeg de gebruiker een stille deelopgave: de helft van zijn vakantie
    // ingevuld, zonder dat iets dat meldt.
    antwoordMetFout(400, { error: 'Maximaal 90 datums tegelijk.' });

    const teveel = Array.from({ length: 100 }, (_, i) => `2026-01-${String((i % 28) + 1).padStart(2, '0')}`);

    await expect(setBulkAvailability(teveel, 'unavailable')).rejects.toMatchObject({
      response: { status: 400 },
    });
    expect((laatsteVerzoek().body as { dates: string[] }).dates).toHaveLength(100);
  });
});

describe('beschikbaarheid intrekken', () => {
  it('zet de datum in het pad, niet in de body', async () => {
    antwoordMet({ message: 'Beschikbaarheid verwijderd.' });

    await removeAvailability('2026-09-08');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/availability/2026-09-08');
    expect(laatsteVerzoek().body).toBeUndefined();
  });

  it('laat een 404 door als er voor die datum niets stond', async () => {
    antwoordMetFout(404, { error: 'Beschikbaarheid niet gevonden.' });

    await expect(removeAvailability('2026-09-08')).rejects.toMatchObject({ response: { status: 404 } });
  });
});

describe('de paden komen overeen met wat de server aanbiedt', () => {
  const routes = serverroutes('availability.ts');

  const aanroepen: [string, () => Promise<unknown>][] = [
    ['getMyAvailability', () => getMyAvailability()],
    ['getTeamAvailability', () => getTeamAvailability('2026-09-08')],
    ['setAvailability', () => setAvailability('2026-09-08', 'available')],
    ['setBulkAvailability', () => setBulkAvailability(['2026-09-08'], 'available')],
    ['removeAvailability', () => removeAvailability('2026-09-08')],
  ];

  it.each(aanroepen)('%s raakt een bestaande route in backend/src/routes/availability.ts', async (_naam, aanroep) => {
    antwoordMet({});
    await aanroep().catch(() => undefined);
    const { methode, pad } = laatsteVerzoek();

    expect(serverBiedtAan(routes, '/availability', methode, pad)).toBe(true);
  });

  it('let op de valstrik dat /availability/bulk niet als /availability/:date gelezen wordt', () => {
    // POST /bulk en POST / zijn verschillende paden, en DELETE /:date is een
    // ander werkwoord - dus ze bijten elkaar nu niet. Zou er ooit een
    // POST /:date bijkomen bóven /bulk, dan werd een verzameling datums
    // opgeslagen als één datum met de naam "bulk".
    const opPost = routes.filter((r) => r.methode === 'post').map((r) => r.patroon);

    expect(opPost).toEqual(['/', '/bulk']);
  });
});
