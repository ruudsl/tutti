/**
 * Leden in en uit dienst nemen.
 *
 * Dit bestand stond op nul procent, en het raakt ledengegevens: een lid
 * deactiveren, weer activeren, en zien wie er inactief is. Dat gaat over
 * mensen, dus de vragen zijn wie het mag en of een vereniging bij de leden van
 * een andere kan.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import '../setup';
import db from '../../database/connection';
import onboardingRoutes from '../../routes/onboarding';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestAssociation, createTestUser, generateTestToken, createTestEnvironment } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/onboarding', onboardingRoutes);
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
  request(app)[methode](`/api/onboarding${pad}`).set('Authorization', `Bearer ${adminToken}`);

function statusVan(userId: string): string {
  const rij = db.prepare('SELECT status FROM users WHERE id = ?').get(userId) as { status: string };
  return rij.status;
}

describe('Een lid uit dienst nemen', () => {
  it('zet het lid op inactief', async () => {
    const lid = createTestUser(associationId, { email: 'vertrekker@test.com', role: 'member' });

    const res = await alsAdmin('post', `/offboard/${lid.id}`).send({ removeFromM365: false });
    expect(res.status).toBe(200);
    expect(statusVan(lid.id)).toBe('inactive');
  });

  it('doet dat niet twee keer', async () => {
    const lid = createTestUser(associationId, { email: 'vertrekker2@test.com', role: 'member' });
    await alsAdmin('post', `/offboard/${lid.id}`).send({ removeFromM365: false });

    const res = await alsAdmin('post', `/offboard/${lid.id}`).send({ removeFromM365: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('gedeactiveerd');
  });

  it('meldt netjes dat een onbekend lid niet bestaat', async () => {
    const res = await alsAdmin('post', '/offboard/11111111-1111-1111-1111-111111111111').send({});
    expect(res.status).toBe(404);
  });

  it('laat een gewoon lid niemand deactiveren', async () => {
    const lid = createTestUser(associationId, { email: 'slachtoffer@test.com', role: 'member' });

    const res = await request(app)
      .post(`/api/onboarding/offboard/${lid.id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({});

    expect(res.status).toBe(403);
    expect(statusVan(lid.id)).not.toBe('inactive');
  });
});

describe('Een lid weer in dienst nemen', () => {
  it('zet het lid terug op actief', async () => {
    const lid = createTestUser(associationId, { email: 'terugkeerder@test.com', role: 'member' });
    await alsAdmin('post', `/offboard/${lid.id}`).send({ removeFromM365: false });

    const res = await alsAdmin('post', `/reactivate/${lid.id}`).send({});
    expect(res.status).toBe(200);
    expect(statusVan(lid.id)).not.toBe('inactive');
  });

  it('meldt netjes dat een onbekend lid niet bestaat', async () => {
    const res = await alsAdmin('post', '/reactivate/11111111-1111-1111-1111-111111111111').send({});
    expect(res.status).toBe(404);
  });
});

describe('Wie is er inactief', () => {
  it('toont alleen de inactieve leden', async () => {
    const blijver = createTestUser(associationId, { email: 'blijver@test.com', role: 'member' });
    const vertrekker = createTestUser(associationId, { email: 'weg@test.com', role: 'member' });
    await alsAdmin('post', `/offboard/${vertrekker.id}`).send({ removeFromM365: false });

    const res = await alsAdmin('get', '/inactive-members');
    expect(res.status).toBe(200);

    const ids = res.body.map((l: { id: string }) => l.id);
    expect(ids).toContain(vertrekker.id);
    expect(ids).not.toContain(blijver.id);
  });

  it('laat een gewoon lid de lijst niet zien', async () => {
    const res = await request(app)
      .get('/api/onboarding/inactive-members')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Scheiding tussen verenigingen', () => {
  it('laat een lid van een andere vereniging niet deactiveren', async () => {
    // Zonder deze grens kan een beheerder de leden van een andere vereniging
    // uit dienst nemen.
    const andere = createTestAssociation();
    const hunLid = createTestUser(andere.id, { email: 'hunlid@test.com', role: 'member' });

    const res = await alsAdmin('post', `/offboard/${hunLid.id}`).send({ removeFromM365: false });

    expect(res.status).toBe(404);
    expect(statusVan(hunLid.id)).not.toBe('inactive');
  });

  it('toont de inactieve leden van een andere vereniging niet', async () => {
    const andere = createTestAssociation();
    const hunLid = createTestUser(andere.id, { email: 'huninactief@test.com', role: 'member' });
    db.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(hunLid.id);

    const res = await alsAdmin('get', '/inactive-members');
    expect(res.status).toBe(200);
    expect(res.body.map((l: { id: string }) => l.id)).not.toContain(hunLid.id);
  });
});

describe('Functietitels bij instrumenten', () => {
  it('geeft de lijst terug', async () => {
    const res = await alsAdmin('get', '/job-titles');
    expect(res.status).toBe(200);
  });

  it('eist een instrument en een titel', async () => {
    const res = await alsAdmin('post', '/job-titles').send({ jobTitle: 'Zonder instrument' });
    expect(res.status).toBe(400);
  });

  it('meldt dat een onbekend instrument niet bestaat', async () => {
    const res = await alsAdmin('post', '/job-titles').send({
      instrumentId: '11111111-1111-1111-1111-111111111111',
      jobTitle: 'Trompettist',
    });
    expect(res.status).toBe(404);
  });
});
