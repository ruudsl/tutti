/**
 * Beschikbaarheid: wanneer kan een lid wel en niet, en wat ziet de dirigent.
 *
 * 359 regels zonder test. Het eigen deel is netjes op user_id gezet, maar het
 * overzicht voor de dirigent had een fout die pas opvalt als iemand de
 * vereniging verlaat:
 *
 *     WHERE u.association_id = ? AND u.role != 'inactive'
 *
 * `inactive` is een waarde van `status`, niet van `role`. Die voorwaarde is
 * dus altijd waar en sloot niemand uit, terwijl uitschrijven in onboarding.ts
 * juist `status = 'inactive'` zet. Wie de vereniging had verlaten stond nog
 * gewoon in het overzicht, en telde mee in de samenvatting eronder. Leden die
 * onder de AVG waren verwijderd trouwens ook: op deleted_at werd niet
 * gefilterd.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import '../setup';
import db from '../../database/connection';
import availabilityRoutes from '../../routes/availability';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestOrchestra,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestOrchestra,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/availability', availabilityRoutes);
app.use(errorHandler);

describe('beschikbaarheid', () => {
  let vereniging: TestAssociation;
  let orkest: TestOrchestra;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;
  let anderLid: TestUser;
  let anderLidToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    anderLid = omgeving.musicCommitteeUser;
    anderLidToken = omgeving.musicCommitteeToken;
    orkest = createTestOrchestra(vereniging.id, { name: 'Harmonieorkest' });
  });

  type Methode = 'get' | 'post' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/availability${pad}`).set('Authorization', `Bearer ${token}`);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  const OP = '2026-09-15';

  describe('eigen beschikbaarheid', () => {
    it('zet een datum op beschikbaar', async () => {
      const antwoord = await alsLid('post', '/').send({ date: OP, status: 'available' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    });

    it('geeft de eigen opgave terug', async () => {
      await alsLid('post', '/').send({ date: OP, status: 'unavailable', notes: 'Vakantie' });
      const antwoord = await alsLid('get', '/');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0]).toMatchObject({ date: OP, status: 'unavailable', notes: 'Vakantie' });
    });

    it('werkt een bestaande opgave bij in plaats van er een tweede te maken', async () => {
      await alsLid('post', '/').send({ date: OP, status: 'available' });
      await alsLid('post', '/').send({ date: OP, status: 'maybe' });

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].status).toBe('maybe');
    });

    it('weigert een status die niet bestaat', async () => {
      const antwoord = await alsLid('post', '/').send({ date: OP, status: 'misschien-wel' });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een opgave zonder datum', async () => {
      expect((await alsLid('post', '/').send({ status: 'available' })).status).toBe(400);
    });

    it('geeft de opgave van een ander lid niet terug', async () => {
      await als(anderLidToken, 'post', '/').send({ date: OP, status: 'unavailable' });
      const antwoord = await alsLid('get', '/');
      expect(antwoord.body).toHaveLength(0);
    });

    it('filtert op een periode', async () => {
      await alsLid('post', '/').send({ date: '2026-09-01', status: 'available' });
      await alsLid('post', '/').send({ date: '2026-10-01', status: 'available' });

      const antwoord = await alsLid('get', '/?fromDate=2026-09-15&toDate=2026-12-31');
      expect(antwoord.body.map((a: { date: string }) => a.date)).toEqual(['2026-10-01']);
    });

    it('verwijdert een eigen opgave', async () => {
      await alsLid('post', '/').send({ date: OP, status: 'available' });
      expect((await alsLid('delete', `/${OP}`)).status).toBe(200);
      expect((await alsLid('get', '/')).body).toHaveLength(0);
    });

    it('verwijdert niet de opgave van een ander lid', async () => {
      await als(anderLidToken, 'post', '/').send({ date: OP, status: 'available' });
      expect((await alsLid('delete', `/${OP}`)).status).toBe(404);
      expect((await als(anderLidToken, 'get', '/')).body).toHaveLength(1);
    });

    it('weigert een verzoek zonder token', async () => {
      expect((await request(app).get('/api/availability')).status).toBe(401);
    });
  });

  describe('meer datums tegelijk', () => {
    it('zet een reeks datums in een keer', async () => {
      const antwoord = await alsLid('post', '/bulk').send({
        dates: ['2026-09-01', '2026-09-08', '2026-09-15'],
        status: 'unavailable',
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect((await alsLid('get', '/')).body).toHaveLength(3);
    });

    it('weigert een lege lijst', async () => {
      expect((await alsLid('post', '/bulk').send({ dates: [], status: 'available' })).status).toBe(400);
    });

    it('weigert meer dan negentig datums', async () => {
      const dates = Array.from({ length: 91 }, (_, i) => `2026-${String((i % 12) + 1).padStart(2, '0')}-01`);
      expect((await alsLid('post', '/bulk').send({ dates, status: 'available' })).status).toBe(400);
    });

    it('weigert een datum in een ander formaat', async () => {
      const antwoord = await alsLid('post', '/bulk').send({ dates: ['15-09-2026'], status: 'available' });
      expect(antwoord.status).toBe(400);
    });

    it('overschrijft een bestaande opgave', async () => {
      await alsLid('post', '/').send({ date: OP, status: 'available' });
      await alsLid('post', '/bulk').send({ dates: [OP], status: 'unavailable' });

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].status).toBe('unavailable');
    });
  });

  describe('het overzicht voor de dirigent', () => {
    it('is niet voor een gewoon lid', async () => {
      expect((await alsLid('get', `/team?date=${OP}`)).status).toBe(403);
    });

    it('vraagt om een datum', async () => {
      expect((await als(beheerderToken, 'get', '/team')).status).toBe(400);
    });

    it('toont elk lid, ook wie niets heeft opgegeven', async () => {
      await alsLid('post', '/').send({ date: OP, status: 'available' });
      const antwoord = await als(beheerderToken, 'get', `/team?date=${OP}`);

      const standen = Object.fromEntries(
        antwoord.body.members.map((m: { userId: string; status: string }) => [m.userId, m.status]),
      );
      expect(standen[lid.id]).toBe('available');
      expect(standen[anderLid.id]).toBe('unknown');
    });

    it('telt de standen op', async () => {
      await alsLid('post', '/').send({ date: OP, status: 'available' });
      await als(anderLidToken, 'post', '/').send({ date: OP, status: 'maybe' });

      const antwoord = await als(beheerderToken, 'get', `/team?date=${OP}`);
      expect(antwoord.body.summary).toMatchObject({ available: 1, maybe: 1, unavailable: 0, unknown: 1 });
    });

    it('toont geen lid van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: 'Andere vereniging' });
      createTestUser(andere.id, { email: 'elders@test.nl', firstName: 'Ver', lastName: 'Weg' });

      const antwoord = await als(beheerderToken, 'get', `/team?date=${OP}`);
      const namen = antwoord.body.members.map((m: { lastName: string }) => m.lastName);
      expect(namen).not.toContain('Weg');
    });

    it('toont geen lid dat is uitgeschreven', async () => {
      const vertrokken = createTestUser(vereniging.id, {
        email: 'vertrokken@test.nl',
        firstName: 'Al',
        lastName: 'Vertrokken',
      });
      db.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(vertrokken.id);

      const antwoord = await als(beheerderToken, 'get', `/team?date=${OP}`);
      const namen = antwoord.body.members.map((m: { lastName: string }) => m.lastName);
      expect(namen).not.toContain('Vertrokken');
    });

    it('toont geen lid dat is verwijderd', async () => {
      const weg = createTestUser(vereniging.id, { email: 'weg@test.nl', firstName: 'Weg', lastName: 'Gehaald' });
      db.prepare('UPDATE users SET deleted_at = ? WHERE id = ?').run('2026-01-01 12:00:00', weg.id);

      const antwoord = await als(beheerderToken, 'get', `/team?date=${OP}`);
      const namen = antwoord.body.members.map((m: { lastName: string }) => m.lastName);
      expect(namen).not.toContain('Gehaald');
    });

    it('telt een uitgeschreven lid ook niet mee in de samenvatting', async () => {
      const vertrokken = createTestUser(vereniging.id, { email: 'v@test.nl', lastName: 'Vertrokken' });
      db.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(vertrokken.id);

      const antwoord = await als(beheerderToken, 'get', `/team?date=${OP}`);
      expect(antwoord.body.summary.total).toBe(3);
    });

    it('filtert op orkest', async () => {
      db.prepare('INSERT INTO user_orchestras (user_id, orchestra_id) VALUES (?, ?)').run(lid.id, orkest.id);

      const antwoord = await als(beheerderToken, 'get', `/team?date=${OP}&orchestraId=${orkest.id}`);
      expect(antwoord.body.members.map((m: { userId: string }) => m.userId)).toEqual([lid.id]);
    });

    it('geeft niets bij een orkest van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: 'Andere vereniging' });
      const anderOrkest = createTestOrchestra(andere.id, { name: 'Fanfare Elders' });
      const elders = createTestUser(andere.id, { email: 'e@test.nl' });
      db.prepare('INSERT INTO user_orchestras (user_id, orchestra_id) VALUES (?, ?)').run(elders.id, anderOrkest.id);

      const antwoord = await als(beheerderToken, 'get', `/team?date=${OP}&orchestraId=${anderOrkest.id}`);
      expect(antwoord.body.members).toHaveLength(0);
    });
  });
});
