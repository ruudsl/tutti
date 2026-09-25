/**
 * Migraties 20260925100000 en 20260925100001: opgeslagen geheimen.
 *
 * - oude_cijfertekst_herversleutelen zet cijfertekst zonder sleutelversie
 *   (van JWT_SECRET afgeleid, of met de oude eigen Spond-sleutel) om naar
 *   `v1` met ENCRYPTION_SECRET, en terug.
 * - koppelingsgeheimen_versleutelen versleutelt klaartekst in de kolommen met
 *   geheimen van koppelingen, en ontsleutelt ze bij het terugdraaien.
 *
 * Beide draaien via voerUit, zoals de runner, en tegen gegevens: op een lege
 * database valt niets om te zetten.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import * as herversleutelen from '../../migrations/20260925100000_oude_cijfertekst_herversleutelen';
import * as koppelingen from '../../migrations/20260925100001_koppelingsgeheimen_versleutelen';
import { voerUit, type Migration } from '../../migrations/runner';
import { decrypt, encrypt, heeftOudFormaat, isEncrypted } from '../../utils/encryption';
import { decryptPassword } from '../../services/spond';
import { createTestEnvironment, createTestOrchestra, TestAssociation, TestUser } from '../testUtils';

const als = (versie: string, naam: string, m: { up: () => void; down: () => void }): Migration => ({
  version: versie,
  name: naam,
  up: m.up,
  down: m.down,
});
const herversleutelMigratie = als('20260925100000', 'oude_cijfertekst_herversleutelen', herversleutelen);
const koppelingMigratie = als('20260925100001', 'koppelingsgeheimen_versleutelen', koppelingen);

const OMGEVING = ['NODE_ENV', 'JWT_SECRET', 'ENCRYPTION_SECRET', 'ENCRYPTION_SALT'] as const;
const oorspronkelijk = Object.fromEntries(OMGEVING.map((n) => [n, process.env[n]]));

// Tijdens de test gemaakt, zodat er geen geheim-achtige tekenreeks in de
// repository staat.
const willekeurig = () => crypto.randomBytes(48).toString('base64');

let jwtGeheim: string;
let versleutelgeheim: string;
let vereniging: TestAssociation;
let beheerder: TestUser;

beforeEach(() => {
  jwtGeheim = willekeurig();
  versleutelgeheim = willekeurig();
  process.env.JWT_SECRET = jwtGeheim;
  process.env.ENCRYPTION_SECRET = versleutelgeheim;
  delete process.env.ENCRYPTION_SALT;

  const omgeving = createTestEnvironment();
  vereniging = omgeving.association;
  beheerder = omgeving.adminUser;
});

afterEach(() => {
  for (const naam of OMGEVING) {
    if (oorspronkelijk[naam] === undefined) delete process.env[naam];
    else process.env[naam] = oorspronkelijk[naam];
  }
});

/** Zoals de code van vóór de sleutelversie versleutelde, onafhankelijk nagebouwd. */
function oudVersleuteld(klaartekst: string, geheim: string, salt: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', crypto.scryptSync(geheim, salt, 32), iv);
  const data = cipher.update(klaartekst, 'utf8', 'hex') + cipher.final('hex');
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${data}`;
}

function oudOntsleuteld(cijfertekst: string, geheim: string, salt: string): string {
  const [iv, tag, data] = cijfertekst.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(geheim, salt, 32), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return decipher.update(data, 'hex', 'utf8') + decipher.final('utf8');
}

const algemeneSalt = (geheim: string) =>
  crypto
    .createHash('sha256')
    .update(geheim + '-salt')
    .digest('hex')
    .slice(0, 32);
const SPOND_SALT = 'spond-encryption-salt';

describe('migratie oude cijfertekst herversleutelen', () => {
  let spondId: string;

  function waarden() {
    return {
      spond: (db.prepare('SELECT password_encrypted AS w FROM spond_config WHERE id = ?').get(spondId) as { w: string })
        .w,
      live: (
        db
          .prepare('SELECT mollie_api_key_encrypted AS w FROM payment_settings WHERE association_id = ?')
          .get(vereniging.id) as { w: string }
      ).w,
      test: (
        db
          .prepare('SELECT mollie_test_api_key_encrypted AS w FROM payment_settings WHERE association_id = ?')
          .get(vereniging.id) as { w: string }
      ).w,
      mfa: (db.prepare('SELECT mfa_secret AS w FROM users WHERE id = ?').get(beheerder.id) as { w: string }).w,
    };
  }

  beforeEach(() => {
    // Zoals een installatie ze nu heeft: Spond met de eigen Spond-sleutel,
    // de rest met de van JWT_SECRET afgeleide sleutel. Eén Mollie-sleutel
    // staat nog als base64 van vóór de versleuteling.
    spondId = uuidv4();
    db.prepare('INSERT INTO spond_config (id, association_id, username, password_encrypted) VALUES (?, ?, ?, ?)').run(
      spondId,
      vereniging.id,
      'spond@vereniging.example',
      oudVersleuteld('spond-wachtwoord', jwtGeheim, SPOND_SALT),
    );
    db.prepare(
      `INSERT INTO payment_settings (id, association_id, mollie_api_key_encrypted, mollie_test_api_key_encrypted)
       VALUES (?, ?, ?, ?)`,
    ).run(
      uuidv4(),
      vereniging.id,
      oudVersleuteld('mollie-live-sleutel', jwtGeheim, algemeneSalt(jwtGeheim)),
      Buffer.from('mollie-test-sleutel').toString('base64'),
    );
    db.prepare('UPDATE users SET mfa_secret = ? WHERE id = ?').run(
      oudVersleuteld('MFA-GEHEIM', jwtGeheim, algemeneSalt(jwtGeheim)),
      beheerder.id,
    );
  });

  it('zet oude cijfertekst om naar de sleutelversie van ENCRYPTION_SECRET', () => {
    const base64Voor = waarden().test;

    voerUit(herversleutelMigratie, herversleutelen.up);

    const na = waarden();
    for (const waarde of [na.spond, na.live, na.mfa]) {
      expect(waarde.startsWith('v1:')).toBe(true);
    }
    expect(decryptPassword(na.spond)).toBe('spond-wachtwoord');
    expect(decrypt(na.live)).toBe('mollie-live-sleutel');
    expect(decrypt(na.mfa)).toBe('MFA-GEHEIM');
    // Base64 van vóór de versleuteling is geen cijfertekst en blijft staan.
    expect(na.test).toBe(base64Voor);
  });

  it('maakt de opgeslagen geheimen los van JWT_SECRET', () => {
    voerUit(herversleutelMigratie, herversleutelen.up);

    process.env.JWT_SECRET = willekeurig();

    const na = waarden();
    expect(decryptPassword(na.spond)).toBe('spond-wachtwoord');
    expect(decrypt(na.live)).toBe('mollie-live-sleutel');
    expect(decrypt(na.mfa)).toBe('MFA-GEHEIM');
  });

  it('laat bij een tweede keer draaien alles staan', () => {
    voerUit(herversleutelMigratie, herversleutelen.up);
    const eerste = waarden();

    voerUit(herversleutelMigratie, herversleutelen.up);

    expect(waarden()).toEqual(eerste);
  });

  it('laat een waarde die met geen enkele bekende sleutel te lezen is ongemoeid', () => {
    const vreemd = oudVersleuteld('onbekend', willekeurig(), 'andere-salt');
    db.prepare('UPDATE users SET mfa_secret = ? WHERE id = ?').run(vreemd, beheerder.id);

    voerUit(herversleutelMigratie, herversleutelen.up);

    expect(waarden().mfa).toBe(vreemd);
  });

  it('zet bij terugdraaien alles terug naar het formaat dat de vorige code las', () => {
    voerUit(herversleutelMigratie, herversleutelen.up);
    // Ook wat na de migratie is opgeslagen gaat terug.
    db.prepare('UPDATE users SET mfa_secret = ? WHERE id = ?').run(encrypt('NIEUW-MFA'), beheerder.id);

    voerUit(herversleutelMigratie, herversleutelen.down);

    const na = waarden();
    expect(heeftOudFormaat(na.spond)).toBe(true);
    expect(heeftOudFormaat(na.live)).toBe(true);
    // De vorige code gebruikte ENCRYPTION_SECRET als die was ingesteld, en
    // voor Spond altijd JWT_SECRET met de eigen salt.
    expect(oudOntsleuteld(na.spond, jwtGeheim, SPOND_SALT)).toBe('spond-wachtwoord');
    expect(oudOntsleuteld(na.live, versleutelgeheim, algemeneSalt(versleutelgeheim))).toBe('mollie-live-sleutel');
    expect(oudOntsleuteld(na.mfa, versleutelgeheim, algemeneSalt(versleutelgeheim))).toBe('NIEUW-MFA');

    // En weer heen: de tweede up slaagt op wat de down achterliet.
    voerUit(herversleutelMigratie, herversleutelen.up);
    expect(decryptPassword(waarden().spond)).toBe('spond-wachtwoord');
  });

  it('breekt in productie af zonder ENCRYPTION_SECRET, en laat dan alles staan', () => {
    const voor = waarden();
    process.env.NODE_ENV = 'production';
    delete process.env.ENCRYPTION_SECRET;

    expect(() => voerUit(herversleutelMigratie, herversleutelen.up)).toThrow(/ENCRYPTION_SECRET ontbreekt/);
    expect(waarden()).toEqual(voor);
  });
});

describe('migratie koppelingsgeheimen versleutelen', () => {
  const KLAARTEKST = {
    smtp_pass: 'smtp-wachtwoord-klaar',
    microsoft_client_secret: 'entra-geheim-klaar',
    telegram_bot_token: 'telegram-token-klaar',
    whatsapp_access_token: 'whatsapp-token-klaar',
    twilio_auth_token: 'twilio-token-klaar',
    google_calendar_client_secret: 'google-geheim-klaar',
  };

  let opstellingId: string;

  function vereniging_(kolom: keyof typeof KLAARTEKST): string | null {
    return (
      db.prepare(`SELECT ${kolom} AS w FROM associations WHERE id = ?`).get(vereniging.id) as { w: string | null }
    ).w;
  }
  const opstellingToken = () =>
    (
      db.prepare('SELECT twilio_auth_token AS w FROM seating_notification_settings WHERE id = ?').get(opstellingId) as {
        w: string;
      }
    ).w;
  const googleTokens = () =>
    db
      .prepare(
        'SELECT google_access_token AS toegang, google_refresh_token AS vernieuw FROM user_calendar_settings WHERE user_id = ?',
      )
      .get(beheerder.id) as { toegang: string; vernieuw: string };

  beforeEach(() => {
    const kolommen = Object.keys(KLAARTEKST);
    db.prepare(`UPDATE associations SET ${kolommen.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
      ...Object.values(KLAARTEKST),
      vereniging.id,
    );

    opstellingId = uuidv4();
    const orkest = createTestOrchestra(vereniging.id);
    db.prepare(
      `INSERT INTO seating_notification_settings (id, orchestra_id, notification_type, twilio_auth_token)
       VALUES (?, ?, 'whatsapp', ?)`,
    ).run(opstellingId, orkest.id, 'opstelling-token-klaar');

    db.prepare(
      `INSERT INTO user_calendar_settings (id, user_id, feed_token, google_access_token, google_refresh_token)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(uuidv4(), beheerder.id, uuidv4(), 'google-toegang-klaar', 'google-vernieuw-klaar');
  });

  it('versleutelt de klaartekst in elke kolom met een geheim', () => {
    voerUit(koppelingMigratie, koppelingen.up);

    for (const [kolom, klaartekst] of Object.entries(KLAARTEKST)) {
      const opgeslagen = vereniging_(kolom as keyof typeof KLAARTEKST)!;
      expect(opgeslagen, kolom).not.toContain(klaartekst);
      expect(isEncrypted(opgeslagen), kolom).toBe(true);
      expect(decrypt(opgeslagen), kolom).toBe(klaartekst);
    }
    expect(decrypt(opstellingToken())).toBe('opstelling-token-klaar');
    expect(decrypt(googleTokens().toegang)).toBe('google-toegang-klaar');
    expect(decrypt(googleTokens().vernieuw)).toBe('google-vernieuw-klaar');
  });

  it('laat lege kolommen leeg', () => {
    db.prepare('UPDATE associations SET smtp_pass = NULL, telegram_bot_token = ? WHERE id = ?').run('', vereniging.id);

    voerUit(koppelingMigratie, koppelingen.up);

    expect(vereniging_('smtp_pass')).toBeNull();
    expect(vereniging_('telegram_bot_token')).toBe('');
  });

  it('versleutelt een al versleutelde waarde niet nog een keer', () => {
    voerUit(koppelingMigratie, koppelingen.up);
    const eerste = { smtp: vereniging_('smtp_pass'), opstelling: opstellingToken(), google: googleTokens() };

    voerUit(koppelingMigratie, koppelingen.up);

    expect({ smtp: vereniging_('smtp_pass'), opstelling: opstellingToken(), google: googleTokens() }).toEqual(eerste);
  });

  it('zet bij terugdraaien de klaartekst terug, en kan daarna weer heen', () => {
    voerUit(koppelingMigratie, koppelingen.up);

    voerUit(koppelingMigratie, koppelingen.down);

    for (const [kolom, klaartekst] of Object.entries(KLAARTEKST)) {
      expect(vereniging_(kolom as keyof typeof KLAARTEKST), kolom).toBe(klaartekst);
    }
    expect(opstellingToken()).toBe('opstelling-token-klaar');
    expect(googleTokens()).toEqual({ toegang: 'google-toegang-klaar', vernieuw: 'google-vernieuw-klaar' });

    voerUit(koppelingMigratie, koppelingen.up);
    expect(decrypt(vereniging_('smtp_pass')!)).toBe('smtp-wachtwoord-klaar');
  });

  it('breekt in productie af zonder ENCRYPTION_SECRET, zonder iets als klaartekst achter te laten', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ENCRYPTION_SECRET;

    expect(() => voerUit(koppelingMigratie, koppelingen.up)).toThrow(/ENCRYPTION_SECRET ontbreekt/);
    // De transactie is teruggedraaid: niets half versleuteld.
    expect(vereniging_('smtp_pass')).toBe('smtp-wachtwoord-klaar');
  });
});
