/**
 * Tests voor de boekhouding-api.
 *
 * De functies in accounting.ts zetten een pad in elkaar, geven een body mee en
 * leveren `response.data` terug. Juist daarom wordt hier op het pad, de methode,
 * de body en de queryreeks getoetst - een typefout daarin geeft geen foutmelding
 * maar een leeg scherm of een filter die niets doet. Alle routes zijn vergeleken
 * met backend/src/routes/accounting.ts (gekoppeld op /api/accounting).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  startNepserver,
  stopNepserver,
  antwoordMet,
  antwoordMetFout,
  antwoordMetNetwerkfout,
  antwoordMetTijdslimiet,
  laatsteVerzoek,
  alleVerzoeken,
} from './nepserver';
import {
  getFiscalYears,
  createFiscalYear,
  updateFiscalYear,
  closeFiscalYear,
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  initializeAccounts,
  getMembershipFeeTypes,
  createMembershipFeeType,
  updateMembershipFeeType,
  deleteMembershipFeeType,
  getInvoices,
  getInvoice,
  createInvoice,
  sendInvoice,
  markInvoicePaid,
  deleteInvoice,
  getBalanceReport,
  getProfitLossReport,
  getTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  postTransaction,
  importBankStatement,
  getBankStatements,
  getBankStatementEntries,
  bookBankLine,
  getAccountLedger,
  getAgingReport,
  generateSepaBatch,
  getSepaBatches,
  downloadSepaBatch,
  getRelations,
  getRelation,
  createRelation,
  updateRelation,
  deleteRelation,
  getCostCenters,
  getCostCenter,
  createCostCenter,
  updateCostCenter,
  deleteCostCenter,
  getBudgets,
  getBudget,
  createBudget,
  updateBudget,
  deleteBudget,
  exportTransactions,
  exportAccounts,
  exportInvoices,
  exportBalanceSheet,
  exportProfitLoss,
  exportRelations,
} from '../accounting';

beforeEach(() => startNepserver());
afterEach(() => {
  stopNepserver();
  vi.restoreAllMocks();
});

/** Vangt de aangemaakte downloadlink op; jsdom kent createObjectURL niet. */
function vangDownloadOp() {
  const anker = document.createElement('a');
  const klik = vi.spyOn(anker, 'click').mockImplementation(() => {});
  vi.spyOn(document, 'createElement').mockReturnValue(anker);
  const maakUrl = vi.fn(() => 'blob:nep');
  const geefVrij = vi.fn();
  Object.defineProperty(window.URL, 'createObjectURL', { value: maakUrl, configurable: true, writable: true });
  Object.defineProperty(window.URL, 'revokeObjectURL', { value: geefVrij, configurable: true, writable: true });
  return { anker, klik, maakUrl, geefVrij };
}

// ===========================================
// BOEKJAREN
// ===========================================

describe('boekjaren', () => {
  it('getFiscalYears haalt de lijst op', async () => {
    antwoordMet([{ id: 'b1', name: '2026', status: 'open' }]);
    const jaren = await getFiscalYears();

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/accounting/fiscal-years');
    expect(jaren).toHaveLength(1);
  });

  it('getFiscalYears geeft een lege lijst terug zonder te vallen', async () => {
    antwoordMet([]);
    await expect(getFiscalYears()).resolves.toEqual([]);
  });

  it('createFiscalYear stuurt naam en beide datums mee', async () => {
    antwoordMet({ id: 'b1', message: 'Boekjaar aangemaakt.' });

    await createFiscalYear({ name: '2027', startDate: '2027-01-01', endDate: '2027-12-31', isCurrent: true });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/accounting/fiscal-years');
    // De backend leest exact deze veldnamen (fiscalYearSchema).
    expect(verzoek.body).toEqual({
      name: '2027',
      startDate: '2027-01-01',
      endDate: '2027-12-31',
      isCurrent: true,
    });
  });

  it('updateFiscalYear gebruikt PUT en stuurt alleen de gewijzigde velden', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });

    await updateFiscalYear('b1', { name: '2027 herzien' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/accounting/fiscal-years/b1');
    expect(verzoek.body).toEqual({ name: '2027 herzien' });
  });

  it('closeFiscalYear post op de afsluitroute zonder body', async () => {
    antwoordMet({ message: 'Boekjaar afgesloten.' });

    await closeFiscalYear('b1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/accounting/fiscal-years/b1/close');
    expect(verzoek.body).toBeUndefined();
  });

  it('closeFiscalYear laat een 400 door wanneer het jaar niet sluitbaar is', async () => {
    antwoordMetFout(400, { error: 'Er staan nog ongeboekte mutaties open.' });

    await expect(closeFiscalYear('b1')).rejects.toMatchObject({
      response: { status: 400, data: { error: 'Er staan nog ongeboekte mutaties open.' } },
    });
  });
});

// ===========================================
// REKENINGSCHEMA
// ===========================================

describe('grootboekrekeningen', () => {
  it('getAccounts haalt het rekeningschema op', async () => {
    antwoordMet([{ id: 'r1', code: '1000', name: 'Kas' }]);
    await getAccounts();

    expect(laatsteVerzoek().pad).toBe('/accounting/accounts');
  });

  it('createAccount stuurt een openingsbalans van 0 mee in plaats van hem weg te laten', async () => {
    antwoordMet({ id: 'r1', message: 'Rekening aangemaakt.' });

    await createAccount({ code: '1000', name: 'Kas', accountType: 'asset', openingBalance: 0 });

    expect(laatsteVerzoek().body).toEqual({
      code: '1000',
      name: 'Kas',
      accountType: 'asset',
      openingBalance: 0,
    });
  });

  it('createAccount houdt het subtype en de bovenliggende rekening aan', async () => {
    antwoordMet({ id: 'r2', message: 'Rekening aangemaakt.' });

    await createAccount({
      code: '1100',
      name: 'Bank',
      accountType: 'asset',
      accountSubtype: 'bank',
      parentId: 'r1',
      description: 'Betaalrekening',
    });

    expect(laatsteVerzoek().body).toMatchObject({ accountSubtype: 'bank', parentId: 'r1' });
  });

  it('updateAccount gebruikt PUT op /accounting/accounts/:id', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });

    await updateAccount('r1', { name: 'Kasgeld' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/accounting/accounts/r1');
    expect(verzoek.body).toEqual({ name: 'Kasgeld' });
  });

  it('deleteAccount verwijdert een rekening', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteAccount('r1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/accounting/accounts/r1');
  });

  it('deleteAccount laat een 400 door wanneer er nog boekingen op staan', async () => {
    antwoordMetFout(400, { error: 'Rekening heeft boekingen.' });

    await expect(deleteAccount('r1')).rejects.toMatchObject({ response: { status: 400 } });
  });

  it('initializeAccounts post op de aparte initialisatieroute', async () => {
    antwoordMet({ message: 'Rekeningschema aangemaakt.', count: 42 });

    const resultaat = await initializeAccounts();

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    // Deze route staat los van /accounts/:id: 'initialize' mag geen id worden.
    expect(verzoek.pad).toBe('/accounting/accounts/initialize');
    expect(resultaat.count).toBe(42);
  });
});

// ===========================================
// CONTRIBUTIESOORTEN
// ===========================================

describe('contributiesoorten', () => {
  it('getMembershipFeeTypes bevraagt /accounting/membership-fee-types', async () => {
    antwoordMet([]);
    await getMembershipFeeTypes();

    expect(laatsteVerzoek().pad).toBe('/accounting/membership-fee-types');
  });

  it('createMembershipFeeType stuurt bedrag en frequentie mee', async () => {
    antwoordMet({ id: 'c1', message: 'Aangemaakt.' });

    await createMembershipFeeType({
      name: 'Jeugdlid',
      amount: 7500,
      frequency: 'quarterly',
      ageMax: 18,
      isDefault: false,
      incomeAccountId: 'r9',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.body).toEqual({
      name: 'Jeugdlid',
      amount: 7500,
      frequency: 'quarterly',
      ageMax: 18,
      isDefault: false,
      incomeAccountId: 'r9',
    });
  });

  it('updateMembershipFeeType gebruikt PUT met het id in het pad', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });
    await updateMembershipFeeType('c1', { amount: 8000 });

    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/accounting/membership-fee-types/c1');
  });

  it('deleteMembershipFeeType verwijdert een soort', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteMembershipFeeType('c1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/accounting/membership-fee-types/c1');
  });
});

// ===========================================
// FACTUREN
// ===========================================

describe('getInvoices', () => {
  it('zet alle filters in de queryreeks', async () => {
    antwoordMet([]);

    await getInvoices({ status: 'overdue', type: 'sales', fiscalYearId: 'b1', relationId: 'rel1' });

    const { pad, query } = laatsteVerzoek();
    expect(pad.startsWith('/accounting/invoices?')).toBe(true);
    // De backend leest deze vier namen uit req.query.
    expect(query.get('status')).toBe('overdue');
    expect(query.get('type')).toBe('sales');
    expect(query.get('fiscalYearId')).toBe('b1');
    expect(query.get('relationId')).toBe('rel1');
  });

  it('laat filters die niet ingevuld zijn weg uit de queryreeks', async () => {
    antwoordMet([]);
    await getInvoices({ status: 'paid' });

    expect(laatsteVerzoek().queryreeks).toBe('status=paid');
  });

  it('stuurt een lege queryreeks als er geen filters zijn', async () => {
    antwoordMet([]);
    await getInvoices();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('geeft een lege facturenlijst terug zonder te vallen', async () => {
    antwoordMet([]);
    await expect(getInvoices()).resolves.toEqual([]);
  });
});

describe('facturen', () => {
  it('getInvoice haalt een factuur met regels op', async () => {
    const factuur = {
      id: 'f1',
      invoiceNumber: '2026-0001',
      lines: [{ id: 'l1', description: 'Contributie', quantity: 1, unitPrice: 5000 }],
    };
    antwoordMet(factuur);

    await expect(getInvoice('f1')).resolves.toEqual(factuur);
    expect(laatsteVerzoek().pad).toBe('/accounting/invoices/f1');
  });

  it('createInvoice stuurt kop en regels als een geheel mee', async () => {
    antwoordMet({ id: 'f1', invoiceNumber: '2026-0001', message: 'Factuur aangemaakt.' });

    await createInvoice({
      invoiceType: 'sales',
      relationId: 'rel1',
      invoiceDate: '2026-03-01',
      dueDate: '2026-03-31',
      reference: 'Contributie Q1',
      lines: [
        { description: 'Contributie Q1', quantity: 1, unitPrice: 5000, vatRate: 0, accountId: 'r9' },
        { description: 'Kledingbijdrage', quantity: 2, unitPrice: 1250 },
      ],
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/accounting/invoices');
    const body = verzoek.body as { lines: unknown[]; invoiceType: string };
    expect(body.invoiceType).toBe('sales');
    expect(body.lines).toHaveLength(2);
    expect(body.lines[0]).toEqual({
      description: 'Contributie Q1',
      quantity: 1,
      unitPrice: 5000,
      vatRate: 0,
      accountId: 'r9',
    });
  });

  it('sendInvoice post op de verzendroute zonder body', async () => {
    antwoordMet({ message: 'Factuur verzonden.' });
    await sendInvoice('f1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/accounting/invoices/f1/send');
    expect(verzoek.body).toBeUndefined();
  });

  it('markInvoicePaid stuurt bedrag en betaaldatum mee', async () => {
    antwoordMet({ message: 'Betaling verwerkt.' });

    await markInvoicePaid('f1', 5000, '2026-03-15');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/accounting/invoices/f1/mark-paid');
    // invoicePaymentSchema in de backend leest amount en paymentDate.
    expect(verzoek.body).toEqual({ amount: 5000, paymentDate: '2026-03-15' });
  });

  it('markInvoicePaid stuurt een lege body als er geen bedrag of datum is', async () => {
    antwoordMet({ message: 'Betaling verwerkt.' });
    await markInvoicePaid('f1');

    // Beide velden zijn optional in het schema; JSON.stringify laat undefined
    // weg, zodat de backend zelf het openstaande bedrag invult.
    expect(laatsteVerzoek().body).toEqual({});
  });

  it('markInvoicePaid laat een 400 door bij een negatief bedrag', async () => {
    antwoordMetFout(400, { error: 'Bedrag moet groter dan nul zijn.' });

    await expect(markInvoicePaid('f1', -100)).rejects.toMatchObject({
      response: { status: 400, data: { error: 'Bedrag moet groter dan nul zijn.' } },
    });
  });

  it('deleteInvoice verwijdert een factuur', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteInvoice('f1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/accounting/invoices/f1');
  });
});

// ===========================================
// RAPPORTEN
// ===========================================

describe('rapporten', () => {
  it('getBalanceReport zet boekjaar en peildatum in de queryreeks', async () => {
    antwoordMet({ assets: [], liabilities: [], equity: [], totals: {} });

    await getBalanceReport('b1', '2026-12-31');

    const { pad, query } = laatsteVerzoek();
    expect(pad.startsWith('/accounting/reports/balance?')).toBe(true);
    // De backend leest fiscalYearId en date - niet asOfDate.
    expect(query.get('fiscalYearId')).toBe('b1');
    expect(query.get('date')).toBe('2026-12-31');
  });

  it('getBalanceReport werkt zonder argumenten', async () => {
    antwoordMet({ assets: [] });
    await getBalanceReport();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('getProfitLossReport zet boekjaar en periode in de queryreeks', async () => {
    antwoordMet({ income: [], expenses: [], totals: {} });

    await getProfitLossReport('b1', '2026-01-01', '2026-06-30');

    const { pad, query } = laatsteVerzoek();
    expect(pad.startsWith('/accounting/reports/profit-loss?')).toBe(true);
    expect(query.get('fiscalYearId')).toBe('b1');
    expect(query.get('startDate')).toBe('2026-01-01');
    expect(query.get('endDate')).toBe('2026-06-30');
  });

  it('getProfitLossReport laat een overgeslagen argument weg', async () => {
    antwoordMet({ income: [] });
    await getProfitLossReport(undefined, '2026-01-01');

    expect(laatsteVerzoek().queryreeks).toBe('startDate=2026-01-01');
  });

  it('getAccountLedger zet de rekening in het pad en de periode in de query', async () => {
    antwoordMet({ account: { id: 'r1' }, entries: [], closingBalance: 0 });

    await getAccountLedger('r1', '2026-01-01', '2026-12-31');

    const { pad, query } = laatsteVerzoek();
    expect(pad.startsWith('/accounting/reports/account-ledger/r1?')).toBe(true);
    expect(query.get('startDate')).toBe('2026-01-01');
    expect(query.get('endDate')).toBe('2026-12-31');
  });

  it('getAgingReport bevraagt /accounting/reports/aging', async () => {
    antwoordMet({ asOfDate: '2026-08-22', buckets: {}, grandTotal: 0 });
    await getAgingReport();

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/accounting/reports/aging');
  });

  it('getAgingReport geeft het geneste antwoord ongewijzigd door', async () => {
    const rapport = {
      asOfDate: '2026-08-22',
      buckets: {
        current: { invoices: [{ id: 'f1', amountDue: 5000, daysOverdue: 0 }], total: 5000 },
        days1to30: { invoices: [], total: 0 },
        days31to60: { invoices: [], total: 0 },
        days61to90: { invoices: [], total: 0 },
        over90: { invoices: [], total: 0 },
      },
      grandTotal: 5000,
    };
    antwoordMet(rapport);

    await expect(getAgingReport()).resolves.toEqual(rapport);
  });

  it('getBalanceReport laat een 403 door voor wie geen beheerder is', async () => {
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(getBalanceReport('b1')).rejects.toMatchObject({ response: { status: 403 } });
  });
});

// ===========================================
// BOEKINGEN
// ===========================================

describe('getTransactions', () => {
  it('zet alle filters in de queryreeks', async () => {
    antwoordMet([]);

    await getTransactions({
      fiscalYearId: 'b1',
      accountId: 'r1',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      transactionType: 'bank',
      search: 'huur',
    });

    const { query } = laatsteVerzoek();
    expect(query.get('fiscalYearId')).toBe('b1');
    expect(query.get('accountId')).toBe('r1');
    expect(query.get('startDate')).toBe('2026-01-01');
    expect(query.get('endDate')).toBe('2026-03-31');
    expect(query.get('transactionType')).toBe('bank');
    expect(query.get('search')).toBe('huur');
  });

  it('codeert een zoekterm met ampersand, spatie en procentteken', async () => {
    antwoordMet([]);
    await getTransactions({ search: 'huur & licht 100%' });

    const { queryreeks, query } = laatsteVerzoek();
    // Zonder codering leest de server hier twee parameters in plaats van een.
    expect(queryreeks).not.toContain('& licht');
    expect(queryreeks).toContain('%26');
    expect(queryreeks).toContain('100%25');
    expect(query.get('search')).toBe('huur & licht 100%');
  });

  it('stuurt geen queryreeks mee als er geen filters zijn', async () => {
    antwoordMet([]);
    await getTransactions();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });
});

describe('boekingen', () => {
  it('getTransaction haalt een boeking met regels op', async () => {
    antwoordMet({ id: 't1', transactionNumber: '2026-0001', lines: [] });
    await getTransaction('t1');

    expect(laatsteVerzoek().pad).toBe('/accounting/transactions/t1');
  });

  it('createTransaction stuurt de regels met debet en credit mee', async () => {
    antwoordMet({ id: 't1', transactionNumber: '2026-0001', message: 'Boeking aangemaakt.' });

    await createTransaction({
      transactionDate: '2026-03-01',
      transactionType: 'journal',
      description: 'Huur maart',
      lines: [
        { accountId: 'r5', debitAmount: 50000, creditAmount: 0, description: 'Huur' },
        { accountId: 'r1', debitAmount: 0, creditAmount: 50000 },
      ],
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/accounting/transactions');
    const body = verzoek.body as { lines: Record<string, unknown>[] };
    // Een bedrag van 0 hoort mee te gaan: de backend telt debet en credit op.
    expect(body.lines[1]).toEqual({ accountId: 'r1', debitAmount: 0, creditAmount: 50000 });
  });

  it('updateTransaction gebruikt PUT op /accounting/transactions/:id', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });

    await updateTransaction('t1', {
      transactionDate: '2026-03-02',
      transactionType: 'journal',
      description: 'Huur maart (gecorrigeerd)',
      lines: [
        { accountId: 'r5', debitAmount: 50000, creditAmount: 0 },
        { accountId: 'r1', debitAmount: 0, creditAmount: 50000 },
      ],
    });

    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/accounting/transactions/t1');
  });

  it('deleteTransaction verwijdert een boeking', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteTransaction('t1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/accounting/transactions/t1');
  });

  it('postTransaction boekt definitief zonder body', async () => {
    antwoordMet({ message: 'Boeking geboekt.' });
    await postTransaction('t1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/accounting/transactions/t1/post');
    expect(verzoek.body).toBeUndefined();
  });

  it('createTransaction laat een validatiefout van de server doorkomen', async () => {
    antwoordMetFout(400, { error: 'Minimaal twee regels vereist.' });

    await expect(
      createTransaction({
        transactionDate: '2026-03-01',
        transactionType: 'journal',
        description: 'Onvolledig',
        lines: [{ accountId: 'r5', debitAmount: 1, creditAmount: 0 }],
      }),
    ).rejects.toMatchObject({ response: { status: 400, data: { error: 'Minimaal twee regels vereist.' } } });
  });
});

// ===========================================
// BANK
// ===========================================

describe('bankafschriften', () => {
  it('importBankStatement stuurt rekening, formaat en inhoud mee', async () => {
    antwoordMet({ id: 'a1', entryCount: 12, totalDebit: 100, totalCredit: 200, message: 'Geïmporteerd.' });

    await importBankStatement('r1', 'mt940', ':20:AFSCHRIFT\n:61:2603');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/accounting/bank-import');
    // bankImportSchema leest accountId, format en content.
    expect(verzoek.body).toEqual({ accountId: 'r1', format: 'mt940', content: ':20:AFSCHRIFT\n:61:2603' });
  });

  it('getBankStatements haalt de afschriften op', async () => {
    antwoordMet([]);
    await getBankStatements();

    expect(laatsteVerzoek().pad).toBe('/accounting/bank-statements');
  });

  it('getBankStatementEntries haalt de regels van een afschrift op', async () => {
    antwoordMet({ statement: { id: 'a1' }, entries: [{ id: 'ar1', amount: -1250 }] });

    const detail = await getBankStatementEntries('a1');

    expect(laatsteVerzoek().pad).toBe('/accounting/bank-statements/a1/entries');
    expect(detail.entries).toHaveLength(1);
  });

  it('bookBankLine zet afschrift en regel in het pad en de tegenrekening in de body', async () => {
    antwoordMet({ transactionId: 't1', transactionNumber: '2026-0002', message: 'Geboekt.' });

    await bookBankLine('a1', 'ar1', 'r5', 'kp1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/accounting/bank-statements/a1/lines/ar1/book');
    expect(verzoek.body).toEqual({ counterAccountId: 'r5', costCenterId: 'kp1' });
  });

  it('bookBankLine laat de kostenplaats weg als die niet gekozen is', async () => {
    antwoordMet({ transactionId: 't1', transactionNumber: '2026-0002', message: 'Geboekt.' });

    await bookBankLine('a1', 'ar1', 'r5');

    // costCenterId is undefined; het veld hoort dan helemaal niet mee te gaan,
    // anders valt de backend over een lege kostenplaats.
    expect(laatsteVerzoek().body).toEqual({ counterAccountId: 'r5' });
  });

  it('bookBankLine laat een 400 door wanneer de regel al verwerkt is', async () => {
    antwoordMetFout(400, { error: 'Bankregel is al verwerkt.' });

    await expect(bookBankLine('a1', 'ar1', 'r5')).rejects.toMatchObject({ response: { status: 400 } });
  });
});

// ===========================================
// SEPA
// ===========================================

describe('sepa', () => {
  it('generateSepaBatch stuurt soort, datum, rekening en facturen mee', async () => {
    antwoordMet({ id: 's1', transactionCount: 3, totalAmount: 15000, message: 'Batch aangemaakt.' });

    await generateSepaBatch('direct_debit', '2026-04-01', 'r2', ['f1', 'f2', 'f3']);

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/accounting/sepa/generate');
    // sepaPaymentSchema leest paymentType, executionDate, bankAccountId, invoiceIds.
    expect(verzoek.body).toEqual({
      paymentType: 'direct_debit',
      executionDate: '2026-04-01',
      bankAccountId: 'r2',
      invoiceIds: ['f1', 'f2', 'f3'],
    });
  });

  it('generateSepaBatch stuurt een lege factuurlijst mee zoals hij is', async () => {
    antwoordMetFout(400, { error: 'Minimaal één factuur selecteren.' });

    await expect(generateSepaBatch('credit_transfer', '2026-04-01', 'r2', [])).rejects.toMatchObject({
      response: { status: 400 },
    });
    expect(laatsteVerzoek().body).toMatchObject({ invoiceIds: [] });
  });

  it('getSepaBatches haalt de batches op', async () => {
    antwoordMet([]);
    await getSepaBatches();

    expect(laatsteVerzoek().pad).toBe('/accounting/sepa/batches');
  });

  it('downloadSepaBatch vraagt het bestand als blob op', async () => {
    antwoordMet('<Document/>');

    const inhoud = await downloadSepaBatch('s1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/accounting/sepa/batches/s1/download');
    expect(verzoek.responseType).toBe('blob');
    // De functie geeft het bestand ongewijzigd terug; de aanroeper bewaart het.
    expect(inhoud).toBe('<Document/>');
  });
});

// ===========================================
// RELATIES
// ===========================================

describe('relaties', () => {
  it('getRelations haalt de debiteuren en crediteuren op', async () => {
    antwoordMet([{ id: 'rel1', name: 'Muziekhandel De Klank', relationType: 'supplier' }]);
    const relaties = await getRelations();

    expect(laatsteVerzoek().pad).toBe('/accounting/relations');
    expect(relaties).toHaveLength(1);
  });

  it('getRelation bevraagt /accounting/relations/:id', async () => {
    antwoordMet({ id: 'rel1', name: 'Muziekhandel De Klank' });
    await getRelation('rel1');

    // Let op: de backend kent op dit pad alleen PUT en DELETE. Een GET komt
    // daar dus niet aan; zie het rapport bij deze tak.
    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/accounting/relations/rel1');
  });

  it('getRelation laat een 404 doorkomen in plaats van undefined te leveren', async () => {
    antwoordMetFout(404, { error: 'Not found' });

    await expect(getRelation('rel1')).rejects.toMatchObject({ response: { status: 404 } });
  });

  it('createRelation stuurt de relatiegegevens mee', async () => {
    antwoordMet({ id: 'rel1', message: 'Relatie aangemaakt.' });

    await createRelation({ name: 'De Klank', relationType: 'supplier', iban: 'NL02ABNA0123456789' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/accounting/relations');
    expect(verzoek.body).toEqual({ name: 'De Klank', relationType: 'supplier', iban: 'NL02ABNA0123456789' });
  });

  it('updateRelation gebruikt PUT met het id in het pad', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });
    await updateRelation('rel1', { paymentTermDays: 30 });

    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/accounting/relations/rel1');
    expect(laatsteVerzoek().body).toEqual({ paymentTermDays: 30 });
  });

  it('deleteRelation verwijdert een relatie', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteRelation('rel1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/accounting/relations/rel1');
  });
});

// ===========================================
// KOSTENPLAATSEN
// ===========================================

describe('kostenplaatsen', () => {
  it('getCostCenters haalt de kostenplaatsen op', async () => {
    antwoordMet([]);
    await getCostCenters();

    expect(laatsteVerzoek().pad).toBe('/accounting/cost-centers');
  });

  it('getCostCenter bevraagt /accounting/cost-centers/:id', async () => {
    antwoordMet({ id: 'kp1', code: 'JEUGD', name: 'Jeugdorkest' });
    await getCostCenter('kp1');

    // Ook hier kent de backend alleen PUT en DELETE op dit pad.
    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/accounting/cost-centers/kp1');
  });

  it('createCostCenter stuurt code en naam mee', async () => {
    antwoordMet({ id: 'kp1', message: 'Kostenplaats aangemaakt.' });

    await createCostCenter({ code: 'JEUGD', name: 'Jeugdorkest', budgetAmount: 100000 });

    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().body).toEqual({ code: 'JEUGD', name: 'Jeugdorkest', budgetAmount: 100000 });
  });

  it('updateCostCenter gebruikt PUT met het id in het pad', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });
    await updateCostCenter('kp1', { name: 'Jeugd' });

    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/accounting/cost-centers/kp1');
  });

  it('deleteCostCenter verwijdert een kostenplaats', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteCostCenter('kp1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/accounting/cost-centers/kp1');
  });
});

// ===========================================
// BUDGETTEN
// ===========================================

describe('budgetten', () => {
  it('getBudgets zet het boekjaar in de queryreeks', async () => {
    antwoordMet([]);
    await getBudgets({ fiscalYearId: 'b1' });

    expect(laatsteVerzoek().pad.startsWith('/accounting/budgets?')).toBe(true);
    expect(laatsteVerzoek().query.get('fiscalYearId')).toBe('b1');
  });

  it('getBudgets werkt zonder filter', async () => {
    antwoordMet([]);
    await getBudgets();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('getBudget haalt een budget op', async () => {
    antwoordMet({ id: 'bg1', name: 'Instrumenten', amount: 250000, actual: 100000, remaining: 150000 });
    const budget = await getBudget('bg1');

    expect(laatsteVerzoek().pad).toBe('/accounting/budgets/bg1');
    expect(budget.remaining).toBe(150000);
  });

  it('createBudget stuurt bedrag en rekening mee', async () => {
    antwoordMet({ id: 'bg1', message: 'Budget aangemaakt.' });

    await createBudget({ name: 'Instrumenten', amount: 250000, accountId: 'r7', fiscalYearId: 'b1' });

    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/accounting/budgets');
    expect(laatsteVerzoek().body).toEqual({
      name: 'Instrumenten',
      amount: 250000,
      accountId: 'r7',
      fiscalYearId: 'b1',
    });
  });

  it('updateBudget gebruikt PUT met het id in het pad', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });
    await updateBudget('bg1', { amount: 300000 });

    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/accounting/budgets/bg1');
  });

  it('deleteBudget verwijdert een budget', async () => {
    antwoordMet({ message: 'Verwijderd.' });
    await deleteBudget('bg1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/accounting/budgets/bg1');
  });
});

// ===========================================
// EXPORTS
// ===========================================

describe('csv-exports', () => {
  it('exportTransactions vraagt een blob op en biedt hem aan met datum in de naam', async () => {
    const { anker, klik, maakUrl, geefVrij } = vangDownloadOp();
    vi.setSystemTime(new Date('2026-05-17T10:00:00Z'));
    antwoordMet('boekstuk;datum;bedrag');

    await exportTransactions('b1');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('get');
    expect(verzoek.responseType).toBe('blob');
    expect(verzoek.pad).toBe('/accounting/export/transactions?fiscalYearId=b1&format=csv');
    expect(verzoek.query.get('fiscalYearId')).toBe('b1');
    expect(verzoek.query.get('format')).toBe('csv');
    expect(anker.download).toBe('grootboek_2026-05-17.csv');
    expect(klik).toHaveBeenCalledTimes(1);
    expect(maakUrl).toHaveBeenCalledTimes(1);
    expect(geefVrij).toHaveBeenCalledWith('blob:nep');
    vi.useRealTimers();
  });

  it('exportTransactions laat het boekjaar weg als er geen gekozen is', async () => {
    vangDownloadOp();
    antwoordMet('boekstuk;datum;bedrag');

    await exportTransactions();

    // Zonder boekjaar blijft alleen format=csv over; een lege fiscalYearId
    // zou de backend als filter op een leeg boekjaar lezen.
    expect(laatsteVerzoek().pad).toBe('/accounting/export/transactions?format=csv');
    expect(laatsteVerzoek().query.has('fiscalYearId')).toBe(false);
  });

  it('exportAccounts gebruikt de rekeningschema-route en -bestandsnaam', async () => {
    const { anker } = vangDownloadOp();
    vi.setSystemTime(new Date('2026-05-17T10:00:00Z'));
    antwoordMet('code;naam');

    await exportAccounts('b1');

    expect(laatsteVerzoek().pad).toBe('/accounting/export/accounts?fiscalYearId=b1&format=csv');
    expect(anker.download).toBe('rekeningschema_2026-05-17.csv');
    vi.useRealTimers();
  });

  it('exportInvoices gebruikt de facturenroute en -bestandsnaam', async () => {
    const { anker } = vangDownloadOp();
    vi.setSystemTime(new Date('2026-05-17T10:00:00Z'));
    antwoordMet('nummer;bedrag');

    await exportInvoices();

    expect(laatsteVerzoek().pad).toBe('/accounting/export/invoices?format=csv');
    expect(anker.download).toBe('facturen_2026-05-17.csv');
    vi.useRealTimers();
  });

  it('exportBalanceSheet stuurt het verplichte boekjaar altijd mee', async () => {
    const { anker } = vangDownloadOp();
    vi.setSystemTime(new Date('2026-05-17T10:00:00Z'));
    antwoordMet('rekening;saldo');

    await exportBalanceSheet('b1');

    // De backend geeft een 400 zonder boekjaar, dus dit veld hoort er te staan.
    expect(laatsteVerzoek().query.get('fiscalYearId')).toBe('b1');
    expect(laatsteVerzoek().pad).toBe('/accounting/export/balance-sheet?fiscalYearId=b1&format=csv');
    expect(anker.download).toBe('balans_2026-05-17.csv');
    vi.useRealTimers();
  });

  it('exportProfitLoss gebruikt de winst-en-verliesroute', async () => {
    const { anker } = vangDownloadOp();
    vi.setSystemTime(new Date('2026-05-17T10:00:00Z'));
    antwoordMet('rekening;bedrag');

    await exportProfitLoss('b1');

    expect(laatsteVerzoek().pad).toBe('/accounting/export/profit-loss?fiscalYearId=b1&format=csv');
    expect(anker.download).toBe('winst_verlies_2026-05-17.csv');
    vi.useRealTimers();
  });

  it('exportRelations kent geen boekjaar en vraagt alleen csv', async () => {
    const { anker } = vangDownloadOp();
    vi.setSystemTime(new Date('2026-05-17T10:00:00Z'));
    antwoordMet('naam;saldo');

    await exportRelations();

    expect(laatsteVerzoek().pad).toBe('/accounting/export/relations?format=csv');
    expect(anker.download).toBe('relaties_2026-05-17.csv');
    vi.useRealTimers();
  });

  it('zet geen download klaar als de server een fout geeft', async () => {
    const { klik, geefVrij } = vangDownloadOp();
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(exportTransactions('b1')).rejects.toMatchObject({ response: { status: 403 } });
    expect(klik).not.toHaveBeenCalled();
    expect(geefVrij).not.toHaveBeenCalled();
  });
});

// ===========================================
// ALGEMEEN GEDRAG
// ===========================================

describe('algemeen gedrag van de boekhouding-api', () => {
  it('stuurt precies een verzoek per aanroep', async () => {
    antwoordMet([]);
    await getAccounts();

    expect(alleVerzoeken()).toHaveLength(1);
  });

  it('werpt bij een netwerkfout zonder respons', async () => {
    antwoordMetNetwerkfout();

    await expect(getAccounts()).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('werpt als het verzoek in de tijdslimiet loopt', async () => {
    antwoordMetTijdslimiet();

    await expect(getAccounts()).rejects.toMatchObject({ code: 'ECONNABORTED' });
  });

  it('geeft een leeg antwoordlichaam door als lege string in plaats van te vallen', async () => {
    antwoordMet('', { status: 204 });

    await expect(deleteBudget('bg1')).resolves.toBe('');
  });

  it('geeft null door zoals het binnenkomt', async () => {
    antwoordMet(null);

    await expect(getInvoice('f1')).resolves.toBeNull();
  });

  it('laat een 500 door in plaats van undefined te leveren', async () => {
    antwoordMetFout(500, { error: 'Interne fout' });

    await expect(getTransactions()).rejects.toMatchObject({ response: { status: 500 } });
  });
});
