/**
 * De boekhouding was het grootste onafgedekte bestand: 3582 regels, 56 routes,
 * en nul procent dekking. Dat kwam niet doordat er slecht getest werd maar
 * doordat de meting het bestand niet eens zag - zonder `include` telt de
 * v8-provider alleen bestanden die een test toevallig inlaadt.
 *
 * Deze reeks dekt de kern: boekjaren, grootboekrekeningen en contributies, en
 * de twee eigenschappen die bij geld het zwaarst wegen. Wie mag wat, en kan
 * een vereniging bij de boekhouding van een andere.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import '../setup';
import db from '../../database/connection';
import accountingRoutes from '../../routes/accounting';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestAssociation, createTestUser, generateTestToken, createTestEnvironment } from '../testUtils';

/**
 * Een eigen app in plaats van de gedeelde test-app.
 *
 * De moduleguard zit hier bewust niet omheen: die wordt in modules.test.ts
 * gedekt, en meenemen zou elke test hier laten afhangen van of de module
 * aanstaat. Dit gaat over wat de routes zelf doen.
 */
const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/accounting', accountingRoutes);
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
  request(app)[methode](`/api/accounting${pad}`).set('Authorization', `Bearer ${adminToken}`);

async function maakBoekjaar(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/fiscal-years').send({
    name: 'Boekjaar 2026',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('Boekjaren', () => {
  it('begint leeg', async () => {
    const res = await alsAdmin('get', '/fiscal-years');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('maakt een boekjaar aan en geeft het terug', async () => {
    const id = await maakBoekjaar({ isCurrent: true });

    const res = await alsAdmin('get', '/fiscal-years');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id,
      name: 'Boekjaar 2026',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'open',
      isCurrent: true,
    });
  });

  it('houdt maar een boekjaar tegelijk als lopend', async () => {
    // Twee lopende boekjaren zou betekenen dat een boeking in beide kan
    // landen, of in geen van beide.
    await maakBoekjaar({ name: 'Boekjaar 2025', startDate: '2025-01-01', endDate: '2025-12-31', isCurrent: true });
    await maakBoekjaar({ isCurrent: true });

    const res = await alsAdmin('get', '/fiscal-years');
    const lopend = res.body.filter((j: { isCurrent: boolean }) => j.isCurrent);
    expect(lopend).toHaveLength(1);
    expect(lopend[0].name).toBe('Boekjaar 2026');
  });

  it('weigert een boekjaar zonder naam', async () => {
    const res = await alsAdmin('post', '/fiscal-years').send({
      name: '',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(res.status).toBe(400);
  });

  it('weigert een datum in het verkeerde formaat', async () => {
    const res = await alsAdmin('post', '/fiscal-years').send({
      name: 'Fout',
      startDate: '01-01-2026',
      endDate: '2026-12-31',
    });
    expect(res.status).toBe(400);
  });

  it('werkt een boekjaar bij', async () => {
    const id = await maakBoekjaar();

    const res = await alsAdmin('put', `/fiscal-years/${id}`).send({
      name: 'Hernoemd',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(res.status).toBe(200);

    const lijst = await alsAdmin('get', '/fiscal-years');
    expect(lijst.body[0].name).toBe('Hernoemd');
  });

  it('sluit een boekjaar af', async () => {
    const id = await maakBoekjaar();

    const res = await alsAdmin('post', `/fiscal-years/${id}/close`);
    expect(res.status).toBe(200);

    const lijst = await alsAdmin('get', '/fiscal-years');
    expect(lijst.body[0].status).not.toBe('open');
  });

  it('sluit een boekjaar niet twee keer af', async () => {
    const id = await maakBoekjaar();
    await alsAdmin('post', `/fiscal-years/${id}/close`);

    const res = await alsAdmin('post', `/fiscal-years/${id}/close`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('afgesloten');
  });

  it('meldt netjes dat een onbekend boekjaar niet bestaat', async () => {
    const res = await alsAdmin('post', '/fiscal-years/bestaat-niet/close');
    expect(res.status).toBe(404);
  });
});

describe('Grootboekrekeningen', () => {
  it('zet het standaard rekeningschema klaar', async () => {
    const res = await alsAdmin('post', '/accounts/initialize');
    // 201: er worden rekeningen aangemaakt.
    expect(res.status).toBe(201);

    const lijst = await alsAdmin('get', '/accounts');
    expect(lijst.body.length).toBeGreaterThan(5);
    // Kas en Bank horen er sowieso in te zitten.
    const codes = lijst.body.map((r: { code: string }) => r.code);
    expect(codes).toContain('1000');
    expect(codes).toContain('1100');
  });

  it('zet het schema niet een tweede keer klaar', async () => {
    await alsAdmin('post', '/accounts/initialize');

    // Anders zou elke rekening dubbel komen te staan.
    const res = await alsAdmin('post', '/accounts/initialize');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('al rekeningen');
  });

  it('maakt een eigen rekening aan', async () => {
    const res = await alsAdmin('post', '/accounts').send({
      code: '8000',
      name: 'Contributies',
      accountType: 'income',
    });
    expect(res.status).toBe(201);

    const lijst = await alsAdmin('get', '/accounts');
    expect(lijst.body.map((r: { name: string }) => r.name)).toContain('Contributies');
  });

  it('weigert een onbekend rekeningsoort', async () => {
    const res = await alsAdmin('post', '/accounts').send({
      code: '9999',
      name: 'Onzin',
      accountType: 'geen-soort',
    });
    expect(res.status).toBe(400);
  });
});

describe('Wie mag bij de boekhouding', () => {
  it('laat een gewoon lid er niet in', async () => {
    const res = await request(app).get('/api/accounting/fiscal-years').set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(403);
  });

  it('vraagt om een token', async () => {
    const res = await request(app).get('/api/accounting/fiscal-years');
    expect(res.status).toBe(401);
  });
});

describe('Scheiding tussen verenigingen', () => {
  it('toont de boekhouding van een andere vereniging niet', async () => {
    // Dit is de eigenschap waar het bij een gedeelde installatie om draait:
    // twee verenigingen in dezelfde database mogen elkaars cijfers niet zien.
    await maakBoekjaar({ name: 'Van vereniging A' });

    const andere = createTestAssociation();
    const andereAdmin = createTestUser(andere.id, { email: 'admin-b@test.com', role: 'admin' });
    const andereToken = generateTestToken(andereAdmin);

    const res = await request(app).get('/api/accounting/fiscal-years').set('Authorization', `Bearer ${andereToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('laat een boekjaar van een andere vereniging niet afsluiten', async () => {
    const id = await maakBoekjaar();

    const andere = createTestAssociation();
    const andereAdmin = createTestUser(andere.id, { email: 'admin-c@test.com', role: 'admin' });
    const andereToken = generateTestToken(andereAdmin);

    const res = await request(app)
      .post(`/api/accounting/fiscal-years/${id}/close`)
      .set('Authorization', `Bearer ${andereToken}`);

    // 404 en niet 403: dat boekjaar hoort voor deze vereniging niet te bestaan.
    expect(res.status).toBe(404);

    // En het moet echt nog open staan.
    const lijst = await alsAdmin('get', '/fiscal-years');
    expect(lijst.body[0].status).toBe('open');
  });

  it('houdt rekeningen per vereniging apart', async () => {
    await alsAdmin('post', '/accounts/initialize');

    const andere = createTestAssociation();
    const andereAdmin = createTestUser(andere.id, { email: 'admin-d@test.com', role: 'admin' });
    const andereToken = generateTestToken(andereAdmin);

    const res = await request(app).get('/api/accounting/accounts').set('Authorization', `Bearer ${andereToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(associationId).toBeTruthy();
  });
});
