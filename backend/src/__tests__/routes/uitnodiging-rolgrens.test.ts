/**
 * Een uitnodiging mag niemand een hogere rol geven dan de uitnodiger zelf heeft.
 *
 * Een bestuurslid kon bij POST /invitations de rol 'admin' opgeven, zijn eigen
 * tweede account uitnodigen, aannemen en wisselen. Wisselen neemt de rol uit
 * user_associations over in users.role, en het nieuwe token zei 'admin'. Deze
 * tests leggen vast dat dat pad dicht is, ook voor een uitnodiging die al
 * bestond voordat de controle er was, en dat verwijderen of terugzetten van een
 * lid geen rol laat hangen die bij een andere vereniging hoorde.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import multiAssociationRoutes from '../../routes/multi-association';
import { errorHandler } from '../../middleware/errorHandler';
import { registerSession } from '../../utils/sessionStore';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestUser,
  generateTestToken,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/multi-association', multiAssociationRoutes);
app.use(errorHandler);

/** Een bestuurslid: de rol 'board' staat niet in de TestUser-typen, dus zelf zetten. */
function maakBestuurslid(associationId: string, email: string): { gebruiker: TestUser; token: string } {
  const gebruiker = createTestUser(associationId, { email });
  db.prepare("UPDATE users SET role = 'board' WHERE id = ?").run(gebruiker.id);
  return { gebruiker, token: generateTestToken({ ...gebruiker, role: 'board' as TestUser['role'] }) };
}

function rolVan(userId: string): string {
  return (db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string }).role;
}

describe('rolgrens bij uitnodigen', () => {
  let verenigingId: string;
  let beheerderToken: string;
  let bestuur: { gebruiker: TestUser; token: string };
  let tweedeAccount: TestUser;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    verenigingId = omgeving.association.id;
    beheerderToken = omgeving.adminToken;
    bestuur = maakBestuurslid(verenigingId, 'bestuur@test.nl');
    tweedeAccount = createTestUser(verenigingId, { email: 'tweede-account@test.nl' });
  });

  const nodigUit = (token: string, email: string, role: string) =>
    request(app)
      .post('/api/multi-association/invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({ email, role });

  it('weigert dat een bestuurslid iemand als beheerder uitnodigt', async () => {
    const antwoord = await nodigUit(bestuur.token, tweedeAccount.email, 'admin');

    expect(antwoord.status).toBe(403);
    expect(db.prepare('SELECT id FROM association_invitations WHERE email = ?').get(tweedeAccount.email)).toBe(
      undefined,
    );
  });

  it('laat een bestuurslid wel een lid of bestuurslid uitnodigen', async () => {
    expect((await nodigUit(bestuur.token, 'nieuw-lid@test.nl', 'member')).status).toBe(201);
    expect((await nodigUit(bestuur.token, 'nieuw-bestuur@test.nl', 'board')).status).toBe(201);
  });

  it('laat een beheerder een beheerder uitnodigen', async () => {
    expect((await nodigUit(beheerderToken, 'nieuwe-beheerder@test.nl', 'admin')).status).toBe(201);
  });

  it('levert via uitnodigen, aannemen en wisselen geen beheerdersrol op voor een bestuurslid', async () => {
    await nodigUit(bestuur.token, tweedeAccount.email, 'admin');

    // Ook als er toch een uitnodiging ligt (van vóór deze controle): aannemen
    // mag die rol niet opleveren zolang de uitnodiger hem zelf niet heeft.
    const token = crypto.randomBytes(16).toString('hex');
    db.prepare(
      `INSERT INTO association_invitations (id, association_id, email, role, invited_by, token, expires_at)
       VALUES (?, ?, ?, 'admin', ?, ?, ?)`,
    ).run(
      uuidv4(),
      verenigingId,
      tweedeAccount.email,
      bestuur.gebruiker.id,
      token,
      new Date(Date.now() + 86_400_000).toISOString(),
    );

    const aannemen = await request(app)
      .post(`/api/multi-association/invitations/accept/${token}`)
      .set('Authorization', `Bearer ${generateTestToken(tweedeAccount)}`);
    expect(aannemen.status).toBe(403);

    const wisselen = await request(app)
      .post('/api/multi-association/switch-association')
      .set('Authorization', `Bearer ${generateTestToken(tweedeAccount)}`)
      .send({ associationId: verenigingId });
    expect(wisselen.status).toBe(200);

    const inhoud = JSON.parse(Buffer.from(wisselen.body.token.split('.')[1], 'base64url').toString());
    expect(inhoud.role).toBe('member');
    expect(rolVan(tweedeAccount.id)).toBe('member');
  });

  it('laat een uitnodiging als beheerder van een beheerder gewoon aannemen', async () => {
    const uitnodiging = await nodigUit(beheerderToken, tweedeAccount.email, 'admin');
    const token = uitnodiging.body.inviteUrl.split('/').pop();

    const aannemen = await request(app)
      .post(`/api/multi-association/invitations/accept/${token}`)
      .set('Authorization', `Bearer ${generateTestToken(tweedeAccount)}`);
    expect(aannemen.status).toBe(200);
  });
});

describe('rol na verwijderen of terugzetten van een lid', () => {
  it('neemt bij verwijderen de rol uit de overgebleven vereniging mee', async () => {
    const thuis = createTestAssociation({ name: `Thuis-${uuidv4()}` });
    const elders = createTestEnvironment();
    const lid = createTestUser(thuis.id, { email: 'reiziger@test.nl' });

    // Lid in de eigen vereniging, beheerder bij 'elders', en daar nu actief.
    db.prepare(
      "INSERT INTO user_associations (user_id, association_id, role, status) VALUES (?, ?, 'member', 'active')",
    ).run(lid.id, thuis.id);
    db.prepare(
      "INSERT INTO user_associations (user_id, association_id, role, status) VALUES (?, ?, 'admin', 'active')",
    ).run(lid.id, elders.association.id);
    db.prepare("UPDATE users SET association_id = ?, role = 'admin' WHERE id = ?").run(elders.association.id, lid.id);

    const antwoord = await request(app)
      .delete(`/api/multi-association/members/${lid.id}`)
      .set('Authorization', `Bearer ${elders.adminToken}`);
    expect(antwoord.status).toBe(200);

    const rij = db.prepare('SELECT association_id, role FROM users WHERE id = ?').get(lid.id) as {
      association_id: string;
      role: string;
    };
    expect(rij.association_id).toBe(thuis.id);
    expect(rij.role).toBe('member');
  });

  it('laat een teruggezette rol meteen gelden als het lid in deze vereniging staat', async () => {
    const omgeving = createTestEnvironment();
    const lid = createTestUser(omgeving.association.id, { email: 'teruggezet@test.nl', role: 'admin' });
    db.prepare(
      "INSERT INTO user_associations (user_id, association_id, role, status) VALUES (?, ?, 'admin', 'active')",
    ).run(lid.id, omgeving.association.id);
    const lidToken = generateTestToken(lid);
    registerSession(lid.id, lidToken, '127.0.0.1', 'test');

    const antwoord = await request(app)
      .put(`/api/multi-association/members/${lid.id}/role`)
      .set('Authorization', `Bearer ${omgeving.adminToken}`)
      .send({ role: 'member' });
    expect(antwoord.status).toBe(200);

    expect(rolVan(lid.id)).toBe('member');
    // Het token met 'admin' erin werkt niet meer; opnieuw inloggen geeft 'member'.
    const metOudToken = await request(app)
      .get('/api/multi-association/invitations')
      .set('Authorization', `Bearer ${lidToken}`);
    expect(metOudToken.status).toBe(401);
  });
});
