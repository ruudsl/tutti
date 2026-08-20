/**
 * Seizoensplanning: sjablonen, seizoenen, hun evenementen en het in één keer
 * uitrollen van een jaar repetities.
 *
 * 732 regels zonder test. Twee dingen zijn hier het gevoeligst. Het eerste is
 * /seasons/:id/generate: die maakt in één aanroep tientallen repetities aan,
 * en als de dubbelcontrole niet werkt staat de agenda van de hele vereniging
 * dubbel. Het tweede is het toegewezen budget, dat bij elk evenement wordt
 * opgeteld en bij verwijderen weer afgetrokken - een fout daarin loopt stil
 * op.
 *
 * De routes hangen achter een cache van tien minuten. Die varieert op
 * vereniging, en elke test krijgt een nieuwe vereniging, dus antwoorden lekken
 * niet van de ene test naar de andere.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import seasonsRoutes from '../../routes/seasons';
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
app.use('/api/seasons', seasonsRoutes);
app.use(errorHandler);

describe('seizoenen', () => {
  let vereniging: TestAssociation;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
  });

  type Methode = 'get' | 'post' | 'put' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/seasons${pad}`).set('Authorization', `Bearer ${token}`);
  const alsBeheerder = (methode: Methode, pad: string) => als(beheerderToken, methode, pad);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  async function maakSeizoen(overrides: Record<string, unknown> = {}): Promise<string> {
    const antwoord = await alsBeheerder('post', '/').send({
      name: 'Seizoen 2026-2027',
      startDate: '2026-09-01',
      endDate: '2027-06-30',
      ...overrides,
    });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    return antwoord.body.id;
  }

  async function maakSjabloon(overrides: Record<string, unknown> = {}): Promise<string> {
    const antwoord = await alsBeheerder('post', '/templates').send({ name: 'Standaardjaar', ...overrides });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    return antwoord.body.id;
  }

  /** Een seizoen van een andere vereniging, rechtstreeks in de database. */
  function vreemdSeizoen(associationId: string): string {
    const id = uuidv4();
    const maker = createTestUser(associationId, { email: `seizoen-${uuidv4()}@test.nl`, role: 'admin' });
    db.prepare(
      `INSERT INTO seasons (id, association_id, name, start_date, end_date, created_by)
       VALUES (?, ?, 'Seizoen van de buren', '2026-09-01', '2027-06-30', ?)`,
    ).run(id, associationId, maker.id);
    return id;
  }

  describe('sjablonen', () => {
    it('begint met een lege lijst', async () => {
      const antwoord = await alsBeheerder('get', '/templates');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual([]);
    });

    it('maakt een sjabloon met standaardwaarden', async () => {
      await maakSjabloon();

      const antwoord = await alsBeheerder('get', '/templates');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0]).toMatchObject({
        name: 'Standaardjaar',
        defaultRehearsalDuration: 120,
        typicalConcertsCount: 4,
      });
    });

    it('bewaart de repetitiegegevens van het sjabloon', async () => {
      await maakSjabloon({
        defaultRehearsalDay: 2,
        defaultRehearsalTime: '20:00',
        defaultRehearsalLocation: 'Dorpshuis',
        templateData: { thema: 'film' },
      });

      const antwoord = await alsBeheerder('get', '/templates');
      expect(antwoord.body[0]).toMatchObject({
        defaultRehearsalDay: 2,
        defaultRehearsalTime: '20:00',
        defaultRehearsalLocation: 'Dorpshuis',
        templateData: { thema: 'film' },
      });
    });

    it('weigert een sjabloon zonder naam', async () => {
      expect((await alsBeheerder('post', '/templates').send({})).status).toBe(400);
    });

    it('houdt een gewoon lid bij de sjablonen weg', async () => {
      expect((await alsLid('get', '/templates')).status).toBe(403);
      expect((await alsLid('post', '/templates').send({ name: 'Van mij' })).status).toBe(403);
    });

    it('werkt een sjabloon bij zonder de rest te wissen', async () => {
      const id = await maakSjabloon({ defaultRehearsalTime: '19:30' });

      const antwoord = await alsBeheerder('put', `/templates/${id}`).send({ name: 'Ander jaar' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const lijst = await alsBeheerder('get', '/templates');
      expect(lijst.body[0]).toMatchObject({ name: 'Ander jaar', defaultRehearsalTime: '19:30' });
    });

    it('werkt geen sjabloon van een andere vereniging bij', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const maker = createTestUser(andere.id, { email: `sj-${uuidv4()}@test.nl`, role: 'admin' });
      const vreemd = uuidv4();
      db.prepare('INSERT INTO season_templates (id, association_id, name, created_by) VALUES (?, ?, ?, ?)').run(
        vreemd,
        andere.id,
        'Van de buren',
        maker.id,
      );

      expect((await alsBeheerder('put', `/templates/${vreemd}`).send({ name: 'Gekaapt' })).status).toBe(404);
      expect((await alsBeheerder('delete', `/templates/${vreemd}`)).status).toBe(404);
    });

    it('verwijdert een sjabloon', async () => {
      const id = await maakSjabloon();

      expect((await alsBeheerder('delete', `/templates/${id}`)).status).toBe(200);
      expect((await alsBeheerder('get', '/templates')).body).toEqual([]);
    });

    it('verwijdert een sjabloon niet twee keer', async () => {
      const id = await maakSjabloon();
      await alsBeheerder('delete', `/templates/${id}`);
      expect((await alsBeheerder('delete', `/templates/${id}`)).status).toBe(404);
    });
  });

  describe('seizoenen', () => {
    it('begint met een lege lijst', async () => {
      const antwoord = await alsLid('get', '/');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual([]);
    });

    it('maakt een seizoen aan', async () => {
      const id = await maakSeizoen({ budgetTotal: 5000 });

      const antwoord = await alsLid('get', `/${id}`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toMatchObject({
        name: 'Seizoen 2026-2027',
        startDate: '2026-09-01',
        endDate: '2027-06-30',
        status: 'draft',
        budgetTotal: 5000,
      });
    });

    it('weigert een seizoen zonder datums', async () => {
      expect((await alsBeheerder('post', '/').send({ name: 'Half seizoen' })).status).toBe(400);
    });

    it('weigert een sjabloon van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const maker = createTestUser(andere.id, { email: `sj2-${uuidv4()}@test.nl`, role: 'admin' });
      const vreemd = uuidv4();
      db.prepare('INSERT INTO season_templates (id, association_id, name, created_by) VALUES (?, ?, ?, ?)').run(
        vreemd,
        andere.id,
        'Van de buren',
        maker.id,
      );

      const antwoord = await alsBeheerder('post', '/').send({
        name: 'Seizoen',
        startDate: '2026-09-01',
        endDate: '2027-06-30',
        templateId: vreemd,
      });
      expect(antwoord.status).toBe(400);
    });

    it('noemt de naam van het gekozen sjabloon', async () => {
      const sjabloonId = await maakSjabloon({ name: 'Jubileumjaar' });
      const id = await maakSeizoen({ templateId: sjabloonId });

      expect((await alsLid('get', `/${id}`)).body.templateName).toBe('Jubileumjaar');
    });

    it('houdt een gewoon lid van het aanmaken af', async () => {
      const antwoord = await alsLid('post', '/').send({
        name: 'Seizoen',
        startDate: '2026-09-01',
        endDate: '2027-06-30',
      });
      expect(antwoord.status).toBe(403);
    });

    it('toont het seizoen van een andere vereniging niet', async () => {
      await maakSeizoen();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      vreemdSeizoen(andere.id);

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body.map((s: { name: string }) => s.name)).toEqual(['Seizoen 2026-2027']);
    });

    it('geeft 404 voor een seizoen van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      expect((await alsLid('get', `/${vreemdSeizoen(andere.id)}`)).status).toBe(404);
    });

    it('filtert op status', async () => {
      const id = await maakSeizoen();
      await maakSeizoen({ name: 'Volgend seizoen' });
      await alsBeheerder('put', `/${id}`).send({ status: 'active' });

      const antwoord = await alsLid('get', '/?status=active');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].name).toBe('Seizoen 2026-2027');
    });

    it('werkt een enkel veld bij en laat de rest staan', async () => {
      const id = await maakSeizoen({ budgetTotal: 5000 });

      const antwoord = await alsBeheerder('put', `/${id}`).send({ notes: 'Let op de subsidie' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const na = await alsLid('get', `/${id}`);
      expect(na.body).toMatchObject({ notes: 'Let op de subsidie', budgetTotal: 5000, name: 'Seizoen 2026-2027' });
    });

    it('weigert een status die niet bestaat', async () => {
      const id = await maakSeizoen();
      expect((await alsBeheerder('put', `/${id}`).send({ status: 'bezig' })).status).toBe(400);
    });

    it('werkt geen seizoen van een andere vereniging bij', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = vreemdSeizoen(andere.id);

      expect((await alsBeheerder('put', `/${vreemd}`).send({ name: 'Gekaapt' })).status).toBe(404);
      const rij = db.prepare('SELECT name FROM seasons WHERE id = ?').get(vreemd) as { name: string };
      expect(rij.name).toBe('Seizoen van de buren');
    });

    it('verwijdert een seizoen', async () => {
      const id = await maakSeizoen();

      expect((await alsBeheerder('delete', `/${id}`)).status).toBe(200);
      expect((await alsLid('get', `/${id}`)).status).toBe(404);
    });

    it('verwijdert geen seizoen van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      expect((await alsBeheerder('delete', `/${vreemdSeizoen(andere.id)}`)).status).toBe(404);
    });
  });

  describe('evenementen in een seizoen', () => {
    it('voegt een evenement toe', async () => {
      const id = await maakSeizoen();

      const antwoord = await alsBeheerder('post', `/${id}/events`).send({
        eventType: 'concert',
        plannedDate: '2026-12-20',
        notes: 'Kerstconcert',
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);

      const seizoen = await alsLid('get', `/${id}`);
      expect(seizoen.body.events).toHaveLength(1);
      expect(seizoen.body.events[0]).toMatchObject({ eventType: 'concert', plannedDate: '2026-12-20' });
    });

    it('telt het budget van een evenement op bij het seizoen', async () => {
      const id = await maakSeizoen({ budgetTotal: 5000 });

      await alsBeheerder('post', `/${id}/events`).send({
        eventType: 'concert',
        plannedDate: '2026-12-20',
        budgetAmount: 800,
      });
      await alsBeheerder('post', `/${id}/events`).send({
        eventType: 'other',
        plannedDate: '2027-01-10',
        budgetAmount: 200,
      });

      expect((await alsLid('get', `/${id}`)).body.budgetAllocated).toBe(1000);
    });

    it('trekt het budget er bij verwijderen weer af', async () => {
      const id = await maakSeizoen({ budgetTotal: 5000 });
      const gemaakt = await alsBeheerder('post', `/${id}/events`).send({
        eventType: 'concert',
        plannedDate: '2026-12-20',
        budgetAmount: 800,
      });

      const antwoord = await alsBeheerder('delete', `/${id}/events/${gemaakt.body.id}`);
      expect(antwoord.status).toBe(200);
      expect((await alsLid('get', `/${id}`)).body.budgetAllocated).toBe(0);
    });

    it('weigert een soort evenement dat niet bestaat', async () => {
      const id = await maakSeizoen();
      const antwoord = await alsBeheerder('post', `/${id}/events`).send({
        eventType: 'uitje',
        plannedDate: '2026-12-20',
      });
      expect(antwoord.status).toBe(400);
    });

    it('vraagt om een geplande datum', async () => {
      const id = await maakSeizoen();
      expect((await alsBeheerder('post', `/${id}/events`).send({ eventType: 'concert' })).status).toBe(400);
    });

    it('voegt geen evenement toe aan een seizoen van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const antwoord = await alsBeheerder('post', `/${vreemdSeizoen(andere.id)}/events`).send({
        eventType: 'concert',
        plannedDate: '2026-12-20',
      });
      expect(antwoord.status).toBe(404);
    });

    it('geeft 404 voor een evenement dat niet bestaat', async () => {
      const id = await maakSeizoen();
      expect((await alsBeheerder('delete', `/${id}/events/${uuidv4()}`)).status).toBe(404);
    });

    it('verwijdert geen evenement via een seizoen van een andere vereniging', async () => {
      const id = await maakSeizoen();
      const gemaakt = await alsBeheerder('post', `/${id}/events`).send({
        eventType: 'concert',
        plannedDate: '2026-12-20',
      });
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, { email: `ev-${uuidv4()}@test.nl`, role: 'admin' });

      const antwoord = await request(app)
        .delete(`/api/seasons/${id}/events/${gemaakt.body.id}`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`);

      expect(antwoord.status).toBe(404);
      expect((await alsLid('get', `/${id}`)).body.events).toHaveLength(1);
    });

    it('telt de evenementen per soort in het overzicht', async () => {
      const id = await maakSeizoen();
      await alsBeheerder('post', `/${id}/events`).send({ eventType: 'concert', plannedDate: '2026-12-20' });
      await alsBeheerder('post', `/${id}/events`).send({ eventType: 'rehearsal', plannedDate: '2026-09-08' });
      await alsBeheerder('post', `/${id}/events`).send({ eventType: 'rehearsal', plannedDate: '2026-09-15' });

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body[0]).toMatchObject({ eventCount: 3, concertCount: 1, rehearsalCount: 2 });
    });
  });

  describe('een seizoen uitrollen', () => {
    it('maakt een repetitie per week op de gekozen dag', async () => {
      const orkest = createTestOrchestra(vereniging.id);
      // 2026-09-01 is een dinsdag; september telt vijf dinsdagen.
      const id = await maakSeizoen({ startDate: '2026-09-01', endDate: '2026-09-30' });

      const antwoord = await alsBeheerder('post', `/${id}/generate`).send({
        rehearsalDay: 2,
        rehearsalTime: '19:30',
        rehearsalLocation: 'Dorpshuis',
        orchestraId: orkest.id,
        generateConcerts: false,
      });

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.rehearsalCount).toBe(5);
      expect(antwoord.body.rehearsalDates[0]).toBe('2026-09-01');

      const repetities = db
        .prepare('SELECT date, start_time, end_time, location FROM rehearsals WHERE association_id = ? ORDER BY date')
        .all(vereniging.id) as { date: string; start_time: string; end_time: string; location: string }[];
      expect(repetities).toHaveLength(5);
      expect(repetities[0]).toMatchObject({ start_time: '19:30', end_time: '21:30', location: 'Dorpshuis' });
    });

    it('slaat een datum over die al een repetitie heeft', async () => {
      const id = await maakSeizoen({ startDate: '2026-09-01', endDate: '2026-09-30' });
      db.prepare(
        `INSERT INTO rehearsals (id, association_id, date, start_time, end_time, type)
         VALUES (?, ?, '2026-09-08', '19:30', '21:30', 'regular')`,
      ).run(uuidv4(), vereniging.id);

      const antwoord = await alsBeheerder('post', `/${id}/generate`).send({
        rehearsalDay: 2,
        generateConcerts: false,
      });

      expect(antwoord.body.rehearsalCount).toBe(4);
      expect(antwoord.body.rehearsalDates).not.toContain('2026-09-08');
    });

    it('slaat de opgegeven uitzonderingen over', async () => {
      const id = await maakSeizoen({ startDate: '2026-09-01', endDate: '2026-09-30' });

      const antwoord = await alsBeheerder('post', `/${id}/generate`).send({
        rehearsalDay: 2,
        excludeDates: ['2026-09-15', '2026-09-22'],
        generateConcerts: false,
      });

      expect(antwoord.body.rehearsalCount).toBe(3);
    });

    it('maakt bij een tweede keer uitrollen niets dubbel aan', async () => {
      const id = await maakSeizoen({ startDate: '2026-09-01', endDate: '2026-09-30' });

      await alsBeheerder('post', `/${id}/generate`).send({ rehearsalDay: 2, generateConcerts: false });
      const tweede = await alsBeheerder('post', `/${id}/generate`).send({ rehearsalDay: 2, generateConcerts: false });

      expect(tweede.body.rehearsalCount).toBe(0);
      const aantal = db.prepare('SELECT COUNT(*) AS n FROM rehearsals WHERE association_id = ?').get(vereniging.id) as {
        n: number;
      };
      expect(aantal.n).toBe(5);
    });

    it('gebruikt de tijd uit het sjabloon als er geen wordt meegegeven', async () => {
      const sjabloonId = await maakSjabloon({
        defaultRehearsalDay: 2,
        defaultRehearsalTime: '20:00',
        defaultRehearsalDuration: 90,
        defaultRehearsalLocation: 'Kerkzaal',
      });
      const id = await maakSeizoen({ templateId: sjabloonId, startDate: '2026-09-01', endDate: '2026-09-08' });

      await alsBeheerder('post', `/${id}/generate`).send({ generateConcerts: false });

      const repetitie = db
        .prepare('SELECT start_time, end_time, location FROM rehearsals WHERE association_id = ? ORDER BY date')
        .get(vereniging.id) as { start_time: string; end_time: string; location: string };
      expect(repetitie).toMatchObject({ start_time: '20:00', end_time: '21:30', location: 'Kerkzaal' });
    });

    it('maakt geen repetities als er geen dag bekend is', async () => {
      const id = await maakSeizoen({ startDate: '2026-09-01', endDate: '2026-09-30' });

      const antwoord = await alsBeheerder('post', `/${id}/generate`).send({ generateConcerts: false });
      expect(antwoord.body.rehearsalCount).toBe(0);
    });

    it('maakt de opgegeven concerten aan', async () => {
      const id = await maakSeizoen({ startDate: '2026-09-01', endDate: '2027-06-30' });

      const antwoord = await alsBeheerder('post', `/${id}/generate`).send({
        generateRehearsals: false,
        concerts: [
          { name: 'Kerstconcert', date: '2026-12-20', location: 'Kerk', budgetAmount: 750 },
          { name: 'Voorjaarsconcert', date: '2027-04-11' },
        ],
      });

      expect(antwoord.body.concertCount).toBe(2);
      expect(antwoord.body.concertNames).toEqual(['Kerstconcert', 'Voorjaarsconcert']);

      const seizoen = await alsLid('get', `/${id}`);
      expect(seizoen.body.budgetAllocated).toBe(750);
      expect(seizoen.body.events).toHaveLength(2);
      expect(seizoen.body.events[0].eventName).toBe('Kerstconcert');
    });

    it('slaat een concert zonder naam of datum over', async () => {
      const id = await maakSeizoen();

      const antwoord = await alsBeheerder('post', `/${id}/generate`).send({
        generateRehearsals: false,
        concerts: [{ name: 'Zonder datum' }, { date: '2026-12-20' }, { name: 'Goed', date: '2026-12-21' }],
      });

      expect(antwoord.body.concertCount).toBe(1);
      expect(antwoord.body.concertNames).toEqual(['Goed']);
    });

    it('rolt geen seizoen van een andere vereniging uit', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const antwoord = await alsBeheerder('post', `/${vreemdSeizoen(andere.id)}/generate`).send({ rehearsalDay: 2 });
      expect(antwoord.status).toBe(404);
    });

    it('houdt een gewoon lid van het uitrollen af', async () => {
      const id = await maakSeizoen();
      expect((await alsLid('post', `/${id}/generate`).send({ rehearsalDay: 2 })).status).toBe(403);
    });
  });

  it('vraagt overal om een geldige aanmelding', async () => {
    expect(lid.id).toBeTruthy();
    expect((await request(app).get('/api/seasons')).status).toBe(401);
    expect((await request(app).get('/api/seasons/templates')).status).toBe(401);
  });
});
