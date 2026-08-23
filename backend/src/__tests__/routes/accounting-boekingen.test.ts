/**
 * Boekingen en bankafschriften: de kant van de boekhouding waar de bedragen
 * echt heen gaan.
 *
 * accounting-status.test.ts dekt de statusovergangen van een boeking (concept,
 * geboekt, niet twee keer) en accounting-geld.test.ts de bankimport op
 * hoofdlijnen. Wat daar tussenuit viel: het overzicht met zijn zes filters,
 * het detail met zijn regels, het bijwerken en verwijderen, de MT940-invoer,
 * en het grootboekoverzicht per rekening.
 *
 * De rode draad is dat een bedrag met een richting hoort te kloppen. Een
 * boeking die de verkeerde kant op gaat geeft ook een 200, dus wordt hier
 * steeds het saldo nagerekend en niet alleen de statuscode gelezen.
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
import { createTestAssociation, createTestUser, generateTestToken, createTestEnvironment } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/accounting', accountingRoutes);
app.use(errorHandler);

let adminToken: string;
let memberToken: string;
let associationId: string;
let tokenB: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  memberToken = omgeving.memberToken;
  associationId = omgeving.association.id;

  const b = createTestAssociation();
  tokenB = generateTestToken(createTestUser(b.id, { email: 'admin-b@test.com', role: 'admin' }));
});

const alsAdmin = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/accounting${pad}`).set('Authorization', `Bearer ${adminToken}`);

const alsLid = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/accounting${pad}`).set('Authorization', `Bearer ${memberToken}`);

const alsB = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/accounting${pad}`).set('Authorization', `Bearer ${tokenB}`);

async function maakBoekjaar(overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', '/fiscal-years').send({
    name: 'Boekjaar 2026',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    isCurrent: true,
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function rekeningId(code: string) {
  const lijst = await alsAdmin('get', '/accounts');
  const rekening = lijst.body.find((r: { code: string }) => r.code === code);
  expect(rekening, `rekening ${code} ontbreekt`).toBeTruthy();
  return rekening.id as string;
}

function maakKostenplaats(code: string, naam = 'Concerten') {
  const id = uuidv4();
  db.prepare('INSERT INTO cost_centers (id, association_id, code, name, is_active) VALUES (?, ?, ?, ?, 1)').run(
    id,
    associationId,
    code,
    naam,
  );
  return id;
}

/** Kas debet, bank credit: geld van de bank naar de kas gehaald. */
async function maakBoeking(overschrijf: Record<string, unknown> = {}, regels?: unknown[]) {
  const kas = await rekeningId('1000');
  const bank = await rekeningId('1100');
  const res = await alsAdmin('post', '/transactions').send({
    transactionDate: '2026-03-15',
    transactionType: 'journal',
    description: 'Kasopname',
    lines: regels ?? [
      { accountId: kas, debitAmount: 100 },
      { accountId: bank, creditAmount: 100 },
    ],
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body as { id: string; transactionNumber: string };
}

// =====================================================
// HET BOEKINGSOVERZICHT
// =====================================================

describe('Het boekingsoverzicht', () => {
  beforeEach(async () => {
    await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
  });

  it('begint leeg', async () => {
    const res = await alsAdmin('get', '/transactions');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('geeft een nieuwe boeking terug als concept met het totaalbedrag', async () => {
    const { id, transactionNumber } = await maakBoeking();

    const res = await alsAdmin('get', '/transactions');
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id,
      transactionNumber,
      transactionDate: '2026-03-15',
      transactionType: 'journal',
      description: 'Kasopname',
      // Het totaal is de debetzijde, niet debet plus credit.
      totalAmount: 100,
      isPosted: false,
      isReconciled: false,
    });
    expect(res.body[0].createdByName).toBe('Admin User');
  });

  it('nummert de boekingen doorlopend en niet per boekjaar opnieuw', async () => {
    const eerste = await maakBoeking();
    const tweede = await maakBoeking();
    expect(eerste.transactionNumber).toBe('TX-000001');
    expect(tweede.transactionNumber).toBe('TX-000002');
  });

  it('filtert op boekingssoort', async () => {
    await maakBoeking({ transactionType: 'journal' });
    await maakBoeking({ transactionType: 'receipt' });

    const res = await alsAdmin('get', '/transactions?transactionType=receipt');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].transactionType).toBe('receipt');
  });

  it('filtert op een periode en laat de grenzen zelf meedoen', async () => {
    await maakBoeking({ transactionDate: '2026-01-31', description: 'Januari' });
    await maakBoeking({ transactionDate: '2026-02-15', description: 'Februari' });
    await maakBoeking({ transactionDate: '2026-03-31', description: 'Maart' });

    const res = await alsAdmin('get', '/transactions?startDate=2026-01-31&endDate=2026-03-31');
    expect(res.body).toHaveLength(3);

    const binnen = await alsAdmin('get', '/transactions?startDate=2026-02-01&endDate=2026-02-28');
    expect(binnen.body.map((t: { description: string }) => t.description)).toEqual(['Februari']);
  });

  it('zoekt in zowel de omschrijving als de referentie', async () => {
    await maakBoeking({ description: 'Huur zaal', reference: 'FCT-100' });
    await maakBoeking({ description: 'Bladmuziek', reference: 'ZAAL-9' });

    expect((await alsAdmin('get', '/transactions?search=zaal')).body).toHaveLength(2);
    expect((await alsAdmin('get', '/transactions?search=Bladmuziek')).body).toHaveLength(1);
    expect((await alsAdmin('get', '/transactions?search=FCT')).body).toHaveLength(1);
    expect((await alsAdmin('get', '/transactions?search=nietsvanditalles')).body).toHaveLength(0);
  });

  it('filtert op een rekening via de boekingsregels', async () => {
    const kas = await rekeningId('1000');
    const bank = await rekeningId('1100');
    const huur = await rekeningId('4200');

    await maakBoeking({ description: 'Kasopname' });
    await maakBoeking({ description: 'Huur' }, [
      { accountId: huur, debitAmount: 400 },
      { accountId: bank, creditAmount: 400 },
    ]);

    // De bank zit in beide boekingen, de kas en de huur elk in een.
    expect((await alsAdmin(`get`, `/transactions?accountId=${bank}`)).body).toHaveLength(2);
    expect((await alsAdmin('get', `/transactions?accountId=${kas}`)).body).toHaveLength(1);
    const opHuur = (await alsAdmin('get', `/transactions?accountId=${huur}`)).body;
    expect(opHuur).toHaveLength(1);
    expect(opHuur[0].description).toBe('Huur');
  });

  it('filtert op boekjaar', async () => {
    await maakBoeking();
    const boekjaar = (await alsAdmin('get', '/fiscal-years')).body[0].id;

    expect((await alsAdmin('get', `/transactions?fiscalYearId=${boekjaar}`)).body).toHaveLength(1);
    expect((await alsAdmin('get', `/transactions?fiscalYearId=${uuidv4()}`)).body).toHaveLength(0);
  });

  it('combineert filters in plaats van de laatste te laten winnen', async () => {
    await maakBoeking({ transactionDate: '2026-02-01', transactionType: 'receipt', description: 'Wel' });
    await maakBoeking({ transactionDate: '2026-02-02', transactionType: 'journal', description: 'Verkeerde soort' });
    await maakBoeking({ transactionDate: '2026-05-01', transactionType: 'receipt', description: 'Verkeerde maand' });

    const res = await alsAdmin('get', '/transactions?transactionType=receipt&startDate=2026-01-01&endDate=2026-02-28');
    expect(res.body.map((t: { description: string }) => t.description)).toEqual(['Wel']);
  });

  it('toont de boekingen van een andere vereniging niet', async () => {
    await maakBoeking();
    expect((await alsB('get', '/transactions')).body).toEqual([]);
  });

  it('laat een gewoon lid niet bij het overzicht', async () => {
    expect((await alsLid('get', '/transactions')).status).toBe(403);
  });
});

// =====================================================
// EEN BOEKING IN DETAIL
// =====================================================

describe('Een boeking in detail', () => {
  beforeEach(async () => {
    await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
  });

  it('geeft de regels met rekening, soort en bedrag terug', async () => {
    const kas = await rekeningId('1000');
    const bank = await rekeningId('1100');
    const kostenplaats = maakKostenplaats('KP-01');

    const { id } = await maakBoeking({}, [
      { accountId: kas, debitAmount: 100, description: 'Naar de kas', costCenterId: kostenplaats },
      { accountId: bank, creditAmount: 100, description: 'Van de bank' },
    ]);

    const res = await alsAdmin('get', `/transactions/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.lines).toHaveLength(2);

    const [eerste, tweede] = res.body.lines;
    expect(eerste).toMatchObject({
      lineNumber: 1,
      accountId: kas,
      accountCode: '1000',
      accountName: 'Kas',
      accountType: 'asset',
      description: 'Naar de kas',
      debitAmount: 100,
      creditAmount: 0,
      costCenterCode: 'KP-01',
      costCenterName: 'Concerten',
    });
    expect(tweede).toMatchObject({
      lineNumber: 2,
      accountCode: '1100',
      debitAmount: 0,
      creditAmount: 100,
      costCenterId: null,
    });

    // Debet en credit horen per definitie gelijk te zijn.
    const debet = res.body.lines.reduce((s: number, l: { debitAmount: number }) => s + l.debitAmount, 0);
    const credit = res.body.lines.reduce((s: number, l: { creditAmount: number }) => s + l.creditAmount, 0);
    expect(debet).toBe(credit);
    expect(res.body.totalAmount).toBe(debet);
  });

  it('meldt netjes dat een onbekende boeking niet bestaat', async () => {
    expect((await alsAdmin('get', `/transactions/${uuidv4()}`)).status).toBe(404);
  });

  it('geeft een boeking van een andere vereniging niet vrij', async () => {
    const { id } = await maakBoeking();
    expect((await alsB('get', `/transactions/${id}`)).status).toBe(404);
  });

  it('laat een gewoon lid geen boeking inzien', async () => {
    const { id } = await maakBoeking();
    expect((await alsLid('get', `/transactions/${id}`)).status).toBe(403);
  });
});

// =====================================================
// BEDRAGEN EN GRENSGEVALLEN BIJ HET BOEKEN
// =====================================================

describe('Bedragen bij het boeken', () => {
  beforeEach(async () => {
    await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
  });

  it('weigert een negatief bedrag in plaats van het als tegenboeking te lezen', async () => {
    const kas = await rekeningId('1000');
    const bank = await rekeningId('1100');

    // Debet -100 en credit -100 zijn "in balans", maar een negatief bedrag
    // hoort aan de andere kant van de boeking te staan en niet als minteken.
    const res = await alsAdmin('post', '/transactions').send({
      transactionDate: '2026-03-15',
      transactionType: 'journal',
      description: 'Verkeerd om',
      lines: [
        { accountId: kas, debitAmount: -100 },
        { accountId: bank, creditAmount: -100 },
      ],
    });
    expect(res.status).toBe(400);
    expect((await alsAdmin('get', '/transactions')).body).toEqual([]);
  });

  it('laat een boeking van nul door en houdt het totaal op nul', async () => {
    const kas = await rekeningId('1000');
    const bank = await rekeningId('1100');

    const res = await alsAdmin('post', '/transactions').send({
      transactionDate: '2026-03-15',
      transactionType: 'journal',
      description: 'Nulboeking',
      lines: [
        { accountId: kas, debitAmount: 0 },
        { accountId: bank, creditAmount: 0 },
      ],
    });
    expect(res.status).toBe(201);
    expect((await alsAdmin('get', `/transactions/${res.body.id}`)).body.totalAmount).toBe(0);
  });

  it('accepteert een verschil binnen een halve cent en weigert een hele cent', async () => {
    const kas = await rekeningId('1000');
    const bank = await rekeningId('1100');

    const opRand = await alsAdmin('post', '/transactions').send({
      transactionDate: '2026-03-15',
      transactionType: 'journal',
      description: 'Afrondingsverschil',
      lines: [
        { accountId: kas, debitAmount: 100 },
        { accountId: bank, creditAmount: 99.995 },
      ],
    });
    expect(opRand.status).toBe(201);

    const eroverheen = await alsAdmin('post', '/transactions').send({
      transactionDate: '2026-03-15',
      transactionType: 'journal',
      description: 'Te groot verschil',
      lines: [
        { accountId: kas, debitAmount: 100 },
        { accountId: bank, creditAmount: 99.98 },
      ],
    });
    expect(eroverheen.status).toBe(400);
    expect(eroverheen.body.error).toContain('0.02');
  });

  it('telt een boeking met meer dan twee regels goed op', async () => {
    const bank = await rekeningId('1100');
    const huur = await rekeningId('4200');
    const energie = await rekeningId('4300');

    const { id } = await maakBoeking({ description: 'Zaal en energie' }, [
      { accountId: huur, debitAmount: 400.55 },
      { accountId: energie, debitAmount: 99.45 },
      { accountId: bank, creditAmount: 500 },
    ]);

    const detail = (await alsAdmin('get', `/transactions/${id}`)).body;
    expect(detail.lines).toHaveLength(3);
    expect(detail.totalAmount).toBeCloseTo(500, 2);
  });

  it('weigert een boekingssoort die niet bestaat', async () => {
    const kas = await rekeningId('1000');
    const bank = await rekeningId('1100');
    const res = await alsAdmin('post', '/transactions').send({
      transactionDate: '2026-03-15',
      transactionType: 'kasboek',
      description: 'Onbekende soort',
      lines: [
        { accountId: kas, debitAmount: 10 },
        { accountId: bank, creditAmount: 10 },
      ],
    });
    expect(res.status).toBe(400);
  });

  it('weigert een boeking zonder omschrijving', async () => {
    const kas = await rekeningId('1000');
    const bank = await rekeningId('1100');
    const res = await alsAdmin('post', '/transactions').send({
      transactionDate: '2026-03-15',
      transactionType: 'journal',
      description: '',
      lines: [
        { accountId: kas, debitAmount: 10 },
        { accountId: bank, creditAmount: 10 },
      ],
    });
    expect(res.status).toBe(400);
  });

  it('weigert een datum in het verkeerde formaat', async () => {
    const kas = await rekeningId('1000');
    const bank = await rekeningId('1100');
    const res = await alsAdmin('post', '/transactions').send({
      transactionDate: '15-03-2026',
      transactionType: 'journal',
      description: 'Verkeerde datum',
      lines: [
        { accountId: kas, debitAmount: 10 },
        { accountId: bank, creditAmount: 10 },
      ],
    });
    expect(res.status).toBe(400);
  });

  it('boekt niet meer zodra het boekjaar gesloten is', async () => {
    const boekjaar = (await alsAdmin('get', '/fiscal-years')).body[0].id;
    expect((await alsAdmin('post', `/fiscal-years/${boekjaar}/close`)).status).toBe(200);

    const kas = await rekeningId('1000');
    const bank = await rekeningId('1100');
    const res = await alsAdmin('post', '/transactions').send({
      transactionDate: '2026-03-15',
      transactionType: 'journal',
      description: 'Na sluiting',
      lines: [
        { accountId: kas, debitAmount: 10 },
        { accountId: bank, creditAmount: 10 },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('boekjaar');
    expect((await alsAdmin('get', '/transactions')).body).toEqual([]);
  });
});

// =====================================================
// BIJWERKEN EN VERWIJDEREN
// =====================================================

describe('Een boeking bijwerken', () => {
  beforeEach(async () => {
    await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
  });

  it('vervangt de regels in plaats van ze erbij te zetten', async () => {
    const { id } = await maakBoeking();
    const huur = await rekeningId('4200');
    const bank = await rekeningId('1100');

    const res = await alsAdmin('put', `/transactions/${id}`).send({
      transactionDate: '2026-04-01',
      transactionType: 'payment',
      description: 'Toch de huur',
      lines: [
        { accountId: huur, debitAmount: 250 },
        { accountId: bank, creditAmount: 250 },
      ],
    });
    expect(res.status).toBe(200);

    const detail = (await alsAdmin('get', `/transactions/${id}`)).body;
    expect(detail.lines).toHaveLength(2);
    expect(detail.description).toBe('Toch de huur');
    expect(detail.transactionDate).toBe('2026-04-01');
    expect(detail.transactionType).toBe('payment');
    expect(detail.totalAmount).toBe(250);
    // Het boekstuknummer verandert niet bij een wijziging.
    expect(detail.transactionNumber).toBe('TX-000001');
  });

  it('houdt het totaalbedrag gelijk aan de nieuwe debetzijde', async () => {
    const { id } = await maakBoeking();
    const huur = await rekeningId('4200');
    const energie = await rekeningId('4300');
    const bank = await rekeningId('1100');

    await alsAdmin('put', `/transactions/${id}`).send({
      transactionDate: '2026-04-01',
      transactionType: 'journal',
      description: 'Gesplitst',
      lines: [
        { accountId: huur, debitAmount: 120.25 },
        { accountId: energie, debitAmount: 79.75 },
        { accountId: bank, creditAmount: 200 },
      ],
    });

    expect((await alsAdmin('get', `/transactions/${id}`)).body.totalAmount).toBeCloseTo(200, 2);
  });

  it('weigert een wijziging die niet in balans is en laat de oude regels staan', async () => {
    const { id } = await maakBoeking();
    const huur = await rekeningId('4200');
    const bank = await rekeningId('1100');

    const res = await alsAdmin('put', `/transactions/${id}`).send({
      transactionDate: '2026-04-01',
      transactionType: 'journal',
      description: 'Scheef',
      lines: [
        { accountId: huur, debitAmount: 250 },
        { accountId: bank, creditAmount: 200 },
      ],
    });
    expect(res.status).toBe(400);

    const detail = (await alsAdmin('get', `/transactions/${id}`)).body;
    expect(detail.description).toBe('Kasopname');
    expect(detail.totalAmount).toBe(100);
    expect(detail.lines).toHaveLength(2);
  });

  it('meldt netjes dat een onbekende boeking niet bestaat', async () => {
    const kas = await rekeningId('1000');
    const bank = await rekeningId('1100');
    const res = await alsAdmin('put', `/transactions/${uuidv4()}`).send({
      transactionDate: '2026-04-01',
      transactionType: 'journal',
      description: 'Nergens',
      lines: [
        { accountId: kas, debitAmount: 1 },
        { accountId: bank, creditAmount: 1 },
      ],
    });
    expect(res.status).toBe(404);
  });

  it('laat een gewoon lid geen boeking bijwerken', async () => {
    const { id } = await maakBoeking();
    expect((await alsLid('put', `/transactions/${id}`).send({})).status).toBe(403);
  });
});

describe('Een boeking verwijderen', () => {
  beforeEach(async () => {
    await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
  });

  it('verwijdert een concept met regels en al', async () => {
    const { id } = await maakBoeking();
    const kas = await rekeningId('1000');

    expect((await alsAdmin('delete', `/transactions/${id}`)).status).toBe(200);
    expect((await alsAdmin('get', '/transactions')).body).toEqual([]);

    // De regels gaan mee. Bleven ze staan, dan zou de rekening voorgoed
    // "heeft transacties" zijn en nooit meer te verwijderen.
    expect(db.prepare('SELECT COUNT(*) AS n FROM transaction_lines WHERE transaction_id = ?').get(id)).toMatchObject({
      n: 0,
    });
    expect(db.prepare('SELECT 1 FROM transaction_lines WHERE account_id = ?').get(kas)).toBeFalsy();
  });

  it('laat een geboekte transactie staan', async () => {
    const { id } = await maakBoeking();
    expect((await alsAdmin('post', `/transactions/${id}/post`)).status).toBe(200);

    const res = await alsAdmin('delete', `/transactions/${id}`);
    expect(res.status).toBe(400);
    expect((await alsAdmin('get', '/transactions')).body).toHaveLength(1);
  });

  it('laat een geboekte transactie ook niet bijwerken', async () => {
    const { id } = await maakBoeking();
    await alsAdmin('post', `/transactions/${id}/post`);
    const kas = await rekeningId('1000');
    const bank = await rekeningId('1100');

    const res = await alsAdmin('put', `/transactions/${id}`).send({
      transactionDate: '2026-04-01',
      transactionType: 'journal',
      description: 'Toch anders',
      lines: [
        { accountId: kas, debitAmount: 999 },
        { accountId: bank, creditAmount: 999 },
      ],
    });
    expect(res.status).toBe(400);
    expect((await alsAdmin('get', `/transactions/${id}`)).body.totalAmount).toBe(100);
  });

  it('meldt netjes dat een onbekende boeking niet bestaat', async () => {
    expect((await alsAdmin('delete', `/transactions/${uuidv4()}`)).status).toBe(404);
  });

  it('verwijdert geen boeking van een andere vereniging', async () => {
    const { id } = await maakBoeking();
    expect((await alsB('delete', `/transactions/${id}`)).status).toBe(404);
    expect((await alsAdmin('get', '/transactions')).body).toHaveLength(1);
  });

  it('laat een gewoon lid geen boeking verwijderen', async () => {
    const { id } = await maakBoeking();
    expect((await alsLid('delete', `/transactions/${id}`)).status).toBe(403);
    expect((await alsAdmin('get', '/transactions')).body).toHaveLength(1);
  });
});

// =====================================================
// HET GROOTBOEK PER REKENING
// =====================================================

describe('Het grootboekoverzicht van een rekening', () => {
  beforeEach(async () => {
    await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
  });

  it('meldt netjes dat een onbekende rekening niet bestaat', async () => {
    expect((await alsAdmin('get', `/reports/account-ledger/${uuidv4()}`)).status).toBe(404);
  });

  it('geeft een rekening van een andere vereniging niet vrij', async () => {
    const kas = await rekeningId('1000');
    expect((await alsB('get', `/reports/account-ledger/${kas}`)).status).toBe(404);
  });

  it('begint bij het beginsaldo en houdt dat aan als er niets geboekt is', async () => {
    const res = await alsAdmin('post', '/accounts').send({
      code: '1150',
      name: 'Spaarrekening',
      accountType: 'asset',
      openingBalance: 250,
    });
    const ledger = (await alsAdmin('get', `/reports/account-ledger/${res.body.id}`)).body;

    expect(ledger.account).toMatchObject({ code: '1150', type: 'asset', openingBalance: 250 });
    expect(ledger.entries).toEqual([]);
    expect(ledger.closingBalance).toBe(250);
  });

  it('telt op een bezitsrekening debet erbij en credit eraf', async () => {
    const kas = await rekeningId('1000');
    const bank = await rekeningId('1100');

    await maakBoeking({ transactionDate: '2026-03-01', description: 'Opname' }, [
      { accountId: kas, debitAmount: 300 },
      { accountId: bank, creditAmount: 300 },
    ]);
    await maakBoeking({ transactionDate: '2026-03-05', description: 'Storting' }, [
      { accountId: bank, debitAmount: 120 },
      { accountId: kas, creditAmount: 120 },
    ]);

    const ledger = (await alsAdmin('get', `/reports/account-ledger/${kas}`)).body;
    expect(ledger.entries).toHaveLength(2);
    expect(ledger.entries[0]).toMatchObject({ debit: 300, credit: 0, balance: 300 });
    expect(ledger.entries[1]).toMatchObject({ debit: 0, credit: 120, balance: 180 });
    expect(ledger.closingBalance).toBe(180);
  });

  it('telt op een opbrengstrekening juist credit erbij en debet eraf', async () => {
    const contributie = await rekeningId('8000');
    const bank = await rekeningId('1100');

    await maakBoeking({ transactionDate: '2026-03-01', description: 'Contributie' }, [
      { accountId: bank, debitAmount: 500 },
      { accountId: contributie, creditAmount: 500 },
    ]);
    await maakBoeking({ transactionDate: '2026-03-02', description: 'Correctie' }, [
      { accountId: contributie, debitAmount: 50 },
      { accountId: bank, creditAmount: 50 },
    ]);

    const ledger = (await alsAdmin('get', `/reports/account-ledger/${contributie}`)).body;
    // Een opbrengst groeit aan de creditzijde: 500 erbij, 50 eraf.
    expect(ledger.entries[0].balance).toBe(500);
    expect(ledger.entries[1].balance).toBe(450);
    expect(ledger.closingBalance).toBe(450);
  });

  it('blijft binnen de gevraagde periode en telt het saldo daar opnieuw op', async () => {
    const kas = await rekeningId('1000');
    const bank = await rekeningId('1100');

    for (const [datum, bedrag] of [
      ['2026-01-10', 100],
      ['2026-02-10', 200],
      ['2026-03-10', 400],
    ] as [string, number][]) {
      await maakBoeking({ transactionDate: datum, description: `Opname ${datum}` }, [
        { accountId: kas, debitAmount: bedrag },
        { accountId: bank, creditAmount: bedrag },
      ]);
    }

    const alles = (await alsAdmin('get', `/reports/account-ledger/${kas}`)).body;
    expect(alles.entries).toHaveLength(3);
    expect(alles.closingBalance).toBe(700);

    const februari = (await alsAdmin('get', `/reports/account-ledger/${kas}?startDate=2026-02-01&endDate=2026-02-28`))
      .body;
    expect(februari.entries).toHaveLength(1);
    // Het saldo begint weer bij het beginsaldo van de rekening: dit is het
    // verloop binnen de periode en niet het saldo per einddatum.
    expect(februari.closingBalance).toBe(200);
  });

  it('gebruikt de regelomschrijving en valt terug op die van de boeking', async () => {
    const kas = await rekeningId('1000');
    const bank = await rekeningId('1100');

    await maakBoeking({ description: 'Omschrijving van de boeking' }, [
      { accountId: kas, debitAmount: 10, description: 'Omschrijving van de regel' },
      { accountId: bank, creditAmount: 10 },
    ]);

    const opKas = (await alsAdmin('get', `/reports/account-ledger/${kas}`)).body;
    const opBank = (await alsAdmin('get', `/reports/account-ledger/${bank}`)).body;
    expect(opKas.entries[0].description).toBe('Omschrijving van de regel');
    expect(opBank.entries[0].description).toBe('Omschrijving van de boeking');
  });

  it('telt de boekingen van een andere vereniging niet mee', async () => {
    const kas = await rekeningId('1000');
    const bank = await rekeningId('1100');
    await maakBoeking({}, [
      { accountId: kas, debitAmount: 100 },
      { accountId: bank, creditAmount: 100 },
    ]);

    // B heeft een eigen kas met hetzelfde nummer maar een ander id.
    await alsB('post', '/fiscal-years').send({
      name: 'Boekjaar 2026',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      isCurrent: true,
    });
    await alsB('post', '/accounts/initialize');
    const kasVanB = (await alsB('get', '/accounts')).body.find((r: { code: string }) => r.code === '1000').id;

    const ledger = (await alsB('get', `/reports/account-ledger/${kasVanB}`)).body;
    expect(ledger.entries).toEqual([]);
    expect(ledger.closingBalance).toBe(0);
  });

  it('laat een gewoon lid er niet bij', async () => {
    const kas = await rekeningId('1000');
    expect((await alsLid('get', `/reports/account-ledger/${kas}`)).status).toBe(403);
  });
});

// =====================================================
// HET OUDERDOMSOVERZICHT
// =====================================================

describe('Het ouderdomsoverzicht', () => {
  beforeEach(async () => {
    await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
  });

  async function maakRelatie(naam: string) {
    const res = await alsAdmin('post', '/relations').send({ relationType: 'customer', name: naam });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  /** Een factuur met een vervaldatum een gegeven aantal dagen terug in de tijd. */
  async function maakFactuurMetVervaldag(relationId: string, bedrag: number, dagenGeleden: number) {
    const vervaldag = new Date(Date.now() - dagenGeleden * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const res = await alsAdmin('post', '/invoices').send({
      invoiceType: 'sales',
      relationId,
      invoiceDate: '2026-01-01',
      dueDate: vervaldag,
      lines: [{ description: 'Contributie', quantity: 1, unitPrice: bedrag }],
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it('verdeelt de facturen over de juiste vakken', async () => {
    const relatie = await maakRelatie('Debiteur');
    await maakFactuurMetVervaldag(relatie, 100, -10); // vervalt over tien dagen
    await maakFactuurMetVervaldag(relatie, 200, 15);
    await maakFactuurMetVervaldag(relatie, 300, 45);
    await maakFactuurMetVervaldag(relatie, 400, 75);
    await maakFactuurMetVervaldag(relatie, 500, 200);

    const res = await alsAdmin('get', '/reports/aging');
    expect(res.status).toBe(200);

    expect(res.body.buckets.current.total).toBe(100);
    expect(res.body.buckets.days1to30.total).toBe(200);
    expect(res.body.buckets.days31to60.total).toBe(300);
    expect(res.body.buckets.days61to90.total).toBe(400);
    expect(res.body.buckets.over90.total).toBe(500);
    expect(res.body.grandTotal).toBe(1500);
  });

  it('telt alleen het openstaande deel en niet het factuurbedrag', async () => {
    const relatie = await maakRelatie('Debiteur');
    const factuur = await maakFactuurMetVervaldag(relatie, 250, 40);

    expect((await alsAdmin('post', `/invoices/${factuur}/mark-paid`).send({ amount: 100 })).status).toBe(200);

    const res = await alsAdmin('get', '/reports/aging');
    expect(res.body.buckets.days31to60.total).toBe(150);
    expect(res.body.buckets.days31to60.invoices[0]).toMatchObject({ total: 250, amountPaid: 100, amountDue: 150 });
    expect(res.body.grandTotal).toBe(150);
  });

  it('laat een volledig betaalde factuur helemaal weg', async () => {
    const relatie = await maakRelatie('Debiteur');
    const factuur = await maakFactuurMetVervaldag(relatie, 250, 40);
    expect((await alsAdmin('post', `/invoices/${factuur}/mark-paid`).send({})).status).toBe(200);

    const res = await alsAdmin('get', '/reports/aging');
    expect(res.body.grandTotal).toBe(0);
    expect(res.body.buckets.days31to60.invoices).toEqual([]);
  });

  it('houdt het aantal dagen te laat op nul voor wat nog niet vervallen is', async () => {
    const relatie = await maakRelatie('Debiteur');
    await maakFactuurMetVervaldag(relatie, 100, -30);

    const res = await alsAdmin('get', '/reports/aging');
    expect(res.body.buckets.current.invoices[0].daysOverdue).toBe(0);
  });

  it('is leeg zonder openstaande facturen', async () => {
    const res = await alsAdmin('get', '/reports/aging');
    expect(res.status).toBe(200);
    expect(res.body.grandTotal).toBe(0);
  });

  it('telt de facturen van een andere vereniging niet mee', async () => {
    const relatie = await maakRelatie('Debiteur');
    await maakFactuurMetVervaldag(relatie, 100, 45);

    expect((await alsB('get', '/reports/aging')).body.grandTotal).toBe(0);
  });

  it('laat een gewoon lid er niet bij', async () => {
    expect((await alsLid('get', '/reports/aging')).status).toBe(403);
  });
});

// =====================================================
// BANKAFSCHRIFTEN
// =====================================================

describe('Bankafschriften inlezen en boeken', () => {
  let bankRekening: string;

  async function bankOpzet() {
    await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
    bankRekening = await rekeningId('1100');
    db.prepare(
      `INSERT INTO bank_accounts (id, association_id, account_id, name, iban, bic)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(uuidv4(), associationId, bankRekening, 'Betaalrekening', 'NL91ABNA0417164300', 'ABNANL2A');
  }

  beforeEach(bankOpzet);

  it('leest een MT940-bestand in en zet debet en credit de goede kant op', async () => {
    // :61: heeft C voor bij en D voor af. Het bedrag staat er met een komma als
    // decimaalteken in en zonder duizendtalscheiding: dat is wat MT940
    // voorschrijft, en het is precies waar leesBedrag op moet passen.
    const mt940 = [
      ':20:STARTUP',
      ':25:NL91ABNA0417164300',
      ':60F:C260301EUR1000,00',
      ':61:2603010301C1234,56N123NONREF',
      ':86:Contributie maart',
      ':61:2603050305D250,00N123NONREF',
      ':86:Huur zaal',
      ':62F:C260331EUR1984,56',
    ].join('\n');

    const res = await alsAdmin('post', '/bank-import').send({
      accountId: bankRekening,
      format: 'mt940',
      content: mt940,
    });

    expect(res.status).toBe(201);
    expect(res.body.entryCount).toBe(2);
    // Bij is credit, af is debet - en het duizendtalpunt telt niet als komma.
    expect(res.body.totalCredit).toBeCloseTo(1234.56, 2);
    expect(res.body.totalDebit).toBeCloseTo(250, 2);

    const afschrift = (await alsAdmin('get', '/bank-statements')).body[0];
    const regels = (await alsAdmin('get', `/bank-statements/${afschrift.id}/entries`)).body.entries;
    expect(regels).toHaveLength(2);
    expect(regels[0]).toMatchObject({ amount: 1234.56, description: 'Contributie maart', status: 'pending' });
    expect(regels[1]).toMatchObject({ amount: -250, description: 'Huur zaal', status: 'pending' });
  });

  /**
   * BEWIJS - dit was een echte fout, en deze test is rood op de oude code.
   *
   * De omschrijving van een banktransactie staat in het veld :86: en loopt door
   * tot het volgende veld. De regex zocht daarvoor naar :60 of :61 en dus niet
   * naar :62F, het eindsaldo dat in elk MT940-bestand direct achter de laatste
   * :86: staat. De laatste transactie van elk ingelezen afschrift kreeg die
   * regel daardoor achter zijn omschrijving geplakt.
   *
   * Aangetoond door src/routes/accounting.ts even op HEAD te zetten (alleen dat
   * bestand) en deze reeks te draaien: zonder de reparatie is de omschrijving
   * 'Huur zaal :62F:C260331EUR1984,56'.
   */
  it('plakt het eindsaldo niet achter de omschrijving van de laatste regel', async () => {
    const mt940 = [
      ':20:STARTUP',
      ':25:NL91ABNA0417164300',
      ':60F:C260301EUR1000,00',
      ':61:2603050305D250,00N123NONREF',
      ':86:Huur zaal',
      ':62F:C260331EUR750,00',
    ].join('\n');

    await alsAdmin('post', '/bank-import').send({ accountId: bankRekening, format: 'mt940', content: mt940 });

    const afschrift = (await alsAdmin('get', '/bank-statements')).body[0];
    const regels = (await alsAdmin('get', `/bank-statements/${afschrift.id}/entries`)).body.entries;

    expect(regels).toHaveLength(1);
    expect(regels[0].description).toBe('Huur zaal');
    expect(regels[0].description).not.toContain(':62F:');
  });

  it('valt terug op een standaardtekst als er geen omschrijving bij staat', async () => {
    const mt940 = [':20:STARTUP', ':60F:C260301EUR1000,00', ':61:2603050305D250,00N123NONREF'].join('\n');

    await alsAdmin('post', '/bank-import').send({ accountId: bankRekening, format: 'mt940', content: mt940 });
    const afschrift = (await alsAdmin('get', '/bank-statements')).body[0];
    const regels = (await alsAdmin('get', `/bank-statements/${afschrift.id}/entries`)).body.entries;

    expect(regels).toHaveLength(1);
    expect(regels[0].description).toBe('Bankafschrijving');
  });

  it('geeft het afschrift met de grootboekrekening erbij terug', async () => {
    await alsAdmin('post', '/bank-import').send({
      accountId: bankRekening,
      format: 'csv',
      content: 'datum;omschrijving;bedrag\n2026-03-01;Contributie;100,00\n',
    });

    const afschriften = (await alsAdmin('get', '/bank-statements')).body;
    expect(afschriften).toHaveLength(1);
    expect(afschriften[0]).toMatchObject({
      accountId: bankRekening,
      accountCode: '1100',
      accountName: 'Bank',
      status: 'imported',
      lineCount: 1,
      totalCredit: 100,
      totalDebit: 0,
    });
  });

  it('weigert een onbekende bestandsvorm', async () => {
    const res = await alsAdmin('post', '/bank-import').send({
      accountId: bankRekening,
      format: 'excel',
      content: 'iets',
    });
    expect(res.status).toBe(400);
  });

  it('weigert een leeg bestand', async () => {
    const res = await alsAdmin('post', '/bank-import').send({
      accountId: bankRekening,
      format: 'csv',
      content: '',
    });
    expect(res.status).toBe(400);
  });

  it('weigert een rekening die geen bankrekening is', async () => {
    const kas = await rekeningId('1000');
    const res = await alsAdmin('post', '/bank-import').send({
      accountId: kas,
      format: 'csv',
      content: 'datum;omschrijving;bedrag\n2026-03-01;Contributie;100,00\n',
    });
    expect(res.status).toBe(404);
  });

  it('importeert niet op de bankrekening van een andere vereniging', async () => {
    const res = await alsB('post', '/bank-import').send({
      accountId: bankRekening,
      format: 'csv',
      content: 'datum;omschrijving;bedrag\n2026-03-01;Contributie;100,00\n',
    });
    expect(res.status).toBe(404);
    expect((await alsAdmin('get', '/bank-statements')).body).toEqual([]);
  });

  it('slaat een regel met te weinig kolommen over in plaats van er onzin van te maken', async () => {
    const res = await alsAdmin('post', '/bank-import').send({
      accountId: bankRekening,
      format: 'csv',
      content: ['datum;omschrijving;bedrag', '2026-03-01;Contributie;100,00', '2026-03-02;Halve regel'].join('\n'),
    });

    expect(res.status).toBe(201);
    expect(res.body.entryCount).toBe(1);
  });

  it('meldt netjes dat een onbekend afschrift niet bestaat', async () => {
    expect((await alsAdmin('get', `/bank-statements/${uuidv4()}/entries`)).status).toBe(404);
  });

  it('geeft het afschrift van een andere vereniging niet vrij', async () => {
    await alsAdmin('post', '/bank-import').send({
      accountId: bankRekening,
      format: 'csv',
      content: 'datum;omschrijving;bedrag\n2026-03-01;Contributie;100,00\n',
    });
    const afschrift = (await alsAdmin('get', '/bank-statements')).body[0];

    expect((await alsB('get', `/bank-statements/${afschrift.id}/entries`)).status).toBe(404);
    expect((await alsB('get', '/bank-statements')).body).toEqual([]);
  });

  it('boekt een ontvangst debet op de bank en credit op de tegenrekening', async () => {
    await alsAdmin('post', '/bank-import').send({
      accountId: bankRekening,
      format: 'csv',
      content: 'datum;omschrijving;bedrag\n2026-03-01;Contributie;250,00\n',
    });
    const afschrift = (await alsAdmin('get', '/bank-statements')).body[0];
    const regel = (await alsAdmin('get', `/bank-statements/${afschrift.id}/entries`)).body.entries[0];
    const contributie = await rekeningId('8000');

    const res = await alsAdmin('post', `/bank-statements/${afschrift.id}/lines/${regel.id}/book`).send({
      counterAccountId: contributie,
    });
    expect(res.status).toBe(200);

    const boeking = (await alsAdmin('get', `/transactions/${res.body.transactionId}`)).body;
    expect(boeking.transactionType).toBe('bank');
    expect(boeking.isPosted).toBe(true);
    expect(boeking.totalAmount).toBe(250);

    const bankregel = boeking.lines.find((l: { accountId: string }) => l.accountId === bankRekening);
    const tegenregel = boeking.lines.find((l: { accountId: string }) => l.accountId === contributie);
    // Geld erbij: de bank groeit (debet), de opbrengst staat credit.
    expect(bankregel).toMatchObject({ debitAmount: 250, creditAmount: 0 });
    expect(tegenregel).toMatchObject({ debitAmount: 0, creditAmount: 250 });
  });

  it('boekt een afschrijving credit op de bank en debet op de tegenrekening', async () => {
    await alsAdmin('post', '/bank-import').send({
      accountId: bankRekening,
      format: 'csv',
      content: 'datum;omschrijving;bedrag\n2026-03-01;Huur zaal;-400,00\n',
    });
    const afschrift = (await alsAdmin('get', '/bank-statements')).body[0];
    const regel = (await alsAdmin('get', `/bank-statements/${afschrift.id}/entries`)).body.entries[0];
    expect(regel.amount).toBe(-400);
    const huur = await rekeningId('4200');

    const res = await alsAdmin('post', `/bank-statements/${afschrift.id}/lines/${regel.id}/book`).send({
      counterAccountId: huur,
    });
    expect(res.status).toBe(200);

    const boeking = (await alsAdmin('get', `/transactions/${res.body.transactionId}`)).body;
    // Het bedrag op de boeking is de absolute waarde; de richting zit in de regels.
    expect(boeking.totalAmount).toBe(400);
    const bankregel = boeking.lines.find((l: { accountId: string }) => l.accountId === bankRekening);
    const kostenregel = boeking.lines.find((l: { accountId: string }) => l.accountId === huur);
    expect(bankregel).toMatchObject({ debitAmount: 0, creditAmount: 400 });
    expect(kostenregel).toMatchObject({ debitAmount: 400, creditAmount: 0 });
  });

  it('boekt een bankregel niet twee keer', async () => {
    await alsAdmin('post', '/bank-import').send({
      accountId: bankRekening,
      format: 'csv',
      content: 'datum;omschrijving;bedrag\n2026-03-01;Contributie;250,00\n',
    });
    const afschrift = (await alsAdmin('get', '/bank-statements')).body[0];
    const regel = (await alsAdmin('get', `/bank-statements/${afschrift.id}/entries`)).body.entries[0];
    const contributie = await rekeningId('8000');

    const eerste = await alsAdmin('post', `/bank-statements/${afschrift.id}/lines/${regel.id}/book`).send({
      counterAccountId: contributie,
    });
    expect(eerste.status).toBe(200);

    const tweede = await alsAdmin('post', `/bank-statements/${afschrift.id}/lines/${regel.id}/book`).send({
      counterAccountId: contributie,
    });
    expect(tweede.status).toBe(400);
    expect(tweede.body.error).toContain('al verwerkt');

    // En er staat maar een boeking, niet twee.
    expect((await alsAdmin('get', '/transactions')).body).toHaveLength(1);
  });

  it('eist een tegenrekening', async () => {
    await alsAdmin('post', '/bank-import').send({
      accountId: bankRekening,
      format: 'csv',
      content: 'datum;omschrijving;bedrag\n2026-03-01;Contributie;250,00\n',
    });
    const afschrift = (await alsAdmin('get', '/bank-statements')).body[0];
    const regel = (await alsAdmin('get', `/bank-statements/${afschrift.id}/entries`)).body.entries[0];

    const res = await alsAdmin('post', `/bank-statements/${afschrift.id}/lines/${regel.id}/book`).send({});
    expect(res.status).toBe(400);
    expect((await alsAdmin('get', '/transactions')).body).toEqual([]);
  });

  it('meldt netjes dat een onbekende bankregel niet bestaat', async () => {
    await alsAdmin('post', '/bank-import').send({
      accountId: bankRekening,
      format: 'csv',
      content: 'datum;omschrijving;bedrag\n2026-03-01;Contributie;250,00\n',
    });
    const afschrift = (await alsAdmin('get', '/bank-statements')).body[0];
    const contributie = await rekeningId('8000');

    const res = await alsAdmin('post', `/bank-statements/${afschrift.id}/lines/${uuidv4()}/book`).send({
      counterAccountId: contributie,
    });
    expect(res.status).toBe(404);
  });

  it('toont de geboekte regel daarna met boekstuknummer en status', async () => {
    await alsAdmin('post', '/bank-import').send({
      accountId: bankRekening,
      format: 'csv',
      content: 'datum;omschrijving;bedrag\n2026-03-01;Contributie;250,00\n',
    });
    const afschrift = (await alsAdmin('get', '/bank-statements')).body[0];
    const regel = (await alsAdmin('get', `/bank-statements/${afschrift.id}/entries`)).body.entries[0];
    const contributie = await rekeningId('8000');

    const geboekt = await alsAdmin('post', `/bank-statements/${afschrift.id}/lines/${regel.id}/book`).send({
      counterAccountId: contributie,
    });

    const na = (await alsAdmin('get', `/bank-statements/${afschrift.id}/entries`)).body.entries[0];
    expect(na.status).toBe('manual');
    expect(na.transactionId).toBe(geboekt.body.transactionId);
    expect(na.transactionNumber).toBe(geboekt.body.transactionNumber);
  });

  it('laat een gewoon lid niet importeren of boeken', async () => {
    expect((await alsLid('post', '/bank-import')).status).toBe(403);
    expect((await alsLid('get', '/bank-statements')).status).toBe(403);
  });
});
