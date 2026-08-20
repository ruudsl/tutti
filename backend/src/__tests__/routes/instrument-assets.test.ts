/**
 * Het instrumentenbezit van de vereniging.
 *
 * Dit was het grootste bestand op nul procent (1501 regels). Het gaat over
 * spullen die geld waard zijn en die worden uitgeleend aan leden. Drie dingen
 * wegen hier het zwaarst en daar gaan de meeste tests over: een instrument van
 * een andere vereniging blijft onzichtbaar, een instrument dat al uitgeleend is
 * kan niet nog een keer weg, en bij het terugbrengen klopt de status weer.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import instrumentAssetsRoutes from '../../routes/instrument-assets';
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
app.use('/api/instrument-assets', instrumentAssetsRoutes);
app.use(errorHandler);

describe('instrumentenbezit', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let lid: TestUser;
  let beheerderToken: string;
  let lidToken: string;

  function maakInstrument(overrides: Record<string, unknown> = {}): string {
    const id = uuidv4();
    const w = {
      association_id: vereniging.id,
      name: 'Trompet Bach 180',
      instrument_type: 'trompet',
      category: 'brass',
      status: 'available',
      condition: 'good',
      current_value: 1200,
      ...overrides,
    };
    db.prepare(
      `INSERT INTO instrument_assets (id, association_id, name, instrument_type, category, status, condition, current_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, w.association_id, w.name, w.instrument_type, w.category, w.status, w.condition, w.current_value);
    return id;
  }

  function statusVan(id: string): string {
    const rij = db.prepare('SELECT status FROM instrument_assets WHERE id = ?').get(id) as { status: string };
    return rij.status;
  }

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    lid = omgeving.memberUser;
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;
  });

  const alsBeheerder = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
    request(app)[methode](`/api/instrument-assets${pad}`).set('Authorization', `Bearer ${beheerderToken}`);

  const alsLid = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
    request(app)[methode](`/api/instrument-assets${pad}`).set('Authorization', `Bearer ${lidToken}`);

  describe('overzicht', () => {
    it('geeft een lege lijst voor een vereniging zonder instrumenten', async () => {
      const antwoord = await alsBeheerder('get', '/');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.data).toEqual([]);
    });

    it('toont de instrumenten van de eigen vereniging', async () => {
      maakInstrument({ name: 'Trompet' });
      maakInstrument({ name: 'Bugel' });

      const antwoord = await alsBeheerder('get', '/');
      expect(antwoord.body.data.length).toBe(2);
    });

    it('toont de instrumenten van een andere vereniging niet', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      maakInstrument({ association_id: andere.id, name: 'Van de buren' });

      const antwoord = await alsBeheerder('get', '/');
      const namen = antwoord.body.data.map((a: { name: string }) => a.name);
      expect(namen).not.toContain('Van de buren');
    });

    it('laat een verwijderd instrument weg', async () => {
      const id = maakInstrument({ name: 'Weggedaan' });
      db.prepare('UPDATE instrument_assets SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);

      const antwoord = await alsBeheerder('get', '/');
      const namen = antwoord.body.data.map((a: { name: string }) => a.name);
      expect(namen).not.toContain('Weggedaan');
    });

    it('vereist inloggen', async () => {
      expect((await request(app).get('/api/instrument-assets/')).status).toBe(401);
    });
  });

  describe('een instrument opvragen', () => {
    it('geeft het instrument terug', async () => {
      const id = maakInstrument({ name: 'Trompet Bach 180' });
      const antwoord = await alsBeheerder('get', `/${id}`);

      expect(antwoord.status).toBe(200);
      expect((antwoord.body.asset ?? antwoord.body).name).toBe('Trompet Bach 180');
    });

    it('geeft 404 voor een instrument dat niet bestaat', async () => {
      expect((await alsBeheerder('get', `/${uuidv4()}`)).status).toBe(404);
    });

    it('geeft 404 voor een instrument van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdId = maakInstrument({ association_id: andere.id });

      expect((await alsBeheerder('get', `/${vreemdId}`)).status).toBe(404);
    });
  });

  describe('aanmaken en wijzigen', () => {
    it('legt een instrument vast', async () => {
      const antwoord = await alsBeheerder('post', '/').send({
        name: 'Trompet Bach 180',
        instrumentType: 'trompet',
        category: 'brass',
        purchasePrice: 1800,
        currentValue: 1200,
      });

      expect(antwoord.status).toBe(201);
      const rij = db
        .prepare('SELECT name, association_id, status, condition FROM instrument_assets WHERE id = ?')
        .get(antwoord.body.id) as { name: string; association_id: string; status: string; condition: string };

      expect(rij).toMatchObject({
        name: 'Trompet Bach 180',
        association_id: vereniging.id,
        status: 'available',
        condition: 'good',
      });
    });

    it('weigert een categorie die niet bestaat', async () => {
      const antwoord = await alsBeheerder('post', '/').send({
        name: 'Iets',
        instrumentType: 'onbekend',
        category: 'ruimtevaart',
      });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een naam die leeg is', async () => {
      const antwoord = await alsBeheerder('post', '/').send({ name: '', instrumentType: 'trompet', category: 'brass' });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een bouwjaar in de toekomst', async () => {
      const antwoord = await alsBeheerder('post', '/').send({
        name: 'Trompet',
        instrumentType: 'trompet',
        category: 'brass',
        yearManufactured: new Date().getFullYear() + 5,
      });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een negatieve aanschafprijs', async () => {
      const antwoord = await alsBeheerder('post', '/').send({
        name: 'Trompet',
        instrumentType: 'trompet',
        category: 'brass',
        purchasePrice: -100,
      });
      expect(antwoord.status).toBe(400);
    });

    it('houdt een gewoon lid van het aanmaken af', async () => {
      const antwoord = await alsLid('post', '/').send({
        name: 'Trompet',
        instrumentType: 'trompet',
        category: 'brass',
      });
      expect(antwoord.status).toBe(403);
    });

    it('werkt een instrument bij', async () => {
      const id = maakInstrument({ name: 'Oud' });
      const antwoord = await alsBeheerder('put', `/${id}`).send({ name: 'Nieuw', condition: 'fair' });

      expect(antwoord.status).toBe(200);
      const rij = db.prepare('SELECT name, condition FROM instrument_assets WHERE id = ?').get(id) as {
        name: string;
        condition: string;
      };
      expect(rij).toMatchObject({ name: 'Nieuw', condition: 'fair' });
    });

    it('weigert een instrument van een andere vereniging bij te werken', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdId = maakInstrument({ association_id: andere.id, name: 'Van de buren' });

      expect((await alsBeheerder('put', `/${vreemdId}`).send({ name: 'Gekaapt' })).status).toBe(404);

      const rij = db.prepare('SELECT name FROM instrument_assets WHERE id = ?').get(vreemdId) as { name: string };
      expect(rij.name).toBe('Van de buren');
    });
  });

  describe('verwijderen', () => {
    it('markeert het instrument als verwijderd zonder de rij weg te gooien', async () => {
      const id = maakInstrument();
      expect((await alsBeheerder('delete', `/${id}`)).status).toBe(200);

      const rij = db.prepare('SELECT deleted_at FROM instrument_assets WHERE id = ?').get(id) as {
        deleted_at: string | null;
      };
      expect(rij.deleted_at).not.toBeNull();
    });

    it('laat alleen een beheerder verwijderen', async () => {
      const id = maakInstrument();
      expect((await alsLid('delete', `/${id}`)).status).toBe(403);
    });

    it('weigert een instrument van een andere vereniging te verwijderen', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdId = maakInstrument({ association_id: andere.id });

      expect((await alsBeheerder('delete', `/${vreemdId}`)).status).toBe(404);
      const rij = db.prepare('SELECT deleted_at FROM instrument_assets WHERE id = ?').get(vreemdId) as {
        deleted_at: string | null;
      };
      expect(rij.deleted_at).toBeNull();
    });
  });

  describe('uitlenen', () => {
    const uitleen = (extra: Record<string, unknown> = {}) => ({
      borrowerUserId: lid.id,
      loanDate: '2026-03-01',
      conditionAtLoan: 'good',
      ...extra,
    });

    it('leent een instrument uit en zet de status om', async () => {
      const id = maakInstrument();
      const antwoord = await alsBeheerder('post', `/${id}/loans`).send(uitleen());

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
      expect(statusVan(id)).toBe('on_loan');
    });

    it('weigert een tweede uitleen van hetzelfde instrument', async () => {
      const id = maakInstrument();
      await alsBeheerder('post', `/${id}/loans`).send(uitleen());

      const tweede = await alsBeheerder('post', `/${id}/loans`).send(uitleen());
      expect(tweede.status).toBe(400);
      expect(tweede.body.error).toMatch(/al uitgeleend/i);
    });

    it('weigert uitlenen van een instrument in reparatie', async () => {
      const id = maakInstrument({ status: 'in_repair' });
      const antwoord = await alsBeheerder('post', `/${id}/loans`).send(uitleen());

      expect(antwoord.status).toBe(400);
      expect(statusVan(id)).toBe('in_repair');
    });

    it('weigert een lener die niet bestaat', async () => {
      const id = maakInstrument();
      const antwoord = await alsBeheerder('post', `/${id}/loans`).send(uitleen({ borrowerUserId: 'geen-uuid' }));
      expect(antwoord.status).toBe(400);
    });

    it('weigert een toestand die niet bestaat', async () => {
      const id = maakInstrument();
      const antwoord = await alsBeheerder('post', `/${id}/loans`).send(uitleen({ conditionAtLoan: 'prima' }));
      expect(antwoord.status).toBe(400);
    });

    it('weigert een instrument van een andere vereniging uit te lenen', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdId = maakInstrument({ association_id: andere.id });

      const antwoord = await alsBeheerder('post', `/${vreemdId}/loans`).send(uitleen());
      expect(antwoord.status).toBe(404);
      expect(statusVan(vreemdId)).toBe('available');
    });

    it('toont de uitleengeschiedenis', async () => {
      const id = maakInstrument();
      await alsBeheerder('post', `/${id}/loans`).send(uitleen());

      const antwoord = await alsBeheerder('get', `/${id}/loans`);
      expect(antwoord.status).toBe(200);
      expect((antwoord.body.loans ?? antwoord.body).length).toBe(1);
    });
  });

  describe('terugbrengen', () => {
    async function leenUit(assetId: string): Promise<string> {
      const antwoord = await alsBeheerder('post', `/${assetId}/loans`).send({
        borrowerUserId: lid.id,
        loanDate: '2026-03-01',
        conditionAtLoan: 'good',
      });
      expect(antwoord.status).toBe(201);
      return antwoord.body.id;
    }

    it('zet het instrument weer op beschikbaar', async () => {
      const assetId = maakInstrument();
      const loanId = await leenUit(assetId);

      const antwoord = await alsBeheerder('post', `/${assetId}/loans/${loanId}/return`).send({
        conditionAtReturn: 'good',
        actualReturnDate: '2026-03-20',
      });

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(statusVan(assetId)).toBe('available');
    });

    it('kan niet twee keer worden teruggebracht', async () => {
      const assetId = maakInstrument();
      const loanId = await leenUit(assetId);

      await alsBeheerder('post', `/${assetId}/loans/${loanId}/return`).send({
        actualReturnDate: '2026-06-01',
        conditionAtReturn: 'good',
      });
      const tweede = await alsBeheerder('post', `/${assetId}/loans/${loanId}/return`).send({
        actualReturnDate: '2026-06-01',
        conditionAtReturn: 'good',
      });

      expect(tweede.status).toBe(404);
    });

    it('weigert een uitleen van een andere vereniging terug te boeken', async () => {
      const assetId = maakInstrument();
      const loanId = await leenUit(assetId);

      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, {
        email: `beheer-${uuidv4()}@test.nl`,
        role: 'admin',
      });

      const antwoord = await request(app)
        .post(`/api/instrument-assets/${assetId}/loans/${loanId}/return`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`)
        .send({ actualReturnDate: '2026-06-01', conditionAtReturn: 'good' });

      expect(antwoord.status).toBe(404);
      expect(statusVan(assetId)).toBe('on_loan');
    });
  });

  describe('samenvatting', () => {
    it('telt de instrumenten en hun waarde', async () => {
      maakInstrument({ current_value: 1000 });
      maakInstrument({ current_value: 500 });

      const antwoord = await alsBeheerder('get', '/summary');
      expect(antwoord.status).toBe(200);
    });

    it('rekent de instrumenten van een andere vereniging niet mee', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      maakInstrument({ association_id: andere.id, current_value: 99999 });

      const antwoord = await alsBeheerder('get', '/summary');
      expect(JSON.stringify(antwoord.body)).not.toContain('99999');
    });
  });
});
