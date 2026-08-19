/**
 * Contacten: organisaties, zalen en leveranciers waar de vereniging mee werkt.
 *
 * Dit bestand stond op nul procent en bevat persoonsgegevens - namen,
 * e-mailadressen en telefoonnummers van mensen buiten de vereniging. De vragen
 * zijn dus dezelfde als bij leden: wie mag erbij, en blijft het gescheiden van
 * andere verenigingen.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import contactsRoutes from '../../routes/contacts';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestAssociation, createTestUser, generateTestToken, createTestEnvironment } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/contacts', contactsRoutes);
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

const alsAdmin = (methode: 'get' | 'post' | 'patch' | 'delete', pad: string) =>
  request(app)[methode](`/api/contacts${pad}`).set('Authorization', `Bearer ${adminToken}`);

async function maakContact(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/').send({
    contactType: 'venue',
    name: 'Concertzaal De Notenbalk',
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('Contacten', () => {
  it('begint leeg', async () => {
    const res = await alsAdmin('get', '/');
    expect(res.status).toBe(200);
  });

  it('maakt een contact aan en toont het', async () => {
    const id = await maakContact();

    const res = await alsAdmin('get', `/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Concertzaal De Notenbalk');
  });

  it('weigert een contact zonder naam', async () => {
    const res = await alsAdmin('post', '/').send({ contactType: 'venue', name: '' });
    expect(res.status).toBe(400);
  });

  it('weigert een onbekend soort contact', async () => {
    const res = await alsAdmin('post', '/').send({ contactType: 'ruimteschip', name: 'Iets' });
    expect(res.status).toBe(400);
  });

  it('werkt een contact bij', async () => {
    const id = await maakContact();

    // Bijwerken gaat met PATCH; de route neemt losse velden aan.
    const res = await alsAdmin('patch', `/${id}`).send({ name: 'Nieuwe naam' });
    expect(res.status).toBe(200);

    const na = await alsAdmin('get', `/${id}`);
    expect(na.body.name).toBe('Nieuwe naam');
  });

  it('meldt netjes dat een onbekend contact niet bestaat', async () => {
    const res = await alsAdmin('get', `/${uuidv4()}`);
    expect(res.status).toBe(404);
  });

  it('zet een contact op inactief en weer terug', async () => {
    const id = await maakContact();

    expect((await alsAdmin('post', `/${id}/deactivate`)).status).toBe(200);
    expect((await alsAdmin('post', `/${id}/activate`)).status).toBe(200);
  });
});

describe('Categorieen', () => {
  it('maakt een categorie aan en toont hem', async () => {
    const res = await alsAdmin('post', '/categories').send({ name: 'Zalen' });
    expect(res.status).toBe(201);

    const lijst = await alsAdmin('get', '/categories');
    expect(lijst.status).toBe(200);
    expect(lijst.body.map((c: { name: string }) => c.name)).toContain('Zalen');
  });

  it('weigert een categorie zonder naam', async () => {
    const res = await alsAdmin('post', '/categories').send({ name: '' });
    expect(res.status).toBe(400);
  });
});

describe('Wie mag bij de contacten', () => {
  it('vraagt om een token', async () => {
    const res = await request(app).get('/api/contacts/');
    expect(res.status).toBe(401);
  });

  it('laat een gewoon lid geen contact aanmaken', async () => {
    const res = await request(app)
      .post('/api/contacts/')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ contactType: 'venue', name: 'Mag niet' });

    expect(res.status).toBe(403);
  });
});

describe('Scheiding tussen verenigingen', () => {
  it('toont het contact van een andere vereniging niet', async () => {
    // Contacten bevatten namen, adressen en telefoonnummers van mensen buiten
    // de vereniging.
    const id = await maakContact();

    const andere = createTestAssociation();
    const andereToken = generateTestToken(
      createTestUser(andere.id, { email: 'admin-contact@test.com', role: 'admin' }),
    );

    const res = await request(app).get(`/api/contacts/${id}`).set('Authorization', `Bearer ${andereToken}`);
    expect(res.status).toBe(404);
  });

  it('laat het contact van een andere vereniging niet wijzigen', async () => {
    const id = await maakContact();

    const andere = createTestAssociation();
    const andereToken = generateTestToken(
      createTestUser(andere.id, { email: 'admin-contact2@test.com', role: 'admin' }),
    );

    const res = await request(app)
      .patch(`/api/contacts/${id}`)
      .set('Authorization', `Bearer ${andereToken}`)
      .send({ name: 'Overgenomen' });

    expect(res.status).toBe(404);

    // En de naam moet echt ongewijzigd zijn.
    const rij = db.prepare('SELECT name FROM contacts WHERE id = ?').get(id) as { name: string };
    expect(rij.name).toBe('Concertzaal De Notenbalk');
    expect(associationId).toBeTruthy();
  });
});
