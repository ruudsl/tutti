/**
 * Tests for the MFA helpers: encrypted storage of TOTP secrets and
 * single-use recovery codes.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestEnvironment, createTestUser, TestUser } from '../testUtils';
import { isEncrypted } from '../../utils/encryption';
import {
  RECOVERY_CODE_COUNT,
  protectMfaSecret,
  revealMfaSecret,
  generateRecoveryCode,
  hashRecoveryCode,
  issueRecoveryCodes,
  deleteRecoveryCodes,
  consumeRecoveryCode,
} from '../../utils/mfa';

const OORSPRONKELIJK = {
  ENCRYPTION_SECRET: process.env.ENCRYPTION_SECRET,
  JWT_SECRET: process.env.JWT_SECRET,
};

function herstelOmgeving(): void {
  for (const [sleutel, waarde] of Object.entries(OORSPRONKELIJK)) {
    if (waarde === undefined) {
      delete process.env[sleutel];
    } else {
      process.env[sleutel] = waarde;
    }
  }
}

function ongebruikteCodes(userId: string): number {
  const rij = testDb
    .prepare('SELECT COUNT(*) AS aantal FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL')
    .get(userId) as { aantal: number };
  return rij.aantal;
}

describe('MFA-hulpfuncties', () => {
  let gebruiker: TestUser;
  let andereGebruiker: TestUser;

  beforeEach(() => {
    herstelOmgeving();
    process.env.ENCRYPTION_SECRET = 'mfa-testgeheim';
    const omgeving = createTestEnvironment();
    gebruiker = omgeving.adminUser;
    andereGebruiker = createTestUser(omgeving.association.id, { email: `mfa-ander-${uuidv4()}@test.nl` });
  });

  afterAll(() => {
    herstelOmgeving();
  });

  describe('opslag van het TOTP-geheim', () => {
    it('slaat het geheim versleuteld op', () => {
      const opgeslagen = protectMfaSecret('JBSWY3DPEHPK3PXP');
      expect(opgeslagen).not.toBe('JBSWY3DPEHPK3PXP');
      expect(isEncrypted(opgeslagen)).toBe(true);
    });

    it('leest het geheim weer terug zonder het als klaartekst te merken', () => {
      const resultaat = revealMfaSecret(protectMfaSecret('JBSWY3DPEHPK3PXP'));
      expect(resultaat).toEqual({ secret: 'JBSWY3DPEHPK3PXP', wasPlaintext: false });
    });

    it('valt terug op klaartekst wanneer er geen sleutel is ingesteld', () => {
      delete process.env.ENCRYPTION_SECRET;
      delete process.env.JWT_SECRET;
      expect(protectMfaSecret('JBSWY3DPEHPK3PXP')).toBe('JBSWY3DPEHPK3PXP');
    });

    it('accepteert een bestaand klaartekstgeheim en meldt dat het klaartekst was', () => {
      // Installaties van voor de versleuteling moeten blijven werken.
      expect(revealMfaSecret('JBSWY3DPEHPK3PXP')).toEqual({
        secret: 'JBSWY3DPEHPK3PXP',
        wasPlaintext: true,
      });
    });

    it('meldt klaartekst wanneer het geheim niet te ontcijferen is', () => {
      const opgeslagen = protectMfaSecret('JBSWY3DPEHPK3PXP');
      process.env.ENCRYPTION_SECRET = 'een-ander-geheim-dan-bij-opslag';
      const resultaat = revealMfaSecret(opgeslagen);
      expect(resultaat.wasPlaintext).toBe(true);
      expect(resultaat.secret).toBe(opgeslagen);
    });
  });

  describe('generateRecoveryCode', () => {
    it('levert drie groepen van vier tekens', () => {
      expect(generateRecoveryCode()).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    });

    it('gebruikt geen tekens die op elkaar lijken', () => {
      const tekens = new Set<string>();
      for (let i = 0; i < 200; i++) {
        for (const teken of generateRecoveryCode().replace(/-/g, '')) {
          tekens.add(teken);
        }
      }
      for (const verboden of ['0', 'O', '1', 'I', 'L']) {
        expect(tekens.has(verboden)).toBe(false);
      }
    });

    it('herhaalt zichzelf niet', () => {
      const codes = new Set(Array.from({ length: 100 }, () => generateRecoveryCode()));
      expect(codes.size).toBe(100);
    });
  });

  describe('hashRecoveryCode', () => {
    it('negeert streepjes, spaties en hoofdlettergebruik', () => {
      const verwacht = hashRecoveryCode('ABCD-EFGH-JKMN');
      expect(hashRecoveryCode('abcdefghjkmn')).toBe(verwacht);
      expect(hashRecoveryCode('abcd efgh jkmn')).toBe(verwacht);
      expect(hashRecoveryCode('ABCD--EFGH--JKMN')).toBe(verwacht);
    });

    it('geeft voor verschillende codes een verschillende hash', () => {
      expect(hashRecoveryCode('ABCD-EFGH-JKMN')).not.toBe(hashRecoveryCode('ABCD-EFGH-JKMP'));
    });

    it('slaat de code niet leesbaar op', () => {
      expect(hashRecoveryCode('ABCD-EFGH-JKMN')).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('issueRecoveryCodes', () => {
    it('geeft het afgesproken aantal codes terug', () => {
      const codes = issueRecoveryCodes(gebruiker.id);
      expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
      expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
      expect(ongebruikteCodes(gebruiker.id)).toBe(RECOVERY_CODE_COUNT);
    });

    it('bewaart alleen hashes, nooit de code zelf', () => {
      const codes = issueRecoveryCodes(gebruiker.id);
      const opgeslagen = testDb
        .prepare('SELECT code_hash FROM mfa_recovery_codes WHERE user_id = ?')
        .all(gebruiker.id) as Array<{ code_hash: string }>;
      const hashes = opgeslagen.map((rij) => rij.code_hash);
      for (const code of codes) {
        expect(hashes).not.toContain(code);
        expect(hashes).toContain(hashRecoveryCode(code));
      }
    });

    it('vervangt een eerdere set en maakt de oude codes ongeldig', () => {
      const oud = issueRecoveryCodes(gebruiker.id);
      const nieuw = issueRecoveryCodes(gebruiker.id);
      expect(ongebruikteCodes(gebruiker.id)).toBe(RECOVERY_CODE_COUNT);
      expect(consumeRecoveryCode(gebruiker.id, oud[0])).toBe(false);
      expect(consumeRecoveryCode(gebruiker.id, nieuw[0])).toBe(true);
    });
  });

  describe('consumeRecoveryCode', () => {
    it('accepteert een geldige code precies één keer', () => {
      const codes = issueRecoveryCodes(gebruiker.id);
      expect(consumeRecoveryCode(gebruiker.id, codes[0])).toBe(true);
      expect(consumeRecoveryCode(gebruiker.id, codes[0])).toBe(false);
      expect(ongebruikteCodes(gebruiker.id)).toBe(RECOVERY_CODE_COUNT - 1);
    });

    it('accepteert de code ook zonder streepjes of in kleine letters', () => {
      const codes = issueRecoveryCodes(gebruiker.id);
      expect(consumeRecoveryCode(gebruiker.id, codes[0].replace(/-/g, '').toLowerCase())).toBe(true);
    });

    it('verbruikt maar één code per keer', () => {
      const codes = issueRecoveryCodes(gebruiker.id);
      consumeRecoveryCode(gebruiker.id, codes[3]);
      expect(ongebruikteCodes(gebruiker.id)).toBe(RECOVERY_CODE_COUNT - 1);
      for (const code of codes.filter((_, i) => i !== 3)) {
        expect(consumeRecoveryCode(gebruiker.id, code)).toBe(true);
      }
    });

    it('weigert een onbekende code', () => {
      issueRecoveryCodes(gebruiker.id);
      expect(consumeRecoveryCode(gebruiker.id, 'ZZZZ-ZZZZ-ZZZZ')).toBe(false);
      expect(consumeRecoveryCode(gebruiker.id, '')).toBe(false);
      expect(ongebruikteCodes(gebruiker.id)).toBe(RECOVERY_CODE_COUNT);
    });

    it('weigert een code van een andere gebruiker', () => {
      const codesVanAnder = issueRecoveryCodes(andereGebruiker.id);
      issueRecoveryCodes(gebruiker.id);
      expect(consumeRecoveryCode(gebruiker.id, codesVanAnder[0])).toBe(false);
      expect(ongebruikteCodes(andereGebruiker.id)).toBe(RECOVERY_CODE_COUNT);
    });

    it('weigert alles wanneer de gebruiker geen codes heeft', () => {
      expect(consumeRecoveryCode(gebruiker.id, 'ABCD-EFGH-JKMN')).toBe(false);
    });
  });

  describe('deleteRecoveryCodes', () => {
    it('verwijdert alle codes van de gebruiker', () => {
      const codes = issueRecoveryCodes(gebruiker.id);
      deleteRecoveryCodes(gebruiker.id);
      expect(ongebruikteCodes(gebruiker.id)).toBe(0);
      expect(consumeRecoveryCode(gebruiker.id, codes[0])).toBe(false);
    });

    it('laat de codes van andere gebruikers staan', () => {
      issueRecoveryCodes(andereGebruiker.id);
      issueRecoveryCodes(gebruiker.id);
      deleteRecoveryCodes(gebruiker.id);
      expect(ongebruikteCodes(andereGebruiker.id)).toBe(RECOVERY_CODE_COUNT);
    });

    it('doet niets wanneer er geen codes zijn', () => {
      expect(() => deleteRecoveryCodes(gebruiker.id)).not.toThrow();
    });
  });
});
