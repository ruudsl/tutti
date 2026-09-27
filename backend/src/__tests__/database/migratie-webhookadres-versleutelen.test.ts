/**
 * Migratie 20260925100002: het webhook-adres van de opstellingsmelding
 * versleutelen.
 *
 * De migratie versleutelt de adressen die er al als klaartekst staan en
 * ontsleutelt ze bij het terugdraaien. Hij draait via voerUit, zoals de
 * runner, en tegen gegevens: op een lege database valt niets om te zetten.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import * as webhookadres from '../../migrations/20260925100002_webhookadres_versleutelen';
import { voerUit, type Migration } from '../../migrations/runner';
import { decrypt, encrypt, isEncrypted } from '../../utils/encryption';
import { createTestEnvironment, createTestOrchestra } from '../testUtils';

const migratie: Migration = {
  version: '20260925100002',
  name: 'webhookadres_versleutelen',
  up: webhookadres.up,
  down: webhookadres.down,
};

const OMGEVING = ['NODE_ENV', 'ENCRYPTION_SECRET'] as const;
const oorspronkelijk = Object.fromEntries(OMGEVING.map((n) => [n, process.env[n]]));

const ADRES_A = 'https://hooks.chat.example/services/klaar-a';
const ADRES_B = 'https://discord.example/api/webhooks/klaar-b';

describe('migratie webhookadres versleutelen', () => {
  let rijA: string;
  let rijB: string;
  let rijLeeg: string;

  const waarde = (id: string) =>
    (
      db.prepare('SELECT webhook_url AS w FROM seating_notification_settings WHERE id = ?').get(id) as {
        w: string | null;
      }
    ).w;

  beforeEach(() => {
    // Tijdens de test gemaakt, zodat er geen geheim-achtige tekenreeks in de
    // repository staat.
    process.env.ENCRYPTION_SECRET = crypto.randomBytes(48).toString('base64');

    const { association } = createTestEnvironment();
    const invoegen = db.prepare(
      `INSERT INTO seating_notification_settings (id, orchestra_id, notification_type, webhook_url)
       VALUES (?, ?, 'webhook', ?)`,
    );
    rijA = uuidv4();
    rijB = uuidv4();
    rijLeeg = uuidv4();
    invoegen.run(rijA, createTestOrchestra(association.id, { name: 'A' }).id, ADRES_A);
    invoegen.run(rijB, createTestOrchestra(association.id, { name: 'B' }).id, ADRES_B);
    invoegen.run(rijLeeg, createTestOrchestra(association.id, { name: 'C' }).id, null);
  });

  afterEach(() => {
    for (const naam of OMGEVING) {
      if (oorspronkelijk[naam] === undefined) delete process.env[naam];
      else process.env[naam] = oorspronkelijk[naam];
    }
  });

  it('versleutelt de klaartekst en laat een leeg adres leeg', () => {
    voerUit(migratie, webhookadres.up);

    for (const [id, adres] of [
      [rijA, ADRES_A],
      [rijB, ADRES_B],
    ]) {
      const opgeslagen = waarde(id)!;
      expect(opgeslagen).not.toContain('klaar');
      expect(isEncrypted(opgeslagen)).toBe(true);
      expect(decrypt(opgeslagen)).toBe(adres);
    }
    expect(waarde(rijLeeg)).toBeNull();
  });

  it('versleutelt een al versleuteld adres niet nog een keer', () => {
    voerUit(migratie, webhookadres.up);
    const eerste = [waarde(rijA), waarde(rijB)];

    voerUit(migratie, webhookadres.up);

    expect([waarde(rijA), waarde(rijB)]).toEqual(eerste);
  });

  it('zet bij terugdraaien de klaartekst terug, en kan daarna weer heen', () => {
    voerUit(migratie, webhookadres.up);
    // Ook wat na de migratie door de code is opgeslagen gaat terug.
    db.prepare('UPDATE seating_notification_settings SET webhook_url = ? WHERE id = ?').run(
      encrypt('https://nieuw.example/na-migratie'),
      rijB,
    );

    voerUit(migratie, webhookadres.down);

    expect(waarde(rijA)).toBe(ADRES_A);
    expect(waarde(rijB)).toBe('https://nieuw.example/na-migratie');
    expect(waarde(rijLeeg)).toBeNull();

    voerUit(migratie, webhookadres.up);
    expect(decrypt(waarde(rijA)!)).toBe(ADRES_A);
  });

  it('breekt in productie af zonder ENCRYPTION_SECRET, zonder iets half achter te laten', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ENCRYPTION_SECRET;

    expect(() => voerUit(migratie, webhookadres.up)).toThrow(/ENCRYPTION_SECRET ontbreekt/);
    expect(waarde(rijA)).toBe(ADRES_A);
  });
});
