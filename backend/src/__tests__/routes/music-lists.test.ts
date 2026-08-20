/**
 * Muzieklijsten: de mappen waarin een orkest zijn repertoire ordent.
 *
 * Dit bestand stond op nul procent. Een lijst hoort bij een orkest, dus de
 * belangrijkste grens is dat je geen lijst kunt maken bij het orkest van een
 * andere vereniging, en dat een lijst niet zichtbaar wordt buiten de eigen
 * vereniging.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import musicListsRoutes from '../../routes/music-lists';
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
app.use('/api/music-lists', musicListsRoutes);
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

const alsAdmin = (methode: 'get' | 'post' | 'put' | 'patch' | 'delete', pad: string) =>
  request(app)[methode](`/api/music-lists${pad}`).set('Authorization', `Bearer ${adminToken}`);

async function maakLijst(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/').send({
    name: 'Repertoire voorjaar',
    orchestraId: orkestId,
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('Muzieklijsten', () => {
  it('maakt een lijst aan en toont hem', async () => {
    const id = await maakLijst();

    const res = await alsAdmin('get', `/orchestra/${orkestId}`);
    expect(res.status).toBe(200);
    const lijst = Array.isArray(res.body) ? res.body : (res.body.data ?? []);
    expect(lijst.map((l: { id: string }) => l.id)).toContain(id);
  });

  it('weigert een lijst zonder naam', async () => {
    const res = await alsAdmin('post', '/').send({ name: '', orchestraId: orkestId });
    expect(res.status).toBe(400);
  });

  it('weigert een lijst zonder orkest', async () => {
    const res = await alsAdmin('post', '/').send({ name: 'Zwevende lijst' });
    expect(res.status).toBe(400);
  });

  it('weigert een onbekend soort lijst', async () => {
    const res = await alsAdmin('post', '/').send({
      name: 'Fout',
      orchestraId: orkestId,
      listType: 'kerstborrel',
    });
    expect(res.status).toBe(400);
  });

  it('meldt dat een onbekend orkest niet bestaat', async () => {
    const res = await alsAdmin('post', '/').send({ name: 'Lijst', orchestraId: uuidv4() });
    expect(res.status).toBe(404);
  });

  it('toont een lijst op id', async () => {
    const id = await maakLijst();

    const res = await alsAdmin('get', `/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Repertoire voorjaar');
  });

  it('meldt netjes dat een onbekende lijst niet bestaat', async () => {
    const res = await alsAdmin('get', `/${uuidv4()}`);
    expect(res.status).toBe(404);
  });

  it('werkt een lijst bij', async () => {
    const id = await maakLijst();

    const res = await alsAdmin('put', `/${id}`).send({ name: 'Hernoemd' });
    expect(res.status).toBe(200);

    const na = await alsAdmin('get', `/${id}`);
    expect(na.body.name).toBe('Hernoemd');
  });

  it('zet een lijst op inactief en weer terug', async () => {
    const id = await maakLijst();

    // Omzetten gaat met PATCH; het is een wijziging van een enkel veld.
    expect((await alsAdmin('patch', `/${id}/toggle-active`)).status).toBe(200);
    expect((await alsAdmin('patch', `/${id}/toggle-active`)).status).toBe(200);
  });

  it('verwijdert een lijst', async () => {
    const id = await maakLijst();

    expect((await alsAdmin('delete', `/${id}`)).status).toBe(200);
    expect((await alsAdmin('get', `/${id}`)).status).toBe(404);
  });

  it('toont mijn eigen lijsten', async () => {
    const res = await alsAdmin('get', '/my-lists');
    expect(res.status).toBe(200);
  });
});

describe('Wie mag lijsten beheren', () => {
  it('vraagt om een token', async () => {
    const res = await request(app).get(`/api/music-lists/orchestra/${orkestId}`);
    expect(res.status).toBe(401);
  });

  it('laat een gewoon lid geen lijst aanmaken', async () => {
    const res = await request(app)
      .post('/api/music-lists/')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ name: 'Mag niet', orchestraId: orkestId });

    expect(res.status).toBe(403);
  });
});

describe('Scheiding tussen verenigingen', () => {
  it('laat geen lijst maken bij het orkest van een ander', async () => {
    const andere = createTestAssociation();
    const hunOrkest = createTestOrchestra(andere.id);

    const res = await alsAdmin('post', '/').send({ name: 'Ingebroken', orchestraId: hunOrkest.id });
    expect(res.status).toBe(404);
  });

  it('toont de lijst van een andere vereniging niet', async () => {
    const id = await maakLijst();

    const andere = createTestAssociation();
    const andereToken = generateTestToken(createTestUser(andere.id, { email: 'admin-lists@test.com', role: 'admin' }));

    const res = await request(app).get(`/api/music-lists/${id}`).set('Authorization', `Bearer ${andereToken}`);
    expect(res.status).toBe(404);
  });

  it('laat de lijst van een andere vereniging niet verwijderen', async () => {
    const id = await maakLijst();

    const andere = createTestAssociation();
    const andereToken = generateTestToken(createTestUser(andere.id, { email: 'admin-lists2@test.com', role: 'admin' }));

    const res = await request(app).delete(`/api/music-lists/${id}`).set('Authorization', `Bearer ${andereToken}`);
    expect(res.status).toBe(404);

    expect(db.prepare('SELECT id FROM music_lists WHERE id = ?').get(id)).toBeTruthy();
  });
});
