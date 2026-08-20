/**
 * Projecten: een concertreeks of festivaldeelname met leden, concerten en
 * een setlist eraan.
 *
 * Dit bestand stond op nul. Bij het schrijven van de tests kwamen vier
 * routes boven die een id uit het verzoek vertrouwden zonder te kijken van
 * welke vereniging het was: een lid en een concert van een andere vereniging
 * konden aan je project worden gehangen, en het ontkoppelen van een concert
 * en het verwijderen van een setlist-item konden op andermans project. Elk
 * van die vier heeft hieronder zijn eigen test.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import projectsRoutes from '../../routes/projects';
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
app.use('/api/projects', projectsRoutes);
app.use(errorHandler);

describe('projecten', () => {
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

  type Methode = 'get' | 'post' | 'patch' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/projects${pad}`).set('Authorization', `Bearer ${token}`);
  const alsBeheerder = (methode: Methode, pad: string) => als(beheerderToken, methode, pad);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  async function maakProject(overrides: Record<string, unknown> = {}): Promise<string> {
    const antwoord = await alsBeheerder('post', '/').send({ name: 'Kerstproject', ...overrides });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    return antwoord.body.id;
  }

  function maakConcert(associationId = vereniging.id): string {
    const id = uuidv4();
    db.prepare("INSERT INTO concerts (id, association_id, name, date) VALUES (?, ?, 'Kerstconcert', '2026-12-20')").run(
      id,
      associationId,
    );
    return id;
  }

  /** Een project van een andere vereniging, rechtstreeks in de database. */
  function vreemdProject(associationId: string): string {
    const id = uuidv4();
    const maker = createTestUser(associationId, { email: `projmaker-${uuidv4()}@test.nl`, role: 'admin' });
    db.prepare(
      `INSERT INTO projects (id, association_id, name, project_type, created_by)
       VALUES (?, ?, 'Project van de buren', 'concert', ?)`,
    ).run(id, associationId, maker.id);
    return id;
  }

  describe('overzicht en aanmaken', () => {
    it('begint met een lege lijst', async () => {
      const antwoord = await alsLid('get', '/');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual([]);
    });

    it('maakt een project aan', async () => {
      const id = await maakProject({ startDate: '2026-11-01', endDate: '2026-12-25', budget: 3000 });

      const antwoord = await alsLid('get', `/${id}`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toMatchObject({
        name: 'Kerstproject',
        projectType: 'concert',
        startDate: '2026-11-01',
        budget: 3000,
      });
    });

    it('noemt het orkest bij het project', async () => {
      const orkest = createTestOrchestra(vereniging.id, { name: 'Fanfare' });
      const id = await maakProject({ orchestraId: orkest.id });

      expect((await alsLid('get', `/${id}`)).body.orchestraName).toBe('Fanfare');
    });

    it('weigert een project zonder naam', async () => {
      expect((await alsBeheerder('post', '/').send({})).status).toBe(400);
    });

    it('weigert een soort project dat niet bestaat', async () => {
      expect((await alsBeheerder('post', '/').send({ name: 'Iets', projectType: 'borrel' })).status).toBe(400);
    });

    it('houdt een gewoon lid van het aanmaken af', async () => {
      expect((await alsLid('post', '/').send({ name: 'Van mij' })).status).toBe(403);
    });

    it('filtert op soort', async () => {
      await maakProject();
      await maakProject({ name: 'Concours', projectType: 'competition' });

      const antwoord = await alsLid('get', '/?type=competition');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].name).toBe('Concours');
    });

    it('filtert op status', async () => {
      const id = await maakProject();
      await maakProject({ name: 'Tweede' });
      await alsBeheerder('patch', `/${id}/status`).send({ status: 'active' });

      const antwoord = await alsLid('get', '/?status=active');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].name).toBe('Kerstproject');
    });

    it('toont het project van een andere vereniging niet', async () => {
      await maakProject();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      vreemdProject(andere.id);

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body.map((p: { name: string }) => p.name)).toEqual(['Kerstproject']);
    });

    it('geeft 404 voor een project van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      expect((await alsLid('get', `/${vreemdProject(andere.id)}`)).status).toBe(404);
    });
  });

  describe('bijwerken en verwijderen', () => {
    it('werkt een enkel veld bij en laat de rest staan', async () => {
      const id = await maakProject({ budget: 3000 });

      const antwoord = await alsBeheerder('patch', `/${id}`).send({ notes: 'Subsidie aanvragen' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const na = await alsLid('get', `/${id}`);
      expect(na.body).toMatchObject({ notes: 'Subsidie aanvragen', budget: 3000, name: 'Kerstproject' });
    });

    it('werkt geen project van een andere vereniging bij', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      expect((await alsBeheerder('patch', `/${vreemdProject(andere.id)}`).send({ budget: 1 })).status).toBe(404);
    });

    it('zet de status om', async () => {
      const id = await maakProject();

      expect((await alsBeheerder('patch', `/${id}/status`).send({ status: 'completed' })).status).toBe(200);
      expect((await alsLid('get', `/${id}`)).body.status).toBe('completed');
    });

    it('weigert een status die niet bestaat', async () => {
      const id = await maakProject();
      expect((await alsBeheerder('patch', `/${id}/status`).send({ status: 'bezig' })).status).toBe(400);
    });

    it('markeert het project als verwijderd zonder de rij weg te gooien', async () => {
      const id = await maakProject();

      expect((await alsBeheerder('delete', `/${id}`)).status).toBe(200);
      expect((await alsLid('get', `/${id}`)).status).toBe(404);
      expect(db.prepare('SELECT id FROM projects WHERE id = ?').get(id)).toBeDefined();
    });

    it('verwijdert een project niet twee keer', async () => {
      const id = await maakProject();
      await alsBeheerder('delete', `/${id}`);
      expect((await alsBeheerder('delete', `/${id}`)).status).toBe(404);
    });

    it('laat verwijderen alleen aan een beheerder over', async () => {
      const id = await maakProject();
      expect((await alsLid('delete', `/${id}`)).status).toBe(403);
    });
  });

  describe('leden', () => {
    it('voegt een lid toe', async () => {
      const id = await maakProject();

      const antwoord = await alsBeheerder('post', `/${id}/members`).send({ userId: lid.id, role: 'soloist' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);

      const project = await alsLid('get', `/${id}`);
      expect(project.body.members).toHaveLength(1);
      expect(project.body.members[0]).toMatchObject({ userId: lid.id, role: 'soloist', email: lid.email });
    });

    it('voegt hetzelfde lid niet twee keer toe', async () => {
      const id = await maakProject();
      await alsBeheerder('post', `/${id}/members`).send({ userId: lid.id });

      const tweede = await alsBeheerder('post', `/${id}/members`).send({ userId: lid.id });
      expect(tweede.status).toBe(409);
      expect(tweede.body.error).toBe('Lid is al toegevoegd aan dit project');
    });

    it('voegt geen lid van een andere vereniging toe', async () => {
      const id = await maakProject();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdLid = createTestUser(andere.id, { email: `proj-${uuidv4()}@test.nl` });

      const antwoord = await alsBeheerder('post', `/${id}/members`).send({ userId: vreemdLid.id });
      expect(antwoord.status).toBe(404);
      expect((await alsLid('get', `/${id}`)).body.members).toEqual([]);
    });

    it('weigert een rol die niet bestaat', async () => {
      const id = await maakProject();
      const antwoord = await alsBeheerder('post', `/${id}/members`).send({ userId: lid.id, role: 'dirigent' });
      expect(antwoord.status).toBe(400);
    });

    it('voegt geen lid toe aan een project van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const antwoord = await alsBeheerder('post', `/${vreemdProject(andere.id)}/members`).send({ userId: lid.id });
      expect(antwoord.status).toBe(404);
    });

    it('verwijdert een lid', async () => {
      const id = await maakProject();
      const toegevoegd = await alsBeheerder('post', `/${id}/members`).send({ userId: lid.id });

      expect((await alsBeheerder('delete', `/${id}/members/${toegevoegd.body.id}`)).status).toBe(200);
      expect((await alsLid('get', `/${id}`)).body.members).toEqual([]);
    });

    it('verwijdert geen lid via een project van een andere vereniging', async () => {
      const id = await maakProject();
      const toegevoegd = await alsBeheerder('post', `/${id}/members`).send({ userId: lid.id });
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, { email: `pl-${uuidv4()}@test.nl`, role: 'admin' });

      const antwoord = await request(app)
        .delete(`/api/projects/${id}/members/${toegevoegd.body.id}`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`);

      expect(antwoord.status).toBe(404);
      expect((await alsLid('get', `/${id}`)).body.members).toHaveLength(1);
    });

    it('telt de leden in het overzicht', async () => {
      const id = await maakProject();
      await alsBeheerder('post', `/${id}/members`).send({ userId: lid.id });

      expect((await alsLid('get', '/')).body[0].memberCount).toBe(1);
    });
  });

  describe('concerten koppelen', () => {
    it('koppelt een concert', async () => {
      const id = await maakProject();
      const concertId = maakConcert();

      const antwoord = await alsBeheerder('post', `/${id}/concerts`).send({ concertId });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);

      const project = await alsLid('get', `/${id}`);
      expect(project.body.concerts).toHaveLength(1);
      expect(project.body.concerts[0].name).toBe('Kerstconcert');
    });

    it('koppelt hetzelfde concert niet twee keer', async () => {
      const id = await maakProject();
      const concertId = maakConcert();
      await alsBeheerder('post', `/${id}/concerts`).send({ concertId });

      const tweede = await alsBeheerder('post', `/${id}/concerts`).send({ concertId });
      expect(tweede.status).toBe(409);
      expect(tweede.body.error).toBe('Concert is al gekoppeld aan dit project');
    });

    it('koppelt geen concert van een andere vereniging', async () => {
      const id = await maakProject();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdConcert = maakConcert(andere.id);

      const antwoord = await alsBeheerder('post', `/${id}/concerts`).send({ concertId: vreemdConcert });
      expect(antwoord.status).toBe(404);
      expect((await alsLid('get', `/${id}`)).body.concerts).toEqual([]);
    });

    it('ontkoppelt een concert', async () => {
      const id = await maakProject();
      const concertId = maakConcert();
      await alsBeheerder('post', `/${id}/concerts`).send({ concertId });

      expect((await alsBeheerder('delete', `/${id}/concerts/${concertId}`)).status).toBe(200);
      expect((await alsLid('get', `/${id}`)).body.concerts).toEqual([]);
    });

    it('ontkoppelt geen concert via een project van een andere vereniging', async () => {
      const id = await maakProject();
      const concertId = maakConcert();
      await alsBeheerder('post', `/${id}/concerts`).send({ concertId });
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, { email: `pc-${uuidv4()}@test.nl`, role: 'admin' });

      const antwoord = await request(app)
        .delete(`/api/projects/${id}/concerts/${concertId}`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`);

      expect(antwoord.status).toBe(404);
      expect((await alsLid('get', `/${id}`)).body.concerts).toHaveLength(1);
    });
  });

  describe('setlist', () => {
    it('voegt een item toe en nummert door', async () => {
      const id = await maakProject();

      await alsBeheerder('post', `/${id}/setlist`).send({ customTitle: 'Openingsmars', durationMinutes: 4 });
      await alsBeheerder('post', `/${id}/setlist`).send({ customTitle: 'Slotstuk' });

      const project = await alsLid('get', `/${id}`);
      expect(project.body.setlist).toHaveLength(2);
      expect(project.body.setlist.map((s: { sortOrder: number }) => s.sortOrder)).toEqual([1, 2]);
      expect(project.body.setlist[0]).toMatchObject({ customTitle: 'Openingsmars', durationMinutes: 4 });
    });

    it('noemt de titel uit de bibliotheek', async () => {
      const id = await maakProject();
      const titelId = uuidv4();
      db.prepare("INSERT INTO music_titles (id, title, association_id) VALUES (?, 'Also sprach', ?)").run(
        titelId,
        vereniging.id,
      );

      await alsBeheerder('post', `/${id}/setlist`).send({ musicTitleId: titelId });

      const project = await alsLid('get', `/${id}`);
      expect(project.body.setlist[0].musicTitleName).toBe('Also sprach');
    });

    it('voegt geen item toe aan een project van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const antwoord = await alsBeheerder('post', `/${vreemdProject(andere.id)}/setlist`).send({
        customTitle: 'Van mij',
      });
      expect(antwoord.status).toBe(404);
    });

    it('verwijdert een item', async () => {
      const id = await maakProject();
      const item = await alsBeheerder('post', `/${id}/setlist`).send({ customTitle: 'Openingsmars' });

      expect((await alsBeheerder('delete', `/${id}/setlist/${item.body.id}`)).status).toBe(200);
      expect((await alsLid('get', `/${id}`)).body.setlist).toEqual([]);
    });

    it('geeft 404 voor een item dat niet bestaat', async () => {
      const id = await maakProject();
      expect((await alsBeheerder('delete', `/${id}/setlist/${uuidv4()}`)).status).toBe(404);
    });

    it('verwijdert geen item via een project van een andere vereniging', async () => {
      const id = await maakProject();
      const item = await alsBeheerder('post', `/${id}/setlist`).send({ customTitle: 'Openingsmars' });
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, { email: `ps-${uuidv4()}@test.nl`, role: 'admin' });

      const antwoord = await request(app)
        .delete(`/api/projects/${id}/setlist/${item.body.id}`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`);

      expect(antwoord.status).toBe(404);
      expect((await alsLid('get', `/${id}`)).body.setlist).toHaveLength(1);
    });
  });

  it('vraagt overal om een geldige aanmelding', async () => {
    expect(lid.id).toBeTruthy();
    expect((await request(app).get('/api/projects')).status).toBe(401);
    expect((await request(app).post('/api/projects').send({ name: 'X' })).status).toBe(401);
  });
});
