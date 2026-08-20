/**
 * Berichten aan de leden, met categorieen en reacties.
 *
 * Dit bestand stond op nul procent. Berichten hebben een concept- en een
 * gepubliceerde toestand, en dat onderscheid is hier het belangrijkst: een
 * concept hoort niet zichtbaar te zijn voor gewone leden, en op een bericht
 * waar reacties uitstaan hoort niemand te kunnen reageren.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import postsRoutes from '../../routes/posts';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestAssociation, createTestUser, generateTestToken, createTestEnvironment } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/posts', postsRoutes);
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
  request(app)[methode](`/api/posts${pad}`).set('Authorization', `Bearer ${adminToken}`);

async function maakBericht(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/').send({
    title: 'Uitnodiging jaarvergadering',
    content: 'Beste leden, hierbij de uitnodiging.',
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('Berichten', () => {
  it('maakt een bericht aan als concept', async () => {
    const id = await maakBericht();

    const rij = db.prepare('SELECT status FROM posts WHERE id = ?').get(id) as { status: string };
    expect(rij.status).toBe('draft');
  });

  it('weigert een bericht zonder titel', async () => {
    const res = await alsAdmin('post', '/').send({ title: '', content: 'Iets' });
    expect(res.status).toBe(400);
  });

  it('weigert een bericht zonder inhoud', async () => {
    const res = await alsAdmin('post', '/').send({ title: 'Titel', content: '' });
    expect(res.status).toBe(400);
  });

  it('weigert een onbekende toestand', async () => {
    const res = await alsAdmin('post', '/').send({
      title: 'Titel',
      content: 'Iets',
      status: 'half-af',
    });
    expect(res.status).toBe(400);
  });

  it('toont een gepubliceerd bericht', async () => {
    const id = await maakBericht({ status: 'published' });

    const res = await alsAdmin('get', `/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Uitnodiging jaarvergadering');
  });

  it('meldt netjes dat een onbekend bericht niet bestaat', async () => {
    const res = await alsAdmin('get', `/${uuidv4()}`);
    expect(res.status).toBe(404);
  });

  it('werkt een bericht bij', async () => {
    const id = await maakBericht();

    const res = await alsAdmin('put', `/${id}`).send({ title: 'Hernoemd', content: 'Nieuwe inhoud' });
    expect(res.status).toBe(200);
  });

  it('verwijdert een bericht', async () => {
    const id = await maakBericht();

    expect((await alsAdmin('delete', `/${id}`)).status).toBe(200);
    expect((await alsAdmin('get', `/${id}`)).status).toBe(404);
  });
});

describe('Reacties', () => {
  it('plaatst een reactie op een bericht', async () => {
    const id = await maakBericht({ status: 'published' });

    const res = await request(app)
      .post(`/api/posts/${id}/comments`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ content: 'Ik kom!' });

    expect(res.status).toBe(201);
  });

  it('laat niet reageren als reacties uitstaan', async () => {
    // Anders is de instelling "reacties uit" een suggestie in plaats van een
    // grens.
    const id = await maakBericht({ status: 'published', allowComments: false });

    const res = await request(app)
      .post(`/api/posts/${id}/comments`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ content: 'Toch een reactie' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('niet toegestaan');
  });

  it('meldt netjes dat een onbekend bericht niet bestaat', async () => {
    const res = await request(app)
      .post(`/api/posts/${uuidv4()}/comments`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ content: 'Hoi' });

    expect(res.status).toBe(404);
  });
});

describe('Categorieen', () => {
  it('maakt een categorie aan en toont hem', async () => {
    const gemaakt = await alsAdmin('post', '/categories').send({ name: 'Mededelingen', slug: 'mededelingen' });
    expect(gemaakt.status).toBe(201);

    const res = await alsAdmin('get', '/categories');
    expect(res.status).toBe(200);
    const lijst = Array.isArray(res.body) ? res.body : (res.body.data ?? []);
    expect(lijst.map((c: { slug: string }) => c.slug)).toContain('mededelingen');
  });

  it('weigert een slug met hoofdletters of spaties', async () => {
    // De slug komt in het webadres te staan; daar horen geen spaties in.
    const res = await alsAdmin('post', '/categories').send({ name: 'Fout', slug: 'Geen Goede Slug' });
    expect(res.status).toBe(400);
  });

  it('weigert een categorie zonder naam', async () => {
    const res = await alsAdmin('post', '/categories').send({ name: '', slug: 'leeg' });
    expect(res.status).toBe(400);
  });
});

describe('Wie mag berichten plaatsen', () => {
  it('vraagt om een token', async () => {
    const res = await request(app).get('/api/posts/');
    expect(res.status).toBe(401);
  });

  it('laat een gewoon lid geen bericht plaatsen', async () => {
    const res = await request(app)
      .post('/api/posts/')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ title: 'Mag niet', content: 'Iets' });

    expect(res.status).toBe(403);
  });
});

describe('Scheiding tussen verenigingen', () => {
  it('toont het bericht van een andere vereniging niet', async () => {
    const id = await maakBericht({ status: 'published' });

    const andere = createTestAssociation();
    const andereToken = generateTestToken(createTestUser(andere.id, { email: 'admin-posts@test.com', role: 'admin' }));

    const res = await request(app).get(`/api/posts/${id}`).set('Authorization', `Bearer ${andereToken}`);
    expect(res.status).toBe(404);
  });

  it('laat het bericht van een andere vereniging niet verwijderen', async () => {
    const id = await maakBericht();

    const andere = createTestAssociation();
    const andereToken = generateTestToken(createTestUser(andere.id, { email: 'admin-posts2@test.com', role: 'admin' }));

    const res = await request(app).delete(`/api/posts/${id}`).set('Authorization', `Bearer ${andereToken}`);
    expect(res.status).toBe(404);

    expect(db.prepare('SELECT id FROM posts WHERE id = ?').get(id)).toBeTruthy();
    expect(associationId).toBeTruthy();
  });
});
