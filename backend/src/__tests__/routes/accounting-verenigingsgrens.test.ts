/**
 * De verenigingsgrens in de boekhouding.
 *
 * accounting.test.ts dekt de leeskant: vereniging A ziet de cijfers van B
 * niet. Deze reeks gaat over de schrijfkant, en die was lekker. Elke route
 * haalt de vereniging uit het token, maar zodra een id uit de aanvraag zelf
 * kwam - een grootboekrekening, een kostenplaats, een lid - werd er niets meer
 * gecontroleerd. De sleutelcontrole van de database kijkt namelijk alleen of
 * een rij bestaat, niet bij wie hij hoort. De beheerder van A kon zo een
 * boeking op een rekening van B zetten.
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

let tokenA: string;
let tokenB: string;
let verenigingA: string;
let verenigingB: string;
let lidVanB: string;

beforeEach(() => {
  const a = createTestEnvironment();
  tokenA = a.adminToken;
  verenigingA = a.association.id;

  const b = createTestAssociation();
  verenigingB = b.id;
  const beheerderB = createTestUser(b.id, { email: 'admin-b@test.com', role: 'admin' });
  tokenB = generateTestToken(beheerderB);
  lidVanB = createTestUser(b.id, { email: 'lid-b@test.com', role: 'member' }).id;
});

const alsA = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/accounting${pad}`).set('Authorization', `Bearer ${tokenA}`);

const alsB = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/accounting${pad}`).set('Authorization', `Bearer ${tokenB}`);

async function boekjaarVoor(token: string) {
  const res = await request(app)
    .post('/api/accounting/fiscal-years')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Boekjaar 2026', startDate: '2026-01-01', endDate: '2026-12-31', isCurrent: true });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function rekeningVoor(token: string, code: string) {
  const res = await request(app).get('/api/accounting/accounts').set('Authorization', `Bearer ${token}`);
  const rekening = res.body.find((r: { code: string }) => r.code === code);
  expect(rekening, `rekening ${code} ontbreekt`).toBeTruthy();
  return rekening.id as string;
}

function maakKostenplaats(associationId: string, code: string) {
  const id = uuidv4();
  db.prepare(`INSERT INTO cost_centers (id, association_id, code, name, is_active) VALUES (?, ?, ?, ?, 1)`).run(
    id,
    associationId,
    code,
    `Kostenplaats ${code}`,
  );
  return id;
}

describe('Boekingen blijven binnen de eigen vereniging', () => {
  it('boekt niet op een grootboekrekening van een andere vereniging', async () => {
    await boekjaarVoor(tokenA);
    await alsA('post', '/accounts/initialize');
    await alsB('post', '/accounts/initialize');

    const kasVanA = await rekeningVoor(tokenA, '1000');
    const bankVanB = await rekeningVoor(tokenB, '1100');

    const res = await alsA('post', '/transactions').send({
      transactionDate: '2026-03-01',
      transactionType: 'transfer',
      description: 'Over de grens heen',
      lines: [
        { accountId: bankVanB, debitAmount: 100 },
        { accountId: kasVanA, creditAmount: 100 },
      ],
    });

    expect(res.status).toBe(400);

    // En er mag echt niets zijn blijven staan op de rekening van B.
    const regels = db.prepare('SELECT COUNT(*) AS n FROM transaction_lines WHERE account_id = ?').get(bankVanB) as any;
    expect(regels.n).toBe(0);
  });

  it('boekt niet op een kostenplaats van een andere vereniging', async () => {
    await boekjaarVoor(tokenA);
    await alsA('post', '/accounts/initialize');
    const kas = await rekeningVoor(tokenA, '1000');
    const bank = await rekeningVoor(tokenA, '1100');
    const kostenplaatsVanB = maakKostenplaats(verenigingB, 'B1');

    const res = await alsA('post', '/transactions').send({
      transactionDate: '2026-03-01',
      transactionType: 'transfer',
      description: 'Kostenplaats van de buren',
      lines: [
        { accountId: bank, debitAmount: 100, costCenterId: kostenplaatsVanB },
        { accountId: kas, creditAmount: 100 },
      ],
    });

    expect(res.status).toBe(400);
  });

  it('werkt een boeking niet bij naar een rekening van een andere vereniging', async () => {
    await boekjaarVoor(tokenA);
    await alsA('post', '/accounts/initialize');
    await alsB('post', '/accounts/initialize');
    const kas = await rekeningVoor(tokenA, '1000');
    const bank = await rekeningVoor(tokenA, '1100');
    const bankVanB = await rekeningVoor(tokenB, '1100');

    const aangemaakt = await alsA('post', '/transactions').send({
      transactionDate: '2026-03-01',
      transactionType: 'transfer',
      description: 'Gewone boeking',
      lines: [
        { accountId: bank, debitAmount: 100 },
        { accountId: kas, creditAmount: 100 },
      ],
    });
    expect(aangemaakt.status).toBe(201);

    const res = await alsA('put', `/transactions/${aangemaakt.body.id}`).send({
      transactionDate: '2026-03-01',
      transactionType: 'transfer',
      description: 'Alsnog over de grens',
      lines: [
        { accountId: bankVanB, debitAmount: 100 },
        { accountId: kas, creditAmount: 100 },
      ],
    });

    expect(res.status).toBe(400);
  });

  it('boekt een bankregel niet op een tegenrekening van een andere vereniging', async () => {
    await boekjaarVoor(tokenA);
    await alsA('post', '/accounts/initialize');
    await alsB('post', '/accounts/initialize');
    const bank = await rekeningVoor(tokenA, '1100');
    const opbrengstVanB = await rekeningVoor(tokenB, '8000');

    db.prepare(`INSERT INTO bank_accounts (id, association_id, account_id, name, iban) VALUES (?, ?, ?, ?, ?)`).run(
      'ba-a',
      verenigingA,
      bank,
      'Rekening A',
      'NL91ABNA0417164300',
    );

    const imported = await alsA('post', '/bank-import').send({
      accountId: bank,
      format: 'csv',
      content: 'datum;omschrijving;bedrag\n2026-03-01;Contributie;120,00',
    });
    expect(imported.status).toBe(201);

    const regels = await alsA('get', `/bank-statements/${imported.body.id}/entries`);
    const res = await alsA('post', `/bank-statements/${imported.body.id}/lines/${regels.body.entries[0].id}/book`).send(
      { counterAccountId: opbrengstVanB },
    );

    expect(res.status).toBe(400);
  });
});

describe('Stamgegevens blijven binnen de eigen vereniging', () => {
  it('hangt een rekening niet onder een moederrekening van een andere vereniging', async () => {
    await alsB('post', '/accounts/initialize');
    const moederVanB = await rekeningVoor(tokenB, '1000');

    const res = await alsA('post', '/accounts').send({
      code: '1001',
      name: 'Onderrekening',
      accountType: 'asset',
      parentId: moederVanB,
    });

    expect(res.status).toBe(400);
  });

  it('koppelt een contributiecategorie niet aan een opbrengstrekening van een andere vereniging', async () => {
    await alsB('post', '/accounts/initialize');
    const opbrengstVanB = await rekeningVoor(tokenB, '8000');

    const res = await alsA('post', '/membership-fee-types').send({
      name: 'Senioren',
      amount: 120,
      frequency: 'yearly',
      incomeAccountId: opbrengstVanB,
    });

    expect(res.status).toBe(400);
  });

  it('koppelt een relatie niet aan een lid van een andere vereniging', async () => {
    // De relatie zou dan de naam- en adresgegevens van iemand van B tonen in
    // de administratie van A.
    const res = await alsA('post', '/relations').send({
      relationType: 'customer',
      name: 'Overgenomen lid',
      userId: lidVanB,
    });

    expect(res.status).toBe(400);
  });

  it('factureert niet aan een relatie van een andere vereniging', async () => {
    await boekjaarVoor(tokenA);
    const relatieVanB = await alsB('post', '/relations').send({ relationType: 'customer', name: 'Klant van B' });
    expect(relatieVanB.status).toBe(201);

    const res = await alsA('post', '/invoices').send({
      invoiceType: 'sales',
      relationId: relatieVanB.body.id,
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
      lines: [{ description: 'Iets', quantity: 1, unitPrice: 10 }],
    });

    expect(res.status).toBe(400);
  });

  it('zet een factuur niet op naam van een lid van een andere vereniging', async () => {
    await boekjaarVoor(tokenA);
    const relatie = await alsA('post', '/relations').send({ relationType: 'customer', name: 'Klant van A' });

    const res = await alsA('post', '/invoices').send({
      invoiceType: 'sales',
      relationId: relatie.body.id,
      userId: lidVanB,
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
      lines: [{ description: 'Iets', quantity: 1, unitPrice: 10 }],
    });

    expect(res.status).toBe(400);
  });

  it('zet een factuurregel niet op een rekening van een andere vereniging', async () => {
    await boekjaarVoor(tokenA);
    await alsB('post', '/accounts/initialize');
    const opbrengstVanB = await rekeningVoor(tokenB, '8000');
    const relatie = await alsA('post', '/relations').send({ relationType: 'customer', name: 'Klant van A' });

    const res = await alsA('post', '/invoices').send({
      invoiceType: 'sales',
      relationId: relatie.body.id,
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
      lines: [{ description: 'Iets', quantity: 1, unitPrice: 10, accountId: opbrengstVanB }],
    });

    expect(res.status).toBe(400);
  });
});

describe('Budgetten blijven binnen de eigen vereniging', () => {
  it('maakt geen budget op een rekening van een andere vereniging', async () => {
    await alsB('post', '/accounts/initialize');
    const rekeningVanB = await rekeningVoor(tokenB, '8000');
    const boekjaar = await boekjaarVoor(tokenA);

    const res = await alsA('post', '/budgets').send({
      name: 'Budget',
      amount: 500,
      accountId: rekeningVanB,
      fiscalYearId: boekjaar,
    });
    expect(res.status).toBe(400);
  });

  it('verzet een bestaand budget niet naar een rekening van een andere vereniging', async () => {
    // POST /budgets controleerde de rekening wel en PUT niet; dat verschil
    // maakte de controle bij het aanmaken zinloos, want een wijziging erna
    // mocht wel alles.
    await alsA('post', '/accounts/initialize');
    await alsB('post', '/accounts/initialize');
    const eigenRekening = await rekeningVoor(tokenA, '8000');
    const rekeningVanB = await rekeningVoor(tokenB, '8000');
    const boekjaar = await boekjaarVoor(tokenA);

    const budget = await alsA('post', '/budgets').send({
      name: 'Budget',
      amount: 500,
      accountId: eigenRekening,
      fiscalYearId: boekjaar,
    });
    expect(budget.status).toBe(201);

    const res = await alsA('put', `/budgets/${budget.body.id}`).send({ accountId: rekeningVanB });
    expect(res.status).toBe(400);

    const opgeslagen = db.prepare('SELECT account_id FROM budgets WHERE id = ?').get(budget.body.id) as any;
    expect(opgeslagen.account_id).toBe(eigenRekening);
  });

  it('verzet een budget niet naar een boekjaar van een andere vereniging', async () => {
    await alsA('post', '/accounts/initialize');
    const eigenRekening = await rekeningVoor(tokenA, '8000');
    const boekjaar = await boekjaarVoor(tokenA);
    const boekjaarVanB = await boekjaarVoor(tokenB);

    const budget = await alsA('post', '/budgets').send({
      name: 'Budget',
      amount: 500,
      accountId: eigenRekening,
      fiscalYearId: boekjaar,
    });
    expect(budget.status).toBe(201);

    const res = await alsA('put', `/budgets/${budget.body.id}`).send({ fiscalYearId: boekjaarVanB });
    expect(res.status).toBe(400);
  });
});

describe('Wie mag de relatielijst uitvoeren', () => {
  beforeEach(async () => {
    const res = await alsA('post', '/relations').send({
      relationType: 'customer',
      name: 'Jan Jansen',
      iban: 'NL02ABNA0123456789',
      email: 'jan@example.com',
    });
    expect(res.status).toBe(201);
  });

  it('laat het bestuur niet bij IBAN, e-mail en adres van alle relaties', async () => {
    // GET /relations staat alleen open voor de beheerder. Dezelfde gegevens in
    // een CSV zijn niet minder gevoelig, dus die export hoort niet ruimer te
    // staan dan het scherm zelf.
    const bestuurder = createTestUser(verenigingA, { email: 'bestuur@test.com', role: 'admin' });
    const bestuursToken = generateTestToken({ ...bestuurder, role: 'board' as any });

    const scherm = await request(app).get('/api/accounting/relations').set('Authorization', `Bearer ${bestuursToken}`);
    expect(scherm.status).toBe(403);

    const res = await request(app)
      .get('/api/accounting/export/relations')
      .set('Authorization', `Bearer ${bestuursToken}`);
    expect(res.status).toBe(403);
  });

  it('laat de beheerder de relatielijst wel uitvoeren', async () => {
    const res = await alsA('get', '/export/relations?format=json');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].iban).toBe('NL02ABNA0123456789');
  });
});
