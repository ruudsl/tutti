/**
 * De uniformenkast van de vereniging.
 *
 * Dit ging over 929 regels zonder een enkele test. Wat hier fout kan gaan is
 * niet ingewikkeld maar wel vervelend: een jas van een andere vereniging die
 * zichtbaar wordt, een jas die twee keer wordt uitgegeven, of een jas die na
 * inleveren op naam van het vorige lid blijft staan. Daar gaan de meeste
 * tests over.
 *
 * De wijzigingsroute stond bovendien op dezelfde bodem als die van het
 * instrumentenbezit: elk veld dat het verzoek niet noemt kwam als `undefined`
 * bij COALESCE(?, kolom) terecht, en sql.js weigert dat. Zie
 * database/connection.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import uniformsRoutes from '../../routes/uniforms';
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
app.use('/api/uniforms', uniformsRoutes);
app.use(errorHandler);

describe('uniformen', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let lid: TestUser;
  let beheerderToken: string;
  let lidToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    lid = omgeving.memberUser;
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;
  });

  type Methode = 'get' | 'post' | 'put' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/uniforms${pad}`).set('Authorization', `Bearer ${token}`);
  const alsBeheerder = (methode: Methode, pad: string) => als(beheerderToken, methode, pad);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  function maakOnderdeel(overrides: Record<string, unknown> = {}): string {
    const id = uuidv4();
    const w = {
      association_id: vereniging.id,
      item_type: 'jacket',
      size_standard: '52',
      color: 'blauw',
      condition: 'good',
      status: 'available',
      current_user_id: null as string | null,
      ...overrides,
    };
    db.prepare(
      `INSERT INTO uniform_items (id, association_id, item_type, size_standard, color, condition, status, current_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, w.association_id, w.item_type, w.size_standard, w.color, w.condition, w.status, w.current_user_id);
    return id;
  }

  function onderdeel(id: string): { status: string; current_user_id: string | null; condition: string } {
    return db.prepare('SELECT status, current_user_id, condition FROM uniform_items WHERE id = ?').get(id) as {
      status: string;
      current_user_id: string | null;
      condition: string;
    };
  }

  async function geefUit(itemId: string, userId = lid.id): Promise<void> {
    const antwoord = await alsBeheerder('post', `/items/${itemId}/assign`).send({
      userId,
      assignedDate: '2026-01-10',
      conditionAtAssignment: 'good',
    });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
  }

  describe('soorten onderdelen', () => {
    it('geeft de lijst met soorten terug', async () => {
      const antwoord = await alsLid('get', '/item-types');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.map((t: { value: string }) => t.value)).toContain('jacket');
    });

    it('vraagt om een geldige aanmelding', async () => {
      expect((await request(app).get('/api/uniforms/item-types')).status).toBe(401);
    });
  });

  describe('overzicht', () => {
    it('toont de onderdelen van de eigen vereniging', async () => {
      maakOnderdeel({ item_type: 'jacket' });
      maakOnderdeel({ item_type: 'pants' });

      const antwoord = await alsLid('get', '/items');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.data).toHaveLength(2);
      expect(antwoord.body.pagination.total).toBe(2);
    });

    it('laat de onderdelen van een andere vereniging weg', async () => {
      maakOnderdeel({ item_type: 'jacket' });
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      maakOnderdeel({ association_id: andere.id, item_type: 'hat' });

      const antwoord = await alsLid('get', '/items');
      expect(antwoord.body.data.map((i: { itemType: string }) => i.itemType)).toEqual(['jacket']);
    });

    it('filtert op soort', async () => {
      maakOnderdeel({ item_type: 'jacket' });
      maakOnderdeel({ item_type: 'pants' });

      const antwoord = await alsLid('get', '/items?itemType=pants');
      expect(antwoord.body.data).toHaveLength(1);
      expect(antwoord.body.data[0].itemType).toBe('pants');
    });

    it('filtert op status', async () => {
      maakOnderdeel({ status: 'available' });
      maakOnderdeel({ status: 'in_repair' });

      const antwoord = await alsLid('get', '/items?status=in_repair');
      expect(antwoord.body.data).toHaveLength(1);
      expect(antwoord.body.data[0].status).toBe('in_repair');
    });

    it('filtert op maat', async () => {
      maakOnderdeel({ size_standard: '50' });
      maakOnderdeel({ size_standard: '54' });

      const antwoord = await alsLid('get', '/items?size=54');
      expect(antwoord.body.data).toHaveLength(1);
      expect(antwoord.body.data[0].sizeStandard).toBe('54');
    });

    it('zoekt in kleur en notities', async () => {
      maakOnderdeel({ color: 'donkerblauw' });
      maakOnderdeel({ color: 'rood' });

      const antwoord = await alsLid('get', '/items?search=blauw');
      expect(antwoord.body.data).toHaveLength(1);
      expect(antwoord.body.data[0].color).toBe('donkerblauw');
    });

    it('noemt de drager van een uitgegeven onderdeel', async () => {
      const id = maakOnderdeel();
      await geefUit(id);

      const antwoord = await alsLid('get', '/items');
      expect(antwoord.body.data[0].currentUser).toMatchObject({ id: lid.id, email: lid.email });
    });
  });

  describe('zoeken op maat', () => {
    it('vraagt om een maat', async () => {
      const antwoord = await alsLid('get', '/size-search');
      expect(antwoord.status).toBe(400);
    });

    it('geeft alleen beschikbare onderdelen in die maat', async () => {
      maakOnderdeel({ size_standard: '52', status: 'available' });
      maakOnderdeel({ size_standard: '52', status: 'issued' });
      maakOnderdeel({ size_standard: '48', status: 'available' });

      const antwoord = await alsLid('get', '/size-search?size=52');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toHaveLength(1);
    });

    it('telt de beschikbare onderdelen per maat', async () => {
      maakOnderdeel({ item_type: 'jacket', size_standard: '52' });
      maakOnderdeel({ item_type: 'jacket', size_standard: '52' });
      maakOnderdeel({ item_type: 'jacket', size_standard: '48' });

      const antwoord = await alsLid('get', '/available-by-size?itemType=jacket');
      expect(antwoord.status).toBe(200);
      const perMaat = Object.fromEntries(
        antwoord.body.map((r: { sizeStandard: string; count: number }) => [r.sizeStandard, r.count]),
      );
      expect(perMaat).toMatchObject({ '52': 2, '48': 1 });
    });
  });

  describe('een onderdeel opvragen', () => {
    it('geeft het onderdeel met zijn uitgiftegeschiedenis', async () => {
      const id = maakOnderdeel();
      await geefUit(id);

      const antwoord = await alsLid('get', `/items/${id}`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.assignmentHistory).toHaveLength(1);
      expect(antwoord.body.assignmentHistory[0].user.id).toBe(lid.id);
    });

    it('geeft 404 voor een onderdeel van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = maakOnderdeel({ association_id: andere.id });

      expect((await alsLid('get', `/items/${vreemd}`)).status).toBe(404);
    });
  });

  describe('toevoegen en wijzigen', () => {
    it('voegt een onderdeel toe', async () => {
      const antwoord = await alsBeheerder('post', '/items').send({
        itemType: 'jacket',
        sizeStandard: '52',
        color: 'blauw',
      });

      expect(antwoord.status).toBe(201);
      expect(onderdeel(antwoord.body.id)).toMatchObject({ status: 'available', condition: 'good' });
    });

    it('houdt een gewoon lid van het toevoegen af', async () => {
      const antwoord = await alsLid('post', '/items').send({ itemType: 'jacket' });
      expect(antwoord.status).toBe(403);
    });

    it('weigert een onderdeel zonder soort', async () => {
      expect((await alsBeheerder('post', '/items').send({ sizeStandard: '52' })).status).toBe(400);
    });

    it('weigert een toestand die niet bestaat', async () => {
      const antwoord = await alsBeheerder('post', '/items').send({ itemType: 'jacket', condition: 'prima' });
      expect(antwoord.status).toBe(400);
    });

    it('maakt er in een keer meerdere aan', async () => {
      const antwoord = await alsBeheerder('post', '/items/bulk').send({
        count: 5,
        itemType: 'pants',
        sizeStandard: '50',
      });

      expect(antwoord.status).toBe(201);
      expect(antwoord.body.count).toBe(5);
      expect(antwoord.body.ids).toHaveLength(5);

      const aantal = db
        .prepare("SELECT COUNT(*) AS n FROM uniform_items WHERE association_id = ? AND item_type = 'pants'")
        .get(vereniging.id) as { n: number };
      expect(aantal.n).toBe(5);
    });

    it('maakt er hooguit honderd tegelijk aan', async () => {
      const antwoord = await alsBeheerder('post', '/items/bulk').send({ count: 500, itemType: 'tie' });
      expect(antwoord.body.count).toBe(100);
    });

    it('werkt een onderdeel bij zonder de rest van de velden mee te sturen', async () => {
      const id = maakOnderdeel({ color: 'blauw', size_standard: '52' });

      const antwoord = await alsBeheerder('put', `/items/${id}`).send({ condition: 'poor' });

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      const rij = db.prepare('SELECT color, size_standard, condition FROM uniform_items WHERE id = ?').get(id) as {
        color: string;
        size_standard: string;
        condition: string;
      };
      expect(rij).toMatchObject({ color: 'blauw', size_standard: '52', condition: 'poor' });
    });

    it('weigert een onderdeel van een andere vereniging bij te werken', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = maakOnderdeel({ association_id: andere.id, color: 'groen' });

      expect((await alsBeheerder('put', `/items/${vreemd}`).send({ color: 'gekaapt' })).status).toBe(404);
      expect((db.prepare('SELECT color FROM uniform_items WHERE id = ?').get(vreemd) as { color: string }).color).toBe(
        'groen',
      );
    });

    it('verwijdert een onderdeel', async () => {
      const id = maakOnderdeel();
      expect((await alsBeheerder('delete', `/items/${id}`)).status).toBe(200);
      expect(db.prepare('SELECT id FROM uniform_items WHERE id = ?').get(id)).toBeUndefined();
    });

    it('verwijdert geen onderdeel van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = maakOnderdeel({ association_id: andere.id });

      expect((await alsBeheerder('delete', `/items/${vreemd}`)).status).toBe(404);
      expect(db.prepare('SELECT id FROM uniform_items WHERE id = ?').get(vreemd)).toBeDefined();
    });

    it('laat verwijderen alleen aan een beheerder over', async () => {
      const id = maakOnderdeel();
      expect((await alsLid('delete', `/items/${id}`)).status).toBe(403);
    });
  });

  describe('uitgeven', () => {
    it('geeft een onderdeel uit en zet het op naam', async () => {
      const id = maakOnderdeel();
      await geefUit(id);

      expect(onderdeel(id)).toMatchObject({ status: 'issued', current_user_id: lid.id });
    });

    it('geeft hetzelfde onderdeel niet twee keer uit', async () => {
      const id = maakOnderdeel();
      await geefUit(id);

      const tweede = await alsBeheerder('post', `/items/${id}/assign`).send({
        userId: beheerder.id,
        assignedDate: '2026-02-01',
      });

      expect(tweede.status).toBe(400);
      expect(onderdeel(id).current_user_id).toBe(lid.id);
    });

    it('geeft een onderdeel in reparatie niet uit', async () => {
      const id = maakOnderdeel({ status: 'in_repair' });

      const antwoord = await alsBeheerder('post', `/items/${id}/assign`).send({
        userId: lid.id,
        assignedDate: '2026-02-01',
      });

      expect(antwoord.status).toBe(400);
    });

    it('geeft een afgeschreven onderdeel niet uit', async () => {
      const id = maakOnderdeel({ status: 'written_off' });

      const antwoord = await alsBeheerder('post', `/items/${id}/assign`).send({
        userId: lid.id,
        assignedDate: '2026-02-01',
      });

      expect(antwoord.status).toBe(400);
    });

    it('geeft geen onderdeel van een andere vereniging uit', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = maakOnderdeel({ association_id: andere.id });

      const antwoord = await alsBeheerder('post', `/items/${vreemd}/assign`).send({
        userId: lid.id,
        assignedDate: '2026-02-01',
      });

      expect(antwoord.status).toBe(404);
      expect(onderdeel(vreemd).status).toBe('available');
    });

    it('vraagt om een datum', async () => {
      const id = maakOnderdeel();
      expect((await alsBeheerder('post', `/items/${id}/assign`).send({ userId: lid.id })).status).toBe(400);
    });

    it('laat uitgeven niet aan een gewoon lid over', async () => {
      const id = maakOnderdeel();
      const antwoord = await alsLid('post', `/items/${id}/assign`).send({
        userId: lid.id,
        assignedDate: '2026-02-01',
      });
      expect(antwoord.status).toBe(403);
    });
  });

  describe('innemen', () => {
    it('maakt het onderdeel weer vrij', async () => {
      const id = maakOnderdeel();
      await geefUit(id);

      const antwoord = await alsBeheerder('post', `/items/${id}/return`).send({ returnedDate: '2026-06-01' });

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(onderdeel(id)).toMatchObject({ status: 'available', current_user_id: null });
    });

    it('neemt de toestand bij inleveren over', async () => {
      const id = maakOnderdeel({ condition: 'good' });
      await geefUit(id);

      await alsBeheerder('post', `/items/${id}/return`).send({
        returnedDate: '2026-06-01',
        conditionAtReturn: 'poor',
      });

      expect(onderdeel(id).condition).toBe('poor');
    });

    it('noteert de retourdatum bij de uitgifte', async () => {
      const id = maakOnderdeel();
      await geefUit(id);
      await alsBeheerder('post', `/items/${id}/return`).send({ returnedDate: '2026-06-01' });

      const rij = db.prepare('SELECT returned_date FROM uniform_assignments WHERE uniform_item_id = ?').get(id) as {
        returned_date: string;
      };
      expect(rij.returned_date).toBe('2026-06-01');
    });

    it('kan niet twee keer worden ingenomen', async () => {
      const id = maakOnderdeel();
      await geefUit(id);
      await alsBeheerder('post', `/items/${id}/return`).send({ returnedDate: '2026-06-01' });

      const tweede = await alsBeheerder('post', `/items/${id}/return`).send({ returnedDate: '2026-06-02' });
      expect(tweede.status).toBe(404);
    });

    it('neemt geen onderdeel van een andere vereniging in', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, {
        email: `uniform-${uuidv4()}@test.nl`,
        role: 'admin',
      });
      const id = maakOnderdeel();
      await geefUit(id);

      const antwoord = await request(app)
        .post(`/api/uniforms/items/${id}/return`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`)
        .send({ returnedDate: '2026-06-01' });

      expect(antwoord.status).toBe(404);
      expect(onderdeel(id).status).toBe('issued');
    });
  });

  describe('sets', () => {
    it('maakt een set met eisen aan', async () => {
      const antwoord = await alsBeheerder('post', '/sets').send({
        name: 'Concertuniform',
        description: 'Voor concerten',
        requirements: [
          { itemType: 'jacket', quantity: 1 },
          { itemType: 'pants', quantity: 1 },
        ],
      });

      expect(antwoord.status).toBe(201);

      const set = await alsLid('get', `/sets/${antwoord.body.id}`);
      expect(set.status).toBe(200);
      expect(set.body.name).toBe('Concertuniform');
      expect(set.body.requirements).toHaveLength(2);
    });

    it('weigert een set zonder naam', async () => {
      expect((await alsBeheerder('post', '/sets').send({ description: 'leeg' })).status).toBe(400);
    });

    it('toont alleen de sets van de eigen vereniging', async () => {
      await alsBeheerder('post', '/sets').send({ name: 'Eigen set' });
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      db.prepare('INSERT INTO uniform_sets (id, association_id, name) VALUES (?, ?, ?)').run(
        uuidv4(),
        andere.id,
        'Set van de buren',
      );

      const antwoord = await alsLid('get', '/sets');
      expect(antwoord.body.map((s: { name: string }) => s.name)).toEqual(['Eigen set']);
    });

    it('vervangt de eisen bij het bijwerken', async () => {
      const gemaakt = await alsBeheerder('post', '/sets').send({
        name: 'Set',
        requirements: [{ itemType: 'jacket', quantity: 1 }],
      });

      const bijgewerkt = await alsBeheerder('put', `/sets/${gemaakt.body.id}`).send({
        requirements: [{ itemType: 'tie', quantity: 2 }],
      });
      expect(bijgewerkt.status, JSON.stringify(bijgewerkt.body)).toBe(200);

      const set = await alsLid('get', `/sets/${gemaakt.body.id}`);
      expect(set.body.requirements).toEqual([expect.objectContaining({ itemType: 'tie', quantity: 2 })]);
      expect(set.body.name).toBe('Set');
    });

    it('weigert een set van een andere vereniging bij te werken', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdeSet = uuidv4();
      db.prepare('INSERT INTO uniform_sets (id, association_id, name) VALUES (?, ?, ?)').run(
        vreemdeSet,
        andere.id,
        'Van de buren',
      );

      expect((await alsBeheerder('put', `/sets/${vreemdeSet}`).send({ name: 'Gekaapt' })).status).toBe(404);
    });

    it('verwijdert een set', async () => {
      const gemaakt = await alsBeheerder('post', '/sets').send({ name: 'Weg hiermee' });
      expect((await alsBeheerder('delete', `/sets/${gemaakt.body.id}`)).status).toBe(200);
      expect((await alsLid('get', `/sets/${gemaakt.body.id}`)).status).toBe(404);
    });

    it('geeft 404 voor een set die niet bestaat', async () => {
      expect((await alsLid('get', `/sets/${uuidv4()}`)).status).toBe(404);
    });
  });

  describe('per lid', () => {
    it('toont wat een lid in bezit heeft', async () => {
      const jas = maakOnderdeel({ item_type: 'jacket' });
      const broek = maakOnderdeel({ item_type: 'pants' });
      maakOnderdeel({ item_type: 'hat' });
      await geefUit(jas);
      await geefUit(broek);

      const antwoord = await alsLid('get', `/user/${lid.id}`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.map((i: { itemType: string }) => i.itemType).sort()).toEqual(['jacket', 'pants']);
    });

    it('toont niets van een lid van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdLid = createTestUser(andere.id, { email: `vreemd-${uuidv4()}@test.nl` });
      const vreemdItem = maakOnderdeel({ association_id: andere.id, current_user_id: vreemdLid.id, status: 'issued' });
      expect(vreemdItem).toBeTruthy();

      const antwoord = await alsLid('get', `/user/${vreemdLid.id}`);
      expect(antwoord.body).toEqual([]);
    });
  });
});
