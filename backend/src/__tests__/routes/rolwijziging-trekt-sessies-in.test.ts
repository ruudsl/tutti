/**
 * Wat een beheerder aan een lid verandert, geldt ook voor wie al ingelogd is.
 *
 * PUT /users/:id wijzigde rol en wachtwoord zonder de sessies van dat lid in
 * te trekken. De aanmeldcontrole nam de rol bovendien uit het token, niet uit
 * de database. Een beheerder die werd teruggezet naar lid hield zo met zijn
 * bestaande token zeven dagen beheerrechten, en wie een gelekt wachtwoord had
 * gebruikt bleef binnen nadat de beheerder het had vervangen.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import '../setup';
import db from '../../database/connection';
import usersRoutes from '../../routes/users';
import { errorHandler } from '../../middleware/errorHandler';
import { registerSession } from '../../utils/sessionStore';
import { createTestEnvironment, createTestUser, generateTestToken, TestUser } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/users', usersRoutes);
app.use(errorHandler);

describe('rol of wachtwoord wijzigen door een beheerder', () => {
  let beheerderToken: string;
  let tweedeBeheerder: TestUser;
  let tweedeToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    beheerderToken = omgeving.adminToken;
    tweedeBeheerder = createTestUser(omgeving.association.id, { email: 'tweede-beheerder@test.nl', role: 'admin' });
    tweedeToken = generateTestToken(tweedeBeheerder);
    // Ingelogd zoals na POST /auth/login: met een sessierij.
    registerSession(tweedeBeheerder.id, tweedeToken, '127.0.0.1', 'test');
  });

  const lijstAls = (token: string) => request(app).get('/api/users').set('Authorization', `Bearer ${token}`);

  it('trekt de sessies in van een beheerder die wordt teruggezet naar lid', async () => {
    expect((await lijstAls(tweedeToken)).status).toBe(200);

    const wijziging = await request(app)
      .put(`/api/users/${tweedeBeheerder.id}`)
      .set('Authorization', `Bearer ${beheerderToken}`)
      .send({ role: 'member' });
    expect(wijziging.status).toBe(200);

    expect((await lijstAls(tweedeToken)).status).toBe(401);
  });

  it('trekt de sessies in en zet password_changed_at bij een nieuw wachtwoord', async () => {
    const wijziging = await request(app)
      .put(`/api/users/${tweedeBeheerder.id}`)
      .set('Authorization', `Bearer ${beheerderToken}`)
      .send({ password: 'een-nieuw-wachtwoord' });
    expect(wijziging.status).toBe(200);

    expect((await lijstAls(tweedeToken)).status).toBe(401);
    const rij = db.prepare('SELECT password_changed_at FROM users WHERE id = ?').get(tweedeBeheerder.id) as {
      password_changed_at: string | null;
    };
    expect(rij.password_changed_at).toBeTruthy();
  });

  it('laat de sessies staan bij een wijziging van alleen de naam', async () => {
    const wijziging = await request(app)
      .put(`/api/users/${tweedeBeheerder.id}`)
      .set('Authorization', `Bearer ${beheerderToken}`)
      .send({ firstName: 'Anders' });
    expect(wijziging.status).toBe(200);

    expect((await lijstAls(tweedeToken)).status).toBe(200);
  });

  it('houdt de beheerder die zichzelf aanpast ingelogd', async () => {
    const eigenToken = generateTestToken(tweedeBeheerder);
    registerSession(tweedeBeheerder.id, eigenToken, '127.0.0.1', 'test');

    const wijziging = await request(app)
      .put(`/api/users/${tweedeBeheerder.id}`)
      .set('Authorization', `Bearer ${eigenToken}`)
      .send({ password: 'een-nieuw-wachtwoord' });
    expect(wijziging.status).toBe(200);

    // Het verzoek zelf blijft geldig; de andere sessie niet.
    expect((await lijstAls(eigenToken)).status).toBe(200);
  });
});
