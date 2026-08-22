/**
 * Tests voor de concerten-api.
 *
 * De functies in concerts.ts zetten een pad in elkaar, geven een body mee en
 * leveren `response.data` terug. Daarom wordt hier op het pad, de methode, de
 * body en de queryreeks getoetst - een typefout daarin geeft geen foutmelding
 * maar een leeg scherm. De routes zijn een voor een vergeleken met
 * backend/src/routes/concerts.ts (gemount op /api/concerts in index.ts).
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
  getConcertTypes,
  getAdminConcertTypes,
  createConcertType,
  updateConcertType,
  deleteConcertType,
  initDefaultConcertTypes,
  getConcertStatistics,
  getPieceHistory,
  getAttendancePrediction,
  getConcerts,
  getConcertYears,
  getConcert,
  createConcert,
  updateConcert,
  deleteConcert,
  addConcertProgramItem,
  updateConcertProgramItem,
  deleteConcertProgramItem,
  reorderConcertProgram,
  exportConcertProgram,
  exportBumaStemra,
  addConcertMedia,
  deleteConcertMedia,
  addConcertAttendance,
  addConcertAttendanceBulk,
  updateConcertAttendance,
  deleteConcertAttendance,
} from '../concerts';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

// ===========================================
// CONCERTSOORTEN
// ===========================================

describe('concertsoorten', () => {
  it('getConcertTypes bevraagt /concerts/types', async () => {
    antwoordMet({ concertTypes: [{ value: 'gala', label: 'Gala' }], mediaTypes: [] });
    const resultaat = await getConcertTypes();

    expect(laatsteVerzoek().methode).toBe('get');
    // /types en /concert-types zijn twee verschillende routes in de backend;
    // ze verwisselen levert een lege lijst op in plaats van een fout.
    expect(laatsteVerzoek().pad).toBe('/concerts/types');
    expect(resultaat.concertTypes).toHaveLength(1);
  });

  it('getAdminConcertTypes bevraagt /concerts/concert-types', async () => {
    antwoordMet({ types: [], defaults: [] });
    await getAdminConcertTypes();

    expect(laatsteVerzoek().pad).toBe('/concerts/concert-types');
  });

  it('createConcertType stuurt waarde, label en volgorde als body', async () => {
    antwoordMet({ id: 'ct1', message: 'Aangemaakt' });
    await createConcertType('gala', 'Galaconcert', 3);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/concerts/concert-types');
    expect(verzoek.body).toEqual({ value: 'gala', label: 'Galaconcert', sortOrder: 3 });
  });

  it('createConcertType laat sortOrder weg als die niet is opgegeven', async () => {
    antwoordMet({ id: 'ct1', message: '' });
    await createConcertType('gala', 'Galaconcert');

    // undefined verdwijnt bij het omzetten naar JSON; de backend vult zelf aan.
    expect(laatsteVerzoek().body).toEqual({ value: 'gala', label: 'Galaconcert' });
  });

  it('updateConcertType gebruikt PUT met het id in het pad', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateConcertType('ct1', { label: 'Nieuw label' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/concerts/concert-types/ct1');
    expect(verzoek.body).toEqual({ label: 'Nieuw label' });
  });

  it('updateConcertType stuurt sortOrder 0 mee in plaats van hem weg te laten', async () => {
    antwoordMet({ message: '' });
    await updateConcertType('ct1', { sortOrder: 0 });

    expect(laatsteVerzoek().body).toEqual({ sortOrder: 0 });
  });

  it('deleteConcertType verwijdert via DELETE', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteConcertType('ct1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/concerts/concert-types/ct1');
  });

  it('initDefaultConcertTypes post op de init-defaults-route zonder body', async () => {
    antwoordMet({ message: 'Standaardsoorten toegevoegd' });
    await initDefaultConcertTypes();

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/concerts/concert-types/init-defaults');
    expect(verzoek.body).toBeUndefined();
  });

  it('laat een 403 door wanneer iemand zonder beheerrecht een soort verwijdert', async () => {
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(deleteConcertType('ct1')).rejects.toMatchObject({ response: { status: 403 } });
  });
});

// ===========================================
// OVERZICHTEN EN STATISTIEK
// ===========================================

describe('overzichtsroutes', () => {
  it('getConcertStatistics bevraagt /concerts/statistics', async () => {
    antwoordMet({ totalConcerts: 12 });
    await getConcertStatistics();

    expect(laatsteVerzoek().pad).toBe('/concerts/statistics');
  });

  it('getConcertYears bevraagt /concerts/years', async () => {
    antwoordMet(['2026', '2025']);
    const jaren = await getConcertYears();

    expect(laatsteVerzoek().pad).toBe('/concerts/years');
    expect(jaren).toEqual(['2026', '2025']);
  });

  it('getConcertYears geeft een lege lijst terug als er nog geen concerten zijn', async () => {
    antwoordMet([]);
    await expect(getConcertYears()).resolves.toEqual([]);
  });

  it('getAttendancePrediction bevraagt de voorspelroute van het concert', async () => {
    antwoordMet({ concert: { id: 'c1' }, prediction: {}, members: [] });
    await getAttendancePrediction('c1');

    expect(laatsteVerzoek().pad).toBe('/concerts/c1/attendance-prediction');
  });

  it('getAttendancePrediction geeft het geneste antwoord ongewijzigd door', async () => {
    const antwoord = {
      concert: { id: 'c1', name: 'Slotconcert', date: '2026-06-01', concertType: 'gala', location: 'Kerk' },
      prediction: {
        expectedAttendance: 42,
        totalMembers: 60,
        confidenceBreakdown: { highConfidenceYes: 30, highConfidenceNo: 10, uncertain: 20 },
        byInstrument: [{ instrument: 'Trompet', expected: 4, total: 5 }],
      },
      members: [],
    };
    antwoordMet(antwoord);

    await expect(getAttendancePrediction('c1')).resolves.toEqual(antwoord);
  });
});

describe('getPieceHistory', () => {
  it('zet de titel gecodeerd in het pad', async () => {
    antwoordMet({ title: 'Also sprach Zarathustra', performances: [] });
    await getPieceHistory('Also sprach Zarathustra');

    // Spaties moeten gecodeerd zijn, anders bouwt axios een ongeldig adres.
    expect(laatsteVerzoek().pad).toBe('/concerts/piece-history/Also%20sprach%20Zarathustra');
  });

  it('codeert een schuine streep zodat die geen extra padsegment wordt', async () => {
    antwoordMet({ performances: [] });
    await getPieceHistory('Mars/Trio');

    // Zonder codering leest express dit als /piece-history/Mars/Trio en die
    // route bestaat niet - de gebruiker ziet dan een lege pagina.
    expect(laatsteVerzoek().pad).toBe('/concerts/piece-history/Mars%2FTrio');
    expect(laatsteVerzoek().pad).not.toContain('Mars/Trio');
  });

  it('codeert een vraagteken zodat het geen queryreeks wordt', async () => {
    antwoordMet({ performances: [] });
    await getPieceHistory('Wie is er bang?');

    expect(laatsteVerzoek().queryreeks).toBe('');
    expect(laatsteVerzoek().pad).toContain('%3F');
  });
});

// ===========================================
// CONCERTEN
// ===========================================

describe('getConcerts', () => {
  it('zet de filters in de queryreeks', async () => {
    antwoordMet({ data: [], total: 0, page: 1, limit: 20 });
    await getConcerts({ search: 'lente', year: '2026', concertType: 'gala' });

    const { pad, query } = laatsteVerzoek();
    expect(pad).toBe('/concerts');
    expect(query.get('search')).toBe('lente');
    expect(query.get('year')).toBe('2026');
    expect(query.get('concertType')).toBe('gala');
  });

  it('stuurt geen queryreeks mee zonder filters', async () => {
    antwoordMet({ data: [], total: 0, page: 1, limit: 20 });
    await getConcerts();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('laat een filter dat niet is ingevuld weg uit de queryreeks', async () => {
    antwoordMet({ data: [], total: 0, page: 1, limit: 20 });
    await getConcerts({ search: 'lente', year: undefined });

    expect(laatsteVerzoek().queryreeks).toBe('search=lente');
  });

  it('codeert een zoekterm met een ampersand en een spatie', async () => {
    antwoordMet({ data: [], total: 0, page: 1, limit: 20 });
    await getConcerts({ search: 'Jan & Piet' });

    const { queryreeks, query } = laatsteVerzoek();
    expect(queryreeks).not.toContain('& Piet');
    expect(query.get('search')).toBe('Jan & Piet');
  });

  it('geeft de paginering ongewijzigd terug', async () => {
    antwoordMet({ data: [{ id: 'c1' }], total: 1, page: 2, limit: 10 });
    const resultaat = await getConcerts();

    expect(resultaat).toEqual({ data: [{ id: 'c1' }], total: 1, page: 2, limit: 10 });
  });
});

describe('getConcert', () => {
  it('haalt een concert op via /concerts/:id', async () => {
    antwoordMet({ id: 'c1', name: 'Nieuwjaarsconcert' });
    const concert = await getConcert('c1');

    expect(laatsteVerzoek().pad).toBe('/concerts/c1');
    expect(concert.name).toBe('Nieuwjaarsconcert');
  });

  it('laat een 404 door in plaats van hem als leeg resultaat te verpakken', async () => {
    antwoordMetFout(404, { error: 'Concert niet gevonden.' });

    await expect(getConcert('bestaat-niet')).rejects.toMatchObject({
      response: { status: 404, data: { error: 'Concert niet gevonden.' } },
    });
  });

  it('werpt bij een netwerkfout zonder respons', async () => {
    antwoordMetNetwerkfout();

    await expect(getConcert('c1')).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('werpt als het verzoek in de tijdslimiet loopt', async () => {
    antwoordMetTijdslimiet();

    await expect(getConcert('c1')).rejects.toMatchObject({ code: 'ECONNABORTED' });
  });
});

describe('createConcert', () => {
  it('post het concert naar /concerts en geeft het nieuwe id terug', async () => {
    antwoordMet({ id: 'c9' });

    const resultaat = await createConcert({
      name: 'Zomerconcert',
      date: '2026-07-04',
      endDate: '2026-07-05',
      location: 'Markt',
      venueType: 'outdoor',
      concertType: 'gala',
      description: 'Buitenconcert',
      notes: 'Regenplan',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/concerts');
    expect(verzoek.body).toEqual({
      name: 'Zomerconcert',
      date: '2026-07-04',
      endDate: '2026-07-05',
      location: 'Markt',
      venueType: 'outdoor',
      concertType: 'gala',
      description: 'Buitenconcert',
      notes: 'Regenplan',
    });
    expect(resultaat.id).toBe('c9');
  });

  it('stuurt alleen de ingevulde velden mee', async () => {
    antwoordMet({ id: 'c9' });
    await createConcert({ name: 'Kort', date: '2026-07-04' });

    const body = laatsteVerzoek().body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['date', 'name']);
  });

  it('geeft een validatiefout van de server door', async () => {
    antwoordMetFout(400, { error: 'Naam is verplicht.' });

    await expect(createConcert({ name: '', date: '2026-07-04' })).rejects.toMatchObject({
      response: { status: 400, data: { error: 'Naam is verplicht.' } },
    });
  });
});

describe('updateConcert', () => {
  it('gebruikt PUT op /concerts/:id', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateConcert('c1', { name: 'Andere naam' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/concerts/c1');
    expect(verzoek.body).toEqual({ name: 'Andere naam' });
  });

  it('levert niets op maar valt ook niet over een leeg antwoord', async () => {
    antwoordMet('', { status: 204 });

    await expect(updateConcert('c1', {})).resolves.toBeUndefined();
  });
});

describe('deleteConcert', () => {
  it('verwijdert een concert', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteConcert('c1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1');
  });

  it('laat een 404 door zodat de pagina de melding kan tonen', async () => {
    antwoordMetFout(404, { error: 'Concert niet gevonden.' });

    await expect(deleteConcert('c1')).rejects.toMatchObject({ response: { status: 404 } });
  });
});

// ===========================================
// PROGRAMMA
// ===========================================

describe('programma-onderdelen', () => {
  it('addConcertProgramItem post op /concerts/:id/program', async () => {
    antwoordMet({ id: 'p1' });

    await addConcertProgramItem('c1', {
      musicTitleId: 'm1',
      title: 'Ouverture',
      composer: 'Rossini',
      arranger: 'Jansen',
      sortOrder: 1,
      notes: 'Met herhaling',
      partOfSet: 'Deel 1',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/concerts/c1/program');
    expect(verzoek.body).toMatchObject({ musicTitleId: 'm1', title: 'Ouverture', composer: 'Rossini' });
  });

  it('addConcertProgramItem stuurt musicTitleId expliciet als null mee', async () => {
    antwoordMet({ id: 'p1' });
    await addConcertProgramItem('c1', { musicTitleId: null, title: 'Los stuk' });

    // null blijft bij het omzetten naar JSON staan; zo weet de backend dat er
    // bewust geen bibliotheekstuk aan hangt.
    expect(laatsteVerzoek().body).toEqual({ musicTitleId: null, title: 'Los stuk' });
  });

  it('updateConcertProgramItem gebruikt PUT met concert en programma-onderdeel in het pad', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateConcertProgramItem('c1', 'p1', { title: 'Nieuwe titel' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/concerts/c1/program/p1');
    expect(verzoek.body).toEqual({ title: 'Nieuwe titel' });
  });

  it('deleteConcertProgramItem verwijdert het juiste onderdeel', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteConcertProgramItem('c1', 'p1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/program/p1');
  });

  it('reorderConcertProgram stuurt de items onder de sleutel items', async () => {
    antwoordMet({ message: 'Volgorde bijgewerkt.' });
    await reorderConcertProgram('c1', [
      { id: 'p1', sortOrder: 2 },
      { id: 'p2', sortOrder: 1 },
    ]);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    // De backend registreert /reorder voor /:programId, dus dit vaste pad hoort
    // niet als programma-id gelezen te worden.
    expect(verzoek.pad).toBe('/concerts/c1/program/reorder');
    // De backend leest req.body.items en eist een array.
    expect(verzoek.body).toEqual({
      items: [
        { id: 'p1', sortOrder: 2 },
        { id: 'p2', sortOrder: 1 },
      ],
    });
  });

  it('reorderConcertProgram stuurt een lege lijst als er niets te ordenen valt', async () => {
    antwoordMet({ message: '' });
    await reorderConcertProgram('c1', []);

    expect(laatsteVerzoek().body).toEqual({ items: [] });
  });

  it('exportConcertProgram vraagt het programma als tekst op', async () => {
    antwoordMet('Ouverture;Rossini');
    const tekst = await exportConcertProgram('c1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/concerts/c1/program/export');
    expect(verzoek.responseType).toBe('text');
    expect(tekst).toBe('Ouverture;Rossini');
  });
});

describe('exportBumaStemra', () => {
  it('stuurt de periode als queryparameters en vraagt tekst terug', async () => {
    antwoordMet('Concert,Datum');
    await exportBumaStemra({ startDate: '2026-01-01', endDate: '2026-12-31' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/concerts/buma-stemra-export');
    expect(verzoek.responseType).toBe('text');
    expect(verzoek.query.get('startDate')).toBe('2026-01-01');
    expect(verzoek.query.get('endDate')).toBe('2026-12-31');
  });

  it('geeft een lege export terug als lege string in plaats van te vallen', async () => {
    antwoordMet('');

    await expect(exportBumaStemra({ startDate: '2026-01-01', endDate: '2026-01-02' })).resolves.toBe('');
  });
});

// ===========================================
// MEDIA EN AANWEZIGHEID
// ===========================================

describe('media', () => {
  it('addConcertMedia post op /concerts/:id/media', async () => {
    antwoordMet({ id: 'md1' });
    await addConcertMedia('c1', { mediaType: 'photo', url: 'https://foto.example/1', description: 'Groepsfoto' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/concerts/c1/media');
    expect(verzoek.body).toEqual({
      mediaType: 'photo',
      url: 'https://foto.example/1',
      description: 'Groepsfoto',
    });
  });

  it('deleteConcertMedia verwijdert een mediabestand van het concert', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteConcertMedia('c1', 'md1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/media/md1');
  });
});

describe('aanwezigheid', () => {
  it('addConcertAttendance post een deelnemer', async () => {
    antwoordMet({ id: 'a1' });
    await addConcertAttendance('c1', {
      userId: 'u1',
      memberName: 'Jan Jansen',
      instrumentPlayed: 'Trompet',
      notes: 'Invaller',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/concerts/c1/attendance');
    expect(verzoek.body).toEqual({
      userId: 'u1',
      memberName: 'Jan Jansen',
      instrumentPlayed: 'Trompet',
      notes: 'Invaller',
    });
  });

  it('addConcertAttendance stuurt userId als null voor een gast zonder account', async () => {
    antwoordMet({ id: 'a1' });
    await addConcertAttendance('c1', { userId: null, memberName: 'Gast' });

    expect(laatsteVerzoek().body).toEqual({ userId: null, memberName: 'Gast' });
  });

  it('addConcertAttendanceBulk stuurt de gebruikers onder de sleutel userIds', async () => {
    antwoordMet({ ids: ['a1', 'a2'], count: 2 });
    const resultaat = await addConcertAttendanceBulk('c1', ['u1', 'u2']);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/concerts/c1/attendance/bulk');
    // De backend leest req.body.userIds en weigert alles wat geen array is.
    expect(verzoek.body).toEqual({ userIds: ['u1', 'u2'] });
    expect(resultaat.count).toBe(2);
  });

  it('addConcertAttendanceBulk laat de 400 door bij een lege selectie', async () => {
    antwoordMetFout(400, { error: 'userIds array is verplicht.' });

    await expect(addConcertAttendanceBulk('c1', [])).rejects.toMatchObject({
      response: { status: 400, data: { error: 'userIds array is verplicht.' } },
    });
  });

  it('updateConcertAttendance gebruikt PUT met beide ids in het pad', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateConcertAttendance('c1', 'a1', { instrumentPlayed: 'Hoorn' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/concerts/c1/attendance/a1');
    expect(verzoek.body).toEqual({ instrumentPlayed: 'Hoorn' });
  });

  it('deleteConcertAttendance verwijdert de juiste registratie', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteConcertAttendance('c1', 'a1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/concerts/c1/attendance/a1');
  });
});

// ===========================================
// ALGEMEEN GEDRAG
// ===========================================

describe('algemeen gedrag van de concerten-api', () => {
  it('stuurt precies een verzoek per aanroep', async () => {
    antwoordMet([]);
    await getConcertYears();

    expect(alleVerzoeken()).toHaveLength(1);
  });

  it('geeft null door zoals het binnenkomt', async () => {
    antwoordMet(null);

    await expect(getConcert('c1')).resolves.toBeNull();
  });

  it('laat een 500 door in plaats van undefined te leveren', async () => {
    antwoordMetFout(500, { error: 'Interne fout' });

    await expect(getConcertStatistics()).rejects.toMatchObject({ response: { status: 500 } });
  });
});
