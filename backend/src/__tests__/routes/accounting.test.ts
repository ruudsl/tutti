/**
 * De boekhouding was het grootste onafgedekte bestand: 3582 regels, 56 routes,
 * en nul procent dekking. Dat kwam niet doordat er slecht getest werd maar
 * doordat de meting het bestand niet eens zag - zonder `include` telt de
 * v8-provider alleen bestanden die een test toevallig inlaadt.
 *
 * Deze reeks dekt de kern: boekjaren, grootboekrekeningen en contributies, en
 * de twee eigenschappen die bij geld het zwaarst wegen. Wie mag wat, en kan
 * een vereniging bij de boekhouding van een andere.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import '../setup';
import db from '../../database/connection';
import accountingRoutes from '../../routes/accounting';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestAssociation, createTestUser, generateTestToken, createTestEnvironment } from '../testUtils';

/**
 * Een eigen app in plaats van de gedeelde test-app.
 *
 * De moduleguard zit hier bewust niet omheen: die wordt in modules.test.ts
 * gedekt, en meenemen zou elke test hier laten afhangen van of de module
 * aanstaat. Dit gaat over wat de routes zelf doen.
 */
const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/accounting', accountingRoutes);
app.use(errorHandler);

let adminToken: string;
let memberToken: string;
let associationId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  memberToken = omgeving.memberToken;
  associationId = omgeving.association.id;
});

const alsAdmin = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/accounting${pad}`).set('Authorization', `Bearer ${adminToken}`);

async function maakBoekjaar(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/fiscal-years').send({
    name: 'Boekjaar 2026',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('Boekjaren', () => {
  it('begint leeg', async () => {
    const res = await alsAdmin('get', '/fiscal-years');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('maakt een boekjaar aan en geeft het terug', async () => {
    const id = await maakBoekjaar({ isCurrent: true });

    const res = await alsAdmin('get', '/fiscal-years');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id,
      name: 'Boekjaar 2026',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'open',
      isCurrent: true,
    });
  });

  it('houdt maar een boekjaar tegelijk als lopend', async () => {
    // Twee lopende boekjaren zou betekenen dat een boeking in beide kan
    // landen, of in geen van beide.
    await maakBoekjaar({ name: 'Boekjaar 2025', startDate: '2025-01-01', endDate: '2025-12-31', isCurrent: true });
    await maakBoekjaar({ isCurrent: true });

    const res = await alsAdmin('get', '/fiscal-years');
    const lopend = res.body.filter((j: { isCurrent: boolean }) => j.isCurrent);
    expect(lopend).toHaveLength(1);
    expect(lopend[0].name).toBe('Boekjaar 2026');
  });

  it('weigert een boekjaar zonder naam', async () => {
    const res = await alsAdmin('post', '/fiscal-years').send({
      name: '',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(res.status).toBe(400);
  });

  it('weigert een datum in het verkeerde formaat', async () => {
    const res = await alsAdmin('post', '/fiscal-years').send({
      name: 'Fout',
      startDate: '01-01-2026',
      endDate: '2026-12-31',
    });
    expect(res.status).toBe(400);
  });

  it('werkt een boekjaar bij', async () => {
    const id = await maakBoekjaar();

    const res = await alsAdmin('put', `/fiscal-years/${id}`).send({
      name: 'Hernoemd',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(res.status).toBe(200);

    const lijst = await alsAdmin('get', '/fiscal-years');
    expect(lijst.body[0].name).toBe('Hernoemd');
  });

  it('sluit een boekjaar af', async () => {
    const id = await maakBoekjaar();

    const res = await alsAdmin('post', `/fiscal-years/${id}/close`);
    expect(res.status).toBe(200);

    const lijst = await alsAdmin('get', '/fiscal-years');
    expect(lijst.body[0].status).not.toBe('open');
  });

  it('sluit een boekjaar niet twee keer af', async () => {
    const id = await maakBoekjaar();
    await alsAdmin('post', `/fiscal-years/${id}/close`);

    const res = await alsAdmin('post', `/fiscal-years/${id}/close`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('afgesloten');
  });

  it('meldt netjes dat een onbekend boekjaar niet bestaat', async () => {
    const res = await alsAdmin('post', '/fiscal-years/bestaat-niet/close');
    expect(res.status).toBe(404);
  });
});

describe('Grootboekrekeningen', () => {
  it('zet het standaard rekeningschema klaar', async () => {
    const res = await alsAdmin('post', '/accounts/initialize');
    // 201: er worden rekeningen aangemaakt.
    expect(res.status).toBe(201);

    const lijst = await alsAdmin('get', '/accounts');
    expect(lijst.body.length).toBeGreaterThan(5);
    // Kas en Bank horen er sowieso in te zitten.
    const codes = lijst.body.map((r: { code: string }) => r.code);
    expect(codes).toContain('1000');
    expect(codes).toContain('1100');
  });

  it('zet het schema niet een tweede keer klaar', async () => {
    await alsAdmin('post', '/accounts/initialize');

    // Anders zou elke rekening dubbel komen te staan.
    const res = await alsAdmin('post', '/accounts/initialize');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('al rekeningen');
  });

  it('maakt een eigen rekening aan', async () => {
    const res = await alsAdmin('post', '/accounts').send({
      code: '8000',
      name: 'Contributies',
      accountType: 'income',
    });
    expect(res.status).toBe(201);

    const lijst = await alsAdmin('get', '/accounts');
    expect(lijst.body.map((r: { name: string }) => r.name)).toContain('Contributies');
  });

  it('weigert een onbekend rekeningsoort', async () => {
    const res = await alsAdmin('post', '/accounts').send({
      code: '9999',
      name: 'Onzin',
      accountType: 'geen-soort',
    });
    expect(res.status).toBe(400);
  });
});

describe('Wie mag bij de boekhouding', () => {
  it('laat een gewoon lid er niet in', async () => {
    const res = await request(app).get('/api/accounting/fiscal-years').set('Authorization', `Bearer ${memberToken}`);

    expect(res.status).toBe(403);
  });

  it('vraagt om een token', async () => {
    const res = await request(app).get('/api/accounting/fiscal-years');
    expect(res.status).toBe(401);
  });
});

describe('Scheiding tussen verenigingen', () => {
  it('toont de boekhouding van een andere vereniging niet', async () => {
    // Dit is de eigenschap waar het bij een gedeelde installatie om draait:
    // twee verenigingen in dezelfde database mogen elkaars cijfers niet zien.
    await maakBoekjaar({ name: 'Van vereniging A' });

    const andere = createTestAssociation();
    const andereAdmin = createTestUser(andere.id, { email: 'admin-b@test.com', role: 'admin' });
    const andereToken = generateTestToken(andereAdmin);

    const res = await request(app).get('/api/accounting/fiscal-years').set('Authorization', `Bearer ${andereToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('laat een boekjaar van een andere vereniging niet afsluiten', async () => {
    const id = await maakBoekjaar();

    const andere = createTestAssociation();
    const andereAdmin = createTestUser(andere.id, { email: 'admin-c@test.com', role: 'admin' });
    const andereToken = generateTestToken(andereAdmin);

    const res = await request(app)
      .post(`/api/accounting/fiscal-years/${id}/close`)
      .set('Authorization', `Bearer ${andereToken}`);

    // 404 en niet 403: dat boekjaar hoort voor deze vereniging niet te bestaan.
    expect(res.status).toBe(404);

    // En het moet echt nog open staan.
    const lijst = await alsAdmin('get', '/fiscal-years');
    expect(lijst.body[0].status).toBe('open');
  });

  it('houdt rekeningen per vereniging apart', async () => {
    await alsAdmin('post', '/accounts/initialize');

    const andere = createTestAssociation();
    const andereAdmin = createTestUser(andere.id, { email: 'admin-d@test.com', role: 'admin' });
    const andereToken = generateTestToken(andereAdmin);

    const res = await request(app).get('/api/accounting/accounts').set('Authorization', `Bearer ${andereToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(associationId).toBeTruthy();
  });
});

/** Een relatie is nodig voor elke factuur; deze helper houdt dat kort. */
async function maakRelatie(naam = 'Leverancier BV') {
  const res = await alsAdmin('post', '/relations').send({ relationType: 'supplier', name: naam });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

/** Geef de id van een rekening met deze code, uit het standaardschema. */
async function rekeningId(code: string) {
  const lijst = await alsAdmin('get', '/accounts');
  const rekening = lijst.body.find((r: { code: string }) => r.code === code);
  expect(rekening, `rekening ${code} ontbreekt`).toBeTruthy();
  return rekening.id as string;
}

describe('Relaties', () => {
  it('maakt een relatie aan en toont hem', async () => {
    const id = await maakRelatie('Muziekhandel De Klank');

    const lijst = await alsAdmin('get', '/relations');
    expect(lijst.status).toBe(200);
    expect(lijst.body.map((r: { id: string }) => r.id)).toContain(id);
  });

  it('eist een soort en een naam', async () => {
    const res = await alsAdmin('post', '/relations').send({ name: 'Zonder soort' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('naam');
  });

  it('toont de relaties van een andere vereniging niet', async () => {
    await maakRelatie();

    const andere = createTestAssociation();
    const andereToken = generateTestToken(createTestUser(andere.id, { email: 'admin-rel@test.com', role: 'admin' }));

    const res = await request(app).get('/api/accounting/relations').set('Authorization', `Bearer ${andereToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('geeft een enkele relatie terug', async () => {
    const res = await alsAdmin('post', '/relations').send({
      relationType: 'customer',
      name: 'Muziekhandel De Klank',
      email: 'post@deklank.test',
      city: 'Zwolle',
      paymentTermDays: 14,
    });
    expect(res.status).toBe(201);

    const detail = await alsAdmin('get', `/relations/${res.body.id}`);
    expect(detail.status, JSON.stringify(detail.body)).toBe(200);
    expect(detail.body).toMatchObject({
      id: res.body.id,
      relationType: 'customer',
      name: 'Muziekhandel De Klank',
      email: 'post@deklank.test',
      city: 'Zwolle',
      paymentTermDays: 14,
      isActive: true,
    });
  });

  it('laat een wijziging terugzien in het detail', async () => {
    const id = await maakRelatie('Oude naam');
    await alsAdmin('put', `/relations/${id}`).send({ name: 'Nieuwe naam', city: 'Deventer' });

    const detail = await alsAdmin('get', `/relations/${id}`);
    expect(detail.body).toMatchObject({ name: 'Nieuwe naam', city: 'Deventer' });
  });

  it('geeft 404 voor een relatie die niet bestaat', async () => {
    const res = await alsAdmin('get', '/relations/bestaat-niet');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Relatie niet gevonden.');
  });

  it('geeft een relatie van een andere vereniging niet vrij', async () => {
    const id = await maakRelatie('Van de buren');

    const andere = createTestAssociation();
    const andereToken = generateTestToken(
      createTestUser(andere.id, { email: 'admin-rel-detail@test.com', role: 'admin' }),
    );

    const res = await request(app).get(`/api/accounting/relations/${id}`).set('Authorization', `Bearer ${andereToken}`);
    expect(res.status).toBe(404);
  });

  it('laat een gewoon lid geen relatie inzien', async () => {
    const id = await maakRelatie();

    const res = await request(app).get(`/api/accounting/relations/${id}`).set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Kostenplaatsen', () => {
  async function maakKostenplaats(overschrijf: Record<string, unknown> = {}) {
    const res = await alsAdmin('post', '/cost-centers').send({
      code: 'KP-100',
      name: 'Concerten',
      description: 'Alles rond de uitvoeringen',
      budgetAmount: 2500,
      ...overschrijf,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.id as string;
  }

  it('geeft een enkele kostenplaats terug', async () => {
    const id = await maakKostenplaats();

    const detail = await alsAdmin('get', `/cost-centers/${id}`);
    expect(detail.status, JSON.stringify(detail.body)).toBe(200);
    expect(detail.body).toMatchObject({
      id,
      code: 'KP-100',
      name: 'Concerten',
      description: 'Alles rond de uitvoeringen',
      budgetAmount: 2500,
      isActive: true,
    });
  });

  it('laat een wijziging terugzien in het detail', async () => {
    const id = await maakKostenplaats();
    await alsAdmin('put', `/cost-centers/${id}`).send({ name: 'Concertreeks', isActive: false });

    const detail = await alsAdmin('get', `/cost-centers/${id}`);
    expect(detail.body).toMatchObject({ name: 'Concertreeks', isActive: false });
  });

  it('geeft 404 voor een kostenplaats die niet bestaat', async () => {
    const res = await alsAdmin('get', '/cost-centers/bestaat-niet');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Kostenplaats niet gevonden.');
  });

  it('geeft een kostenplaats van een andere vereniging niet vrij', async () => {
    const id = await maakKostenplaats();

    const andere = createTestAssociation();
    const andereToken = generateTestToken(createTestUser(andere.id, { email: 'admin-kp@test.com', role: 'admin' }));

    const res = await request(app)
      .get(`/api/accounting/cost-centers/${id}`)
      .set('Authorization', `Bearer ${andereToken}`);
    expect(res.status).toBe(404);
  });

  it('laat een gewoon lid geen kostenplaats inzien', async () => {
    const id = await maakKostenplaats();

    const res = await request(app)
      .get(`/api/accounting/cost-centers/${id}`)
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Facturen', () => {
  // Een factuur krijgt een nummer binnen het lopende boekjaar, dus zonder
  // open boekjaar weigert de route terecht.
  beforeEach(async () => {
    await maakBoekjaar({ isCurrent: true });
  });

  it('maakt een factuur met regels aan', async () => {
    const relationId = await maakRelatie();

    const res = await alsAdmin('post', '/invoices').send({
      invoiceType: 'purchase',
      relationId,
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
      description: 'Bladmuziek',
      lines: [{ description: 'Partituren', quantity: 2, unitPrice: 45.5, vatRate: 21 }],
    });

    expect(res.status).toBe(201);
    const lijst = await alsAdmin('get', '/invoices');
    expect(lijst.body.length).toBeGreaterThan(0);
  });

  it('weigert een factuur zonder regels', async () => {
    const relationId = await maakRelatie();

    // Een factuur zonder regels heeft geen bedrag; die hoort niet te bestaan.
    const res = await alsAdmin('post', '/invoices').send({
      invoiceType: 'purchase',
      relationId,
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
      lines: [],
    });

    expect(res.status).toBe(400);
  });

  it('weigert een factuur voor een onbekende relatie', async () => {
    const res = await alsAdmin('post', '/invoices').send({
      invoiceType: 'purchase',
      relationId: '11111111-1111-1111-1111-111111111111',
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
      lines: [{ description: 'Iets', quantity: 1, unitPrice: 10 }],
    });

    expect([400, 404]).toContain(res.status);
  });
});

describe('Boekingen', () => {
  /** Een boeking vraagt een lopend boekjaar en rekeningen om op te boeken. */
  async function opzet() {
    await maakBoekjaar({ isCurrent: true });
    await alsAdmin('post', '/accounts/initialize');
    return { kas: await rekeningId('1000'), bank: await rekeningId('1100') };
  }

  it('boekt een sluitende post', async () => {
    const { kas, bank } = await opzet();

    const res = await alsAdmin('post', '/transactions').send({
      transactionDate: '2026-03-01',
      transactionType: 'transfer',
      description: 'Kas naar bank',
      lines: [
        { accountId: bank, debitAmount: 100 },
        { accountId: kas, creditAmount: 100 },
      ],
    });

    expect(res.status).toBe(201);
  });

  it('weigert een post die niet in balans is', async () => {
    const { kas, bank } = await opzet();

    // Dit is de kern van dubbel boekhouden: wat er aan de ene kant af gaat,
    // moet er aan de andere kant bij komen. Zonder deze controle loopt de
    // balans stilletjes scheef.
    const res = await alsAdmin('post', '/transactions').send({
      transactionDate: '2026-03-01',
      transactionType: 'transfer',
      description: 'Scheve boeking',
      lines: [
        { accountId: bank, debitAmount: 100 },
        { accountId: kas, creditAmount: 75 },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('balans');
    expect(res.body.error).toContain('25');
  });

  it('weigert een post met maar een regel', async () => {
    const { bank } = await opzet();

    const res = await alsAdmin('post', '/transactions').send({
      transactionDate: '2026-03-01',
      transactionType: 'journal',
      description: 'Eenzijdig',
      lines: [{ accountId: bank, debitAmount: 100 }],
    });

    expect(res.status).toBe(400);
  });

  it('weigert een post zonder lopend boekjaar', async () => {
    await alsAdmin('post', '/accounts/initialize');
    const bank = await rekeningId('1100');
    const kas = await rekeningId('1000');

    const res = await alsAdmin('post', '/transactions').send({
      transactionDate: '2026-03-01',
      transactionType: 'transfer',
      description: 'Zonder boekjaar',
      lines: [
        { accountId: bank, debitAmount: 50 },
        { accountId: kas, creditAmount: 50 },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('boekjaar');
  });
});

describe('Rapportages', () => {
  it('geeft een balans terug', async () => {
    await maakBoekjaar({ isCurrent: true });
    await alsAdmin('post', '/accounts/initialize');

    const res = await alsAdmin('get', '/reports/balance');
    expect(res.status).toBe(200);
  });

  it('geeft een winst-en-verliesrekening terug', async () => {
    await maakBoekjaar({ isCurrent: true });
    await alsAdmin('post', '/accounts/initialize');

    const res = await alsAdmin('get', '/reports/profit-loss');
    expect(res.status).toBe(200);
  });

  it('geeft een ouderdomsoverzicht terug', async () => {
    const res = await alsAdmin('get', '/reports/aging');
    expect(res.status).toBe(200);
  });
});
