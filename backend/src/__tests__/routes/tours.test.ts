/**
 * Reizen van de vereniging: dagen, activiteiten, overnachtingen, vervoer en
 * wie er meegaat.
 *
 * 878 regels zonder test. Twee dingen wegen hier het zwaarst. Het eerste is
 * de wachtlijst: als het maximum niet klopt gaan er meer mensen mee dan er
 * bussstoelen zijn. Het tweede is de verenigingsgrens, en daar zat ook een
 * gat: DELETE /tours/:id/accommodations/:accId keek alleen naar het id van
 * de reis en niet naar de vereniging, terwijl alle buurroutes dat wel doen.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import toursRoutes from '../../routes/tours';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/tours', toursRoutes);
app.use(errorHandler);

describe('reizen', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
  });

  type Methode = 'get' | 'post' | 'patch' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/tours${pad}`).set('Authorization', `Bearer ${token}`);
  const alsBeheerder = (methode: Methode, pad: string) => als(beheerderToken, methode, pad);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  const geldigeReis = {
    name: 'Concertreis Praag',
    destination: 'Praag',
    country: 'Tsjechië',
    startDate: '2026-07-01',
    endDate: '2026-07-04',
  };

  async function maakReis(overrides: Record<string, unknown> = {}): Promise<string> {
    const antwoord = await alsBeheerder('post', '/').send({ ...geldigeReis, ...overrides });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    return antwoord.body.id;
  }

  /** Een reis van een andere vereniging, rechtstreeks in de database. */
  function vreemdeReis(associationId: string): string {
    const id = uuidv4();
    const maker = createTestUser(associationId, { email: `reismaker-${uuidv4()}@test.nl`, role: 'admin' });
    db.prepare(
      `INSERT INTO tours (id, association_id, name, start_date, end_date, status, created_by)
       VALUES (?, ?, 'Reis van de buren', '2026-08-01', '2026-08-03', 'planning', ?)`,
    ).run(id, associationId, maker.id);
    return id;
  }

  describe('overzicht en aanmaken', () => {
    it('begint met een lege lijst', async () => {
      const antwoord = await alsLid('get', '/');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual([]);
    });

    it('maakt een reis aan', async () => {
      const id = await maakReis();
      const antwoord = await alsLid('get', `/${id}`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toMatchObject({
        name: 'Concertreis Praag',
        destination: 'Praag',
        status: 'planning',
      });
    });

    it('maakt meteen een dag per reisdag aan', async () => {
      const id = await maakReis({ startDate: '2026-07-01', endDate: '2026-07-04' });

      const antwoord = await alsLid('get', `/${id}`);
      expect(antwoord.body.days).toHaveLength(4);
      expect(antwoord.body.days.map((d: { dayNumber: number }) => d.dayNumber)).toEqual([1, 2, 3, 4]);
    });

    it('maakt één dag voor een reis van één dag', async () => {
      const id = await maakReis({ startDate: '2026-07-01', endDate: '2026-07-01' });
      expect((await alsLid('get', `/${id}`)).body.days).toHaveLength(1);
    });

    it('weigert een reis zonder naam', async () => {
      expect((await alsBeheerder('post', '/').send({ ...geldigeReis, name: '' })).status).toBe(400);
    });

    it('houdt een gewoon lid van het aanmaken af', async () => {
      expect((await alsLid('post', '/').send(geldigeReis)).status).toBe(403);
    });

    it('telt de deelnemers en de dagen in het overzicht', async () => {
      const id = await maakReis();
      await alsLid('post', `/${id}/register`).send({});

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body[0]).toMatchObject({ participantCount: 1, dayCount: 4 });
    });

    it('toont de reis van een andere vereniging niet', async () => {
      await maakReis();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      vreemdeReis(andere.id);

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body.map((t: { name: string }) => t.name)).toEqual(['Concertreis Praag']);
    });

    it('geeft 404 voor een reis van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      expect((await alsLid('get', `/${vreemdeReis(andere.id)}`)).status).toBe(404);
    });

    it('filtert op status', async () => {
      const id = await maakReis();
      await maakReis({ name: 'Tweede reis' });
      await alsBeheerder('patch', `/${id}/status`).send({ status: 'confirmed' });

      const antwoord = await alsLid('get', '/?status=confirmed');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].name).toBe('Concertreis Praag');
    });

    it('filtert op jaar', async () => {
      await maakReis({ startDate: '2026-07-01', endDate: '2026-07-02' });
      await maakReis({ name: 'Volgend jaar', startDate: '2027-07-01', endDate: '2027-07-02' });

      const antwoord = await alsLid('get', '/?year=2027');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].name).toBe('Volgend jaar');
    });
  });

  describe('bijwerken', () => {
    it('werkt een enkel veld bij en laat de rest staan', async () => {
      const id = await maakReis();

      const antwoord = await alsBeheerder('patch', `/${id}`).send({ budget: 12000 });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const na = await alsLid('get', `/${id}`);
      expect(na.body).toMatchObject({ budget: 12000, name: 'Concertreis Praag', destination: 'Praag' });
    });

    it('werkt een reis van een andere vereniging niet bij', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = vreemdeReis(andere.id);

      expect((await alsBeheerder('patch', `/${vreemd}`).send({ name: 'Gekaapt' })).status).toBe(404);
      const rij = db.prepare('SELECT name FROM tours WHERE id = ?').get(vreemd) as { name: string };
      expect(rij.name).toBe('Reis van de buren');
    });

    it('zet de status om', async () => {
      const id = await maakReis();

      expect((await alsBeheerder('patch', `/${id}/status`).send({ status: 'active' })).status).toBe(200);
      expect((await alsLid('get', `/${id}`)).body.status).toBe('active');
    });

    it('weigert een status die niet bestaat', async () => {
      const id = await maakReis();
      expect((await alsBeheerder('patch', `/${id}/status`).send({ status: 'onderweg' })).status).toBe(400);
    });

    it('zet de status van een reis van een andere vereniging niet om', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = vreemdeReis(andere.id);

      expect((await alsBeheerder('patch', `/${vreemd}/status`).send({ status: 'cancelled' })).status).toBe(404);
    });

    it('houdt een gewoon lid van het bijwerken af', async () => {
      const id = await maakReis();
      expect((await alsLid('patch', `/${id}`).send({ budget: 1 })).status).toBe(403);
    });
  });

  describe('verwijderen', () => {
    it('markeert de reis als verwijderd zonder de rij weg te gooien', async () => {
      const id = await maakReis();

      expect((await alsBeheerder('delete', `/${id}`)).status).toBe(200);
      expect((await alsLid('get', `/${id}`)).status).toBe(404);

      const rij = db.prepare('SELECT deleted_at FROM tours WHERE id = ?').get(id) as { deleted_at: string | null };
      expect(rij.deleted_at).not.toBeNull();
    });

    it('verwijdert een reis niet twee keer', async () => {
      const id = await maakReis();
      await alsBeheerder('delete', `/${id}`);
      expect((await alsBeheerder('delete', `/${id}`)).status).toBe(404);
    });

    it('verwijdert geen reis van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      expect((await alsBeheerder('delete', `/${vreemdeReis(andere.id)}`)).status).toBe(404);
    });

    it('laat verwijderen alleen aan een beheerder over', async () => {
      const id = await maakReis();
      expect((await alsLid('delete', `/${id}`)).status).toBe(403);
    });
  });

  describe('aanmelden', () => {
    it('meldt een lid aan', async () => {
      const id = await maakReis();

      const antwoord = await alsLid('post', `/${id}/register`).send({
        roomPreference: 'eenpersoons',
        dietaryRequirements: 'vegetarisch',
      });

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
      expect(antwoord.body.status).toBe('registered');

      const reis = await alsLid('get', `/${id}`);
      expect(reis.body.myRegistration).toMatchObject({ status: 'registered' });
      expect(reis.body.participants).toHaveLength(1);
    });

    it('meldt een dubbele aanmelding met een eigen tekst', async () => {
      const id = await maakReis();
      await alsLid('post', `/${id}/register`).send({});

      // Deze tak werd nooit genomen: de route keek naar err.code, en sql.js
      // zet die niet. De melding kwam dus nooit bij het lid aan.
      const tweede = await alsLid('post', `/${id}/register`).send({});
      expect(tweede.status).toBe(409);
      expect(tweede.body.error).toBe('Je bent al geregistreerd voor deze tour');
    });

    it('zet iemand op de wachtlijst zodra de reis vol is', async () => {
      const id = await maakReis({ maxParticipants: 1 });
      await alsBeheerder('post', `/${id}/register`).send({});

      const antwoord = await alsLid('post', `/${id}/register`).send({});
      expect(antwoord.status).toBe(201);
      expect(antwoord.body.status).toBe('waitlist');
    });

    it('telt een geannuleerde aanmelding niet mee voor het maximum', async () => {
      const id = await maakReis({ maxParticipants: 1 });
      await alsBeheerder('post', `/${id}/register`).send({});
      await alsBeheerder('delete', `/${id}/register`);

      const antwoord = await alsLid('post', `/${id}/register`).send({});
      expect(antwoord.body.status).toBe('registered');
    });

    it('meldt niemand aan na de sluitingsdatum', async () => {
      const id = await maakReis({ registrationDeadline: '2020-01-01' });

      const antwoord = await alsLid('post', `/${id}/register`).send({});
      expect(antwoord.status).toBe(400);
    });

    it('meldt niemand aan voor een reis van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      expect((await alsLid('post', `/${vreemdeReis(andere.id)}/register`).send({})).status).toBe(404);
    });

    it('annuleert een aanmelding', async () => {
      const id = await maakReis();
      await alsLid('post', `/${id}/register`).send({});

      expect((await alsLid('delete', `/${id}/register`)).status).toBe(200);
      expect((await alsLid('get', `/${id}`)).body.myRegistration.status).toBe('cancelled');
    });

    it('annuleert niets als er geen aanmelding is', async () => {
      const id = await maakReis();
      expect((await alsLid('delete', `/${id}/register`)).status).toBe(404);
    });

    it('toont alleen de eigen aanmelding onder myRegistration', async () => {
      const id = await maakReis();
      await alsBeheerder('post', `/${id}/register`).send({});

      const antwoord = await alsLid('get', `/${id}`);
      expect(antwoord.body.myRegistration).toBeNull();
      expect(antwoord.body.participants).toHaveLength(1);
      expect(antwoord.body.participants[0].userId).toBe(beheerder.id);
    });
  });

  describe('dagen en activiteiten', () => {
    async function eersteDag(reisId: string): Promise<string> {
      const reis = await alsLid('get', `/${reisId}`);
      return reis.body.days[0].id;
    }

    it('voegt een extra dag toe achteraan', async () => {
      const id = await maakReis();

      const antwoord = await alsBeheerder('post', `/${id}/days`).send({ dayDate: '2026-07-05', title: 'Extra dag' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);

      const reis = await alsLid('get', `/${id}`);
      expect(reis.body.days).toHaveLength(5);
      expect(reis.body.days[4]).toMatchObject({ dayNumber: 5, title: 'Extra dag' });
    });

    it('voegt geen dag toe aan een reis van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const antwoord = await alsBeheerder('post', `/${vreemdeReis(andere.id)}/days`).send({ dayDate: '2026-08-04' });
      expect(antwoord.status).toBe(404);
    });

    it('verwijdert een dag', async () => {
      const id = await maakReis();
      const dagId = await eersteDag(id);

      expect((await alsBeheerder('delete', `/${id}/days/${dagId}`)).status).toBe(200);
      expect((await alsLid('get', `/${id}`)).body.days).toHaveLength(3);
    });

    it('verwijdert geen dag van een reis van een andere vereniging', async () => {
      const id = await maakReis();
      const dagId = await eersteDag(id);
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, { email: `reis-${uuidv4()}@test.nl`, role: 'admin' });

      const antwoord = await request(app)
        .delete(`/api/tours/${id}/days/${dagId}`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`);

      expect(antwoord.status).toBe(404);
      expect((await alsLid('get', `/${id}`)).body.days).toHaveLength(4);
    });

    it('voegt een activiteit aan een dag toe', async () => {
      const id = await maakReis();
      const dagId = await eersteDag(id);

      const antwoord = await alsBeheerder('post', `/${id}/days/${dagId}/activities`).send({
        activityType: 'concert',
        title: 'Optreden Rudolfinum',
        startTime: '20:00',
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);

      const reis = await alsLid('get', `/${id}`);
      expect(reis.body.days[0].activities).toHaveLength(1);
      expect(reis.body.days[0].activities[0]).toMatchObject({
        activityType: 'concert',
        title: 'Optreden Rudolfinum',
        sortOrder: 1,
      });
    });

    it('nummert de activiteiten op volgorde van toevoegen', async () => {
      const id = await maakReis();
      const dagId = await eersteDag(id);

      await alsBeheerder('post', `/${id}/days/${dagId}/activities`).send({ activityType: 'meal', title: 'Ontbijt' });
      await alsBeheerder('post', `/${id}/days/${dagId}/activities`).send({ activityType: 'travel', title: 'Bus' });

      const reis = await alsLid('get', `/${id}`);
      expect(reis.body.days[0].activities.map((a: { sortOrder: number }) => a.sortOrder)).toEqual([1, 2]);
    });

    it('weigert een soort activiteit die niet bestaat', async () => {
      const id = await maakReis();
      const dagId = await eersteDag(id);

      const antwoord = await alsBeheerder('post', `/${id}/days/${dagId}/activities`).send({
        activityType: 'borrel',
        title: 'Napraten',
      });
      expect(antwoord.status).toBe(400);
    });

    it('voegt geen activiteit toe aan een dag van een andere reis', async () => {
      const eerste = await maakReis();
      const tweede = await maakReis({ name: 'Tweede reis' });
      const dagVanEerste = await eersteDag(eerste);

      const antwoord = await alsBeheerder('post', `/${tweede}/days/${dagVanEerste}/activities`).send({
        activityType: 'meal',
        title: 'Diner',
      });
      expect(antwoord.status).toBe(404);
    });

    it('verwijdert een activiteit', async () => {
      const id = await maakReis();
      const dagId = await eersteDag(id);
      const gemaakt = await alsBeheerder('post', `/${id}/days/${dagId}/activities`).send({
        activityType: 'meal',
        title: 'Ontbijt',
      });

      const antwoord = await alsBeheerder('delete', `/${id}/days/${dagId}/activities/${gemaakt.body.id}`);
      expect(antwoord.status).toBe(200);
      expect((await alsLid('get', `/${id}`)).body.days[0].activities).toEqual([]);
    });

    it('geeft 404 voor een activiteit die niet bestaat', async () => {
      const id = await maakReis();
      const dagId = await eersteDag(id);

      expect((await alsBeheerder('delete', `/${id}/days/${dagId}/activities/${uuidv4()}`)).status).toBe(404);
    });
  });

  describe('overnachtingen', () => {
    async function maakOvernachting(reisId: string) {
      return alsBeheerder('post', `/${reisId}/accommodations`).send({
        name: 'Hotel Praha',
        city: 'Praag',
        checkInDate: '2026-07-01',
        checkOutDate: '2026-07-04',
        costPerNight: 85,
      });
    }

    it('voegt een overnachting toe', async () => {
      const id = await maakReis();

      const antwoord = await maakOvernachting(id);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);

      const reis = await alsLid('get', `/${id}`);
      expect(reis.body.accommodations).toHaveLength(1);
      expect(reis.body.accommodations[0]).toMatchObject({ name: 'Hotel Praha', costPerNight: 85 });
    });

    it('weigert een ongeldig e-mailadres', async () => {
      const id = await maakReis();
      const antwoord = await alsBeheerder('post', `/${id}/accommodations`).send({
        name: 'Hotel',
        email: 'geen adres',
      });
      expect(antwoord.status).toBe(400);
    });

    it('voegt geen overnachting toe aan een reis van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const antwoord = await alsBeheerder('post', `/${vreemdeReis(andere.id)}/accommodations`).send({ name: 'Hotel' });
      expect(antwoord.status).toBe(404);
    });

    it('verwijdert een overnachting', async () => {
      const id = await maakReis();
      const gemaakt = await maakOvernachting(id);

      expect((await alsBeheerder('delete', `/${id}/accommodations/${gemaakt.body.id}`)).status).toBe(200);
      expect((await alsLid('get', `/${id}`)).body.accommodations).toEqual([]);
    });

    it('verwijdert geen overnachting van een reis van een andere vereniging', async () => {
      const id = await maakReis();
      const gemaakt = await maakOvernachting(id);
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, { email: `hotel-${uuidv4()}@test.nl`, role: 'admin' });

      const antwoord = await request(app)
        .delete(`/api/tours/${id}/accommodations/${gemaakt.body.id}`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`);

      expect(antwoord.status).toBe(404);
      expect((await alsLid('get', `/${id}`)).body.accommodations).toHaveLength(1);
    });

    it('geeft 404 voor een overnachting die niet bestaat', async () => {
      const id = await maakReis();
      expect((await alsBeheerder('delete', `/${id}/accommodations/${uuidv4()}`)).status).toBe(404);
    });
  });

  describe('vervoer', () => {
    async function maakVervoer(reisId: string) {
      return alsBeheerder('post', `/${reisId}/transport`).send({
        type: 'bus',
        from: 'Amsterdam',
        to: 'Praag',
        departureTime: '2026-07-01T08:00:00',
        arrivalTime: '2026-07-01T20:00:00',
      });
    }

    it('voegt vervoer toe', async () => {
      const id = await maakReis();

      const antwoord = await maakVervoer(id);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);

      const reis = await alsLid('get', `/${id}`);
      expect(reis.body.transport).toHaveLength(1);
      expect(reis.body.transport[0]).toMatchObject({
        transportType: 'bus',
        departureLocation: 'Amsterdam',
        arrivalLocation: 'Praag',
      });
    });

    it('weigert een vervoerssoort die niet bestaat', async () => {
      const id = await maakReis();
      const antwoord = await alsBeheerder('post', `/${id}/transport`).send({
        type: 'raket',
        from: 'A',
        to: 'B',
        departureTime: '2026-07-01T08:00:00',
        arrivalTime: '2026-07-01T09:00:00',
      });
      expect(antwoord.status).toBe(400);
    });

    it('verwijdert vervoer', async () => {
      const id = await maakReis();
      const gemaakt = await maakVervoer(id);

      expect((await alsBeheerder('delete', `/${id}/transport/${gemaakt.body.id}`)).status).toBe(200);
      expect((await alsLid('get', `/${id}`)).body.transport).toEqual([]);
    });

    it('verwijdert geen vervoer van een reis van een andere vereniging', async () => {
      const id = await maakReis();
      const gemaakt = await maakVervoer(id);
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, { email: `bus-${uuidv4()}@test.nl`, role: 'admin' });

      const antwoord = await request(app)
        .delete(`/api/tours/${id}/transport/${gemaakt.body.id}`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`);

      expect(antwoord.status).toBe(404);
      expect((await alsLid('get', `/${id}`)).body.transport).toHaveLength(1);
    });
  });

  it('vraagt overal om een geldige aanmelding', async () => {
    expect(lid.id).toBeTruthy();
    expect((await request(app).get('/api/tours')).status).toBe(401);
    expect((await request(app).post('/api/tours').send(geldigeReis)).status).toBe(401);
  });
});
