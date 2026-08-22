/**
 * Tests voor de middelen-api (zalen, voertuigen, materiaal).
 *
 * De functies in resources.ts zetten een pad in elkaar, geven een body mee en
 * leveren `response.data` terug. Daarom wordt hier op het pad, de methode, de
 * body en de queryreeks getoetst - een typefout daarin geeft geen foutmelding
 * maar een leeg scherm. De routes zijn vergeleken met
 * backend/src/routes/resources.ts (gemount op /api/resources in index.ts).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  getResourceCategories,
  createResourceCategory,
  deleteResourceCategory,
  updateResourceCategory,
  reorderResourceCategories,
  getResources,
  getResource,
  createResource,
  updateResource,
  deleteResource,
  getResourceBookings,
  createResourceBooking,
  approveBooking,
  rejectBooking,
  cancelBooking,
  addResourceAvailability,
  deleteResourceAvailability,
} from '../resources';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

// ===========================================
// CATEGORIEEN
// ===========================================

describe('categorieen', () => {
  it('getResourceCategories bevraagt /resources/categories', async () => {
    antwoordMet([{ id: 'cat1', name: 'Zalen', sortOrder: 1, resourceCount: 3 }]);
    const categorieen = await getResourceCategories();

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/resources/categories');
    expect(categorieen[0].name).toBe('Zalen');
  });

  it('getResourceCategories geeft een lege lijst terug zonder te vallen', async () => {
    antwoordMet([]);
    await expect(getResourceCategories()).resolves.toEqual([]);
  });

  it('createResourceCategory post de categorie', async () => {
    antwoordMet({ id: 'cat1', message: 'Categorie aangemaakt' });
    await createResourceCategory({
      name: 'Voertuigen',
      description: 'Bus en aanhanger',
      color: '#ff0000',
      icon: 'bus',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/resources/categories');
    // createCategorySchema leest naam, omschrijving, kleur en pictogram.
    expect(verzoek.body).toEqual({
      name: 'Voertuigen',
      description: 'Bus en aanhanger',
      color: '#ff0000',
      icon: 'bus',
    });
  });

  it('deleteResourceCategory verwijdert een categorie', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteResourceCategory('cat1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/resources/categories/cat1');
  });

  it('updateResourceCategory stuurt een PATCH naar de categorie', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateResourceCategory('cat1', { name: 'Zalen en podia', color: '#00ff00' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('patch');
    expect(verzoek.pad).toBe('/resources/categories/cat1');
    expect(verzoek.body).toEqual({ name: 'Zalen en podia', color: '#00ff00' });
    // LET OP: backend/src/routes/resources.ts kent voor /categories/:id alleen
    // een DELETE. Deze PATCH belandt dus in de 404-afhandeling. Deze test legt
    // vast wat de frontend nu verstuurt; de route moet aan serverkant nog
    // gemaakt worden (zie het rapport bij deze wijziging).
  });

  it('reorderResourceCategories stuurt de volgorde als categoryIds', async () => {
    antwoordMet({ message: 'Volgorde bijgewerkt' });
    await reorderResourceCategories(['cat2', 'cat1', 'cat3']);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/resources/categories/reorder');
    expect(verzoek.body).toEqual({ categoryIds: ['cat2', 'cat1', 'cat3'] });
    // LET OP: deze route bestaat niet in de backend; zie de opmerking hierboven.
  });

  it('laat een 404 van de server ongewijzigd door', async () => {
    antwoordMetFout(404, { error: 'Route niet gevonden' });

    await expect(reorderResourceCategories(['cat1'])).rejects.toMatchObject({
      response: { status: 404, data: { error: 'Route niet gevonden' } },
    });
  });
});

// ===========================================
// MIDDELEN
// ===========================================

describe('getResources', () => {
  it('zet alle filters in de queryreeks', async () => {
    antwoordMet([]);
    await getResources({ type: 'room', categoryId: 'cat1', active: true });

    const { pad, query } = laatsteVerzoek();
    expect(pad).toBe('/resources?type=room&categoryId=cat1&active=true');
    expect(query.get('type')).toBe('room');
    expect(query.get('categoryId')).toBe('cat1');
    expect(query.get('active')).toBe('true');
  });

  it('stuurt active=false mee in plaats van het filter weg te laten', async () => {
    antwoordMet([]);
    await getResources({ active: false });

    // De backend kijkt naar `active !== undefined`, dus false betekent hier
    // echt "toon de inactieve middelen" en mag niet stilzwijgend verdwijnen.
    expect(laatsteVerzoek().query.get('active')).toBe('false');
  });

  it('bevraagt /resources zonder filters', async () => {
    antwoordMet([]);
    await getResources();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('geeft een lege lijst terug als er niets is', async () => {
    antwoordMet([]);
    await expect(getResources()).resolves.toEqual([]);
  });
});

describe('getResource', () => {
  it('haalt een middel op via /resources/:id', async () => {
    antwoordMet({ id: 'r1', name: 'Grote zaal', availability: [], upcomingBookings: [] });
    const middel = await getResource('r1');

    expect(laatsteVerzoek().pad).toBe('/resources/r1');
    expect(middel.name).toBe('Grote zaal');
  });

  it('laat een 404 door in plaats van hem als leeg resultaat te verpakken', async () => {
    antwoordMetFout(404, { error: 'Resource niet gevonden' });

    await expect(getResource('bestaat-niet')).rejects.toMatchObject({ response: { status: 404 } });
  });

  it('werpt bij een netwerkfout zonder respons', async () => {
    antwoordMetNetwerkfout();

    await expect(getResource('r1')).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('werpt als het verzoek in de tijdslimiet loopt', async () => {
    antwoordMetTijdslimiet();

    await expect(getResource('r1')).rejects.toMatchObject({ code: 'ECONNABORTED' });
  });
});

describe('createResource', () => {
  it('post het middel met de velden die createResourceSchema leest', async () => {
    antwoordMet({ id: 'r9', message: 'Resource aangemaakt' });

    await createResource({
      name: 'Repetitiezaal',
      description: 'Achter de foyer',
      resourceType: 'room',
      categoryId: '11111111-1111-1111-1111-111111111111',
      location: 'Begane grond',
      capacity: 60,
      requiresApproval: true,
      minBookingHours: 1,
      maxBookingHours: 8,
      advanceBookingDays: 30,
      costPerHour: 25,
      costPerDay: 150,
      depositAmount: 100,
      notes: 'Sleutel bij de beheerder',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/resources');
    expect(verzoek.body).toMatchObject({
      name: 'Repetitiezaal',
      resourceType: 'room',
      capacity: 60,
      requiresApproval: true,
      costPerHour: 25,
    });
  });

  it('stuurt requiresApproval false mee in plaats van het weg te laten', async () => {
    antwoordMet({ id: 'r9', message: '' });
    await createResource({ name: 'Bus', resourceType: 'vehicle', requiresApproval: false });

    expect(laatsteVerzoek().body).toEqual({ name: 'Bus', resourceType: 'vehicle', requiresApproval: false });
  });

  it('geeft een validatiefout van de server door', async () => {
    antwoordMetFout(400, { error: 'Naam is verplicht' });

    await expect(createResource({ name: '', resourceType: 'other' })).rejects.toMatchObject({
      response: { status: 400, data: { error: 'Naam is verplicht' } },
    });
  });
});

describe('updateResource', () => {
  it('gebruikt PATCH, niet PUT', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateResource('r1', { capacity: 80 });

    const verzoek = laatsteVerzoek();
    // De backend heeft alleen PATCH /:id voor middelen.
    expect(verzoek.methode).toBe('patch');
    expect(verzoek.pad).toBe('/resources/r1');
    expect(verzoek.body).toEqual({ capacity: 80 });
  });
});

describe('deleteResource', () => {
  it('verwijdert een middel', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteResource('r1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/resources/r1');
  });
});

// ===========================================
// RESERVERINGEN
// ===========================================

describe('getResourceBookings', () => {
  it('zet alle filters in de queryreeks', async () => {
    antwoordMet([]);
    await getResourceBookings({
      resourceId: 'r1',
      status: 'pending',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      myBookings: true,
    });

    const { pad, query } = laatsteVerzoek();
    expect(pad).toBe(
      '/resources/bookings?resourceId=r1&status=pending&startDate=2026-01-01&endDate=2026-02-01&myBookings=true',
    );
    expect(query.get('myBookings')).toBe('true');
  });

  it('laat myBookings weg als het niet aan staat', async () => {
    antwoordMet([]);
    await getResourceBookings({ myBookings: false });

    // De backend kijkt alleen of de parameter er staat, dus false hoort er
    // helemaal niet in - anders zie je toch alleen je eigen reserveringen.
    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('bevraagt /resources/bookings zonder filters', async () => {
    antwoordMet([]);
    await getResourceBookings();

    // Deze route staat in de backend voor /:id geregistreerd, dus 'bookings'
    // hoort niet als middel-id gelezen te worden.
    expect(laatsteVerzoek().pad).toBe('/resources/bookings?');
    expect(laatsteVerzoek().queryreeks).toBe('');
  });
});

describe('createResourceBooking', () => {
  it('post de reservering naar /resources/bookings', async () => {
    antwoordMet({ id: 'b1', status: 'pending', message: 'Reservering aangevraagd' });

    await createResourceBooking({
      resourceId: '11111111-1111-1111-1111-111111111111',
      title: 'Sectierepetitie',
      description: 'Koperblazers',
      startDatetime: '2026-03-01T19:00:00.000Z',
      endDatetime: '2026-03-01T21:00:00.000Z',
      relatedRehearsalId: '22222222-2222-2222-2222-222222222222',
      notes: 'Stoelen klaarzetten',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/resources/bookings');
    // createBookingSchema leest exact deze veldnamen.
    expect(verzoek.body).toEqual({
      resourceId: '11111111-1111-1111-1111-111111111111',
      title: 'Sectierepetitie',
      description: 'Koperblazers',
      startDatetime: '2026-03-01T19:00:00.000Z',
      endDatetime: '2026-03-01T21:00:00.000Z',
      relatedRehearsalId: '22222222-2222-2222-2222-222222222222',
      notes: 'Stoelen klaarzetten',
    });
  });

  it('laat een 409 door als het middel al bezet is', async () => {
    antwoordMetFout(409, { error: 'Resource is al gereserveerd in deze periode' });

    await expect(
      createResourceBooking({
        resourceId: 'r1',
        title: 'Botsing',
        startDatetime: '2026-03-01T19:00:00.000Z',
        endDatetime: '2026-03-01T21:00:00.000Z',
      }),
    ).rejects.toMatchObject({ response: { status: 409 } });
  });
});

describe('goedkeuren en afwijzen', () => {
  it('approveBooking stuurt een PATCH zonder body', async () => {
    antwoordMet({ message: 'Goedgekeurd' });
    await approveBooking('b1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('patch');
    expect(verzoek.pad).toBe('/resources/bookings/b1/approve');
    expect(verzoek.body).toBeUndefined();
  });

  it('rejectBooking stuurt de reden mee', async () => {
    antwoordMet({ message: 'Afgewezen' });
    await rejectBooking('b1', 'Zaal is verhuurd');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('patch');
    expect(verzoek.pad).toBe('/resources/bookings/b1/reject');
    // De backend leest req.body.reason.
    expect(verzoek.body).toEqual({ reason: 'Zaal is verhuurd' });
  });

  it('rejectBooking stuurt een lege body als er geen reden is', async () => {
    antwoordMet({ message: 'Afgewezen' });
    await rejectBooking('b1');

    expect(laatsteVerzoek().body).toEqual({});
  });

  it('cancelBooking verwijdert de reservering', async () => {
    antwoordMet({ message: 'Geannuleerd' });
    await cancelBooking('b1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/resources/bookings/b1');
  });

  it('laat een 403 door voor wie geen beheerder is', async () => {
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(approveBooking('b1')).rejects.toMatchObject({ response: { status: 403 } });
  });
});

// ===========================================
// BESCHIKBAARHEID
// ===========================================

describe('addResourceAvailability', () => {
  it('vertaalt isAvailable naar het availabilityType dat de backend eist', async () => {
    antwoordMet({ id: 'av1', message: 'Regel toegevoegd' });
    await addResourceAvailability('r1', {
      dayOfWeek: 2,
      startTime: '09:00',
      endTime: '17:00',
      isAvailable: true,
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/resources/r1/availability');
    // availabilitySchema eist availabilityType uit een enum en kent isAvailable
    // niet; zonder deze vertaling geeft elke regel een 400.
    expect(verzoek.body).toEqual({
      availabilityType: 'available',
      dayOfWeek: 2,
      startTime: '09:00',
      endTime: '17:00',
    });
  });

  it('maakt van isAvailable false een geblokkeerde periode', async () => {
    antwoordMet({ id: 'av1', message: '' });
    await addResourceAvailability('r1', {
      startTime: '00:00',
      endTime: '23:59',
      isAvailable: false,
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    });

    expect(laatsteVerzoek().body).toEqual({
      availabilityType: 'blocked',
      startTime: '00:00',
      endTime: '23:59',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    });
  });

  it('stuurt dagnummer 0 (zondag) mee in plaats van het weg te laten', async () => {
    antwoordMet({ id: 'av1', message: '' });
    await addResourceAvailability('r1', {
      dayOfWeek: 0,
      startTime: '10:00',
      endTime: '12:00',
      isAvailable: true,
    });

    // 0 is een geldige dag; wie hier op waarheid toetst verliest de zondag.
    expect(laatsteVerzoek().body).toMatchObject({ dayOfWeek: 0 });
  });

  it('deleteResourceAvailability verwijdert de juiste regel', async () => {
    antwoordMet({ message: 'Regel verwijderd' });
    await deleteResourceAvailability('r1', 'av1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/resources/r1/availability/av1');
  });
});

// ===========================================
// ALGEMEEN GEDRAG
// ===========================================

describe('algemeen gedrag van de middelen-api', () => {
  it('stuurt precies een verzoek per aanroep', async () => {
    antwoordMet([]);
    await getResources();

    expect(alleVerzoeken()).toHaveLength(1);
  });

  it('geeft een leeg antwoordlichaam door als lege string', async () => {
    antwoordMet('', { status: 204 });

    await expect(deleteResource('r1')).resolves.toBe('');
  });

  it('laat een 500 door in plaats van undefined te leveren', async () => {
    antwoordMetFout(500, { error: 'Interne fout' });

    await expect(getResources()).rejects.toMatchObject({ response: { status: 500 } });
  });
});
