/**
 * De opstelling van het orkest: rijen, zitplaatsen en wie naast wie wil zitten.
 *
 * Dit bestand stond op nul procent. De twee eigenschappen die hier het meest
 * toe doen zijn dat een rijnummer en een zitplaats maar een keer vergeven
 * kunnen worden - anders staan er twee mensen op dezelfde plek - en dat een
 * vereniging niet in de opstelling van een andere kan rommelen.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import seatingRoutes from '../../routes/seating';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestUser,
  createTestOrchestra,
  generateTestToken,
  createTestEnvironment,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/seating', seatingRoutes);
app.use(errorHandler);

let adminToken: string;
let memberToken: string;
let associationId: string;
let orkestId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  memberToken = omgeving.memberToken;
  associationId = omgeving.association.id;
  orkestId = createTestOrchestra(associationId).id;
});

const alsAdmin = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/seating${pad}`).set('Authorization', `Bearer ${adminToken}`);

async function maakRij(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/sections').send({
    orchestraId: orkestId,
    name: 'Eerste rij',
    rowNumber: 1,
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('Rijen', () => {
  it('maakt een rij aan en toont hem', async () => {
    const id = await maakRij();

    const res = await alsAdmin('get', `/sections/${orkestId}`);
    expect(res.status).toBe(200);
    expect(res.body.map((r: { id: string }) => r.id)).toContain(id);
  });

  it('geeft hetzelfde rijnummer niet twee keer uit', async () => {
    // Twee rijen met nummer 1 betekent dat niemand meer weet welke rij welke
    // is, en de opstelling per weergave kan verspringen.
    await maakRij();

    const res = await alsAdmin('post', '/sections').send({
      orchestraId: orkestId,
      name: 'Ook eerste rij',
      rowNumber: 1,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('bestaat al');
  });

  it('weigert een rijnummer van nul', async () => {
    const res = await alsAdmin('post', '/sections').send({
      orchestraId: orkestId,
      name: 'Rij nul',
      rowNumber: 0,
    });
    expect(res.status).toBe(400);
  });

  it('weigert een rij zonder naam', async () => {
    const res = await alsAdmin('post', '/sections').send({
      orchestraId: orkestId,
      name: '',
      rowNumber: 2,
    });
    expect(res.status).toBe(400);
  });

  it('meldt dat een onbekend orkest niet bestaat', async () => {
    const res = await alsAdmin('post', '/sections').send({
      orchestraId: uuidv4(),
      name: 'Rij',
      rowNumber: 1,
    });
    expect(res.status).toBe(404);
  });

  it('werkt een rij bij', async () => {
    const id = await maakRij();

    const res = await alsAdmin('put', `/sections/${id}`).send({ name: 'Hernoemd' });
    expect(res.status).toBe(200);
  });

  it('verwijdert een rij', async () => {
    const id = await maakRij();

    const res = await alsAdmin('delete', `/sections/${id}`);
    expect(res.status).toBe(200);

    const lijst = await alsAdmin('get', `/sections/${orkestId}`);
    expect(lijst.body.map((r: { id: string }) => r.id)).not.toContain(id);
  });
});

describe('Zitplaatsen', () => {
  it('wijst een zitplaats toe', async () => {
    const rijId = await maakRij();
    const lid = createTestUser(associationId, { email: 'speler@test.com', role: 'member' });

    const res = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: lid.id,
      sectionId: rijId,
      positionInSection: 0,
    });

    expect(res.status).toBe(201);
  });

  it('geeft hetzelfde lid niet twee zitplaatsen in een orkest', async () => {
    // Anders staat iemand op twee plekken tegelijk in dezelfde opstelling.
    const rijId = await maakRij();
    const tweedeRij = await maakRij({ name: 'Tweede rij', rowNumber: 2 });
    const lid = createTestUser(associationId, { email: 'dubbel@test.com', role: 'member' });

    await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: lid.id,
      sectionId: rijId,
      positionInSection: 0,
    });

    const res = await alsAdmin('post', '/assignments').send({
      orchestraId: orkestId,
      userId: lid.id,
      sectionId: tweedeRij,
      positionInSection: 1,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('al een zitplaats');
  });

  it('toont de opstelling van een orkest', async () => {
    const res = await alsAdmin('get', `/assignments/${orkestId}`);
    expect(res.status).toBe(200);
  });
});

describe('Wie mag de opstelling wijzigen', () => {
  it('vraagt om een token', async () => {
    const res = await request(app).get(`/api/seating/sections/${orkestId}`);
    expect(res.status).toBe(401);
  });

  it('laat een gewoon lid geen rij aanmaken', async () => {
    const res = await request(app)
      .post('/api/seating/sections')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ orchestraId: orkestId, name: 'Mag niet', rowNumber: 9 });

    expect(res.status).toBe(403);
  });
});

describe('Scheiding tussen verenigingen', () => {
  it('laat geen rij aanmaken bij het orkest van een ander', async () => {
    const andere = createTestAssociation();
    const hunOrkest = createTestOrchestra(andere.id);

    const res = await alsAdmin('post', '/sections').send({
      orchestraId: hunOrkest.id,
      name: 'Ingebroken',
      rowNumber: 1,
    });

    expect(res.status).toBe(404);
  });

  it('laat de rij van een ander orkest niet verwijderen', async () => {
    const andere = createTestAssociation();
    const hunOrkest = createTestOrchestra(andere.id);
    const hunAdmin = createTestUser(andere.id, { email: 'admin-seat@test.com', role: 'admin' });

    const gemaakt = await request(app)
      .post('/api/seating/sections')
      .set('Authorization', `Bearer ${generateTestToken(hunAdmin)}`)
      .send({ orchestraId: hunOrkest.id, name: 'Hun rij', rowNumber: 1 });
    expect(gemaakt.status).toBe(201);

    const res = await alsAdmin('delete', `/sections/${gemaakt.body.id}`);
    expect(res.status).toBe(404);

    // En de rij moet er echt nog zijn.
    const rij = db.prepare('SELECT id FROM seating_sections WHERE id = ?').get(gemaakt.body.id);
    expect(rij).toBeTruthy();
  });
});
