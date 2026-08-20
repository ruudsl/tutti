/**
 * Leden synchroniseren vanuit Microsoft Entra.
 *
 * Dit bestand stond op nul procent. Het bestaat uit twee soorten routes: de
 * koppeltabel tussen functietitels en instrumenten, die puur uit de database
 * komt, en de routes die echt met Microsoft Graph praten.
 *
 * Die tweede groep is hier niet nagebootst. Wat wel getest wordt is het pad
 * dat iemand raakt die de koppeling nog niet heeft ingesteld: dat hoort een
 * duidelijke melding te geven en geen 500. Dat is precies waar een beheerder
 * die dit voor het eerst opzet tegenaan loopt.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import entraSyncRoutes from '../../routes/entra-sync';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestUser,
  createTestInstrument,
  generateTestToken,
  createTestEnvironment,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/entra', entraSyncRoutes);
app.use(errorHandler);

let adminToken: string;
let memberToken: string;
let associationId: string;
let instrumentId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  memberToken = omgeving.memberToken;
  associationId = omgeving.association.id;
  instrumentId = createTestInstrument().id;
});

const alsAdmin = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/entra${pad}`).set('Authorization', `Bearer ${adminToken}`);

async function maakKoppeling(jobTitle = 'Trompettist') {
  const res = await alsAdmin('post', '/mappings').send({ jobTitle, instrumentId });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('Koppeling tussen functietitel en instrument', () => {
  it('maakt een koppeling aan en toont hem', async () => {
    const id = await maakKoppeling();

    const res = await alsAdmin('get', '/mappings');
    expect(res.status).toBe(200);
    const lijst = Array.isArray(res.body) ? res.body : (res.body.data ?? []);
    expect(lijst.map((k: { id: string }) => k.id)).toContain(id);
  });

  it('eist een functietitel en een instrument', async () => {
    const res = await alsAdmin('post', '/mappings').send({ jobTitle: 'Zonder instrument' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('verplicht');
  });

  it('meldt dat een onbekend instrument niet bestaat', async () => {
    const res = await alsAdmin('post', '/mappings').send({
      jobTitle: 'Hoornist',
      instrumentId: uuidv4(),
    });
    expect(res.status).toBe(404);
  });

  it('werkt een koppeling bij', async () => {
    const id = await maakKoppeling();

    const res = await alsAdmin('put', `/mappings/${id}`).send({ jobTitle: 'Eerste trompettist', instrumentId });
    expect(res.status).toBe(200);
  });

  it('verwijdert een koppeling', async () => {
    const id = await maakKoppeling();

    const res = await alsAdmin('delete', `/mappings/${id}`);
    expect(res.status).toBe(200);

    const lijst = await alsAdmin('get', '/mappings');
    const na = Array.isArray(lijst.body) ? lijst.body : (lijst.body.data ?? []);
    expect(na.map((k: { id: string }) => k.id)).not.toContain(id);
  });
});

describe('Zonder ingestelde Microsoft-koppeling', () => {
  // Een beheerder die dit voor het eerst opzet heeft nog niets ingesteld. Dan
  // hoort er te staan wat hij moet doen, en niet "interne serverfout".
  const ROUTES: Array<['get' | 'post', string]> = [
    ['get', '/users'],
    ['post', '/users/import'],
    ['post', '/users/sync'],
    ['post', '/sync-photos'],
  ];

  it.each(ROUTES)('%s %s antwoordt met een uitleg en niet met een storing', async (methode, pad) => {
    const res = await alsAdmin(methode, pad).send({});

    // Nadrukkelijk 400 en geen 500: dit is een voorzienbare toestand.
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('noemt bij het ophalen van gebruikers wat er ontbreekt', async () => {
    // Deze route komt meteen bij de Microsoft-configuratie uit. Bij
    // /users/import staat er eerst een controle op de body, die dus als eerste
    // klaagt - dat is de juiste volgorde en geen fout.
    const res = await alsAdmin('get', '/users');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Microsoft');
  });
});

describe('Wie mag synchroniseren', () => {
  it('vraagt om een token', async () => {
    const res = await request(app).get('/api/entra/mappings');
    expect(res.status).toBe(401);
  });

  it('laat een gewoon lid geen koppeling aanmaken', async () => {
    const res = await request(app)
      .post('/api/entra/mappings')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ jobTitle: 'Mag niet', instrumentId });

    expect(res.status).toBe(403);
  });

  it('laat een gewoon lid niet synchroniseren', async () => {
    // Synchroniseren maakt en wijzigt gebruikers; dat hoort bij een beheerder.
    const res = await request(app).post('/api/entra/users/sync').set('Authorization', `Bearer ${memberToken}`).send({});

    expect(res.status).toBe(403);
  });
});

describe('Scheiding tussen verenigingen', () => {
  it('toont de koppelingen van een andere vereniging niet', async () => {
    await maakKoppeling();

    const andere = createTestAssociation();
    const andereToken = generateTestToken(createTestUser(andere.id, { email: 'admin-entra@test.com', role: 'admin' }));

    const res = await request(app).get('/api/entra/mappings').set('Authorization', `Bearer ${andereToken}`);
    expect(res.status).toBe(200);
    const lijst = Array.isArray(res.body) ? res.body : (res.body.data ?? []);
    expect(lijst).toEqual([]);
  });

  it('laat de koppeling van een andere vereniging niet verwijderen', async () => {
    const id = await maakKoppeling();

    const andere = createTestAssociation();
    const andereToken = generateTestToken(createTestUser(andere.id, { email: 'admin-entra2@test.com', role: 'admin' }));

    const res = await request(app).delete(`/api/entra/mappings/${id}`).set('Authorization', `Bearer ${andereToken}`);
    expect(res.status).toBe(404);

    expect(db.prepare('SELECT id FROM job_title_instrument_mappings WHERE id = ?').get(id)).toBeTruthy();
    expect(associationId).toBeTruthy();
  });
});
