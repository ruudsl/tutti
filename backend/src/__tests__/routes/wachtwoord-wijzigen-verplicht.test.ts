/**
 * Een lid met een wachtwoord dat een ander heeft gekozen, kiest eerst een
 * eigen (users.moet_wachtwoord_wijzigen).
 *
 * Dat werd alleen in de frontend afgedwongen: de API zelf beantwoordde elk
 * verzoek van zo'n lid gewoon. Nu geeft authenticateToken een 403 met een
 * vaste code, behalve op wat nodig is om een eigen wachtwoord te kiezen:
 * GET /auth/me, POST /auth/change-password en POST /auth/logout.
 *
 * De vlag werd alleen gezet bij de aanmelding via onboarding. Nu ook als een
 * beheerder een lid aanmaakt met een wachtwoord, of het wachtwoord van een
 * ander lid zet - niet als iemand zijn eigen wachtwoord wijzigt.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Response } from 'express';
import '../setup';
import db from '../../database/connection';
import app from '../testApp';
import { optionalAuth, generateToken, AuthRequest, CODE_WACHTWOORD_WIJZIGEN_VERPLICHT } from '../../middleware/auth';
import { authenticeerSocket, AuthenticatedSocket } from '../../websocket';
import { createTestEnvironment, TestUser } from '../testUtils';

const optioneleApp = express();
optioneleApp.get('/misschien', optionalAuth, (req: AuthRequest, res: Response) => res.json(req.user ?? null));

const vlag = (id: string): number =>
  (db.prepare('SELECT moet_wachtwoord_wijzigen AS v FROM users WHERE id = ?').get(id) as { v: number }).v;

const zetVlag = (id: string) => db.prepare('UPDATE users SET moet_wachtwoord_wijzigen = 1 WHERE id = ?').run(id);

async function logIn(email: string, password: string): Promise<string> {
  const antwoord = await request(app).post('/api/auth/login').send({ email, password });
  expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
  return antwoord.body.token;
}

describe('verplicht wachtwoord wijzigen', () => {
  let beheerder: TestUser;
  let beheerderToken: string;
  let lid: TestUser;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
  });

  describe('in de API', () => {
    let lidToken: string;

    beforeEach(async () => {
      zetVlag(lid.id);
      lidToken = await logIn(lid.email, lid.password);
    });

    const alsLid = (methode: 'get' | 'post', pad: string) =>
      request(app)[methode](pad).set('Authorization', `Bearer ${lidToken}`);

    it('weigert andere routes met 403 en een vaste code', async () => {
      for (const pad of ['/api/instruments', '/api/users/directory', '/api/notifications']) {
        const antwoord = await alsLid('get', pad);
        expect(antwoord.status, pad).toBe(403);
        expect(antwoord.body.code, pad).toBe(CODE_WACHTWOORD_WIJZIGEN_VERPLICHT);
      }
      expect(CODE_WACHTWOORD_WIJZIGEN_VERPLICHT).toBe('WACHTWOORD_WIJZIGEN_VERPLICHT');
    });

    it('weigert ook een verzoek dat iets wijzigt', async () => {
      const antwoord = await alsLid('post', '/api/auth/mfa/setup');
      expect(antwoord.status).toBe(403);
      expect(antwoord.body.code).toBe(CODE_WACHTWOORD_WIJZIGEN_VERPLICHT);
    });

    it('laat GET /auth/me door, met de vlag erin', async () => {
      const antwoord = await alsLid('get', '/api/auth/me');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.mustChangePassword).toBe(true);
    });

    it('laat afmelden door', async () => {
      const antwoord = await alsLid('post', '/api/auth/logout');
      expect(antwoord.status).toBe(200);
    });

    it('laat het wachtwoord wijzigen, en daarna de rest van de API', async () => {
      const wijzig = await alsLid('post', '/api/auth/change-password').send({
        currentPassword: lid.password,
        newPassword: 'EenEigenWachtwoord!2026',
      });
      expect(wijzig.status, JSON.stringify(wijzig.body)).toBe(200);
      expect(vlag(lid.id)).toBe(0);

      expect((await alsLid('get', '/api/instruments')).status).toBe(200);
    });

    it('hangt bij optionele aanmelding geen lid aan het verzoek', async () => {
      const antwoord = await request(optioneleApp).get('/misschien').set('Authorization', `Bearer ${lidToken}`);
      expect(antwoord.body).toBeNull();
    });

    it('opent geen realtime verbinding', () => {
      const socket = {
        handshake: { auth: { token: lidToken }, headers: { 'user-agent': 'test' }, address: '127.0.0.1' },
      } as unknown as AuthenticatedSocket;
      let fout: Error | undefined;
      authenticeerSocket(socket, (f) => {
        fout = f;
      });
      expect(fout).toBeInstanceOf(Error);
    });

    it('laat een lid zonder vlag gewoon door (tegenproef)', async () => {
      const token = generateToken({
        id: beheerder.id,
        email: beheerder.email,
        role: beheerder.role,
        association_id: beheerder.associationId,
      });
      const antwoord = await request(app).get('/api/instruments').set('Authorization', `Bearer ${token}`);
      expect(antwoord.status).toBe(200);
    });
  });

  describe('wanneer de vlag gezet wordt', () => {
    const alsBeheerder = (methode: 'post' | 'put', pad: string) =>
      request(app)[methode](pad).set('Authorization', `Bearer ${beheerderToken}`);

    it('bij een lid dat een beheerder aanmaakt met een wachtwoord', async () => {
      const antwoord = await alsBeheerder('post', '/api/users').send({
        email: 'aangemaakt@test.com',
        password: 'DoorDeBeheerder!2026',
        firstName: 'Aan',
        lastName: 'Gemaakt',
        role: 'member',
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
      expect(vlag(antwoord.body.id)).toBe(1);

      const token = await logIn('aangemaakt@test.com', 'DoorDeBeheerder!2026');
      const ik = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(ik.body.mustChangePassword).toBe(true);
      const elders = await request(app).get('/api/instruments').set('Authorization', `Bearer ${token}`);
      expect(elders.status).toBe(403);
    });

    it('als een beheerder het wachtwoord van een ander lid zet', async () => {
      const antwoord = await alsBeheerder('put', `/api/users/${lid.id}`).send({ password: 'NieuwVanDeBeheerder!2026' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(vlag(lid.id)).toBe(1);
    });

    it('niet als een beheerder alleen iets anders van een lid wijzigt', async () => {
      const antwoord = await alsBeheerder('put', `/api/users/${lid.id}`).send({ firstName: 'Anders' });
      expect(antwoord.status).toBe(200);
      expect(vlag(lid.id)).toBe(0);
    });

    it('niet als een beheerder zijn eigen wachtwoord zet', async () => {
      const antwoord = await alsBeheerder('put', `/api/users/${beheerder.id}`).send({
        password: 'MijnEigenBeheerder!2026',
      });
      expect(antwoord.status).toBe(200);
      expect(vlag(beheerder.id)).toBe(0);
    });

    it('niet als een lid zijn eigen wachtwoord wijzigt', async () => {
      const token = await logIn(lid.email, lid.password);
      const antwoord = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: lid.password, newPassword: 'ZelfGekozen!2026' });
      expect(antwoord.status).toBe(200);
      expect(vlag(lid.id)).toBe(0);
    });
  });
});
