/**
 * De betaalinstellingen: de koppeling met Mollie en de kosten per
 * betaalmethode.
 *
 * Hier staat een sleutel in de database waarmee iemand betalingen kan
 * ophalen en uitkeringen kan zien. Twee dingen tellen daarom het zwaarst: die
 * sleutel komt nooit terug in een antwoord, en hij staat versleuteld en niet
 * leesbaar in de tabel. De rest gaat over de live/test-schakelaar, want wie
 * per ongeluk in testmodus verkoopt krijgt geen cent binnen.
 *
 * De aanroepen naar Mollie zijn hier vervangen; deze tests gaan over onze
 * kant van de koppeling en niet over die van Mollie.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import paymentSettingsRoutes from '../../routes/payment-settings';
import { errorHandler } from '../../middleware/errorHandler';
import { decrypt, isEncrypted } from '../../utils/encryption';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestUser,
  generateTestToken,
  TestAssociation,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/payment-settings', paymentSettingsRoutes);
app.use(errorHandler);

/** Doe alsof Mollie antwoordt zoals hij hoort. */
function mollieAntwoordtGoed(organisatieId = 'org_12345', aantalMethoden = 3): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).endsWith('/organizations/me')) {
        return { ok: true, json: async () => ({ id: organisatieId, name: 'Harmonie Sint Cecilia' }) };
      }
      if (String(url).endsWith('/methods')) {
        return { ok: true, json: async () => ({ count: aantalMethoden }) };
      }
      return { ok: false, json: async () => ({}) };
    }),
  );
}

/** Doe alsof Mollie de sleutel weigert. */
function mollieWeigert(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, json: async () => ({}) })),
  );
}

describe('betaalinstellingen', () => {
  let vereniging: TestAssociation;
  let beheerderToken: string;
  let lidToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  type Methode = 'get' | 'post' | 'put' | 'delete';
  const alsBeheerder = (methode: Methode, pad: string) =>
    request(app)[methode](`/api/payment-settings${pad}`).set('Authorization', `Bearer ${beheerderToken}`);
  const alsLid = (methode: Methode, pad: string) =>
    request(app)[methode](`/api/payment-settings${pad}`).set('Authorization', `Bearer ${lidToken}`);

  async function koppel(apiKey = 'live_abcdefghijklmnop'): Promise<request.Response> {
    mollieAntwoordtGoed();
    return alsBeheerder('post', '/mollie/connect').send({ apiKey });
  }

  function instellingenRij(associationId = vereniging.id) {
    return db.prepare('SELECT * FROM payment_settings WHERE association_id = ?').get(associationId) as any;
  }

  describe('instellingen ophalen', () => {
    it('maakt bij het eerste bezoek instellingen en standaardkosten aan', async () => {
      const antwoord = await alsBeheerder('get', '/');

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body).toMatchObject({
        provider: 'mollie',
        isConnected: false,
        mode: 'live',
        liveKeyConfigured: false,
        testKeyConfigured: false,
        passFeesToCustomer: false,
      });
      expect(antwoord.body.fees.length).toBeGreaterThan(0);
      expect(antwoord.body.fees.find((f: { method: string }) => f.method === 'ideal')).toMatchObject({
        providerFee: 0.35,
        isEnabled: true,
      });
    });

    it('maakt niet bij elk bezoek nieuwe kosten aan', async () => {
      await alsBeheerder('get', '/');
      const eerste = (await alsBeheerder('get', '/')).body.fees.length;
      const tweede = (await alsBeheerder('get', '/')).body.fees.length;
      expect(tweede).toBe(eerste);
    });

    it('houdt een gewoon lid bij de betaalinstellingen weg', async () => {
      expect((await alsLid('get', '/')).status).toBe(403);
    });

    it('vraagt om een geldige aanmelding', async () => {
      expect((await request(app).get('/api/payment-settings')).status).toBe(401);
    });
  });

  describe('de sleutel blijft geheim', () => {
    it('komt niet terug in het antwoord van de koppeling', async () => {
      const antwoord = await koppel('live_zeergeheimesleutel123');

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(JSON.stringify(antwoord.body)).not.toContain('zeergeheimesleutel123');
    });

    it('komt niet terug in de instellingen', async () => {
      await koppel('live_zeergeheimesleutel123');

      const antwoord = await alsBeheerder('get', '/');
      expect(JSON.stringify(antwoord.body)).not.toContain('zeergeheimesleutel123');
      expect(antwoord.body.liveKeyConfigured).toBe(true);
    });

    it('staat versleuteld in de database en niet leesbaar', async () => {
      await koppel('live_zeergeheimesleutel123');

      const rij = instellingenRij();
      expect(rij.mollie_api_key_encrypted).not.toContain('zeergeheimesleutel123');
      expect(isEncrypted(rij.mollie_api_key_encrypted)).toBe(true);
      expect(decrypt(rij.mollie_api_key_encrypted)).toBe('live_zeergeheimesleutel123');
    });
  });

  describe('koppelen met Mollie', () => {
    it('koppelt en onthoudt de organisatie', async () => {
      const antwoord = await koppel();

      expect(antwoord.body).toMatchObject({
        success: true,
        profileId: 'org_12345',
        organisationName: 'Harmonie Sint Cecilia',
        canReceivePayments: true,
        mode: 'live',
      });
      expect(instellingenRij()).toMatchObject({ is_connected: 1, mollie_profile_id: 'org_12345' });
    });

    it('leidt de modus af uit het voorvoegsel van de sleutel', async () => {
      const antwoord = await koppel('test_abcdefghijklmnop');

      expect(antwoord.body.mode).toBe('test');
      const rij = instellingenRij();
      expect(rij.mollie_mode).toBe('test');
      expect(rij.mollie_test_api_key_encrypted).not.toBeNull();
      expect(rij.mollie_api_key_encrypted).toBeNull();
    });

    it('houdt de live- en testsleutel uit elkaar', async () => {
      await koppel('live_eenlivesleutel');
      await koppel('test_eentestsleutel');

      const rij = instellingenRij();
      expect(decrypt(rij.mollie_api_key_encrypted)).toBe('live_eenlivesleutel');
      expect(decrypt(rij.mollie_test_api_key_encrypted)).toBe('test_eentestsleutel');
    });

    it('weigert een sleutel die Mollie niet accepteert', async () => {
      mollieWeigert();
      const antwoord = await alsBeheerder('post', '/mollie/connect').send({ apiKey: 'live_fout' });

      expect(antwoord.status).toBe(400);
      expect(instellingenRij().is_connected).toBe(0);
    });

    it('weigert een leeg verzoek', async () => {
      expect((await alsBeheerder('post', '/mollie/connect').send({})).status).toBe(400);
    });

    it('meldt dat er geen betaalmethoden aan staan', async () => {
      mollieAntwoordtGoed('org_1', 0);
      const antwoord = await alsBeheerder('post', '/mollie/connect').send({ apiKey: 'live_abc' });

      expect(antwoord.body.canReceivePayments).toBe(false);
      expect(instellingenRij().can_receive_payments).toBe(0);
    });

    it('houdt een gewoon lid van het koppelen af', async () => {
      mollieAntwoordtGoed();
      expect((await alsLid('post', '/mollie/connect').send({ apiKey: 'live_abc' })).status).toBe(403);
    });
  });

  describe('schakelen tussen live en test', () => {
    it('schakelt om zodra beide sleutels er zijn', async () => {
      await koppel('live_eenlivesleutel');
      await koppel('test_eentestsleutel');

      const antwoord = await alsBeheerder('put', '/mollie/mode').send({ mode: 'live' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(instellingenRij().mollie_mode).toBe('live');
    });

    it('weigert te schakelen naar een modus zonder sleutel', async () => {
      await koppel('live_eenlivesleutel');

      const antwoord = await alsBeheerder('put', '/mollie/mode').send({ mode: 'test' });
      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('test');
      expect(instellingenRij().mollie_mode).toBe('live');
    });

    it('weigert een modus die niet bestaat', async () => {
      expect((await alsBeheerder('put', '/mollie/mode').send({ mode: 'oefenen' })).status).toBe(400);
    });

    it('laat de instellingen zien welke sleutel actief is', async () => {
      await koppel('test_eentestsleutel');

      const antwoord = await alsBeheerder('get', '/');
      expect(antwoord.body).toMatchObject({
        mode: 'test',
        isConnected: true,
        testKeyConfigured: true,
        liveKeyConfigured: false,
        profileId: 'org_12345',
      });
    });
  });

  describe('sleutels verwijderen', () => {
    it('verwijdert alleen de gevraagde sleutel', async () => {
      await koppel('live_eenlivesleutel');
      await koppel('test_eentestsleutel');

      expect((await alsBeheerder('delete', '/mollie/key/test')).status).toBe(200);

      const rij = instellingenRij();
      expect(rij.mollie_test_api_key_encrypted).toBeNull();
      expect(rij.mollie_api_key_encrypted).not.toBeNull();
    });

    it('schakelt terug naar de andere modus als de actieve sleutel weg is', async () => {
      await koppel('live_eenlivesleutel');
      await koppel('test_eentestsleutel');
      expect(instellingenRij().mollie_mode).toBe('test');

      await alsBeheerder('delete', '/mollie/key/test');

      const rij = instellingenRij();
      expect(rij.mollie_mode).toBe('live');
      expect(rij.is_connected).toBe(1);
    });

    it('zet de koppeling uit als er geen sleutel meer over is', async () => {
      await koppel('live_eenlivesleutel');

      await alsBeheerder('delete', '/mollie/key/live');

      const rij = instellingenRij();
      expect(rij.is_connected).toBe(0);
      expect(rij.can_receive_payments).toBe(0);
    });

    it('weigert een modus die niet bestaat', async () => {
      expect((await alsBeheerder('delete', '/mollie/key/oefenen')).status).toBe(400);
    });

    it('koppelt alles in een keer los', async () => {
      await koppel('live_eenlivesleutel');
      await koppel('test_eentestsleutel');

      expect((await alsBeheerder('post', '/mollie/disconnect')).status).toBe(200);

      const rij = instellingenRij();
      expect(rij.mollie_api_key_encrypted).toBeNull();
      expect(rij.mollie_test_api_key_encrypted).toBeNull();
      expect(rij.is_connected).toBe(0);
      expect(rij.connected_at).toBeNull();
    });
  });

  describe('kosten per betaalmethode', () => {
    it('past de kosten voor de klant aan', async () => {
      await alsBeheerder('get', '/');

      const antwoord = await alsBeheerder('put', '/fees/ideal').send({ customerFee: 0.5 });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const kosten = (await alsBeheerder('get', '/')).body.fees.find((f: { method: string }) => f.method === 'ideal');
      expect(kosten.customerFee).toBe(0.5);
      expect(kosten.providerFee).toBe(0.35);
    });

    it('zet een betaalmethode uit', async () => {
      await alsBeheerder('get', '/');
      await alsBeheerder('put', '/fees/paypal').send({ customerFee: 0.35, isEnabled: false });

      const kosten = (await alsBeheerder('get', '/')).body.fees.find((f: { method: string }) => f.method === 'paypal');
      expect(kosten.isEnabled).toBe(false);
    });

    it('weigert negatieve kosten', async () => {
      await alsBeheerder('get', '/');
      expect((await alsBeheerder('put', '/fees/ideal').send({ customerFee: -1 })).status).toBe(400);
    });

    it('geeft 404 voor een betaalmethode die niet bestaat', async () => {
      await alsBeheerder('get', '/');
      expect((await alsBeheerder('put', '/fees/contant').send({ customerFee: 0 })).status).toBe(404);
    });

    it('zet het doorberekenen van kosten aan', async () => {
      await alsBeheerder('get', '/');

      expect((await alsBeheerder('put', '/').send({ passFeesToCustomer: true })).status).toBe(200);
      expect((await alsBeheerder('get', '/')).body.passFeesToCustomer).toBe(true);
    });

    it('houdt een gewoon lid van het aanpassen af', async () => {
      await alsBeheerder('get', '/');
      expect((await alsLid('put', '/fees/ideal').send({ customerFee: 0 })).status).toBe(403);
    });
  });

  describe('de verenigingsgrens', () => {
    it('raakt de instellingen van een andere vereniging niet', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, { email: `bet-${uuidv4()}@test.nl`, role: 'admin' });
      await koppel('live_eenlivesleutel');

      const antwoord = await request(app)
        .get('/api/payment-settings')
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.liveKeyConfigured).toBe(false);
      expect(antwoord.body.isConnected).toBe(false);
    });

    it('laat de sleutel van de andere vereniging staan bij loskoppelen', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, { email: `bet2-${uuidv4()}@test.nl`, role: 'admin' });
      await koppel('live_eenlivesleutel');

      await request(app)
        .post('/api/payment-settings/mollie/disconnect')
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`);

      expect(instellingenRij().mollie_api_key_encrypted).not.toBeNull();
    });
  });

  describe('de koppeling nakijken', () => {
    it('meldt niet-verbonden zonder sleutel', async () => {
      await alsBeheerder('get', '/');

      const antwoord = await alsBeheerder('get', '/mollie/test');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toMatchObject({ connected: false, canReceivePayments: false });
    });

    it('meldt verbonden met een geldige sleutel', async () => {
      await koppel('live_eenlivesleutel');
      mollieAntwoordtGoed();

      const antwoord = await alsBeheerder('get', '/mollie/test');
      expect(antwoord.body).toMatchObject({ connected: true, canReceivePayments: true });
    });

    it('zet de koppeling uit zodra Mollie de sleutel weigert', async () => {
      await koppel('live_eenlivesleutel');
      mollieWeigert();

      const antwoord = await alsBeheerder('get', '/mollie/test');
      expect(antwoord.body.connected).toBe(false);
      expect(antwoord.body.error).toContain('no longer valid');
      expect(instellingenRij().is_connected).toBe(0);
    });

    it('zet een oude sleutel in base64 om naar echte versleuteling', async () => {
      await alsBeheerder('get', '/');
      const oud = Buffer.from('live_oudesleutel').toString('base64');
      db.prepare('UPDATE payment_settings SET mollie_api_key_encrypted = ? WHERE association_id = ?').run(
        oud,
        vereniging.id,
      );
      mollieAntwoordtGoed();

      await alsBeheerder('get', '/mollie/test');

      const rij = instellingenRij();
      expect(isEncrypted(rij.mollie_api_key_encrypted)).toBe(true);
      expect(decrypt(rij.mollie_api_key_encrypted)).toBe('live_oudesleutel');
    });

    it('valt terug op "in bedrijf" als de statuspagina van Mollie niet reageert', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('netwerk weg');
        }),
      );

      const antwoord = await alsBeheerder('get', '/mollie/status');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toMatchObject({ operational: true, incidents: [] });
    });

    it('geeft de storingsmeldingen van Mollie door', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          json: async () => ({
            status: { indicator: 'major', description: 'Grote storing' },
            incidents: [{ name: 'iDEAL ligt eruit', status: 'investigating', updated_at: '2026-08-20T10:00:00Z' }],
          }),
        })),
      );

      const antwoord = await alsBeheerder('get', '/mollie/status');
      expect(antwoord.body).toMatchObject({ operational: false, statusDescription: 'Grote storing' });
      expect(antwoord.body.incidents[0]).toMatchObject({ name: 'iDEAL ligt eruit', status: 'investigating' });
    });
  });
});
