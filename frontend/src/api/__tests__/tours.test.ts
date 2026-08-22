/**
 * Tests voor de tours-api.
 *
 * De functies in tours.ts zetten een pad in elkaar, geven een body mee en
 * leveren `response.data` terug. Daarom wordt hier op het pad, de methode, de
 * body en de queryreeks getoetst - een typefout daarin geeft geen foutmelding
 * maar een leeg scherm. De routes en de veldnamen in de body zijn vergeleken
 * met backend/src/routes/tours.ts (gemount op /api/tours in index.ts).
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
  getTours,
  getTour,
  createTour,
  updateTour,
  updateTourStatus,
  deleteTour,
  registerForTour,
  cancelTourRegistration,
  addTourAccommodation,
  removeTourAccommodation,
  addTourDay,
  deleteTourDay,
  addDayActivity,
  deleteDayActivity,
  addTourTransport,
  deleteTourTransport,
} from '../tours';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

// ===========================================
// TOURS OPHALEN
// ===========================================

describe('getTours', () => {
  it('zet status en jaar in de queryreeks', async () => {
    antwoordMet([]);
    await getTours({ status: 'confirmed', year: '2026' });

    const { pad, query } = laatsteVerzoek();
    // De backend leest req.query.status en req.query.year.
    expect(pad).toBe('/tours?status=confirmed&year=2026');
    expect(query.get('status')).toBe('confirmed');
    expect(query.get('year')).toBe('2026');
  });

  it('laat een filter dat niet is opgegeven weg', async () => {
    antwoordMet([]);
    await getTours({ status: 'planning' });

    expect(laatsteVerzoek().queryreeks).toBe('status=planning');
  });

  it('bevraagt /tours zonder filters', async () => {
    antwoordMet([]);
    await getTours();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('geeft een lege lijst terug als er nog geen tours zijn', async () => {
    antwoordMet([]);
    await expect(getTours()).resolves.toEqual([]);
  });

  it('geeft de lijst ongewijzigd door', async () => {
    antwoordMet([{ id: 't1', name: 'Wenen 2026', participantCount: 34, dayCount: 5 }]);
    const tours = await getTours();

    expect(tours).toHaveLength(1);
    expect(tours[0].name).toBe('Wenen 2026');
  });

  it('werpt bij een netwerkfout zonder respons', async () => {
    antwoordMetNetwerkfout();

    await expect(getTours()).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('werpt als het verzoek in de tijdslimiet loopt', async () => {
    antwoordMetTijdslimiet();

    await expect(getTours()).rejects.toMatchObject({ code: 'ECONNABORTED' });
  });
});

describe('getTour', () => {
  it('haalt een tour op via /tours/:id', async () => {
    antwoordMet({ id: 't1', name: 'Wenen 2026', participants: [], days: [], accommodations: [], transport: [] });
    const tour = await getTour('t1');

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/tours/t1');
    expect(tour.name).toBe('Wenen 2026');
  });

  it('laat een 404 door in plaats van hem als leeg resultaat te verpakken', async () => {
    antwoordMetFout(404, { error: 'Tour niet gevonden' });

    await expect(getTour('bestaat-niet')).rejects.toMatchObject({
      response: { status: 404, data: { error: 'Tour niet gevonden' } },
    });
  });
});

// ===========================================
// TOURS BEHEREN
// ===========================================

describe('createTour', () => {
  it('post de tour naar /tours met precies de velden die de backend leest', async () => {
    antwoordMet({ id: 't9', message: 'Tour aangemaakt' });

    await createTour({
      name: 'Wenen 2026',
      description: 'Concertreis',
      destination: 'Wenen',
      country: 'Oostenrijk',
      startDate: '2026-05-01',
      endDate: '2026-05-06',
      projectId: '11111111-1111-1111-1111-111111111111',
      budget: 25000,
      costPerPerson: 450,
      maxParticipants: 60,
      registrationDeadline: '2026-03-01',
      notes: 'Paspoort meenemen',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/tours');
    // createTourSchema in de backend leest exact deze veldnamen.
    expect(verzoek.body).toEqual({
      name: 'Wenen 2026',
      description: 'Concertreis',
      destination: 'Wenen',
      country: 'Oostenrijk',
      startDate: '2026-05-01',
      endDate: '2026-05-06',
      projectId: '11111111-1111-1111-1111-111111111111',
      budget: 25000,
      costPerPerson: 450,
      maxParticipants: 60,
      registrationDeadline: '2026-03-01',
      notes: 'Paspoort meenemen',
    });
  });

  it('stuurt alleen de ingevulde velden mee', async () => {
    antwoordMet({ id: 't9', message: '' });
    await createTour({ name: 'Kort', startDate: '2026-05-01', endDate: '2026-05-02' });

    const body = laatsteVerzoek().body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['endDate', 'name', 'startDate']);
  });

  it('stuurt een budget van 0 mee in plaats van het weg te laten', async () => {
    antwoordMet({ id: 't9', message: '' });
    await createTour({ name: 'Gratis', startDate: '2026-05-01', endDate: '2026-05-02', budget: 0 });

    expect(laatsteVerzoek().body).toMatchObject({ budget: 0 });
  });

  it('geeft een validatiefout van de server door met de melding erbij', async () => {
    antwoordMetFout(400, { error: 'Naam is verplicht' });

    await expect(createTour({ name: '', startDate: '2026-05-01', endDate: '2026-05-02' })).rejects.toMatchObject({
      response: { status: 400, data: { error: 'Naam is verplicht' } },
    });
  });
});

describe('updateTour', () => {
  it('gebruikt PATCH, niet PUT', async () => {
    antwoordMet({ message: 'Tour bijgewerkt' });
    await updateTour('t1', { destination: 'Praag' });

    const verzoek = laatsteVerzoek();
    // De backend heeft alleen PATCH /:id; een PUT geeft hier 404.
    expect(verzoek.methode).toBe('patch');
    expect(verzoek.pad).toBe('/tours/t1');
    expect(verzoek.body).toEqual({ destination: 'Praag' });
  });
});

describe('updateTourStatus', () => {
  it('post de status als PATCH op de statusroute', async () => {
    antwoordMet({ message: 'Status bijgewerkt' });
    await updateTourStatus('t1', 'cancelled');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('patch');
    expect(verzoek.pad).toBe('/tours/t1/status');
    expect(verzoek.body).toEqual({ status: 'cancelled' });
  });
});

describe('deleteTour', () => {
  it('verwijdert een tour', async () => {
    antwoordMet({ message: 'Tour verwijderd' });
    await deleteTour('t1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/tours/t1');
  });

  it('laat een 403 door voor wie geen beheerder is', async () => {
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(deleteTour('t1')).rejects.toMatchObject({ response: { status: 403 } });
  });
});

// ===========================================
// INSCHRIJVEN
// ===========================================

describe('registerForTour', () => {
  it('stuurt de voorkeuren mee als body', async () => {
    antwoordMet({ id: 'p1', status: 'registered', message: 'Ingeschreven' });

    await registerForTour('t1', {
      roomPreference: 'tweepersoons',
      dietaryRequirements: 'vegetarisch',
      emergencyContact: 'Piet',
      emergencyPhone: '0612345678',
      notes: 'Reist apart',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/tours/t1/register');
    expect(verzoek.body).toEqual({
      roomPreference: 'tweepersoons',
      dietaryRequirements: 'vegetarisch',
      emergencyContact: 'Piet',
      emergencyPhone: '0612345678',
      notes: 'Reist apart',
    });
  });

  it('stuurt een leeg object als er geen voorkeuren zijn', async () => {
    antwoordMet({ id: 'p1', status: 'registered', message: '' });
    await registerForTour('t1');

    // Een lege body in plaats van geen body: zo blijft het een geldig
    // JSON-verzoek dat registerParticipantSchema kan ontleden.
    expect(laatsteVerzoek().body).toEqual({});
  });

  it('laat een 409 door als de tour vol zit', async () => {
    antwoordMetFout(409, { error: 'Tour is vol' });

    await expect(registerForTour('t1')).rejects.toMatchObject({ response: { status: 409 } });
  });
});

describe('cancelTourRegistration', () => {
  it('verwijdert de eigen inschrijving', async () => {
    antwoordMet({ message: 'Inschrijving geannuleerd' });
    await cancelTourRegistration('t1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/tours/t1/register');
  });
});

// ===========================================
// OVERNACHTINGEN
// ===========================================

describe('overnachtingen', () => {
  it('addTourAccommodation post op de accommodatieroute', async () => {
    antwoordMet({ id: 'a1', message: 'Toegevoegd' });

    await addTourAccommodation('t1', {
      name: 'Hotel Mozart',
      city: 'Wenen',
      checkInDate: '2026-05-01',
      checkOutDate: '2026-05-06',
      roomCount: 30,
      costPerNight: 90,
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/tours/t1/accommodations');
    expect(verzoek.body).toEqual({
      name: 'Hotel Mozart',
      city: 'Wenen',
      checkInDate: '2026-05-01',
      checkOutDate: '2026-05-06',
      roomCount: 30,
      costPerNight: 90,
    });
  });

  it('removeTourAccommodation verwijdert de juiste overnachting', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await removeTourAccommodation('t1', 'a1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/tours/t1/accommodations/a1');
  });
});

// ===========================================
// DAGEN EN ACTIVITEITEN
// ===========================================

describe('addTourDay', () => {
  it('stuurt de datum als dayDate, want zo leest de backend hem', async () => {
    antwoordMet({ id: 'd1', message: 'Dag toegevoegd' });
    await addTourDay('t1', { date: '2026-05-02', title: 'Repetitiedag' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/tours/t1/days');
    // tourDaySchema in backend/src/routes/tours.ts eist `dayDate`. Onder de
    // naam `date` wordt het veld weggegooid en volgt er een 400.
    expect(verzoek.body).toEqual({ dayDate: '2026-05-02', title: 'Repetitiedag' });
  });

  it('laat de titel weg als die niet is ingevuld', async () => {
    antwoordMet({ id: 'd1', message: '' });
    await addTourDay('t1', { date: '2026-05-02' });

    expect(laatsteVerzoek().body).toEqual({ dayDate: '2026-05-02' });
  });

  it('laat een 400 door met de melding van de server', async () => {
    antwoordMetFout(400, { error: 'Ongeldige invoer' });

    await expect(addTourDay('t1', { date: '' })).rejects.toMatchObject({
      response: { status: 400, data: { error: 'Ongeldige invoer' } },
    });
  });
});

describe('deleteTourDay', () => {
  it('verwijdert een dag met tour en dag in het pad', async () => {
    antwoordMet({ message: 'Dag verwijderd' });
    await deleteTourDay('t1', 'd1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/tours/t1/days/d1');
  });
});

describe('addDayActivity', () => {
  it('stuurt het tijdstip als startTime en vult een soort in', async () => {
    antwoordMet({ id: 'act1', message: 'Activiteit toegevoegd' });
    await addDayActivity('t1', 'd1', {
      time: '19:30',
      title: 'Generale repetitie',
      description: 'In de zaal',
      location: 'Musikverein',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/tours/t1/days/d1/activities');
    // activitySchema leest startTime en eist activityType (een enum zonder
    // standaardwaarde). Een body met `time` en zonder soort geeft altijd 400.
    expect(verzoek.body).toEqual({
      activityType: 'other',
      title: 'Generale repetitie',
      description: 'In de zaal',
      location: 'Musikverein',
      startTime: '19:30',
    });
  });

  it('neemt een opgegeven soort over in plaats van de standaard', async () => {
    antwoordMet({ id: 'act1', message: '' });
    await addDayActivity('t1', 'd1', { time: '20:00', title: 'Concert', activityType: 'concert' });

    expect(laatsteVerzoek().body).toEqual({
      activityType: 'concert',
      title: 'Concert',
      startTime: '20:00',
    });
  });

  it('stuurt geen lege omschrijving of locatie mee', async () => {
    antwoordMet({ id: 'act1', message: '' });
    await addDayActivity('t1', 'd1', { time: '09:00', title: 'Ontbijt' });

    const body = laatsteVerzoek().body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['activityType', 'startTime', 'title']);
  });
});

describe('deleteDayActivity', () => {
  it('verwijdert een activiteit met alle drie de ids in het pad', async () => {
    antwoordMet({ message: 'Activiteit verwijderd' });
    await deleteDayActivity('t1', 'd1', 'act1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/tours/t1/days/d1/activities/act1');
  });
});

// ===========================================
// VERVOER
// ===========================================

describe('addTourTransport', () => {
  it('stuurt de velden die transportSchema leest', async () => {
    antwoordMet({ id: 'tr1', message: 'Vervoer toegevoegd' });

    await addTourTransport('t1', {
      type: 'bus',
      departureTime: '2026-05-01T06:00:00.000Z',
      arrivalTime: '2026-05-01T18:00:00.000Z',
      from: 'Eindhoven',
      to: 'Wenen',
      details: 'Twee touringcars',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/tours/t1/transport');
    expect(verzoek.body).toEqual({
      type: 'bus',
      departureTime: '2026-05-01T06:00:00.000Z',
      arrivalTime: '2026-05-01T18:00:00.000Z',
      from: 'Eindhoven',
      to: 'Wenen',
      details: 'Twee touringcars',
    });
  });

  it('deleteTourTransport verwijdert het juiste vervoer', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteTourTransport('t1', 'tr1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/tours/t1/transport/tr1');
  });
});

// ===========================================
// ALGEMEEN GEDRAG
// ===========================================

describe('algemeen gedrag van de tours-api', () => {
  it('stuurt precies een verzoek per aanroep', async () => {
    antwoordMet([]);
    await getTours();

    expect(alleVerzoeken()).toHaveLength(1);
  });

  it('geeft een leeg antwoordlichaam door als lege string in plaats van te vallen', async () => {
    antwoordMet('', { status: 204 });

    await expect(deleteTour('t1')).resolves.toBe('');
  });

  it('geeft null door zoals het binnenkomt', async () => {
    antwoordMet(null);

    await expect(getTour('t1')).resolves.toBeNull();
  });
});
