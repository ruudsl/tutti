/**
 * De geldstromen van de boekhouding: SEPA, bankimport, factuurbedragen en de
 * rapportages die daarop steunen.
 *
 * Deze reeks staat los van accounting.test.ts omdat het hier niet gaat over
 * "geeft de route een 200 terug" maar over de inhoud: welk bedrag, welke
 * richting, welke periode. Dat zijn de fouten die je in een jaarrekening pas
 * ziet als het geld al weg is.
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
import { createTestEnvironment } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/accounting', accountingRoutes);
app.use(errorHandler);

let adminToken: string;
let associationId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  associationId = omgeving.association.id;
});

const alsAdmin = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api/accounting${pad}`).set('Authorization', `Bearer ${adminToken}`);

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

async function maakRelatie(naam: string, iban?: string) {
  const res = await alsAdmin('post', '/relations').send({ relationType: 'customer', name: naam, iban });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

/**
 * Een bankrekening bestaat in twee tabellen: de grootboekrekening (accounts,
 * subtype 'bank') en de bankrekening zelf met IBAN (bank_accounts). Er is geen
 * route die de tweede aanmaakt, dus de test zet hem rechtstreeks neer.
 */
function maakBankrekening(grootboekRekeningId: string, iban = 'NL91ABNA0417164300') {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO bank_accounts (id, association_id, account_id, name, iban, bic)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, associationId, grootboekRekeningId, 'Vereniging Betaalrekening', iban, 'ABNANL2A');
  return id;
}

function maakMandaat(relationId: string, referentie = 'MNDT-0001') {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO sepa_mandates (id, association_id, relation_id, mandate_reference, mandate_type,
        iban, signature_date, status, sequence_type)
     VALUES (?, ?, ?, ?, 'RCUR', 'NL02ABNA0123456789', '2025-01-15', 'active', 'RCUR')`,
  ).run(id, associationId, relationId, referentie);
  return id;
}

async function maakFactuur(relationId: string, bedrag: number, type = 'sales') {
  const res = await alsAdmin('post', '/invoices').send({
    invoiceType: type,
    relationId,
    invoiceDate: '2026-03-01',
    dueDate: '2026-03-31',
    description: 'Contributie',
    lines: [{ description: 'Contributie', quantity: 1, unitPrice: bedrag }],
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

// =====================================================
// SEPA
// =====================================================

describe('SEPA-bestanden', () => {
  async function sepaOpzet() {
    await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
    const bankRekening = await rekeningId('1100');
    maakBankrekening(bankRekening);
    const relationId = await maakRelatie('Jan Jansen', 'NL02ABNA0123456789');
    const invoiceId = await maakFactuur(relationId, 120);
    return { bankRekening, relationId, invoiceId };
  }

  async function haalXml(batchId: string) {
    const res = await alsAdmin('get', `/sepa/batches/${batchId}/download`);
    expect(res.status).toBe(200);
    return res.text;
  }

  it('maakt van een incasso een incassobestand en niet een uitbetaling', async () => {
    // Dit is de gevaarlijkste verwisseling in het hele bestand: bij een
    // contributie-incasso hoort geld naar de vereniging te komen. Werd het
    // veld paymentType genegeerd, dan stond er een pain.001-overboeking in
    // het bestand en betaalde de vereniging elk lid uit.
    const { bankRekening, relationId, invoiceId } = await sepaOpzet();
    maakMandaat(relationId);

    const res = await alsAdmin('post', '/sepa/generate').send({
      paymentType: 'direct_debit',
      executionDate: '2026-04-01',
      bankAccountId: bankRekening,
      invoiceIds: [invoiceId],
    });
    expect(res.status).toBe(201);

    const xml = await haalXml(res.body.id);
    expect(xml).toContain('pain.008.001.02');
    expect(xml).toContain('<CstmrDrctDbtInitn>');
    expect(xml).toContain('<PmtMtd>DD</PmtMtd>');
    // De vereniging is de incassant, het lid de betaler.
    expect(xml).toContain('<DrctDbtTxInf>');
    expect(xml).toContain('MNDT-0001');
    expect(xml).not.toContain('pain.001');
    expect(xml).not.toContain('<PmtMtd>TRF</PmtMtd>');
  });

  it('houdt een overboeking een gewone overboeking', async () => {
    const { bankRekening, invoiceId } = await sepaOpzet();

    const res = await alsAdmin('post', '/sepa/generate').send({
      paymentType: 'credit_transfer',
      executionDate: '2026-04-01',
      bankAccountId: bankRekening,
      invoiceIds: [invoiceId],
    });
    expect(res.status).toBe(201);

    const xml = await haalXml(res.body.id);
    expect(xml).toContain('pain.001.001.03');
    expect(xml).toContain('<CstmrCdtTrfInitn>');
    expect(xml).toContain('<PmtMtd>TRF</PmtMtd>');
  });

  it('weigert een incasso zonder geldig mandaat', async () => {
    // Incasseren zonder mandaat mag niet; de bank stuurt zo'n batch terug en
    // het lid kan het bedrag laten storneren.
    const { bankRekening, invoiceId } = await sepaOpzet();

    const res = await alsAdmin('post', '/sepa/generate').send({
      paymentType: 'direct_debit',
      executionDate: '2026-04-01',
      bankAccountId: bankRekening,
      invoiceIds: [invoiceId],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('mandaat');
  });

  it('legt de batch vast op de bankrekening zelf', async () => {
    // sepa_batches.bank_account_id verwijst naar bank_accounts, niet naar de
    // grootboekrekening. Stond daar een accounts.id, dan viel de hele route
    // om op de sleutelcontrole.
    const { bankRekening, invoiceId } = await sepaOpzet();

    const res = await alsAdmin('post', '/sepa/generate').send({
      paymentType: 'credit_transfer',
      executionDate: '2026-04-01',
      bankAccountId: bankRekening,
      invoiceIds: [invoiceId],
    });
    expect(res.status).toBe(201);

    const batch = db
      .prepare(
        `SELECT sb.batch_type, ba.iban
         FROM sepa_batches sb
         JOIN bank_accounts ba ON sb.bank_account_id = ba.id
         WHERE sb.id = ?`,
      )
      .get(res.body.id) as any;

    expect(batch).toBeTruthy();
    expect(batch.iban).toBe('NL91ABNA0417164300');
    expect(batch.batch_type).toBe('CT');
  });

  it('koppelt een incasso aan het mandaat waarop hij loopt', async () => {
    const { bankRekening, relationId, invoiceId } = await sepaOpzet();
    const mandaatId = maakMandaat(relationId, 'MNDT-0042');

    const res = await alsAdmin('post', '/sepa/generate').send({
      paymentType: 'direct_debit',
      executionDate: '2026-04-01',
      bankAccountId: bankRekening,
      invoiceIds: [invoiceId],
    });
    expect(res.status).toBe(201);

    const item = db
      .prepare(
        `SELECT sbi.mandate_id, m.mandate_reference
         FROM sepa_batch_items sbi
         JOIN sepa_mandates m ON sbi.mandate_id = m.id
         WHERE sbi.batch_id = ?`,
      )
      .get(res.body.id) as any;

    expect(item?.mandate_id).toBe(mandaatId);
    expect(item?.mandate_reference).toBe('MNDT-0042');
  });

  it('toont de batch in het overzicht', async () => {
    const { bankRekening, invoiceId } = await sepaOpzet();
    await alsAdmin('post', '/sepa/generate').send({
      paymentType: 'credit_transfer',
      executionDate: '2026-04-01',
      bankAccountId: bankRekening,
      invoiceIds: [invoiceId],
    });

    const res = await alsAdmin('get', '/sepa/batches');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].accountCode).toBe('1100');
  });
});

// =====================================================
// BANKIMPORT
// =====================================================

describe('Bankimport', () => {
  async function bankOpzet() {
    await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
    const bankRekening = await rekeningId('1100');
    maakBankrekening(bankRekening);
    return bankRekening;
  }

  it('importeert een CSV-afschrift', async () => {
    const bankRekening = await bankOpzet();

    const res = await alsAdmin('post', '/bank-import').send({
      accountId: bankRekening,
      format: 'csv',
      content: ['datum;omschrijving;bedrag;kenmerk', '2026-03-01;Contributie Jansen;120,00;F2026-0001'].join('\n'),
    });

    expect(res.status).toBe(201);
    expect(res.body.entryCount).toBe(1);
    expect(res.body.totalCredit).toBe(120);
  });

  it('leest een bedrag met duizendtalpunt goed', async () => {
    // "1.234,56" is de Nederlandse schrijfwijze. Werd alleen de eerste komma
    // vervangen, dan bleef de duizendtalpunt staan en las parseFloat 1,23 euro
    // in plaats van 1234,56.
    const bankRekening = await bankOpzet();

    const res = await alsAdmin('post', '/bank-import').send({
      accountId: bankRekening,
      format: 'csv',
      content: ['datum;omschrijving;bedrag', '2026-03-01;Subsidie gemeente;1.234,56'].join('\n'),
    });

    expect(res.status).toBe(201);
    expect(res.body.totalCredit).toBeCloseTo(1234.56, 2);
  });

  it('laat geen onleesbaar bedrag de administratie in', async () => {
    // parseFloat('abc') is NaN; die kwam ongecontroleerd in de INSERT terecht
    // en maakte het afschrift onbruikbaar.
    const bankRekening = await bankOpzet();

    const res = await alsAdmin('post', '/bank-import').send({
      accountId: bankRekening,
      format: 'csv',
      content: ['datum;omschrijving;bedrag', '2026-03-01;Rommelregel;geen bedrag'].join('\n'),
    });

    expect(res.status).toBe(400);

    const regels = db.prepare('SELECT COUNT(*) AS n FROM bank_statement_lines').get() as any;
    expect(regels.n).toBe(0);
  });

  it('meldt netjes dat er geen bankrekening is ingericht', async () => {
    await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
    const bankRekening = await rekeningId('1100');

    const res = await alsAdmin('post', '/bank-import').send({
      accountId: bankRekening,
      format: 'csv',
      content: 'datum;omschrijving;bedrag\n2026-03-01;Iets;10,00',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('bankrekening');
  });

  it('toont het afschrift daarna in het overzicht en boekt een regel', async () => {
    const bankRekening = await bankOpzet();
    const contributies = await rekeningId('8000');

    const imported = await alsAdmin('post', '/bank-import').send({
      accountId: bankRekening,
      format: 'csv',
      content: 'datum;omschrijving;bedrag\n2026-03-01;Contributie Jansen;120,00',
    });
    expect(imported.status).toBe(201);

    const overzicht = await alsAdmin('get', '/bank-statements');
    expect(overzicht.status).toBe(200);
    expect(overzicht.body).toHaveLength(1);
    expect(overzicht.body[0].accountCode).toBe('1100');

    const regels = await alsAdmin('get', `/bank-statements/${imported.body.id}/entries`);
    expect(regels.status).toBe(200);
    expect(regels.body.entries).toHaveLength(1);

    const geboekt = await alsAdmin(
      'post',
      `/bank-statements/${imported.body.id}/lines/${regels.body.entries[0].id}/book`,
    ).send({ counterAccountId: contributies });
    expect(geboekt.status).toBe(200);

    // De bankkant van de boeking hoort op de grootboekrekening te staan.
    const regel = db
      .prepare(
        `SELECT a.code FROM transaction_lines tl
         JOIN accounts a ON tl.account_id = a.id
         WHERE tl.transaction_id = ? AND tl.line_number = 1`,
      )
      .get(geboekt.body.transactionId) as any;
    expect(regel.code).toBe('1100');
  });
});

// =====================================================
// FACTUURBEDRAGEN EN BETALINGEN
// =====================================================

describe('Factuurbedragen', () => {
  beforeEach(async () => {
    await maakBoekjaar();
  });

  it('rondt de btw op hele centen af', async () => {
    // 3 x 19,99 tegen 21% geeft 12,593700000000002 in drijvende komma. Zo'n
    // bedrag hoort niet in een grootboek: de btw-aangifte is in centen.
    const relationId = await maakRelatie('Klant');

    const res = await alsAdmin('post', '/invoices').send({
      invoiceType: 'sales',
      relationId,
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
      lines: [{ description: 'Bladmuziek', quantity: 3, unitPrice: 19.99, vatRate: 21 }],
    });
    expect(res.status).toBe(201);

    const factuur = db.prepare('SELECT subtotal, vat_amount, total FROM invoices WHERE id = ?').get(res.body.id) as any;
    expect(factuur.vat_amount).toBe(12.59);
    expect(factuur.subtotal).toBe(59.97);
    expect(factuur.total).toBe(72.56);

    const regel = db.prepare('SELECT vat_amount FROM invoice_lines WHERE invoice_id = ?').get(res.body.id) as any;
    expect(regel.vat_amount).toBe(12.59);
  });

  it('weigert een negatieve stukprijs', async () => {
    // quantity had .min(0) al; unitPrice niet, en met een negatieve prijs
    // wordt een verkoopfactuur stilletjes een creditfactuur.
    const relationId = await maakRelatie('Klant');

    const res = await alsAdmin('post', '/invoices').send({
      invoiceType: 'sales',
      relationId,
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
      lines: [{ description: 'Korting', quantity: 1, unitPrice: -50 }],
    });

    expect(res.status).toBe(400);
  });

  it('geeft verkoop- en inkoopfacturen elk hun eigen reeks', async () => {
    // De nummers krijgen een letter per soort ('F', 'I', 'C'). Werd het
    // volgnummer over alle soorten heen bepaald, dan botste de tweede
    // verkoopfactuur op een nummer dat al bestond.
    const relationId = await maakRelatie('Klant');

    const inkoop = await maakFactuur(relationId, 10, 'purchase');
    const verkoop1 = await maakFactuur(relationId, 20, 'sales');
    const verkoop2 = await maakFactuur(relationId, 30, 'sales');

    const nummers = [inkoop, verkoop1, verkoop2].map(
      (id) => (db.prepare('SELECT invoice_number FROM invoices WHERE id = ?').get(id) as any).invoice_number,
    );

    expect(new Set(nummers).size).toBe(3);
    expect(nummers[1]).toMatch(/^F/);
    expect(nummers[2]).toMatch(/^F/);
    expect(nummers[0]).toMatch(/^I/);
  });
});

describe('Betaling registreren', () => {
  let factuurId: string;

  beforeEach(async () => {
    await maakBoekjaar();
    const relationId = await maakRelatie('Klant');
    factuurId = await maakFactuur(relationId, 100);
  });

  function openstaand() {
    return db.prepare('SELECT amount_paid, status FROM invoices WHERE id = ?').get(factuurId) as any;
  }

  it('weigert een negatief betaalbedrag', async () => {
    // Een negatieve betaling draait het openstaande saldo omhoog; dat is geen
    // betaling maar een correctie en hoort via een creditfactuur.
    const res = await alsAdmin('post', `/invoices/${factuurId}/mark-paid`).send({ amount: -100 });

    expect(res.status).toBe(400);
    expect(openstaand().amount_paid).toBe(0);
  });

  it('weigert meer dan het openstaande bedrag', async () => {
    const res = await alsAdmin('post', `/invoices/${factuurId}/mark-paid`).send({ amount: 250 });

    expect(res.status).toBe(400);
    expect(openstaand().amount_paid).toBe(0);
  });

  it('telt een bedrag als tekst niet bij het saldo op', async () => {
    // Zonder controle op het type wordt 0 + "100" de tekst "0100": JavaScript
    // plakt dan aan elkaar wat had moeten worden opgeteld.
    const res = await alsAdmin('post', `/invoices/${factuurId}/mark-paid`).send({ amount: '100' });

    expect(res.status).toBe(400);
    expect(openstaand().amount_paid).toBe(0);
  });

  it('registreert een gedeeltelijke en daarna een volledige betaling', async () => {
    const eerste = await alsAdmin('post', `/invoices/${factuurId}/mark-paid`).send({ amount: 40 });
    expect(eerste.status).toBe(200);
    expect(openstaand()).toMatchObject({ amount_paid: 40, status: 'partial' });

    const tweede = await alsAdmin('post', `/invoices/${factuurId}/mark-paid`).send({ amount: 60 });
    expect(tweede.status).toBe(200);
    expect(openstaand()).toMatchObject({ amount_paid: 100, status: 'paid' });
  });

  it('boekt zonder bedrag de hele factuur af', async () => {
    const res = await alsAdmin('post', `/invoices/${factuurId}/mark-paid`).send({});
    expect(res.status).toBe(200);
    expect(openstaand()).toMatchObject({ amount_paid: 100, status: 'paid' });
  });
});

// =====================================================
// RAPPORTAGES
// =====================================================

describe('Rapportages tellen alleen wat binnen de periode valt', () => {
  async function boek(datum: string, bedrag: number, opts: { geboekt?: boolean } = {}) {
    const bank = await rekeningId('1100');
    const contributies = await rekeningId('8000');
    const res = await alsAdmin('post', '/transactions').send({
      transactionDate: datum,
      transactionType: 'receipt',
      description: `Contributie ${datum}`,
      lines: [
        { accountId: bank, debitAmount: bedrag },
        { accountId: contributies, creditAmount: bedrag },
      ],
    });
    expect(res.status).toBe(201);
    if (opts.geboekt !== false) {
      const post = await alsAdmin('post', `/transactions/${res.body.id}/post`);
      expect(post.status).toBe(200);
    }
    return res.body.id as string;
  }

  function saldo(lijst: any[], code: string) {
    const rij = lijst.find((r: any) => r.code === code);
    expect(rij, `rekening ${code} ontbreekt in het rapport`).toBeTruthy();
    return rij;
  }

  it('laat de balans stoppen op de peildatum', async () => {
    // De datumvoorwaarde stond in de ON-clausule van een LEFT JOIN. Die maakt
    // de transactieregel wel leeg maar telt het bedrag gewoon mee, dus de
    // balans per 31 december bevatte ook boekingen van het jaar daarna.
    await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
    await boek('2026-06-01', 100);
    await boek('2027-06-01', 900);

    const res = await alsAdmin('get', '/reports/balance?date=2026-12-31');
    expect(res.status).toBe(200);
    expect(saldo(res.body.assets, '1100').total_debit).toBe(100);
  });

  it('telt concept-boekingen niet mee in de balans', async () => {
    await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
    await boek('2026-06-01', 100);
    await boek('2026-07-01', 500, { geboekt: false });

    const res = await alsAdmin('get', '/reports/balance?date=2026-12-31');
    expect(saldo(res.body.assets, '1100').total_debit).toBe(100);
  });

  it('laat de winst-en-verliesrekening binnen de periode blijven', async () => {
    await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
    await boek('2026-06-01', 100);
    await boek('2027-06-01', 900);

    const res = await alsAdmin('get', '/reports/profit-loss?startDate=2026-01-01&endDate=2026-12-31');
    expect(res.status).toBe(200);
    expect(res.body.totals.income).toBe(100);
  });

  it('houdt de balansexport bij het gevraagde boekjaar', async () => {
    const eerste = await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
    await boek('2026-06-01', 100);

    // Een tweede boekjaar met een eigen boeking; de export van het eerste jaar
    // hoort die niet te bevatten.
    await maakBoekjaar({ name: 'Boekjaar 2027', startDate: '2027-01-01', endDate: '2027-12-31' });
    await boek('2027-06-01', 900);

    const res = await alsAdmin('get', `/export/balance-sheet?fiscalYearId=${eerste}&format=json`);
    expect(res.status).toBe(200);
    expect(saldo(res.body, '1100').total_debit).toBe(100);
  });

  it('houdt de winst-en-verliesexport bij het gevraagde boekjaar', async () => {
    const eerste = await maakBoekjaar();
    await alsAdmin('post', '/accounts/initialize');
    await boek('2026-06-01', 100);

    await maakBoekjaar({ name: 'Boekjaar 2027', startDate: '2027-01-01', endDate: '2027-12-31' });
    await boek('2027-06-01', 900);

    const res = await alsAdmin('get', `/export/profit-loss?fiscalYearId=${eerste}&format=json`);
    expect(res.status).toBe(200);
    expect(saldo(res.body.accounts, '8000').total_credit).toBe(100);
    expect(associationId).toBeTruthy();
  });
});
