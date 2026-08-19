/**
 * Evenementen: optredens buiten de deur, met locaties en een dagindeling.
 *
 * Dit bestand stond op nul procent. Het bevat ook de route
 * /events/packing-templates, die tot vanmiddag onbereikbaar was doordat hij
 * onder '/:id' stond - Express zag "packing-templates" als een id. Die staat
 * hier expliciet in, zodat het niet stilletjes terug kan komen.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import eventsRoutes from '../../routes/events';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestAssociation, createTestUser, generateTestToken, createTestEnvironment } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/events', eventsRoutes);
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

const alsAdmin = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/events${pad}`).set('Authorization', `Bearer ${adminToken}`);

async function maakEvenement(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/').send({
    name: 'Zomerconcert in het park',
    startDatetime: '2026-07-15T19:00:00.000Z',
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function maakLocatie(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/locations').send({
    name: 'Muziekkoepel',
    city: 'Utrecht',
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('Evenementen', () => {
  it('maakt een evenement aan en toont het', async () => {
    const id = await maakEvenement();

    const res = await alsAdmin('get', `/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Zomerconcert in het park');
  });

  it('weigert een evenement zonder naam', async () => {
    const res = await alsAdmin('post', '/').send({ name: '', startDatetime: '2026-07-15T19:00:00.000Z' });
    expect(res.status).toBe(400);
  });

  it('weigert een evenement zonder begintijd', async () => {
    const res = await alsAdmin('post', '/').send({ name: 'Zonder tijd' });
    expect(res.status).toBe(400);
  });

  it('weigert een onbekende status', async () => {
    const res = await alsAdmin('post', '/').send({
      name: 'Fout',
      startDatetime: '2026-07-15T19:00:00.000Z',
      status: 'misschien-wel',
    });
    expect(res.status).toBe(400);
  });

  it('toont de lijst met evenementen', async () => {
    const id = await maakEvenement();

    const res = await alsAdmin('get', '/');
    expect(res.status).toBe(200);
    const lijst = Array.isArray(res.body) ? res.body : (res.body.data ?? []);
    expect(lijst.map((e: { id: string }) => e.id)).toContain(id);
  });

  it('meldt netjes dat een onbekend evenement niet bestaat', async () => {
    const res = await alsAdmin('get', `/${uuidv4()}`);
    expect(res.status).toBe(404);
  });

  it('werkt een evenement bij', async () => {
    const id = await maakEvenement();

    const res = await alsAdmin('put', `/${id}`).send({
      name: 'Hernoemd',
      startDatetime: '2026-07-15T19:00:00.000Z',
    });
    expect(res.status).toBe(200);
  });

  it('verwijdert een evenement', async () => {
    const id = await maakEvenement();

    expect((await alsAdmin('delete', `/${id}`)).status).toBe(200);
    expect((await alsAdmin('get', `/${id}`)).status).toBe(404);
  });
});

describe('De route packing-templates', () => {
  it('is bereikbaar en wordt niet als evenement-id gelezen', async () => {
    // Deze route stond onder '/:id' en was daardoor onbereikbaar: Express zag
    // "packing-templates" als een id en antwoordde met "Evenement niet
    // gevonden". Verplaatst naar boven '/:id'; deze test houdt dat vast.
    const res = await alsAdmin('get', '/packing-templates');

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('niet gevonden');
  });
});

describe('Locaties', () => {
  it('maakt een locatie aan en toont hem', async () => {
    const id = await maakLocatie();

    const res = await alsAdmin('get', '/locations');
    expect(res.status).toBe(200);
    const lijst = Array.isArray(res.body) ? res.body : (res.body.data ?? []);
    expect(lijst.map((l: { id: string }) => l.id)).toContain(id);
  });

  it('weigert een locatie zonder naam', async () => {
    const res = await alsAdmin('post', '/locations').send({ name: '', city: 'Utrecht' });
    expect(res.status).toBe(400);
  });

  it('weigert een negatieve capaciteit', async () => {
    const res = await alsAdmin('post', '/locations').send({ name: 'Zaal', capacity: -50 });
    expect(res.status).toBe(400);
  });

  it('werkt een locatie bij', async () => {
    const id = await maakLocatie();

    const res = await alsAdmin('put', `/locations/${id}`).send({ name: 'Nieuwe naam' });
    expect(res.status).toBe(200);
  });
});

describe('De dagindeling', () => {
  it('voegt een onderdeel toe en toont het', async () => {
    const evenementId = await maakEvenement();

    const gemaakt = await alsAdmin('post', `/${evenementId}/schedule`).send({
      title: 'Soundcheck',
      startTime: '17:00',
    });
    expect(gemaakt.status).toBe(201);

    const res = await alsAdmin('get', `/${evenementId}/schedule`);
    expect(res.status).toBe(200);
  });

  it('weigert een onderdeel zonder titel', async () => {
    const evenementId = await maakEvenement();

    const res = await alsAdmin('post', `/${evenementId}/schedule`).send({ title: '', startTime: '17:00' });
    expect(res.status).toBe(400);
  });

  it('weigert een onderdeel zonder begintijd', async () => {
    const evenementId = await maakEvenement();

    const res = await alsAdmin('post', `/${evenementId}/schedule`).send({ title: 'Zonder tijd' });
    expect(res.status).toBe(400);
  });
});

describe('Wie mag evenementen beheren', () => {
  it('vraagt om een token', async () => {
    const res = await request(app).get('/api/events/');
    expect(res.status).toBe(401);
  });

  it('laat een gewoon lid geen evenement aanmaken', async () => {
    const res = await request(app)
      .post('/api/events/')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ name: 'Mag niet', startDatetime: '2026-07-15T19:00:00.000Z' });

    expect(res.status).toBe(403);
  });
});

describe('Scheiding tussen verenigingen', () => {
  it('toont het evenement van een andere vereniging niet', async () => {
    const id = await maakEvenement();

    const andere = createTestAssociation();
    const andereToken = generateTestToken(createTestUser(andere.id, { email: 'admin-events@test.com', role: 'admin' }));

    const res = await request(app).get(`/api/events/${id}`).set('Authorization', `Bearer ${andereToken}`);
    expect(res.status).toBe(404);
  });

  it('laat het evenement van een andere vereniging niet verwijderen', async () => {
    const id = await maakEvenement();

    const andere = createTestAssociation();
    const andereToken = generateTestToken(
      createTestUser(andere.id, { email: 'admin-events2@test.com', role: 'admin' }),
    );

    const res = await request(app).delete(`/api/events/${id}`).set('Authorization', `Bearer ${andereToken}`);
    expect(res.status).toBe(404);

    // En het evenement moet er echt nog zijn.
    const rij = db.prepare('SELECT id FROM events WHERE id = ?').get(id);
    expect(rij).toBeTruthy();
    expect(associationId).toBeTruthy();
  });
});
