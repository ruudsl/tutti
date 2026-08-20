/**
 * Tests for the AES-256-GCM helpers used to store secrets at rest
 * (MFA secrets, Spond credentials, integration tokens).
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import '../setup';
import { encrypt, decrypt, isEncrypted, migrateFromBase64 } from '../../utils/encryption';

const OORSPRONKELIJK = {
  ENCRYPTION_SECRET: process.env.ENCRYPTION_SECRET,
  ENCRYPTION_SALT: process.env.ENCRYPTION_SALT,
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

describe('encryption', () => {
  beforeEach(() => {
    herstelOmgeving();
    process.env.ENCRYPTION_SECRET = 'een-heel-geheim-voor-de-test';
    process.env.ENCRYPTION_SALT = 'vaste-salt-voor-de-testomgeving';
  });

  afterAll(() => {
    herstelOmgeving();
  });

  describe('encrypt/decrypt', () => {
    it('geeft na ontcijferen de oorspronkelijke tekst terug', () => {
      const klaartekst = 'JBSWY3DPEHPK3PXP';
      expect(decrypt(encrypt(klaartekst))).toBe(klaartekst);
    });

    it('bewaart de klaartekst niet in het cijfertekstresultaat', () => {
      const klaartekst = 'wachtwoord-van-de-penningmeester';
      expect(encrypt(klaartekst)).not.toContain(klaartekst);
    });

    it('levert bij dezelfde invoer twee keer een andere cijfertekst op', () => {
      // Elke versleuteling krijgt een eigen IV, anders lekt herhaling informatie.
      const eerste = encrypt('zelfde invoer');
      const tweede = encrypt('zelfde invoer');
      expect(eerste).not.toBe(tweede);
      expect(decrypt(eerste)).toBe(decrypt(tweede));
    });

    it('verwerkt lege tekst, unicode en lange waarden', () => {
      for (const waarde of ['', 'ë ö ü — 🎺 blaasorkest', 'x'.repeat(5000)]) {
        expect(decrypt(encrypt(waarde))).toBe(waarde);
      }
    });

    it('weigert cijfertekst met een verkeerd aantal onderdelen', () => {
      expect(() => decrypt('alleen-een-stuk')).toThrow('Invalid encrypted data format');
      expect(() => decrypt('een:twee')).toThrow('Invalid encrypted data format');
      expect(() => decrypt('een:twee:drie:vier')).toThrow('Invalid encrypted data format');
    });

    it('weigert cijfertekst waarvan de inhoud is aangepast', () => {
      const [iv, tag, data] = encrypt('geheim').split(':');
      const geknoeid = data.startsWith('a') ? `b${data.slice(1)}` : `a${data.slice(1)}`;
      // GCM controleert de authenticatietag, dus knoeien moet opvallen.
      expect(() => decrypt(`${iv}:${tag}:${geknoeid}`)).toThrow();
    });

    it('weigert te ontcijferen met een ander geheim', () => {
      const cijfertekst = encrypt('geheim');
      process.env.ENCRYPTION_SECRET = 'een-heel-ander-geheim';
      expect(() => decrypt(cijfertekst)).toThrow();
    });

    it('werpt een fout wanneer er geen sleutel is ingesteld', () => {
      delete process.env.ENCRYPTION_SECRET;
      delete process.env.JWT_SECRET;
      expect(() => encrypt('geheim')).toThrow('ENCRYPTION_SECRET or JWT_SECRET must be set');
    });

    it('valt terug op JWT_SECRET wanneer ENCRYPTION_SECRET ontbreekt', () => {
      delete process.env.ENCRYPTION_SECRET;
      process.env.JWT_SECRET = 'jwt-geheim-voor-de-test';
      expect(decrypt(encrypt('via jwt'))).toBe('via jwt');
    });

    it('leidt zonder ENCRYPTION_SALT nog steeds een bruikbare sleutel af', () => {
      delete process.env.ENCRYPTION_SALT;
      expect(decrypt(encrypt('zonder salt'))).toBe('zonder salt');
    });
  });

  describe('isEncrypted', () => {
    it('herkent een waarde die door encrypt() is gemaakt', () => {
      expect(isEncrypted(encrypt('geheim'))).toBe(true);
    });

    it('herkent klaartekst niet als versleuteld', () => {
      expect(isEncrypted('JBSWY3DPEHPK3PXP')).toBe(false);
      expect(isEncrypted('')).toBe(false);
    });

    it('weigert drie delen met een IV van de verkeerde lengte', () => {
      expect(isEncrypted('kort:tag:data')).toBe(false);
    });
  });

  describe('migrateFromBase64', () => {
    it('zet een base64-waarde om naar cijfertekst van de klaartekst', () => {
      const klaartekst = 'oud-opgeslagen-geheim';
      const gemigreerd = migrateFromBase64(Buffer.from(klaartekst).toString('base64'));
      expect(isEncrypted(gemigreerd)).toBe(true);
      expect(decrypt(gemigreerd)).toBe(klaartekst);
    });

    it('levert een versleutelde waarde op die weer te ontcijferen is', () => {
      // Buffer.from() accepteert vrijwel elke tekst als base64, dus de uitkomst
      // is hoe dan ook versleuteld; het gaat erom dat er niets verloren gaat.
      const gemigreerd = migrateFromBase64('!!geen-geldige-base64!!');
      expect(isEncrypted(gemigreerd)).toBe(true);
      expect(() => decrypt(gemigreerd)).not.toThrow();
    });
  });
});
