/**
 * De stamgegevens van de boekhouding: grootboekrekeningen,
 * contributiecategorieen, kostenplaatsen en relaties.
 *
 * accounting.test.ts dekt van deze vier het aanmaken en het lezen.
 * Wat daar niet in zat is de hele bewerk- en verwijderkant, en juist daar
 * bleek het patroon dat dit bestand zelf op meerdere plekken beschrijft niet
 * consequent doorgevoerd: een id uit de aanvraag wordt bij POST wel op de
 * eigen vereniging gecontroleerd en bij PUT niet. Wie zoiets wil misbruiken
 * maakt de rij eerst schoon aan en verzet hem daarna.
 *
 * Drie van die gaten zitten hieronder, elk met de reparatie ernaast.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import accountingRoutes from '../../routes/accounting';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestUser,
  createTestOrchestra,
  generateTestToken,
  createTestEnvironment,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/accounting', accountingRoutes);
app.use(errorHandler);

let adminToken: string;
let memberToken: string;
let verenigingA: string;

let tokenB: string;
let verenigingB: string;

beforeEach(() => {
  const a = createTestEnvironment();
  adminToken = a.adminToken;
  memberToken = a.memberToken;
  verenigingA = a.association.id;

  const b = createTestAssociation();
  verenigingB = b.id;
  tokenB = generateTestToken(createTestUser(b.id, { email: 'admin-b@test.com', role: 'admin' }));
});

const alsAdmin = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/accounting${pad}`).set('Authorization', `Bearer ${adminToken}`);

const alsLid = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/accounting${pad}`).set('Authorization', `Bearer ${memberToken}`);

const alsB = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/accounting${pad}`).set('Authorization', `Bearer ${tokenB}`);

/** Een eigen rekening: niet is_system, dus wel te bewerken en te verwijderen. */
async function maakRekening(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/accounts').send({
    code: '4950',
    name: 'Eigen kostenpost',
    accountType: 'expense',
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function rekeningVoor(token: string, code: string) {
  const res = await request(app).get('/api/accounting/accounts').set('Authorization', `Bearer ${token}`);
  const rekening = res.body.find((r: { code: string }) => r.code === code);
  expect(rekening, `rekening ${code} ontbreekt`).toBeTruthy();
  return rekening.id as string;
}

async function haalRekening(id: string) {
  const res = await alsAdmin('get', '/accounts');
  return res.body.find((r: { id: string }) => r.id === id);
}

// =====================================================
// REKENINGSCHEMA
// =====================================================

describe('Het standaard rekeningschema klaarzetten', () => {
  it('zet drieentwintig systeemrekeningen klaar', async () => {
    const res = await alsAdmin('post', '/accounts/initialize');
    expect(res.status).toBe(201);
    expect(res.body.count).toBe(23);

    const rekeningen = (await alsAdmin('get', '/accounts')).body;
    expect(rekeningen).toHaveLength(23);
    // Alles wat het schema zelf neerzet is een systeemrekening; dat is precies
    // wat de bewerk- en verwijdergrendels hieronder tegenhoudt.
    expect(rekeningen.every((r: { isSystem: boolean }) => r.isSystem)).toBe(true);
  });

  it('geeft elke rekening een beginsaldo van nul', async () => {
    await alsAdmin('post', '/accounts/initialize');
    const rekeningen = (await alsAdmin('get', '/accounts')).body;
    expect(rekeningen.every((r: { openingBalance: number }) => r.openingBalance === 0)).toBe(true);
  });

  it('laat een gewoon lid het schema niet klaarzetten', async () => {
    const res = await alsLid('post', '/accounts/initialize');
    expect(res.status).toBe(403);
    expect((await alsAdmin('get', '/accounts')).body).toEqual([]);
  });

  it('houdt het schema van twee verenigingen uit elkaar', async () => {
    await alsAdmin('post', '/accounts/initialize');
    // Dat A al een schema heeft mag B niet in de weg zitten: de telling gaat
    // per vereniging.
    const res = await alsB('post', '/accounts/initialize');
    expect(res.status).toBe(201);
    expect((await alsB('get', '/accounts')).body).toHaveLength(23);
  });
});

describe('Een rekening aanmaken', () => {
  it('weigert een dubbele rekeningcode', async () => {
    await maakRekening();
    const res = await alsAdmin('post', '/accounts').send({
      code: '4950',
      name: 'Nog een kostenpost',
      accountType: 'expense',
    });
    expect(res.status).toBe(409);
  });

  it('laat dezelfde code bij twee verenigingen naast elkaar bestaan', async () => {
    await maakRekening();
    const res = await alsB('post', '/accounts').send({
      code: '4950',
      name: 'Kostenpost van B',
      accountType: 'expense',
    });
    expect(res.status).toBe(201);
  });

  it('neemt een beginsaldo over in zowel begin- als huidig saldo', async () => {
    const id = await maakRekening({ code: '1150', accountType: 'asset', openingBalance: 1234.56 });
    const rekening = await haalRekening(id);
    expect(rekening.openingBalance).toBe(1234.56);
    expect(rekening.currentBalance).toBe(1234.56);
  });

  it('zet een ontbrekend beginsaldo op nul en niet op null', async () => {
    const id = await maakRekening({ code: '1160', accountType: 'asset' });
    const rekening = await haalRekening(id);
    expect(rekening.openingBalance).toBe(0);
    expect(rekening.currentBalance).toBe(0);
  });

  it('weigert een lege rekeningcode', async () => {
    const res = await alsAdmin('post', '/accounts').send({ code: '', name: 'Naamloos', accountType: 'expense' });
    expect(res.status).toBe(400);
  });

  it('weigert een onbekend subtype', async () => {
    const res = await alsAdmin('post', '/accounts').send({
      code: '4951',
      name: 'Kostenpost',
      accountType: 'expense',
      accountSubtype: 'gokkast',
    });
    expect(res.status).toBe(400);
  });

  it('toont de moederrekening met naam en code zodra er een gekoppeld is', async () => {
    const moeder = await maakRekening({ code: '4900', name: 'Overige kosten' });
    const kind = await maakRekening({ code: '4901', name: 'Bankkosten', parentId: moeder });

    const rekening = await haalRekening(kind);
    expect(rekening.parentId).toBe(moeder);
    expect(rekening.parentName).toBe('Overige kosten');
    expect(rekening.parentCode).toBe('4900');
  });
});

describe('Een rekening bewerken', () => {
  it('meldt netjes dat een onbekende rekening niet bestaat', async () => {
    const res = await alsAdmin('put', `/accounts/${uuidv4()}`).send({ name: 'Anders' });
    expect(res.status).toBe(404);
  });

  it('laat een systeemrekening niet bewerken', async () => {
    await alsAdmin('post', '/accounts/initialize');
    const bank = await rekeningVoor(adminToken, '1100');

    const res = await alsAdmin('put', `/accounts/${bank}`).send({ name: 'Mijn eigen bank' });
    expect(res.status).toBe(400);
    expect((await haalRekening(bank)).name).toBe('Bank');
  });

  it('werkt naam, soort en omschrijving bij', async () => {
    const id = await maakRekening();

    const res = await alsAdmin('put', `/accounts/${id}`).send({
      name: 'Hernoemde kostenpost',
      accountSubtype: 'materials',
      description: 'Toelichting',
    });
    expect(res.status).toBe(200);

    const rekening = await haalRekening(id);
    expect(rekening.name).toBe('Hernoemde kostenpost');
    expect(rekening.accountSubtype).toBe('materials');
    expect(rekening.description).toBe('Toelichting');
    // Niet meegestuurde velden blijven staan.
    expect(rekening.code).toBe('4950');
  });

  it('weigert een code die al bij een andere rekening hoort', async () => {
    await maakRekening({ code: '4950' });
    const tweede = await maakRekening({ code: '4960', name: 'Tweede' });

    const res = await alsAdmin('put', `/accounts/${tweede}`).send({ code: '4950' });
    expect(res.status).toBe(409);
    expect((await haalRekening(tweede)).code).toBe('4960');
  });

  it('staat het toe de eigen code opnieuw op te sturen', async () => {
    const id = await maakRekening({ code: '4950' });
    const res = await alsAdmin('put', `/accounts/${id}`).send({ code: '4950', name: 'Zelfde code' });
    expect(res.status).toBe(200);
  });

  it('laat een gewoon lid geen rekening bewerken', async () => {
    const id = await maakRekening();
    const res = await alsLid('put', `/accounts/${id}`).send({ name: 'Gekaapt' });
    expect(res.status).toBe(403);
    expect((await haalRekening(id)).name).toBe('Eigen kostenpost');
  });

  it('bewerkt geen rekening van een andere vereniging', async () => {
    await alsB('post', '/accounts/initialize');
    const rekeningVanB = await rekeningVoor(tokenB, '4900');

    const res = await alsAdmin('put', `/accounts/${rekeningVanB}`).send({ name: 'Overgenomen' });
    expect(res.status).toBe(404);
  });

  /**
   * BEWIJS - dit was een echte fout, en de test is rood op de oude code.
   *
   * POST /accounts riep eisEigenId aan op parentId, PUT /accounts/:id niet.
   * Een beheerder van A maakte zijn rekening dus eerst zonder moeder aan en
   * hing hem er daarna alsnog onder: de UPDATE zette parent_id gewoon door.
   * GET /accounts doet een LEFT JOIN op de moederrekening en geeft parentName
   * en parentCode terug, dus het rekeningschema van B lekte er regel voor
   * regel uit.
   *
   * Aangetoond door src/routes/accounting.ts even op HEAD te zetten (alleen
   * dat bestand) en deze reeks te draaien: zonder de reparatie geeft de PUT
   * 200 en staat parentName op 'Overige kosten' van vereniging B.
   */
  it('hangt een bestaande rekening niet alsnog onder een moederrekening van een andere vereniging', async () => {
    await alsB('post', '/accounts/initialize');
    const moederVanB = await rekeningVoor(tokenB, '4900');
    const eigenRekening = await maakRekening();

    const res = await alsAdmin('put', `/accounts/${eigenRekening}`).send({ parentId: moederVanB });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('moederrekening');

    // En de koppeling is ook echt niet gelegd.
    const rekening = await haalRekening(eigenRekening);
    expect(rekening.parentId).toBeNull();
    expect(rekening.parentName).toBeNull();
  });

  it('hangt een rekening wel onder een eigen moederrekening', async () => {
    const moeder = await maakRekening({ code: '4900', name: 'Overige kosten' });
    const kind = await maakRekening();

    const res = await alsAdmin('put', `/accounts/${kind}`).send({ parentId: moeder });
    expect(res.status).toBe(200);
    expect((await haalRekening(kind)).parentName).toBe('Overige kosten');
  });

  it('haalt een moederrekening ook weer los', async () => {
    const moeder = await maakRekening({ code: '4900', name: 'Overige kosten' });
    const kind = await maakRekening({ code: '4901', parentId: moeder });

    // null is leeg en niet een id, dus eisEigenId laat het door.
    const res = await alsAdmin('put', `/accounts/${kind}`).send({ parentId: null });
    expect(res.status).toBe(200);
    expect((await haalRekening(kind)).parentId).toBeNull();
  });
});

describe('Een rekening verwijderen', () => {
  it('meldt netjes dat een onbekende rekening niet bestaat', async () => {
    const res = await alsAdmin('delete', `/accounts/${uuidv4()}`);
    expect(res.status).toBe(404);
  });

  it('verwijdert een eigen rekening', async () => {
    const id = await maakRekening();
    expect((await alsAdmin('delete', `/accounts/${id}`)).status).toBe(200);
    expect(await haalRekening(id)).toBeUndefined();
  });

  it('laat een systeemrekening niet verwijderen', async () => {
    await alsAdmin('post', '/accounts/initialize');
    const kas = await rekeningVoor(adminToken, '1000');

    expect((await alsAdmin('delete', `/accounts/${kas}`)).status).toBe(400);
    expect(await haalRekening(kas)).toBeTruthy();
  });

  it('laat een rekening met boekingen erop staan', async () => {
    await alsAdmin('post', '/fiscal-years').send({
      name: 'Boekjaar 2026',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      isCurrent: true,
    });
    const kosten = await maakRekening({ code: '4950', accountType: 'expense' });
    const bank = await maakRekening({ code: '1100', name: 'Bank', accountType: 'asset' });

    const boeking = await alsAdmin('post', '/transactions').send({
      transactionDate: '2026-03-01',
      transactionType: 'journal',
      description: 'Kosten',
      lines: [
        { accountId: kosten, debitAmount: 50 },
        { accountId: bank, creditAmount: 50 },
      ],
    });
    expect(boeking.status).toBe(201);

    const res = await alsAdmin('delete', `/accounts/${kosten}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('transacties');
    expect(await haalRekening(kosten)).toBeTruthy();
  });

  it('verwijdert geen rekening van een andere vereniging', async () => {
    await alsB('post', '/accounts/initialize');
    const rekeningVanB = await rekeningVoor(tokenB, '4900');

    expect((await alsAdmin('delete', `/accounts/${rekeningVanB}`)).status).toBe(404);
    expect((await alsB('get', '/accounts')).body).toHaveLength(23);
  });

  it('laat een gewoon lid geen rekening verwijderen', async () => {
    const id = await maakRekening();
    expect((await alsLid('delete', `/accounts/${id}`)).status).toBe(403);
    expect(await haalRekening(id)).toBeTruthy();
  });
});

// =====================================================
// CONTRIBUTIECATEGORIEEN
// =====================================================

async function maakCategorie(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/membership-fee-types').send({
    name: 'Senioren',
    amount: 120,
    frequency: 'yearly',
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function haalCategorie(id: string) {
  const res = await alsAdmin('get', '/membership-fee-types');
  return res.body.find((c: { id: string }) => c.id === id);
}

describe('Contributiecategorieen', () => {
  it('begint leeg', async () => {
    const res = await alsAdmin('get', '/membership-fee-types');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('maakt een categorie aan en geeft hem terug', async () => {
    const id = await maakCategorie({ description: 'Vanaf 18 jaar', ageMin: 18 });

    const categorie = await haalCategorie(id);
    expect(categorie).toMatchObject({
      name: 'Senioren',
      description: 'Vanaf 18 jaar',
      amount: 120,
      frequency: 'yearly',
      ageMin: 18,
      isDefault: false,
      isActive: true,
      activeCount: 0,
    });
  });

  it('staat een contributie van nul toe', async () => {
    // Een erelid betaalt niets; dat is geen fout maar een tarief.
    const id = await maakCategorie({ name: 'Ereleden', amount: 0 });
    expect((await haalCategorie(id)).amount).toBe(0);
  });

  it('weigert een negatieve contributie', async () => {
    const res = await alsAdmin('post', '/membership-fee-types').send({
      name: 'Terugbetalers',
      amount: -50,
      frequency: 'yearly',
    });
    expect(res.status).toBe(400);
  });

  it('weigert een onbekende frequentie', async () => {
    const res = await alsAdmin('post', '/membership-fee-types').send({
      name: 'Wekelijks',
      amount: 10,
      frequency: 'weekly',
    });
    expect(res.status).toBe(400);
  });

  it('weigert een categorie zonder naam', async () => {
    const res = await alsAdmin('post', '/membership-fee-types').send({ name: '', amount: 10, frequency: 'yearly' });
    expect(res.status).toBe(400);
  });

  it('houdt maar een categorie tegelijk als standaard', async () => {
    const eerste = await maakCategorie({ name: 'Senioren', isDefault: true });
    const tweede = await maakCategorie({ name: 'Junioren', amount: 60, isDefault: true });

    expect((await haalCategorie(eerste)).isDefault).toBe(false);
    expect((await haalCategorie(tweede)).isDefault).toBe(true);
  });

  it('raakt de standaardcategorie van een andere vereniging niet aan', async () => {
    const bijB = await request(app)
      .post('/api/accounting/membership-fee-types')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Standaard bij B', amount: 90, frequency: 'yearly', isDefault: true });
    expect(bijB.status).toBe(201);

    await maakCategorie({ name: 'Standaard bij A', isDefault: true });

    const bijBNa = (await alsB('get', '/membership-fee-types')).body.find(
      (c: { id: string }) => c.id === bijB.body.id,
    );
    expect(bijBNa.isDefault).toBe(true);
  });

  it('telt alleen de actieve lidmaatschappen mee', async () => {
    const id = await maakCategorie();
    const lidA = createTestUser(verenigingA, { email: 'lid-actief@test.com' }).id;
    const lidB = createTestUser(verenigingA, { email: 'lid-gestopt@test.com' }).id;

    const invoegen = db.prepare(
      'INSERT INTO memberships (id, user_id, fee_type_id, start_date, status) VALUES (?, ?, ?, ?, ?)',
    );
    invoegen.run(uuidv4(), lidA, id, '2026-01-01', 'active');
    invoegen.run(uuidv4(), lidB, id, '2026-01-01', 'cancelled');

    expect((await haalCategorie(id)).activeCount).toBe(1);
  });

  it('toont de gekoppelde opbrengstrekening met code en naam', async () => {
    await alsAdmin('post', '/accounts/initialize');
    const contributie = await rekeningVoor(adminToken, '8000');
    const id = await maakCategorie({ incomeAccountId: contributie });

    const categorie = await haalCategorie(id);
    expect(categorie.incomeAccountId).toBe(contributie);
    expect(categorie.incomeAccountCode).toBe('8000');
    expect(categorie.incomeAccountName).toBe('Contributie');
  });

  it('laat een gewoon lid er niet bij', async () => {
    expect((await alsLid('get', '/membership-fee-types')).status).toBe(403);
    expect((await alsLid('post', '/membership-fee-types')).status).toBe(403);
  });
});

describe('Een contributiecategorie bewerken', () => {
  it('meldt netjes dat een onbekende categorie niet bestaat', async () => {
    const res = await alsAdmin('put', `/membership-fee-types/${uuidv4()}`).send({ name: 'Anders' });
    expect(res.status).toBe(404);
  });

  it('werkt naam, bedrag en frequentie bij', async () => {
    const id = await maakCategorie();

    const res = await alsAdmin('put', `/membership-fee-types/${id}`).send({
      name: 'Senioren nieuw tarief',
      amount: 132.5,
      frequency: 'quarterly',
    });
    expect(res.status).toBe(200);

    const categorie = await haalCategorie(id);
    expect(categorie.name).toBe('Senioren nieuw tarief');
    expect(categorie.amount).toBe(132.5);
    expect(categorie.frequency).toBe('quarterly');
  });

  it('weigert een negatief bedrag ook bij het bewerken', async () => {
    const id = await maakCategorie();
    const res = await alsAdmin('put', `/membership-fee-types/${id}`).send({ amount: -1 });
    expect(res.status).toBe(400);
    expect((await haalCategorie(id)).amount).toBe(120);
  });

  it('haalt de leeftijdsgrenzen ook weer weg', async () => {
    const id = await maakCategorie({ ageMin: 18, ageMax: 65 });
    const res = await alsAdmin('put', `/membership-fee-types/${id}`).send({ ageMin: null, ageMax: null });
    expect(res.status).toBe(200);

    const categorie = await haalCategorie(id);
    expect(categorie.ageMin).toBeNull();
    expect(categorie.ageMax).toBeNull();
  });

  it('bewerkt geen categorie van een andere vereniging', async () => {
    const bijB = await request(app)
      .post('/api/accounting/membership-fee-types')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Van B', amount: 90, frequency: 'yearly' });

    const res = await alsAdmin('put', `/membership-fee-types/${bijB.body.id}`).send({ amount: 1 });
    expect(res.status).toBe(404);

    const naB = (await alsB('get', '/membership-fee-types')).body[0];
    expect(naB.amount).toBe(90);
  });

  /**
   * BEWIJS - dit was een echte fout, en de test is rood op de oude code.
   *
   * POST /membership-fee-types riep eisEigenId aan op incomeAccountId, de PUT
   * niet. De contributie van A wees na een wijziging dus naar een
   * opbrengstrekening van B, en GET /membership-fee-types geeft via een LEFT
   * JOIN incomeAccountCode en incomeAccountName van die rekening terug.
   *
   * Aangetoond door src/routes/accounting.ts even op HEAD te zetten (alleen
   * dat bestand) en deze reeks te draaien: zonder de reparatie geeft de PUT
   * 200 en staat incomeAccountName op 'Contributie' van vereniging B.
   */
  it('koppelt een bestaande categorie niet alsnog aan een opbrengstrekening van een andere vereniging', async () => {
    await alsB('post', '/accounts/initialize');
    const opbrengstVanB = await rekeningVoor(tokenB, '8000');
    const id = await maakCategorie();

    const res = await alsAdmin('put', `/membership-fee-types/${id}`).send({ incomeAccountId: opbrengstVanB });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('opbrengstrekening');

    const categorie = await haalCategorie(id);
    expect(categorie.incomeAccountId).toBeNull();
    expect(categorie.incomeAccountName).toBeNull();
  });

  it('koppelt een categorie wel aan een eigen opbrengstrekening', async () => {
    await alsAdmin('post', '/accounts/initialize');
    const donaties = await rekeningVoor(adminToken, '8100');
    const id = await maakCategorie();

    const res = await alsAdmin('put', `/membership-fee-types/${id}`).send({ incomeAccountId: donaties });
    expect(res.status).toBe(200);
    expect((await haalCategorie(id)).incomeAccountCode).toBe('8100');
  });
});

describe('Een contributiecategorie verwijderen', () => {
  it('meldt netjes dat een onbekende categorie niet bestaat', async () => {
    expect((await alsAdmin('delete', `/membership-fee-types/${uuidv4()}`)).status).toBe(404);
  });

  it('verwijdert een categorie zonder leden', async () => {
    const id = await maakCategorie();
    expect((await alsAdmin('delete', `/membership-fee-types/${id}`)).status).toBe(200);
    expect(await haalCategorie(id)).toBeUndefined();
  });

  it('laat een categorie met leden staan', async () => {
    const id = await maakCategorie();
    const lid = createTestUser(verenigingA, { email: 'lid-met-contributie@test.com' }).id;
    db.prepare('INSERT INTO memberships (id, user_id, fee_type_id, start_date, status) VALUES (?, ?, ?, ?, ?)').run(
      uuidv4(),
      lid,
      id,
      '2026-01-01',
      'active',
    );

    const res = await alsAdmin('delete', `/membership-fee-types/${id}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('leden');
    expect(await haalCategorie(id)).toBeTruthy();
  });

  it('laat ook een categorie met alleen opgezegde leden staan', async () => {
    // De grendel kijkt naar elk lidmaatschap en niet alleen naar de actieve:
    // de sleutelcontrole op memberships is ON DELETE RESTRICT, dus zou een
    // opgezegd lidmaatschap de DELETE alsnog op een 500 laten stranden.
    const id = await maakCategorie();
    const lid = createTestUser(verenigingA, { email: 'lid-opgezegd@test.com' }).id;
    db.prepare('INSERT INTO memberships (id, user_id, fee_type_id, start_date, status) VALUES (?, ?, ?, ?, ?)').run(
      uuidv4(),
      lid,
      id,
      '2026-01-01',
      'cancelled',
    );

    expect((await alsAdmin('delete', `/membership-fee-types/${id}`)).status).toBe(400);
  });

  it('verwijdert geen categorie van een andere vereniging', async () => {
    const bijB = await request(app)
      .post('/api/accounting/membership-fee-types')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Van B', amount: 90, frequency: 'yearly' });

    expect((await alsAdmin('delete', `/membership-fee-types/${bijB.body.id}`)).status).toBe(404);
    expect((await alsB('get', '/membership-fee-types')).body).toHaveLength(1);
  });
});

// =====================================================
// KOSTENPLAATSEN
// =====================================================

async function maakKostenplaats(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/cost-centers').send({
    code: 'KP-01',
    name: 'Concerten',
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('Een kostenplaats aanmaken en bewerken', () => {
  it('weigert een kostenplaats zonder code', async () => {
    const res = await alsAdmin('post', '/cost-centers').send({ name: 'Naamloos' });
    expect(res.status).toBe(400);
  });

  it('weigert een kostenplaats zonder naam', async () => {
    const res = await alsAdmin('post', '/cost-centers').send({ code: 'KP-99' });
    expect(res.status).toBe(400);
  });

  it('werkt code, naam en budget bij', async () => {
    const id = await maakKostenplaats({ budgetAmount: 500 });

    const res = await alsAdmin('put', `/cost-centers/${id}`).send({
      code: 'KP-02',
      name: 'Concertreeks',
      budgetAmount: 750.25,
    });
    expect(res.status).toBe(200);

    const kostenplaats = (await alsAdmin('get', `/cost-centers/${id}`)).body;
    expect(kostenplaats.code).toBe('KP-02');
    expect(kostenplaats.name).toBe('Concertreeks');
    expect(kostenplaats.budgetAmount).toBe(750.25);
  });

  it('zet een kostenplaats op inactief', async () => {
    const id = await maakKostenplaats();
    expect((await alsAdmin('get', `/cost-centers/${id}`)).body.isActive).toBe(true);

    const res = await alsAdmin('put', `/cost-centers/${id}`).send({ isActive: false });
    expect(res.status).toBe(200);
    expect((await alsAdmin('get', `/cost-centers/${id}`)).body.isActive).toBe(false);
  });

  it('toont de kostenplaatsen in het overzicht op code gesorteerd', async () => {
    const orkest = createTestOrchestra(verenigingA, { name: 'Harmonie' });
    await maakKostenplaats({ code: 'KP-02', name: 'Repetities', description: 'Wekelijks' });
    await maakKostenplaats({ code: 'KP-01', name: 'Concerten', orchestraId: orkest.id, budgetAmount: 250 });

    const res = await alsAdmin('get', '/cost-centers');
    expect(res.status).toBe(200);
    expect(res.body.map((cc: { code: string }) => cc.code)).toEqual(['KP-01', 'KP-02']);
    expect(res.body[0]).toMatchObject({
      code: 'KP-01',
      name: 'Concerten',
      orchestraId: orkest.id,
      orchestraName: 'Harmonie',
      budgetAmount: 250,
      isActive: true,
    });
    expect(res.body[1]).toMatchObject({ description: 'Wekelijks', orchestraId: null, orchestraName: null });
  });

  it('toont de kostenplaatsen van een andere vereniging niet', async () => {
    await maakKostenplaats();
    expect((await alsB('get', '/cost-centers')).body).toEqual([]);
  });

  it('werkt de omschrijving bij', async () => {
    const id = await maakKostenplaats();
    expect((await alsAdmin('put', `/cost-centers/${id}`).send({ description: 'Toelichting' })).status).toBe(200);
    expect((await alsAdmin('get', `/cost-centers/${id}`)).body.description).toBe('Toelichting');
  });

  it('meldt netjes dat een onbekende kostenplaats niet bestaat', async () => {
    expect((await alsAdmin('put', `/cost-centers/${uuidv4()}`).send({ name: 'X' })).status).toBe(404);
    expect((await alsAdmin('delete', `/cost-centers/${uuidv4()}`)).status).toBe(404);
  });

  it('bewerkt of verwijdert geen kostenplaats van een andere vereniging', async () => {
    const bijB = await request(app)
      .post('/api/accounting/cost-centers')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ code: 'KP-B', name: 'Van B' });
    expect(bijB.status).toBe(201);

    expect((await alsAdmin('put', `/cost-centers/${bijB.body.id}`).send({ name: 'Gekaapt' })).status).toBe(404);
    expect((await alsAdmin('delete', `/cost-centers/${bijB.body.id}`)).status).toBe(404);
    expect((await alsB('get', `/cost-centers/${bijB.body.id}`)).body.name).toBe('Van B');
  });

  it('verwijdert een eigen kostenplaats', async () => {
    const id = await maakKostenplaats();
    expect((await alsAdmin('delete', `/cost-centers/${id}`)).status).toBe(200);
    expect((await alsAdmin('get', `/cost-centers/${id}`)).status).toBe(404);
  });

  it('koppelt een kostenplaats aan een eigen orkest en toont de naam', async () => {
    const orkest = createTestOrchestra(verenigingA, { name: 'Harmonie' });
    const id = await maakKostenplaats({ orchestraId: orkest.id });

    const kostenplaats = (await alsAdmin('get', `/cost-centers/${id}`)).body;
    expect(kostenplaats.orchestraId).toBe(orkest.id);
    expect(kostenplaats.orchestraName).toBe('Harmonie');
  });

  /**
   * BEWIJS - dit was een echte fout, en beide tests hieronder zijn rood op de
   * oude code.
   *
   * cost_centers.orchestra_id had helemaal geen eigendomscontrole, niet bij
   * POST en niet bij PUT. GET /cost-centers doet een LEFT JOIN op orchestras
   * en geeft orchestraName terug, dus de beheerder van A las zo de namen van
   * de orkesten van B: hij hoefde alleen een kostenplaats aan te maken met een
   * orkest-id van B erin. Dat id is een uuid, maar het lekt onder meer via
   * gedeelde agenda's en concertpagina's.
   *
   * De reparatie is een nieuwe regel in EIGENDOMSCONTROLES plus een eisEigenId
   * in beide routes - hetzelfde patroon dat dit bestand al gebruikt voor
   * rekeningen, kostenplaatsen, leden en contacten.
   *
   * Aangetoond door src/routes/accounting.ts even op HEAD te zetten (alleen
   * dat bestand) en deze reeks te draaien: zonder de reparatie geven POST 201
   * en PUT 200, en staat orchestraName op 'Orkest van B'.
   */
  it('koppelt een nieuwe kostenplaats niet aan een orkest van een andere vereniging', async () => {
    const orkestVanB = createTestOrchestra(verenigingB, { name: 'Orkest van B' });

    const res = await alsAdmin('post', '/cost-centers').send({
      code: 'KP-01',
      name: 'Concerten',
      orchestraId: orkestVanB.id,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('orkest');
    expect((await alsAdmin('get', '/cost-centers')).body).toEqual([]);
  });

  it('verzet een bestaande kostenplaats niet naar een orkest van een andere vereniging', async () => {
    const orkestVanB = createTestOrchestra(verenigingB, { name: 'Orkest van B' });
    const id = await maakKostenplaats();

    const res = await alsAdmin('put', `/cost-centers/${id}`).send({ orchestraId: orkestVanB.id });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('orkest');

    const kostenplaats = (await alsAdmin('get', `/cost-centers/${id}`)).body;
    expect(kostenplaats.orchestraId).toBeNull();
    expect(kostenplaats.orchestraName).toBeNull();
  });

  it('haalt het orkest ook weer los', async () => {
    const orkest = createTestOrchestra(verenigingA, { name: 'Harmonie' });
    const id = await maakKostenplaats({ orchestraId: orkest.id });

    const res = await alsAdmin('put', `/cost-centers/${id}`).send({ orchestraId: null });
    expect(res.status).toBe(200);
    expect((await alsAdmin('get', `/cost-centers/${id}`)).body.orchestraId).toBeNull();
  });
});

// =====================================================
// RELATIES
// =====================================================

async function maakRelatie(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/relations').send({
    relationType: 'customer',
    name: 'Muziekhandel',
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('Het soort relatie', () => {
  it('neemt de drie soorten aan die het scherm aanbiedt', async () => {
    for (const [index, soort] of ['customer', 'supplier', 'both'].entries()) {
      const res = await alsAdmin('post', '/relations').send({ relationType: soort, name: `Relatie ${index}` });
      expect(res.status, soort).toBe(201);
      expect((await alsAdmin('get', `/relations/${res.body.id}`)).body.relationType).toBe(soort);
    }
  });

  /**
   * BEWIJS - dit was een echte fout, en beide tests hieronder zijn rood op de
   * oude code.
   *
   * accounting_relations.relation_type heeft een CHECK-beperking op
   * customer/supplier/both, maar POST en PUT namen relationType
   * ongecontroleerd over uit de aanvraag. Elke andere waarde liep stuk op die
   * beperking, en dat komt via de foutafhandeling als 500 naar buiten: een
   * fout van de aanvraag gemeld als een fout van de server. Dat is niet
   * theoretisch - de route heet in de code zelf "RELATIONS
   * (DEBTORS/CREDITORS)" en het scherm heet "Debiteuren/Crediteuren", dus
   * 'debtor' is precies wat een koppeling of een script hier stuurt.
   *
   * Aangetoond door src/routes/accounting.ts even op HEAD te zetten (alleen
   * dat bestand) en deze reeks te draaien: zonder de reparatie geven beide
   * 500 in plaats van 400.
   */
  it('wijst een onbekend soort af met 400 en niet met een serverfout', async () => {
    const res = await alsAdmin('post', '/relations').send({ relationType: 'debtor', name: 'Muziekhandel' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('relatiesoort');
    expect((await alsAdmin('get', '/relations')).body).toEqual([]);
  });

  it('wijst ook bij het bewerken een onbekend soort af met 400', async () => {
    const id = await maakRelatie();

    const res = await alsAdmin('put', `/relations/${id}`).send({ relationType: 'creditor' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('relatiesoort');
    expect((await alsAdmin('get', `/relations/${id}`)).body.relationType).toBe('customer');
  });

  it('wisselt een relatie wel naar een ander geldig soort', async () => {
    const id = await maakRelatie();
    const res = await alsAdmin('put', `/relations/${id}`).send({ relationType: 'both' });
    expect(res.status).toBe(200);
    expect((await alsAdmin('get', `/relations/${id}`)).body.relationType).toBe('both');
  });
});

describe('Een relatie bewerken en verwijderen', () => {
  it('vult een ontbrekend land en een ontbrekende betalingstermijn met een standaard', async () => {
    const id = await maakRelatie();
    const relatie = (await alsAdmin('get', `/relations/${id}`)).body;
    expect(relatie.country).toBe('NL');
    expect(relatie.paymentTermDays).toBe(30);
  });

  it('werkt de contactgegevens bij', async () => {
    const id = await maakRelatie();

    const res = await alsAdmin('put', `/relations/${id}`).send({
      name: 'Muziekhandel Noord',
      email: 'post@muziekhandel.example',
      iban: 'NL91ABNA0417164300',
      paymentTermDays: 14,
      city: 'Groningen',
    });
    expect(res.status).toBe(200);

    const relatie = (await alsAdmin('get', `/relations/${id}`)).body;
    expect(relatie.name).toBe('Muziekhandel Noord');
    expect(relatie.email).toBe('post@muziekhandel.example');
    expect(relatie.iban).toBe('NL91ABNA0417164300');
    expect(relatie.paymentTermDays).toBe(14);
    expect(relatie.city).toBe('Groningen');
    // Niet meegestuurd, dus ongemoeid.
    expect(relatie.relationType).toBe('customer');
  });

  it('laat een leeg verzoek de relatie ongemoeid', async () => {
    const id = await maakRelatie();
    const res = await alsAdmin('put', `/relations/${id}`).send({});
    expect(res.status).toBe(200);
    expect((await alsAdmin('get', `/relations/${id}`)).body.name).toBe('Muziekhandel');
  });

  it('zet een relatie op inactief', async () => {
    const id = await maakRelatie();
    const res = await alsAdmin('put', `/relations/${id}`).send({ isActive: 0 });
    expect(res.status).toBe(200);
    expect((await alsAdmin('get', `/relations/${id}`)).body.isActive).toBe(false);
  });

  it('meldt netjes dat een onbekende relatie niet bestaat', async () => {
    expect((await alsAdmin('put', `/relations/${uuidv4()}`).send({ name: 'X' })).status).toBe(404);
    expect((await alsAdmin('delete', `/relations/${uuidv4()}`)).status).toBe(404);
  });

  it('verwijdert een eigen relatie', async () => {
    const id = await maakRelatie();
    expect((await alsAdmin('delete', `/relations/${id}`)).status).toBe(200);
    expect((await alsAdmin('get', `/relations/${id}`)).status).toBe(404);
  });

  it('bewerkt of verwijdert geen relatie van een andere vereniging', async () => {
    const bijB = await request(app)
      .post('/api/accounting/relations')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ relationType: 'customer', name: 'Relatie van B', iban: 'NL91ABNA0417164300' });
    expect(bijB.status).toBe(201);

    expect((await alsAdmin('put', `/relations/${bijB.body.id}`).send({ iban: 'NL00BANK0000000000' })).status).toBe(404);
    expect((await alsAdmin('delete', `/relations/${bijB.body.id}`)).status).toBe(404);

    const naB = (await alsB('get', `/relations/${bijB.body.id}`)).body;
    expect(naB.iban).toBe('NL91ABNA0417164300');
  });

  it('laat een gewoon lid geen relatie bewerken of verwijderen', async () => {
    const id = await maakRelatie();
    expect((await alsLid('put', `/relations/${id}`).send({ name: 'Gekaapt' })).status).toBe(403);
    expect((await alsLid('delete', `/relations/${id}`)).status).toBe(403);
    expect((await alsAdmin('get', `/relations/${id}`)).body.name).toBe('Muziekhandel');
  });
});
