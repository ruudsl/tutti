/**
 * Bladmuziek uitlenen aan andere verenigingen.
 *
 * De vereniging leent een titel uit aan een orkest verderop, en houdt bij wie
 * hem heeft en wanneer hij terug moet. Twee dingen tellen: de titel moet van
 * de eigen vereniging zijn, en de uitleenstand moet kloppen - een titel die
 * "actief" uitstaat terwijl hij allang terug is, of andersom, kost bij de
 * volgende repetitie een partij.
 *
 * PUT /loans/:id wiste bovendien vier velden als je ze niet meestuurde,
 * terwijl de frontend ze allemaal als optioneel behandelt: wie alleen de
 * notitie aanpaste raakte het e-mailadres, de organisatie en de verwachte
 * retourdatum van de lener kwijt.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import loansRoutes from '../../routes/loans';
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
app.use('/api/loans', loansRoutes);
app.use(errorHandler);

describe('bladmuziek uitlenen', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lidToken: string;
  let commissieToken: string;
  let titelId: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;
    commissieToken = omgeving.musicCommitteeToken;
    titelId = maakTitel();
  });

  type Methode = 'get' | 'post' | 'put' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/loans${pad}`).set('Authorization', `Bearer ${token}`);
  const alsBeheerder = (methode: Methode, pad: string) => als(beheerderToken, methode, pad);
  const alsCommissie = (methode: Methode, pad: string) => als(commissieToken, methode, pad);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  function maakTitel(associationId = vereniging.id, titel = 'Also sprach Zarathustra'): string {
    const id = uuidv4();
    db.prepare("INSERT INTO music_titles (id, title, arranger, association_id) VALUES (?, ?, 'Reed', ?)").run(
      id,
      titel,
      associationId,
    );
    return id;
  }

  async function maakUitlening(overrides: Record<string, unknown> = {}) {
    const antwoord = await alsCommissie('post', '/').send({
      musicTitleId: titelId,
      borrowerName: 'Harmonie Concordia',
      borrowerEmail: 'bibliotheek@concordia.nl',
      borrowerOrganization: 'Concordia',
      expectedReturn: '2026-12-01',
      ...overrides,
    });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    return antwoord.body;
  }

  function uitleenRij(id: string): any {
    return db.prepare('SELECT * FROM loans WHERE id = ?').get(id);
  }

  describe('uitlenen', () => {
    it('leent een titel uit', async () => {
      const uitlening = await maakUitlening();

      expect(uitlening).toMatchObject({
        borrower_name: 'Harmonie Concordia',
        borrower_email: 'bibliotheek@concordia.nl',
        status: 'active',
        title_name: 'Also sprach Zarathustra',
      });
    });

    it('vraagt om een titel en een naam', async () => {
      expect((await alsCommissie('post', '/').send({ musicTitleId: titelId })).status).toBe(400);
      expect((await alsCommissie('post', '/').send({ borrowerName: 'Iemand' })).status).toBe(400);
    });

    it('leent geen titel uit die niet bestaat', async () => {
      const antwoord = await alsCommissie('post', '/').send({ musicTitleId: uuidv4(), borrowerName: 'Iemand' });
      expect(antwoord.status).toBe(404);
    });

    it('leent geen titel van een andere vereniging uit', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdeTitel = maakTitel(andere.id, 'Van de buren');

      const antwoord = await alsCommissie('post', '/').send({
        musicTitleId: vreemdeTitel,
        borrowerName: 'Iemand',
      });
      expect(antwoord.status).toBe(404);
    });

    it('houdt een gewoon lid bij de uitleenadministratie weg', async () => {
      expect((await alsLid('get', '/')).status).toBe(403);
      expect((await alsLid('post', '/').send({ musicTitleId: titelId, borrowerName: 'X' })).status).toBe(403);
    });
  });

  describe('overzicht', () => {
    it('begint leeg', async () => {
      const antwoord = await alsCommissie('get', '/');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual([]);
    });

    it('noemt de titel en degene die de uitlening aanmaakte', async () => {
      await maakUitlening();

      const antwoord = await alsCommissie('get', '/');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0]).toMatchObject({
        title_name: 'Also sprach Zarathustra',
        title_arranger: 'Reed',
      });
      expect(antwoord.body[0].created_by_name).toBeTruthy();
    });

    it('filtert op status', async () => {
      const eerste = await maakUitlening();
      await maakUitlening({ borrowerName: 'Tweede lener' });
      await alsCommissie('post', `/${eerste.id}/return`);

      expect((await alsCommissie('get', '/?status=active')).body).toHaveLength(1);
      expect((await alsCommissie('get', '/?status=returned')).body).toHaveLength(1);
      expect((await alsCommissie('get', '/?status=all')).body).toHaveLength(2);
    });

    it('toont geen uitlening van een andere vereniging', async () => {
      await maakUitlening();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, { email: `leen-${uuidv4()}@test.nl`, role: 'admin' });
      const vreemdeTitel = maakTitel(andere.id, 'Van de buren');
      db.prepare(`INSERT INTO loans (id, music_title_id, borrower_name, created_by) VALUES (?, ?, 'Buurlener', ?)`).run(
        uuidv4(),
        vreemdeTitel,
        andereBeheerder.id,
      );

      const antwoord = await alsCommissie('get', '/');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].borrower_name).toBe('Harmonie Concordia');
    });
  });

  describe('bijwerken', () => {
    it('werkt alleen bij wat wordt meegestuurd', async () => {
      const uitlening = await maakUitlening();

      const antwoord = await alsCommissie('put', `/${uitlening.id}`).send({ notes: 'Per post opgestuurd' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      // Hier ging het mis: deze vier velden werden gewist zodra ze ontbraken.
      const rij = uitleenRij(uitlening.id);
      expect(rij).toMatchObject({
        notes: 'Per post opgestuurd',
        borrower_name: 'Harmonie Concordia',
        borrower_email: 'bibliotheek@concordia.nl',
        borrower_organization: 'Concordia',
        expected_return: '2026-12-01',
      });
    });

    it('maakt een veld wel leeg als dat expliciet wordt meegestuurd', async () => {
      const uitlening = await maakUitlening();

      await alsCommissie('put', `/${uitlening.id}`).send({ borrowerEmail: '' });

      expect(uitleenRij(uitlening.id).borrower_email).toBeNull();
    });

    it('werkt de naam van de lener bij', async () => {
      const uitlening = await maakUitlening();

      await alsCommissie('put', `/${uitlening.id}`).send({ borrowerName: 'Fanfare Sint Jan' });

      expect(uitleenRij(uitlening.id).borrower_name).toBe('Fanfare Sint Jan');
    });

    it('werkt geen uitlening van een andere vereniging bij', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, { email: `leen2-${uuidv4()}@test.nl`, role: 'admin' });
      const vreemdeTitel = maakTitel(andere.id, 'Van de buren');
      const vreemdeUitlening = uuidv4();
      db.prepare(`INSERT INTO loans (id, music_title_id, borrower_name, created_by) VALUES (?, ?, 'Buurlener', ?)`).run(
        vreemdeUitlening,
        vreemdeTitel,
        andereBeheerder.id,
      );

      expect((await alsCommissie('put', `/${vreemdeUitlening}`).send({ notes: 'Gekaapt' })).status).toBe(404);
      expect(uitleenRij(vreemdeUitlening).notes).toBeNull();
    });
  });

  describe('terugbrengen', () => {
    it('meldt een uitlening als teruggebracht', async () => {
      const uitlening = await maakUitlening();

      const antwoord = await alsCommissie('post', `/${uitlening.id}/return`);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const rij = uitleenRij(uitlening.id);
      expect(rij.status).toBe('returned');
      expect(rij.date_returned).not.toBeNull();
    });

    it('meldt een uitlening niet twee keer als teruggebracht', async () => {
      const uitlening = await maakUitlening();
      await alsCommissie('post', `/${uitlening.id}/return`);

      const tweede = await alsCommissie('post', `/${uitlening.id}/return`);
      expect(tweede.status).toBe(400);
    });

    it('geeft 404 voor een uitlening die niet bestaat', async () => {
      expect((await alsCommissie('post', `/${uuidv4()}/return`)).status).toBe(404);
    });
  });

  describe('verwijderen', () => {
    it('verwijdert een uitlening', async () => {
      const uitlening = await maakUitlening();

      expect((await alsBeheerder('delete', `/${uitlening.id}`)).status).toBe(200);
      expect(uitleenRij(uitlening.id)).toBeUndefined();
    });

    it('laat verwijderen alleen aan een beheerder over', async () => {
      const uitlening = await maakUitlening();
      expect((await alsCommissie('delete', `/${uitlening.id}`)).status).toBe(403);
    });

    it('verwijdert geen uitlening van een andere vereniging', async () => {
      expect((await alsBeheerder('delete', `/${uuidv4()}`)).status).toBe(404);
    });
  });

  describe('cijfers', () => {
    it('telt de uitleningen per stand', async () => {
      const eerste = await maakUitlening();
      await maakUitlening({ borrowerName: 'Tweede' });
      await alsCommissie('post', `/${eerste.id}/return`);

      const antwoord = await alsCommissie('get', '/stats');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toMatchObject({ total: 2, active: 1, returned: 1 });
    });

    it('zet een verstreken uitlening op te laat', async () => {
      const uitlening = await maakUitlening({ expectedReturn: '2020-01-01' });

      await alsCommissie('get', '/stats');

      expect(uitleenRij(uitlening.id).status).toBe('overdue');
    });

    it('meldt een verstreken uitlening in dezelfde aanroep als te laat', async () => {
      // De cijfers werden geteld voordat de verstreken uitleningen op 'overdue'
      // werden gezet. Het antwoord liep daardoor een aanroep achter: de
      // uitleenpagina toonde de lening nog als lopend, terwijl de rij in de
      // database al te laat was.
      await maakUitlening({ expectedReturn: '2020-01-01' });

      const antwoord = await alsCommissie('get', '/stats');

      expect(antwoord.body).toMatchObject({ total: 1, active: 0, overdue: 1 });
    });

    it('laat een uitlening zonder retourdatum met rust', async () => {
      const uitlening = await maakUitlening({ expectedReturn: undefined });

      await alsCommissie('get', '/stats');

      expect(uitleenRij(uitlening.id).status).toBe('active');
    });

    it('raakt de uitleningen van een andere vereniging niet aan', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, { email: `leen3-${uuidv4()}@test.nl`, role: 'admin' });
      const vreemdeTitel = maakTitel(andere.id, 'Van de buren');
      const vreemdeUitlening = uuidv4();
      db.prepare(
        `INSERT INTO loans (id, music_title_id, borrower_name, expected_return, created_by)
         VALUES (?, ?, 'Buurlener', '2020-01-01', ?)`,
      ).run(vreemdeUitlening, vreemdeTitel, andereBeheerder.id);

      const antwoord = await alsCommissie('get', '/stats');
      expect(antwoord.body.total).toBe(0);
      expect(uitleenRij(vreemdeUitlening).status).toBe('active');
    });
  });

  describe('titels om uit te lenen', () => {
    it('geeft de titels van de eigen vereniging met het aantal lopende uitleningen', async () => {
      await maakUitlening();

      const antwoord = await alsCommissie('get', '/available-titles');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0]).toMatchObject({ title: 'Also sprach Zarathustra', active_loans: 1 });
    });

    it('telt een teruggebrachte uitlening niet mee', async () => {
      const uitlening = await maakUitlening();
      await alsCommissie('post', `/${uitlening.id}/return`);

      const antwoord = await alsCommissie('get', '/available-titles');
      expect(antwoord.body[0].active_loans).toBe(0);
    });

    it('zoekt op titel en arrangeur', async () => {
      maakTitel(vereniging.id, 'Finlandia');

      expect((await alsCommissie('get', '/available-titles?search=Finlandia')).body).toHaveLength(1);
      expect((await alsCommissie('get', '/available-titles?search=Reed')).body).toHaveLength(2);
    });

    it('geeft geen titel van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      maakTitel(andere.id, 'Van de buren');

      const antwoord = await alsCommissie('get', '/available-titles');
      expect(antwoord.body.map((t: { title: string }) => t.title)).toEqual(['Also sprach Zarathustra']);
    });
  });

  describe('geschiedenis per titel', () => {
    it('geeft de uitleengeschiedenis met cijfers', async () => {
      const eerste = await maakUitlening();
      await alsCommissie('post', `/${eerste.id}/return`);
      await maakUitlening({ borrowerName: 'Tweede lener' });

      const antwoord = await alsCommissie('get', `/title/${titelId}/history`);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.title.title).toBe('Also sprach Zarathustra');
      expect(antwoord.body.statistics).toMatchObject({ totalLoans: 2, activeLoans: 1 });
      expect(antwoord.body.loans).toHaveLength(2);
    });

    it('geeft nul dagen als er nog niets terug is', async () => {
      await maakUitlening();

      const antwoord = await alsCommissie('get', `/title/${titelId}/history`);
      expect(antwoord.body.statistics.avgLoanDurationDays).toBe(0);
    });

    it('geeft 404 voor een titel van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdeTitel = maakTitel(andere.id, 'Van de buren');

      expect((await alsCommissie('get', `/title/${vreemdeTitel}/history`)).status).toBe(404);
    });
  });

  it('vraagt overal om een geldige aanmelding', async () => {
    expect(beheerder.id).toBeTruthy();
    expect((await request(app).get('/api/loans')).status).toBe(401);
    expect((await request(app).get('/api/loans/stats')).status).toBe(401);
  });
});
