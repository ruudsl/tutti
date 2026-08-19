/**
 * Taken en takenlijsten.
 *
 * Dit bestand stond op negen procent. Taken worden aan leden toegewezen, dus
 * naast de gewone paden gaat het hier om twee dingen: kun je een taak
 * toewijzen aan iemand van een andere vereniging, en kan iemand anders bij
 * jouw taken.
 *
 * Anders dan bij de meeste onderdelen mag hier elk lid taken aanmaken; alleen
 * de lijsten zijn voorbehouden aan beheerders.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import tasksRoutes from '../../routes/tasks';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestAssociation, createTestUser, generateTestToken, createTestEnvironment } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/tasks', tasksRoutes);
app.use(errorHandler);

let adminToken: string;
let memberToken: string;
let associationId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  memberToken = omgeving.memberToken;
  associationId = omgeving.association.id;
});

const alsAdmin = (methode: 'get' | 'post' | 'put' | 'patch' | 'delete', pad: string) =>
  request(app)[methode](`/api/tasks${pad}`).set('Authorization', `Bearer ${adminToken}`);

async function maakTaak(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/').send({
    title: 'Podium opbouwen',
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function maakLijst(naam = 'Concertvoorbereiding') {
  const res = await alsAdmin('post', '/lists').send({ name: naam });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('Taken', () => {
  it('maakt een taak aan en toont hem', async () => {
    const id = await maakTaak();

    const res = await alsAdmin('get', `/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Podium opbouwen');
  });

  it('weigert een taak zonder titel', async () => {
    const res = await alsAdmin('post', '/').send({ title: '' });
    expect(res.status).toBe(400);
  });

  it('weigert een onbekende urgentie', async () => {
    const res = await alsAdmin('post', '/').send({ title: 'Taak', priority: 'brandend' });
    expect(res.status).toBe(400);
  });

  it('weigert een negatief aantal uren', async () => {
    const res = await alsAdmin('post', '/').send({ title: 'Taak', estimatedHours: -3 });
    expect(res.status).toBe(400);
  });

  it('toont de lijst met taken', async () => {
    const id = await maakTaak();

    const res = await alsAdmin('get', '/');
    expect(res.status).toBe(200);
    const lijst = Array.isArray(res.body) ? res.body : (res.body.data ?? []);
    expect(lijst.map((t: { id: string }) => t.id)).toContain(id);
  });

  it('meldt netjes dat een onbekende taak niet bestaat', async () => {
    const res = await alsAdmin('get', `/${uuidv4()}`);
    expect(res.status).toBe(404);
  });

  it('werkt een taak bij', async () => {
    const id = await maakTaak();

    const res = await alsAdmin('put', `/${id}`).send({ title: 'Podium afbreken' });
    expect(res.status).toBe(200);

    const na = await alsAdmin('get', `/${id}`);
    expect(na.body.title).toBe('Podium afbreken');
  });

  it('verwijdert een taak', async () => {
    const id = await maakTaak();

    expect((await alsAdmin('delete', `/${id}`)).status).toBe(200);
    expect((await alsAdmin('get', `/${id}`)).status).toBe(404);
  });

  it('geeft een samenvatting', async () => {
    const res = await alsAdmin('get', '/summary');
    expect(res.status).toBe(200);
  });
});

describe('Takenlijsten', () => {
  it('maakt een lijst aan en toont hem', async () => {
    const id = await maakLijst();

    const res = await alsAdmin('get', '/lists');
    expect(res.status).toBe(200);
    const lijst = Array.isArray(res.body) ? res.body : (res.body.data ?? []);
    expect(lijst.map((l: { id: string }) => l.id)).toContain(id);
  });

  it('weigert een lijst zonder naam', async () => {
    const res = await alsAdmin('post', '/lists').send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('werkt een lijst bij', async () => {
    const id = await maakLijst();

    const res = await alsAdmin('put', `/lists/${id}`).send({ name: 'Hernoemd' });
    expect(res.status).toBe(200);
  });

  it('laat een gewoon lid geen lijst aanmaken', async () => {
    const res = await request(app)
      .post('/api/tasks/lists')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ name: 'Mag niet' });

    expect(res.status).toBe(403);
  });
});

describe('Toewijzen', () => {
  it('wijst een taak toe aan een lid', async () => {
    const lid = createTestUser(associationId, { email: 'uitvoerder@test.com', role: 'member' });

    const res = await alsAdmin('post', '/').send({ title: 'Stoelen klaarzetten', assignedTo: lid.id });
    expect(res.status).toBe(201);
  });

  it('wijst geen taak toe aan iemand van een andere vereniging', async () => {
    // Anders krijgt iemand een taak van een vereniging waar hij niet bij hoort,
    // en ziet hij daarmee wat daar speelt.
    const andere = createTestAssociation();
    const hunLid = createTestUser(andere.id, { email: 'hunlid-taken@test.com', role: 'member' });

    const res = await alsAdmin('post', '/').send({ title: 'Verkeerd toegewezen', assignedTo: hunLid.id });
    expect([400, 404]).toContain(res.status);
  });
});

describe('Wie mag bij de taken', () => {
  it('vraagt om een token', async () => {
    const res = await request(app).get('/api/tasks/');
    expect(res.status).toBe(401);
  });

  it('laat een gewoon lid wel een taak aanmaken', async () => {
    // Anders dan bij de lijsten: taken aanmaken mag iedereen.
    const res = await request(app)
      .post('/api/tasks/')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ title: 'Mijn eigen taak' });

    expect(res.status).toBe(201);
  });
});

describe('Scheiding tussen verenigingen', () => {
  it('toont de taak van een andere vereniging niet', async () => {
    const id = await maakTaak();

    const andere = createTestAssociation();
    const andereToken = generateTestToken(createTestUser(andere.id, { email: 'admin-taken@test.com', role: 'admin' }));

    const res = await request(app).get(`/api/tasks/${id}`).set('Authorization', `Bearer ${andereToken}`);
    expect(res.status).toBe(404);
  });

  it('laat de taak van een andere vereniging niet verwijderen', async () => {
    const id = await maakTaak();

    const andere = createTestAssociation();
    const andereToken = generateTestToken(createTestUser(andere.id, { email: 'admin-taken2@test.com', role: 'admin' }));

    const res = await request(app).delete(`/api/tasks/${id}`).set('Authorization', `Bearer ${andereToken}`);
    expect(res.status).toBe(404);

    expect(db.prepare('SELECT id FROM tasks WHERE id = ?').get(id)).toBeTruthy();
  });
});
