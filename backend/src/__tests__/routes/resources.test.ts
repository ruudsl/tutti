/**
 * Zalen, voertuigen en andere spullen die je kunt reserveren.
 *
 * Het zwaartepunt ligt hier bij het dubbel boeken: twee reserveringen die
 * elkaar overlappen betekenen twee groepen die tegelijk in dezelfde zaal
 * staan. De randgevallen van dat overlapvenster - aansluitend boeken mag,
 * één minuut overlap niet - staan daarom uitgebreid in de tests.
 *
 * DELETE /resources/:id/availability/:availId keek daarnaast alleen naar het
 * id van de resource en niet naar de vereniging, terwijl de route die zulke
 * regels toevoegt dat wel doet.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import resourcesRoutes from '../../routes/resources';
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
app.use('/api/resources', resourcesRoutes);
app.use(errorHandler);

describe('reserveerbare spullen', () => {
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
    request(app)[methode](`/api/resources${pad}`).set('Authorization', `Bearer ${token}`);
  const alsBeheerder = (methode: Methode, pad: string) => als(beheerderToken, methode, pad);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  async function maakResource(overrides: Record<string, unknown> = {}): Promise<string> {
    const antwoord = await alsBeheerder('post', '/').send({
      name: 'Grote zaal',
      resourceType: 'room',
      ...overrides,
    });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    return antwoord.body.id;
  }

  async function boek(resourceId: string, start: string, eind: string, token = lidToken) {
    return als(token, 'post', '/bookings').send({
      resourceId,
      title: 'Repetitie',
      startDatetime: start,
      endDatetime: eind,
    });
  }

  /** Een resource van een andere vereniging, rechtstreeks in de database. */
  function vreemdeResource(associationId: string): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO resources (id, association_id, name, resource_type, is_active)
       VALUES (?, ?, 'Zaal van de buren', 'room', 1)`,
    ).run(id, associationId);
    return id;
  }

  describe('categorieën', () => {
    it('begint leeg', async () => {
      const antwoord = await alsLid('get', '/categories');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual([]);
    });

    it('maakt een categorie aan en telt de resources erin', async () => {
      const categorie = await alsBeheerder('post', '/categories').send({ name: 'Zalen', color: '#00ff00' });
      expect(categorie.status, JSON.stringify(categorie.body)).toBe(201);
      await maakResource({ categoryId: categorie.body.id });

      const antwoord = await alsLid('get', '/categories');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0]).toMatchObject({ name: 'Zalen', resourceCount: 1 });
    });

    it('weigert een categorie zonder naam', async () => {
      expect((await alsBeheerder('post', '/categories').send({})).status).toBe(400);
    });

    it('meldt een dubbele categorienaam met een eigen tekst', async () => {
      await alsBeheerder('post', '/categories').send({ name: 'Zalen' });

      // Deze tak werd nooit genomen: de route keek naar err.code, en sql.js
      // zet die niet. De melding kwam dus nooit bij de gebruiker aan.
      const tweede = await alsBeheerder('post', '/categories').send({ name: 'Zalen' });
      expect(tweede.status).toBe(409);
      expect(tweede.body.error).toBe('Categorie met deze naam bestaat al');
    });

    it('houdt een gewoon lid van het aanmaken af', async () => {
      expect((await alsLid('post', '/categories').send({ name: 'Van mij' })).status).toBe(403);
    });

    it('toont geen categorie van een andere vereniging', async () => {
      await alsBeheerder('post', '/categories').send({ name: 'Eigen' });
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      db.prepare('INSERT INTO resource_categories (id, association_id, name) VALUES (?, ?, ?)').run(
        uuidv4(),
        andere.id,
        'Van de buren',
      );

      const antwoord = await alsLid('get', '/categories');
      expect(antwoord.body.map((c: { name: string }) => c.name)).toEqual(['Eigen']);
    });

    it('verwijdert geen categorie van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = uuidv4();
      db.prepare('INSERT INTO resource_categories (id, association_id, name) VALUES (?, ?, ?)').run(
        vreemd,
        andere.id,
        'Van de buren',
      );

      expect((await alsBeheerder('delete', `/categories/${vreemd}`)).status).toBe(404);
    });
  });

  describe('resources', () => {
    it('maakt een resource aan', async () => {
      const id = await maakResource({ location: 'Dorpshuis', capacity: 80 });

      const antwoord = await alsLid('get', `/${id}`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toMatchObject({
        name: 'Grote zaal',
        resourceType: 'room',
        location: 'Dorpshuis',
        capacity: 80,
        isActive: true,
        requiresApproval: false,
      });
    });

    it('weigert een soort die niet bestaat', async () => {
      expect((await alsBeheerder('post', '/').send({ name: 'Iets', resourceType: 'boot' })).status).toBe(400);
    });

    it('weigert een resource zonder naam', async () => {
      expect((await alsBeheerder('post', '/').send({ resourceType: 'room' })).status).toBe(400);
    });

    it('houdt een gewoon lid van het aanmaken af', async () => {
      expect((await alsLid('post', '/').send({ name: 'Van mij', resourceType: 'room' })).status).toBe(403);
    });

    it('filtert op soort', async () => {
      await maakResource({ resourceType: 'room' });
      await maakResource({ name: 'Busje', resourceType: 'vehicle' });

      const antwoord = await alsLid('get', '/?type=vehicle');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].name).toBe('Busje');
    });

    it('filtert op categorie', async () => {
      const categorie = await alsBeheerder('post', '/categories').send({ name: 'Zalen' });
      await maakResource({ categoryId: categorie.body.id });
      await maakResource({ name: 'Busje', resourceType: 'vehicle' });

      const antwoord = await alsLid('get', `/?categoryId=${categorie.body.id}`);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].name).toBe('Grote zaal');
    });

    it('toont geen resource van een andere vereniging', async () => {
      await maakResource();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      vreemdeResource(andere.id);

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body.map((r: { name: string }) => r.name)).toEqual(['Grote zaal']);
    });

    it('geeft 404 voor een resource van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      expect((await alsLid('get', `/${vreemdeResource(andere.id)}`)).status).toBe(404);
    });

    it('werkt een resource bij', async () => {
      const id = await maakResource();

      const antwoord = await alsBeheerder('patch', `/${id}`).send({ capacity: 120, location: 'Kerkzaal' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const na = await alsLid('get', `/${id}`);
      expect(na.body).toMatchObject({ capacity: 120, location: 'Kerkzaal', name: 'Grote zaal' });
    });

    it('werkt geen resource van een andere vereniging bij', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      expect((await alsBeheerder('patch', `/${vreemdeResource(andere.id)}`).send({ capacity: 1 })).status).toBe(404);
    });

    it('markeert een resource als verwijderd en zet hem inactief', async () => {
      const id = await maakResource();

      expect((await alsBeheerder('delete', `/${id}`)).status).toBe(200);
      expect((await alsLid('get', '/')).body).toEqual([]);

      const rij = db.prepare('SELECT deleted_at, is_active FROM resources WHERE id = ?').get(id) as {
        deleted_at: string | null;
        is_active: number;
      };
      expect(rij.deleted_at).not.toBeNull();
      expect(rij.is_active).toBe(0);
    });

    it('verwijdert een resource niet twee keer', async () => {
      const id = await maakResource();
      await alsBeheerder('delete', `/${id}`);
      expect((await alsBeheerder('delete', `/${id}`)).status).toBe(404);
    });
  });

  describe('beschikbaarheid', () => {
    async function maakRegel(resourceId: string) {
      return alsBeheerder('post', `/${resourceId}/availability`).send({
        availabilityType: 'blocked',
        dayOfWeek: 0,
        reason: 'Zondag dicht',
      });
    }

    it('voegt een regel toe', async () => {
      const id = await maakResource();

      const antwoord = await maakRegel(id);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);

      const resource = await alsLid('get', `/${id}`);
      expect(resource.body.availability).toHaveLength(1);
      expect(resource.body.availability[0]).toMatchObject({ availabilityType: 'blocked', dayOfWeek: 0 });
    });

    it('weigert een soort regel die niet bestaat', async () => {
      const id = await maakResource();
      const antwoord = await alsBeheerder('post', `/${id}/availability`).send({ availabilityType: 'misschien' });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een dag buiten de week', async () => {
      const id = await maakResource();
      const antwoord = await alsBeheerder('post', `/${id}/availability`).send({
        availabilityType: 'blocked',
        dayOfWeek: 9,
      });
      expect(antwoord.status).toBe(400);
    });

    it('voegt geen regel toe aan een resource van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const antwoord = await alsBeheerder('post', `/${vreemdeResource(andere.id)}/availability`).send({
        availabilityType: 'blocked',
      });
      expect(antwoord.status).toBe(404);
    });

    it('verwijdert een regel', async () => {
      const id = await maakResource();
      const regel = await maakRegel(id);

      expect((await alsBeheerder('delete', `/${id}/availability/${regel.body.id}`)).status).toBe(200);
      expect((await alsLid('get', `/${id}`)).body.availability).toEqual([]);
    });

    it('verwijdert geen regel van een resource van een andere vereniging', async () => {
      const id = await maakResource();
      const regel = await maakRegel(id);
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, { email: `res-${uuidv4()}@test.nl`, role: 'admin' });

      const antwoord = await request(app)
        .delete(`/api/resources/${id}/availability/${regel.body.id}`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`);

      expect(antwoord.status).toBe(404);
      expect((await alsLid('get', `/${id}`)).body.availability).toHaveLength(1);
    });

    it('geeft 404 voor een regel die niet bestaat', async () => {
      const id = await maakResource();
      expect((await alsBeheerder('delete', `/${id}/availability/${uuidv4()}`)).status).toBe(404);
    });
  });

  describe('boeken', () => {
    it('bevestigt een boeking meteen als er geen goedkeuring nodig is', async () => {
      const id = await maakResource();

      const antwoord = await boek(id, '2026-10-01T19:00:00', '2026-10-01T22:00:00');
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
      expect(antwoord.body.status).toBe('approved');
    });

    it('zet een boeking in de wacht als er goedkeuring nodig is', async () => {
      const id = await maakResource({ requiresApproval: true });

      const antwoord = await boek(id, '2026-10-01T19:00:00', '2026-10-01T22:00:00');
      expect(antwoord.body.status).toBe('pending');
    });

    it('weigert een boeking die overlapt', async () => {
      const id = await maakResource();
      await boek(id, '2026-10-01T19:00:00', '2026-10-01T22:00:00');

      const tweede = await boek(id, '2026-10-01T21:00:00', '2026-10-01T23:00:00');
      expect(tweede.status).toBe(400);
    });

    it('laat een boeking toe die er precies op aansluit', async () => {
      const id = await maakResource();
      await boek(id, '2026-10-01T19:00:00', '2026-10-01T22:00:00');

      const tweede = await boek(id, '2026-10-01T22:00:00', '2026-10-01T23:00:00');
      expect(tweede.status, JSON.stringify(tweede.body)).toBe(201);
    });

    it('laat een boeking toe die er precies voor eindigt', async () => {
      const id = await maakResource();
      await boek(id, '2026-10-01T19:00:00', '2026-10-01T22:00:00');

      const eerder = await boek(id, '2026-10-01T17:00:00', '2026-10-01T19:00:00');
      expect(eerder.status).toBe(201);
    });

    it('weigert een boeking die er een minuut overheen loopt', async () => {
      const id = await maakResource();
      await boek(id, '2026-10-01T19:00:00', '2026-10-01T22:00:00');

      const tweede = await boek(id, '2026-10-01T21:59:00', '2026-10-01T23:00:00');
      expect(tweede.status).toBe(400);
    });

    it('geeft het tijdslot vrij zodra een boeking is geannuleerd', async () => {
      const id = await maakResource();
      const eerste = await boek(id, '2026-10-01T19:00:00', '2026-10-01T22:00:00');
      await alsLid('delete', `/bookings/${eerste.body.id}`);

      const tweede = await boek(id, '2026-10-01T19:00:00', '2026-10-01T22:00:00');
      expect(tweede.status, JSON.stringify(tweede.body)).toBe(201);
    });

    it('boekt niets op een resource van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const antwoord = await boek(vreemdeResource(andere.id), '2026-10-01T19:00:00', '2026-10-01T22:00:00');
      expect(antwoord.status).toBe(404);
    });

    it('boekt niets op een resource die niet actief is', async () => {
      const id = await maakResource();
      await alsBeheerder('delete', `/${id}`);

      const antwoord = await boek(id, '2026-10-01T19:00:00', '2026-10-01T22:00:00');
      expect(antwoord.status).toBe(404);
    });

    it('weigert een boeking zonder titel', async () => {
      const id = await maakResource();
      const antwoord = await alsLid('post', '/bookings').send({
        resourceId: id,
        startDatetime: '2026-10-01T19:00:00',
        endDatetime: '2026-10-01T22:00:00',
      });
      expect(antwoord.status).toBe(400);
    });
  });

  describe('boekingen bekijken', () => {
    it('toont de boekingen met de naam van de boeker', async () => {
      const id = await maakResource();
      await boek(id, '2026-10-01T19:00:00', '2026-10-01T22:00:00');

      const antwoord = await alsLid('get', '/bookings');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0]).toMatchObject({ resourceName: 'Grote zaal', userId: lid.id, title: 'Repetitie' });
    });

    it('filtert op eigen boekingen', async () => {
      const id = await maakResource();
      await boek(id, '2026-10-01T19:00:00', '2026-10-01T22:00:00', lidToken);
      await boek(id, '2026-10-02T19:00:00', '2026-10-02T22:00:00', beheerderToken);

      const antwoord = await alsLid('get', '/bookings?myBookings=true');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].userId).toBe(lid.id);
    });

    it('filtert op resource', async () => {
      const eerste = await maakResource();
      const tweede = await maakResource({ name: 'Kleine zaal' });
      await boek(eerste, '2026-10-01T19:00:00', '2026-10-01T22:00:00');
      await boek(tweede, '2026-10-02T19:00:00', '2026-10-02T22:00:00');

      const antwoord = await alsLid('get', `/bookings?resourceId=${tweede}`);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].resourceName).toBe('Kleine zaal');
    });

    it('filtert op status', async () => {
      const id = await maakResource({ requiresApproval: true });
      await boek(id, '2026-10-01T19:00:00', '2026-10-01T22:00:00');

      expect((await alsLid('get', '/bookings?status=pending')).body).toHaveLength(1);
      expect((await alsLid('get', '/bookings?status=approved')).body).toEqual([]);
    });

    it('toont geen boeking van een andere vereniging', async () => {
      const id = await maakResource();
      await boek(id, '2026-10-01T19:00:00', '2026-10-01T22:00:00');
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereGebruiker = createTestUser(andere.id, { email: `boek-${uuidv4()}@test.nl` });

      const antwoord = await request(app)
        .get('/api/resources/bookings')
        .set('Authorization', `Bearer ${generateTestToken(andereGebruiker)}`);

      expect(antwoord.body).toEqual([]);
    });
  });

  describe('goedkeuren, afwijzen en annuleren', () => {
    async function wachtendeBoeking(): Promise<{ resourceId: string; bookingId: string }> {
      const resourceId = await maakResource({ requiresApproval: true });
      const boeking = await boek(resourceId, '2026-10-01T19:00:00', '2026-10-01T22:00:00');
      expect(boeking.status, JSON.stringify(boeking.body)).toBe(201);
      return { resourceId, bookingId: boeking.body.id };
    }

    it('keurt een boeking goed', async () => {
      const { bookingId } = await wachtendeBoeking();

      const antwoord = await alsBeheerder('patch', `/bookings/${bookingId}/approve`);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const rij = db.prepare('SELECT status, approved_by FROM resource_bookings WHERE id = ?').get(bookingId) as {
        status: string;
        approved_by: string;
      };
      expect(rij).toMatchObject({ status: 'approved', approved_by: beheerder.id });
    });

    it('keurt een boeking niet twee keer goed', async () => {
      const { bookingId } = await wachtendeBoeking();
      await alsBeheerder('patch', `/bookings/${bookingId}/approve`);

      expect((await alsBeheerder('patch', `/bookings/${bookingId}/approve`)).status).toBe(400);
    });

    it('wijst een boeking af met reden', async () => {
      const { bookingId } = await wachtendeBoeking();

      const antwoord = await alsBeheerder('patch', `/bookings/${bookingId}/reject`).send({ reason: 'Al verhuurd' });
      expect(antwoord.status).toBe(200);

      const rij = db.prepare('SELECT status, rejection_reason FROM resource_bookings WHERE id = ?').get(bookingId) as {
        status: string;
        rejection_reason: string;
      };
      expect(rij).toMatchObject({ status: 'rejected', rejection_reason: 'Al verhuurd' });
    });

    it('geeft het tijdslot vrij na een afwijzing', async () => {
      const { resourceId, bookingId } = await wachtendeBoeking();
      await alsBeheerder('patch', `/bookings/${bookingId}/reject`).send({});

      const tweede = await boek(resourceId, '2026-10-01T19:00:00', '2026-10-01T22:00:00');
      expect(tweede.status, JSON.stringify(tweede.body)).toBe(201);
    });

    it('laat goedkeuren niet aan een gewoon lid over', async () => {
      const { bookingId } = await wachtendeBoeking();
      expect((await alsLid('patch', `/bookings/${bookingId}/approve`)).status).toBe(403);
    });

    it('keurt geen boeking van een andere vereniging goed', async () => {
      const { bookingId } = await wachtendeBoeking();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, { email: `keur-${uuidv4()}@test.nl`, role: 'admin' });

      const antwoord = await request(app)
        .patch(`/api/resources/bookings/${bookingId}/approve`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`);

      expect(antwoord.status).toBe(404);
    });

    it('laat de boeker zijn eigen boeking annuleren', async () => {
      const id = await maakResource();
      const boeking = await boek(id, '2026-10-01T19:00:00', '2026-10-01T22:00:00');

      expect((await alsLid('delete', `/bookings/${boeking.body.id}`)).status).toBe(200);
    });

    it('laat een ander lid de boeking niet annuleren', async () => {
      const id = await maakResource();
      const boeking = await boek(id, '2026-10-01T19:00:00', '2026-10-01T22:00:00');
      const anderLid = createTestUser(vereniging.id, { email: `ander-${uuidv4()}@test.nl` });

      const antwoord = await request(app)
        .delete(`/api/resources/bookings/${boeking.body.id}`)
        .set('Authorization', `Bearer ${generateTestToken(anderLid)}`);

      expect(antwoord.status).toBe(403);
    });

    it('laat een beheerder de boeking van een ander annuleren', async () => {
      const id = await maakResource();
      const boeking = await boek(id, '2026-10-01T19:00:00', '2026-10-01T22:00:00');

      expect((await alsBeheerder('delete', `/bookings/${boeking.body.id}`)).status).toBe(200);
    });

    it('annuleert geen boeking van een andere vereniging', async () => {
      const id = await maakResource();
      const boeking = await boek(id, '2026-10-01T19:00:00', '2026-10-01T22:00:00');
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, { email: `ann-${uuidv4()}@test.nl`, role: 'admin' });

      const antwoord = await request(app)
        .delete(`/api/resources/bookings/${boeking.body.id}`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`);

      expect(antwoord.status).toBe(404);
    });
  });

  it('vraagt overal om een geldige aanmelding', async () => {
    expect((await request(app).get('/api/resources')).status).toBe(401);
    expect((await request(app).get('/api/resources/bookings')).status).toBe(401);
  });
});
