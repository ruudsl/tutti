/**
 * Eén wachtwoordregel: minimaal acht tekens, op elke plek waar een wachtwoord
 * wordt gezet.
 *
 * Het waren er zes bij het wijzigen door de gebruiker, bij het aanmaken en bij
 * het wijzigen door een beheerder, en acht bij herstellen via de link. Wie een
 * kort wachtwoord wilde, nam dus gewoon een andere ingang.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import '../setup';
import app from '../testApp';
import { createTestEnvironment, TestUser } from '../testUtils';

const ZEVEN = 'abcdef1';
const ACHT = 'abcdefg1';

describe('wachtwoordregel', () => {
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
  });

  describe('eigen wachtwoord wijzigen', () => {
    const wijzig = (nieuw: string) =>
      request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${lidToken}`)
        .send({ currentPassword: lid.password, newPassword: nieuw });

    it('weigert zeven tekens', async () => {
      expect((await wijzig(ZEVEN)).status).toBe(400);
    });

    it('accepteert acht tekens', async () => {
      expect((await wijzig(ACHT)).status).toBe(200);
    });
  });

  describe('lid aanmaken door een beheerder', () => {
    const maakAan = (wachtwoord: string) =>
      request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${beheerderToken}`)
        .send({ email: `nieuw-${wachtwoord}@example.com`, password: wachtwoord, firstName: 'Nieuw', lastName: 'Lid' });

    it('weigert zeven tekens', async () => {
      expect((await maakAan(ZEVEN)).status).toBe(400);
    });

    it('accepteert acht tekens', async () => {
      expect((await maakAan(ACHT)).status).toBe(201);
    });
  });

  describe('wachtwoord van een lid wijzigen door een beheerder', () => {
    const wijzig = (wachtwoord: string) =>
      request(app)
        .put(`/api/users/${lid.id}`)
        .set('Authorization', `Bearer ${beheerderToken}`)
        .send({ password: wachtwoord });

    it('weigert zeven tekens', async () => {
      expect((await wijzig(ZEVEN)).status).toBe(400);
    });

    it('accepteert acht tekens', async () => {
      expect((await wijzig(ACHT)).status).toBe(200);
    });
  });

  describe('herstellen via de link', () => {
    it('weigert zeven tekens, en ook een ontbrekend token, met een validatiefout', async () => {
      const kort = await request(app).post('/api/auth/reset-password').send({ token: 'iets', newPassword: ZEVEN });
      expect(kort.status).toBe(400);

      const zonderToken = await request(app).post('/api/auth/reset-password').send({ newPassword: ACHT });
      expect(zonderToken.status).toBe(400);
    });
  });
});
