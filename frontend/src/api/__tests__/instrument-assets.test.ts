/**
 * Tests voor de instrumenten- en verzekeringsapi.
 *
 * De veldnamen zijn vergeleken met de zod-schema's in
 * backend/src/routes/instrument-assets.ts en instrument-insurance.ts:
 * de backend leest camelCase uit de body en zet zelf om naar snake_case in de
 * database. Een veld dat hier anders heet komt daar als undefined binnen en
 * verdwijnt zonder foutmelding.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  startNepserver,
  stopNepserver,
  antwoordMet,
  antwoordMetFout,
  antwoordMetNetwerkfout,
  laatsteVerzoek,
} from './nepserver';
import {
  getAssetCategories,
  getAssetStatuses,
  getAssetConditions,
  getInstrumentAssets,
  getInstrumentAssetsSummary,
  getMaintenanceDueAssets,
  getInstrumentAsset,
  createInstrumentAsset,
  updateInstrumentAsset,
  deleteInstrumentAsset,
  recordAssetMaintenance,
  getAssetValuations,
  createAssetValuation,
  getAssetRepairs,
  createAssetRepair,
  updateAssetRepair,
  getAssetLoans,
  createAssetLoan,
  returnAssetLoan,
  getAssetDocuments,
  createAssetDocument,
  deleteAssetDocument,
  getAssetHistory,
  getInsurancePolicies,
  getInsurancePoliciesSummary,
  getExpiringPolicies,
  getInsurancePolicy,
  createInsurancePolicy,
  updateInsurancePolicy,
  deleteInsurancePolicy,
  addAssetToPolicyCoverage,
  removeAssetFromPolicyCoverage,
  getInsuranceClaims,
  getInsuranceClaim,
  createInsuranceClaim,
  updateInsuranceClaim,
} from '../instrument-assets';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

// ===========================================
// KEUZELIJSTEN
// ===========================================

describe('keuzelijsten', () => {
  it.each([
    ['getAssetCategories', getAssetCategories, '/instrument-assets/categories'],
    ['getAssetStatuses', getAssetStatuses, '/instrument-assets/statuses'],
    ['getAssetConditions', getAssetConditions, '/instrument-assets/conditions'],
  ])('%s bevraagt %s', async (_naam, aanroep, pad) => {
    antwoordMet(['a', 'b']);
    const lijst = await aanroep();

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe(pad);
    expect(lijst).toEqual(['a', 'b']);
  });

  it('geeft een lege keuzelijst door zonder er iets van te maken', async () => {
    antwoordMet([]);
    await expect(getAssetCategories()).resolves.toEqual([]);
  });
});

// ===========================================
// LIJST EN FILTERS
// ===========================================

describe('getInstrumentAssets', () => {
  it('zet alle filters in de queryreeks', async () => {
    antwoordMet({ data: [], pagination: {} });

    await getInstrumentAssets({
      search: 'trompet',
      status: 'available',
      category: 'brass',
      condition: 'good',
      page: 3,
      limit: 20,
    });

    const { pad, query } = laatsteVerzoek();
    expect(pad).toBe('/instrument-assets');
    expect(query.get('search')).toBe('trompet');
    expect(query.get('status')).toBe('available');
    expect(query.get('category')).toBe('brass');
    expect(query.get('condition')).toBe('good');
    expect(query.get('page')).toBe('3');
    expect(query.get('limit')).toBe('20');
  });

  it('stuurt geen queryreeks mee zonder filters', async () => {
    antwoordMet({ data: [] });
    await getInstrumentAssets();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('codeert een zoekterm met spatie, ampersand en procentteken', async () => {
    antwoordMet({ data: [] });
    await getInstrumentAssets({ search: 'Bach & Zn 50% korting' });

    const { queryreeks, query } = laatsteVerzoek();
    // Een onbewerkte & zou de rest van de zoekterm in een tweede parameter
    // duwen; een onbewerkte % maakt de reeks zelfs onleesbaar voor de server.
    expect(queryreeks).toContain('%26');
    expect(queryreeks).toContain('50%25');
    expect(query.get('search')).toBe('Bach & Zn 50% korting');
  });

  it('houdt een schuine streep en een vraagteken in de zoekterm binnen dezelfde parameter', async () => {
    antwoordMet({ data: [] });
    await getInstrumentAssets({ search: 'B/es? nr 3' });

    expect(laatsteVerzoek().query.get('search')).toBe('B/es? nr 3');
    // De zoekterm mag niet als tweede queryreeks worden gelezen.
    expect([...laatsteVerzoek().query.keys()]).toEqual(['search']);
  });

  it('laat een lege zoekterm staan zoals hij is (de backend negeert hem)', async () => {
    antwoordMet({ data: [] });
    await getInstrumentAssets({ search: '' });

    expect(laatsteVerzoek().query.get('search')).toBe('');
  });

  it('geeft het paginaobject van de server ongewijzigd terug', async () => {
    // De backend levert { data, pagination: {...} }; deze laag zet niets om.
    const antwoord = {
      data: [{ id: 'a1', name: 'Trompet' }],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
    };
    antwoordMet(antwoord);

    await expect(getInstrumentAssets()).resolves.toEqual(antwoord);
  });

  it('laat een 401 door en levert geen lege lijst op', async () => {
    antwoordMetFout(401, { error: 'Niet ingelogd.' });

    await expect(getInstrumentAssets()).rejects.toMatchObject({ response: { status: 401 } });
  });

  it('laat een netwerkfout door', async () => {
    antwoordMetNetwerkfout();

    await expect(getInstrumentAssets()).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });
});

describe('getInstrumentAssetsSummary', () => {
  it('bevraagt /instrument-assets/summary', async () => {
    antwoordMet({ totalAssets: 12 });
    await getInstrumentAssetsSummary();

    // Dit vaste pad staat in de backend voor /:id geregistreerd, dus het mag
    // niet als instrument-id gelezen worden.
    expect(laatsteVerzoek().pad).toBe('/instrument-assets/summary');
  });
});

describe('getMaintenanceDueAssets', () => {
  it('geeft het aantal dagen als queryparameter mee', async () => {
    antwoordMet([]);
    await getMaintenanceDueAssets(60);

    expect(laatsteVerzoek().pad).toBe('/instrument-assets/maintenance-due');
    expect(laatsteVerzoek().query.get('days')).toBe('60');
  });

  it('laat days weg als er geen aantal is opgegeven, zodat de backend zijn eigen 30 gebruikt', async () => {
    antwoordMet([]);
    await getMaintenanceDueAssets();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('stuurt days=0 wel mee', async () => {
    antwoordMet([]);
    await getMaintenanceDueAssets(0);

    expect(laatsteVerzoek().query.get('days')).toBe('0');
  });
});

// ===========================================
// EEN INSTRUMENT
// ===========================================

describe('getInstrumentAsset', () => {
  it('bevraagt het instrument op id', async () => {
    antwoordMet({ id: 'a1', name: 'Trompet' });
    await getInstrumentAsset('a1');

    expect(laatsteVerzoek().pad).toBe('/instrument-assets/a1');
  });

  it('laat een 404 door', async () => {
    antwoordMetFout(404, { error: 'Instrument niet gevonden' });

    await expect(getInstrumentAsset('weg')).rejects.toMatchObject({ response: { status: 404 } });
  });
});

describe('createInstrumentAsset', () => {
  it('stuurt alle velden in camelCase, precies zoals createAssetSchema ze leest', async () => {
    antwoordMet({ id: 'a1' }, { status: 201 });

    await createInstrumentAsset({
      name: 'Bugel',
      instrumentType: 'bugel',
      category: 'brass',
      brand: 'Yamaha',
      model: 'YFH-631',
      serialNumber: 'SN-1',
      barcode: '12345',
      yearManufactured: 2019,
      countryOfOrigin: 'Japan',
      color: 'goudlak',
      material: 'messing',
      weightKg: 1.4,
      dimensions: '50x20x20',
      purchaseDate: '2020-01-15',
      purchasePrice: 250000,
      purchaseVendor: 'Adams',
      currentValue: 200000,
      replacementValue: 300000,
      depreciationRate: 7,
      status: 'available',
      condition: 'good',
      location: 'Repetitielokaal',
      storageLocation: 'Kast 3',
      maintenanceIntervalMonths: 12,
      photoUrls: ['/u/1.jpg'],
      tags: ['solo'],
      notes: 'Klep loopt stroef',
      customFields: { verzekerd: true },
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/instrument-assets');
    const body = verzoek.body as Record<string, unknown>;
    expect(body.instrumentType).toBe('bugel');
    expect(body.serialNumber).toBe('SN-1');
    expect(body.yearManufactured).toBe(2019);
    expect(body.weightKg).toBe(1.4);
    expect(body.purchaseDate).toBe('2020-01-15');
    expect(body.maintenanceIntervalMonths).toBe(12);
    expect(body.storageLocation).toBe('Kast 3');
    expect(body.photoUrls).toEqual(['/u/1.jpg']);
    expect(body.customFields).toEqual({ verzekerd: true });
    // Geen enkel veld mag onderweg naar snake_case zijn omgezet.
    expect(Object.keys(body).some((sleutel) => sleutel.includes('_'))).toBe(false);
  });

  it('geeft het id van het nieuwe instrument terug', async () => {
    antwoordMet({ id: 'a1', message: 'Aangemaakt' }, { status: 201 });

    await expect(
      createInstrumentAsset({ name: 'Bugel', instrumentType: 'bugel', category: 'brass' }),
    ).resolves.toMatchObject({ id: 'a1' });
  });

  it('laat een validatiefout van de server door', async () => {
    antwoordMetFout(400, { error: 'Naam is verplicht' });

    await expect(createInstrumentAsset({ name: '', instrumentType: 'x', category: 'brass' })).rejects.toMatchObject({
      response: { status: 400, data: { error: 'Naam is verplicht' } },
    });
  });
});

describe('updateInstrumentAsset', () => {
  it('stuurt alleen de gewijzigde velden met PUT', async () => {
    antwoordMet({ message: 'Bijgewerkt' });

    await updateInstrumentAsset('a1', { condition: 'poor', notes: 'Deuk' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/instrument-assets/a1');
    expect(verzoek.body).toEqual({ condition: 'poor', notes: 'Deuk' });
  });

  it('geeft niets terug, ook niet als de server een lichaam meestuurt', async () => {
    antwoordMet({ message: 'Bijgewerkt' });

    await expect(updateInstrumentAsset('a1', { notes: 'x' })).resolves.toBeUndefined();
  });

  it('werpt bij een fout in plaats van stil te slagen', async () => {
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(updateInstrumentAsset('a1', { notes: 'x' })).rejects.toMatchObject({ response: { status: 403 } });
  });
});

describe('deleteInstrumentAsset', () => {
  it('verwijdert het instrument', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteInstrumentAsset('a1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/instrument-assets/a1');
  });
});

describe('recordAssetMaintenance', () => {
  it('stuurt datum, notitie en kosten mee en geeft de volgende onderhoudsdatum terug', async () => {
    antwoordMet({ message: 'Onderhoud geregistreerd', nextMaintenanceDue: '2027-02-01' });

    const resultaat = await recordAssetMaintenance('a1', { date: '2026-02-01', notes: 'Ventielen', cost: 4500 });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/instrument-assets/a1/record-maintenance');
    expect(verzoek.body).toEqual({ date: '2026-02-01', notes: 'Ventielen', cost: 4500 });
    expect(resultaat.nextMaintenanceDue).toBe('2027-02-01');
  });

  it('stuurt een lege body als er niets is ingevuld', async () => {
    antwoordMet({ nextMaintenanceDue: '2027-01-01' });
    await recordAssetMaintenance('a1', {});

    expect(laatsteVerzoek().body).toEqual({});
  });
});

// ===========================================
// TAXATIES, REPARATIES, BRUIKLEEN, DOCUMENTEN
// ===========================================

describe('taxaties', () => {
  it('haalt de taxaties van een instrument op', async () => {
    antwoordMet([{ id: 'v1' }]);
    await getAssetValuations('a1');

    expect(laatsteVerzoek().pad).toBe('/instrument-assets/a1/valuations');
  });

  it('stuurt een taxatie met de veldnamen uit createValuationSchema', async () => {
    antwoordMet({ id: 'v1' }, { status: 201 });

    await createAssetValuation('a1', {
      valuationDate: '2026-01-10',
      valuationType: 'insurance',
      valuedAmount: 275000,
      currency: 'EUR',
      appraiserName: 'De Vries',
      appraiserCompany: 'Taxatie BV',
      appraiserCredentials: 'RICS',
      valuationMethod: 'marktvergelijking',
      marketComparison: 'drie vergelijkbare',
      conditionAtValuation: 'good',
      certificateUrl: '/u/cert.pdf',
      notes: 'Inclusief koffer',
    });

    const body = laatsteVerzoek().body as Record<string, unknown>;
    expect(laatsteVerzoek().pad).toBe('/instrument-assets/a1/valuations');
    expect(body.valuationDate).toBe('2026-01-10');
    expect(body.valuationType).toBe('insurance');
    expect(body.valuedAmount).toBe(275000);
    expect(body.conditionAtValuation).toBe('good');
    expect(body.appraiserCredentials).toBe('RICS');
  });
});

describe('reparaties', () => {
  it('haalt de reparaties op', async () => {
    antwoordMet([]);
    await getAssetRepairs('a1');

    expect(laatsteVerzoek().pad).toBe('/instrument-assets/a1/repairs');
  });

  it('meldt een reparatie aan met de veldnamen uit createRepairSchema', async () => {
    antwoordMet({ id: 'r1' }, { status: 201 });

    await createAssetRepair('a1', {
      repairType: 'corrective',
      priority: 'high',
      issueDescription: 'Klep klemt',
      diagnosis: 'Veer gebroken',
      repairShopName: 'Blaas & Co',
      repairShopContact: 'info@blaas.example',
      repairShopAddress: 'Dorpsstraat 1',
      technicianName: 'Kees',
      estimatedCost: 12500,
      estimatedCompletion: '2026-03-01',
      warrantyClaimRef: false,
      notes: 'Spoed',
    });

    const body = laatsteVerzoek().body as Record<string, unknown>;
    expect(body.repairType).toBe('corrective');
    expect(body.issueDescription).toBe('Klep klemt');
    expect(body.repairShopName).toBe('Blaas & Co');
    expect(body.estimatedCost).toBe(12500);
    expect(body.warrantyClaimRef).toBe(false);
  });

  it('werkt een reparatie bij op het pad met zowel instrument als reparatie', async () => {
    antwoordMet({ message: 'Bijgewerkt' });

    await updateAssetRepair('a1', 'r1', {
      status: 'completed',
      actualCost: 13000,
      partsReplaced: 'veer',
      laborHours: 1.5,
      startedDate: '2026-02-20',
      completedDate: '2026-02-25',
      invoiceNumber: 'F-1',
      invoiceUrl: '/u/f1.pdf',
      qualityRating: 5,
      qualityNotes: 'Netjes',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/instrument-assets/a1/repairs/r1');
    expect(verzoek.body).toMatchObject({ status: 'completed', actualCost: 13000, laborHours: 1.5, qualityRating: 5 });
  });
});

describe('bruikleen', () => {
  it('haalt de bruiklenen op', async () => {
    antwoordMet([]);
    await getAssetLoans('a1');

    expect(laatsteVerzoek().pad).toBe('/instrument-assets/a1/loans');
  });

  it('legt een bruikleen vast met de veldnamen uit createLoanSchema', async () => {
    antwoordMet({ id: 'l1' }, { status: 201 });

    await createAssetLoan('a1', {
      borrowerUserId: 'u1',
      loanType: 'long_term',
      purpose: 'Studie',
      loanDate: '2026-01-05',
      expectedReturnDate: '2026-07-05',
      conditionAtLoan: 'good',
      accessoriesLoaned: ['koffer', 'standaard'],
      depositAmount: 5000,
      insuranceRequired: true,
      rentalFee: 1500,
      rentalPeriod: 'monthly',
      notes: 'Contract getekend',
    });

    const body = laatsteVerzoek().body as Record<string, unknown>;
    expect(laatsteVerzoek().pad).toBe('/instrument-assets/a1/loans');
    expect(body.borrowerUserId).toBe('u1');
    expect(body.conditionAtLoan).toBe('good');
    expect(body.accessoriesLoaned).toEqual(['koffer', 'standaard']);
    expect(body.insuranceRequired).toBe(true);
  });

  it('meldt een teruggave op de retourroute van die ene bruikleen', async () => {
    antwoordMet({ message: 'Retour verwerkt' });

    await returnAssetLoan('a1', 'l1', {
      actualReturnDate: '2026-06-30',
      conditionAtReturn: 'fair',
      accessoriesReturned: ['koffer'],
      returnInspectionNotes: 'Kras op beker',
      damageReported: 'Deukje',
      damageCost: 2500,
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/instrument-assets/a1/loans/l1/return');
    expect(verzoek.body).toMatchObject({
      actualReturnDate: '2026-06-30',
      conditionAtReturn: 'fair',
      damageCost: 2500,
    });
  });
});

describe('documenten', () => {
  it('haalt de documenten op', async () => {
    antwoordMet([]);
    await getAssetDocuments('a1');

    expect(laatsteVerzoek().pad).toBe('/instrument-assets/a1/documents');
  });

  it('voegt een document toe met de veldnamen uit createDocumentSchema', async () => {
    antwoordMet({ id: 'd1' }, { status: 201 });

    await createAssetDocument('a1', {
      documentType: 'warranty',
      title: 'Garantiebewijs',
      description: 'Vijf jaar',
      fileUrl: '/u/garantie.pdf',
      fileName: 'garantie.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      version: '1',
      validFrom: '2026-01-01',
      validUntil: '2031-01-01',
      isPublic: false,
      tags: ['garantie'],
    });

    const body = laatsteVerzoek().body as Record<string, unknown>;
    expect(body.documentType).toBe('warranty');
    expect(body.fileUrl).toBe('/u/garantie.pdf');
    expect(body.fileName).toBe('garantie.pdf');
    expect(body.mimeType).toBe('application/pdf');
    expect(body.isPublic).toBe(false);
  });

  it('verwijdert een document van dit instrument', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteAssetDocument('a1', 'd1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/instrument-assets/a1/documents/d1');
  });
});

describe('getAssetHistory', () => {
  it('geeft paginering mee als queryparameters', async () => {
    antwoordMet([]);
    await getAssetHistory('a1', { page: 2, limit: 10 });

    expect(laatsteVerzoek().pad).toBe('/instrument-assets/a1/history');
    expect(laatsteVerzoek().query.get('page')).toBe('2');
    expect(laatsteVerzoek().query.get('limit')).toBe('10');
  });

  it('werkt zonder paginering', async () => {
    antwoordMet([]);
    await getAssetHistory('a1');

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('geeft de gebeurtenissen ongewijzigd terug, ook de null-gebruiker', async () => {
    const antwoord = [
      { id: 'h1', eventType: 'created', eventDate: '2026-01-01', description: 'Aangemaakt', user: null },
    ];
    antwoordMet(antwoord);

    await expect(getAssetHistory('a1')).resolves.toEqual(antwoord);
  });
});

// ===========================================
// VERZEKERINGSPOLISSEN
// ===========================================

describe('polissen', () => {
  it('haalt polissen op met filters', async () => {
    antwoordMet({ data: [], pagination: {} });
    await getInsurancePolicies({ status: 'active', page: 1, limit: 10 });

    const { pad, query } = laatsteVerzoek();
    // Polissen zitten onder een eigen router: /instrument-insurance.
    expect(pad).toBe('/instrument-insurance/policies');
    expect(query.get('status')).toBe('active');
    expect(query.get('page')).toBe('1');
    expect(query.get('limit')).toBe('10');
  });

  it('haalt de samenvatting op', async () => {
    antwoordMet({ totalPolicies: 2, activePolicies: 2 });
    const samenvatting = await getInsurancePoliciesSummary();

    expect(laatsteVerzoek().pad).toBe('/instrument-insurance/policies/summary');
    expect(samenvatting.totalPolicies).toBe(2);
  });

  it('haalt aflopende polissen op met het aantal dagen', async () => {
    antwoordMet([]);
    await getExpiringPolicies(90);

    expect(laatsteVerzoek().pad).toBe('/instrument-insurance/policies/expiring');
    expect(laatsteVerzoek().query.get('days')).toBe('90');
  });

  it('laat days weg als er geen aantal is opgegeven', async () => {
    antwoordMet([]);
    await getExpiringPolicies();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('haalt een polis op id op', async () => {
    antwoordMet({ id: 'p1' });
    await getInsurancePolicy('p1');

    expect(laatsteVerzoek().pad).toBe('/instrument-insurance/policies/p1');
  });

  it('maakt een polis aan met de veldnamen die de backend leest', async () => {
    antwoordMet({ id: 'p1' }, { status: 201 });

    await createInsurancePolicy({
      policyNumber: 'POL-1',
      providerName: 'Interpolis',
      providerContact: 'Balie',
      providerPhone: '0800-1234',
      providerEmail: 'polis@example.com',
      policyType: 'all_risk',
      coverageType: 'collective',
      coverageAmount: 5000000,
      deductible: 25000,
      currency: 'EUR',
      premiumAmount: 120000,
      premiumFrequency: 'yearly',
      premiumDueDate: '2026-01-01',
      startDate: '2026-01-01',
      endDate: '2027-01-01',
      autoRenew: true,
      coverageDetails: 'Wereldwijd',
      exclusions: 'Opzet',
      documentUrl: '/u/polis.pdf',
    });

    const body = laatsteVerzoek().body as Record<string, unknown>;
    expect(laatsteVerzoek().methode).toBe('post');
    expect(body.policyNumber).toBe('POL-1');
    expect(body.providerName).toBe('Interpolis');
    expect(body.policyType).toBe('all_risk');
    expect(body.coverageAmount).toBe(5000000);
    expect(body.premiumFrequency).toBe('yearly');
    expect(body.autoRenew).toBe(true);
  });

  it('werkt een polis bij', async () => {
    antwoordMet({ message: 'Bijgewerkt' });
    await updateInsurancePolicy('p1', { coverageAmount: 6000000 });

    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/instrument-insurance/policies/p1');
    expect(laatsteVerzoek().body).toEqual({ coverageAmount: 6000000 });
  });

  it('verwijdert een polis', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteInsurancePolicy('p1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/instrument-insurance/policies/p1');
  });

  it('hangt een instrument onder een polis', async () => {
    antwoordMet({ id: 'cov1' }, { status: 201 });

    await addAssetToPolicyCoverage('p1', {
      assetId: 'a1',
      coveredAmount: 300000,
      coverageStart: '2026-01-01',
      coverageEnd: '2027-01-01',
      specialConditions: 'Alleen in Nederland',
    });

    expect(laatsteVerzoek().pad).toBe('/instrument-insurance/policies/p1/coverage');
    expect(laatsteVerzoek().body).toMatchObject({ assetId: 'a1', coveredAmount: 300000 });
  });

  it('haalt een instrument weer onder een polis vandaan', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await removeAssetFromPolicyCoverage('p1', 'cov1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/instrument-insurance/policies/p1/coverage/cov1');
  });
});

// ===========================================
// SCHADEMELDINGEN
// ===========================================

describe('schademeldingen', () => {
  it('haalt meldingen op met filters', async () => {
    antwoordMet({ data: [], pagination: {} });
    await getInsuranceClaims({ status: 'submitted', page: 2 });

    expect(laatsteVerzoek().pad).toBe('/instrument-insurance/claims');
    expect(laatsteVerzoek().query.get('status')).toBe('submitted');
    expect(laatsteVerzoek().query.get('page')).toBe('2');
  });

  it('haalt een melding op id op', async () => {
    antwoordMet({ id: 'cl1', policy: {}, asset: {}, documentUrls: [], photos: [] });
    await getInsuranceClaim('cl1');

    expect(laatsteVerzoek().pad).toBe('/instrument-insurance/claims/cl1');
  });

  it('maakt een melding aan met de veldnamen die de backend leest', async () => {
    antwoordMet({ id: 'cl1' }, { status: 201 });

    await createInsuranceClaim({
      policyId: 'p1',
      assetId: 'a1',
      claimNumber: 'CL-1',
      claimDate: '2026-02-02',
      incidentDate: '2026-02-01',
      incidentType: 'theft',
      incidentDescription: 'Gestolen uit de bus',
      incidentLocation: 'Utrecht',
      claimedAmount: 250000,
      policeReportNumber: 'PV-1',
      witnessInfo: 'Chauffeur',
      photos: ['/u/1.jpg'],
    });

    const body = laatsteVerzoek().body as Record<string, unknown>;
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/instrument-insurance/claims');
    expect(body.policyId).toBe('p1');
    expect(body.assetId).toBe('a1');
    expect(body.incidentType).toBe('theft');
    expect(body.incidentDescription).toBe('Gestolen uit de bus');
    expect(body.policeReportNumber).toBe('PV-1');
    expect(body.photos).toEqual(['/u/1.jpg']);
  });

  it('werkt een melding bij', async () => {
    antwoordMet({ message: 'Bijgewerkt' });

    await updateInsuranceClaim('cl1', {
      status: 'approved',
      approvedAmount: 200000,
      paidAmount: 200000,
      resolutionDate: '2026-03-01',
      resolutionNotes: 'Uitgekeerd',
      documentUrls: ['/u/brief.pdf'],
    });

    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/instrument-insurance/claims/cl1');
    expect(laatsteVerzoek().body).toMatchObject({ status: 'approved', approvedAmount: 200000 });
  });

  it('laat een 500 door in plaats van undefined te leveren', async () => {
    antwoordMetFout(500, { error: 'Interne fout' });

    await expect(getInsuranceClaims()).rejects.toMatchObject({ response: { status: 500 } });
  });
});
