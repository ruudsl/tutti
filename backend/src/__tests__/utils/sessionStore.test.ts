/**
 * Tests for the session store: registering sessions, the throttled
 * last_active write, and the soft revocation that logout depends on.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestEnvironment, createTestUser, TestUser } from '../testUtils';
import {
  hashToken,
  findSessionByTokenHash,
  registerSession,
  updateSessionActivity,
  updateSessionActivityByHash,
  revokeUserSessions,
} from '../../utils/sessionStore';

function uniekToken(): string {
  return `token-${uuidv4()}`;
}

function sessieRij(tokenHash: string): { last_active: string; ip_address: string | null; user_agent: string | null } {
  return testDb
    .prepare('SELECT last_active, ip_address, user_agent FROM user_sessions WHERE token_hash = ?')
    .get(tokenHash) as { last_active: string; ip_address: string | null; user_agent: string | null };
}

describe('sessionStore', () => {
  let gebruiker: TestUser;
  let andereGebruiker: TestUser;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    gebruiker = omgeving.adminUser;
    andereGebruiker = createTestUser(omgeving.association.id, { email: `sessie-${uuidv4()}@test.nl` });
  });

  describe('hashToken', () => {
    it('geeft een sha256-hash die het token niet prijsgeeft', () => {
      const token = 'een.jwt.token';
      const hash = hashToken(token);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).not.toContain(token);
    });

    it('geeft voor hetzelfde token altijd dezelfde hash', () => {
      expect(hashToken('zelfde')).toBe(hashToken('zelfde'));
      expect(hashToken('a')).not.toBe(hashToken('b'));
    });
  });

  describe('registerSession', () => {
    it('slaat de sessie op onder de hash van het token, niet het token zelf', () => {
      const token = uniekToken();
      registerSession(gebruiker.id, token, '10.0.0.1', 'Firefox');

      expect(findSessionByTokenHash(hashToken(token))).toBeDefined();
      const ruwe = testDb.prepare('SELECT COUNT(*) AS n FROM user_sessions WHERE token_hash = ?').get(token) as {
        n: number;
      };
      expect(ruwe.n).toBe(0);
    });

    it('geeft een sessie-id terug en bewaart ip-adres en browser', () => {
      const token = uniekToken();
      const id = registerSession(gebruiker.id, token, '10.0.0.1', 'Firefox');
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(sessieRij(hashToken(token))).toMatchObject({ ip_address: '10.0.0.1', user_agent: 'Firefox' });
    });

    it('slaat ontbrekende gegevens op als null', () => {
      const token = uniekToken();
      registerSession(gebruiker.id, token, undefined, undefined);
      expect(sessieRij(hashToken(token))).toMatchObject({ ip_address: null, user_agent: null });
    });

    it('gebruikt de meegegeven vervaldatum', () => {
      const token = uniekToken();
      const vervalt = new Date('2030-01-01T12:00:00.000Z');
      registerSession(gebruiker.id, token, undefined, undefined, 7, vervalt);
      expect(findSessionByTokenHash(hashToken(token))?.expires_at).toBe(vervalt.toISOString());
    });

    it('rekent zonder vervaldatum met het aantal dagen', () => {
      const token = uniekToken();
      registerSession(gebruiker.id, token, undefined, undefined, 30);
      const sessie = findSessionByTokenHash(hashToken(token));
      const dagen = (new Date(sessie!.expires_at).getTime() - Date.now()) / 86_400_000;
      expect(dagen).toBeGreaterThan(29);
      expect(dagen).toBeLessThan(31);
    });

    it('ruimt verlopen sessies op', () => {
      const verlopenHash = hashToken(uniekToken());
      testDb
        .prepare(
          `INSERT INTO user_sessions (id, user_id, token_hash, expires_at)
           VALUES (?, ?, ?, datetime('now', '-1 day'))`,
        )
        .run(uuidv4(), gebruiker.id, verlopenHash);
      expect(findSessionByTokenHash(verlopenHash)).toBeDefined();

      registerSession(gebruiker.id, uniekToken(), undefined, undefined);
      expect(findSessionByTokenHash(verlopenHash)).toBeUndefined();
    });

    it('laat een sessie die nog geldig is met rust', () => {
      const token = uniekToken();
      registerSession(gebruiker.id, token, undefined, undefined);
      registerSession(gebruiker.id, uniekToken(), undefined, undefined);
      expect(findSessionByTokenHash(hashToken(token))).toBeDefined();
    });
  });

  describe('findSessionByTokenHash', () => {
    it('geeft undefined voor een onbekende hash', () => {
      expect(findSessionByTokenHash(hashToken('bestaat niet'))).toBeUndefined();
    });

    it('vindt ook een ingetrokken sessie', () => {
      // De auth-middleware moet "ingetrokken" (401) kunnen onderscheiden van
      // "geen sessierij" (oud token, alsnog registreren).
      const token = uniekToken();
      registerSession(gebruiker.id, token, undefined, undefined);
      revokeUserSessions(gebruiker.id);
      const sessie = findSessionByTokenHash(hashToken(token));
      expect(sessie).toBeDefined();
      expect(sessie!.revoked_at).not.toBeNull();
    });
  });

  describe('updateSessionActivity', () => {
    it('schrijft niet opnieuw vlak na het aanmaken van de sessie', () => {
      const token = uniekToken();
      registerSession(gebruiker.id, token, undefined, undefined);
      const voor = sessieRij(hashToken(token)).last_active;

      testDb
        .prepare("UPDATE user_sessions SET last_active = '2020-01-01 00:00:00' WHERE token_hash = ?")
        .run(hashToken(token));
      updateSessionActivity(token);

      // De schrijfbeperking geldt nog, dus de handmatige waarde blijft staan.
      expect(sessieRij(hashToken(token)).last_active).toBe('2020-01-01 00:00:00');
      expect(voor).toBeTruthy();
    });

    it('schrijft wel voor een sessie die nog niet bijgehouden werd', () => {
      const tokenHash = hashToken(uniekToken());
      testDb
        .prepare(
          `INSERT INTO user_sessions (id, user_id, token_hash, last_active, expires_at)
           VALUES (?, ?, ?, '2020-01-01 00:00:00', datetime('now', '+7 day'))`,
        )
        .run(uuidv4(), gebruiker.id, tokenHash);

      updateSessionActivityByHash(tokenHash);
      expect(sessieRij(tokenHash).last_active).not.toBe('2020-01-01 00:00:00');
    });

    it('gaat niet stuk op een onbekende sessie', () => {
      expect(() => updateSessionActivity(uniekToken())).not.toThrow();
    });
  });

  describe('revokeUserSessions', () => {
    it('trekt alle sessies van de gebruiker in en telt ze', () => {
      registerSession(gebruiker.id, uniekToken(), undefined, undefined);
      registerSession(gebruiker.id, uniekToken(), undefined, undefined);
      expect(revokeUserSessions(gebruiker.id)).toBe(2);
    });

    it('laat de huidige sessie staan wanneer die is uitgezonderd', () => {
      const huidig = uniekToken();
      registerSession(gebruiker.id, huidig, undefined, undefined);
      registerSession(gebruiker.id, uniekToken(), undefined, undefined);

      expect(revokeUserSessions(gebruiker.id, hashToken(huidig))).toBe(1);
      expect(findSessionByTokenHash(hashToken(huidig))?.revoked_at).toBeNull();
    });

    it('raakt de sessies van andere gebruikers niet aan', () => {
      const vanAnder = uniekToken();
      registerSession(andereGebruiker.id, vanAnder, undefined, undefined);
      registerSession(gebruiker.id, uniekToken(), undefined, undefined);

      revokeUserSessions(gebruiker.id);
      expect(findSessionByTokenHash(hashToken(vanAnder))?.revoked_at).toBeNull();
    });

    it('trekt een al ingetrokken sessie niet nog eens in', () => {
      registerSession(gebruiker.id, uniekToken(), undefined, undefined);
      expect(revokeUserSessions(gebruiker.id)).toBe(1);
      expect(revokeUserSessions(gebruiker.id)).toBe(0);
    });

    it('geeft nul terug wanneer er geen sessies zijn', () => {
      expect(revokeUserSessions(gebruiker.id)).toBe(0);
    });

    it('verwijdert de sessierij niet, maar markeert hem', () => {
      const token = uniekToken();
      registerSession(gebruiker.id, token, undefined, undefined);
      revokeUserSessions(gebruiker.id);
      expect(findSessionByTokenHash(hashToken(token))).toBeDefined();
    });
  });
});
