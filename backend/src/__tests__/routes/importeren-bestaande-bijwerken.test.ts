/**
 * Bestaande gegevens bijwerken vanuit een spreadsheet (WP11): de optie
 * `bijwerken` van routes/importeren.ts, met `bepaalWijzigingen` en `werkBij`
 * uit services/importeren/gemeenschappelijk.ts.
 *
 * Wat hier vastligt:
 * - zonder de optie blijft een bestaande rij zoals hij is, ook als het bestand
 *   iets anders zegt;
 * - het voorbeeld toont per veld oud en nieuw en verandert niets;
 * - een lege cel wist niets, en een waarde die niet te lezen was laat het oude
 *   staan;
 * - wat de sleutel is (serienummer, e-mailadres, titel met arrangeur) en wat
 *   bewust buiten schot blijft: de rol van een lid, en een lid dat ook bij een
 *   andere vereniging hoort;
 * - een rij van een andere vereniging wordt nooit bijgewerkt.
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
import { createTestAssociation, createTestEnvironment, createTestUser, TestAssociation, TestUser } from '../testUtils';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/import/instrumenten', optionalAuth, requireModule('inventory'));
app.use('/api/import/apparatuur', optionalAuth, requireModule('inventory'));
app.use('/api/import/contacten', optionalAuth, requireModule('contacts'));
app.use('/api/import', importerenRoutes);
app.use(errorHandler);

let vereniging: TestAssociation;
let beheerder: TestUser;
let lid: TestUser;
let token: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  vereniging = omgeving.association;
  beheerder = omgeving.adminUser;
  lid = omgeving.memberUser;
  token = omgeving.adminToken;
  setModuleEnabled(vereniging.id, 'inventory', true, beheerder.id);
  setModuleEnabled(vereniging.id, 'contacts', true, beheerder.id);
});

const stuur = (pad: string, csv: string, bijwerken?: boolean) =>
  request(app)
    .post(`/api/import${pad}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ csv, ...(bijwerken !== undefined && { bijwerken }) });

function instrument(associationId: string, velden: Record<string, unknown> = {}): string {
  const id = uuidv4();
  const rij = {
    name: 'Trompet 1',
    instrument_type: 'Trompet',
    category: 'brass',
    brand: 'Yamaha',
    serial_number: 'YTR-123',
    status: 'available',
    condition: 'good',
    location: 'Kast 1',
    ...velden,
  };
  db.prepare(
    `INSERT INTO instrument_assets (id, association_id, name, instrument_type, category, brand, serial_number, status, condition, location)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    associationId,
    rij.name,
    rij.instrument_type,
    rij.category,
    rij.brand,
    rij.serial_number,
    rij.status,
    rij.condition,
    rij.location,
  );
  return id;
}

const instrumentRij = (id: string) =>
  db.prepare('SELECT * FROM instrument_assets WHERE id = ?').get(id) as Record<string, unknown>;

describe('bestaande instrumenten bijwerken', () => {
  const CSV = ['Naam;Soort;Serienummer;Merk;Status;Locatie', 'Trompet 1;Trompet;ytr-123;Bach;uitgeleend;Kast 2'].join(
    '\n',
  );

  it('laat een bestaand instrument staan zonder de optie', async () => {
    const id = instrument(vereniging.id);

    const antwoord = await stuur('/instrumenten', CSV);

    expect(antwoord.body.regels[0].status).toBe('bestaat');
    expect(antwoord.body.bijgewerkt).toBe(0);
    expect(instrumentRij(id)).toMatchObject({ brand: 'Yamaha', location: 'Kast 1' });
  });

  it('toont in het voorbeeld per veld oud en nieuw, zonder iets te veranderen', async () => {
    const id = instrument(vereniging.id);

    const antwoord = await stuur('/instrumenten/voorbeeld', CSV, true);

    expect(antwoord.body.tellingen).toEqual({ nieuw: 0, bestaat: 0, bijwerken: 1, fout: 0 });
    expect(antwoord.body.regels[0]).toMatchObject({
      status: 'bijwerken',
      wijzigingen: [
        { veld: 'merk', oud: 'Yamaha', nieuw: 'Bach' },
        { veld: 'status', oud: 'available', nieuw: 'on_loan' },
        { veld: 'locatie', oud: 'Kast 1', nieuw: 'Kast 2' },
      ],
    });
    expect(instrumentRij(id)).toMatchObject({ brand: 'Yamaha', status: 'available' });
  });

  it('werkt bij wat anders is, en laat lege en onleesbare cellen het oude houden', async () => {
    const id = instrument(vereniging.id);
    const csv = [
      'Naam;Soort;Serienummer;Merk;Status;Staat;Locatie;Aankoopprijs',
      // Merk leeg, staat onbekend, prijs onleesbaar: die blijven zoals ze zijn.
      'Trompet één;Trompet;YTR-123;;in reparatie;wankel;;veel',
    ].join('\n');

    const antwoord = await stuur('/instrumenten', csv, true);

    expect(antwoord.status).toBe(200);
    expect(antwoord.body).toMatchObject({ geimporteerd: 0, bijgewerkt: 1 });
    expect(instrumentRij(id)).toMatchObject({
      // Het serienummer is de sleutel, dus de naam mag veranderen.
      name: 'Trompet één',
      brand: 'Yamaha',
      status: 'in_repair',
      condition: 'good',
      location: 'Kast 1',
      purchase_price: null,
    });
  });

  it('meldt "bestaat" als er niets anders is', async () => {
    instrument(vereniging.id, { brand: 'Bach', status: 'on_loan', location: 'Kast 2' });

    const antwoord = await stuur('/instrumenten/voorbeeld', CSV, true);

    expect(antwoord.body.regels[0].status).toBe('bestaat');
    expect(antwoord.body.regels[0]).not.toHaveProperty('wijzigingen');
  });

  it('werkt nooit een instrument van een andere vereniging bij', async () => {
    const andere = createTestAssociation({ name: 'Andere vereniging' });
    const vreemd = instrument(andere.id);

    const antwoord = await stuur('/instrumenten', CSV, true);

    expect(antwoord.body).toMatchObject({ geimporteerd: 1, bijgewerkt: 0 });
    expect(instrumentRij(vreemd)).toMatchObject({ brand: 'Yamaha', location: 'Kast 1' });
  });
});

describe('bestaande leden bijwerken', () => {
  it('werkt naam en privé-e-mail bij, de rol niet', async () => {
    const csv = [
      'Voornaam;Tussenvoegsel;Achternaam;E-mail;Rol;Privé-e-mail',
      `Johanna;van;Dijk;${lid.email.toUpperCase()};beheerder;johanna@thuis.nl`,
    ].join('\n');

    const antwoord = await stuur('/leden', csv, true);

    expect(antwoord.body.bijgewerkt).toBe(1);
    expect(antwoord.body.regels[0].wijzigingen.map((w: { veld: string }) => w.veld)).toEqual([
      'voornaam',
      'achternaam',
      'priveEmail',
    ]);
    const rij = db.prepare('SELECT * FROM users WHERE id = ?').get(lid.id) as Record<string, unknown>;
    expect(rij).toMatchObject({
      first_name: 'Johanna',
      last_name: 'van Dijk',
      private_email: 'johanna@thuis.nl',
      role: 'member',
    });
  });

  it('werkt een lid dat ook bij een andere vereniging hoort niet bij', async () => {
    const andere = createTestAssociation({ name: 'Andere vereniging' });
    const gedeeld = createTestUser(andere.id, { email: 'gedeeld@test.com', firstName: 'Piet' });
    db.prepare('INSERT INTO user_associations (user_id, association_id, role) VALUES (?, ?, ?)').run(
      gedeeld.id,
      vereniging.id,
      'member',
    );

    const antwoord = await stuur('/leden', 'Voornaam;Achternaam;E-mail\nKlaas;Jansen;gedeeld@test.com\n', true);

    expect(antwoord.body.regels[0].status).toBe('bestaat');
    expect(antwoord.body.regels[0].waarschuwingen[0]).toContain('andere vereniging');
    expect(db.prepare('SELECT first_name FROM users WHERE id = ?').get(gedeeld.id)).toEqual({ first_name: 'Piet' });
  });
});

describe('overige soorten bijwerken', () => {
  it('werkt componist, duur en graad van een titel bij; titel en arrangeur zijn de sleutel', async () => {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO music_titles (id, title, composer, arranger, duration_seconds, grade, association_id)
       VALUES (?, 'Bolero', NULL, 'Jan de Haan', 0, NULL, ?)`,
    ).run(id, vereniging.id);

    const antwoord = await stuur(
      '/muziektitels',
      'Titel;Arrangeur;Componist;Duur;Graad\nBolero;Jan de Haan;Maurice Ravel;15:30;4\n',
      true,
    );

    expect(antwoord.body.bijgewerkt).toBe(1);
    expect(db.prepare('SELECT composer, duration_seconds, grade FROM music_titles WHERE id = ?').get(id)).toEqual({
      composer: 'Maurice Ravel',
      duration_seconds: 930,
      grade: '4',
    });
  });

  it('werkt een contact bij op naam', async () => {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO contacts (id, association_id, contact_type, name, phone, city, created_by)
       VALUES (?, ?, 'vendor', 'Muziekhandel De Toon', '030-1111111', 'Utrecht', ?)`,
    ).run(id, vereniging.id, beheerder.id);

    const antwoord = await stuur(
      '/contacten',
      'Naam;Telefoon;Plaats;E-mail\nmuziekhandel de toon;030-2222222;;geen-adres\n',
      true,
    );

    expect(antwoord.body.regels[0].wijzigingen).toEqual([
      { veld: 'telefoon', oud: '030-1111111', nieuw: '030-2222222' },
    ]);
    expect(db.prepare('SELECT phone, city, email FROM contacts WHERE id = ?').get(id)).toEqual({
      phone: '030-2222222',
      city: 'Utrecht',
      email: null,
    });
  });

  it('rekent bij apparatuur het volgende onderhoud opnieuw uit', async () => {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO equipment_items (id, association_id, name, equipment_type, inventory_number, is_loanable,
         last_maintenance, maintenance_interval_months, next_maintenance)
       VALUES (?, ?, 'Mengtafel', 'audio', 'GEL-01', 1, '2024-01-15', 12, '2025-01-15')`,
    ).run(id, vereniging.id);

    const antwoord = await stuur(
      '/apparatuur',
      'Naam;Inventarisnummer;Laatste onderhoud;Uitleenbaar\nMengpaneel;gel-01;01-03-2025;nee\n',
      true,
    );

    expect(antwoord.body.regels[0].wijzigingen).toEqual([
      { veld: 'naam', oud: 'Mengtafel', nieuw: 'Mengpaneel' },
      { veld: 'laatsteOnderhoud', oud: '2024-01-15', nieuw: '2025-03-01' },
      { veld: 'uitleenbaar', oud: true, nieuw: false },
      { veld: 'volgendOnderhoud', oud: '2025-01-15', nieuw: '2026-03-01' },
    ]);
    expect(
      db
        .prepare('SELECT name, last_maintenance, next_maintenance, is_loanable FROM equipment_items WHERE id = ?')
        .get(id),
    ).toEqual({ name: 'Mengpaneel', last_maintenance: '2025-03-01', next_maintenance: '2026-03-01', is_loanable: 0 });
  });
});
