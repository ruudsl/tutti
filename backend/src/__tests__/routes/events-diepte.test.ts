/**
 * Evenementen: de delen die events.test.ts en events-grenzen.test.ts nog niet
 * raakten.
 *
 * Die twee bestanden dekken het aanmaken, de dagindeling in grote lijnen, en
 * vier eerder gevonden gaten in de verenigingsgrens. Wat overbleef is het
 * meeste werk: de filters op de lijsten, de locaties, het vervoer met zijn
 * passagiers, de verzamelpunten, de paklijsten en hun sjablonen, het
 * aanmelden, en het weerbericht.
 *
 * Twee dingen komen steeds terug. Ten eerste de verenigingsgrens: bijna elke
 * route hangt aan een evenement, en een evenement van een andere vereniging
 * hoort een 404 te geven en niets te veranderen. Ten tweede de rol: 'board' en
 * 'admin' mogen beheren, een gewoon lid niet, en verwijderen mag alleen de
 * beheerder.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import eventsRoutes from '../../routes/events';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestUser,
  createTestOrchestra,
  createTestInstrument,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/events', eventsRoutes);
app.use(errorHandler);

let vereniging: TestAssociation;
let beheerder: TestUser;
let beheerderToken: string;
let lid: TestUser;
let lidToken: string;
let bestuurToken: string;

let andereVereniging: TestAssociation;
let andereBeheerder: TestUser;
let andereBeheerderToken: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  vereniging = omgeving.association;
  beheerder = omgeving.adminUser;
  beheerderToken = omgeving.adminToken;
  lid = omgeving.memberUser;
  lidToken = omgeving.memberToken;

  // 'board' zit niet in de rollen van de testhulp, maar de routes kennen hem
  // wel: bijna alles mag door 'board' of 'admin', verwijderen alleen door
  // 'admin'.
  const bestuurslid = createTestUser(vereniging.id, {
    email: 'bestuur@test.local',
    firstName: 'Bestuur',
    lastName: 'Lid',
    role: 'board' as any,
  });
  bestuurToken = generateTestToken(bestuurslid);

  andereVereniging = createTestAssociation({ name: 'Fanfare Elders' });
  andereBeheerder = createTestUser(andereVereniging.id, {
    email: 'beheerder@elders.test',
    firstName: 'Elders',
    lastName: 'Beheerder',
    role: 'admin',
  });
  andereBeheerderToken = generateTestToken(andereBeheerder);
});

type Methode = 'get' | 'post' | 'put' | 'delete';

const met = (token: string) => (methode: Methode, pad: string) =>
  request(app)[methode](`/api/events${pad}`).set('Authorization', `Bearer ${token}`);

const alsBeheerder = (methode: Methode, pad: string) => met(beheerderToken)(methode, pad);
const alsLid = (methode: Methode, pad: string) => met(lidToken)(methode, pad);
const alsBestuur = (methode: Methode, pad: string) => met(bestuurToken)(methode, pad);
const alsVreemde = (methode: Methode, pad: string) => met(andereBeheerderToken)(methode, pad);

/** Zet een evenement rechtstreeks in de database, ook voor een andere vereniging. */
function maakEvenementIn(
  associationId: string,
  createdBy: string | null,
  overschrijf: Partial<{
    id: string;
    name: string;
    startDatetime: string;
    status: string;
    eventType: string;
    city: string;
    latitude: number;
    longitude: number;
    locationId: string;
  }> = {},
): string {
  const id = overschrijf.id ?? uuidv4();
  db.prepare(
    `INSERT INTO events (id, association_id, name, start_datetime, status, event_type, city, latitude, longitude, location_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    associationId,
    overschrijf.name ?? 'Testevenement',
    overschrijf.startDatetime ?? '2026-07-15T19:00:00.000Z',
    overschrijf.status ?? 'planned',
    overschrijf.eventType ?? 'performance',
    overschrijf.city ?? 'Utrecht',
    overschrijf.latitude ?? null,
    overschrijf.longitude ?? null,
    overschrijf.locationId ?? null,
    createdBy,
  );
  return id;
}

function maakLocatieIn(associationId: string, overschrijf: Partial<{ name: string; latitude: number }> = {}): string {
  const id = uuidv4();
  db.prepare('INSERT INTO event_locations (id, association_id, name, latitude, longitude) VALUES (?, ?, ?, ?, ?)').run(
    id,
    associationId,
    overschrijf.name ?? 'Muziekkoepel',
    overschrijf.latitude ?? null,
    overschrijf.latitude === undefined ? null : 5.12,
  );
  return id;
}

// ===========================================
// LOCATIES
// ===========================================

describe('locaties', () => {
  async function maakLocatie(overschrijf: Record<string, unknown> = {}) {
    const res = await alsBeheerder('post', '/locations').send({ name: 'Muziekkoepel', ...overschrijf });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it('filtert op zoekterm, soort en favoriet', async () => {
    await maakLocatie({ name: 'Muziekkoepel', city: 'Utrecht', venueType: 'park', isFavorite: true });
    await maakLocatie({ name: 'Dorpshuis', city: 'Zeist', venueType: 'hall' });
    await maakLocatie({ name: 'Kerkzaal', address: 'Kerkstraat 1', venueType: 'hall' });

    const opNaam = await alsLid('get', '/locations?search=koepel');
    expect(opNaam.status).toBe(200);
    expect(opNaam.body.data).toHaveLength(1);

    const opAdres = await alsLid('get', '/locations?search=Kerkstraat');
    expect(opAdres.body.data).toHaveLength(1);
    expect(opAdres.body.data[0].name).toBe('Kerkzaal');

    const opStad = await alsLid('get', '/locations?search=Zeist');
    expect(opStad.body.data).toHaveLength(1);

    const opSoort = await alsLid('get', '/locations?venueType=hall');
    expect(opSoort.body.data).toHaveLength(2);

    const favorieten = await alsLid('get', '/locations?isFavorite=true');
    expect(favorieten.body.data).toHaveLength(1);
    expect(favorieten.body.data[0].isFavorite).toBe(true);
  });

  it('zet de favorieten bovenaan', async () => {
    await maakLocatie({ name: 'Aula' });
    await maakLocatie({ name: 'Zomerpodium', isFavorite: true });

    const res = await alsLid('get', '/locations');
    expect(res.body.data.map((l: any) => l.name)).toEqual(['Zomerpodium', 'Aula']);
  });

  it('toont de locatie van een andere vereniging niet', async () => {
    const elders = maakLocatieIn(andereVereniging.id, { name: 'Zaal van elders' });

    const detail = await alsLid('get', `/locations/${elders}`);
    expect(detail.status).toBe(404);

    const lijst = await alsLid('get', '/locations');
    expect(lijst.body.data).toHaveLength(0);
  });

  it('bewaart de voorzieningen als vlaggen', async () => {
    const id = await maakLocatie({
      name: 'Dorpshuis',
      capacity: 250,
      indoorOutdoor: 'indoor',
      hasElectricity: true,
      hasChangingRooms: true,
      hasStorage: false,
      hasCatering: true,
      hasParking: false,
      contactEmail: 'zaal@voorbeeld.test',
    });

    const res = await alsLid('get', `/locations/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      capacity: 250,
      indoorOutdoor: 'indoor',
      hasElectricity: true,
      hasChangingRooms: true,
      hasStorage: false,
      hasCatering: true,
      hasParking: false,
      contactEmail: 'zaal@voorbeeld.test',
    });
  });

  it('weigert een onbruikbaar contactadres en een onbekende binnen-of-buitenwaarde', async () => {
    const slechtAdres = await alsBeheerder('post', '/locations').send({ name: 'Zaal', contactEmail: 'geen adres' });
    expect(slechtAdres.status).toBe(400);

    const slechteSoort = await alsBeheerder('post', '/locations').send({ name: 'Zaal', indoorOutdoor: 'ondergronds' });
    expect(slechteSoort.status).toBe(400);

    // Een leeg adres mag wel: dat is het formulier dat niets invulde.
    const leegAdres = await alsBeheerder('post', '/locations').send({ name: 'Zaal', contactEmail: '' });
    expect(leegAdres.status).toBe(201);
  });

  it('laat een gewoon lid geen locatie aanmaken of wijzigen', async () => {
    const id = await maakLocatie();

    const aanmaken = await alsLid('post', '/locations').send({ name: 'Stiekem' });
    expect(aanmaken.status).toBe(403);

    const wijzigen = await alsLid('put', `/locations/${id}`).send({ name: 'Stiekem' });
    expect(wijzigen.status).toBe(403);
  });

  it('wijzigt de locatie van een andere vereniging niet', async () => {
    const elders = maakLocatieIn(andereVereniging.id, { name: 'Zaal van elders' });

    const res = await alsBeheerder('put', `/locations/${elders}`).send({ name: 'Gekaapt' });
    expect(res.status).toBe(404);

    const rij = db.prepare('SELECT name FROM event_locations WHERE id = ?').get(elders) as any;
    expect(rij.name).toBe('Zaal van elders');
  });

  it('laat velden die niet worden meegestuurd staan', async () => {
    const id = await maakLocatie({ name: 'Dorpshuis', city: 'Zeist', capacity: 100 });

    const res = await alsBestuur('put', `/locations/${id}`).send({ capacity: 150 });
    expect(res.status).toBe(200);

    const detail = await alsLid('get', `/locations/${id}`);
    expect(detail.body).toMatchObject({ name: 'Dorpshuis', city: 'Zeist', capacity: 150 });
  });

  it('verandert niets als het verzoek geen enkel bekend veld bevat', async () => {
    const id = await maakLocatie({ name: 'Dorpshuis' });

    const res = await alsBeheerder('put', `/locations/${id}`).send({ onbekendVeld: 'iets' });
    expect(res.status).toBe(200);

    const detail = await alsLid('get', `/locations/${id}`);
    expect(detail.body.name).toBe('Dorpshuis');
  });

  it('laat alleen de beheerder een locatie verwijderen', async () => {
    const id = await maakLocatie();

    const doorBestuur = await alsBestuur('delete', `/locations/${id}`);
    expect(doorBestuur.status).toBe(403);

    const vreemd = await alsVreemde('delete', `/locations/${id}`);
    expect(vreemd.status).toBe(404);

    const eigen = await alsBeheerder('delete', `/locations/${id}`);
    expect(eigen.status).toBe(200);

    const nogmaals = await alsBeheerder('delete', `/locations/${id}`);
    expect(nogmaals.status).toBe(404);
  });
});

// ===========================================
// EVENEMENTENLIJST EN DETAIL
// ===========================================

describe('evenementenlijst', () => {
  it('filtert op zoekterm, stand, soort en periode', async () => {
    maakEvenementIn(vereniging.id, beheerder.id, {
      name: 'Zomerconcert',
      startDatetime: '2026-07-15T19:00:00.000Z',
      status: 'confirmed',
      eventType: 'performance',
      city: 'Utrecht',
    });
    maakEvenementIn(vereniging.id, beheerder.id, {
      name: 'Kerstmarkt',
      startDatetime: '2026-12-10T15:00:00.000Z',
      status: 'planned',
      eventType: 'market',
      city: 'Zeist',
    });
    maakEvenementIn(andereVereniging.id, andereBeheerder.id, { name: 'Van elders' });

    const opNaam = await alsLid('get', '/?search=Zomer');
    expect(opNaam.status).toBe(200);
    expect(opNaam.body.data).toHaveLength(1);

    const opStad = await alsLid('get', '/?search=Zeist');
    expect(opStad.body.data).toHaveLength(1);
    expect(opStad.body.data[0].name).toBe('Kerstmarkt');

    const opStand = await alsLid('get', '/?status=confirmed');
    expect(opStand.body.data).toHaveLength(1);

    const opSoort = await alsLid('get', '/?eventType=market');
    expect(opSoort.body.data).toHaveLength(1);

    const inPeriode = await alsLid('get', '/?from=2026-07-01&to=2026-08-01');
    expect(inPeriode.body.data).toHaveLength(1);
    expect(inPeriode.body.data[0].name).toBe('Zomerconcert');

    // De vereniging hiernaast blijft buiten elke uitkomst.
    const alles = await alsLid('get', '/');
    expect(alles.body.data.map((e: any) => e.name)).not.toContain('Van elders');
  });

  it('toont met upcoming alleen wat nog moet komen', async () => {
    maakEvenementIn(vereniging.id, beheerder.id, { name: 'Vorig jaar', startDatetime: '2019-03-01T19:00:00.000Z' });
    maakEvenementIn(vereniging.id, beheerder.id, { name: 'Straks', startDatetime: '2035-03-01T19:00:00.000Z' });

    const res = await alsLid('get', '/?upcoming=true');
    expect(res.status).toBe(200);
    expect(res.body.data.map((e: any) => e.name)).toEqual(['Straks']);
  });

  it('telt de aanmeldingen per evenement mee en noemt de orkesten', async () => {
    const orkest = createTestOrchestra(vereniging.id, { name: 'Harmonie' });

    const gemaakt = await alsBeheerder('post', '/').send({
      name: 'Zomerconcert',
      startDatetime: '2026-07-15T19:00:00.000Z',
      orchestraIds: [orkest.id],
    });
    expect(gemaakt.status).toBe(201);

    await alsLid('post', `/${gemaakt.body.id}/attendance`).send({ status: 'attending' });
    await alsBeheerder('post', `/${gemaakt.body.id}/attendance`).send({ status: 'not_attending' });

    const res = await alsLid('get', '/');
    const rij = res.body.data.find((e: any) => e.id === gemaakt.body.id);
    expect(rij.attendingCount).toBe(1);
    expect(rij.notAttendingCount).toBe(1);
    expect(rij.orchestras).toEqual([{ id: orkest.id, name: 'Harmonie' }]);
  });

  it('geeft een lege orkestlijst bij een evenement zonder orkesten', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);

    const res = await alsLid('get', '/');
    const rij = res.body.data.find((e: any) => e.id === id);
    expect(rij.orchestras).toEqual([]);
  });
});

describe('evenementdetail', () => {
  it('vult de locatienaam en het uitwijkadres aan vanuit de locatietabel', async () => {
    const hoofd = maakLocatieIn(vereniging.id, { name: 'Muziekkoepel' });
    const uitwijk = maakLocatieIn(vereniging.id, { name: 'Dorpshuis' });

    const gemaakt = await alsBeheerder('post', '/').send({
      name: 'Zomerconcert',
      startDatetime: '2026-07-15T19:00:00.000Z',
      locationId: hoofd,
      backupLocationId: uitwijk,
      weatherSensitive: true,
    });
    expect(gemaakt.status).toBe(201);

    const res = await alsLid('get', `/${gemaakt.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.locationName).toBe('Muziekkoepel');
    expect(res.body.backupLocationName).toBe('Dorpshuis');
    expect(res.body.weatherSensitive).toBe(true);
  });

  it('geeft de aanmeldingen en de eigen aanmelding apart terug', async () => {
    const trompet = createTestInstrument({ name: 'Trompet' });
    const id = maakEvenementIn(vereniging.id, beheerder.id);

    await alsLid('post', `/${id}/attendance`).send({
      status: 'attending',
      instrumentId: trompet.id,
      transportNeeded: true,
      notes: 'Kom met de trein',
    });

    const alsAnder = await alsBeheerder('get', `/${id}`);
    expect(alsAnder.body.attendance).toHaveLength(1);
    expect(alsAnder.body.attendance[0]).toMatchObject({
      userId: lid.id,
      userName: `${lid.firstName} ${lid.lastName}`,
      status: 'attending',
      instrumentName: 'Trompet',
      transportNeeded: true,
      notes: 'Kom met de trein',
    });
    // De beheerder heeft zelf niet gereageerd.
    expect(alsAnder.body.myAttendance).toBeNull();

    const alsIkzelf = await alsLid('get', `/${id}`);
    expect(alsIkzelf.body.myAttendance).toMatchObject({ status: 'attending', transportNeeded: true });
  });

  it('geeft de orkesten met hun volgorde', async () => {
    const eerste = createTestOrchestra(vereniging.id, { name: 'Harmonie' });
    const tweede = createTestOrchestra(vereniging.id, { name: 'Slagwerkgroep' });

    const gemaakt = await alsBeheerder('post', '/').send({
      name: 'Dubbelconcert',
      startDatetime: '2026-07-15T19:00:00.000Z',
      orchestraIds: [tweede.id, eerste.id],
    });

    const res = await alsLid('get', `/${gemaakt.body.id}`);
    expect(res.body.orchestras.map((o: any) => o.name)).toEqual(['Slagwerkgroep', 'Harmonie']);
    expect(res.body.orchestras.map((o: any) => o.performanceOrder)).toEqual([0, 1]);
  });
});

describe('evenement wijzigen en verwijderen', () => {
  it('vervangt de orkestlijst en kan hem leegmaken', async () => {
    const eerste = createTestOrchestra(vereniging.id, { name: 'Harmonie' });
    const tweede = createTestOrchestra(vereniging.id, { name: 'Slagwerkgroep' });

    const gemaakt = await alsBeheerder('post', '/').send({
      name: 'Zomerconcert',
      startDatetime: '2026-07-15T19:00:00.000Z',
      orchestraIds: [eerste.id],
    });

    const vervang = await alsBeheerder('put', `/${gemaakt.body.id}`).send({ orchestraIds: [tweede.id] });
    expect(vervang.status).toBe(200);

    const na = await alsLid('get', `/${gemaakt.body.id}`);
    expect(na.body.orchestras.map((o: any) => o.name)).toEqual(['Slagwerkgroep']);

    const leeg = await alsBeheerder('put', `/${gemaakt.body.id}`).send({ orchestraIds: [] });
    expect(leeg.status).toBe(200);

    const leegNa = await alsLid('get', `/${gemaakt.body.id}`);
    expect(leegNa.body.orchestras).toEqual([]);
  });

  it('laat de orkestlijst met rust als het verzoek hem niet noemt', async () => {
    const orkest = createTestOrchestra(vereniging.id, { name: 'Harmonie' });
    const gemaakt = await alsBeheerder('post', '/').send({
      name: 'Zomerconcert',
      startDatetime: '2026-07-15T19:00:00.000Z',
      orchestraIds: [orkest.id],
    });

    const res = await alsBeheerder('put', `/${gemaakt.body.id}`).send({ name: 'Nieuwe naam' });
    expect(res.status).toBe(200);

    const na = await alsLid('get', `/${gemaakt.body.id}`);
    expect(na.body.name).toBe('Nieuwe naam');
    expect(na.body.orchestras).toHaveLength(1);
  });

  it('wijzigt het evenement van een andere vereniging niet', async () => {
    const elders = maakEvenementIn(andereVereniging.id, andereBeheerder.id, { name: 'Van elders' });

    const res = await alsBeheerder('put', `/${elders}`).send({ name: 'Gekaapt' });
    expect(res.status).toBe(404);

    const rij = db.prepare('SELECT name FROM events WHERE id = ?').get(elders) as any;
    expect(rij.name).toBe('Van elders');
  });

  it('weigert een onbekende stand bij het wijzigen', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);
    const res = await alsBeheerder('put', `/${id}`).send({ status: 'misschien-wel' });
    expect(res.status).toBe(400);
  });

  it('laat het bestuur wel wijzigen maar niet verwijderen', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);

    const wijzig = await alsBestuur('put', `/${id}`).send({ description: 'Aantekening' });
    expect(wijzig.status).toBe(200);

    const verwijder = await alsBestuur('delete', `/${id}`);
    expect(verwijder.status).toBe(403);
  });
});

// ===========================================
// DAGINDELING
// ===========================================

describe('dagindeling', () => {
  it('geeft 404 bij een evenement van een andere vereniging', async () => {
    const elders = maakEvenementIn(andereVereniging.id, andereBeheerder.id);

    const lezen = await alsBeheerder('get', `/${elders}/schedule`);
    expect(lezen.status).toBe(404);

    const schrijven = await alsBeheerder('post', `/${elders}/schedule`).send({
      title: 'Ingeslopen',
      startTime: '18:00',
    });
    expect(schrijven.status).toBe(404);
  });

  it('sorteert op begintijd en noemt de verantwoordelijke bij naam', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);

    await alsBeheerder('post', `/${id}/schedule`).send({ title: 'Optreden', startTime: '20:00' });
    await alsBeheerder('post', `/${id}/schedule`).send({
      title: 'Opbouw',
      startTime: '17:00',
      responsibleUserId: lid.id,
      itemType: 'setup',
    });
    await alsBeheerder('post', `/${id}/schedule`).send({
      title: 'Soundcheck',
      startTime: '18:30',
      responsibleName: 'De geluidsman',
    });

    const res = await alsLid('get', `/${id}/schedule`);
    expect(res.status).toBe(200);
    expect(res.body.map((i: any) => i.title)).toEqual(['Opbouw', 'Soundcheck', 'Optreden']);
    expect(res.body[0].responsibleName).toBe(`${lid.firstName} ${lid.lastName}`);
    expect(res.body[0].itemType).toBe('setup');
    // Een losse naam wint van de koppeling die er niet is.
    expect(res.body[1].responsibleName).toBe('De geluidsman');
    // Zonder opgave valt het soort terug op 'general'.
    expect(res.body[2].itemType).toBe('general');
  });

  it('wijzigt een onderdeel en laat de rest staan', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);
    const gemaakt = await alsBeheerder('post', `/${id}/schedule`).send({
      title: 'Opbouw',
      startTime: '17:00',
      notes: 'Podium eerst',
    });

    const res = await alsBestuur('put', `/${id}/schedule/${gemaakt.body.id}`).send({ startTime: '16:30' });
    expect(res.status).toBe(200);

    const na = await alsLid('get', `/${id}/schedule`);
    expect(na.body[0]).toMatchObject({ title: 'Opbouw', startTime: '16:30', notes: 'Podium eerst' });
  });

  it('wijzigt geen onderdeel via een evenement van een andere vereniging', async () => {
    const elders = maakEvenementIn(andereVereniging.id, andereBeheerder.id);
    const res = await alsBeheerder('put', `/${elders}/schedule/${uuidv4()}`).send({ title: 'Gekaapt' });
    expect(res.status).toBe(404);
  });

  it('verwijdert een onderdeel alleen binnen de eigen vereniging', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);
    const gemaakt = await alsBeheerder('post', `/${id}/schedule`).send({ title: 'Opbouw', startTime: '17:00' });

    const vreemd = await alsVreemde('delete', `/${id}/schedule/${gemaakt.body.id}`);
    expect(vreemd.status).toBe(404);

    const eigen = await alsBeheerder('delete', `/${id}/schedule/${gemaakt.body.id}`);
    expect(eigen.status).toBe(200);

    const nogmaals = await alsBeheerder('delete', `/${id}/schedule/${gemaakt.body.id}`);
    expect(nogmaals.status).toBe(404);
  });
});

// ===========================================
// VERVOER EN PASSAGIERS
// ===========================================

describe('vervoer', () => {
  async function maakVervoer(eventId: string, overschrijf: Record<string, unknown> = {}) {
    const res = await alsBeheerder('post', `/${eventId}/transport`).send({
      transportType: 'car',
      capacity: 4,
      ...overschrijf,
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it('weigert een onbekend vervoermiddel', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);
    const res = await alsBeheerder('post', `/${id}/transport`).send({ transportType: 'raket' });
    expect(res.status).toBe(400);
  });

  it('weigert een auto met nul plaatsen', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);
    const res = await alsBeheerder('post', `/${id}/transport`).send({ transportType: 'car', capacity: 0 });
    expect(res.status).toBe(400);
  });

  it('geeft 404 bij een evenement van een andere vereniging', async () => {
    const elders = maakEvenementIn(andereVereniging.id, andereBeheerder.id);

    const lezen = await alsBeheerder('get', `/${elders}/transport`);
    expect(lezen.status).toBe(404);

    const schrijven = await alsBeheerder('post', `/${elders}/transport`).send({ transportType: 'car' });
    expect(schrijven.status).toBe(404);
  });

  it('toont de passagiers bij hun rit, met de naam van het gekoppelde lid', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);
    const rit = await maakVervoer(id, { driverUserId: beheerder.id, departureTime: '17:00' });
    const tweedeRit = await maakVervoer(id, { transportType: 'van', driverName: 'Losse chauffeur' });

    // BEWIJS. Op de oude code was dit een 500: passenger_name is NOT NULL en
    // de route schreef `passengerName || null` weg, dus een passagier die uit
    // de ledenlijst werd gekozen - het gewone geval, waarbij het scherm alleen
    // userId meestuurt - kon nooit worden opgeslagen.
    const metLid = await alsBeheerder('post', `/${id}/transport/${rit}/passengers`).send({
      userId: lid.id,
      pickupLocation: 'Station',
    });
    expect(metLid.status).toBe(201);

    const zonderLid = await alsBeheerder('post', `/${id}/transport/${rit}/passengers`).send({
      passengerName: 'Buurvrouw',
    });
    expect(zonderLid.status).toBe(201);

    const res = await alsLid('get', `/${id}/transport`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    const eerste = res.body.find((t: any) => t.id === rit);
    expect(eerste.driverName).toBe('Admin User');
    expect(eerste.passengers).toHaveLength(2);
    expect(eerste.passengers.map((p: any) => p.passengerName).sort()).toEqual([
      'Buurvrouw',
      `${lid.firstName} ${lid.lastName}`,
    ]);

    // De rit zonder passagiers krijgt een lege lijst, geen ontbrekend veld.
    const tweede = res.body.find((t: any) => t.id === tweedeRit);
    expect(tweede.passengers).toEqual([]);
    expect(tweede.driverName).toBe('Losse chauffeur');
  });

  it('laat er niet meer in dan er plaatsen zijn', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);
    const rit = await maakVervoer(id, { capacity: 2 });

    for (const naam of ['Een', 'Twee']) {
      const res = await alsLid('post', `/${id}/transport/${rit}/passengers`).send({ passengerName: naam });
      expect(res.status).toBe(201);
    }

    const teveel = await alsLid('post', `/${id}/transport/${rit}/passengers`).send({ passengerName: 'Drie' });
    expect(teveel.status).toBe(400);
    expect(teveel.body.error).toBe('Vervoer zit vol.');
  });

  it('laat een rit zonder opgegeven aantal plaatsen wel doorlopen', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);
    const rit = await maakVervoer(id, { transportType: 'bus', capacity: undefined });

    for (const naam of ['Een', 'Twee', 'Drie']) {
      const res = await alsLid('post', `/${id}/transport/${rit}/passengers`).send({ passengerName: naam });
      expect(res.status).toBe(201);
    }
  });

  it('weigert een passagier zonder naam en zonder lid', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);
    const rit = await maakVervoer(id);

    const leeg = await alsLid('post', `/${id}/transport/${rit}/passengers`).send({ pickupLocation: 'Station' });
    expect(leeg.status).toBe(400);

    const spaties = await alsLid('post', `/${id}/transport/${rit}/passengers`).send({ passengerName: '   ' });
    expect(spaties.status).toBe(400);
  });

  it('meldt geen lid van een andere vereniging aan als passagier', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);
    const rit = await maakVervoer(id);

    // De leesroute joint deze rij op users en toont de naam, dus een lid van
    // elders aanmelden lekte diens naam aan de eigen vereniging.
    const res = await alsBeheerder('post', `/${id}/transport/${rit}/passengers`).send({
      userId: andereBeheerder.id,
      passengerName: 'Wie dan ook',
    });
    expect(res.status).toBe(404);

    const aantal = db
      .prepare('SELECT COUNT(*) as n FROM event_transport_passengers WHERE transport_id = ?')
      .get(rit) as any;
    expect(aantal.n).toBe(0);
  });

  it('meldt geen passagier aan bij een rit van een andere vereniging', async () => {
    const elders = maakEvenementIn(andereVereniging.id, andereBeheerder.id);
    const eldersRit = uuidv4();
    db.prepare('INSERT INTO event_transport (id, event_id, transport_type) VALUES (?, ?, ?)').run(
      eldersRit,
      elders,
      'car',
    );

    const res = await alsBeheerder('post', `/${elders}/transport/${eldersRit}/passengers`).send({
      passengerName: 'Ingeslopen',
    });
    expect(res.status).toBe(404);

    const aantal = db
      .prepare('SELECT COUNT(*) as n FROM event_transport_passengers WHERE transport_id = ?')
      .get(eldersRit) as any;
    expect(aantal.n).toBe(0);
  });

  it('haalt een passagier van de eigen rit af, en daarna niet nog eens', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);
    const rit = await maakVervoer(id);
    const passagier = await alsLid('post', `/${id}/transport/${rit}/passengers`).send({ passengerName: 'Buurvrouw' });
    expect(passagier.status).toBe(201);

    const res = await alsLid('delete', `/${id}/transport/${rit}/passengers/${passagier.body.id}`);
    expect(res.status).toBe(200);

    const nogmaals = await alsLid('delete', `/${id}/transport/${rit}/passengers/${passagier.body.id}`);
    expect(nogmaals.status).toBe(404);

    const na = await alsLid('get', `/${id}/transport`);
    expect(na.body[0].passengers).toEqual([]);
  });

  it('verwijdert een rit alleen binnen de eigen vereniging', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);
    const rit = await maakVervoer(id);

    const vreemd = await alsVreemde('delete', `/${id}/transport/${rit}`);
    expect(vreemd.status).toBe(404);

    const eigen = await alsBeheerder('delete', `/${id}/transport/${rit}`);
    expect(eigen.status).toBe(200);

    const nogmaals = await alsBeheerder('delete', `/${id}/transport/${rit}`);
    expect(nogmaals.status).toBe(404);
  });
});

// ===========================================
// VERZAMELPUNTEN
// ===========================================

describe('verzamelpunten', () => {
  it('geeft 404 bij een evenement van een andere vereniging', async () => {
    const elders = maakEvenementIn(andereVereniging.id, andereBeheerder.id);

    const lezen = await alsBeheerder('get', `/${elders}/meeting-points`);
    expect(lezen.status).toBe(404);

    const schrijven = await alsBeheerder('post', `/${elders}/meeting-points`).send({
      name: 'Ingeslopen',
      meetingTime: '18:00',
    });
    expect(schrijven.status).toBe(404);
  });

  it('weigert een punt zonder naam of zonder tijd', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);

    const zonderNaam = await alsBeheerder('post', `/${id}/meeting-points`).send({ name: '', meetingTime: '18:00' });
    expect(zonderNaam.status).toBe(400);

    const zonderTijd = await alsBeheerder('post', `/${id}/meeting-points`).send({ name: 'Station' });
    expect(zonderTijd.status).toBe(400);
  });

  it('houdt maar een punt tegelijk als hoofdverzamelpunt', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);

    const eerste = await alsBeheerder('post', `/${id}/meeting-points`).send({
      name: 'Station',
      meetingTime: '17:00',
      isPrimary: true,
    });
    expect(eerste.status).toBe(201);

    const tweede = await alsBeheerder('post', `/${id}/meeting-points`).send({
      name: 'Parkeerplaats',
      meetingTime: '17:15',
      isPrimary: true,
    });
    expect(tweede.status).toBe(201);

    const res = await alsLid('get', `/${id}/meeting-points`);
    expect(res.status).toBe(200);
    // Het hoofdpunt staat vooraan, en het is er maar een.
    expect(res.body.filter((p: any) => p.isPrimary)).toHaveLength(1);
    expect(res.body[0].name).toBe('Parkeerplaats');
  });

  it('verwijdert een punt alleen binnen de eigen vereniging', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);
    const gemaakt = await alsBeheerder('post', `/${id}/meeting-points`).send({
      name: 'Station',
      meetingTime: '17:00',
    });

    const vreemd = await alsVreemde('delete', `/${id}/meeting-points/${gemaakt.body.id}`);
    expect(vreemd.status).toBe(404);

    const eigen = await alsBeheerder('delete', `/${id}/meeting-points/${gemaakt.body.id}`);
    expect(eigen.status).toBe(200);

    const nogmaals = await alsBeheerder('delete', `/${id}/meeting-points/${gemaakt.body.id}`);
    expect(nogmaals.status).toBe(404);
  });
});

// ===========================================
// PAKLIJSTEN
// ===========================================

describe('paklijsten', () => {
  async function maakLijst(eventId: string, overschrijf: Record<string, unknown> = {}) {
    const res = await alsBeheerder('post', `/${eventId}/packing-lists`).send({ name: 'Podiumspullen', ...overschrijf });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it('geeft 404 bij een evenement van een andere vereniging', async () => {
    const elders = maakEvenementIn(andereVereniging.id, andereBeheerder.id);

    const lezen = await alsBeheerder('get', `/${elders}/packing-lists`);
    expect(lezen.status).toBe(404);

    const schrijven = await alsBeheerder('post', `/${elders}/packing-lists`).send({ name: 'Ingeslopen' });
    expect(schrijven.status).toBe(404);
  });

  it('rekent de voortgang uit, ook bij een lege lijst', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);
    const lijst = await maakLijst(id);
    const leeg = await maakLijst(id, { name: 'Nog niets' });

    for (const naam of ['Statief', 'Kabelhaspel', 'Klapstoel', 'Muziekstandaard']) {
      const res = await alsBeheerder('post', `/${id}/packing-lists/${lijst}/items`).send({ itemName: naam });
      expect(res.status).toBe(201);
    }

    const items = await alsLid('get', `/${id}/packing-lists/${lijst}`);
    const eerste = items.body.items[0].id;
    const afgevinkt = await alsLid('put', `/${id}/packing-lists/${lijst}/items/${eerste}`).send({ isPacked: true });
    expect(afgevinkt.status).toBe(200);

    const res = await alsLid('get', `/${id}/packing-lists`);
    expect(res.status).toBe(200);

    const metItems = res.body.find((l: any) => l.id === lijst);
    expect(metItems).toMatchObject({ totalItems: 4, packedItems: 1, progress: 25 });

    const zonderItems = res.body.find((l: any) => l.id === leeg);
    expect(zonderItems).toMatchObject({ totalItems: 0, packedItems: 0, progress: 0 });
  });

  it('noemt wie een item heeft afgevinkt, en draait dat ook weer terug', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);
    const lijst = await maakLijst(id);
    const item = await alsBeheerder('post', `/${id}/packing-lists/${lijst}/items`).send({
      itemName: 'Statief',
      quantity: 3,
      responsibleUserId: beheerder.id,
    });

    const aan = await alsLid('put', `/${id}/packing-lists/${lijst}/items/${item.body.id}`).send({
      isPacked: true,
      quantityPacked: 2,
    });
    expect(aan.status).toBe(200);

    const na = await alsLid('get', `/${id}/packing-lists/${lijst}`);
    expect(na.body.items[0]).toMatchObject({
      itemName: 'Statief',
      quantity: 3,
      quantityPacked: 2,
      isPacked: true,
      packedByUserId: lid.id,
      packedByName: `${lid.firstName} ${lid.lastName}`,
      responsibleName: 'Admin User',
    });
    expect(na.body.items[0].packedAt).toBeTruthy();

    const uit = await alsLid('put', `/${id}/packing-lists/${lijst}/items/${item.body.id}`).send({ isPacked: false });
    expect(uit.status).toBe(200);

    const terug = await alsLid('get', `/${id}/packing-lists/${lijst}`);
    expect(terug.body.items[0].isPacked).toBe(false);
    expect(terug.body.items[0].packedByUserId).toBeNull();
    expect(terug.body.items[0].packedAt).toBeNull();
  });

  it('verandert niets bij een verzoek zonder bruikbare velden', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);
    const lijst = await maakLijst(id);
    const item = await alsBeheerder('post', `/${id}/packing-lists/${lijst}/items`).send({ itemName: 'Statief' });

    const res = await alsLid('put', `/${id}/packing-lists/${lijst}/items/${item.body.id}`).send({ isPacked: 'ja' });
    expect(res.status).toBe(200);

    const na = await alsLid('get', `/${id}/packing-lists/${lijst}`);
    expect(na.body.items[0].isPacked).toBe(false);
  });

  it('weigert een item zonder naam', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);
    const lijst = await maakLijst(id);

    const res = await alsBeheerder('post', `/${id}/packing-lists/${lijst}/items`).send({ itemName: '' });
    expect(res.status).toBe(400);
  });

  it('toont de lijst van een andere vereniging niet en voegt er niets aan toe', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);
    const lijst = await maakLijst(id);

    const lezen = await alsVreemde('get', `/${id}/packing-lists/${lijst}`);
    expect(lezen.status).toBe(404);

    const schrijven = await alsVreemde('post', `/${id}/packing-lists/${lijst}/items`).send({ itemName: 'Ingeslopen' });
    expect(schrijven.status).toBe(404);

    const afvinken = await alsVreemde('put', `/${id}/packing-lists/${lijst}/items/${uuidv4()}`).send({
      isPacked: true,
    });
    expect(afvinken.status).toBe(404);
  });

  it('verwijdert een item alleen binnen de eigen vereniging', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);
    const lijst = await maakLijst(id);
    const item = await alsBeheerder('post', `/${id}/packing-lists/${lijst}/items`).send({ itemName: 'Statief' });

    const vreemd = await alsVreemde('delete', `/${id}/packing-lists/${lijst}/items/${item.body.id}`);
    expect(vreemd.status).toBe(404);

    const eigen = await alsBeheerder('delete', `/${id}/packing-lists/${lijst}/items/${item.body.id}`);
    expect(eigen.status).toBe(200);

    const nogmaals = await alsBeheerder('delete', `/${id}/packing-lists/${lijst}/items/${item.body.id}`);
    expect(nogmaals.status).toBe(404);
  });
});

// ===========================================
// PAKLIJST-SJABLONEN
// ===========================================

describe('paklijst-sjablonen', () => {
  async function maakSjabloon(overschrijf: Record<string, unknown> = {}) {
    const res = await alsBeheerder('post', '/packing-templates').send({
      name: 'Buitenoptreden',
      items: [{ itemName: 'Partijtenten' }, { itemName: 'Wasknijpers', quantity: 40, category: 'klein' }],
      ...overschrijf,
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it('weigert een sjabloon zonder naam', async () => {
    const res = await alsBeheerder('post', '/packing-templates').send({ description: 'Naamloos' });
    expect(res.status).toBe(400);
  });

  it('toont de sjablonen met hun aantal onderdelen, met de standaard vooraan', async () => {
    await maakSjabloon({ name: 'Buitenoptreden' });
    await maakSjabloon({ name: 'Binnenoptreden', isDefault: true, items: [{ itemName: 'Verlengsnoer' }] });

    const res = await alsLid('get', '/packing-templates');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ name: 'Binnenoptreden', isDefault: true, itemCount: 1 });
    expect(res.body[0].createdBy).toBe('Admin User');
    expect(res.body[1]).toMatchObject({ name: 'Buitenoptreden', isDefault: false, itemCount: 2 });
  });

  it('houdt maar een sjabloon tegelijk als standaard', async () => {
    await maakSjabloon({ name: 'Eerste', isDefault: true });
    await maakSjabloon({ name: 'Tweede', isDefault: true });

    const res = await alsLid('get', '/packing-templates');
    expect(res.body.filter((t: any) => t.isDefault)).toHaveLength(1);
    expect(res.body[0].name).toBe('Tweede');
  });

  it('geeft de onderdelen van een sjabloon terug', async () => {
    const id = await maakSjabloon();

    const res = await alsLid('get', `/packing-templates/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Buitenoptreden');
    expect(res.body.items).toHaveLength(2);

    const knijpers = res.body.items.find((i: any) => i.itemName === 'Wasknijpers');
    expect(knijpers).toMatchObject({ quantity: 40, category: 'klein', isRequired: true });

    // Zonder opgave valt de rubriek terug op 'general' en het aantal op 1.
    const tent = res.body.items.find((i: any) => i.itemName === 'Partijtenten');
    expect(tent).toMatchObject({ quantity: 1, category: 'general' });
  });

  it('toont het sjabloon van een andere vereniging niet', async () => {
    const id = await maakSjabloon();

    const res = await alsVreemde('get', `/packing-templates/${id}`);
    expect(res.status).toBe(404);

    const lijst = await alsVreemde('get', '/packing-templates');
    expect(lijst.body).toHaveLength(0);
  });

  it('laat alleen de beheerder een sjabloon verwijderen', async () => {
    const id = await maakSjabloon();

    const doorBestuur = await alsBestuur('delete', `/packing-templates/${id}`);
    expect(doorBestuur.status).toBe(403);

    const vreemd = await alsVreemde('delete', `/packing-templates/${id}`);
    expect(vreemd.status).toBe(404);

    const eigen = await alsBeheerder('delete', `/packing-templates/${id}`);
    expect(eigen.status).toBe(200);

    const nogmaals = await alsBeheerder('delete', `/packing-templates/${id}`);
    expect(nogmaals.status).toBe(404);
  });
});

// ===========================================
// AANMELDEN
// ===========================================

describe('aanmelden', () => {
  it('weigert een onbekende stand en een aanmelding zonder stand', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);

    const onbekend = await alsLid('post', `/${id}/attendance`).send({ status: 'misschien-wel' });
    expect(onbekend.status).toBe(400);

    const leeg = await alsLid('post', `/${id}/attendance`).send({});
    expect(leeg.status).toBe(400);
  });

  it('meldt niet aan bij een evenement van een andere vereniging', async () => {
    const elders = maakEvenementIn(andereVereniging.id, andereBeheerder.id);

    const res = await alsLid('post', `/${elders}/attendance`).send({ status: 'attending' });
    expect(res.status).toBe(404);

    const aantal = db.prepare('SELECT COUNT(*) as n FROM event_attendance WHERE event_id = ?').get(elders) as any;
    expect(aantal.n).toBe(0);
  });

  it('overschrijft een eerdere aanmelding in plaats van er een tweede te maken', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);

    const eerst = await alsLid('post', `/${id}/attendance`).send({
      status: 'attending',
      canDrive: true,
      availableSeats: 3,
      dietaryRequirements: 'Geen noten',
    });
    expect(eerst.status).toBe(200);

    const daarna = await alsLid('post', `/${id}/attendance`).send({ status: 'not_attending' });
    expect(daarna.status).toBe(200);

    const res = await alsLid('get', `/${id}`);
    expect(res.body.attendance).toHaveLength(1);
    expect(res.body.myAttendance).toMatchObject({
      status: 'not_attending',
      canDrive: false,
      availableSeats: 0,
    });
    // De velden die het tweede verzoek niet noemde worden meegewist; dat is de
    // bedoeling van dit formulier, dat altijd compleet wordt verstuurd.
    expect(res.body.myAttendance.dietaryRequirements).toBeNull();
  });

  it('vat de aanmeldingen samen per stand, per instrument en naar vervoer', async () => {
    const trompet = createTestInstrument({ name: 'Trompet' });
    const bas = createTestInstrument({ name: 'Bas' });
    const id = maakEvenementIn(vereniging.id, beheerder.id);

    await alsLid('post', `/${id}/attendance`).send({
      status: 'attending',
      instrumentId: trompet.id,
      transportNeeded: true,
    });
    await alsBeheerder('post', `/${id}/attendance`).send({
      status: 'attending',
      instrumentId: bas.id,
      canDrive: true,
      availableSeats: 4,
    });
    await alsBestuur('post', `/${id}/attendance`).send({ status: 'not_attending' });

    const res = await alsLid('get', `/${id}/attendance/summary`);
    expect(res.status).toBe(200);
    expect(res.body.byStatus).toEqual({ attending: 2, not_attending: 1 });
    expect(res.body.transport).toEqual({ needsTransport: 1, availableSeats: 4 });
    expect(res.body.byInstrument).toEqual(
      expect.arrayContaining([
        { instrument: 'Trompet', count: 1 },
        { instrument: 'Bas', count: 1 },
      ]),
    );
  });

  it('geeft een lege samenvatting bij een evenement zonder aanmeldingen', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);

    const res = await alsLid('get', `/${id}/attendance/summary`);
    expect(res.status).toBe(200);
    expect(res.body.byStatus).toEqual({});
    expect(res.body.transport).toEqual({ needsTransport: 0, availableSeats: 0 });
    expect(res.body.byInstrument).toEqual([]);
  });

  it('vat het evenement van een andere vereniging niet samen', async () => {
    const elders = maakEvenementIn(andereVereniging.id, andereBeheerder.id);
    const res = await alsBeheerder('get', `/${elders}/attendance/summary`);
    expect(res.status).toBe(404);
  });
});

// ===========================================
// WEER
// ===========================================

describe('weerbericht', () => {
  function zetVoorspelling(eventId: string, datum: string, opgehaaldOp: string, temperatuur: number) {
    db.prepare(
      `INSERT INTO event_weather (id, event_id, fetched_at, forecast_date, temperature_c, weather_description)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(uuidv4(), eventId, opgehaaldOp, datum, temperatuur, 'Bewolkt');
  }

  it('geeft 404 bij een evenement van een andere vereniging', async () => {
    const elders = maakEvenementIn(andereVereniging.id, andereBeheerder.id);

    const lezen = await alsBeheerder('get', `/${elders}/weather`);
    expect(lezen.status).toBe(404);

    const ophalen = await alsBeheerder('post', `/${elders}/weather/fetch`).send({});
    expect(ophalen.status).toBe(404);
  });

  it('houdt per dag alleen de nieuwste voorspelling over', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id, { latitude: 52.09, longitude: 5.12 });

    zetVoorspelling(id, '2026-07-15', '2026-07-10T06:00:00.000Z', 18);
    zetVoorspelling(id, '2026-07-15', '2026-07-14T06:00:00.000Z', 24);
    zetVoorspelling(id, '2026-07-16', '2026-07-14T06:00:00.000Z', 21);

    const res = await alsLid('get', `/${id}/weather`);
    expect(res.status).toBe(200);
    expect(res.body.location).toEqual({ latitude: 52.09, longitude: 5.12 });
    expect(res.body.forecasts).toHaveLength(2);

    const vijftiende = res.body.forecasts.find((f: any) => f.forecastDate === '2026-07-15');
    expect(vijftiende.temperatureC).toBe(24);
    expect(vijftiende.weatherDescription).toBe('Bewolkt');
  });

  it('valt terug op de coordinaten van de locatie', async () => {
    const locatieId = maakLocatieIn(vereniging.id, { name: 'Muziekkoepel', latitude: 52.09 });
    const id = maakEvenementIn(vereniging.id, beheerder.id, { locationId: locatieId });

    const res = await alsLid('get', `/${id}/weather`);
    expect(res.status).toBe(200);
    expect(res.body.location.latitude).toBe(52.09);
    expect(res.body.forecasts).toEqual([]);
  });

  it('haalt niets op zonder coordinaten', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id);

    const res = await alsBeheerder('post', `/${id}/weather/fetch`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('coördinaten');
  });

  it('haalt niets op zolang er geen sleutel is ingesteld', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id, { latitude: 52.09, longitude: 5.12 });

    const zonderInstelling = await alsBeheerder('post', `/${id}/weather/fetch`).send({});
    expect(zonderInstelling.status).toBe(400);
    expect(zonderInstelling.body.error).toContain('API');

    // Een rij zonder sleutel is net zo goed niet ingesteld.
    db.prepare('INSERT INTO weather_settings (id, association_id, api_key) VALUES (?, ?, ?)').run(
      uuidv4(),
      vereniging.id,
      null,
    );
    const legeSleutel = await alsBeheerder('post', `/${id}/weather/fetch`).send({});
    expect(legeSleutel.status).toBe(400);

    db.prepare('UPDATE weather_settings SET api_key = ? WHERE association_id = ?').run('geheim', vereniging.id);
    const metSleutel = await alsBeheerder('post', `/${id}/weather/fetch`).send({});
    expect(metSleutel.status).toBe(200);
  });

  it('laat een gewoon lid het weer niet ophalen', async () => {
    const id = maakEvenementIn(vereniging.id, beheerder.id, { latitude: 52.09, longitude: 5.12 });

    const res = await alsLid('post', `/${id}/weather/fetch`).send({});
    expect(res.status).toBe(403);
  });
});
