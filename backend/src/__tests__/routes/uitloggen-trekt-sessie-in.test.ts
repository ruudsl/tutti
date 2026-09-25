/**
 * Uitloggen trekt de sessie aan de serverkant in.
 *
 * Uitloggen wiste alleen het token in de browser. Het token zelf bleef geldig
 * tot het verliep, dus wie het had afgeluisterd of uit een gedeelde browser
 * had gehaald, kon er nog dagen mee verder.
 *
 * Daarnaast: een ingetrokken sessie blijft ingetrokken zolang het token
 * geldig is. De sessierij verliep na een vaste zeven dagen; met een langere
 * JWT_EXPIRES_IN werd de rij opgeruimd terwijl het token nog geldig was, en
 * zag de middleware een onbekend token dat hij opnieuw registreerde - als
 * geldig.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import '../setup';
import app from '../testApp';
import db from '../../database/connection';
import { registerSession, hashToken } from '../../utils/sessionStore';
import { createTestEnvironment, TestUser } from '../testUtils';

const JWT_SECRET = 'test-jwt-secret-for-testing-must-be-at-least-32-characters';
const DAG_MS = 24 * 60 * 60 * 1000;

describe('uitloggen', () => {
  let lid: TestUser;

  beforeEach(() => {
    lid = createTestEnvironment().memberUser;
  });

  async function inloggen(): Promise<string> {
    const antwoord = await request(app).post('/api/auth/login').send({ email: lid.email, password: lid.password });
    expect(antwoord.status).toBe(200);
    return antwoord.body.token;
  }

  const ik = (token: string) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

  it('maakt het token daarna onbruikbaar', async () => {
    const token = await inloggen();
    expect((await ik(token)).status).toBe(200);

    const uit = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(uit.status).toBe(200);

    expect((await ik(token)).status).toBe(401);
  });

  it('laat de andere sessies van dezelfde gebruiker staan', async () => {
    const telefoon = await inloggen();
    // Twee keer inloggen binnen dezelfde seconde geeft hetzelfde token; de
    // tweede sessie krijgt daarom een eigen token met een andere looptijd.
    const laptop = jwt.sign(
      { id: lid.id, email: lid.email, role: lid.role, associationId: lid.associationId },
      JWT_SECRET,
      { expiresIn: '2h' },
    );
    registerSession(lid.id, laptop, '127.0.0.1', 'laptop');

    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${telefoon}`);

    expect((await ik(telefoon)).status).toBe(401);
    expect((await ik(laptop)).status).toBe(200);
  });

  it('vraagt een aanmelding', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(401);
  });
});

describe('een ingetrokken sessie met een lang geldig token', () => {
  let lid: TestUser;

  beforeEach(() => {
    lid = createTestEnvironment().memberUser;
  });

  function langToken(): string {
    return jwt.sign({ id: lid.id, email: lid.email, role: lid.role, associationId: lid.associationId }, JWT_SECRET, {
      expiresIn: '30d',
    });
  }

  it('bewaart de sessierij tot het token verloopt', () => {
    const token = langToken();
    registerSession(lid.id, token, '127.0.0.1', 'test');

    const { exp } = jwt.decode(token) as { exp: number };
    const rij = db.prepare('SELECT expires_at FROM user_sessions WHERE token_hash = ?').get(hashToken(token)) as {
      expires_at: string;
    };
    expect(new Date(rij.expires_at).getTime()).toBeGreaterThanOrEqual(exp * 1000);
  });

  it('blijft ingetrokken nadat sessies van meer dan een week oud zijn opgeruimd', async () => {
    const token = langToken();
    registerSession(lid.id, token, '127.0.0.1', 'test');

    expect((await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`)).status).toBe(200);

    // Wat de opruiming over acht dagen doet: rijen weg waarvan de vervaldatum
    // dan voorbij is. Het token zelf is dan nog drie weken geldig.
    const overAchtDagen = new Date(Date.now() + 8 * DAG_MS).toISOString();
    db.prepare('DELETE FROM user_sessions WHERE expires_at < ?').run(overAchtDagen);

    const antwoord = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(antwoord.status).toBe(401);
  });
});
