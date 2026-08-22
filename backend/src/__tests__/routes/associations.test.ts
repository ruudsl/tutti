/**
 * Verenigingen.
 *
 * Klein bestand, maar het raakt de kern van de multi-tenant opzet: hier wordt
 * de vereniging van de ingelogde gebruiker gelezen en hernoemd. De route mag
 * nooit een andere vereniging te pakken krijgen dan die uit het token, want
 * er komt geen id uit het pad of de body aan te pas - en dat moet zo blijven.
 *
 * De ledenteller in GET /current telt mee in de weergave van de vereniging;
 * die hoort alleen echte leden te tellen, geen verwijderde.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import '../setup';
import db from '../../database/connection';
import associationsRoutes from '../../routes/associations';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestOrchestra,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/associations', associationsRoutes);
app.use(errorHandler);

describe('verenigingen', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lidToken: string;
  let commissieToken: string;

  let andereVereniging: TestAssociation;
  let andereBeheerderToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;
    commissieToken = omgeving.musicCommitteeToken;

    // users.email is globaal uniek, dus de tweede vereniging krijgt een eigen
    // adres in plaats van nog een createTestEnvironment().
    andereVereniging = createTestAssociation({ name: 'Harmonie B' });
    const andereBeheerder = createTestUser(andereVereniging.id, {
      email: 'beheerder-b@test.com',
      role: 'admin',
    });
    andereBeheerderToken = generateTestToken(andereBeheerder);
  });

  type Methode = 'get' | 'post' | 'put';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/associations${pad}`).set('Authorization', `Bearer ${token}`);

  describe('GET /api/associations', () => {
    it('geeft de lijst met verenigingen aan een beheerder', async () => {
      const antwoord = await als(beheerderToken, 'get', '/');

      expect(antwoord.status).toBe(200);
      // Deze lijst is bewust verenigingsoverstijgend: hij bestaat om muziek te
      // kunnen delen met een andere vereniging. Alleen naam, id en datum, geen
      // instellingen of sleutels van die andere vereniging.
      const namen = antwoord.body.map((v: any) => v.name);
      expect(namen).toContain(vereniging.name);
      expect(namen).toContain('Harmonie B');
      expect(Object.keys(antwoord.body[0]).sort()).toEqual(['createdAt', 'id', 'name']);
    });

    it('weigert een gewoon lid', async () => {
      const antwoord = await als(lidToken, 'get', '/');

      expect(antwoord.status).toBe(403);
    });

    it('weigert de muziekcommissie', async () => {
      const antwoord = await als(commissieToken, 'get', '/');

      expect(antwoord.status).toBe(403);
    });

    it('weigert een verzoek zonder token', async () => {
      const antwoord = await request(app).get('/api/associations');

      expect(antwoord.status).toBe(401);
    });
  });

  describe('GET /api/associations/current', () => {
    it('geeft de eigen vereniging met aantallen', async () => {
      createTestOrchestra(vereniging.id);
      createTestOrchestra(andereVereniging.id);

      const antwoord = await als(lidToken, 'get', '/current');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.id).toBe(vereniging.id);
      // createTestEnvironment maakt beheerder, lid en commissielid aan.
      expect(antwoord.body.memberCount).toBe(3);
      // Het orkest van de andere vereniging mag niet meetellen.
      expect(antwoord.body.orchestraCount).toBe(1);
    });

    it('geeft de andere beheerder zijn eigen vereniging, niet die van de aanvrager', async () => {
      const antwoord = await als(andereBeheerderToken, 'get', '/current');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.id).toBe(andereVereniging.id);
      expect(antwoord.body.name).toBe('Harmonie B');
    });

    it('telt een verwijderd lid niet mee', async () => {
      const oudLid = createTestUser(vereniging.id, { email: 'vertrokken@test.com' });
      db.prepare("UPDATE users SET deleted_at = CURRENT_TIMESTAMP, status = 'inactive' WHERE id = ?").run(oudLid.id);

      const antwoord = await als(lidToken, 'get', '/current');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.memberCount).toBe(3);
    });

    it('geeft 404 als de gebruiker geen vereniging heeft', async () => {
      const zonderVereniging = generateTestToken({ ...beheerder, associationId: null as unknown as string });

      const antwoord = await als(zonderVereniging, 'get', '/current');

      expect(antwoord.status).toBe(404);
    });
  });

  describe('PUT /api/associations/current', () => {
    it('hernoemt de eigen vereniging', async () => {
      const antwoord = await als(beheerderToken, 'put', '/current').send({ name: '  Fanfare Nieuw  ' });

      expect(antwoord.status).toBe(200);
      const rij = db.prepare('SELECT name FROM associations WHERE id = ?').get(vereniging.id) as any;
      // De naam wordt getrimd opgeslagen, anders staat er een naam met spaties
      // in de lijst waar niemand op kan zoeken.
      expect(rij.name).toBe('Fanfare Nieuw');
    });

    it('raakt de andere vereniging niet aan', async () => {
      await als(beheerderToken, 'put', '/current').send({ name: 'Fanfare Nieuw' });

      const rij = db.prepare('SELECT name FROM associations WHERE id = ?').get(andereVereniging.id) as any;
      expect(rij.name).toBe('Harmonie B');
    });

    it('werkt de vereniging uit het token bij, ook als de body een ander id noemt', async () => {
      // De route kent geen id-parameter; een id in de body hoort genegeerd te
      // worden in plaats van te bepalen welke rij wordt bijgewerkt.
      const antwoord = await als(beheerderToken, 'put', '/current').send({
        name: 'Fanfare Nieuw',
        id: andereVereniging.id,
        associationId: andereVereniging.id,
      });

      expect(antwoord.status).toBe(200);
      expect((db.prepare('SELECT name FROM associations WHERE id = ?').get(andereVereniging.id) as any).name).toBe(
        'Harmonie B',
      );
      expect((db.prepare('SELECT name FROM associations WHERE id = ?').get(vereniging.id) as any).name).toBe(
        'Fanfare Nieuw',
      );
    });

    it('weigert een naam die een andere vereniging al heeft, ongeacht hoofdletters', async () => {
      const antwoord = await als(beheerderToken, 'put', '/current').send({ name: 'harmonie b' });

      expect(antwoord.status).toBe(409);
      const rij = db.prepare('SELECT name FROM associations WHERE id = ?').get(vereniging.id) as any;
      expect(rij.name).toBe(vereniging.name);
    });

    it('staat het opnieuw opslaan van de eigen naam toe', async () => {
      const antwoord = await als(beheerderToken, 'put', '/current').send({ name: vereniging.name });

      expect(antwoord.status).toBe(200);
    });

    it('weigert een lege naam', async () => {
      const antwoord = await als(beheerderToken, 'put', '/current').send({ name: '' });

      expect(antwoord.status).toBe(400);
    });

    it('weigert een verzoek zonder naam', async () => {
      const antwoord = await als(beheerderToken, 'put', '/current').send({});

      expect(antwoord.status).toBe(400);
    });

    it('weigert een hernoeming door een gewoon lid', async () => {
      const antwoord = await als(lidToken, 'put', '/current').send({ name: 'Overgenomen' });

      expect(antwoord.status).toBe(403);
      const rij = db.prepare('SELECT name FROM associations WHERE id = ?').get(vereniging.id) as any;
      expect(rij.name).toBe(vereniging.name);
    });
  });

  describe('POST /api/associations', () => {
    it('maakt een nieuwe vereniging aan', async () => {
      const antwoord = await als(beheerderToken, 'post', '/').send({ name: '  Nieuwe Fanfare  ' });

      expect(antwoord.status).toBe(201);
      const rij = db.prepare('SELECT name FROM associations WHERE id = ?').get(antwoord.body.id) as any;
      expect(rij.name).toBe('Nieuwe Fanfare');
    });

    it('laat de eigen vereniging van de aanmaker ongemoeid', async () => {
      await als(beheerderToken, 'post', '/').send({ name: 'Nieuwe Fanfare' });

      const rij = db.prepare('SELECT name FROM associations WHERE id = ?').get(vereniging.id) as any;
      expect(rij.name).toBe(vereniging.name);
    });

    it('weigert een naam die al bestaat, ongeacht hoofdletters', async () => {
      const antwoord = await als(beheerderToken, 'post', '/').send({ name: 'HARMONIE B' });

      expect(antwoord.status).toBe(409);
      const aantal = db.prepare('SELECT COUNT(*) AS aantal FROM associations').get() as { aantal: number };
      expect(aantal.aantal).toBe(2);
    });

    it('weigert een lege naam', async () => {
      const antwoord = await als(beheerderToken, 'post', '/').send({ name: '' });

      expect(antwoord.status).toBe(400);
    });

    it('weigert een gewoon lid', async () => {
      const antwoord = await als(lidToken, 'post', '/').send({ name: 'Van een lid' });

      expect(antwoord.status).toBe(403);
      const aantal = db.prepare('SELECT COUNT(*) AS aantal FROM associations').get() as { aantal: number };
      expect(aantal.aantal).toBe(2);
    });
  });
});
