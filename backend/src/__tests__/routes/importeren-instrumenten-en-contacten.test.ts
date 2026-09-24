/**
 * Instrumenten in bezit en contacten inlezen uit een spreadsheet (WP11):
 * routes/importeren.ts, services/importeren/instrumenten.ts en contacten.ts.
 *
 * Wat hier vastligt, naast wat voor elke import geldt (zie
 * importeren-spreadsheet.test.ts):
 * - de import hoort bij de module: staat die uit, dan bestaat de route niet;
 * - de sleutel voor "bestaat al" (serienummer of naam bij instrumenten, naam
 *   bij contacten), en dat een andere vereniging daar niet in meetelt;
 * - bedragen, datums en keuzelijsten zoals ze in een spreadsheet staan.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import importerenRoutes from '../../routes/importeren';
import { errorHandler } from '../../middleware/errorHandler';
import { optionalAuth } from '../../middleware/auth';
import { requireModule } from '../../middleware/requireModule';
import { setModuleEnabled } from '../../modules/service';
import { leesBedrag, leesDatum } from '../../services/importeren';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

// Dezelfde guards als in index.ts.
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/import/instrumenten', optionalAuth, requireModule('inventory'));
app.use('/api/import/contacten', optionalAuth, requireModule('contacts'));
app.use('/api/import', importerenRoutes);
app.use(errorHandler);

let vereniging: TestAssociation;
let beheerder: TestUser;
let beheerderToken: string;
let lidToken: string;
let muziekcommissieToken: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  vereniging = omgeving.association;
  beheerder = omgeving.adminUser;
  beheerderToken = omgeving.adminToken;
  lidToken = omgeving.memberToken;
  muziekcommissieToken = omgeving.musicCommitteeToken;
  setModuleEnabled(vereniging.id, 'inventory', true, beheerder.id);
  setModuleEnabled(vereniging.id, 'contacts', true, beheerder.id);
});

const stuur = (token: string, pad: string, csv: string) =>
  request(app).post(`/api/import${pad}`).set('Authorization', `Bearer ${token}`).send({ csv });

describe('instrumenten importeren', () => {
  const INSTRUMENTEN = [
    'Naam;Soort;Categorie;Merk;Serienummer;Bouwjaar;Aankoopdatum;Aankoopprijs;Status;Staat;Locatie',
    'Trompet 1;Trompet;Koperblazers;Yamaha;YTR-123;2015;15-03-2016;€ 1.249,50;uitgeleend;goed;Kast 2',
    'Trompet 2;Trompet;Koper;Bach;;1790;31-02-2020;veel;Kapot?;;',
  ].join('\n');

  it('importeert instrumenten met bedragen, datums en keuzes zoals ze in een spreadsheet staan', async () => {
    const antwoord = await stuur(beheerderToken, '/instrumenten', INSTRUMENTEN);

    expect(antwoord.status).toBe(201);
    expect(antwoord.body.geimporteerd).toBe(2);

    const eerste = db
      .prepare('SELECT * FROM instrument_assets WHERE serial_number = ? AND association_id = ?')
      .get('YTR-123', vereniging.id) as Record<string, unknown>;
    expect(eerste).toMatchObject({
      name: 'Trompet 1',
      instrument_type: 'Trompet',
      category: 'brass',
      brand: 'Yamaha',
      year_manufactured: 2015,
      purchase_date: '2016-03-15',
      purchase_price: 1249.5,
      status: 'on_loan',
      condition: 'good',
      location: 'Kast 2',
      created_by: beheerder.id,
    });

    // Wat niet te lezen is, valt weg met een waarschuwing; de regel komt wel binnen.
    expect(antwoord.body.regels[1].waarschuwingen).toEqual([
      'Bouwjaar "1790" is geen jaar tussen 1800 en ' + new Date().getFullYear() + ' en wordt overgeslagen.',
      'Aankoopdatum "31-02-2020" is niet te lezen en wordt overgeslagen.',
      'Aankoopprijs "veel" is geen bedrag en wordt overgeslagen.',
      'Status "Kapot?" is onbekend; het wordt de standaardwaarde.',
    ]);
  });

  it('herkent een bestaand instrument aan het serienummer, en zonder serienummer aan de naam', async () => {
    await stuur(beheerderToken, '/instrumenten', INSTRUMENTEN);

    const nogmaals = [
      'Naam;Soort;Serienummer',
      'Andere naam;Trompet;ytr-123',
      'Trompet 2;Trompet;',
      'Trompet 3;Trompet;',
    ].join('\n');
    const antwoord = await stuur(beheerderToken, '/instrumenten/voorbeeld', nogmaals);

    expect(antwoord.body.regels.map((r: { status: string }) => r.status)).toEqual(['bestaat', 'bestaat', 'nieuw']);
  });

  it('telt instrumenten van een andere vereniging niet mee', async () => {
    const andere = createTestAssociation({ name: 'Andere vereniging' });
    db.prepare(
      "INSERT INTO instrument_assets (id, association_id, name, instrument_type, category, serial_number) VALUES (?, ?, 'Trompet 1', 'Trompet', 'brass', 'YTR-123')",
    ).run(uuidv4(), andere.id);

    const antwoord = await stuur(beheerderToken, '/instrumenten/voorbeeld', INSTRUMENTEN);

    expect(antwoord.body.tellingen).toEqual({ nieuw: 2, bestaat: 0, bijwerken: 0, fout: 0 });
  });

  it('mag de instrumentencommissie ook, een lid en de muziekcommissie niet', async () => {
    const commissie = createTestUser(vereniging.id, { email: 'materiaal@test.com', role: 'equipment_committee' });
    expect((await stuur(generateTestToken(commissie), '/instrumenten/voorbeeld', INSTRUMENTEN)).status).toBe(200);
    expect((await stuur(muziekcommissieToken, '/instrumenten/voorbeeld', INSTRUMENTEN)).status).toBe(403);
    expect((await stuur(lidToken, '/instrumenten', INSTRUMENTEN)).status).toBe(403);
  });

  it('bestaat niet als de module inventaris uit staat', async () => {
    setModuleEnabled(vereniging.id, 'inventory', false, beheerder.id);

    const antwoord = await stuur(beheerderToken, '/instrumenten', INSTRUMENTEN);

    expect(antwoord.status).toBe(404);
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM instrument_assets WHERE association_id = ?').get(vereniging.id),
    ).toEqual({
      n: 0,
    });
  });
});

describe('contacten importeren', () => {
  const CONTACTEN = [
    'Naam;Soort;Contactpersoon;E-mail;Telefoon;Plaats;IBAN;Website;Categorie',
    'Muziekhandel De Toon;leverancier;Piet;info@detoon.nl;0123-456789;Utrecht;NL91 ABNA 0417 1643 00;www.detoon.nl;Sponsors',
    'Stadsschouwburg;zaal;;geen-adres;;Zwolle;12345;;Onbekend',
  ].join('\n');

  beforeEach(() => {
    db.prepare("INSERT INTO contact_categories (id, association_id, name) VALUES (?, ?, 'Sponsors')").run(
      uuidv4(),
      vereniging.id,
    );
  });

  it('importeert contacten, met IBAN zonder spaties en een website met https', async () => {
    const antwoord = await stuur(muziekcommissieToken, '/contacten', CONTACTEN);

    expect(antwoord.status).toBe(201);
    expect(antwoord.body.geimporteerd).toBe(2);

    const toon = db
      .prepare('SELECT * FROM contacts WHERE name = ? AND association_id = ?')
      .get('Muziekhandel De Toon', vereniging.id) as Record<string, unknown>;
    expect(toon).toMatchObject({
      contact_type: 'vendor',
      contact_person: 'Piet',
      email: 'info@detoon.nl',
      city: 'Utrecht',
      iban: 'NL91ABNA0417164300',
      website: 'https://www.detoon.nl',
    });
    const categorieen = db
      .prepare('SELECT COUNT(*) AS n FROM contact_category_links WHERE contact_id = ?')
      .get(toon.id);
    expect(categorieen).toEqual({ n: 1 });

    expect(antwoord.body.regels[1]).toMatchObject({
      status: 'nieuw',
      gegevens: { soort: 'venue', email: null, iban: null },
      waarschuwingen: [
        '"geen-adres" is geen geldig e-mailadres en wordt niet overgenomen.',
        '"12345" is geen IBAN en wordt niet overgenomen.',
        'Categorie "Onbekend" bestaat niet en wordt overgeslagen.',
      ],
    });
  });

  it('slaat een contact over dat er al is, maar niet een contact van een andere vereniging', async () => {
    const andere = createTestAssociation({ name: 'Andere vereniging' });
    db.prepare(
      "INSERT INTO contacts (id, association_id, contact_type, name) VALUES (?, ?, 'organization', 'Stadsschouwburg')",
    ).run(uuidv4(), andere.id);
    db.prepare(
      "INSERT INTO contacts (id, association_id, contact_type, name) VALUES (?, ?, 'vendor', 'muziekhandel de toon')",
    ).run(uuidv4(), vereniging.id);

    const antwoord = await stuur(beheerderToken, '/contacten/voorbeeld', CONTACTEN);

    expect(antwoord.body.regels.map((r: { status: string }) => r.status)).toEqual(['bestaat', 'nieuw']);
  });

  it('bestaat niet als de module contacten uit staat', async () => {
    setModuleEnabled(vereniging.id, 'contacts', false, beheerder.id);
    expect((await stuur(beheerderToken, '/contacten/voorbeeld', CONTACTEN)).status).toBe(404);
  });

  it('is niet voor een gewoon lid', async () => {
    expect((await stuur(lidToken, '/contacten', CONTACTEN)).status).toBe(403);
  });
});

describe('bedragen en datums lezen', () => {
  it.each([
    ['1.249,50', 1249.5],
    ['€ 1234.56', 1234.56],
    ['1.234', 1234],
    ['75', 75],
    ['EUR 12,5', 12.5],
  ])('%s is %d', (tekst, bedrag) => {
    expect(leesBedrag(tekst)).toBe(bedrag);
  });

  it('geeft niets terug voor een bedrag dat niet te lezen is', () => {
    expect(leesBedrag('veel')).toBeUndefined();
    expect(leesBedrag('')).toBeUndefined();
  });

  it.each([
    ['2016-03-15', '2016-03-15'],
    ['15-03-2016', '2016-03-15'],
    ['5/3/2016', '2016-03-05'],
    ['15.03.2016', '2016-03-15'],
  ])('%s is %s', (tekst, datum) => {
    expect(leesDatum(tekst)).toBe(datum);
  });

  it('geeft niets terug voor een datum die niet bestaat of niet te lezen is', () => {
    expect(leesDatum('31-02-2020')).toBeUndefined();
    expect(leesDatum('maart 2016')).toBeUndefined();
  });
});
