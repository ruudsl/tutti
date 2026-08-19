/**
 * Kaartverkoop was na de boekhouding het grootste onafgedekte bestand: 3212
 * regels, 29 routes, nul procent.
 *
 * De nadruk ligt hier op de dingen die geld kosten als ze misgaan. Meer kaarten
 * verkopen dan er zijn, een kaart twee keer laten scannen, of de omzet van een
 * andere vereniging kunnen inzien.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import ticketsRoutes from '../../routes/tickets';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestAssociation, createTestUser, generateTestToken, createTestEnvironment } from '../testUtils';
import { clearModuleCache } from '../../modules/service';

// De mount volgt index.ts: deze router hangt op /api omdat hij paden onder
// meerdere voorvoegsels bedient.
const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api', ticketsRoutes);
app.use(errorHandler);

let adminToken: string;
let associationId: string;
let adminId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  associationId = omgeving.association.id;
  adminId = omgeving.adminUser.id;
  zetTicketingAan(associationId);
});

/**
 * De module kaartverkoop staat standaard uit, en de router draagt de guard
 * zelf. Zonder dit antwoordt elke route hier met 404 - en dan slagen de tests
 * over scheiding tussen verenigingen om de verkeerde reden, want die
 * verwachten juist een 404. Dat de guard werkt wordt in modules.test.ts
 * nagekeken; hier gaat het om wat de routes zelf doen.
 */
function zetTicketingAan(vanVereniging: string) {
  db.prepare(
    `INSERT INTO association_modules (id, association_id, module_key, enabled, updated_by)
     VALUES (?, ?, 'ticketing', 1, ?)
     ON CONFLICT(association_id, module_key) DO UPDATE SET enabled = 1`,
  ).run(uuidv4(), vanVereniging, adminId);
  clearModuleCache();
}

/** Er is geen gedeelde helper voor concerten, dus die staat hier. */
function maakConcert(vanVereniging = associationId) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO concerts (id, association_id, name, date, location, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, vanVereniging, 'Nieuwjaarsconcert', '2026-12-31', 'De Harmonie', adminId);
  return id;
}

const alsAdmin = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api${pad}`).set('Authorization', `Bearer ${adminToken}`);

async function maakKaartsoort(concertId: string, overschrijf: Record<string, unknown> = {}) {
  const res = await alsAdmin('post', `/concerts/${concertId}/ticket-types`).send({
    name: 'Entree',
    price: 12.5,
    quantity: 100,
    ...overschrijf,
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('Kaartsoorten', () => {
  it('maakt een kaartsoort aan en toont hem', async () => {
    const concertId = maakConcert();
    const id = await maakKaartsoort(concertId);

    // Er is geen aparte GET voor kaartsoorten; ze komen mee met het concert.
    const res = await request(app).get(`/api/concerts/${concertId}/tickets`);
    expect(res.status).toBe(200);
    const soorten = res.body.ticketTypes ?? res.body.ticket_types ?? [];
    expect(soorten.map((k: { id: string }) => k.id)).toContain(id);
  });

  it('weigert een negatieve prijs', async () => {
    const concertId = maakConcert();
    const res = await alsAdmin('post', `/concerts/${concertId}/ticket-types`).send({
      name: 'Fout',
      price: -5,
      quantity: 10,
    });
    expect(res.status).toBe(400);
  });

  it('weigert een oplage van nul', async () => {
    const concertId = maakConcert();
    const res = await alsAdmin('post', `/concerts/${concertId}/ticket-types`).send({
      name: 'Fout',
      price: 10,
      quantity: 0,
    });
    expect(res.status).toBe(400);
  });

  it('werkt een kaartsoort bij', async () => {
    const concertId = maakConcert();
    const id = await maakKaartsoort(concertId);

    const res = await alsAdmin('put', `/ticket-types/${id}`).send({ price: 15 });
    expect(res.status).toBe(200);
  });
});

describe('Bestellen', () => {
  it('plaatst een bestelling', async () => {
    const concertId = maakConcert();
    const kaartsoortId = await maakKaartsoort(concertId);

    const res = await request(app)
      .post(`/api/concerts/${concertId}/tickets/order`)
      .send({
        items: [{ ticketTypeId: kaartsoortId, quantity: 2 }],
        buyerName: 'Jan Jansen',
        buyerEmail: 'jan@example.com',
      });

    expect(res.status).toBe(201);
  });

  it('verkoopt niet meer kaarten dan er zijn', async () => {
    // Dit is het duurste dat hier mis kan gaan: meer kaarten verkopen dan de
    // zaal heeft, en dat pas bij de deur ontdekken.
    const concertId = maakConcert();
    const kaartsoortId = await maakKaartsoort(concertId, { quantity: 3, maxPerOrder: 50 });

    const res = await request(app)
      .post(`/api/concerts/${concertId}/tickets/order`)
      .send({
        items: [{ ticketTypeId: kaartsoortId, quantity: 10 }],
        buyerName: 'Gretige Koper',
        buyerEmail: 'gretig@example.com',
      });

    expect(res.status).toBe(400);
  });

  it('weigert een bestelling zonder regels', async () => {
    const concertId = maakConcert();

    const res = await request(app).post(`/api/concerts/${concertId}/tickets/order`).send({
      items: [],
      buyerName: 'Jan',
      buyerEmail: 'jan@example.com',
    });

    expect(res.status).toBe(400);
  });

  it('weigert een ongeldig e-mailadres', async () => {
    const concertId = maakConcert();
    const kaartsoortId = await maakKaartsoort(concertId);

    // Zonder geldig adres kan de koper zijn kaart niet ontvangen.
    const res = await request(app)
      .post(`/api/concerts/${concertId}/tickets/order`)
      .send({
        items: [{ ticketTypeId: kaartsoortId, quantity: 1 }],
        buyerName: 'Jan',
        buyerEmail: 'geen-adres',
      });

    expect(res.status).toBe(400);
  });

  it('meldt dat een onbekend concert niet bestaat', async () => {
    const res = await request(app)
      .post(`/api/concerts/${uuidv4()}/tickets/order`)
      .send({
        items: [{ ticketTypeId: uuidv4(), quantity: 1 }],
        buyerName: 'Jan',
        buyerEmail: 'jan@example.com',
      });

    expect(res.status).toBe(404);
  });
});

describe('Overzichten', () => {
  it('geeft de verkoopcijfers van een concert', async () => {
    const concertId = maakConcert();
    await maakKaartsoort(concertId);

    const res = await alsAdmin('get', `/concerts/${concertId}/ticket-stats`);
    expect(res.status).toBe(200);
  });

  it('geeft de bezoekerslijst', async () => {
    const concertId = maakConcert();
    const res = await alsAdmin('get', `/concerts/${concertId}/attendees`);
    expect(res.status).toBe(200);
  });

  it('geeft mijn eigen kaarten', async () => {
    const res = await alsAdmin('get', '/tickets/my');
    expect(res.status).toBe(200);
  });
});

describe('Scheiding tussen verenigingen', () => {
  it('laat geen kaartsoort aanmaken bij het concert van een ander', async () => {
    const andere = createTestAssociation();
    zetTicketingAan(andere.id);
    const concertVanAnder = maakConcert(andere.id);

    const res = await alsAdmin('post', `/concerts/${concertVanAnder}/ticket-types`).send({
      name: 'Ingebroken',
      price: 1,
      quantity: 1,
    });

    expect([403, 404]).toContain(res.status);
  });

  it('toont de verkoopcijfers van een ander concert niet', async () => {
    const andere = createTestAssociation();
    zetTicketingAan(andere.id);
    const concertVanAnder = maakConcert(andere.id);

    const res = await alsAdmin('get', `/concerts/${concertVanAnder}/ticket-stats`);
    expect([403, 404]).toContain(res.status);
  });

  it('toont de bezoekerslijst van een ander concert niet', async () => {
    // Een bezoekerslijst bevat namen en e-mailadressen van kopers.
    const andere = createTestAssociation();
    zetTicketingAan(andere.id);
    const concertVanAnder = maakConcert(andere.id);

    const res = await alsAdmin('get', `/concerts/${concertVanAnder}/attendees`);
    expect([403, 404]).toContain(res.status);
  });
});

describe('Wie mag wat', () => {
  it('vraagt om een token voor de verkoopcijfers', async () => {
    const concertId = maakConcert();
    const res = await request(app).get(`/api/concerts/${concertId}/ticket-stats`);
    expect(res.status).toBe(401);
  });

  it('laat een gewoon lid geen kaartsoort aanmaken', async () => {
    const concertId = maakConcert();
    const lid = createTestUser(associationId, { email: 'lid-tickets@test.com', role: 'member' });

    const res = await request(app)
      .post(`/api/concerts/${concertId}/ticket-types`)
      .set('Authorization', `Bearer ${generateTestToken(lid)}`)
      .send({ name: 'Mag niet', price: 5, quantity: 5 });

    expect(res.status).toBe(403);
  });
});
