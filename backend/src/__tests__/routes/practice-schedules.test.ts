/**
 * Oefenschema's: per muziekstuk en orkest een doeldatum, met mijlpalen en
 * voortgang per sectie.
 *
 * Dit bestand stond op nul en vijf routes misten de verenigingscontrole. Het
 * overzicht, het bijwerken en het verwijderen van een schema legden het
 * verband met de vereniging wel, maar het aanmaken niet, en de mijlpalen
 * helemaal niet: bewerken en verwijderen schreven rechtstreeks op het id uit
 * het pad. Elke beheerder, dirigent of commissielid kon daarmee de mijlpalen
 * van een andere vereniging aanpassen of weggooien.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import practiceSchedulesRoutes from '../../routes/practice-schedules';
import { errorHandler } from '../../middleware/errorHandler';
import {
  addInstrumentToUser,
  addUserToOrchestra,
  createTestAssociation,
  createTestEnvironment,
  createTestInstrument,
  createTestOrchestra,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestInstrument,
  TestOrchestra,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/practice-schedules', practiceSchedulesRoutes);
app.use(errorHandler);

describe('oefenschemas', () => {
  let vereniging: TestAssociation;
  let dirigentToken: string;
  let lid: TestUser;
  let lidToken: string;
  let orkest: TestOrchestra;
  let titelId: string;
  let trompet: TestInstrument;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    dirigentToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    orkest = createTestOrchestra(vereniging.id, { name: 'Fanfare' });
    titelId = maakTitel();
    trompet = createTestInstrument({ name: `Trompet-${uuidv4().slice(0, 8)}` });
  });

  type Methode = 'get' | 'post' | 'patch' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/practice-schedules${pad}`).set('Authorization', `Bearer ${token}`);
  const alsDirigent = (methode: Methode, pad: string) => als(dirigentToken, methode, pad);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  function maakTitel(associationId = vereniging.id, titel = 'Also sprach Zarathustra'): string {
    const id = uuidv4();
    db.prepare('INSERT INTO music_titles (id, title, association_id) VALUES (?, ?, ?)').run(id, titel, associationId);
    return id;
  }

  async function maakSchema(overrides: Record<string, unknown> = {}): Promise<string> {
    const antwoord = await alsDirigent('post', '/').send({
      musicTitleId: titelId,
      orchestraId: orkest.id,
      targetDate: '2026-12-20',
      ...overrides,
    });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    return antwoord.body.id;
  }

  /** Een compleet schema bij de buren, met een mijlpaal erin. */
  function buurschema(): { schemaId: string; mijlpaalId: string; beheerderToken: string } {
    const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
    const andereOrkest = createTestOrchestra(andere.id, { name: 'Buurorkest' });
    const andereBeheerder = createTestUser(andere.id, { email: `oef-${uuidv4()}@test.nl`, role: 'admin' });
    const andereTitel = maakTitel(andere.id, 'Van de buren');

    const schemaId = uuidv4();
    db.prepare(
      `INSERT INTO practice_schedules (id, music_title_id, orchestra_id, target_date, created_by)
       VALUES (?, ?, ?, '2026-12-20', ?)`,
    ).run(schemaId, andereTitel, andereOrkest.id, andereBeheerder.id);

    const mijlpaalId = uuidv4();
    db.prepare(
      `INSERT INTO practice_schedule_milestones (id, schedule_id, title, target_date, sort_order)
       VALUES (?, ?, 'Van de buren', '2026-11-01', 0)`,
    ).run(mijlpaalId, schemaId);

    return { schemaId, mijlpaalId, beheerderToken: generateTestToken(andereBeheerder) };
  }

  describe('schema aanmaken', () => {
    it('maakt een schema met mijlpalen', async () => {
      const id = await maakSchema({
        notes: 'Loopt door tot de kerst',
        milestones: [
          { title: 'Noten kennen', targetDate: '2026-10-01' },
          { title: 'Uit het hoofd', targetDate: '2026-11-15' },
        ],
      });

      const antwoord = await alsLid('get', `/${id}`);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.musicTitle.title).toBe('Also sprach Zarathustra');
      expect(antwoord.body.orchestra.name).toBe('Fanfare');
      expect(antwoord.body.milestones).toHaveLength(2);
      expect(antwoord.body.milestones[0].title).toBe('Noten kennen');
    });

    it('vraagt om stuk, orkest en doeldatum', async () => {
      expect((await alsDirigent('post', '/').send({ orchestraId: orkest.id, targetDate: '2026-12-20' })).status).toBe(
        400,
      );
      expect((await alsDirigent('post', '/').send({ musicTitleId: titelId, targetDate: '2026-12-20' })).status).toBe(
        400,
      );
      expect((await alsDirigent('post', '/').send({ musicTitleId: titelId, orchestraId: orkest.id })).status).toBe(400);
    });

    it('maakt geen tweede schema voor hetzelfde stuk en orkest', async () => {
      await maakSchema();

      const tweede = await alsDirigent('post', '/').send({
        musicTitleId: titelId,
        orchestraId: orkest.id,
        targetDate: '2027-01-01',
      });
      expect(tweede.status).toBe(409);
    });

    it('maakt geen schema op een muziekstuk van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdeTitel = maakTitel(andere.id, 'Van de buren');

      const antwoord = await alsDirigent('post', '/').send({
        musicTitleId: vreemdeTitel,
        orchestraId: orkest.id,
        targetDate: '2026-12-20',
      });
      expect(antwoord.status).toBe(404);
    });

    it('maakt geen schema op een orkest van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdOrkest = createTestOrchestra(andere.id, { name: 'Buurorkest' });

      const antwoord = await alsDirigent('post', '/').send({
        musicTitleId: titelId,
        orchestraId: vreemdOrkest.id,
        targetDate: '2026-12-20',
      });
      expect(antwoord.status).toBe(404);

      const aantal = db
        .prepare('SELECT COUNT(*) AS n FROM practice_schedules WHERE orchestra_id = ?')
        .get(vreemdOrkest.id) as { n: number };
      expect(aantal.n).toBe(0);
    });

    it('houdt een gewoon lid van het aanmaken af', async () => {
      const antwoord = await alsLid('post', '/').send({
        musicTitleId: titelId,
        orchestraId: orkest.id,
        targetDate: '2026-12-20',
      });
      expect(antwoord.status).toBe(403);
    });
  });

  describe('overzicht', () => {
    it('begint leeg', async () => {
      expect((await alsLid('get', '/')).body).toEqual([]);
    });

    it('rekent de voortgang uit over de mijlpalen', async () => {
      const id = await maakSchema({
        milestones: [
          { title: 'Een', targetDate: '2026-10-01' },
          { title: 'Twee', targetDate: '2026-11-01' },
        ],
      });
      const schema = await alsLid('get', `/${id}`);
      await alsDirigent('patch', `/milestones/${schema.body.milestones[0].id}`).send({ isCompleted: true });

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body[0]).toMatchObject({ milestoneCount: 2, completedMilestones: 1, progress: 50 });
    });

    it('geeft nul procent als er geen mijlpalen zijn', async () => {
      await maakSchema();
      expect((await alsLid('get', '/')).body[0].progress).toBe(0);
    });

    it('filtert op orkest en op muziekstuk', async () => {
      await maakSchema();
      const tweedeOrkest = createTestOrchestra(vereniging.id, { name: 'Slagwerk' });
      await maakSchema({ orchestraId: tweedeOrkest.id });

      expect((await alsLid('get', `/?orchestraId=${tweedeOrkest.id}`)).body).toHaveLength(1);
      expect((await alsLid('get', `/?musicTitleId=${titelId}`)).body).toHaveLength(2);
    });

    it('toont geen schema van een andere vereniging', async () => {
      await maakSchema();
      buurschema();

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].orchestra.name).toBe('Fanfare');
    });

    it('geeft 404 voor een schema van een andere vereniging', async () => {
      const buren = buurschema();
      expect((await alsLid('get', `/${buren.schemaId}`)).status).toBe(404);
    });
  });

  describe('bijwerken en verwijderen', () => {
    it('werkt de doeldatum en de notitie bij', async () => {
      const id = await maakSchema();

      const antwoord = await alsDirigent('patch', `/${id}`).send({ targetDate: '2027-01-15', notes: 'Uitgesteld' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const na = await alsLid('get', `/${id}`);
      expect(na.body).toMatchObject({ targetDate: '2027-01-15', notes: 'Uitgesteld' });
    });

    it('werkt geen schema van een andere vereniging bij', async () => {
      const buren = buurschema();
      expect((await alsDirigent('patch', `/${buren.schemaId}`).send({ notes: 'Gekaapt' })).status).toBe(404);
    });

    it('verwijdert een schema', async () => {
      const id = await maakSchema();

      expect((await alsDirigent('delete', `/${id}`)).status).toBe(200);
      expect((await alsLid('get', `/${id}`)).status).toBe(404);
    });

    it('verwijdert geen schema van een andere vereniging', async () => {
      const buren = buurschema();

      expect((await alsDirigent('delete', `/${buren.schemaId}`)).status).toBe(404);
      expect(db.prepare('SELECT id FROM practice_schedules WHERE id = ?').get(buren.schemaId)).toBeDefined();
    });

    it('houdt een gewoon lid van het bijwerken en verwijderen af', async () => {
      const id = await maakSchema();
      expect((await alsLid('patch', `/${id}`).send({ notes: 'x' })).status).toBe(403);
      expect((await alsLid('delete', `/${id}`)).status).toBe(403);
    });
  });

  describe('mijlpalen', () => {
    it('voegt een mijlpaal achteraan toe', async () => {
      const id = await maakSchema({ milestones: [{ title: 'Eerste', targetDate: '2026-10-01' }] });

      const antwoord = await alsDirigent('post', `/${id}/milestones`).send({
        title: 'Tweede',
        targetDate: '2026-11-01',
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);

      const schema = await alsLid('get', `/${id}`);
      expect(schema.body.milestones.map((m: { title: string }) => m.title)).toEqual(['Eerste', 'Tweede']);
      expect(schema.body.milestones[1].sortOrder).toBe(1);
    });

    it('vraagt om een titel en een doeldatum', async () => {
      const id = await maakSchema();
      expect((await alsDirigent('post', `/${id}/milestones`).send({ title: 'Zonder datum' })).status).toBe(400);
    });

    it('voegt geen mijlpaal toe aan een schema van een andere vereniging', async () => {
      const buren = buurschema();

      const antwoord = await alsDirigent('post', `/${buren.schemaId}/milestones`).send({
        title: 'Van mij',
        targetDate: '2026-11-01',
      });
      expect(antwoord.status).toBe(404);

      const aantal = db
        .prepare('SELECT COUNT(*) AS n FROM practice_schedule_milestones WHERE schedule_id = ?')
        .get(buren.schemaId) as { n: number };
      expect(aantal.n).toBe(1);
    });

    it('vinkt een mijlpaal af en noteert wanneer', async () => {
      const id = await maakSchema({ milestones: [{ title: 'Noten kennen', targetDate: '2026-10-01' }] });
      const schema = await alsLid('get', `/${id}`);
      const mijlpaalId = schema.body.milestones[0].id;

      await alsDirigent('patch', `/milestones/${mijlpaalId}`).send({ isCompleted: true });

      const na = await alsLid('get', `/${id}`);
      expect(na.body.milestones[0].isCompleted).toBe(true);
      expect(na.body.milestones[0].completedAt).not.toBeNull();
    });

    it('zet een afgevinkte mijlpaal weer open', async () => {
      const id = await maakSchema({ milestones: [{ title: 'Noten kennen', targetDate: '2026-10-01' }] });
      const schema = await alsLid('get', `/${id}`);
      const mijlpaalId = schema.body.milestones[0].id;
      await alsDirigent('patch', `/milestones/${mijlpaalId}`).send({ isCompleted: true });

      await alsDirigent('patch', `/milestones/${mijlpaalId}`).send({ isCompleted: false });

      const na = await alsLid('get', `/${id}`);
      expect(na.body.milestones[0].isCompleted).toBe(false);
      expect(na.body.milestones[0].completedAt).toBeNull();
    });

    it('bewerkt geen mijlpaal van een andere vereniging', async () => {
      const buren = buurschema();

      // Hier ging het mis: het id uit het pad ging rechtstreeks de UPDATE in.
      expect((await alsDirigent('patch', `/milestones/${buren.mijlpaalId}`).send({ title: 'Gekaapt' })).status).toBe(
        404,
      );

      const rij = db.prepare('SELECT title FROM practice_schedule_milestones WHERE id = ?').get(buren.mijlpaalId) as {
        title: string;
      };
      expect(rij.title).toBe('Van de buren');
    });

    it('verwijdert een mijlpaal', async () => {
      const id = await maakSchema({ milestones: [{ title: 'Weg hiermee', targetDate: '2026-10-01' }] });
      const schema = await alsLid('get', `/${id}`);

      expect((await alsDirigent('delete', `/milestones/${schema.body.milestones[0].id}`)).status).toBe(200);
      expect((await alsLid('get', `/${id}`)).body.milestones).toEqual([]);
    });

    it('verwijdert geen mijlpaal van een andere vereniging', async () => {
      const buren = buurschema();

      expect((await alsDirigent('delete', `/milestones/${buren.mijlpaalId}`)).status).toBe(404);
      expect(
        db.prepare('SELECT id FROM practice_schedule_milestones WHERE id = ?').get(buren.mijlpaalId),
      ).toBeDefined();
    });

    it('houdt een gewoon lid van mijlpalen af', async () => {
      const id = await maakSchema({ milestones: [{ title: 'Eerste', targetDate: '2026-10-01' }] });
      const schema = await alsLid('get', `/${id}`);
      const mijlpaalId = schema.body.milestones[0].id;

      expect((await alsLid('post', `/${id}/milestones`).send({ title: 'X', targetDate: '2026-11-01' })).status).toBe(
        403,
      );
      expect((await alsLid('patch', `/milestones/${mijlpaalId}`).send({ title: 'X' })).status).toBe(403);
      expect((await alsLid('delete', `/milestones/${mijlpaalId}`)).status).toBe(403);
    });
  });

  describe('voortgang per sectie', () => {
    async function schemaMetMijlpaal(): Promise<{ id: string; mijlpaalId: string }> {
      const id = await maakSchema({ milestones: [{ title: 'Noten kennen', targetDate: '2026-10-01' }] });
      const schema = await alsLid('get', `/${id}`);
      return { id, mijlpaalId: schema.body.milestones[0].id };
    }

    it('legt de voortgang van een sectie vast', async () => {
      const { id, mijlpaalId } = await schemaMetMijlpaal();

      const antwoord = await alsDirigent('post', `/milestones/${mijlpaalId}/section-progress`).send({
        instrumentId: trompet.id,
        status: 'in_progress',
        notes: 'Loopt goed',
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const schema = await alsLid('get', `/${id}`);
      expect(schema.body.milestones[0].sectionProgress).toHaveLength(1);
      expect(schema.body.milestones[0].sectionProgress[0]).toMatchObject({
        status: 'in_progress',
        notes: 'Loopt goed',
      });
    });

    it('werkt een bestaande vermelding bij in plaats van er een tweede te maken', async () => {
      const { id, mijlpaalId } = await schemaMetMijlpaal();
      await alsDirigent('post', `/milestones/${mijlpaalId}/section-progress`).send({
        instrumentId: trompet.id,
        status: 'in_progress',
      });

      await alsDirigent('post', `/milestones/${mijlpaalId}/section-progress`).send({
        instrumentId: trompet.id,
        status: 'completed',
      });

      const schema = await alsLid('get', `/${id}`);
      expect(schema.body.milestones[0].sectionProgress).toHaveLength(1);
      expect(schema.body.milestones[0].sectionProgress[0].status).toBe('completed');
      expect(schema.body.milestones[0].sectionsCompleted).toBe(1);
    });

    it('weigert een status die niet bestaat', async () => {
      const { mijlpaalId } = await schemaMetMijlpaal();

      const antwoord = await alsDirigent('post', `/milestones/${mijlpaalId}/section-progress`).send({
        instrumentId: trompet.id,
        status: 'bijna',
      });
      expect(antwoord.status).toBe(400);
    });

    it('laat een lid de voortgang van zijn eigen instrument bijwerken', async () => {
      const { mijlpaalId } = await schemaMetMijlpaal();
      addInstrumentToUser(lid.id, trompet.id);

      const antwoord = await alsLid('post', `/milestones/${mijlpaalId}/section-progress`).send({
        instrumentId: trompet.id,
        status: 'completed',
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
    });

    it('laat een lid de voortgang van een ander instrument met rust', async () => {
      const { mijlpaalId } = await schemaMetMijlpaal();

      const antwoord = await alsLid('post', `/milestones/${mijlpaalId}/section-progress`).send({
        instrumentId: trompet.id,
        status: 'completed',
      });
      expect(antwoord.status).toBe(403);
    });

    it('raakt de mijlpaal van een andere vereniging niet aan', async () => {
      const buren = buurschema();

      const antwoord = await alsDirigent('post', `/milestones/${buren.mijlpaalId}/section-progress`).send({
        instrumentId: trompet.id,
        status: 'completed',
      });
      expect(antwoord.status).toBe(404);

      const aantal = db
        .prepare('SELECT COUNT(*) AS n FROM practice_section_progress WHERE milestone_id = ?')
        .get(buren.mijlpaalId) as { n: number };
      expect(aantal.n).toBe(0);
    });

    it('zet de secties in een keer klaar voor alle mijlpalen', async () => {
      const { id } = await schemaMetMijlpaal();
      addInstrumentToUser(lid.id, trompet.id);
      addUserToOrchestra(lid.id, orkest.id);

      const antwoord = await alsDirigent('post', `/${id}/initialize-sections`);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.message).toContain('1 sectie');

      const schema = await alsLid('get', `/${id}`);
      expect(schema.body.milestones[0].sectionProgress).toHaveLength(1);
      expect(schema.body.milestones[0].sectionProgress[0].status).toBe('pending');
    });

    it('maakt bij een tweede keer niets dubbel aan', async () => {
      const { id } = await schemaMetMijlpaal();
      addInstrumentToUser(lid.id, trompet.id);
      addUserToOrchestra(lid.id, orkest.id);
      await alsDirigent('post', `/${id}/initialize-sections`);

      const tweede = await alsDirigent('post', `/${id}/initialize-sections`);
      expect(tweede.body.message).toContain('0 sectie');
    });

    it('zet geen sectie klaar voor een lid dat is uitgeschreven', async () => {
      // Leden worden zacht verwijderd; hun rijen in user_instruments en
      // user_orchestras blijven staan. Zonder filter op deleted_at kreeg het
      // schema dus een sectie voor een instrument dat niemand meer speelt.
      const { id } = await schemaMetMijlpaal();
      const hoorn = createTestInstrument({ name: `Hoorn-${uuidv4().slice(0, 8)}` });
      const vertrokken = createTestUser(vereniging.id, { email: `weg-${uuidv4()}@test.nl`, role: 'member' });
      addInstrumentToUser(vertrokken.id, hoorn.id);
      addUserToOrchestra(vertrokken.id, orkest.id);
      db.prepare("UPDATE users SET deleted_at = ?, status = 'inactive' WHERE id = ?").run(
        '2026-08-01 10:00:00',
        vertrokken.id,
      );

      addInstrumentToUser(lid.id, trompet.id);
      addUserToOrchestra(lid.id, orkest.id);

      const antwoord = await alsDirigent('post', `/${id}/initialize-sections`);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.message).toContain('1 sectie');

      const secties = db.prepare('SELECT instrument_id FROM practice_section_progress').all() as {
        instrument_id: string;
      }[];
      expect(secties.map((r) => r.instrument_id)).toEqual([trompet.id]);
    });

    it('zet niets klaar voor een schema van een andere vereniging', async () => {
      const buren = buurschema();
      expect((await alsDirigent('post', `/${buren.schemaId}/initialize-sections`)).status).toBe(404);
    });
  });

  it('vraagt overal om een geldige aanmelding', async () => {
    expect((await request(app).get('/api/practice-schedules')).status).toBe(401);
    expect((await request(app).post('/api/practice-schedules').send({})).status).toBe(401);
  });
});
