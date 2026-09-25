/**
 * Tests for the AES-256-GCM helpers used to store secrets at rest
 * (MFA secrets, Spond credentials, integration tokens).
 */

import { describe, it, expect, beforeEach, afterAll, afterEach } from 'vitest';
import '../setup';
import crypto from 'crypto';
import {
  encrypt,
  decrypt,
  isEncrypted,
  migrateFromBase64,
  heeftOudFormaat,
  versleutelInOudFormaat,
  versleutelGeheim,
  ontsleutelGeheim,
} from '../../utils/encryption';

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
      const [versie, iv, tag, data] = encrypt('geheim').split(':');
      const geknoeid = data.startsWith('a') ? `b${data.slice(1)}` : `a${data.slice(1)}`;
      // GCM controleert de authenticatietag, dus knoeien moet opvallen.
      expect(() => decrypt(`${versie}:${iv}:${tag}:${geknoeid}`)).toThrow();
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

/**
 * Hoe de code van vóór de sleutelversie versleutelde, hier onafhankelijk
 * nagebouwd: zo bewijst de test dat bestaande waarden leesbaar blijven, en
 * niet alleen dat encrypt() en decrypt() het met elkaar eens zijn.
 */
function oudeSalt(geheim: string): string {
  return (
    process.env.ENCRYPTION_SALT ||
    crypto
      .createHash('sha256')
      .update(geheim + '-salt')
      .digest('hex')
      .slice(0, 32)
  );
}

function oudVersleuteld(klaartekst: string, geheim: string, salt: string): string {
  const sleutel = crypto.scryptSync(geheim, salt, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', sleutel, iv);
  const data = cipher.update(klaartekst, 'utf8', 'hex') + cipher.final('hex');
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${data}`;
}

function oudOntsleuteld(cijfertekst: string, geheim: string, salt: string): string {
  const [iv, tag, data] = cijfertekst.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(geheim, salt, 32), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return decipher.update(data, 'hex', 'utf8') + decipher.final('utf8');
}

// Tijdens de test gemaakt, zodat er geen geheim-achtige tekenreeks in de
// repository staat.
const willekeurig = () => crypto.randomBytes(48).toString('base64');

describe('sleutelversie en eigen versleutelgeheim', () => {
  let jwtGeheim: string;
  let versleutelgeheim: string;

  beforeEach(() => {
    herstelOmgeving();
    delete process.env.ENCRYPTION_SALT;
    jwtGeheim = willekeurig();
    versleutelgeheim = willekeurig();
    process.env.JWT_SECRET = jwtGeheim;
    process.env.ENCRYPTION_SECRET = versleutelgeheim;
  });

  afterEach(() => {
    herstelOmgeving();
  });

  it('zet de sleutelversie voor nieuwe cijfertekst', () => {
    const cijfertekst = encrypt('geheim');
    expect(cijfertekst.startsWith('v1:')).toBe(true);
    expect(isEncrypted(cijfertekst)).toBe(true);
    expect(heeftOudFormaat(cijfertekst)).toBe(false);
  });

  it('gebruikt ENCRYPTION_SECRET en niet JWT_SECRET: een nieuw JWT-geheim laat opgeslagen waarden heel', () => {
    const cijfertekst = encrypt('smtp-wachtwoord');
    process.env.JWT_SECRET = willekeurig();
    expect(decrypt(cijfertekst)).toBe('smtp-wachtwoord');
  });

  it('leest cijfertekst die vroeger met de van JWT_SECRET afgeleide sleutel is gemaakt', () => {
    const oud = oudVersleuteld('oud-mfa-geheim', jwtGeheim, oudeSalt(jwtGeheim));
    expect(heeftOudFormaat(oud)).toBe(true);
    expect(decrypt(oud)).toBe('oud-mfa-geheim');
  });

  it('leest cijfertekst die vroeger met een al ingesteld ENCRYPTION_SECRET is gemaakt', () => {
    const oud = oudVersleuteld('oude-mollie-sleutel', versleutelgeheim, oudeSalt(versleutelgeheim));
    expect(decrypt(oud)).toBe('oude-mollie-sleutel');
  });

  it('leest een Spond-wachtwoord dat met de oude eigen Spond-sleutel is opgeslagen', () => {
    const oud = oudVersleuteld('spond-wachtwoord', jwtGeheim, 'spond-encryption-salt');
    expect(decrypt(oud)).toBe('spond-wachtwoord');
  });

  it('versleutelt in het oude formaat zoals de vorige code het las, voor de down van de migratie', () => {
    const algemeen = versleutelInOudFormaat('terug', 'algemeen');
    expect(oudOntsleuteld(algemeen, versleutelgeheim, oudeSalt(versleutelgeheim))).toBe('terug');
    const spond = versleutelInOudFormaat('terug', 'spond');
    expect(oudOntsleuteld(spond, jwtGeheim, 'spond-encryption-salt')).toBe('terug');
  });

  it('weigert een onbekende sleutelversie', () => {
    const [, iv, tag, data] = encrypt('geheim').split(':');
    expect(isEncrypted(`v9:${iv}:${tag}:${data}`)).toBe(false);
    expect(() => decrypt(`v9:${iv}:${tag}:${data}`)).toThrow('Invalid encrypted data format');
  });

  describe('in productie', () => {
    const oorspronkelijkeOmgeving = process.env.NODE_ENV;

    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      process.env.NODE_ENV = oorspronkelijkeOmgeving;
    });

    it('valt niet terug op JWT_SECRET', () => {
      delete process.env.ENCRYPTION_SECRET;
      expect(() => encrypt('geheim')).toThrow(/ENCRYPTION_SECRET ontbreekt/);
    });

    it('weigert een te zwak geheim, ook als de migraties draaien zonder config.ts', () => {
      process.env.ENCRYPTION_SECRET = 'kort';
      expect(() => encrypt('geheim')).toThrow(/ENCRYPTION_SECRET is korter dan 32 tekens/);
      process.env.ENCRYPTION_SECRET = jwtGeheim;
      expect(() => encrypt('geheim')).toThrow(/gelijk aan JWT_SECRET/);
    });

    it('versleutelt met een eigen, sterk geheim', () => {
      expect(decrypt(encrypt('geheim'))).toBe('geheim');
    });
  });

  describe('versleutelGeheim en ontsleutelGeheim', () => {
    it('slaat niets op voor een lege waarde', () => {
      expect(versleutelGeheim('')).toBeNull();
      expect(versleutelGeheim(null)).toBeNull();
      expect(ontsleutelGeheim(null)).toBeNull();
    });

    it('geeft een versleuteld geheim terug als klaartekst', () => {
      const opgeslagen = versleutelGeheim('bot-token')!;
      expect(opgeslagen).not.toContain('bot-token');
      expect(ontsleutelGeheim(opgeslagen)).toBe('bot-token');
    });

    it('laat klaartekst van vóór de versleuteling ongemoeid, tot de migratie heeft gedraaid', () => {
      expect(ontsleutelGeheim('nog-klaartekst')).toBe('nog-klaartekst');
    });

    it('geeft null voor een geheim dat met een ander ENCRYPTION_SECRET is gemaakt', () => {
      const opgeslagen = versleutelGeheim('bot-token');
      process.env.ENCRYPTION_SECRET = willekeurig();
      expect(ontsleutelGeheim(opgeslagen)).toBeNull();
    });
  });
});
