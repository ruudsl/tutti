/**
 * De verzekering van het instrumentenbezit.
 *
 * 787 regels zonder test. Wat hier telt is geld en aansprakelijkheid: een
 * polis van een andere vereniging mag niet zichtbaar zijn, een claim mag niet
 * naar een instrument van iemand anders wijzen, en een opgezegde polis moet
 * de instrumenten weer als onverzekerd achterlaten. Daar gaan deze tests over.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import insuranceRoutes from '../../routes/instrument-insurance';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/instrument-insurance', insuranceRoutes);
app.use(errorHandler);

describe('instrumentverzekering', () => {
  let vereniging: TestAssociation;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
  });

  type Methode = 'get' | 'post' | 'put' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/instrument-insurance${pad}`).set('Authorization', `Bearer ${token}`);
  const alsBeheerder = (methode: Methode, pad: string) => als(beheerderToken, methode, pad);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  const geldigePolis = {
    policyNumber: 'POL-2026-001',
    providerName: 'Muziekverzekeraar BV',
    policyType: 'all_risk' as const,
    coverageType: 'collective' as const,
    coverageAmount: 50000,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  };

  async function maakPolis(overrides: Record<string, unknown> = {}): Promise<string> {
    const antwoord = await alsBeheerder('post', '/policies').send({ ...geldigePolis, ...overrides });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    return antwoord.body.id;
  }

  /** Een polis van een andere vereniging, rechtstreeks in de database. */
  function vreemdePolis(associationId: string): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO instrument_insurance_policies
         (id, association_id, policy_number, provider_name, policy_type, coverage_type, coverage_amount, start_date, status)
       VALUES (?, ?, 'BUUR-1', 'Buurverzekeraar', 'theft', 'collective', 1000, '2026-01-01', 'active')`,
    ).run(id, associationId);
    return id;
  }

  function maakInstrument(overrides: Record<string, unknown> = {}): string {
    const id = uuidv4();
    const w = { association_id: vereniging.id, name: 'Trompet', current_value: 1200, ...overrides };
    db.prepare(
      `INSERT INTO instrument_assets (id, association_id, name, instrument_type, category, status, condition, current_value)
       VALUES (?, ?, ?, 'trompet', 'brass', 'available', 'good', ?)`,
    ).run(id, w.association_id, w.name, w.current_value);
    return id;
  }

  async function maakClaim(policyId: string, assetId: string, overrides: Record<string, unknown> = {}) {
    return alsBeheerder('post', '/claims').send({
      policyId,
      assetId,
      claimDate: '2026-03-01',
      incidentDate: '2026-02-28',
      incidentType: 'damage',
      incidentDescription: 'Deuk in de beker',
      claimedAmount: 300,
      ...overrides,
    });
  }

  describe('polissen', () => {
    it('begint met een lege lijst', async () => {
      const antwoord = await alsLid('get', '/policies');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.data).toEqual([]);
      expect(antwoord.body.pagination.total).toBe(0);
    });

    it('maakt een polis aan', async () => {
      const id = await maakPolis();
      const antwoord = await alsLid('get', `/policies/${id}`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toMatchObject({
        policyNumber: 'POL-2026-001',
        providerName: 'Muziekverzekeraar BV',
        coverageAmount: 50000,
        status: 'active',
      });
    });

    it('zet de standaardwaarden voor eigen risico en munt', async () => {
      const id = await maakPolis();
      const antwoord = await alsLid('get', `/policies/${id}`);
      expect(antwoord.body).toMatchObject({ deductible: 0, currency: 'EUR', autoRenew: false });
    });

    it('weigert een polis zonder polisnummer', async () => {
      const antwoord = await alsBeheerder('post', '/policies').send({ ...geldigePolis, policyNumber: '' });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een dekking van nul', async () => {
      const antwoord = await alsBeheerder('post', '/policies').send({ ...geldigePolis, coverageAmount: 0 });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een polissoort die niet bestaat', async () => {
      const antwoord = await alsBeheerder('post', '/policies').send({ ...geldigePolis, policyType: 'aansprakelijk' });
      expect(antwoord.status).toBe(400);
    });

    it('houdt een gewoon lid van het aanmaken af', async () => {
      const antwoord = await alsLid('post', '/policies').send(geldigePolis);
      expect(antwoord.status).toBe(403);
    });

    it('toont de polis van een andere vereniging niet', async () => {
      await maakPolis();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      vreemdePolis(andere.id);

      const antwoord = await alsLid('get', '/policies');
      expect(antwoord.body.data).toHaveLength(1);
      expect(antwoord.body.data[0].policyNumber).toBe('POL-2026-001');
    });

    it('geeft 404 voor een polis van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = vreemdePolis(andere.id);

      expect((await alsLid('get', `/policies/${vreemd}`)).status).toBe(404);
    });

    it('filtert op status', async () => {
      const id = await maakPolis();
      await maakPolis({ policyNumber: 'POL-2026-002' });
      await alsBeheerder('delete', `/policies/${id}`);

      const actief = await alsLid('get', '/policies?status=active');
      expect(actief.body.data).toHaveLength(1);
      expect(actief.body.data[0].policyNumber).toBe('POL-2026-002');
    });
  });

  describe('polis bijwerken', () => {
    it('werkt een enkel veld bij en laat de rest staan', async () => {
      const id = await maakPolis();

      const antwoord = await alsBeheerder('put', `/policies/${id}`).send({ coverageAmount: 75000 });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const na = await alsLid('get', `/policies/${id}`);
      expect(na.body).toMatchObject({
        coverageAmount: 75000,
        policyNumber: 'POL-2026-001',
        providerName: 'Muziekverzekeraar BV',
      });
    });

    it('zet automatisch verlengen aan en weer uit', async () => {
      const id = await maakPolis();

      await alsBeheerder('put', `/policies/${id}`).send({ autoRenew: true });
      expect((await alsLid('get', `/policies/${id}`)).body.autoRenew).toBe(true);

      await alsBeheerder('put', `/policies/${id}`).send({ autoRenew: false });
      expect((await alsLid('get', `/policies/${id}`)).body.autoRenew).toBe(false);
    });

    it('weigert een polis van een andere vereniging bij te werken', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = vreemdePolis(andere.id);

      expect((await alsBeheerder('put', `/policies/${vreemd}`).send({ coverageAmount: 1 })).status).toBe(404);
    });

    it('houdt een gewoon lid van het bijwerken af', async () => {
      const id = await maakPolis();
      expect((await alsLid('put', `/policies/${id}`).send({ coverageAmount: 1 })).status).toBe(403);
    });
  });

  describe('polis opzeggen', () => {
    it('zet de polis op geannuleerd zonder de rij weg te gooien', async () => {
      const id = await maakPolis();

      expect((await alsBeheerder('delete', `/policies/${id}`)).status).toBe(200);
      expect((await alsLid('get', `/policies/${id}`)).body.status).toBe('cancelled');
    });

    it('laat de verzekerde instrumenten onverzekerd achter', async () => {
      const polisId = await maakPolis();
      const assetId = maakInstrument();
      await alsBeheerder('post', `/policies/${polisId}/coverage`).send({
        assetId,
        coveredAmount: 1200,
        coverageStart: '2026-01-01',
      });

      await alsBeheerder('delete', `/policies/${polisId}`);

      const rij = db.prepare('SELECT insurance_policy_id FROM instrument_assets WHERE id = ?').get(assetId) as {
        insurance_policy_id: string | null;
      };
      expect(rij.insurance_policy_id).toBeNull();
    });

    it('zegt geen polis van een andere vereniging op', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = vreemdePolis(andere.id);

      expect((await alsBeheerder('delete', `/policies/${vreemd}`)).status).toBe(404);
      const rij = db.prepare('SELECT status FROM instrument_insurance_policies WHERE id = ?').get(vreemd) as {
        status: string;
      };
      expect(rij.status).toBe('active');
    });
  });

  describe('instrumenten onder een polis', () => {
    it('voegt een instrument toe aan de polis', async () => {
      const polisId = await maakPolis();
      const assetId = maakInstrument({ name: 'Bugel' });

      const antwoord = await alsBeheerder('post', `/policies/${polisId}/coverage`).send({
        assetId,
        coveredAmount: 900,
        coverageStart: '2026-01-01',
      });

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);

      const polis = await alsLid('get', `/policies/${polisId}`);
      expect(polis.body.coveredAssets).toHaveLength(1);
      expect(polis.body.coveredAssets[0]).toMatchObject({ coveredAmount: 900 });
      expect(polis.body.coveredAssets[0].asset.name).toBe('Bugel');
    });

    it('noteert de polis bij het instrument zelf', async () => {
      const polisId = await maakPolis();
      const assetId = maakInstrument();
      await alsBeheerder('post', `/policies/${polisId}/coverage`).send({
        assetId,
        coveredAmount: 900,
        coverageStart: '2026-01-01',
      });

      const rij = db.prepare('SELECT insurance_policy_id FROM instrument_assets WHERE id = ?').get(assetId) as {
        insurance_policy_id: string;
      };
      expect(rij.insurance_policy_id).toBe(polisId);
    });

    it('voegt geen instrument van een andere vereniging toe', async () => {
      const polisId = await maakPolis();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdInstrument = maakInstrument({ association_id: andere.id });

      const antwoord = await alsBeheerder('post', `/policies/${polisId}/coverage`).send({
        assetId: vreemdInstrument,
        coveredAmount: 900,
        coverageStart: '2026-01-01',
      });

      expect(antwoord.status).toBe(404);
    });

    it('voegt niets toe aan een polis van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = vreemdePolis(andere.id);
      const assetId = maakInstrument();

      const antwoord = await alsBeheerder('post', `/policies/${vreemd}/coverage`).send({
        assetId,
        coveredAmount: 900,
        coverageStart: '2026-01-01',
      });

      expect(antwoord.status).toBe(404);
    });

    it('haalt een instrument weer van de polis af', async () => {
      const polisId = await maakPolis();
      const assetId = maakInstrument();
      const toegevoegd = await alsBeheerder('post', `/policies/${polisId}/coverage`).send({
        assetId,
        coveredAmount: 900,
        coverageStart: '2026-01-01',
      });

      const antwoord = await alsBeheerder('delete', `/policies/${polisId}/coverage/${toegevoegd.body.id}`);
      expect(antwoord.status).toBe(200);

      const polis = await alsLid('get', `/policies/${polisId}`);
      expect(polis.body.coveredAssets).toEqual([]);

      const rij = db.prepare('SELECT insurance_policy_id FROM instrument_assets WHERE id = ?').get(assetId) as {
        insurance_policy_id: string | null;
      };
      expect(rij.insurance_policy_id).toBeNull();
    });

    it('geeft 404 voor een dekking die niet bestaat', async () => {
      const polisId = await maakPolis();
      expect((await alsBeheerder('delete', `/policies/${polisId}/coverage/${uuidv4()}`)).status).toBe(404);
    });

    it('haalt een dekking niet weg via een andere polis', async () => {
      // De dekking werd alleen op vereniging gecontroleerd, niet op de polis
      // uit het pad. Wie /policies/<polis B>/coverage/<dekking van polis A>
      // aanriep gooide de dekking van polis A weg, terwijl het instrument
      // daarna nog steeds naar polis A wees: onverzekerd, maar wel als
      // verzekerd geadministreerd.
      const polisA = await maakPolis();
      const polisB = await maakPolis({ policyNumber: 'POL-2026-002' });
      const assetId = maakInstrument();
      const dekking = await alsBeheerder('post', `/policies/${polisA}/coverage`).send({
        assetId,
        coveredAmount: 900,
        coverageStart: '2026-01-01',
      });
      expect(dekking.status, JSON.stringify(dekking.body)).toBe(201);

      const antwoord = await alsBeheerder('delete', `/policies/${polisB}/coverage/${dekking.body.id}`);
      expect(antwoord.status).toBe(404);

      expect((await alsLid('get', `/policies/${polisA}`)).body.coveredAssets).toHaveLength(1);

      const rij = db.prepare('SELECT insurance_policy_id FROM instrument_assets WHERE id = ?').get(assetId) as {
        insurance_policy_id: string | null;
      };
      expect(rij.insurance_policy_id).toBe(polisA);
    });
  });

  describe('schadeclaims', () => {
    it('dient een claim in', async () => {
      const polisId = await maakPolis();
      const assetId = maakInstrument({ name: 'Hoorn' });

      const antwoord = await maakClaim(polisId, assetId);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);

      const claim = await alsLid('get', `/claims/${antwoord.body.id}`);
      expect(claim.status).toBe(200);
      expect(claim.body).toMatchObject({
        incidentType: 'damage',
        claimedAmount: 300,
        status: 'submitted',
      });
      expect(claim.body.asset.name).toBe('Hoorn');
      expect(claim.body.policy.policyNumber).toBe('POL-2026-001');
    });

    it('weigert een claim zonder beschrijving', async () => {
      const polisId = await maakPolis();
      const assetId = maakInstrument();

      const antwoord = await maakClaim(polisId, assetId, { incidentDescription: '' });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een soort voorval dat niet bestaat', async () => {
      const polisId = await maakPolis();
      const assetId = maakInstrument();

      const antwoord = await maakClaim(polisId, assetId, { incidentType: 'gestolen' });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een claim op een polis van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = vreemdePolis(andere.id);
      const assetId = maakInstrument();

      const antwoord = await maakClaim(vreemd, assetId);
      expect(antwoord.status).toBe(404);
    });

    it('weigert een claim op een instrument van een andere vereniging', async () => {
      const polisId = await maakPolis();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdInstrument = maakInstrument({ association_id: andere.id });

      const antwoord = await maakClaim(polisId, vreemdInstrument);
      expect(antwoord.status).toBe(404);
    });

    it('houdt een gewoon lid van het indienen af', async () => {
      const polisId = await maakPolis();
      const assetId = maakInstrument();

      const antwoord = await alsLid('post', '/claims').send({
        policyId: polisId,
        assetId,
        claimDate: '2026-03-01',
        incidentDate: '2026-02-28',
        incidentType: 'damage',
        incidentDescription: 'Deuk',
      });
      expect(antwoord.status).toBe(403);
    });

    it('toont de claims van de eigen vereniging', async () => {
      const polisId = await maakPolis();
      const assetId = maakInstrument();
      await maakClaim(polisId, assetId);

      const antwoord = await alsLid('get', '/claims');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.data).toHaveLength(1);
      expect(antwoord.body.data[0].policy.policyNumber).toBe('POL-2026-001');
    });

    it('toont geen claim van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, {
        email: `verz-${uuidv4()}@test.nl`,
        role: 'admin',
      });
      const polisId = await maakPolis();
      const assetId = maakInstrument();
      const gemaakt = await maakClaim(polisId, assetId);

      const antwoord = await request(app)
        .get(`/api/instrument-insurance/claims/${gemaakt.body.id}`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`);

      expect(antwoord.status).toBe(404);
    });

    it('filtert claims op status', async () => {
      const polisId = await maakPolis();
      const assetId = maakInstrument();
      const eerste = await maakClaim(polisId, assetId);
      await maakClaim(polisId, assetId, { claimDate: '2026-04-01' });
      await alsBeheerder('put', `/claims/${eerste.body.id}`).send({ status: 'approved' });

      const antwoord = await alsLid('get', '/claims?status=approved');
      expect(antwoord.body.data).toHaveLength(1);
      expect(antwoord.body.data[0].id).toBe(eerste.body.id);
    });

    it('werkt een claim bij tot uitbetaald', async () => {
      const polisId = await maakPolis();
      const assetId = maakInstrument();
      const gemaakt = await maakClaim(polisId, assetId);

      const antwoord = await alsBeheerder('put', `/claims/${gemaakt.body.id}`).send({
        status: 'paid',
        approvedAmount: 250,
        paidAmount: 250,
        resolutionDate: '2026-05-01',
        resolutionNotes: 'Afgehandeld',
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const claim = await alsLid('get', `/claims/${gemaakt.body.id}`);
      expect(claim.body).toMatchObject({
        status: 'paid',
        approvedAmount: 250,
        paidAmount: 250,
        resolutionDate: '2026-05-01',
      });
    });

    it('werkt alleen de status bij zonder de bedragen te wissen', async () => {
      const polisId = await maakPolis();
      const assetId = maakInstrument();
      const gemaakt = await maakClaim(polisId, assetId);
      await alsBeheerder('put', `/claims/${gemaakt.body.id}`).send({ approvedAmount: 200 });

      const antwoord = await alsBeheerder('put', `/claims/${gemaakt.body.id}`).send({ status: 'under_review' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const claim = await alsLid('get', `/claims/${gemaakt.body.id}`);
      expect(claim.body).toMatchObject({ status: 'under_review', approvedAmount: 200 });
    });

    it('weigert een status die niet bestaat', async () => {
      const polisId = await maakPolis();
      const assetId = maakInstrument();
      const gemaakt = await maakClaim(polisId, assetId);

      const antwoord = await alsBeheerder('put', `/claims/${gemaakt.body.id}`).send({ status: 'kwijt' });
      expect(antwoord.status).toBe(400);
    });

    it('werkt geen claim van een andere vereniging bij', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, {
        email: `verz2-${uuidv4()}@test.nl`,
        role: 'admin',
      });
      const polisId = await maakPolis();
      const assetId = maakInstrument();
      const gemaakt = await maakClaim(polisId, assetId);

      const antwoord = await request(app)
        .put(`/api/instrument-insurance/claims/${gemaakt.body.id}`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`)
        .send({ status: 'rejected' });

      expect(antwoord.status).toBe(404);
    });
  });

  describe('samenvatting', () => {
    it('telt polissen, dekking en premies', async () => {
      await maakPolis({ premiumAmount: 400 });
      await maakPolis({ policyNumber: 'POL-2026-002', coverageAmount: 25000, premiumAmount: 200 });

      const antwoord = await alsLid('get', '/policies/summary');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toMatchObject({
        totalPolicies: 2,
        activePolicies: 2,
        totalCoverage: 75000,
        annualPremiums: 600,
      });
    });

    it('telt de dure instrumenten zonder polis', async () => {
      maakInstrument({ current_value: 2000 });
      maakInstrument({ current_value: 100 });

      const antwoord = await alsLid('get', '/policies/summary');
      expect(antwoord.body.uninsuredHighValueAssets).toBe(1);
    });

    it('telt de openstaande claims', async () => {
      const polisId = await maakPolis();
      const assetId = maakInstrument();
      const eerste = await maakClaim(polisId, assetId);
      await maakClaim(polisId, assetId, { claimDate: '2026-04-01' });
      await alsBeheerder('put', `/claims/${eerste.body.id}`).send({ status: 'closed' });

      const antwoord = await alsLid('get', '/policies/summary');
      expect(antwoord.body.openClaimsCount).toBe(1);
    });

    it('rekent niets van een andere vereniging mee', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      vreemdePolis(andere.id);
      maakInstrument({ association_id: andere.id, current_value: 5000 });

      const antwoord = await alsLid('get', '/policies/summary');
      expect(antwoord.body).toMatchObject({ totalPolicies: 0, uninsuredHighValueAssets: 0 });
    });
  });

  describe('aflopende polissen', () => {
    it('noemt een polis die binnen dertig dagen afloopt', async () => {
      const binnenkort = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await maakPolis({ endDate: binnenkort });

      const antwoord = await alsLid('get', '/policies/expiring');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].daysUntilExpiry).toBeLessThanOrEqual(10);
    });

    it('laat een polis die pas later afloopt weg', async () => {
      const laat = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await maakPolis({ endDate: laat });

      expect((await alsLid('get', '/policies/expiring')).body).toEqual([]);
    });

    it('kijkt desgevraagd verder vooruit', async () => {
      const laat = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await maakPolis({ endDate: laat });

      expect((await alsLid('get', '/policies/expiring?days=180')).body).toHaveLength(1);
    });

    it('noemt geen polis van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = vreemdePolis(andere.id);
      db.prepare("UPDATE instrument_insurance_policies SET end_date = date('now', '+5 days') WHERE id = ?").run(vreemd);

      expect((await alsLid('get', '/policies/expiring')).body).toEqual([]);
    });
  });

  it('vraagt overal om een geldige aanmelding', async () => {
    expect(lid.id).toBeTruthy();
    expect((await request(app).get('/api/instrument-insurance/policies')).status).toBe(401);
    expect((await request(app).get('/api/instrument-insurance/claims')).status).toBe(401);
  });
});
