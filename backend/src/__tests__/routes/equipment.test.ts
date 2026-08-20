/**
 * Apparatuur: categorieën, spullen, uitleen, onderhoud en schade.
 *
 * Twee dingen wegen hier het zwaarst. Het eerste is de uitleenstand: een item
 * dat al weg is mag niet nog een keer mee, en na inleveren hoort het weer
 * beschikbaar te staan. Het tweede is schade, en daar zat een echte fout in:
 * POST /:id/damage haalde alleen id en condition op maar schreef daarna
 * item.status terug. Die was dus undefined, en bij elke melding die niet
 * 'unusable' was werd de stand van het item leeggemaakt.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import equipmentRoutes from '../../routes/equipment';
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
app.use('/api/equipment', equipmentRoutes);
app.use(errorHandler);

describe('apparatuur', () => {
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

  type Methode = 'get' | 'post' | 'patch' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/equipment${pad}`).set('Authorization', `Bearer ${token}`);
  const alsBeheerder = (methode: Methode, pad: string) => als(beheerderToken, methode, pad);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  async function maakItem(overrides: Record<string, unknown> = {}): Promise<string> {
    const antwoord = await alsBeheerder('post', '/').send({
      name: 'Mengpaneel',
      equipmentType: 'audio',
      ...overrides,
    });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    return antwoord.body.id;
  }

  function itemRij(id: string): { status: string; condition: string } {
    return db.prepare('SELECT status, condition FROM equipment_items WHERE id = ?').get(id) as {
      status: string;
      condition: string;
    };
  }

  /** Een item van een andere vereniging, rechtstreeks in de database. */
  function vreemdItem(associationId: string): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO equipment_items (id, association_id, name, equipment_type, inventory_number, status, condition, is_loanable)
       VALUES (?, ?, 'Spullen van de buren', 'audio', 'BUUR-1', 'available', 'good', 1)`,
    ).run(id, associationId);
    return id;
  }

  describe('categorieën', () => {
    it('begint leeg', async () => {
      const antwoord = await alsLid('get', '/categories');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual([]);
    });

    it('maakt een categorie aan', async () => {
      const gemaakt = await alsBeheerder('post', '/categories').send({ name: 'Geluid', color: '#ff0000' });
      expect(gemaakt.status, JSON.stringify(gemaakt.body)).toBe(201);

      const antwoord = await alsLid('get', '/categories');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0]).toMatchObject({ name: 'Geluid', color: '#ff0000', itemCount: 0 });
    });

    it('telt de items in een categorie', async () => {
      const categorie = await alsBeheerder('post', '/categories').send({ name: 'Geluid' });
      await maakItem({ categoryId: categorie.body.id });

      const antwoord = await alsLid('get', '/categories');
      expect(antwoord.body[0].itemCount).toBe(1);
    });

    it('noemt de bovenliggende categorie', async () => {
      const boven = await alsBeheerder('post', '/categories').send({ name: 'Techniek' });
      await alsBeheerder('post', '/categories').send({ name: 'Geluid', parentId: boven.body.id });

      const antwoord = await alsLid('get', '/categories');
      const kind = antwoord.body.find((c: { name: string }) => c.name === 'Geluid');
      expect(kind.parentName).toBe('Techniek');
    });

    it('weigert een categorie zonder naam', async () => {
      expect((await alsBeheerder('post', '/categories').send({})).status).toBe(400);
    });

    it('houdt een gewoon lid van het aanmaken af', async () => {
      expect((await alsLid('post', '/categories').send({ name: 'Van mij' })).status).toBe(403);
    });

    it('toont de categorie van een andere vereniging niet', async () => {
      await alsBeheerder('post', '/categories').send({ name: 'Eigen' });
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      db.prepare('INSERT INTO equipment_categories (id, association_id, name) VALUES (?, ?, ?)').run(
        uuidv4(),
        andere.id,
        'Van de buren',
      );

      const antwoord = await alsLid('get', '/categories');
      expect(antwoord.body.map((c: { name: string }) => c.name)).toEqual(['Eigen']);
    });

    it('verwijdert geen categorie van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = uuidv4();
      db.prepare('INSERT INTO equipment_categories (id, association_id, name) VALUES (?, ?, ?)').run(
        vreemd,
        andere.id,
        'Van de buren',
      );

      expect((await alsBeheerder('delete', `/categories/${vreemd}`)).status).toBe(404);
    });
  });

  describe('items', () => {
    it('maakt een item met een inventarisnummer', async () => {
      const antwoord = await alsBeheerder('post', '/').send({ name: 'Mengpaneel', equipmentType: 'audio' });

      expect(antwoord.status).toBe(201);
      expect(antwoord.body.inventoryNumber).toBe('EQ-00001');
    });

    it('nummert het volgende item door', async () => {
      await maakItem();
      const tweede = await alsBeheerder('post', '/').send({ name: 'Statief', equipmentType: 'audio' });
      expect(tweede.body.inventoryNumber).toBe('EQ-00002');
    });

    it('houdt een eigen inventarisnummer aan', async () => {
      const antwoord = await alsBeheerder('post', '/').send({
        name: 'Mengpaneel',
        equipmentType: 'audio',
        inventoryNumber: 'GELUID-01',
      });
      expect(antwoord.body.inventoryNumber).toBe('GELUID-01');
    });

    it('weigert een soort die niet bestaat', async () => {
      expect((await alsBeheerder('post', '/').send({ name: 'Iets', equipmentType: 'drone' })).status).toBe(400);
    });

    it('weigert een item zonder naam', async () => {
      expect((await alsBeheerder('post', '/').send({ equipmentType: 'audio' })).status).toBe(400);
    });

    it('houdt een gewoon lid van het aanmaken af', async () => {
      expect((await alsLid('post', '/').send({ name: 'Van mij', equipmentType: 'audio' })).status).toBe(403);
    });

    it('filtert op soort', async () => {
      await maakItem({ equipmentType: 'audio' });
      await maakItem({ name: 'Statafel', equipmentType: 'furniture' });

      const antwoord = await alsLid('get', '/?type=furniture');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].name).toBe('Statafel');
    });

    it('filtert op status', async () => {
      await maakItem();
      await maakItem({ name: 'Kapot', status: 'repair' });

      const antwoord = await alsLid('get', '/?status=repair');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].name).toBe('Kapot');
    });

    it('filtert op uitleenbaar', async () => {
      await maakItem();
      await maakItem({ name: 'Blijft hier', isLoanable: false });

      const antwoord = await alsLid('get', '/?loanable=false');
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].name).toBe('Blijft hier');
    });

    it('somt de gebruikte soorten op', async () => {
      await maakItem({ equipmentType: 'audio' });
      await maakItem({ name: 'Lamp', equipmentType: 'lighting' });

      const antwoord = await alsLid('get', '/types');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.sort()).toEqual(['audio', 'lighting']);
    });

    it('toont het item van een andere vereniging niet', async () => {
      await maakItem();
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      vreemdItem(andere.id);

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body.map((e: { name: string }) => e.name)).toEqual(['Mengpaneel']);
    });

    it('geeft 404 voor een item van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      expect((await alsLid('get', `/${vreemdItem(andere.id)}`)).status).toBe(404);
    });

    it('werkt een item bij', async () => {
      const id = await maakItem();

      const antwoord = await alsBeheerder('patch', `/${id}`).send({ condition: 'poor', location: 'Zolder' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(itemRij(id).condition).toBe('poor');
    });

    it('werkt geen item van een andere vereniging bij', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      expect((await alsBeheerder('patch', `/${vreemdItem(andere.id)}`).send({ condition: 'poor' })).status).toBe(404);
    });

    it('markeert een item als verwijderd zonder de rij weg te gooien', async () => {
      const id = await maakItem();

      expect((await alsBeheerder('delete', `/${id}`)).status).toBe(200);
      expect((await alsLid('get', '/')).body).toEqual([]);
      expect(db.prepare('SELECT id FROM equipment_items WHERE id = ?').get(id)).toBeDefined();
    });

    it('verwijdert een item niet twee keer', async () => {
      const id = await maakItem();
      await alsBeheerder('delete', `/${id}`);
      expect((await alsBeheerder('delete', `/${id}`)).status).toBe(404);
    });
  });

  describe('uitlenen', () => {
    async function leenUit(equipmentId: string, userId = lid.id) {
      return alsBeheerder('post', '/loans').send({ equipmentId, userId, expectedReturnDate: '2026-09-01' });
    }

    it('leent een item uit en zet het op in gebruik', async () => {
      const id = await maakItem();

      const antwoord = await leenUit(id);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
      expect(itemRij(id).status).toBe('in_use');
    });

    it('leent hetzelfde item niet twee keer uit', async () => {
      const id = await maakItem();
      await leenUit(id);

      const tweede = await leenUit(id);
      expect(tweede.status).toBe(400);
    });

    it('leent een item niet uit dat niet uitgeleend mag worden', async () => {
      const id = await maakItem({ isLoanable: false });
      expect((await leenUit(id)).status).toBe(400);
    });

    it('leent geen item van een andere vereniging uit', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      expect((await leenUit(vreemdItem(andere.id))).status).toBe(404);
    });

    it('toont de lopende uitleningen', async () => {
      const id = await maakItem();
      await leenUit(id);

      const antwoord = await alsLid('get', '/loans?status=active');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0]).toMatchObject({ equipmentName: 'Mengpaneel', userId: lid.id });
    });

    it('toont geen uitlening van een andere vereniging', async () => {
      const id = await maakItem();
      await leenUit(id);
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereGebruiker = createTestUser(andere.id, { email: `app-${uuidv4()}@test.nl` });

      const antwoord = await request(app)
        .get('/api/equipment/loans')
        .set('Authorization', `Bearer ${generateTestToken(andereGebruiker)}`);

      expect(antwoord.body).toEqual([]);
    });

    it('neemt een item weer in', async () => {
      const id = await maakItem();
      const uitlening = await leenUit(id);

      const antwoord = await alsBeheerder('patch', `/loans/${uitlening.body.id}/return`).send({
        conditionAtReturn: 'good',
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(itemRij(id).status).toBe('available');
    });

    it('neemt een item niet twee keer in', async () => {
      const id = await maakItem();
      const uitlening = await leenUit(id);
      await alsBeheerder('patch', `/loans/${uitlening.body.id}/return`).send({});

      const tweede = await alsBeheerder('patch', `/loans/${uitlening.body.id}/return`).send({});
      expect(tweede.status).toBe(400);
    });

    it('neemt geen uitlening van een andere vereniging in', async () => {
      const id = await maakItem();
      const uitlening = await leenUit(id);
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, { email: `app2-${uuidv4()}@test.nl`, role: 'admin' });

      const antwoord = await request(app)
        .patch(`/api/equipment/loans/${uitlening.body.id}/return`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`)
        .send({});

      expect(antwoord.status).toBe(404);
      expect(itemRij(id).status).toBe('in_use');
    });

    it('laat uitlenen niet aan een gewoon lid over', async () => {
      const id = await maakItem();
      const antwoord = await alsLid('post', '/loans').send({ equipmentId: id, userId: lid.id });
      expect(antwoord.status).toBe(403);
    });
  });

  describe('onderhoud', () => {
    it('legt onderhoud vast en noteert de volgende beurt', async () => {
      const id = await maakItem();

      const antwoord = await alsBeheerder('post', `/${id}/maintenance`).send({
        maintenanceType: 'service',
        description: 'Faders schoongemaakt',
        performedDate: '2026-05-01',
        nextMaintenanceDate: '2027-05-01',
        cost: 120,
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);

      const rij = db.prepare('SELECT last_maintenance, next_maintenance FROM equipment_items WHERE id = ?').get(id) as {
        last_maintenance: string;
        next_maintenance: string;
      };
      expect(rij).toMatchObject({ last_maintenance: '2026-05-01', next_maintenance: '2027-05-01' });
    });

    it('weigert een soort onderhoud die niet bestaat', async () => {
      const id = await maakItem();
      const antwoord = await alsBeheerder('post', `/${id}/maintenance`).send({
        maintenanceType: 'poetsen',
        description: 'Iets',
        performedDate: '2026-05-01',
      });
      expect(antwoord.status).toBe(400);
    });

    it('legt geen onderhoud vast op een item van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const antwoord = await alsBeheerder('post', `/${vreemdItem(andere.id)}/maintenance`).send({
        maintenanceType: 'service',
        description: 'Iets',
        performedDate: '2026-05-01',
      });
      expect(antwoord.status).toBe(404);
    });
  });

  describe('schade', () => {
    it('meldt schade en verlaagt de toestand', async () => {
      const id = await maakItem();

      const antwoord = await alsLid('post', `/${id}/damage`).send({
        description: 'Kras op de behuizing',
        severity: 'minor',
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
      expect(itemRij(id).condition).toBe('fair');
    });

    it('laat de stand van het item staan bij lichte schade', async () => {
      const id = await maakItem();
      await alsLid('post', `/${id}/damage`).send({ description: 'Kras', severity: 'minor' });

      // Hier ging het mis: item.status kwam niet uit de query, dus deze kolom
      // werd leeggemaakt bij elke melding die niet 'unusable' was.
      expect(itemRij(id).status).toBe('available');
    });

    it('laat de stand van een uitgeleend item staan', async () => {
      const id = await maakItem();
      await alsBeheerder('post', '/loans').send({ equipmentId: id, userId: lid.id });
      await alsLid('post', `/${id}/damage`).send({ description: 'Deuk', severity: 'moderate' });

      expect(itemRij(id)).toMatchObject({ status: 'in_use', condition: 'poor' });
    });

    it('zet een onbruikbaar item op reparatie', async () => {
      const id = await maakItem();
      await alsLid('post', `/${id}/damage`).send({ description: 'Doorgebrand', severity: 'unusable' });

      expect(itemRij(id)).toMatchObject({ status: 'repair', condition: 'broken' });
    });

    it('toont de meldingen met de naam van de melder', async () => {
      const id = await maakItem();
      await alsLid('post', `/${id}/damage`).send({ description: 'Kras', severity: 'minor', repairCost: 50 });

      const antwoord = await alsLid('get', `/${id}/damage`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0]).toMatchObject({ description: 'Kras', severity: 'minor', repairCost: 50 });
      expect(antwoord.body[0].reportedBy).toBe(lid.id);
    });

    it('weigert een melding zonder beschrijving', async () => {
      const id = await maakItem();
      expect((await alsLid('post', `/${id}/damage`).send({ severity: 'minor' })).status).toBe(400);
    });

    it('meldt geen schade op een item van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const antwoord = await alsLid('post', `/${vreemdItem(andere.id)}/damage`).send({
        description: 'Kras',
        severity: 'minor',
      });
      expect(antwoord.status).toBe(404);
    });

    it('zet het item weer op beschikbaar zodra de schade is hersteld', async () => {
      const id = await maakItem();
      const melding = await alsLid('post', `/${id}/damage`).send({ description: 'Doorgebrand', severity: 'unusable' });

      const antwoord = await alsBeheerder('patch', `/${id}/damage/${melding.body.id}`).send({
        repairedAt: '2026-06-01',
        repairCost: 200,
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(itemRij(id)).toMatchObject({ status: 'available', condition: 'good' });
    });

    it('geeft 404 voor een melding die niet bij dit item hoort', async () => {
      const id = await maakItem();
      const ander = await maakItem({ name: 'Ander item' });
      const melding = await alsLid('post', `/${ander}/damage`).send({ description: 'Kras', severity: 'minor' });

      expect((await alsBeheerder('patch', `/${id}/damage/${melding.body.id}`).send({ repairCost: 1 })).status).toBe(
        404,
      );
    });

    it('verwijdert een melding', async () => {
      const id = await maakItem();
      const melding = await alsLid('post', `/${id}/damage`).send({ description: 'Kras', severity: 'minor' });

      expect((await alsBeheerder('delete', `/${id}/damage/${melding.body.id}`)).status).toBe(200);
      expect((await alsLid('get', `/${id}/damage`)).body).toEqual([]);
    });

    it('laat verwijderen alleen aan een beheerder over', async () => {
      const id = await maakItem();
      const melding = await alsLid('post', `/${id}/damage`).send({ description: 'Kras', severity: 'minor' });

      expect((await alsLid('delete', `/${id}/damage/${melding.body.id}`)).status).toBe(403);
    });
  });

  describe('cijfers', () => {
    it('telt de items, de uitleningen en de waarde', async () => {
      const id = await maakItem({ currentValue: 800 });
      await maakItem({ name: 'Statief', currentValue: 200 });
      await alsBeheerder('post', '/loans').send({ equipmentId: id, userId: lid.id });

      const antwoord = await alsBeheerder('get', '/stats');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toMatchObject({ totalItems: 2, activeLoans: 1, totalValue: 1000 });
    });

    it('rekent afgevoerde spullen niet mee in de waarde', async () => {
      await maakItem({ currentValue: 800 });
      await maakItem({ name: 'Oud', currentValue: 500, status: 'retired' });

      const antwoord = await alsBeheerder('get', '/stats');
      expect(antwoord.body.totalValue).toBe(800);
    });

    it('houdt de cijfers bij de eigen vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      vreemdItem(andere.id);

      const antwoord = await alsBeheerder('get', '/stats');
      expect(antwoord.body).toMatchObject({ totalItems: 0, totalValue: 0 });
    });

    it('houdt een gewoon lid bij de cijfers weg', async () => {
      expect((await alsLid('get', '/stats')).status).toBe(403);
    });
  });

  it('vraagt overal om een geldige aanmelding', async () => {
    expect(vereniging.id).toBeTruthy();
    expect((await request(app).get('/api/equipment')).status).toBe(401);
    expect((await request(app).get('/api/equipment/categories')).status).toBe(401);
  });
});
