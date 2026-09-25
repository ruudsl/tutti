/**
 * Een gedeactiveerde vereniging (associations.is_active = 0) sluit haar leden
 * buiten.
 *
 * De vlag werd alleen gebruikt om de vereniging in overzichten te verbergen.
 * Leden konden gewoon inloggen, en wie al was ingelogd merkte niets. Een
 * superbeheerder blijft binnenkomen: die moet de vereniging kunnen bekijken en
 * weer aanzetten.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import app from '../testApp';
import db from '../../database/connection';
import { createTestEnvironment, generateTestToken, TestAssociation, TestUser } from '../testUtils';

describe('gedeactiveerde vereniging', () => {
  let vereniging: TestAssociation;
  let lid: TestUser;
  let lidToken: string;
  let beheerder: TestUser;
  let beheerderToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
  });

  const deactiveer = () => db.prepare('UPDATE associations SET is_active = 0 WHERE id = ?').run(vereniging.id);
  const inloggen = (gebruiker: TestUser) =>
    request(app).post('/api/auth/login').send({ email: gebruiker.email, password: gebruiker.password });
  const ik = (token: string) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

  it('laat leden van een actieve vereniging gewoon binnen', async () => {
    expect((await inloggen(lid)).status).toBe(200);
    expect((await ik(lidToken)).status).toBe(200);
  });

  it('weigert het inloggen van een lid', async () => {
    deactiveer();

    const antwoord = await inloggen(lid);
    expect(antwoord.status).toBe(403);
    expect(antwoord.body).not.toHaveProperty('token');
  });

  it('weigert verzoeken met een token van voor het deactiveren', async () => {
    deactiveer();

    expect((await ik(lidToken)).status).toBe(401);
  });

  it('laat een superbeheerder binnen, bij inloggen en daarna', async () => {
    db.prepare('INSERT INTO super_admins (id, user_id) VALUES (?, ?)').run(uuidv4(), beheerder.id);
    deactiveer();

    expect((await inloggen(beheerder)).status).toBe(200);
    expect((await ik(beheerderToken)).status).toBe(200);
  });

  it('kijkt naar de vereniging uit het token', async () => {
    // Het lid is intussen naar een andere, actieve vereniging gewisseld; een
    // oud token voor de gedeactiveerde telt niet meer.
    const andere = uuidv4();
    db.prepare('INSERT INTO associations (id, name) VALUES (?, ?)').run(andere, `Andere ${andere}`);
    const oudToken = generateTestToken(lid);
    const nieuwToken = generateTestToken({ ...lid, associationId: andere });
    deactiveer();

    expect((await ik(oudToken)).status).toBe(401);
    expect((await ik(nieuwToken)).status).toBe(200);
  });
});
