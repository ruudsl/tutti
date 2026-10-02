/**
 * Een vereniging kan tweestapsverificatie verplicht stellen
 * (associations.tweestap_verplicht: uit, beheer of iedereen).
 *
 * Wie moet en het nog niet heeft, krijgt van authenticateToken een 403 met een
 * vaste code, behalve op wat nodig is om het in te stellen: GET /auth/me,
 * POST /auth/logout en de routes onder /auth/mfa voor instellen en aanzetten.
 * Wie het heeft, kan het niet uitzetten zolang de vereniging het verplicht.
 * Aanzetten mag alleen een beheerder die het zelf al heeft.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import '../setup';
import db from '../../database/connection';
import authRoutes from '../../routes/auth';
import settingsRoutes from '../../routes/settings';
import instrumentsRoutes from '../../routes/instruments';
import { errorHandler } from '../../middleware/errorHandler';
import { CODE_TWEESTAP_INSTELLEN_VERPLICHT, CODE_WACHTWOORD_WIJZIGEN_VERPLICHT } from '../../middleware/auth';
import { authenticeerSocket, AuthenticatedSocket } from '../../websocket';
import { createTestAssociation, createTestEnvironment, createTestUser, TestUser } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/instruments', instrumentsRoutes);
app.use(errorHandler);

const zetStand = (associationId: string, stand: string) =>
  db.prepare('UPDATE associations SET tweestap_verplicht = ? WHERE id = ?').run(stand, associationId);

const zetMfa = (userId: string) =>
  db.prepare("UPDATE users SET mfa_enabled = 1, mfa_secret = 'nep' WHERE id = ?").run(userId);

async function logIn(email: string, password: string) {
  const antwoord = await request(app).post('/api/auth/login').send({ email, password });
  expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
  return antwoord.body as { token: string; user: { tweestapInstellenVerplicht: boolean } };
}

const vraag = (token: string, methode: 'get' | 'post' | 'put', pad: string) =>
  request(app)[methode](pad).set('Authorization', `Bearer ${token}`);

describe('tweestapsverificatie verplicht', () => {
  let omgeving: ReturnType<typeof createTestEnvironment>;
  let lid: TestUser;
  let beheerder: TestUser;

  beforeEach(() => {
    omgeving = createTestEnvironment();
    lid = omgeving.memberUser;
    beheerder = omgeving.adminUser;
  });

  describe('handhaving', () => {
    it('laat bij uit iedereen door, zoals het was', async () => {
      const { token, user } = await logIn(lid.email, lid.password);

      expect(user.tweestapInstellenVerplicht).toBe(false);
      expect((await vraag(token, 'get', '/api/instruments')).status).toBe(200);
    });

    it('weigert bij iedereen een lid zonder tweestap, met een vaste code', async () => {
      zetStand(omgeving.association.id, 'iedereen');
      const { token, user } = await logIn(lid.email, lid.password);

      expect(user.tweestapInstellenVerplicht).toBe(true);
      for (const pad of ['/api/instruments', '/api/settings', '/api/settings/tweestap']) {
        const antwoord = await vraag(token, 'get', pad);
        expect(antwoord.status, pad).toBe(403);
        expect(antwoord.body.code, pad).toBe(CODE_TWEESTAP_INSTELLEN_VERPLICHT);
      }
    });

    it('laat wat nodig is om het in te stellen wel door', async () => {
      zetStand(omgeving.association.id, 'iedereen');
      const { token } = await logIn(lid.email, lid.password);

      const ik = await vraag(token, 'get', '/api/auth/me');
      expect(ik.status).toBe(200);
      expect(ik.body.tweestapInstellenVerplicht).toBe(true);
      expect((await vraag(token, 'get', '/api/auth/mfa/status')).status).toBe(200);
      const instellen = await vraag(token, 'post', '/api/auth/mfa/setup');
      expect(instellen.status, JSON.stringify(instellen.body)).toBe(200);
      expect(instellen.body.secret).toBeTruthy();
    });

    it('laat het lid weer overal door zodra tweestap aanstaat, met dezelfde sessie', async () => {
      zetStand(omgeving.association.id, 'iedereen');
      const { token } = await logIn(lid.email, lid.password);
      expect((await vraag(token, 'get', '/api/instruments')).status).toBe(403);

      zetMfa(lid.id);

      expect((await vraag(token, 'get', '/api/instruments')).status).toBe(200);
      expect((await vraag(token, 'get', '/api/auth/me')).body.tweestapInstellenVerplicht).toBe(false);
    });

    it('geldt bij beheer voor de beheerder en niet voor een gewoon lid', async () => {
      zetStand(omgeving.association.id, 'beheer');

      const lidSessie = await logIn(lid.email, lid.password);
      expect(lidSessie.user.tweestapInstellenVerplicht).toBe(false);
      expect((await vraag(lidSessie.token, 'get', '/api/instruments')).status).toBe(200);

      const beheerSessie = await logIn(beheerder.email, beheerder.password);
      expect(beheerSessie.user.tweestapInstellenVerplicht).toBe(true);
      expect((await vraag(beheerSessie.token, 'get', '/api/instruments')).body.code).toBe(
        CODE_TWEESTAP_INSTELLEN_VERPLICHT,
      );
    });

    it('raakt een andere vereniging niet', async () => {
      const andere = createTestAssociation();
      const anderLid = createTestUser(andere.id, { email: 'ander-lid@voorbeeld.nl' });
      zetStand(omgeving.association.id, 'iedereen');

      const { token } = await logIn(anderLid.email, anderLid.password);
      expect((await vraag(token, 'get', '/api/instruments')).status).toBe(200);
    });

    it('vraagt eerst een eigen wachtwoord, dan pas tweestap', async () => {
      zetStand(omgeving.association.id, 'iedereen');
      db.prepare('UPDATE users SET moet_wachtwoord_wijzigen = 1 WHERE id = ?').run(lid.id);
      const { token } = await logIn(lid.email, lid.password);

      const instellen = await vraag(token, 'post', '/api/auth/mfa/setup');
      expect(instellen.status).toBe(403);
      expect(instellen.body.code).toBe(CODE_WACHTWOORD_WIJZIGEN_VERPLICHT);
      expect((await vraag(token, 'get', '/api/auth/me')).status).toBe(200);
    });

    it('geeft geen chat of meldingen via de websocket', async () => {
      zetStand(omgeving.association.id, 'iedereen');
      const { token } = await logIn(lid.email, lid.password);

      const socket = {
        handshake: { auth: { token }, address: '127.0.0.1', headers: {} },
      } as unknown as AuthenticatedSocket;
      const fout = await new Promise<Error | undefined>((klaar) => authenticeerSocket(socket, klaar));

      expect(fout?.message).toBe('Two-step verification required');
    });
  });

  describe('uitzetten', () => {
    it('weigert uitzetten zolang de vereniging het verplicht', async () => {
      // Inloggen met tweestap aan vraagt een code; het token van de
      // testomgeving is een gewone sessie van hetzelfde lid.
      zetMfa(lid.id);
      zetStand(omgeving.association.id, 'iedereen');

      const antwoord = await vraag(omgeving.memberToken, 'post', '/api/auth/mfa/disable').send({
        password: lid.password,
      });

      expect(antwoord.status).toBe(403);
      expect(
        (db.prepare('SELECT mfa_enabled FROM users WHERE id = ?').get(lid.id) as { mfa_enabled: number }).mfa_enabled,
      ).toBe(1);
    });

    it('laat uitzetten toe als de vereniging het niet verplicht', async () => {
      zetMfa(lid.id);

      const antwoord = await vraag(omgeving.memberToken, 'post', '/api/auth/mfa/disable').send({
        password: lid.password,
      });

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
    });
  });

  describe('de instelling', () => {
    const lees = () =>
      (
        db.prepare('SELECT tweestap_verplicht FROM associations WHERE id = ?').get(omgeving.association.id) as {
          tweestap_verplicht: string;
        }
      ).tweestap_verplicht;

    it('staat standaard op uit en is voor de beheerder te lezen', async () => {
      const antwoord = await vraag(omgeving.adminToken, 'get', '/api/settings/tweestap');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual({ stand: 'uit', zelfAan: false });
    });

    it('weigert aanzetten door een beheerder die het zelf nog niet heeft', async () => {
      const antwoord = await vraag(omgeving.adminToken, 'put', '/api/settings/tweestap').send({ stand: 'beheer' });

      expect(antwoord.status).toBe(400);
      expect(lees()).toBe('uit');
    });

    it('laat een beheerder met tweestap het aanzetten, en altijd weer uitzetten', async () => {
      zetMfa(beheerder.id);

      const aan = await vraag(omgeving.adminToken, 'put', '/api/settings/tweestap').send({ stand: 'iedereen' });
      expect(aan.status, JSON.stringify(aan.body)).toBe(200);
      expect(lees()).toBe('iedereen');

      const uit = await vraag(omgeving.adminToken, 'put', '/api/settings/tweestap').send({ stand: 'uit' });
      expect(uit.status).toBe(200);
      expect(lees()).toBe('uit');
    });

    it('weigert een onbekende stand', async () => {
      zetMfa(beheerder.id);

      const antwoord = await vraag(omgeving.adminToken, 'put', '/api/settings/tweestap').send({ stand: 'soms' });

      expect(antwoord.status).toBe(400);
      expect(lees()).toBe('uit');
    });

    it('is niet voor een gewoon lid', async () => {
      expect((await vraag(omgeving.memberToken, 'get', '/api/settings/tweestap')).status).toBe(403);
      expect((await vraag(omgeving.memberToken, 'put', '/api/settings/tweestap').send({ stand: 'uit' })).status).toBe(
        403,
      );
    });
  });
});
