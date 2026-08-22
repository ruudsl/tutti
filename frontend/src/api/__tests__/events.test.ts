/**
 * Tests voor de evenementen-api.
 *
 * De functies in events.ts bouwen een pad en geven een body mee; de meeste
 * geven `response.data` terug. Er wordt hier op pad, methode, body en
 * queryreeks getoetst - een typefout daarin geeft geen foutmelding maar een
 * leeg scherm of een filter die niets doet. De routes zijn vergeleken met
 * backend/src/routes/events.ts (gekoppeld op /api/events).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  startNepserver,
  stopNepserver,
  antwoordMet,
  antwoordMetFout,
  antwoordMetNetwerkfout,
  antwoordMetTijdslimiet,
  laatsteVerzoek,
  alleVerzoeken,
} from './nepserver';
import {
  getEventLocations,
  getEventLocation,
  createEventLocation,
  updateEventLocation,
  deleteEventLocation,
  getEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventSchedule,
  createScheduleItem,
  updateScheduleItem,
  deleteScheduleItem,
  getEventTransport,
  createTransport,
  updateTransport,
  deleteTransport,
  addPassenger,
  removePassenger,
  getEventMeetingPoints,
  createMeetingPoint,
  deleteMeetingPoint,
  getEventPackingLists,
  getEventPackingList,
  createPackingList,
  addPackingItem,
  updatePackingItem,
  deletePackingItem,
  getPackingTemplates,
  getPackingTemplate,
  createPackingTemplate,
  deletePackingTemplate,
  updateMyAttendance,
  getAttendanceSummary,
  getEventWeather,
  fetchEventWeather,
} from '../events';

beforeEach(() => startNepserver());
afterEach(() => {
  stopNepserver();
  vi.restoreAllMocks();
});

// ===========================================
// LOCATIES
// ===========================================

describe('getEventLocations', () => {
  it('haalt de locaties op zonder queryreeks als er geen filters zijn', async () => {
    antwoordMet({ data: [], pagination: { page: 1, limit: 25, total: 0 } });
    await getEventLocations();

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/events/locations');
    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('zet zoekterm en zaalsoort in de queryreeks', async () => {
    antwoordMet({ data: [] });
    await getEventLocations({ search: 'Concertzaal', venueType: 'theater' });

    const { query } = laatsteVerzoek();
    expect(query.get('search')).toBe('Concertzaal');
    expect(query.get('venueType')).toBe('theater');
  });

  it('stuurt isFavorite als tekst true, want de backend vergelijkt met de string', async () => {
    antwoordMet({ data: [] });
    await getEventLocations({ isFavorite: true });

    // De backend doet `if (isFavorite === 'true')`; alleen deze schrijfwijze werkt.
    expect(laatsteVerzoek().query.get('isFavorite')).toBe('true');
  });

  it('vraagt de paginagrootte op onder de naam die de backend leest', async () => {
    antwoordMet({ data: [] });
    await getEventLocations({ page: 2, pageSize: 50 });

    const { query } = laatsteVerzoek();
    expect(query.get('page')).toBe('2');
    // getPaginationParams in de backend leest `limit`; `pageSize` wordt daar
    // genegeerd en levert stilzwijgend de standaard van 25 rijen op.
    expect(query.get('limit')).toBe('50');
    expect(query.has('pageSize')).toBe(false);
  });

  it('codeert een zoekterm met ampersand en spatie', async () => {
    antwoordMet({ data: [] });
    await getEventLocations({ search: 'Zaal & Podium' });

    const { queryreeks, query } = laatsteVerzoek();
    expect(queryreeks).not.toContain('& Podium');
    expect(query.get('search')).toBe('Zaal & Podium');
  });

  it('geeft het gepagineerde antwoord ongewijzigd door', async () => {
    const antwoord = { data: [{ id: 'l1', name: 'Dorpshuis' }], pagination: { page: 1, limit: 25, total: 1 } };
    antwoordMet(antwoord);

    await expect(getEventLocations()).resolves.toEqual(antwoord);
  });
});

describe('locaties beheren', () => {
  it('getEventLocation haalt een locatie op', async () => {
    antwoordMet({ id: 'l1', name: 'Dorpshuis' });
    await getEventLocation('l1');

    expect(laatsteVerzoek().pad).toBe('/events/locations/l1');
  });

  it('createEventLocation post de locatie', async () => {
    antwoordMet({ id: 'l1' });

    await createEventLocation({ name: 'Dorpshuis', city: 'Ede', indoorOutdoor: 'indoor', hasParking: true });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/events/locations');
    expect(verzoek.body).toEqual({ name: 'Dorpshuis', city: 'Ede', indoorOutdoor: 'indoor', hasParking: true });
  });

  it('updateEventLocation gebruikt PUT en geeft niets terug', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });

    const resultaat = await updateEventLocation('l1', { capacity: 300 });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/events/locations/l1');
    expect(verzoek.body).toEqual({ capacity: 300 });
    expect(resultaat).toBeUndefined();
  });

  it('deleteEventLocation verwijdert een locatie', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteEventLocation('l1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/events/locations/l1');
  });

  it('deleteEventLocation laat een 409 door wanneer de locatie in gebruik is', async () => {
    antwoordMetFout(409, { error: 'Locatie is in gebruik.' });

    await expect(deleteEventLocation('l1')).rejects.toMatchObject({ response: { status: 409 } });
  });
});

// ===========================================
// EVENEMENTEN
// ===========================================

describe('getEvents', () => {
  it('haalt de evenementen op zonder queryreeks als er geen filters zijn', async () => {
    antwoordMet({ data: [] });
    await getEvents();

    expect(laatsteVerzoek().pad).toBe('/events');
    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('zet alle filters in de queryreeks', async () => {
    antwoordMet({ data: [] });

    await getEvents({
      search: 'zomer',
      status: 'confirmed',
      eventType: 'concert',
      from: '2026-06-01',
      to: '2026-08-31',
    });

    const { query } = laatsteVerzoek();
    expect(query.get('search')).toBe('zomer');
    expect(query.get('status')).toBe('confirmed');
    expect(query.get('eventType')).toBe('concert');
    expect(query.get('from')).toBe('2026-06-01');
    expect(query.get('to')).toBe('2026-08-31');
  });

  it('stuurt upcoming als tekst true, want de backend vergelijkt met de string', async () => {
    antwoordMet({ data: [] });
    await getEvents({ upcoming: true });

    expect(laatsteVerzoek().query.get('upcoming')).toBe('true');
  });

  it('laat filters die niet ingevuld zijn helemaal weg', async () => {
    antwoordMet({ data: [] });
    await getEvents({ search: undefined, status: 'planned' });

    // Een lege search zou de backend als filter op een lege naam lezen.
    expect(laatsteVerzoek().queryreeks).toBe('status=planned');
  });

  it('vraagt de paginagrootte op onder de naam die de backend leest', async () => {
    antwoordMet({ data: [] });
    await getEvents({ page: 3, pageSize: 100 });

    const { query } = laatsteVerzoek();
    expect(query.get('page')).toBe('3');
    // Zie getEventLocations: de backend leest `limit`, niet `pageSize`.
    expect(query.get('limit')).toBe('100');
    expect(query.has('pageSize')).toBe(false);
  });

  it('geeft een lege evenementenlijst door zonder te vallen', async () => {
    antwoordMet({ data: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } });

    const antwoord = await getEvents();
    expect((antwoord as { data: unknown[] }).data).toEqual([]);
  });
});

describe('evenementen beheren', () => {
  it('getEvent haalt een evenement met orkesten en aanwezigheid op', async () => {
    const evenement = {
      id: 'e1',
      name: 'Zomerconcert',
      orchestras: [{ id: 'o1', name: 'Harmonie', performanceOrder: 1 }],
      attendance: [{ id: 'a1', userId: 'u1', status: 'attending' }],
      myAttendance: null,
    };
    antwoordMet(evenement);

    const resultaat = await getEvent('e1');

    expect(laatsteVerzoek().pad).toBe('/events/e1');
    expect(resultaat).toEqual(evenement);
    expect(resultaat.myAttendance).toBeNull();
  });

  it('getEvent laat een 404 door in plaats van hem als leeg resultaat te verpakken', async () => {
    antwoordMetFout(404, { error: 'Evenement niet gevonden.' });

    await expect(getEvent('bestaat-niet')).rejects.toMatchObject({
      response: { status: 404, data: { error: 'Evenement niet gevonden.' } },
    });
  });

  it('createEvent stuurt de orkesten als lijst met ids mee', async () => {
    antwoordMet({ id: 'e1' });

    await createEvent({
      name: 'Zomerconcert',
      startDatetime: '2026-07-01T20:00:00.000Z',
      eventType: 'concert',
      orchestraIds: ['o1', 'o2'],
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/events');
    // createEventSchema leest orchestraIds; een enkelvoudige orchestraId zou
    // door zod worden weggegooid en het evenement zonder orkest opleveren.
    expect(verzoek.body).toEqual({
      name: 'Zomerconcert',
      startDatetime: '2026-07-01T20:00:00.000Z',
      eventType: 'concert',
      orchestraIds: ['o1', 'o2'],
    });
  });

  it('updateEvent gebruikt PUT op /events/:id', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });

    await updateEvent('e1', { status: 'cancelled' });

    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/events/e1');
    expect(laatsteVerzoek().body).toEqual({ status: 'cancelled' });
  });

  it('deleteEvent verwijdert een evenement', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteEvent('e1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/events/e1');
  });
});

// ===========================================
// DAGINDELING
// ===========================================

describe('dagindeling', () => {
  it('getEventSchedule haalt de onderdelen op', async () => {
    antwoordMet([{ id: 'd1', title: 'Opbouw' }]);
    const onderdelen = await getEventSchedule('e1');

    expect(laatsteVerzoek().pad).toBe('/events/e1/schedule');
    expect(onderdelen).toHaveLength(1);
  });

  it('getEventSchedule geeft een lege dagindeling terug zonder te vallen', async () => {
    antwoordMet([]);
    await expect(getEventSchedule('e1')).resolves.toEqual([]);
  });

  it('createScheduleItem post het onderdeel onder het evenement', async () => {
    antwoordMet({ id: 'd1' });

    await createScheduleItem('e1', { title: 'Soundcheck', startTime: '18:30', itemType: 'soundcheck' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/events/e1/schedule');
    expect(verzoek.body).toEqual({ title: 'Soundcheck', startTime: '18:30', itemType: 'soundcheck' });
  });

  it('updateScheduleItem zet evenement en onderdeel allebei in het pad', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });

    await updateScheduleItem('e1', 'd1', { startTime: '19:00' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/events/e1/schedule/d1');
    expect(verzoek.body).toEqual({ startTime: '19:00' });
  });

  it('deleteScheduleItem verwijdert een onderdeel', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteScheduleItem('e1', 'd1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/events/e1/schedule/d1');
  });
});

// ===========================================
// VERVOER
// ===========================================

describe('vervoer', () => {
  it('getEventTransport haalt de ritten op', async () => {
    antwoordMet([{ id: 'v1', transportType: 'bus', passengers: [] }]);
    await getEventTransport('e1');

    expect(laatsteVerzoek().pad).toBe('/events/e1/transport');
  });

  it('createTransport stuurt soort en chauffeur mee', async () => {
    antwoordMet({ id: 'v1' });

    await createTransport('e1', { transportType: 'car', driverUserId: 'u1', capacity: 4 });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/events/e1/transport');
    expect(verzoek.body).toEqual({ transportType: 'car', driverUserId: 'u1', capacity: 4 });
  });

  it('updateTransport zet evenement en rit allebei in het pad', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });
    await updateTransport('e1', 'v1', { departureTime: '17:45' });

    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/events/e1/transport/v1');
  });

  it('deleteTransport verwijdert een rit', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteTransport('e1', 'v1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/events/e1/transport/v1');
  });

  it('addPassenger post de meerijder onder de rit', async () => {
    antwoordMet({ id: 'p1' });

    await addPassenger('e1', 'v1', { passengerName: 'Jan', pickupLocation: 'Station' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/events/e1/transport/v1/passengers');
    expect(verzoek.body).toEqual({ passengerName: 'Jan', pickupLocation: 'Station' });
  });

  it('removePassenger verwijdert de meerijder met alle drie de ids in het pad', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await removePassenger('e1', 'v1', 'p1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/events/e1/transport/v1/passengers/p1');
  });
});

// ===========================================
// VERZAMELPUNTEN
// ===========================================

describe('verzamelpunten', () => {
  it('getEventMeetingPoints haalt de punten op', async () => {
    antwoordMet([]);
    await getEventMeetingPoints('e1');

    expect(laatsteVerzoek().pad).toBe('/events/e1/meeting-points');
  });

  it('createMeetingPoint stuurt naam en tijd mee', async () => {
    antwoordMet({ id: 'm1' });

    await createMeetingPoint('e1', { name: 'Parkeerplaats', meetingTime: '17:00', isPrimary: true });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/events/e1/meeting-points');
    expect(verzoek.body).toEqual({ name: 'Parkeerplaats', meetingTime: '17:00', isPrimary: true });
  });

  it('deleteMeetingPoint verwijdert een punt', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteMeetingPoint('e1', 'm1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/events/e1/meeting-points/m1');
  });
});

// ===========================================
// PAKLIJSTEN
// ===========================================

describe('paklijsten', () => {
  it('getEventPackingLists haalt de lijsten op', async () => {
    antwoordMet([{ id: 'pl1', name: 'Standaard', totalItems: 3, packedItems: 1, progress: 33 }]);
    await getEventPackingLists('e1');

    expect(laatsteVerzoek().pad).toBe('/events/e1/packing-lists');
  });

  it('getEventPackingList haalt een lijst met items op', async () => {
    antwoordMet({ id: 'pl1', name: 'Standaard', items: [{ id: 'i1', itemName: 'Lessenaars' }] });
    const lijst = await getEventPackingList('e1', 'pl1');

    expect(laatsteVerzoek().pad).toBe('/events/e1/packing-lists/pl1');
    expect(lijst.items).toHaveLength(1);
  });

  it('createPackingList stuurt naam en sjabloon mee', async () => {
    antwoordMet({ id: 'pl1' });

    await createPackingList('e1', { name: 'Buitenoptreden', templateId: 's1', notes: 'Regenhoezen mee' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/events/e1/packing-lists');
    expect(verzoek.body).toEqual({ name: 'Buitenoptreden', templateId: 's1', notes: 'Regenhoezen mee' });
  });

  it('addPackingItem post het item onder de lijst', async () => {
    antwoordMet({ id: 'i1' });

    await addPackingItem('e1', 'pl1', { itemName: 'Lessenaars', quantity: 20, isRequired: true });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/events/e1/packing-lists/pl1/items');
    expect(verzoek.body).toEqual({ itemName: 'Lessenaars', quantity: 20, isRequired: true });
  });

  it('updatePackingItem zet alle drie de ids in het pad', async () => {
    antwoordMet({ message: 'Item bijgewerkt.' });

    await updatePackingItem('e1', 'pl1', 'i1', { isPacked: true, quantityPacked: 20 });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/events/e1/packing-lists/pl1/items/i1');
    // De backend kijkt met typeof naar isPacked en quantityPacked; andere
    // veldnamen laten de regel stil ongewijzigd.
    expect(verzoek.body).toEqual({ isPacked: true, quantityPacked: 20 });
  });

  it('updatePackingItem stuurt isPacked false mee in plaats van het veld weg te laten', async () => {
    antwoordMet({ message: 'Item bijgewerkt.' });

    await updatePackingItem('e1', 'pl1', 'i1', { isPacked: false });

    // false is een betekenisvolle waarde: afvinken ongedaan maken.
    expect(laatsteVerzoek().body).toEqual({ isPacked: false });
  });

  it('deletePackingItem verwijdert een item', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deletePackingItem('e1', 'pl1', 'i1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/events/e1/packing-lists/pl1/items/i1');
  });
});

// ===========================================
// PAKLIJSTSJABLONEN
// ===========================================

describe('paklijstsjablonen', () => {
  it('getPackingTemplates bevraagt het vaste pad, niet /events/:id', async () => {
    antwoordMet([]);
    await getPackingTemplates();

    // 'packing-templates' mag niet als evenement-id gelezen worden; in de
    // backend staat deze route daarom voor /:id geregistreerd.
    expect(laatsteVerzoek().pad).toBe('/events/packing-templates');
  });

  it('getPackingTemplate haalt een sjabloon met items op', async () => {
    antwoordMet({ id: 's1', name: 'Buiten', items: [{ id: 'ti1', itemName: 'Partytent' }] });
    const sjabloon = await getPackingTemplate('s1');

    expect(laatsteVerzoek().pad).toBe('/events/packing-templates/s1');
    expect(sjabloon.items).toHaveLength(1);
  });

  it('createPackingTemplate stuurt de items mee als lijst', async () => {
    antwoordMet({ id: 's1' });

    await createPackingTemplate({
      name: 'Buiten',
      eventType: 'openlucht',
      isDefault: true,
      // De typedefinitie van createPackingTemplate wil hier een volledig item;
      // de backend leest alleen category, itemName, quantity en isRequired.
      items: [{ id: 'ti1', sortOrder: 0, category: 'techniek', itemName: 'Partytent', quantity: 2, isRequired: true }],
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/events/packing-templates');
    const body = verzoek.body as { items: Record<string, unknown>[]; isDefault: boolean };
    expect(body.isDefault).toBe(true);
    expect(body.items[0]).toMatchObject({ category: 'techniek', itemName: 'Partytent', quantity: 2, isRequired: true });
  });

  it('deletePackingTemplate verwijdert een sjabloon', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deletePackingTemplate('s1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/events/packing-templates/s1');
  });
});

// ===========================================
// AANWEZIGHEID
// ===========================================

describe('aanwezigheid', () => {
  it('updateMyAttendance post de eigen opgave', async () => {
    antwoordMet({ message: 'Aanwezigheid bijgewerkt.' });

    await updateMyAttendance('e1', {
      status: 'attending',
      instrumentId: 'i1',
      transportNeeded: true,
      canDrive: false,
      availableSeats: 0,
      dietaryRequirements: 'vegetarisch',
      notes: 'Kom later',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/events/e1/attendance');
    // updateEventAttendanceSchema leest exact deze veldnamen.
    expect(verzoek.body).toEqual({
      status: 'attending',
      instrumentId: 'i1',
      transportNeeded: true,
      canDrive: false,
      availableSeats: 0,
      dietaryRequirements: 'vegetarisch',
      notes: 'Kom later',
    });
  });

  it('updateMyAttendance stuurt alleen de status als er verder niets ingevuld is', async () => {
    antwoordMet({ message: 'Aanwezigheid bijgewerkt.' });
    await updateMyAttendance('e1', { status: 'not_attending' });

    expect(laatsteVerzoek().body).toEqual({ status: 'not_attending' });
  });

  it('updateMyAttendance laat een 404 door voor een onbekend evenement', async () => {
    antwoordMetFout(404, { error: 'Evenement niet gevonden.' });

    await expect(updateMyAttendance('e9', { status: 'maybe' })).rejects.toMatchObject({
      response: { status: 404 },
    });
  });

  it('getAttendanceSummary haalt de samenvatting op', async () => {
    const samenvatting = {
      byStatus: { attending: 20, not_attending: 3 },
      transport: { needsTransport: 5, availableSeats: 8 },
      byInstrument: [{ instrument: 'Trompet', count: 4 }],
    };
    antwoordMet(samenvatting);

    const resultaat = await getAttendanceSummary('e1');

    expect(laatsteVerzoek().pad).toBe('/events/e1/attendance/summary');
    expect(resultaat).toEqual(samenvatting);
  });
});

// ===========================================
// WEER
// ===========================================

describe('weer', () => {
  it('getEventWeather haalt de verwachting op', async () => {
    antwoordMet({ location: { latitude: 52.0, longitude: 5.6 }, forecasts: [{ id: 'w1', temperatureC: 21 }] });

    const weer = await getEventWeather('e1');

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/events/e1/weather');
    expect(weer.forecasts).toHaveLength(1);
  });

  it('getEventWeather geeft een lege verwachting terug zonder te vallen', async () => {
    antwoordMet({ location: {}, forecasts: [] });

    await expect(getEventWeather('e1')).resolves.toEqual({ location: {}, forecasts: [] });
  });

  it('fetchEventWeather post op de ophaalroute zonder body', async () => {
    antwoordMet({ message: 'Weerbericht opgehaald.' });

    await fetchEventWeather('e1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/events/e1/weather/fetch');
    expect(verzoek.body).toBeUndefined();
  });
});

// ===========================================
// ALGEMEEN GEDRAG
// ===========================================

describe('algemeen gedrag van de evenementen-api', () => {
  it('stuurt precies een verzoek per aanroep', async () => {
    antwoordMet({ data: [] });
    await getEvents();

    expect(alleVerzoeken()).toHaveLength(1);
  });

  it('werpt bij een netwerkfout zonder respons', async () => {
    antwoordMetNetwerkfout();

    await expect(getEvents()).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('werpt als het verzoek in de tijdslimiet loopt', async () => {
    antwoordMetTijdslimiet();

    await expect(getEvents()).rejects.toMatchObject({ code: 'ECONNABORTED' });
  });

  it('geeft een 403 door bij het aanmaken zonder rechten', async () => {
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(createEvent({ name: 'Test', startDatetime: '2026-07-01T20:00:00.000Z' })).rejects.toMatchObject({
      response: { status: 403 },
    });
  });
});
