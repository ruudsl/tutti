/**
 * De beheerkant van de kaartverkoop: overzichten, kaartsoorten bijwerken,
 * kaarten intrekken, en de twee ingangen waarlangs een bestelling op 'betaald'
 * komt te staan zonder dat er een echte betaaldienst aan te pas komt.
 *
 * tickets.test.ts dekt het bestellen en het scannen af. Wat daar niet in zat is
 * alles achter een rol: /tickets/sales, /tickets/dashboard, de heatmap, de
 * voorspellingen, PUT en DELETE op een kaartsoort, en het intrekken van een
 * kaart. Bij elk van die routes gaat het hier om twee dingen: mag de aanroeper
 * dit, en blijft de vereniging van een ander buiten beeld.
 *
 * De CSV-uitvoer van /concerts/:id/attendees en /tickets/sales/export blijft
 * hier buiten beeld; die loopt via utils/csv.ts en is daar getest.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import ticketsRoutes from '../../routes/tickets';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestAssociation, createTestUser, generateTestToken, createTestEnvironment } from '../testUtils';
import { clearModuleCache } from '../../modules/service';

// De bestelroutes dragen een limiet van vijf bestellingen per minuut per IP.
// Alle verzoeken hier komen van hetzelfde adres; zie tickets.test.ts.
vi.mock('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const app = express();
app.use(express.json());
app.use('/api', ticketsRoutes);
app.use(errorHandler);

let adminToken: string;
let memberToken: string;
let commissieToken: string;
let associationId: string;
let adminId: string;
let concertId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  memberToken = omgeving.memberToken;
  commissieToken = omgeving.musicCommitteeToken;
  associationId = omgeving.association.id;
  adminId = omgeving.adminUser.id;
  zetTicketingAan(associationId);
  concertId = maakConcert();
});

/** Zie tickets.test.ts: zonder dit antwoordt elke route met 404. */
function zetTicketingAan(vanVereniging: string) {
  db.prepare(
    `INSERT INTO association_modules (id, association_id, module_key, enabled, updated_by)
     VALUES (?, ?, 'ticketing', 1, ?)
     ON CONFLICT(association_id, module_key) DO UPDATE SET enabled = 1`,
  ).run(uuidv4(), vanVereniging, adminId);
  clearModuleCache();
}

function datumOverEenJaar() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function maakConcert(vanVereniging = associationId, datum = datumOverEenJaar()) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO concerts (id, association_id, name, date, location, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, vanVereniging, 'Nieuwjaarsconcert', datum, 'De Harmonie', adminId);
  return id;
}

function maakKaartsoort(
  vanConcert = concertId,
  overschrijf: { quantity?: number; sold?: number; price?: number } = {},
) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO ticket_types (id, concert_id, name, price, quantity, sold, max_per_order)
     VALUES (?, ?, 'Entree', ?, ?, ?, 10)`,
  ).run(id, vanConcert, overschrijf.price ?? 12.5, overschrijf.quantity ?? 100, overschrijf.sold ?? 0);
  return id;
}

function maakBestelling(
  vanConcert = concertId,
  overschrijf: { status?: string; total?: number; paymentId?: string | null; paidAt?: boolean } = {},
) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO ticket_orders (id, concert_id, total, status, payment_id, payment_method, buyer_name, buyer_email, paid_at)
     VALUES (?, ?, ?, ?, ?, 'ideal', 'Jan Jansen', 'jan@example.com', ?)`,
  ).run(
    id,
    vanConcert,
    overschrijf.total ?? 25,
    overschrijf.status ?? 'paid',
    overschrijf.paymentId === undefined ? `tr_${id.slice(0, 8)}` : overschrijf.paymentId,
    overschrijf.paidAt === false ? null : new Date().toISOString(),
  );
  return id;
}

function maakKaart(kaartsoortId: string, orderId: string, status = 'valid') {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO tickets (id, ticket_type_id, order_id, buyer_name, buyer_email, status, qr_code)
     VALUES (?, ?, ?, 'Jan Jansen', 'jan@example.com', ?, ?)`,
  ).run(id, kaartsoortId, orderId, status, `KAART-${uuidv4().slice(0, 12)}`);
  return id;
}

function verkocht(kaartsoortId: string) {
  return (db.prepare('SELECT sold FROM ticket_types WHERE id = ?').get(kaartsoortId) as { sold: number }).sold;
}

function bestelstatus(orderId: string) {
  return (db.prepare('SELECT status FROM ticket_orders WHERE id = ?').get(orderId) as { status: string }).status;
}

const als = (token: string, methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
  request(app)[methode](`/api${pad}`).set('Authorization', `Bearer ${token}`);
const alsAdmin = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) => als(adminToken, methode, pad);

/** Een tweede vereniging met een eigen beheerder en een eigen concert. */
function andereVereniging() {
  const vereniging = createTestAssociation();
  const beheerder = createTestUser(vereniging.id, { email: `admin-${uuidv4()}@elders.test`, role: 'admin' });
  zetTicketingAan(vereniging.id);
  const concert = maakConcert(vereniging.id);
  return { verenigingId: vereniging.id, token: generateTestToken(beheerder), concertId: concert };
}

describe('Verkoopoverzicht', () => {
  it('toont alleen bestellingen van de eigen vereniging', async () => {
    maakBestelling();
    const elders = andereVereniging();
    maakBestelling(elders.concertId);

    const res = await alsAdmin('get', '/tickets/sales');
    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].concertId).toBe(concertId);
    expect(res.body.summary.totalOrders).toBe(1);
  });

  it('telt de omzet van een ander concert niet mee in het totaal', async () => {
    maakBestelling(concertId, { total: 100 });
    const elders = andereVereniging();
    maakBestelling(elders.concertId, { total: 999 });

    const res = await alsAdmin('get', '/tickets/sales');
    expect(res.body.summary.totalRevenue).toBe(100);
  });

  it('stuurt de regels van de bestelling mee', async () => {
    const kaartsoortId = maakKaartsoort();
    const orderId = maakBestelling();
    db.prepare(
      `INSERT INTO ticket_order_items (id, order_id, ticket_type_id, quantity, unit_price)
       VALUES (?, ?, ?, 2, 12.5)`,
    ).run(uuidv4(), orderId, kaartsoortId);

    const res = await alsAdmin('get', '/tickets/sales');
    expect(res.body.orders[0].items).toEqual([
      { ticketTypeId: kaartsoortId, name: 'Entree', quantity: 2, unitPrice: 12.5 },
    ]);
  });

  it('filtert op status', async () => {
    maakBestelling(concertId, { status: 'paid' });
    maakBestelling(concertId, { status: 'pending', paidAt: false });

    const res = await alsAdmin('get', '/tickets/sales?status=pending');
    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].status).toBe('pending');
  });

  it('filtert op concert', async () => {
    const tweede = maakConcert();
    maakBestelling(concertId);
    maakBestelling(tweede);

    const res = await alsAdmin('get', `/tickets/sales?concertId=${tweede}`);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].concertId).toBe(tweede);
  });

  it('laat de paginagrootte niet boven de honderd uitkomen', async () => {
    const res = await alsAdmin('get', '/tickets/sales?limit=5000');
    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(100);
  });

  /**
   * BEWIJS. Op de code van voor de reparatie geeft deze test 500 in plaats van
   * 200. Nagegaan met `git checkout HEAD -- src/routes/tickets.ts`, deze test
   * gedraaid, en het eigen bestand daarna weer teruggezet:
   *
   *   FAIL ... valt niet om over een rommelig paginanummer
   *   AssertionError: expected 500 to be 200
   *
   * `parseInt('abc', 10)` is NaN, en Math.max en Math.min laten die NaN
   * ongemoeid. NaN kwam zo als LIMIT en OFFSET in de query terecht. De
   * standaardwaarden `page = '1'` en `limit = '50'` in de destructurering
   * vangen alleen een ontbrekende parameter op, niet een parameter die er wel
   * staat maar geen getal bevat.
   */
  it('valt niet om over een rommelig paginanummer', async () => {
    maakBestelling();
    const res = await alsAdmin('get', '/tickets/sales?page=abc&limit=xyz');
    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 50 });
    expect(res.body.orders).toHaveLength(1);
  });

  it('valt terug op de eerste pagina bij een paginanummer onder een', async () => {
    maakBestelling();
    const res = await alsAdmin('get', '/tickets/sales?page=-3');
    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.orders).toHaveLength(1);
  });

  it('bladert door naar de tweede pagina', async () => {
    maakBestelling();
    maakBestelling();
    const res = await alsAdmin('get', '/tickets/sales?page=2&limit=1');
    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.pagination.totalPages).toBe(2);
  });

  it('laat een gewoon lid er niet bij', async () => {
    const res = await als(memberToken, 'get', '/tickets/sales');
    expect(res.status).toBe(403);
  });

  it('vraagt om een token', async () => {
    const res = await request(app).get('/api/tickets/sales');
    expect(res.status).toBe(401);
  });
});

describe('Dashboard van een concert', () => {
  it('geeft omzet en oplage van het eigen concert', async () => {
    const kaartsoortId = maakKaartsoort(concertId, { quantity: 50, sold: 4, price: 10 });
    const orderId = maakBestelling(concertId, { total: 40 });
    maakKaart(kaartsoortId, orderId);

    const res = await alsAdmin('get', `/tickets/dashboard/${concertId}`);
    expect(res.status).toBe(200);
    expect(res.body.totalCapacity).toBe(50);
    expect(res.body.totalTicketsSold).toBe(4);
    expect(res.body.revenueAllTime).toBe(40);
    expect(res.body.ticketTypes[0].available).toBe(46);
    expect(res.body.recentOrders).toHaveLength(1);
  });

  it('telt de vrijkaarten van de gastenlijst apart mee', async () => {
    db.prepare(
      `INSERT INTO guest_list (id, concert_id, name, email, ticket_count, tickets_sent, created_by)
       VALUES (?, ?, 'Wethouder', 'wethouder@gemeente.test', 3, 1, ?)`,
    ).run(uuidv4(), concertId, adminId);

    const res = await alsAdmin('get', `/tickets/dashboard/${concertId}`);
    expect(res.body.guestListTickets).toBe(3);
  });

  it('toont het dashboard van een andere vereniging niet', async () => {
    const elders = andereVereniging();
    const res = await alsAdmin('get', `/tickets/dashboard/${elders.concertId}`);
    expect(res.status).toBe(404);
  });

  it('laat een gewoon lid er niet bij', async () => {
    const res = await als(memberToken, 'get', `/tickets/dashboard/${concertId}`);
    expect(res.status).toBe(403);
  });
});

describe('Kaartsoort bijwerken', () => {
  it('werkt de eigen kaartsoort bij', async () => {
    const kaartsoortId = maakKaartsoort();
    const res = await alsAdmin('put', `/ticket-types/${kaartsoortId}`).send({ name: 'Vroegboek', price: 9 });
    expect(res.status).toBe(200);

    const rij = db.prepare('SELECT name, price FROM ticket_types WHERE id = ?').get(kaartsoortId) as {
      name: string;
      price: number;
    };
    expect(rij).toEqual({ name: 'Vroegboek', price: 9 });
  });

  it('verlaagt de oplage niet tot onder wat al verkocht is', async () => {
    const kaartsoortId = maakKaartsoort(concertId, { quantity: 100, sold: 30 });
    const res = await alsAdmin('put', `/ticket-types/${kaartsoortId}`).send({ quantity: 20 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('30');
    // De oplage hoort onaangeroerd te zijn gebleven.
    expect(
      (db.prepare('SELECT quantity FROM ticket_types WHERE id = ?').get(kaartsoortId) as { quantity: number }).quantity,
    ).toBe(100);
  });

  it('laat de oplage precies gelijk aan het verkochte aantal wel toe', async () => {
    const kaartsoortId = maakKaartsoort(concertId, { quantity: 100, sold: 30 });
    const res = await alsAdmin('put', `/ticket-types/${kaartsoortId}`).send({ quantity: 30 });
    expect(res.status).toBe(200);
  });

  it('werkt alle velden in een keer bij', async () => {
    const kaartsoortId = maakKaartsoort();
    const res = await alsAdmin('put', `/ticket-types/${kaartsoortId}`).send({
      name: 'Vroegboek',
      price: 9,
      quantity: 80,
      description: 'Alleen in de voorverkoop',
      saleStart: '2026-01-01T00:00:00.000Z',
      saleEnd: '2026-12-31T00:00:00.000Z',
      maxPerOrder: 4,
      serviceFee: 1.5,
      showServiceFeeSeparate: true,
    });
    expect(res.status).toBe(200);

    const rij = db
      .prepare(
        `SELECT name, price, quantity, description, sale_start, sale_end, max_per_order, service_fee,
                show_service_fee_separate
         FROM ticket_types WHERE id = ?`,
      )
      .get(kaartsoortId) as Record<string, unknown>;
    expect(rij).toEqual({
      name: 'Vroegboek',
      price: 9,
      quantity: 80,
      description: 'Alleen in de voorverkoop',
      sale_start: '2026-01-01T00:00:00.000Z',
      sale_end: '2026-12-31T00:00:00.000Z',
      max_per_order: 4,
      service_fee: 1.5,
      show_service_fee_separate: 1,
    });
  });

  it('meldt een leeg wijzigingsverzoek in plaats van er stil mee in te stemmen', async () => {
    const kaartsoortId = maakKaartsoort();
    const res = await alsAdmin('put', `/ticket-types/${kaartsoortId}`).send({});
    expect(res.status).toBe(400);
  });

  it('weigert een negatieve prijs', async () => {
    const kaartsoortId = maakKaartsoort();
    const res = await alsAdmin('put', `/ticket-types/${kaartsoortId}`).send({ price: -1 });
    expect(res.status).toBe(400);
  });

  it('werkt de kaartsoort van een andere vereniging niet bij', async () => {
    const elders = andereVereniging();
    const kaartsoortElders = maakKaartsoort(elders.concertId, { price: 12.5 });

    const res = await alsAdmin('put', `/ticket-types/${kaartsoortElders}`).send({ price: 1 });
    expect(res.status).toBe(404);
    expect(
      (db.prepare('SELECT price FROM ticket_types WHERE id = ?').get(kaartsoortElders) as { price: number }).price,
    ).toBe(12.5);
  });
});

describe('Kaartsoort verwijderen', () => {
  it('verwijdert een kaartsoort waar nog niets van verkocht is', async () => {
    const kaartsoortId = maakKaartsoort();
    const res = await alsAdmin('delete', `/ticket-types/${kaartsoortId}`);
    expect(res.status).toBe(200);
    expect(db.prepare('SELECT id FROM ticket_types WHERE id = ?').get(kaartsoortId)).toBeUndefined();
  });

  it('verwijdert geen kaartsoort waar al kaarten van verkocht zijn', async () => {
    const kaartsoortId = maakKaartsoort(concertId, { sold: 1 });
    const res = await alsAdmin('delete', `/ticket-types/${kaartsoortId}`);
    expect(res.status).toBe(400);
    expect(db.prepare('SELECT id FROM ticket_types WHERE id = ?').get(kaartsoortId)).toBeDefined();
  });

  it('verwijdert de kaartsoort van een andere vereniging niet', async () => {
    const elders = andereVereniging();
    const kaartsoortElders = maakKaartsoort(elders.concertId);

    const res = await alsAdmin('delete', `/ticket-types/${kaartsoortElders}`);
    expect(res.status).toBe(404);
    expect(db.prepare('SELECT id FROM ticket_types WHERE id = ?').get(kaartsoortElders)).toBeDefined();
  });

  it('laat een gewoon lid niets verwijderen', async () => {
    const kaartsoortId = maakKaartsoort();
    const res = await als(memberToken, 'delete', `/ticket-types/${kaartsoortId}`);
    expect(res.status).toBe(403);
  });
});

describe('Kaart intrekken', () => {
  it('trekt de kaart in en geeft de plaats terug aan de voorraad', async () => {
    const kaartsoortId = maakKaartsoort(concertId, { quantity: 100, sold: 1 });
    const orderId = maakBestelling();
    const kaartId = maakKaart(kaartsoortId, orderId);

    const res = await alsAdmin('post', `/tickets/${kaartId}/cancel`);
    expect(res.status).toBe(200);
    expect((db.prepare('SELECT status FROM tickets WHERE id = ?').get(kaartId) as { status: string }).status).toBe(
      'cancelled',
    );
    expect(verkocht(kaartsoortId)).toBe(0);
  });

  it('trekt dezelfde kaart geen tweede keer in, zodat de zaal niet ruimer lijkt dan hij is', async () => {
    const kaartsoortId = maakKaartsoort(concertId, { quantity: 100, sold: 2 });
    const orderId = maakBestelling();
    const kaartId = maakKaart(kaartsoortId, orderId);

    expect((await alsAdmin('post', `/tickets/${kaartId}/cancel`)).status).toBe(200);
    const tweede = await alsAdmin('post', `/tickets/${kaartId}/cancel`);
    expect(tweede.status).toBe(400);
    expect(verkocht(kaartsoortId)).toBe(1);
  });

  it('trekt een kaart die al gescand is niet meer in', async () => {
    const kaartsoortId = maakKaartsoort(concertId, { sold: 1 });
    const orderId = maakBestelling();
    const kaartId = maakKaart(kaartsoortId, orderId, 'used');

    const res = await alsAdmin('post', `/tickets/${kaartId}/cancel`);
    expect(res.status).toBe(400);
    expect(verkocht(kaartsoortId)).toBe(1);
  });

  it('trekt de kaart van een andere vereniging niet in', async () => {
    const elders = andereVereniging();
    const kaartsoortElders = maakKaartsoort(elders.concertId, { sold: 1 });
    const orderElders = maakBestelling(elders.concertId);
    const kaartElders = maakKaart(kaartsoortElders, orderElders);

    const res = await alsAdmin('post', `/tickets/${kaartElders}/cancel`);
    expect(res.status).toBe(404);
    expect((db.prepare('SELECT status FROM tickets WHERE id = ?').get(kaartElders) as { status: string }).status).toBe(
      'valid',
    );
  });
});

/**
 * De kaartcode is het bewijs: wie hem heeft mag de kaart zien, ook zonder in te
 * loggen - de koper krijgt hem per e-mail en heeft vaak geen account. Daarmee
 * is de code zelf het geheim, en hoort er niet meer in het antwoord te staan
 * dan nodig is om de kaart aan de deur te tonen.
 */
describe('Een kaart opvragen met de code', () => {
  it('toont de kaart aan iedereen die de code heeft', async () => {
    const kaartsoortId = maakKaartsoort();
    const orderId = maakBestelling();
    const kaartId = maakKaart(kaartsoortId, orderId);
    const code = (db.prepare('SELECT qr_code FROM tickets WHERE id = ?').get(kaartId) as { qr_code: string }).qr_code;

    const res = await request(app).get(`/api/tickets/${code}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(kaartId);
    expect(res.body.concert.id).toBe(concertId);
    expect(res.body.qrCodeDataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('geeft het e-mailadres van de koper niet mee', async () => {
    const kaartsoortId = maakKaartsoort();
    const kaartId = maakKaart(kaartsoortId, maakBestelling());
    const code = (db.prepare('SELECT qr_code FROM tickets WHERE id = ?').get(kaartId) as { qr_code: string }).qr_code;

    const res = await request(app).get(`/api/tickets/${code}`);
    expect(JSON.stringify(res.body)).not.toContain('jan@example.com');
  });

  it('meldt een code die niet bestaat', async () => {
    const res = await request(app).get('/api/tickets/KAART-BESTAATNIET');
    expect(res.status).toBe(404);
  });
});

describe('Bezoekerslijst en heatmap', () => {
  it('geeft de bezoekerslijst van betaalde bestellingen', async () => {
    const kaartsoortId = maakKaartsoort();
    const betaald = maakBestelling(concertId, { status: 'paid' });
    const open = maakBestelling(concertId, { status: 'pending', paidAt: false });
    maakKaart(kaartsoortId, betaald);
    maakKaart(kaartsoortId, open);

    const res = await alsAdmin('get', `/concerts/${concertId}/attendees`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('geeft de bezoekerslijst van een andere vereniging niet', async () => {
    const elders = andereVereniging();
    const res = await alsAdmin('get', `/concerts/${elders.concertId}/attendees`);
    expect(res.status).toBe(404);
  });

  it('geeft heatmapgegevens met een plaats per verkochte en per onverkochte kaart', async () => {
    const kaartsoortId = maakKaartsoort(concertId, { quantity: 4, sold: 1 });
    const orderId = maakBestelling();
    maakKaart(kaartsoortId, orderId);

    const res = await alsAdmin('get', `/concerts/${concertId}/seats/heatmap-data`);
    expect(res.status).toBe(200);
    expect(res.body.totalCapacity).toBe(4);
    expect(res.body.totalSold).toBe(1);
    expect(res.body.seats).toHaveLength(4);
    expect(res.body.seats.filter((s: { status: string }) => s.status === 'sold')).toHaveLength(1);
    expect(res.body.sections[0].revenue).toBe(12.5);
  });

  it('geeft de heatmap van een andere vereniging niet', async () => {
    const elders = andereVereniging();
    const res = await alsAdmin('get', `/concerts/${elders.concertId}/seats/heatmap-data`);
    expect(res.status).toBe(404);
  });
});

describe('Verkoopvoorspelling', () => {
  it('is alleen voor een beheerder, niet voor de muziekcommissie', async () => {
    const res = await als(commissieToken, 'get', `/concerts/${concertId}/tickets/predictions`);
    expect(res.status).toBe(403);
  });

  it('geeft de voorspelling van het eigen concert', async () => {
    maakKaartsoort();
    const res = await alsAdmin('get', `/concerts/${concertId}/tickets/predictions`);
    expect(res.status).toBe(200);
    expect(res.body.concert.id).toBe(concertId);
  });

  it('geeft de voorspelling van een andere vereniging niet', async () => {
    const elders = andereVereniging();
    const res = await alsAdmin('get', `/concerts/${elders.concertId}/tickets/predictions`);
    expect(res.status).toBe(404);
  });
});

describe('Betaalgegevens bij een bestelling', () => {
  it('geeft niets terug als er nooit een betaling is gestart', async () => {
    const orderId = maakBestelling(concertId, { status: 'pending', paymentId: null, paidAt: false });
    const res = await alsAdmin('get', `/tickets/sales/${orderId}/payment-details`);
    expect(res.status).toBe(200);
    expect(res.body.paymentId).toBeNull();
    expect(res.body.details).toBeNull();
  });

  it('geeft de betaalgegevens van een andere vereniging niet', async () => {
    const elders = andereVereniging();
    const orderElders = maakBestelling(elders.concertId);
    const res = await alsAdmin('get', `/tickets/sales/${orderElders}/payment-details`);
    expect(res.status).toBe(404);
  });

  it('laat een gewoon lid er niet bij', async () => {
    const orderId = maakBestelling();
    const res = await als(memberToken, 'get', `/tickets/sales/${orderId}/payment-details`);
    expect(res.status).toBe(403);
  });
});

/**
 * Hier zit de scheiding tussen de nepbetaaldienst en een echte. Zonder
 * MOLLIE_API_KEY en STRIPE_SECRET_KEY - de stand in deze testomgeving, en de
 * stand van een deploy waar iemand de sleutel vergat - is er geen provider.
 * Twee ingangen zetten een bestelling dan op 'betaald' zonder dat er een cent
 * beweegt: de webhook en het mock-payment-eindpunt. Allebei horen ze in
 * productie dicht te zitten.
 *
 * services/payments.ts is aan die kant al dichtgezet en in betalingen.test.ts
 * nagelopen. Wat hier wordt nagekeken is de kant van de routes zelf, want die
 * dragen hun eigen productiecontrole.
 */
describe('Nepbetalingen', () => {
  const oorspronkelijkeOmgeving = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = oorspronkelijkeOmgeving;
  });

  it('zet de bestelling op betaald en maakt de kaarten aan via de webhook', async () => {
    const kaartsoortId = maakKaartsoort(concertId, { quantity: 100, sold: 2 });
    const orderId = maakBestelling(concertId, { status: 'pending', paidAt: false });
    db.prepare(
      `INSERT INTO ticket_order_items (id, order_id, ticket_type_id, quantity, unit_price)
       VALUES (?, ?, ?, 2, 12.5)`,
    ).run(uuidv4(), orderId, kaartsoortId);

    const res = await request(app).post('/api/tickets/webhooks/payment').send({ orderId });
    expect(res.status).toBe(200);
    expect(bestelstatus(orderId)).toBe('paid');
    expect((db.prepare('SELECT COUNT(*) as n FROM tickets WHERE order_id = ?').get(orderId) as { n: number }).n).toBe(
      2,
    );
  });

  it('weigert de webhook in productie zolang er geen betaaldienst is ingesteld', async () => {
    const orderId = maakBestelling(concertId, { status: 'pending', paidAt: false });

    process.env.NODE_ENV = 'production';
    const res = await request(app).post('/api/tickets/webhooks/payment').send({ orderId });

    expect(res.status).toBe(403);
    expect(bestelstatus(orderId)).toBe('pending');
  });

  it('maakt geen tweede set kaarten als dezelfde webhook nog een keer binnenkomt', async () => {
    const kaartsoortId = maakKaartsoort(concertId, { quantity: 100, sold: 1 });
    const orderId = maakBestelling(concertId, { status: 'pending', paidAt: false });
    db.prepare(
      `INSERT INTO ticket_order_items (id, order_id, ticket_type_id, quantity, unit_price)
       VALUES (?, ?, ?, 1, 12.5)`,
    ).run(uuidv4(), orderId, kaartsoortId);

    await request(app).post('/api/tickets/webhooks/payment').send({ orderId });
    await request(app).post('/api/tickets/webhooks/payment').send({ orderId });

    expect((db.prepare('SELECT COUNT(*) as n FROM tickets WHERE order_id = ?').get(orderId) as { n: number }).n).toBe(
      1,
    );
  });

  it('antwoordt met OK op een webhook zonder bestelnummer, in plaats van om te vallen', async () => {
    const res = await request(app).post('/api/tickets/webhooks/payment').send({});
    expect(res.status).toBe(200);
  });

  it('valt niet om over een webhook voor een bestelling die niet bestaat', async () => {
    const res = await request(app).post('/api/tickets/webhooks/payment').send({ orderId: uuidv4() });
    expect(res.status).toBe(200);
  });

  it('geeft de kaarten weer vrij als de betaling wordt afgebroken', async () => {
    const kaartsoortId = maakKaartsoort(concertId, { quantity: 100, sold: 3 });
    const orderId = maakBestelling(concertId, { status: 'pending', paidAt: false });
    db.prepare(
      `INSERT INTO ticket_order_items (id, order_id, ticket_type_id, quantity, unit_price)
       VALUES (?, ?, ?, 3, 12.5)`,
    ).run(uuidv4(), orderId, kaartsoortId);

    const res = await alsAdmin('post', `/tickets/orders/${orderId}/mock-payment`).send({ action: 'cancel' });
    expect(res.status).toBe(200);
    expect(bestelstatus(orderId)).toBe('cancelled');
    expect(verkocht(kaartsoortId)).toBe(0);
  });

  it('zet de bestelling op betaald via het mock-eindpunt', async () => {
    const kaartsoortId = maakKaartsoort(concertId, { quantity: 100, sold: 1 });
    const orderId = maakBestelling(concertId, { status: 'pending', paidAt: false });
    db.prepare(
      `INSERT INTO ticket_order_items (id, order_id, ticket_type_id, quantity, unit_price)
       VALUES (?, ?, ?, 1, 12.5)`,
    ).run(uuidv4(), orderId, kaartsoortId);

    const res = await alsAdmin('post', `/tickets/orders/${orderId}/mock-payment`).send({ action: 'pay' });
    expect(res.status).toBe(200);
    expect(bestelstatus(orderId)).toBe('paid');
  });

  it('sluit het mock-eindpunt in productie', async () => {
    const orderId = maakBestelling(concertId, { status: 'pending', paidAt: false });

    process.env.NODE_ENV = 'production';
    const res = await alsAdmin('post', `/tickets/orders/${orderId}/mock-payment`).send({ action: 'pay' });

    expect(res.status).toBe(403);
    expect(bestelstatus(orderId)).toBe('pending');
  });

  it('laat een gewoon lid geen bestelling op betaald zetten', async () => {
    const orderId = maakBestelling(concertId, { status: 'pending', paidAt: false });
    const res = await als(memberToken, 'post', `/tickets/orders/${orderId}/mock-payment`).send({ action: 'pay' });
    expect(res.status).toBe(403);
    expect(bestelstatus(orderId)).toBe('pending');
  });
});

describe('Module kaartverkoop uit', () => {
  beforeEach(() => {
    db.prepare(`UPDATE association_modules SET enabled = 0 WHERE association_id = ? AND module_key = 'ticketing'`).run(
      associationId,
    );
    clearModuleCache();
  });

  it.each([['/tickets/sales'], ['/ticket-types/00000000-0000-0000-0000-000000000000']])('verbergt %s', async (pad) => {
    const res = await alsAdmin('get', pad);
    expect(res.status).toBe(404);
  });

  it('verbergt het dashboard van een concert', async () => {
    const res = await alsAdmin('get', `/tickets/dashboard/${concertId}`);
    expect(res.status).toBe(404);
  });

  it('verbergt de bezoekerslijst', async () => {
    const res = await alsAdmin('get', `/concerts/${concertId}/attendees`);
    expect(res.status).toBe(404);
  });
});
