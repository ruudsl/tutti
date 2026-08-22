/**
 * Tests voor de vervangingsaanvragen-api.
 *
 * De functies in replacement-requests.ts zetten een pad in elkaar, geven een
 * body mee en leveren `response.data` terug. Daarom wordt hier op het pad, de
 * methode, de body en de queryreeks getoetst - een typefout daarin geeft geen
 * foutmelding maar een leeg scherm. De routes zijn vergeleken met
 * backend/src/routes/replacement-requests.ts (gemount op
 * /api/replacement-requests in index.ts).
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
  getReplacementRequests,
  getReplacementRequest,
  createReplacementRequest,
  updateReplacementRequest,
  cancelReplacementRequest,
  inviteMusician,
  updateAssignment,
  getReplacementSuggestions,
} from '../replacement-requests';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

// ===========================================
// AANVRAGEN OPHALEN
// ===========================================

describe('getReplacementRequests', () => {
  it('zet alle filters in de queryreeks', async () => {
    antwoordMet([]);
    await getReplacementRequests({
      status: 'open',
      eventType: 'concert',
      instrumentId: 'i1',
      urgency: 'critical',
    });

    const { pad, query } = laatsteVerzoek();
    expect(pad).toBe('/replacement-requests?status=open&eventType=concert&instrumentId=i1&urgency=critical');
    expect(query.get('status')).toBe('open');
    expect(query.get('eventType')).toBe('concert');
    expect(query.get('instrumentId')).toBe('i1');
    expect(query.get('urgency')).toBe('critical');
  });

  it('laat filters die niet ingevuld zijn weg', async () => {
    antwoordMet([]);
    await getReplacementRequests({ status: 'open', urgency: undefined });

    expect(laatsteVerzoek().queryreeks).toBe('status=open');
  });

  it('bevraagt de lijst zonder filters', async () => {
    antwoordMet([]);
    await getReplacementRequests();

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('geeft een lege lijst terug als er geen openstaande aanvragen zijn', async () => {
    antwoordMet([]);
    await expect(getReplacementRequests()).resolves.toEqual([]);
  });

  it('geeft de lijst ongewijzigd door, inclusief de tellingen', async () => {
    antwoordMet([
      {
        id: 'rr1',
        eventType: 'rehearsal',
        positionsNeeded: 2,
        positionsFilled: 1,
        assignmentCount: 3,
        confirmedCount: 1,
      },
    ]);
    const aanvragen = await getReplacementRequests();

    expect(aanvragen[0].positionsFilled).toBe(1);
    expect(aanvragen[0].confirmedCount).toBe(1);
  });

  it('codeert een filterwaarde met een ampersand', async () => {
    antwoordMet([]);
    await getReplacementRequests({ instrumentId: 'a&b' });

    const { queryreeks, query } = laatsteVerzoek();
    expect(queryreeks).toBe('instrumentId=a%26b');
    expect(query.get('instrumentId')).toBe('a&b');
  });
});

describe('getReplacementRequest', () => {
  it('haalt een aanvraag op via /replacement-requests/:id', async () => {
    antwoordMet({ id: 'rr1', instrumentName: 'Klarinet', assignments: [] });
    const aanvraag = await getReplacementRequest('rr1');

    expect(laatsteVerzoek().pad).toBe('/replacement-requests/rr1');
    expect(aanvraag.instrumentName).toBe('Klarinet');
  });

  it('laat een 404 door in plaats van hem als leeg resultaat te verpakken', async () => {
    antwoordMetFout(404, { error: 'Aanvraag niet gevonden.' });

    await expect(getReplacementRequest('bestaat-niet')).rejects.toMatchObject({
      response: { status: 404, data: { error: 'Aanvraag niet gevonden.' } },
    });
  });

  it('werpt bij een netwerkfout zonder respons', async () => {
    antwoordMetNetwerkfout();

    await expect(getReplacementRequest('rr1')).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('werpt als het verzoek in de tijdslimiet loopt', async () => {
    antwoordMetTijdslimiet();

    await expect(getReplacementRequest('rr1')).rejects.toMatchObject({ code: 'ECONNABORTED' });
  });
});

// ===========================================
// AANVRAGEN BEHEREN
// ===========================================

describe('createReplacementRequest', () => {
  it('post de aanvraag met alle velden', async () => {
    antwoordMet({ id: 'rr9', message: 'Aanvraag aangemaakt' });

    await createReplacementRequest({
      eventType: 'concert',
      eventId: 'c1',
      eventDate: '2026-05-01',
      instrumentId: 'i1',
      positionsNeeded: 2,
      urgency: 'high',
      notes: 'Bij voorkeur ervaren invaller',
      deadline: '2026-04-15',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/replacement-requests');
    expect(verzoek.body).toEqual({
      eventType: 'concert',
      eventId: 'c1',
      eventDate: '2026-05-01',
      instrumentId: 'i1',
      positionsNeeded: 2,
      urgency: 'high',
      notes: 'Bij voorkeur ervaren invaller',
      deadline: '2026-04-15',
    });
  });

  it('stuurt alleen de verplichte velden mee als de rest leeg blijft', async () => {
    antwoordMet({ id: 'rr9', message: '' });
    await createReplacementRequest({
      eventType: 'rehearsal',
      eventId: 'r1',
      eventDate: '2026-05-01',
      instrumentId: 'i1',
    });

    const body = laatsteVerzoek().body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['eventDate', 'eventId', 'eventType', 'instrumentId']);
  });

  it('stuurt notities en deadline als null mee wanneer ze bewust leeggemaakt zijn', async () => {
    antwoordMet({ id: 'rr9', message: '' });
    await createReplacementRequest({
      eventType: 'concert',
      eventId: 'c1',
      eventDate: '2026-05-01',
      instrumentId: 'i1',
      notes: null,
      deadline: null,
    });

    // null blijft bij het omzetten naar JSON staan, undefined niet - dat is het
    // verschil tussen "wissen" en "niet meesturen".
    expect(laatsteVerzoek().body).toMatchObject({ notes: null, deadline: null });
  });

  it('geeft een validatiefout van de server door', async () => {
    antwoordMetFout(400, { error: 'Instrument is verplicht.' });

    await expect(
      createReplacementRequest({ eventType: 'concert', eventId: 'c1', eventDate: '2026-05-01', instrumentId: '' }),
    ).rejects.toMatchObject({ response: { status: 400, data: { error: 'Instrument is verplicht.' } } });
  });
});

describe('updateReplacementRequest', () => {
  it('gebruikt PUT op /replacement-requests/:id', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateReplacementRequest('rr1', { status: 'filled', positionsNeeded: 3 });

    const verzoek = laatsteVerzoek();
    // De backend heeft hier PUT (geen PATCH); een PATCH geeft 404.
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/replacement-requests/rr1');
    expect(verzoek.body).toEqual({ status: 'filled', positionsNeeded: 3 });
  });

  it('stuurt een lege wijziging mee zonder er iets van te maken', async () => {
    antwoordMet({ message: '' });
    await updateReplacementRequest('rr1', {});

    expect(laatsteVerzoek().body).toEqual({});
  });
});

describe('cancelReplacementRequest', () => {
  it('annuleert via DELETE', async () => {
    antwoordMet({ message: 'Aanvraag geannuleerd' });
    await cancelReplacementRequest('rr1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/replacement-requests/rr1');
  });

  it('laat een 403 door voor wie de aanvraag niet mag annuleren', async () => {
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(cancelReplacementRequest('rr1')).rejects.toMatchObject({ response: { status: 403 } });
  });
});

// ===========================================
// MUZIKANTEN UITNODIGEN
// ===========================================

describe('inviteMusician', () => {
  it('post de uitnodiging op de invite-route van de aanvraag', async () => {
    antwoordMet({ id: 'as1', message: 'Uitnodiging verstuurd' });
    await inviteMusician('rr1', {
      externalMusicianId: 'em1',
      notes: 'Speelt vaker mee',
      feeAmount: 75,
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/replacement-requests/rr1/invite');
    expect(verzoek.body).toEqual({
      externalMusicianId: 'em1',
      notes: 'Speelt vaker mee',
      feeAmount: 75,
    });
  });

  it('stuurt een vergoeding van 0 mee in plaats van hem weg te laten', async () => {
    antwoordMet({ id: 'as1', message: '' });
    await inviteMusician('rr1', { externalMusicianId: 'em1', feeAmount: 0 });

    // 0 euro is een geldige afspraak en mag niet als "nog niets afgesproken"
    // bij de server aankomen.
    expect(laatsteVerzoek().body).toEqual({ externalMusicianId: 'em1', feeAmount: 0 });
  });

  it('laat een 409 door als de muzikant al uitgenodigd is', async () => {
    antwoordMetFout(409, { error: 'Muzikant is al uitgenodigd.' });

    await expect(inviteMusician('rr1', { externalMusicianId: 'em1' })).rejects.toMatchObject({
      response: { status: 409 },
    });
  });
});

describe('updateAssignment', () => {
  it('gebruikt PUT met aanvraag en toewijzing in het pad', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateAssignment('rr1', 'as1', { status: 'confirmed', notes: 'Bevestigd per mail', feeAmount: 90 });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/replacement-requests/rr1/assignments/as1');
    expect(verzoek.body).toEqual({ status: 'confirmed', notes: 'Bevestigd per mail', feeAmount: 90 });
  });

  it.each(['pending', 'confirmed', 'declined', 'completed', 'no_show'] as const)(
    'stuurt de status %s mee zoals de backend hem verwacht',
    async (status) => {
      antwoordMet({ message: '' });
      await updateAssignment('rr1', 'as1', { status });

      expect(laatsteVerzoek().body).toEqual({ status });
    },
  );

  it('kan notities en vergoeding wissen met null', async () => {
    antwoordMet({ message: '' });
    await updateAssignment('rr1', 'as1', { status: 'declined', notes: null, feeAmount: null });

    expect(laatsteVerzoek().body).toEqual({ status: 'declined', notes: null, feeAmount: null });
  });
});

// ===========================================
// SUGGESTIES
// ===========================================

describe('getReplacementSuggestions', () => {
  it('zet het evenement in het pad', async () => {
    antwoordMet([]);
    await getReplacementSuggestions('c1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('get');
    // Deze route staat in de backend voor /:id geregistreerd, dus 'suggestions'
    // hoort niet als aanvraag-id gelezen te worden.
    expect(verzoek.pad).toBe('/replacement-requests/suggestions/c1?');
    expect(verzoek.queryreeks).toBe('');
  });

  it('geeft het soort evenement mee als queryparameter', async () => {
    antwoordMet([]);
    await getReplacementSuggestions('c1', 'concert');

    expect(laatsteVerzoek().query.get('eventType')).toBe('concert');
    // Kanttekening: de backend leest deze parameter (nog) niet en filtert
    // alleen op eventId. Het meesturen is onschadelijk, maar wie op dit filter
    // rekent krijgt ook de suggesties van de andere soort te zien.
  });

  it('geeft de suggesties per aanvraag ongewijzigd door', async () => {
    const antwoord = [
      {
        request: {
          id: 'rr1',
          instrumentId: 'i1',
          instrumentName: 'Klarinet',
          positionsNeeded: 2,
          positionsFilled: 0,
          urgency: 'high',
        },
        suggestedMusicians: [
          {
            id: 'em1',
            firstName: 'Anna',
            lastName: 'de Vries',
            email: null,
            phone: null,
            musicianType: 'freelance',
            rating: 4,
            totalPerformances: 12,
            lastPlayedDate: '2026-01-10',
            skillLevel: 'advanced',
            isPrimary: true,
          },
        ],
      },
    ];
    antwoordMet(antwoord);

    await expect(getReplacementSuggestions('c1')).resolves.toEqual(antwoord);
  });

  it('geeft een lege lijst terug als er niets te suggereren valt', async () => {
    antwoordMet([]);
    await expect(getReplacementSuggestions('c1')).resolves.toEqual([]);
  });
});

// ===========================================
// ALGEMEEN GEDRAG
// ===========================================

describe('algemeen gedrag van de vervangingsaanvragen-api', () => {
  it('stuurt precies een verzoek per aanroep', async () => {
    antwoordMet([]);
    await getReplacementRequests();

    expect(alleVerzoeken()).toHaveLength(1);
  });

  it('geeft een leeg antwoordlichaam door als lege string', async () => {
    antwoordMet('', { status: 204 });

    await expect(cancelReplacementRequest('rr1')).resolves.toBe('');
  });

  it('laat een 500 door in plaats van undefined te leveren', async () => {
    antwoordMetFout(500, { error: 'Interne fout' });

    await expect(getReplacementRequests()).rejects.toMatchObject({ response: { status: 500 } });
  });
});
