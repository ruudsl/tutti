/**
 * Integration tests for auth routes
 * Tests: login, /me, change-password, forgot-password, reset-password
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { generateSecret, generateSync } from 'otplib';

/**
 * Een TOTP-code met genoeg geldigheid over.
 *
 * Een code hoort bij een tijdvak van dertig seconden en is daarbuiten
 * ongeldig - verifySync kent geen speling, de window-optie wordt door deze
 * API stil genegeerd. Een code die vlak voor het einde van zo'n tijdvak wordt
 * gemaakt en daarna pas door de server wordt gecontroleerd, valt er soms net
 * buiten. Dat gebeurde: een enkele keer viel deze test om met "Ongeldige MFA
 * code" terwijl er niets mis was.
 *
 * Zit het huidige tijdvak bijna aan zijn eind, dan wacht deze helper het uit.
 * De code die daarna komt heeft weer bijna dertig seconden, en dat is ruim
 * genoeg voor een verzoek.
 */
async function verseTotpCode(secret: string): Promise<string> {
  const TIJDVAK_MS = 30_000;
  const MINIMAAL_OVER_MS = 5_000;

  const resterend = TIJDVAK_MS - (Date.now() % TIJDVAK_MS);
  if (resterend < MINIMAAL_OVER_MS) {
    await new Promise((klaar) => setTimeout(klaar, resterend + 50));
  }
  return generateSync({ secret });
}
import '../setup';
import app from '../testApp';
import testDb from '../testDb';
import {
  createTestEnvironment,
  createTestUser,
  generateTestToken,
  generateExpiredToken,
  generateInvalidToken,
  TestUser,
  TestAssociation,
} from '../testUtils';

// Reset tokens are stored as SHA-256 hashes; tests insert the hash and send the plaintext
const hashResetToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

// Recovery codes are stored as SHA-256 hashes of the normalized code (uppercase, no separators)
const hashRecoveryCode = (code: string): string =>
  crypto
    .createHash('sha256')
    .update(code.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .digest('hex');

describe('Auth Routes', () => {
  let association: TestAssociation;
  let adminUser: TestUser;
  let adminToken: string;
  let memberUser: TestUser;
  let memberToken: string;

  beforeEach(() => {
    const env = createTestEnvironment();
    association = env.association;
    adminUser = env.adminUser;
    adminToken = env.adminToken;
    memberUser = env.memberUser;
    memberToken = env.memberToken;
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: memberUser.email,
        password: memberUser.password,
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(memberUser.email);
      expect(response.body.user.firstName).toBe(memberUser.firstName);
      expect(response.body.user.lastName).toBe(memberUser.lastName);
      expect(response.body.user.role).toBe(memberUser.role);
      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.user).not.toHaveProperty('password_hash');
    });

    it('should fail with invalid email', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'nonexistent@example.com',
        password: 'somepassword',
      });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should fail with invalid password', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: memberUser.email,
        password: 'wrongpassword',
      });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should fail with missing email', async () => {
      const response = await request(app).post('/api/auth/login').send({
        password: memberUser.password,
      });

      expect(response.status).toBe(400);
    });

    it('should fail with missing password', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: memberUser.email,
      });

      expect(response.status).toBe(400);
    });

    it('should fail with invalid email format', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'not-an-email',
        password: 'somepassword',
      });

      expect(response.status).toBe(400);
    });

    it('should require MFA code when MFA is enabled', async () => {
      // Create user with MFA enabled
      const mfaUser = createTestUser(association.id, {
        email: 'mfa@test.com',
        mfaEnabled: true,
        mfaSecret: 'JBSWY3DPEHPK3PXP', // Test secret
      });

      const response = await request(app).post('/api/auth/login').send({
        email: mfaUser.email,
        password: mfaUser.password,
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('requiresMfa', true);
      expect(response.body).not.toHaveProperty('token');
    });

    it('should update last_login timestamp on successful login', async () => {
      await request(app).post('/api/auth/login').send({
        email: memberUser.email,
        password: memberUser.password,
      });

      const user = testDb.prepare('SELECT last_login FROM users WHERE id = ?').get(memberUser.id) as any;
      expect(user.last_login).not.toBeNull();
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user profile with valid token', async () => {
      const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', memberUser.id);
      expect(response.body).toHaveProperty('email', memberUser.email);
      expect(response.body).toHaveProperty('firstName', memberUser.firstName);
      expect(response.body).toHaveProperty('lastName', memberUser.lastName);
      expect(response.body).toHaveProperty('role', memberUser.role);
      expect(response.body).toHaveProperty('instruments');
      expect(response.body).toHaveProperty('orchestras');
      expect(Array.isArray(response.body.instruments)).toBe(true);
      expect(Array.isArray(response.body.orchestras)).toBe(true);
    });

    it('should fail without authentication token', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
    });

    it('should fail with invalid token', async () => {
      const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${generateInvalidToken()}`);

      expect(response.status).toBe(401);
    });

    it('should fail with expired token', async () => {
      const expiredToken = generateExpiredToken(memberUser);

      const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
    });

    it('should return 401 if user no longer exists', async () => {
      // Delete the user from database but keep the valid token; the auth
      // middleware rejects tokens for deleted users outright
      testDb.prepare('DELETE FROM users WHERE id = ?').run(memberUser.id);

      const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('should change password with valid current password', async () => {
      const newPassword = 'newSecurePassword123';

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          currentPassword: memberUser.password,
          newPassword: newPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');

      // Verify new password works
      const loginResponse = await request(app).post('/api/auth/login').send({
        email: memberUser.email,
        password: newPassword,
      });

      expect(loginResponse.status).toBe(200);
    });

    it('should fail with incorrect current password', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'newSecurePassword123',
        });

      expect(response.status).toBe(401);
    });

    it('should fail with password that is too short', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          currentPassword: memberUser.password,
          newPassword: '12345', // Too short
        });

      expect(response.status).toBe(400);
    });

    it('should require authentication', async () => {
      const response = await request(app).post('/api/auth/change-password').send({
        currentPassword: memberUser.password,
        newPassword: 'newSecurePassword123',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should return success message for existing email', async () => {
      const response = await request(app).post('/api/auth/forgot-password').send({
        email: memberUser.email,
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('should return success message for non-existing email (security)', async () => {
      // Should not reveal whether email exists
      const response = await request(app).post('/api/auth/forgot-password').send({
        email: 'nonexistent@example.com',
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('should fail without email', async () => {
      const response = await request(app).post('/api/auth/forgot-password').send({});

      expect(response.status).toBe(400);
    });

    it('should create a password reset token', async () => {
      await request(app).post('/api/auth/forgot-password').send({
        email: memberUser.email,
      });

      const token = testDb
        .prepare('SELECT * FROM password_reset_tokens WHERE user_id = ? AND used = 0')
        .get(memberUser.id);

      expect(token).toBeDefined();
    });

    it('should invalidate previous reset tokens', async () => {
      // Create first token
      await request(app).post('/api/auth/forgot-password').send({ email: memberUser.email });

      // Create second token
      await request(app).post('/api/auth/forgot-password').send({ email: memberUser.email });

      const tokens = testDb
        .prepare('SELECT * FROM password_reset_tokens WHERE user_id = ? AND used = 0')
        .all(memberUser.id);

      // Only the latest token should be unused
      expect(tokens.length).toBe(1);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    let resetToken: string;

    beforeEach(() => {
      // Create a valid reset token
      resetToken = 'valid-reset-token-' + Date.now();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      testDb
        .prepare(
          `INSERT INTO password_reset_tokens (id, user_id, token, expires_at, used)
                 VALUES (?, ?, ?, ?, 0)`,
        )
        .run('token-id-1', memberUser.id, hashResetToken(resetToken), expiresAt.toISOString());
    });

    it('should reset password with valid token', async () => {
      const newPassword = 'newSecurePassword123';

      const response = await request(app).post('/api/auth/reset-password').send({
        token: resetToken,
        newPassword: newPassword,
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');

      // Verify new password works
      const loginResponse = await request(app).post('/api/auth/login').send({
        email: memberUser.email,
        password: newPassword,
      });

      expect(loginResponse.status).toBe(200);
    });

    it('should fail with invalid token', async () => {
      const response = await request(app).post('/api/auth/reset-password').send({
        token: 'invalid-token',
        newPassword: 'newSecurePassword123',
      });

      expect(response.status).toBe(400);
    });

    it('should fail with expired token', async () => {
      // Create expired token with a date that is definitely in the past
      const expiredToken = 'expired-token-' + Date.now();
      // Use a date string that SQLite will recognize as past
      const expiredAt = '2020-01-01 00:00:00';

      testDb
        .prepare(
          `INSERT INTO password_reset_tokens (id, user_id, token, expires_at, used)
                 VALUES (?, ?, ?, ?, 0)`,
        )
        .run('token-id-2', memberUser.id, hashResetToken(expiredToken), expiredAt);

      const response = await request(app).post('/api/auth/reset-password').send({
        token: expiredToken,
        newPassword: 'newSecurePassword123',
      });

      expect(response.status).toBe(400);
    });

    it('should fail with already used token', async () => {
      // Mark token as used
      testDb.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = ?').run(hashResetToken(resetToken));

      const response = await request(app).post('/api/auth/reset-password').send({
        token: resetToken,
        newPassword: 'newSecurePassword123',
      });

      expect(response.status).toBe(400);
    });

    it('should fail with password that is too short', async () => {
      const response = await request(app).post('/api/auth/reset-password').send({
        token: resetToken,
        newPassword: '12345', // Less than 8 characters
      });

      expect(response.status).toBe(400);
    });

    it('should mark token as used after successful reset', async () => {
      await request(app).post('/api/auth/reset-password').send({
        token: resetToken,
        newPassword: 'newSecurePassword123',
      });

      const token = testDb
        .prepare('SELECT used FROM password_reset_tokens WHERE token = ?')
        .get(hashResetToken(resetToken)) as any;

      expect(token.used).toBe(1);
    });

    it('should store only a hash of the reset token, never the plaintext', async () => {
      await request(app).post('/api/auth/forgot-password').send({
        email: memberUser.email,
      });

      const tokens = testDb
        .prepare('SELECT token FROM password_reset_tokens WHERE user_id = ?')
        .all(memberUser.id) as any[];

      expect(tokens.length).toBeGreaterThan(0);
      // SHA-256 hex digest is 64 characters
      for (const row of tokens) {
        expect(row.token).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it('should reject an outstanding plaintext (legacy) token without crashing', async () => {
      const legacyToken = 'legacy-plaintext-token';
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      // Simulate a token stored in plaintext by an older version
      testDb
        .prepare(
          `INSERT INTO password_reset_tokens (id, user_id, token, expires_at, used)
                 VALUES (?, ?, ?, ?, 0)`,
        )
        .run('legacy-token-id', memberUser.id, legacyToken, expiresAt.toISOString());

      const response = await request(app).post('/api/auth/reset-password').send({
        token: legacyToken,
        newPassword: 'newSecurePassword123',
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/auth/reset-password/validate', () => {
    let resetToken: string;

    beforeEach(() => {
      resetToken = 'valid-token-' + Date.now();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      testDb
        .prepare(
          `INSERT INTO password_reset_tokens (id, user_id, token, expires_at, used)
                 VALUES (?, ?, ?, ?, 0)`,
        )
        .run('validate-token-id', memberUser.id, hashResetToken(resetToken), expiresAt.toISOString());
    });

    it('should return valid for valid token', async () => {
      const response = await request(app).get('/api/auth/reset-password/validate').query({ token: resetToken });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('valid', true);
    });

    it('should return error for invalid token', async () => {
      const response = await request(app).get('/api/auth/reset-password/validate').query({ token: 'invalid-token' });

      expect(response.status).toBe(400);
    });

    it('should return error for expired token', async () => {
      const expiredToken = 'expired-validate-token';
      // Use a date string that SQLite will recognize as past
      const expiredAt = '2020-01-01 00:00:00';

      testDb
        .prepare(
          `INSERT INTO password_reset_tokens (id, user_id, token, expires_at, used)
                 VALUES (?, ?, ?, ?, 0)`,
        )
        .run('expired-validate-id', memberUser.id, hashResetToken(expiredToken), expiredAt);

      const response = await request(app).get('/api/auth/reset-password/validate').query({ token: expiredToken });

      expect(response.status).toBe(400);
    });

    it('should return error without token parameter', async () => {
      const response = await request(app).get('/api/auth/reset-password/validate');

      expect(response.status).toBe(400);
    });
  });

  describe('MFA Routes', () => {
    describe('GET /api/auth/mfa/status', () => {
      it('should return MFA status for authenticated user', async () => {
        const response = await request(app).get('/api/auth/mfa/status').set('Authorization', `Bearer ${memberToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('mfaEnabled', false);
      });

      it('should return mfaEnabled true when MFA is enabled', async () => {
        const mfaUser = createTestUser(association.id, {
          email: 'mfa-status@test.com',
          mfaEnabled: true,
          mfaSecret: 'JBSWY3DPEHPK3PXP',
        });
        const mfaToken = generateTestToken(mfaUser);

        const response = await request(app).get('/api/auth/mfa/status').set('Authorization', `Bearer ${mfaToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('mfaEnabled', true);
      });

      it('should require authentication', async () => {
        const response = await request(app).get('/api/auth/mfa/status');

        expect(response.status).toBe(401);
      });
    });

    describe('POST /api/auth/mfa/setup', () => {
      it('should return QR code and secret for MFA setup', async () => {
        const response = await request(app).post('/api/auth/mfa/setup').set('Authorization', `Bearer ${memberToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('secret');
        expect(response.body).toHaveProperty('qrCode');
        expect(response.body.qrCode).toMatch(/^data:image\/png;base64,/);
      });

      it('should fail if MFA is already enabled', async () => {
        const mfaUser = createTestUser(association.id, {
          email: 'mfa-already@test.com',
          mfaEnabled: true,
          mfaSecret: 'JBSWY3DPEHPK3PXP',
        });
        const mfaToken = generateTestToken(mfaUser);

        const response = await request(app).post('/api/auth/mfa/setup').set('Authorization', `Bearer ${mfaToken}`);

        expect(response.status).toBe(400);
      });

      it('should require authentication', async () => {
        const response = await request(app).post('/api/auth/mfa/setup');

        expect(response.status).toBe(401);
      });
    });

    describe('POST /api/auth/mfa/enable', () => {
      it('should fail without code', async () => {
        const response = await request(app)
          .post('/api/auth/mfa/enable')
          .set('Authorization', `Bearer ${memberToken}`)
          .send({});

        expect(response.status).toBe(400);
      });

      it('should fail without MFA setup', async () => {
        const response = await request(app)
          .post('/api/auth/mfa/enable')
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ code: '123456' });

        expect(response.status).toBe(400);
      });

      it('should require authentication', async () => {
        const response = await request(app).post('/api/auth/mfa/enable').send({ code: '123456' });

        expect(response.status).toBe(401);
      });
    });

    describe('POST /api/auth/mfa/disable', () => {
      it('should fail without password', async () => {
        const mfaUser = createTestUser(association.id, {
          email: 'mfa-disable@test.com',
          mfaEnabled: true,
          mfaSecret: 'JBSWY3DPEHPK3PXP',
        });
        const mfaToken = generateTestToken(mfaUser);

        const response = await request(app)
          .post('/api/auth/mfa/disable')
          .set('Authorization', `Bearer ${mfaToken}`)
          .send({});

        expect(response.status).toBe(400);
      });

      it('should fail with incorrect password', async () => {
        const mfaUser = createTestUser(association.id, {
          email: 'mfa-disable2@test.com',
          mfaEnabled: true,
          mfaSecret: 'JBSWY3DPEHPK3PXP',
        });
        const mfaToken = generateTestToken(mfaUser);

        const response = await request(app)
          .post('/api/auth/mfa/disable')
          .set('Authorization', `Bearer ${mfaToken}`)
          .send({ password: 'wrongpassword' });

        expect(response.status).toBe(401);
      });

      it('should fail if MFA is not enabled', async () => {
        const response = await request(app)
          .post('/api/auth/mfa/disable')
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ password: memberUser.password });

        expect(response.status).toBe(400);
      });

      it('should disable MFA with correct password', async () => {
        const mfaUser = createTestUser(association.id, {
          email: 'mfa-disable3@test.com',
          mfaEnabled: true,
          mfaSecret: 'JBSWY3DPEHPK3PXP',
        });
        const mfaToken = generateTestToken(mfaUser);

        const response = await request(app)
          .post('/api/auth/mfa/disable')
          .set('Authorization', `Bearer ${mfaToken}`)
          .send({ password: mfaUser.password });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('mfaEnabled', false);

        // Verify MFA is disabled in database
        const user = testDb.prepare('SELECT mfa_enabled FROM users WHERE id = ?').get(mfaUser.id) as any;
        expect(user.mfa_enabled).toBe(0);
      });

      it('should require authentication', async () => {
        const response = await request(app).post('/api/auth/mfa/disable').send({ password: 'somepassword' });

        expect(response.status).toBe(401);
      });

      it('should delete recovery codes when MFA is disabled', async () => {
        const mfaUser = createTestUser(association.id, {
          email: 'mfa-disable-codes@test.com',
          mfaEnabled: true,
          mfaSecret: 'JBSWY3DPEHPK3PXP',
        });
        const mfaToken = generateTestToken(mfaUser);

        testDb
          .prepare('INSERT INTO mfa_recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)')
          .run('rc-disable-1', mfaUser.id, hashRecoveryCode('ABCD-EFGH-JKMN'));

        const response = await request(app)
          .post('/api/auth/mfa/disable')
          .set('Authorization', `Bearer ${mfaToken}`)
          .send({ password: mfaUser.password });

        expect(response.status).toBe(200);

        const codes = testDb.prepare('SELECT * FROM mfa_recovery_codes WHERE user_id = ?').all(mfaUser.id);
        expect(codes.length).toBe(0);
      });
    });

    describe('MFA enable flow with recovery codes and encrypted secret', () => {
      it('should return 10 one-time recovery codes and store the secret encrypted', async () => {
        // Start setup to obtain the plaintext secret
        const setupResponse = await request(app)
          .post('/api/auth/mfa/setup')
          .set('Authorization', `Bearer ${memberToken}`);

        expect(setupResponse.status).toBe(200);
        const secret = setupResponse.body.secret;

        // The stored secret must be encrypted, not the plaintext
        const storedAfterSetup = testDb.prepare('SELECT mfa_secret FROM users WHERE id = ?').get(memberUser.id) as any;
        expect(storedAfterSetup.mfa_secret).not.toBe(secret);

        // Enable with a valid TOTP code
        const code = await verseTotpCode(secret);
        const enableResponse = await request(app)
          .post('/api/auth/mfa/enable')
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ code });

        expect(enableResponse.status).toBe(200);
        expect(enableResponse.body).toHaveProperty('mfaEnabled', true);
        expect(enableResponse.body.recoveryCodes).toHaveLength(10);
        for (const recoveryCode of enableResponse.body.recoveryCodes) {
          expect(recoveryCode).toMatch(/^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/);
        }

        // Only hashes are stored in the database
        const rows = testDb
          .prepare('SELECT code_hash, used_at FROM mfa_recovery_codes WHERE user_id = ?')
          .all(memberUser.id) as any[];
        expect(rows.length).toBe(10);
        for (const row of rows) {
          expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/);
          expect(row.used_at).toBeNull();
        }

        // Login with TOTP still works against the encrypted secret
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            email: memberUser.email,
            password: memberUser.password,
            mfaCode: await verseTotpCode(secret),
          });
        expect(loginResponse.status).toBe(200);
        expect(loginResponse.body).toHaveProperty('token');
      });
    });

    describe('Login with recovery code', () => {
      const recoveryCode = 'ABCD-EFGH-JKMN';
      let mfaUser: TestUser;

      beforeEach(() => {
        mfaUser = createTestUser(association.id, {
          email: 'mfa-recovery@test.com',
          mfaEnabled: true,
          mfaSecret: 'JBSWY3DPEHPK3PXP',
        });

        testDb
          .prepare('INSERT INTO mfa_recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)')
          .run('rc-login-1', mfaUser.id, hashRecoveryCode(recoveryCode));
      });

      it('should allow login with an unused recovery code and mark it as used', async () => {
        const response = await request(app).post('/api/auth/login').send({
          email: mfaUser.email,
          password: mfaUser.password,
          mfaCode: recoveryCode,
        });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');

        const row = testDb.prepare('SELECT used_at FROM mfa_recovery_codes WHERE id = ?').get('rc-login-1') as any;
        expect(row.used_at).not.toBeNull();
      });

      it('should reject a recovery code that was already used', async () => {
        // First use succeeds
        await request(app).post('/api/auth/login').send({
          email: mfaUser.email,
          password: mfaUser.password,
          mfaCode: recoveryCode,
        });

        // Second use fails
        const response = await request(app).post('/api/auth/login').send({
          email: mfaUser.email,
          password: mfaUser.password,
          mfaCode: recoveryCode,
        });

        expect(response.status).toBe(401);
      });

      it('should reject an unknown recovery code', async () => {
        const response = await request(app).post('/api/auth/login').send({
          email: mfaUser.email,
          password: mfaUser.password,
          mfaCode: 'ZZZZ-ZZZZ-ZZZZ',
        });

        expect(response.status).toBe(401);
      });

      it('should re-encrypt a legacy plaintext MFA secret after successful login', async () => {
        await request(app).post('/api/auth/login').send({
          email: mfaUser.email,
          password: mfaUser.password,
          mfaCode: recoveryCode,
        });

        const user = testDb.prepare('SELECT mfa_secret FROM users WHERE id = ?').get(mfaUser.id) as any;
        expect(user.mfa_secret).not.toBe('JBSWY3DPEHPK3PXP');
      });
    });

    describe('POST /api/auth/mfa/recovery-codes/regenerate', () => {
      // generateSync requires a full-length secret (>= 16 bytes)
      const mfaSecret = generateSecret();
      let mfaUser: TestUser;
      let mfaToken: string;

      beforeEach(() => {
        mfaUser = createTestUser(association.id, {
          email: 'mfa-regenerate@test.com',
          mfaEnabled: true,
          mfaSecret,
        });
        mfaToken = generateTestToken(mfaUser);

        testDb
          .prepare('INSERT INTO mfa_recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)')
          .run('rc-old-1', mfaUser.id, hashRecoveryCode('ABCD-EFGH-JKMN'));
      });

      it('should replace old codes with 10 new codes given a valid TOTP code', async () => {
        const response = await request(app)
          .post('/api/auth/mfa/recovery-codes/regenerate')
          .set('Authorization', `Bearer ${mfaToken}`)
          .send({ code: await verseTotpCode(mfaSecret) });

        expect(response.status).toBe(200);
        expect(response.body.recoveryCodes).toHaveLength(10);

        // Old code is gone
        const oldRow = testDb.prepare('SELECT * FROM mfa_recovery_codes WHERE id = ?').get('rc-old-1');
        expect(oldRow).toBeUndefined();

        const rows = testDb.prepare('SELECT * FROM mfa_recovery_codes WHERE user_id = ?').all(mfaUser.id);
        expect(rows.length).toBe(10);
      });

      it('should fail without a code', async () => {
        const response = await request(app)
          .post('/api/auth/mfa/recovery-codes/regenerate')
          .set('Authorization', `Bearer ${mfaToken}`)
          .send({});

        expect(response.status).toBe(400);
      });

      it('should fail with an invalid TOTP code', async () => {
        const response = await request(app)
          .post('/api/auth/mfa/recovery-codes/regenerate')
          .set('Authorization', `Bearer ${mfaToken}`)
          .send({ code: '000000' });

        expect(response.status).toBe(401);
      });

      it('should fail when MFA is not enabled', async () => {
        const response = await request(app)
          .post('/api/auth/mfa/recovery-codes/regenerate')
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ code: '123456' });

        expect(response.status).toBe(400);
      });

      it('should require authentication', async () => {
        const response = await request(app).post('/api/auth/mfa/recovery-codes/regenerate').send({ code: '123456' });

        expect(response.status).toBe(401);
      });
    });
  });
});
