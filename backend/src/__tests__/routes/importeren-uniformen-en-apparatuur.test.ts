/**
 * Uniformen en apparatuur inlezen uit een spreadsheet (WP11):
 * routes/importeren.ts, services/importeren/uniformen.ts en apparatuur.ts.
 *
 * Wat hier vastligt, naast wat voor elke import geldt (zie
 * importeren-spreadsheet.test.ts):
 * - beide horen bij de module inventaris: staat die uit, dan bestaat de route
 *   niet;
 * - de rollen: de uniformcommissie doet uniformen, de materiaalcommissie
 *   apparatuur;
 * - uniformen hebben geen nummer, dus "bestaat al" is een telling per soort,
 *   maat, kleur en drager: hetzelfde bestand twee keer inlezen verdubbelt
 *   niets;
 * - een uniform uitgegeven aan een lid krijgt ook een uitgifte, en alleen een
 *   lid van de eigen vereniging kan het krijgen;
 * - apparatuur bestaat al bij hetzelfde inventarisnummer, serienummer of
 *   naam, en wie geen nummer opgeeft krijgt er een in de EQ-reeks.
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
app.use('/api/import/uniformen', optionalAuth, requireModule('inventory'));
app.use('/api/import/apparatuur', optionalAuth, requireModule('inventory'));
app.use('/api/import', importerenRoutes);
app.use(errorHandler);

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
  setModuleEnabled(vereniging.id, 'inventory', true, beheerder.id);
});

const stuur = (token: string, pad: string, csv: string) =>
  request(app).post(`/api/import${pad}`).set('Authorization', `Bearer ${token}`).send({ csv });

const uniformen = (associationId = vereniging.id) =>
  db
    .prepare('SELECT * FROM uniform_items WHERE association_id = ? ORDER BY item_type, size_standard')
    .all(associationId) as Record<string, unknown>[];

describe('uniformen importeren', () => {
  it('importeert onderdelen met aantal, maten en keuzes zoals ze in een spreadsheet staan', async () => {
    const csv = [
      'Soort;Maat;Lengte;Wijdte;Kleur;Aantal;Staat;Aankoopdatum;Aankoopprijs',
      'Jas;52;;;Bordeauxrood;3;goed;15-03-2019;€ 189,95',
      'Broek;;84;32;Zwart;1;versleten;;',
      'Epaulet;;;;Goud;2;;;',
    ].join('\n');

    const antwoord = await stuur(beheerderToken, '/uniformen', csv);

    expect(antwoord.status).toBe(201);
    expect(antwoord.body.geimporteerd).toBe(6);
    const rijen = uniformen();
    expect(rijen.filter((r) => r.item_type === 'jacket')).toHaveLength(3);
    expect(rijen.find((r) => r.item_type === 'jacket')).toMatchObject({
      size_standard: '52',
      color: 'Bordeauxrood',
      condition: 'good',
      status: 'available',
      purchase_date: '2019-03-15',
      purchase_price: 189.95,
    });
    expect(rijen.find((r) => r.item_type === 'pants')).toMatchObject({
      size_length: 84,
      size_width: 32,
      condition: 'poor',
    });
    // Een onbekende soort wordt "overig", met de naam bewaard.
    const overig = rijen.filter((r) => r.item_type === 'other');
    expect(overig).toHaveLength(2);
    expect(overig[0].notes).toBe('Epaulet');
    expect(antwoord.body.regels[2].waarschuwingen[0]).toContain('Epaulet');
  });

  it('verdubbelt niets als hetzelfde bestand nog eens wordt ingelezen, en vult een tekort aan', async () => {
    const csv = ['Soort;Maat;Kleur;Aantal', 'Jas;52;Rood;2', 'Jas;54;Rood;1'].join('\n');
    await stuur(beheerderToken, '/uniformen', csv);

    const nogmaals = await stuur(beheerderToken, '/uniformen/voorbeeld', csv);
    expect(nogmaals.body.tellingen).toEqual({ nieuw: 0, bestaat: 2, fout: 0 });

    // Nu vier jassen in maat 52: twee zijn er al.
    const meer = await stuur(beheerderToken, '/uniformen', ['Soort;Maat;Kleur;Aantal', 'jas;52;rood;4'].join('\n'));
    expect(meer.body.regels[0]).toMatchObject({ status: 'nieuw', gegevens: { aantal: 4, toeTeVoegen: 2 } });
    expect(meer.body.regels[0].waarschuwingen).toEqual(['2 van de 4 zijn er al; 2 worden toegevoegd.']);
    expect(uniformen().filter((r) => r.size_standard === '52')).toHaveLength(4);
  });

  it('geeft een onderdeel uit aan een lid, met een uitgifte erbij', async () => {
    const csv = ['Soort;Maat;Uitgegeven aan;Uitgiftedatum', `Jas;50;${lid.email.toUpperCase()};01-09-2024`].join('\n');

    const antwoord = await stuur(beheerderToken, '/uniformen', csv);

    expect(antwoord.status).toBe(201);
    const [jas] = uniformen();
    expect(jas).toMatchObject({ status: 'issued', current_user_id: lid.id });
    const uitgifte = db.prepare('SELECT * FROM uniform_assignments WHERE uniform_item_id = ?').get(jas.id);
    expect(uitgifte).toMatchObject({ user_id: lid.id, assigned_date: '2024-09-01', returned_date: null });
    // Het voorbeeld toont het adres, niet het interne id van het lid.
    expect(antwoord.body.regels[0].gegevens.uitgegevenAan).toBe(lid.email.toLowerCase());
    expect(antwoord.body.regels[0]).not.toHaveProperty('dragerId');
  });

  it('geeft geen onderdeel uit aan iemand van een andere vereniging', async () => {
    const andere = createTestAssociation({ name: 'Andere vereniging' });
    const vreemde = createTestUser(andere.id, { email: 'vreemde@andere.nl' });

    const antwoord = await stuur(
      beheerderToken,
      '/uniformen',
      ['Soort;Maat;Status;Uitgegeven aan', `Jas;50;uitgegeven;${vreemde.email}`].join('\n'),
    );

    expect(antwoord.body.regels[0].waarschuwingen[0]).toContain('geen lid van de vereniging');
    const [jas] = uniformen();
    expect(jas).toMatchObject({ status: 'available', current_user_id: null });
    expect(db.prepare('SELECT COUNT(*) AS n FROM uniform_assignments WHERE user_id = ?').get(vreemde.id)).toEqual({
      n: 0,
    });
  });

  it('weigert een regel die meerdere onderdelen aan één lid geeft', async () => {
    const antwoord = await stuur(
      beheerderToken,
      '/uniformen/voorbeeld',
      ['Soort;Aantal;Uitgegeven aan', `Jas;2;${lid.email}`].join('\n'),
    );

    expect(antwoord.body.regels[0].status).toBe('fout');
  });

  it('telt de uniformen van een andere vereniging niet mee als bestaand', async () => {
    const andere = createTestAssociation({ name: 'Andere vereniging' });
    db.prepare(
      "INSERT INTO uniform_items (id, association_id, item_type, size_standard, color) VALUES (?, ?, 'jacket', '52', 'Rood')",
    ).run(uuidv4(), andere.id);

    const antwoord = await stuur(beheerderToken, '/uniformen/voorbeeld', 'Soort;Maat;Kleur\nJas;52;Rood\n');

    expect(antwoord.body.tellingen.nieuw).toBe(1);
  });

  it('laat de uniformcommissie importeren, de materiaalcommissie en een lid niet', async () => {
    const uniformcommissie = createTestUser(vereniging.id, {
      email: 'uniform@test.com',
      role: 'uniforms_committee',
    });
    const materiaal = createTestUser(vereniging.id, { email: 'materiaal@test.com', role: 'equipment_committee' });

    expect((await stuur(generateTestToken(uniformcommissie), '/uniformen', 'Soort\nJas\n')).status).toBe(201);
    expect((await stuur(generateTestToken(materiaal), '/uniformen', 'Soort\nJas\n')).status).toBe(403);
    expect((await stuur(lidToken, '/uniformen/voorbeeld', 'Soort\nJas\n')).status).toBe(403);
  });

  it('bestaat niet als de module inventaris uit staat', async () => {
    setModuleEnabled(vereniging.id, 'inventory', false, beheerder.id);

    expect((await stuur(beheerderToken, '/uniformen/voorbeeld', 'Soort\nJas\n')).status).toBe(404);
    expect((await stuur(beheerderToken, '/apparatuur/voorbeeld', 'Naam\nMengtafel\n')).status).toBe(404);
  });
});

const apparatuur = (associationId = vereniging.id) =>
  db
    .prepare('SELECT * FROM equipment_items WHERE association_id = ? ORDER BY inventory_number')
    .all(associationId) as Record<string, unknown>[];

describe('apparatuur importeren', () => {
  it('importeert apparatuur met nummers, bedragen, datums en keuzes zoals ze in een spreadsheet staan', async () => {
    db.prepare("INSERT INTO equipment_categories (id, association_id, name) VALUES (?, ?, 'Geluid')").run(
      uuidv4(),
      vereniging.id,
    );
    const csv = [
      'Naam;Soort;Categorie;Inventarisnummer;Merk;Model;Serienummer;Status;Staat;Aankoopprijs;Laatste onderhoud;Onderhoudsinterval;Uitleenbaar',
      'Mengtafel;geluid;geluid;GEL-01;Yamaha;MG12;Y-123;beschikbaar;goed;€ 449,00;31-01-2024;1;nee',
      'Lessenaar 1;meubilair;Meubels;;;;;in gebruik;kapot;;;;',
      'Aanhanger;aanhanger;;;;;;;;;;12 maanden;ja',
    ].join('\n');

    const antwoord = await stuur(beheerderToken, '/apparatuur', csv);

    expect(antwoord.status).toBe(201);
    expect(antwoord.body.geimporteerd).toBe(3);
    expect(apparatuur()).toHaveLength(3);
    const mengtafel = apparatuur().find((r) => r.name === 'Mengtafel');
    expect(mengtafel).toMatchObject({
      equipment_type: 'audio',
      inventory_number: 'GEL-01',
      brand: 'Yamaha',
      serial_number: 'Y-123',
      status: 'available',
      condition: 'good',
      purchase_price: 449,
      last_maintenance: '2024-01-31',
      // Een maand na 31 januari is de laatste dag van februari.
      next_maintenance: '2024-02-29',
      maintenance_interval_months: 1,
      is_loanable: 0,
    });
    expect(mengtafel?.category_id).toBeTruthy();
    const lessenaar = apparatuur().find((r) => r.name === 'Lessenaar 1');
    expect(lessenaar).toMatchObject({ equipment_type: 'furniture', status: 'in_use', condition: 'broken' });
    // Een categorie die er niet is, wordt niet stilletjes aangemaakt.
    expect(lessenaar?.category_id).toBeNull();
    expect(antwoord.body.regels[1].waarschuwingen[0]).toContain('Meubels');
    expect(apparatuur().find((r) => r.name === 'Aanhanger')).toMatchObject({
      equipment_type: 'transport',
      maintenance_interval_months: 12,
      is_loanable: 1,
    });
  });

  it('geeft apparatuur zonder nummer een vrij nummer in de EQ-reeks', async () => {
    // EQ-00002 is al bezet, ook al telt de vereniging maar één stuk.
    db.prepare(
      "INSERT INTO equipment_items (id, association_id, name, equipment_type, inventory_number) VALUES (?, ?, 'Oud', 'misc', 'EQ-00002')",
    ).run(uuidv4(), vereniging.id);

    const antwoord = await stuur(beheerderToken, '/apparatuur', 'Naam\nStandaard A\nStandaard B\n');

    expect(
      antwoord.body.regels.map((r: { gegevens: { inventarisnummer: string } }) => r.gegevens.inventarisnummer),
    ).toEqual(['EQ-00003', 'EQ-00004']);
    expect(apparatuur().map((r) => r.inventory_number)).toEqual(['EQ-00002', 'EQ-00003', 'EQ-00004']);
  });

  it('herkent bestaande apparatuur aan inventarisnummer, serienummer of naam', async () => {
    db.prepare(
      `INSERT INTO equipment_items (id, association_id, name, equipment_type, inventory_number, serial_number)
       VALUES (?, ?, 'Mengtafel', 'audio', 'GEL-01', 'Y-123')`,
    ).run(uuidv4(), vereniging.id);
    const csv = [
      'Naam;Inventarisnummer;Serienummer',
      'Andere naam;gel-01;',
      'Nog een naam;;y-123',
      'mengtafel;;',
      'Mengtafel;;Z-999',
    ].join('\n');

    const antwoord = await stuur(beheerderToken, '/apparatuur/voorbeeld', csv);

    expect(antwoord.body.regels.map((r: { status: string }) => r.status)).toEqual([
      'bestaat',
      'bestaat',
      'bestaat',
      // Een ander serienummer is een ander apparaat, ook met dezelfde naam.
      'nieuw',
    ]);
  });

  it('weigert een inventarisnummer dat twee keer in het bestand staat', async () => {
    const antwoord = await stuur(beheerderToken, '/apparatuur/voorbeeld', 'Naam;Inventarisnummer\nA;X-1\nB;x-1\n');

    expect(antwoord.body.regels[1].status).toBe('fout');
  });

  it('telt de apparatuur van een andere vereniging niet mee als bestaand', async () => {
    const andere = createTestAssociation({ name: 'Andere vereniging' });
    db.prepare(
      "INSERT INTO equipment_items (id, association_id, name, equipment_type, inventory_number) VALUES (?, ?, 'Mengtafel', 'audio', 'GEL-01')",
    ).run(uuidv4(), andere.id);

    const antwoord = await stuur(beheerderToken, '/apparatuur', 'Naam;Inventarisnummer\nMengtafel;GEL-01\n');

    expect(antwoord.body.geimporteerd).toBe(1);
    expect(apparatuur(andere.id)).toHaveLength(1);
  });

  it('laat de materiaalcommissie importeren, de uniformcommissie en een lid niet', async () => {
    const materiaal = createTestUser(vereniging.id, { email: 'materiaal@test.com', role: 'equipment_committee' });
    const uniformcommissie = createTestUser(vereniging.id, {
      email: 'uniform@test.com',
      role: 'uniforms_committee',
    });

    expect((await stuur(generateTestToken(materiaal), '/apparatuur', 'Naam\nMengtafel\n')).status).toBe(201);
    expect((await stuur(generateTestToken(uniformcommissie), '/apparatuur', 'Naam\nKabel\n')).status).toBe(403);
    expect((await stuur(lidToken, '/apparatuur/voorbeeld', 'Naam\nKabel\n')).status).toBe(403);
  });
});
