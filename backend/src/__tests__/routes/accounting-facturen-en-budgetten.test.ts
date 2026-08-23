/**
 * Facturen, budgetten en de exports die daarop steunen.
 *
 * accounting-geld.test.ts rekent de factuurbedragen na bij het aanmaken en het
 * afboeken; accounting-status.test.ts dekt de statusovergangen. Wat overbleef
 * is het factuurdetail met zijn regels, de vier filters op het overzicht, en
 * de hele budgetmodule - inclusief de begrotingsvergelijking, waar een
 * verschil tussen begroot en werkelijk met een teken en een percentage naar
 * buiten komt.
 *
 * De CSV-opmaak zelf zit in utils/csv.ts en is daar getest. Hier gaat het om
 * wat de routes eromheen doen: welke rijen ze kiezen, welke rechten ze eisen,
 * en of de bedragen kloppen.
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
let boardToken: string;
let associationId: string;
let tokenB: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  memberToken = omgeving.memberToken;
  associationId = omgeving.association.id;

  // De budget- en exportroutes laten naast de beheerder ook het bestuur toe.
  const bestuurder = createTestUser(associationId, { email: 'bestuur@test.com' });
  boardToken = generateTestToken({ ...bestuurder, role: 'board' as any });

  const b = createTestAssociation();
  tokenB = generateTestToken(createTestUser(b.id, { email: 'admin-b@test.com', role: 'admin' }));
});

const alsAdmin = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/accounting${pad}`).set('Authorization', `Bearer ${adminToken}`);

const alsLid = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/accounting${pad}`).set('Authorization', `Bearer ${memberToken}`);

const alsBestuur = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/accounting${pad}`).set('Authorization', `Bearer ${boardToken}`);

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

async function maakRelatie(naam: string) {
  const res = await alsAdmin('post', '/relations').send({ relationType: 'customer', name: naam });
  expect(res.status).toBe(201);
  return res.body.id as string;
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

// =====================================================
// HET FACTUURDETAIL
// =====================================================

describe('Een factuur in detail', () => {
  beforeEach(async () => {
    await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
  });

  it('geeft de regels met bedragen, btw en rekening terug', async () => {
    const relatie = await maakRelatie('Muziekhandel');
    const contributie = await rekeningId('8000');
    const kostenplaats = maakKostenplaats('KP-01');

    const gemaakt = await alsAdmin('post', '/invoices').send({
      invoiceType: 'sales',
      relationId: relatie,
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
      reference: 'REF-1',
      description: 'Voorjaarsnota',
      notes: 'Interne notitie',
      lines: [
        {
          description: 'Contributie',
          quantity: 2,
          unitPrice: 60,
          vatRate: 21,
          accountId: contributie,
          costCenterId: kostenplaats,
        },
        { description: 'Bladmuziek', quantity: 1, unitPrice: 40, vatRate: 9 },
      ],
    });
    expect(gemaakt.status).toBe(201);

    const res = await alsAdmin('get', `/invoices/${gemaakt.body.id}`);
    expect(res.status).toBe(200);

    // 2 x 60 = 120 met 21% is 25,20; 1 x 40 met 9% is 3,60.
    expect(res.body).toMatchObject({
      invoiceNumber: gemaakt.body.invoiceNumber,
      invoiceType: 'sales',
      status: 'draft',
      relationName: 'Muziekhandel',
      reference: 'REF-1',
      description: 'Voorjaarsnota',
      notes: 'Interne notitie',
      subtotal: 160,
      vatAmount: 28.8,
      total: 188.8,
      amountPaid: 0,
      amountDue: 188.8,
    });

    expect(res.body.lines).toHaveLength(2);
    expect(res.body.lines[0]).toMatchObject({
      lineNumber: 1,
      description: 'Contributie',
      quantity: 2,
      unitPrice: 60,
      vatRate: 21,
      vatAmount: 25.2,
      lineTotal: 120,
      accountCode: '8000',
      accountName: 'Contributie',
      costCenterCode: 'KP-01',
    });
    expect(res.body.lines[1]).toMatchObject({
      lineNumber: 2,
      lineTotal: 40,
      vatAmount: 3.6,
      accountId: null,
      costCenterId: null,
    });

    // Het totaal is de som van de regels plus de som van de btw.
    const regelSom = res.body.lines.reduce((s: number, l: { lineTotal: number }) => s + l.lineTotal, 0);
    const btwSom = res.body.lines.reduce((s: number, l: { vatAmount: number }) => s + l.vatAmount, 0);
    expect(res.body.subtotal).toBeCloseTo(regelSom, 2);
    expect(res.body.vatAmount).toBeCloseTo(btwSom, 2);
    expect(res.body.total).toBeCloseTo(regelSom + btwSom, 2);
  });

  it('laat het openstaande bedrag meelopen met de betalingen', async () => {
    const relatie = await maakRelatie('Muziekhandel');
    const gemaakt = await alsAdmin('post', '/invoices').send({
      invoiceType: 'sales',
      relationId: relatie,
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
      lines: [{ description: 'Contributie', quantity: 1, unitPrice: 100 }],
    });

    await alsAdmin('post', `/invoices/${gemaakt.body.id}/mark-paid`).send({ amount: 30 });
    let detail = (await alsAdmin('get', `/invoices/${gemaakt.body.id}`)).body;
    expect(detail).toMatchObject({ status: 'partial', amountPaid: 30, amountDue: 70 });

    await alsAdmin('post', `/invoices/${gemaakt.body.id}/mark-paid`).send({ amount: 70 });
    detail = (await alsAdmin('get', `/invoices/${gemaakt.body.id}`)).body;
    expect(detail).toMatchObject({ status: 'paid', amountPaid: 100, amountDue: 0 });
    expect(detail.paidAt).toBeTruthy();
  });

  it('rekent een regel met hoeveelheid nul door naar een nulfactuur', async () => {
    const relatie = await maakRelatie('Muziekhandel');
    const gemaakt = await alsAdmin('post', '/invoices').send({
      invoiceType: 'sales',
      relationId: relatie,
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
      lines: [{ description: 'Niets geleverd', quantity: 0, unitPrice: 60, vatRate: 21 }],
    });
    expect(gemaakt.status).toBe(201);

    const detail = (await alsAdmin('get', `/invoices/${gemaakt.body.id}`)).body;
    expect(detail.subtotal).toBe(0);
    expect(detail.vatAmount).toBe(0);
    expect(detail.total).toBe(0);
    expect(detail.amountDue).toBe(0);
  });

  it('weigert een negatieve hoeveelheid', async () => {
    const relatie = await maakRelatie('Muziekhandel');
    const res = await alsAdmin('post', '/invoices').send({
      invoiceType: 'sales',
      relationId: relatie,
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
      lines: [{ description: 'Retour', quantity: -1, unitPrice: 60 }],
    });
    expect(res.status).toBe(400);
  });

  it('weigert een btw-tarief boven de honderd procent', async () => {
    const relatie = await maakRelatie('Muziekhandel');
    const res = await alsAdmin('post', '/invoices').send({
      invoiceType: 'sales',
      relationId: relatie,
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
      lines: [{ description: 'Contributie', quantity: 1, unitPrice: 60, vatRate: 150 }],
    });
    expect(res.status).toBe(400);
  });

  it('meldt netjes dat een onbekende factuur niet bestaat', async () => {
    expect((await alsAdmin('get', `/invoices/${uuidv4()}`)).status).toBe(404);
  });

  it('geeft een factuur van een andere vereniging niet vrij', async () => {
    const relatie = await maakRelatie('Muziekhandel');
    const gemaakt = await alsAdmin('post', '/invoices').send({
      invoiceType: 'sales',
      relationId: relatie,
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
      lines: [{ description: 'Contributie', quantity: 1, unitPrice: 100 }],
    });

    expect((await alsB('get', `/invoices/${gemaakt.body.id}`)).status).toBe(404);
  });

  it('laat een gewoon lid geen factuur inzien', async () => {
    expect((await alsLid('get', `/invoices/${uuidv4()}`)).status).toBe(403);
  });
});

// =====================================================
// HET FACTUUROVERZICHT
// =====================================================

describe('Het factuuroverzicht', () => {
  let relatieEen: string;
  let relatieTwee: string;

  beforeEach(async () => {
    await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
    relatieEen = await maakRelatie('Muziekhandel');
    relatieTwee = await maakRelatie('Zaalverhuur');
  });

  async function maakFactuur(relationId: string, bedrag: number, type = 'sales') {
    const res = await alsAdmin('post', '/invoices').send({
      invoiceType: type,
      relationId,
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
      lines: [{ description: 'Regel', quantity: 1, unitPrice: bedrag }],
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  it('begint leeg', async () => {
    const res = await alsAdmin('get', '/invoices');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('toont het openstaande bedrag naast het totaal', async () => {
    const factuur = await maakFactuur(relatieEen, 200);
    await alsAdmin('post', `/invoices/${factuur}/mark-paid`).send({ amount: 50 });

    const res = await alsAdmin('get', '/invoices');
    expect(res.body[0]).toMatchObject({
      total: 200,
      amountPaid: 50,
      amountDue: 150,
      relationName: 'Muziekhandel',
      createdByName: 'Admin User',
    });
  });

  it('filtert op status', async () => {
    const eerste = await maakFactuur(relatieEen, 100);
    await maakFactuur(relatieEen, 200);
    await alsAdmin('post', `/invoices/${eerste}/send`);

    expect((await alsAdmin('get', '/invoices?status=draft')).body).toHaveLength(1);
    const verzonden = (await alsAdmin('get', '/invoices?status=sent')).body;
    expect(verzonden).toHaveLength(1);
    expect(verzonden[0].id).toBe(eerste);
  });

  it('filtert op factuursoort', async () => {
    await maakFactuur(relatieEen, 100, 'sales');
    await maakFactuur(relatieEen, 200, 'purchase');
    await maakFactuur(relatieEen, 300, 'credit_note');

    expect((await alsAdmin('get', '/invoices?type=sales')).body).toHaveLength(1);
    expect((await alsAdmin('get', '/invoices?type=purchase')).body).toHaveLength(1);
    expect((await alsAdmin('get', '/invoices?type=credit_note')).body).toHaveLength(1);
  });

  it('filtert op relatie', async () => {
    await maakFactuur(relatieEen, 100);
    await maakFactuur(relatieTwee, 200);

    const res = await alsAdmin('get', `/invoices?relationId=${relatieTwee}`);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].relationName).toBe('Zaalverhuur');
  });

  it('filtert op boekjaar', async () => {
    await maakFactuur(relatieEen, 100);
    const boekjaar = (await alsAdmin('get', '/fiscal-years')).body[0].id;

    expect((await alsAdmin('get', `/invoices?fiscalYearId=${boekjaar}`)).body).toHaveLength(1);
    expect((await alsAdmin('get', `/invoices?fiscalYearId=${uuidv4()}`)).body).toHaveLength(0);
  });

  it('combineert soort en relatie', async () => {
    await maakFactuur(relatieEen, 100, 'sales');
    await maakFactuur(relatieEen, 200, 'purchase');
    await maakFactuur(relatieTwee, 300, 'sales');

    const res = await alsAdmin('get', `/invoices?type=sales&relationId=${relatieEen}`);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].total).toBe(100);
  });

  it('toont de facturen van een andere vereniging niet', async () => {
    await maakFactuur(relatieEen, 100);
    expect((await alsB('get', '/invoices')).body).toEqual([]);
  });

  it('laat een gewoon lid niet bij het overzicht', async () => {
    expect((await alsLid('get', '/invoices')).status).toBe(403);
  });
});

// =====================================================
// BUDGETTEN
// =====================================================

describe('Budgetten', () => {
  let boekjaar: string;
  let huur: string;
  let bank: string;

  beforeEach(async () => {
    boekjaar = await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
    huur = await rekeningId('4200');
    bank = await rekeningId('1100');
  });

  async function maakBudget(overschrijf: Record<string, unknown> = {}) {
    const res = await alsAdmin('post', '/budgets').send({
      name: 'Zaalhuur',
      amount: 1000,
      accountId: huur,
      fiscalYearId: boekjaar,
      ...overschrijf,
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  /** Boekt kosten op de huurrekening en zet de boeking definitief. */
  async function boekKosten(bedrag: number, kostenplaatsId?: string) {
    const res = await alsAdmin('post', '/transactions').send({
      transactionDate: '2026-04-01',
      transactionType: 'journal',
      description: 'Huur',
      lines: [
        { accountId: huur, debitAmount: bedrag, costCenterId: kostenplaatsId },
        { accountId: bank, creditAmount: bedrag },
      ],
    });
    expect(res.status).toBe(201);
    expect((await alsAdmin('post', `/transactions/${res.body.id}/post`)).status).toBe(200);
    return res.body.id as string;
  }

  it('eist een naam en een rekening', async () => {
    expect((await alsAdmin('post', '/budgets').send({ amount: 100, fiscalYearId: boekjaar })).status).toBe(400);
    expect((await alsAdmin('post', '/budgets').send({ name: 'Zonder rekening', fiscalYearId: boekjaar })).status).toBe(
      400,
    );
  });

  it('eist een boekjaar', async () => {
    const res = await alsAdmin('post', '/budgets').send({ name: 'Zaalhuur', amount: 1000, accountId: huur });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Boekjaar');
  });

  it('weigert een rekening die niet bestaat', async () => {
    const res = await alsAdmin('post', '/budgets').send({
      name: 'Zaalhuur',
      amount: 1000,
      accountId: uuidv4(),
      fiscalYearId: boekjaar,
    });
    expect(res.status).toBe(400);
  });

  it('leidt de budgetsoort af uit de rekening', async () => {
    const opbrengst = await rekeningId('8000');
    const kosten = await maakBudget();
    const inkomsten = await maakBudget({ name: 'Contributie', accountId: opbrengst });

    const soorten = db.prepare('SELECT id, budget_type FROM budgets WHERE id IN (?, ?)').all(kosten, inkomsten) as {
      id: string;
      budget_type: string;
    }[];
    expect(soorten.find((b) => b.id === kosten)!.budget_type).toBe('expense');
    expect(soorten.find((b) => b.id === inkomsten)!.budget_type).toBe('income');
  });

  it('staat een budget van nul toe', async () => {
    const id = await maakBudget({ name: 'Nul', amount: 0 });
    expect((await alsAdmin('get', `/budgets/${id}`)).body.amount).toBe(0);
  });

  it('telt alleen definitieve boekingen mee als werkelijk bedrag', async () => {
    const id = await maakBudget();

    // Een concept telt niet mee.
    const concept = await alsAdmin('post', '/transactions').send({
      transactionDate: '2026-04-01',
      transactionType: 'journal',
      description: 'Nog concept',
      lines: [
        { accountId: huur, debitAmount: 300 },
        { accountId: bank, creditAmount: 300 },
      ],
    });
    expect(concept.status).toBe(201);

    let budget = (await alsAdmin('get', '/budgets')).body.find((b: { id: string }) => b.id === id);
    expect(budget.actual).toBe(0);
    expect(budget.remaining).toBe(1000);

    await boekKosten(250);

    budget = (await alsAdmin('get', '/budgets')).body.find((b: { id: string }) => b.id === id);
    expect(budget.actual).toBe(250);
    expect(budget.remaining).toBe(750);
  });

  it('laat het restant negatief worden bij een overschrijding', async () => {
    const id = await maakBudget({ amount: 100 });
    await boekKosten(175.5);

    const budget = (await alsAdmin('get', '/budgets')).body.find((b: { id: string }) => b.id === id);
    expect(budget.actual).toBeCloseTo(175.5, 2);
    expect(budget.remaining).toBeCloseTo(-75.5, 2);
  });

  it('houdt een budget met kostenplaats bij die kostenplaats', async () => {
    const concerten = maakKostenplaats('KP-01', 'Concerten');
    const repetities = maakKostenplaats('KP-02', 'Repetities');
    const id = await maakBudget({ costCenterId: concerten });

    await boekKosten(200, repetities);
    let budget = (await alsAdmin('get', '/budgets')).body.find((b: { id: string }) => b.id === id);
    expect(budget.actual).toBe(0);

    await boekKosten(120, concerten);
    budget = (await alsAdmin('get', '/budgets')).body.find((b: { id: string }) => b.id === id);
    expect(budget.actual).toBe(120);
    expect(budget.costCenterName).toBe('Concerten');
  });

  it('filtert het overzicht op boekjaar', async () => {
    await maakBudget();
    const ander = await alsAdmin('post', '/fiscal-years').send({
      name: 'Boekjaar 2027',
      startDate: '2027-01-01',
      endDate: '2027-12-31',
    });
    await maakBudget({ name: 'Zaalhuur 2027', fiscalYearId: ander.body.id });

    expect((await alsAdmin('get', '/budgets')).body).toHaveLength(2);
    const van2026 = (await alsAdmin('get', `/budgets?fiscalYearId=${boekjaar}`)).body;
    expect(van2026).toHaveLength(1);
    expect(van2026[0].fiscalYearName).toBe('Boekjaar 2026');
  });

  it('geeft een enkel budget terug met rekening en boekjaar erbij', async () => {
    const id = await maakBudget({ notes: 'Toelichting' });

    const res = await alsAdmin('get', `/budgets/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Zaalhuur',
      amount: 1000,
      accountId: huur,
      accountCode: '4200',
      accountName: 'Huur',
      fiscalYearId: boekjaar,
      fiscalYearName: 'Boekjaar 2026',
      notes: 'Toelichting',
    });
  });

  it('werkt naam, bedrag en notitie bij', async () => {
    const id = await maakBudget();

    const res = await alsAdmin('put', `/budgets/${id}`).send({
      name: 'Zaalhuur nieuw',
      amount: 1500,
      notes: 'Herzien',
    });
    expect(res.status).toBe(200);

    const budget = (await alsAdmin('get', `/budgets/${id}`)).body;
    expect(budget).toMatchObject({ name: 'Zaalhuur nieuw', amount: 1500, notes: 'Herzien' });
  });

  it('laat een leeg verzoek het budget ongemoeid', async () => {
    const id = await maakBudget();
    expect((await alsAdmin('put', `/budgets/${id}`).send({})).status).toBe(200);
    expect((await alsAdmin('get', `/budgets/${id}`)).body.amount).toBe(1000);
  });

  it('haalt de kostenplaats ook weer los', async () => {
    const concerten = maakKostenplaats('KP-01');
    const id = await maakBudget({ costCenterId: concerten });

    expect((await alsAdmin('put', `/budgets/${id}`).send({ costCenterId: null })).status).toBe(200);
    expect((await alsAdmin('get', `/budgets/${id}`)).body.costCenterId).toBeNull();
  });

  it('verzet een budget naar een andere eigen rekening en telt daar opnieuw op', async () => {
    const energie = await rekeningId('4300');
    const id = await maakBudget();
    await boekKosten(300); // op de huurrekening

    expect((await alsAdmin('get', '/budgets')).body.find((b: { id: string }) => b.id === id).actual).toBe(300);

    expect((await alsAdmin('put', `/budgets/${id}`).send({ accountId: energie })).status).toBe(200);

    const na = (await alsAdmin('get', '/budgets')).body.find((b: { id: string }) => b.id === id);
    expect(na.accountId).toBe(energie);
    expect(na.accountCode).toBe('4300');
    // De boeking stond op de huur, dus op de energierekening staat nog niets.
    expect(na.actual).toBe(0);
    expect(na.remaining).toBe(1000);
  });

  it('verzet een budget naar een ander eigen boekjaar', async () => {
    const id = await maakBudget();
    const ander = await alsAdmin('post', '/fiscal-years').send({
      name: 'Boekjaar 2027',
      startDate: '2027-01-01',
      endDate: '2027-12-31',
    });

    expect((await alsAdmin('put', `/budgets/${id}`).send({ fiscalYearId: ander.body.id })).status).toBe(200);

    const na = (await alsAdmin('get', `/budgets/${id}`)).body;
    expect(na.fiscalYearId).toBe(ander.body.id);
    expect(na.fiscalYearName).toBe('Boekjaar 2027');
    expect((await alsAdmin('get', `/budgets?fiscalYearId=${boekjaar}`)).body).toEqual([]);
  });

  it('meldt netjes dat een onbekend budget niet bestaat', async () => {
    expect((await alsAdmin('get', `/budgets/${uuidv4()}`)).status).toBe(404);
    expect((await alsAdmin('put', `/budgets/${uuidv4()}`).send({ name: 'X' })).status).toBe(404);
    expect((await alsAdmin('delete', `/budgets/${uuidv4()}`)).status).toBe(404);
  });

  it('verwijdert een budget', async () => {
    const id = await maakBudget();
    expect((await alsAdmin('delete', `/budgets/${id}`)).status).toBe(200);
    expect((await alsAdmin('get', `/budgets/${id}`)).status).toBe(404);
  });

  it('houdt de budgetten van twee verenigingen uit elkaar', async () => {
    const id = await maakBudget();

    expect((await alsB('get', '/budgets')).body).toEqual([]);
    expect((await alsB('get', `/budgets/${id}`)).status).toBe(404);
    expect((await alsB('put', `/budgets/${id}`).send({ amount: 1 })).status).toBe(404);
    expect((await alsB('delete', `/budgets/${id}`)).status).toBe(404);
    expect((await alsAdmin('get', `/budgets/${id}`)).body.amount).toBe(1000);
  });

  it('laat het bestuur budgetten lezen en aanmaken maar niet verwijderen', async () => {
    const res = await alsBestuur('post', '/budgets').send({
      name: 'Door het bestuur',
      amount: 500,
      accountId: huur,
      fiscalYearId: boekjaar,
    });
    expect(res.status).toBe(201);
    expect((await alsBestuur('get', '/budgets')).status).toBe(200);
    expect((await alsBestuur('put', `/budgets/${res.body.id}`).send({ amount: 600 })).status).toBe(200);

    // Verwijderen is alleen voor de beheerder.
    expect((await alsBestuur('delete', `/budgets/${res.body.id}`)).status).toBe(403);
    expect((await alsAdmin('get', `/budgets/${res.body.id}`)).body.amount).toBe(600);
  });

  it('laat een gewoon lid nergens bij de budgetten', async () => {
    const id = await maakBudget();
    expect((await alsLid('get', '/budgets')).status).toBe(403);
    expect((await alsLid('get', `/budgets/${id}`)).status).toBe(403);
    expect((await alsLid('post', '/budgets').send({})).status).toBe(403);
    expect((await alsLid('put', `/budgets/${id}`).send({})).status).toBe(403);
    expect((await alsLid('delete', `/budgets/${id}`)).status).toBe(403);
  });
});

// =====================================================
// DE BEGROTINGSVERGELIJKING
// =====================================================

describe('De begrotingsvergelijking', () => {
  let boekjaar: string;
  let huur: string;
  let bank: string;

  beforeEach(async () => {
    boekjaar = await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
    huur = await rekeningId('4200');
    bank = await rekeningId('1100');
  });

  async function maakBudget(bedrag: number, naam = 'Zaalhuur', accountId?: string) {
    const res = await alsAdmin('post', '/budgets').send({
      name: naam,
      amount: bedrag,
      accountId: accountId ?? huur,
      fiscalYearId: boekjaar,
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function boekKosten(bedrag: number, accountId?: string) {
    const res = await alsAdmin('post', '/transactions').send({
      transactionDate: '2026-04-01',
      transactionType: 'journal',
      description: 'Kosten',
      lines: [
        { accountId: accountId ?? huur, debitAmount: bedrag },
        { accountId: bank, creditAmount: bedrag },
      ],
    });
    expect(res.status).toBe(201);
    await alsAdmin('post', `/transactions/${res.body.id}/post`);
  }

  it('eist een boekjaar', async () => {
    const res = await alsAdmin('get', '/reports/budget-comparison');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Boekjaar');
  });

  it('meldt een budget zonder besteding als nul procent en status ok', async () => {
    await maakBudget(1000);

    const res = await alsAdmin('get', `/reports/budget-comparison?fiscalYearId=${boekjaar}`);
    expect(res.status).toBe(200);
    expect(res.body.budgets[0]).toMatchObject({
      name: 'Zaalhuur',
      budgetAmount: 1000,
      actualAmount: 0,
      variance: 1000,
      percentUsed: 0,
      status: 'ok',
    });
  });

  it('rekent het verschil en het percentage uit', async () => {
    await maakBudget(1000);
    await boekKosten(400);

    const rij = (await alsAdmin('get', `/reports/budget-comparison?fiscalYearId=${boekjaar}`)).body.budgets[0];
    expect(rij.actualAmount).toBe(400);
    expect(rij.variance).toBe(600);
    expect(rij.percentUsed).toBe(40);
    expect(rij.status).toBe('ok');
  });

  it('slaat om naar waarschuwing boven de tachtig procent', async () => {
    await maakBudget(1000);
    await boekKosten(850);

    const rij = (await alsAdmin('get', `/reports/budget-comparison?fiscalYearId=${boekjaar}`)).body.budgets[0];
    expect(rij.percentUsed).toBe(85);
    expect(rij.status).toBe('warning');
  });

  it('blijft op precies tachtig procent nog op ok', async () => {
    await maakBudget(1000);
    await boekKosten(800);

    const rij = (await alsAdmin('get', `/reports/budget-comparison?fiscalYearId=${boekjaar}`)).body.budgets[0];
    expect(rij.percentUsed).toBe(80);
    expect(rij.status).toBe('ok');
  });

  it('meldt een overschrijding met een negatief verschil', async () => {
    await maakBudget(1000);
    await boekKosten(1250);

    const rij = (await alsAdmin('get', `/reports/budget-comparison?fiscalYearId=${boekjaar}`)).body.budgets[0];
    expect(rij.actualAmount).toBe(1250);
    expect(rij.variance).toBe(-250);
    expect(rij.percentUsed).toBe(125);
    expect(rij.status).toBe('over');
  });

  it('deelt niet door nul bij een budget van nul', async () => {
    await maakBudget(0);
    await boekKosten(100);

    const rij = (await alsAdmin('get', `/reports/budget-comparison?fiscalYearId=${boekjaar}`)).body.budgets[0];
    expect(rij.percentUsed).toBe(0);
    expect(rij.variance).toBe(-100);
    expect(Number.isFinite(rij.percentUsed)).toBe(true);
  });

  it('telt de totalen over alle budgetten op', async () => {
    const energie = await rekeningId('4300');
    await maakBudget(1000, 'Zaalhuur');
    await maakBudget(500, 'Energie', energie);
    await boekKosten(400);
    await boekKosten(600, energie);

    const totalen = (await alsAdmin('get', `/reports/budget-comparison?fiscalYearId=${boekjaar}`)).body.totals;
    expect(totalen.totalBudget).toBe(1500);
    expect(totalen.totalActual).toBe(1000);
    // Begroot min werkelijk, dus 1500 - 1000; de overschrijding op energie
    // wordt weggestreept tegen de ruimte op de zaalhuur.
    expect(totalen.totalVariance).toBe(500);
  });

  it('telt een boeking uit een ander boekjaar niet mee', async () => {
    await maakBudget(1000);
    await boekKosten(400);

    const ander = await alsAdmin('post', '/fiscal-years').send({
      name: 'Boekjaar 2027',
      startDate: '2027-01-01',
      endDate: '2027-12-31',
    });
    const res = await alsAdmin('get', `/reports/budget-comparison?fiscalYearId=${ander.body.id}`);
    expect(res.body.budgets).toEqual([]);
    expect(res.body.totals.totalBudget).toBe(0);
  });

  it('telt de boekingen van een andere vereniging niet mee', async () => {
    await maakBudget(1000);
    await boekKosten(400);

    const res = await alsB('get', `/reports/budget-comparison?fiscalYearId=${boekjaar}`);
    expect(res.body.budgets).toEqual([]);
  });

  it('laat het bestuur erbij en een gewoon lid niet', async () => {
    expect((await alsBestuur('get', `/reports/budget-comparison?fiscalYearId=${boekjaar}`)).status).toBe(200);
    expect((await alsLid('get', `/reports/budget-comparison?fiscalYearId=${boekjaar}`)).status).toBe(403);
  });
});

// =====================================================
// EXPORTS
// =====================================================

describe('Exports', () => {
  let boekjaar: string;
  let huur: string;
  let bank: string;

  beforeEach(async () => {
    boekjaar = await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
    huur = await rekeningId('4200');
    bank = await rekeningId('1100');
  });

  async function boekKosten(bedrag: number, definitief = true) {
    const res = await alsAdmin('post', '/transactions').send({
      transactionDate: '2026-04-01',
      transactionType: 'journal',
      reference: 'REF-1',
      description: 'Zaalhuur april',
      lines: [
        { accountId: huur, debitAmount: bedrag, description: 'Huur' },
        { accountId: bank, creditAmount: bedrag, description: 'Van de bank' },
      ],
    });
    expect(res.status).toBe(201);
    if (definitief) await alsAdmin('post', `/transactions/${res.body.id}/post`);
    return res.body.id as string;
  }

  it('geeft het grootboek als JSON met een regel per boekingsregel', async () => {
    await boekKosten(300);

    const res = await alsAdmin('get', '/export/transactions?format=json');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    const debet = res.body.find((r: { account_code: string }) => r.account_code === '4200');
    const credit = res.body.find((r: { account_code: string }) => r.account_code === '1100');
    expect(debet).toMatchObject({ debit_amount: 300, credit_amount: 0, transaction_description: 'Zaalhuur april' });
    expect(credit).toMatchObject({ debit_amount: 0, credit_amount: 300 });
  });

  it('levert het grootboek standaard als CSV met een BOM voor Excel', async () => {
    await boekKosten(300);

    const res = await alsAdmin('get', '/export/transactions');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('grootboek_');
    expect(res.text.startsWith('﻿')).toBe(true);
    expect(res.text).toContain('Boekstuknummer');
    expect(res.text).toContain('Zaalhuur april');
  });

  it('filtert het grootboek op boekjaar', async () => {
    await boekKosten(300);

    expect((await alsAdmin('get', `/export/transactions?fiscalYearId=${boekjaar}&format=json`)).body).toHaveLength(2);
    expect((await alsAdmin('get', `/export/transactions?fiscalYearId=${uuidv4()}&format=json`)).body).toEqual([]);
  });

  it('exporteert het grootboek van een andere vereniging niet', async () => {
    await boekKosten(300);
    expect((await alsB('get', '/export/transactions?format=json')).body).toEqual([]);
  });

  /**
   * BEWIJS - dit was een echte fout, en alle drie de tests hieronder zijn rood
   * op de oude code.
   *
   * De parameterlijst van /export/accounts begon met de vereniging en kreeg
   * die aan het eind bij .all() nog een keer mee. De query kreeg daardoor
   * altijd een parameter te veel: een zonder boekjaar, twee met. De export
   * liep dus in beide takken stuk en gaf een 500 - niet in een grensgeval maar
   * bij elke aanroep. Dat kon zo lang blijven staan omdat geen enkele test
   * deze route aanriep; hij stond in het dekkingsrapport volledig rood.
   *
   * Aangetoond door src/routes/accounting.ts even op HEAD te zetten (alleen
   * dat bestand) en deze reeks te draaien: zonder de reparatie geeft elke
   * aanroep van /export/accounts een 500.
   */
  it('geeft het rekeningschema met saldi terug', async () => {
    await boekKosten(300);

    const res = await alsAdmin('get', `/export/accounts?fiscalYearId=${boekjaar}&format=json`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(23);

    const huurRij = res.body.find((r: { code: string }) => r.code === '4200');
    expect(huurRij).toMatchObject({ total_debit: 300, total_credit: 0, current_balance: 300 });

    const bankRij = res.body.find((r: { code: string }) => r.code === '1100');
    expect(bankRij).toMatchObject({ total_debit: 0, total_credit: 300, current_balance: -300 });

    // Zonder boekingen blijft het saldo het beginsaldo.
    const kasRij = res.body.find((r: { code: string }) => r.code === '1000');
    expect(kasRij.current_balance).toBe(0);
  });

  it('laat het rekeningschema zonder boekjaar alle saldi op nul staan', async () => {
    await boekKosten(300);

    const res = await alsAdmin('get', '/export/accounts?format=json');
    const huurRij = res.body.find((r: { code: string }) => r.code === '4200');
    // Zonder boekjaar wordt er niets opgeteld; dat is de vorm van de query.
    expect(huurRij.total_debit).toBe(0);
    expect(huurRij.current_balance).toBe(0);
  });

  it('geeft de facturen met hun bedragen terug', async () => {
    const relatie = await maakRelatie('Muziekhandel');
    const factuur = await alsAdmin('post', '/invoices').send({
      invoiceType: 'sales',
      relationId: relatie,
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
      lines: [{ description: 'Contributie', quantity: 2, unitPrice: 50, vatRate: 21 }],
    });
    expect(factuur.status).toBe(201);
    await alsAdmin('post', `/invoices/${factuur.body.id}/mark-paid`).send({ amount: 40 });

    const res = await alsAdmin('get', '/export/invoices?format=json');
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      relation_name: 'Muziekhandel',
      subtotal: 100,
      vat_amount: 21,
      total: 121,
      amount_paid: 40,
      status: 'partial',
    });
  });

  it('filtert de facturenexport op boekjaar', async () => {
    const relatie = await maakRelatie('Muziekhandel');
    await alsAdmin('post', '/invoices').send({
      invoiceType: 'sales',
      relationId: relatie,
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
      lines: [{ description: 'Contributie', quantity: 1, unitPrice: 50 }],
    });

    expect((await alsAdmin('get', `/export/invoices?fiscalYearId=${boekjaar}&format=json`)).body).toHaveLength(1);
    expect((await alsAdmin('get', `/export/invoices?fiscalYearId=${uuidv4()}&format=json`)).body).toEqual([]);
  });

  it('eist een boekjaar voor de balans en de winst-en-verliesrekening', async () => {
    expect((await alsAdmin('get', '/export/balance-sheet?format=json')).status).toBe(400);
    expect((await alsAdmin('get', '/export/profit-loss?format=json')).status).toBe(400);
  });

  it('zet in de balans alleen bezit, schuld en vermogen', async () => {
    await boekKosten(300);

    const res = await alsAdmin('get', `/export/balance-sheet?fiscalYearId=${boekjaar}&format=json`);
    expect(res.status).toBe(200);
    const soorten = new Set(res.body.map((r: { account_type: string }) => r.account_type));
    expect(soorten).toEqual(new Set(['asset', 'liability', 'equity']));

    const bankRij = res.body.find((r: { code: string }) => r.code === '1100');
    expect(bankRij).toMatchObject({ total_credit: 300, current_balance: -300 });
  });

  it('telt in de winst-en-verliesrekening de opbrengsten credit en de kosten debet', async () => {
    const contributie = await rekeningId('8000');
    await boekKosten(300);
    const opbrengst = await alsAdmin('post', '/transactions').send({
      transactionDate: '2026-04-02',
      transactionType: 'receipt',
      description: 'Contributie',
      lines: [
        { accountId: bank, debitAmount: 900 },
        { accountId: contributie, creditAmount: 900 },
      ],
    });
    await alsAdmin('post', `/transactions/${opbrengst.body.id}/post`);

    const res = await alsAdmin('get', `/export/profit-loss?fiscalYearId=${boekjaar}&format=json`);
    expect(res.status).toBe(200);

    const contributieRij = res.body.accounts.find((r: { code: string }) => r.code === '8000');
    const huurRij = res.body.accounts.find((r: { code: string }) => r.code === '4200');
    expect(contributieRij.amount).toBe(900);
    expect(huurRij.amount).toBe(300);

    expect(res.body.totals).toMatchObject({ totalIncome: 900, totalExpenses: 300, netResult: 600 });
  });

  it('meldt een verlies als een negatief resultaat', async () => {
    await boekKosten(300);

    const totalen = (await alsAdmin('get', `/export/profit-loss?fiscalYearId=${boekjaar}&format=json`)).body.totals;
    expect(totalen.totalIncome).toBe(0);
    expect(totalen.totalExpenses).toBe(300);
    expect(totalen.netResult).toBe(-300);
  });

  it('laat een concept-boeking buiten de balans en de winst-en-verliesrekening', async () => {
    await boekKosten(300, false);

    const balans = (await alsAdmin('get', `/export/balance-sheet?fiscalYearId=${boekjaar}&format=json`)).body;
    expect(balans.find((r: { code: string }) => r.code === '1100').current_balance).toBe(0);

    const wenv = (await alsAdmin('get', `/export/profit-loss?fiscalYearId=${boekjaar}&format=json`)).body;
    expect(wenv.totals.totalExpenses).toBe(0);
  });

  it('zet de totalen onderaan de winst-en-verliesexport in CSV', async () => {
    await boekKosten(300);

    const res = await alsAdmin('get', `/export/profit-loss?fiscalYearId=${boekjaar}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('winst_verlies_');
    expect(res.text).toContain('--- TOTALEN ---');
    expect(res.text).toContain('Netto resultaat');
  });

  it('exporteert de relaties met hun gegevens', async () => {
    await alsAdmin('post', '/relations').send({
      relationType: 'supplier',
      name: 'Muziekhandel',
      email: 'post@muziekhandel.example',
      iban: 'NL91ABNA0417164300',
      city: 'Groningen',
    });

    const res = await alsAdmin('get', '/export/relations?format=json');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      name: 'Muziekhandel',
      relation_type: 'supplier',
      email: 'post@muziekhandel.example',
      iban: 'NL91ABNA0417164300',
      city: 'Groningen',
    });
  });

  it('exporteert de relaties van een andere vereniging niet', async () => {
    await maakRelatie('Muziekhandel');
    expect((await alsB('get', '/export/relations?format=json')).body).toEqual([]);
  });

  it('laat het bestuur bij de boekhoudexports maar niet bij de relatielijst', async () => {
    expect((await alsBestuur('get', '/export/transactions?format=json')).status).toBe(200);
    expect((await alsBestuur('get', '/export/accounts?format=json')).status).toBe(200);
    expect((await alsBestuur('get', '/export/invoices?format=json')).status).toBe(200);
    expect((await alsBestuur('get', `/export/balance-sheet?fiscalYearId=${boekjaar}&format=json`)).status).toBe(200);
    expect((await alsBestuur('get', `/export/profit-loss?fiscalYearId=${boekjaar}&format=json`)).status).toBe(200);

    // De relatielijst bevat IBAN, e-mail en adres; die blijft bij de beheerder.
    expect((await alsBestuur('get', '/export/relations?format=json')).status).toBe(403);
  });

  it('laat een gewoon lid bij geen enkele export', async () => {
    for (const pad of [
      '/export/transactions',
      '/export/accounts',
      '/export/invoices',
      `/export/balance-sheet?fiscalYearId=${boekjaar}`,
      `/export/profit-loss?fiscalYearId=${boekjaar}`,
      '/export/relations',
    ]) {
      expect((await alsLid('get', pad)).status, pad).toBe(403);
    }
  });
});
