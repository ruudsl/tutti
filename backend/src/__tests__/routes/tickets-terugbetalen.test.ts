/**
 * Terugbetalen en het aanmaken van een bestelling, voor zover daar een andere
 * uitkomst van de betaaldienst of van de voorraadreservering voor nodig is.
 *
 * Dit staat los van tickets.test.ts omdat vi.mock voor een heel bestand geldt.
 * De echte services blijven hier de standaard: alleen een test die het expliciet
 * overneemt krijgt een ander antwoord terug. Zo blijven de andere tests over de
 * kaartverkoop met de echte code draaien.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import ticketsRoutes from '../../routes/tickets';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestEnvironment } from '../testUtils';
import { clearModuleCache } from '../../modules/service';

/**
 * Een plek om per test het antwoord van een service over te nemen. vi.hoisted
 * omdat de fabriek van vi.mock naar boven verplaatst wordt en anders bij een
 * variabele van later in het bestand zou uitkomen.
 */
const overgenomen = vi.hoisted(() => ({
  createRefund: null as null | ((verzoek: unknown) => Promise<unknown>),
  reserveTickets: null as null | ((kaartsoortId: string, aantal: number) => unknown),
}));

vi.mock('../../services/payments', async (importOriginal) => {
  const echt = await importOriginal<typeof import('../../services/payments')>();
  return {
    ...echt,
    createRefund: (verzoek: Parameters<typeof echt.createRefund>[0]) =>
      overgenomen.createRefund
        ? (overgenomen.createRefund(verzoek) as ReturnType<typeof echt.createRefund>)
        : echt.createRefund(verzoek),
  };
});

vi.mock('../../services/ticketing', async (importOriginal) => {
  const echt = await importOriginal<typeof import('../../services/ticketing')>();
  return {
    ...echt,
    reserveTickets: (kaartsoortId: string, aantal: number) =>
      overgenomen.reserveTickets
        ? (overgenomen.reserveTickets(kaartsoortId, aantal) as ReturnType<typeof echt.reserveTickets>)
        : echt.reserveTickets(kaartsoortId, aantal),
  };
});

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
let associationId: string;
let adminId: string;
let concertId: string;

beforeEach(() => {
  overgenomen.createRefund = null;
  overgenomen.reserveTickets = null;

  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  associationId = omgeving.association.id;
  adminId = omgeving.adminUser.id;

  db.prepare(
    `INSERT INTO association_modules (id, association_id, module_key, enabled, updated_by)
     VALUES (?, ?, 'ticketing', 1, ?)
     ON CONFLICT(association_id, module_key) DO UPDATE SET enabled = 1`,
  ).run(uuidv4(), associationId, adminId);
  clearModuleCache();

  concertId = uuidv4();
  const overEenJaar = new Date();
  overEenJaar.setFullYear(overEenJaar.getFullYear() + 1);
  db.prepare(
    `INSERT INTO concerts (id, association_id, name, date, location, created_by)
     VALUES (?, ?, 'Nieuwjaarsconcert', ?, 'De Harmonie', ?)`,
  ).run(concertId, associationId, overEenJaar.toISOString().slice(0, 10), adminId);
});

const alsAdmin = (methode: 'get' | 'post', pad: string) =>
  request(app)[methode](`/api${pad}`).set('Authorization', `Bearer ${adminToken}`);

function maakKaartsoort(overschrijf: { quantity?: number; sold?: number; max_per_order?: number } = {}) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO ticket_types (id, concert_id, name, price, quantity, sold, max_per_order)
     VALUES (?, ?, 'Entree', 12.5, ?, ?, ?)`,
  ).run(id, concertId, overschrijf.quantity ?? 100, overschrijf.sold ?? 0, overschrijf.max_per_order ?? 10);
  return id;
}

function maakBetaaldeBestelling(kaartsoortId: string, aantalKaarten: number) {
  const orderId = uuidv4();
  db.prepare(
    `INSERT INTO ticket_orders (id, concert_id, total, status, payment_id, payment_method, buyer_name, buyer_email, paid_at)
     VALUES (?, ?, ?, 'paid', ?, 'ideal', 'Jan Jansen', 'jan@example.com', CURRENT_TIMESTAMP)`,
  ).run(orderId, concertId, 12.5 * aantalKaarten, `tr_${orderId.slice(0, 8)}`);

  const kaarten: string[] = [];
  for (let i = 0; i < aantalKaarten; i++) {
    const kaartId = uuidv4();
    db.prepare(
      `INSERT INTO tickets (id, ticket_type_id, order_id, buyer_name, buyer_email, status, qr_code)
       VALUES (?, ?, ?, 'Jan Jansen', 'jan@example.com', 'valid', ?)`,
    ).run(kaartId, kaartsoortId, orderId, `KAART-${uuidv4().slice(0, 12)}`);
    kaarten.push(kaartId);
  }
  return { orderId, kaarten };
}

const verkocht = (kaartsoortId: string) =>
  (db.prepare('SELECT sold FROM ticket_types WHERE id = ?').get(kaartsoortId) as { sold: number }).sold;

const bestelStatus = (orderId: string) =>
  (db.prepare('SELECT status FROM ticket_orders WHERE id = ?').get(orderId) as { status: string }).status;

const wacht = (ms: number) => new Promise((klaar) => setTimeout(klaar, ms));

async function wachtTot(voorwaarde: () => boolean) {
  for (let poging = 0; poging < 200 && !voorwaarde(); poging++) {
    await wacht(5);
  }
}

describe('Terugbetalen', () => {
  it('betaalt een bestelling terug en trekt de kaarten in', async () => {
    const kaartsoortId = maakKaartsoort({ sold: 2 });
    const { orderId } = maakBetaaldeBestelling(kaartsoortId, 2);

    const res = await alsAdmin('post', `/tickets/orders/${orderId}/refund`).send({ reason: 'Concert afgelast' });

    expect(res.status).toBe(200);
    expect(bestelStatus(orderId)).toBe('refunded');
    expect(verkocht(kaartsoortId)).toBe(0);
  });

  it('betaalt bij twee verzoeken tegelijk maar één keer terug', async () => {
    // Tussen de statuscontrole en het wegschrijven van 'refunded' zit een
    // aanroep naar de betaaldienst. Twee klikken op de knop laten allebei die
    // controle passeren en betalen allebei uit: het geld gaat er dan dubbel
    // uit en komt niet vanzelf terug.
    const kaartsoortId = maakKaartsoort({ sold: 2 });
    const { orderId } = maakBetaaldeBestelling(kaartsoortId, 2);

    let losmaken: (waarde: { success: boolean; refundId: string }) => void = () => {};
    const hangendeBetaling = new Promise<{ success: boolean; refundId: string }>((klaar) => {
      losmaken = klaar;
    });
    const aanroepen: string[] = [];
    overgenomen.createRefund = () => {
      aanroepen.push('aangeroepen');
      return hangendeBetaling;
    };

    const eerste = alsAdmin('post', `/tickets/orders/${orderId}/refund`)
      .send({ reason: 'Concert afgelast' })
      .then((r) => r);

    // Wachten tot het eerste verzoek bij de betaaldienst hangt; pas dan komt
    // het tweede verzoek binnen op precies het moment dat het misgaat.
    await wachtTot(() => aanroepen.length > 0);

    const tweede = alsAdmin('post', `/tickets/orders/${orderId}/refund`)
      .send({ reason: 'Nog een keer' })
      .then((r) => r);

    await wacht(50);
    losmaken({ success: true, refundId: 'mock_refund_1' });

    const antwoorden = await Promise.all([eerste, tweede]);

    expect(aanroepen).toHaveLength(1);
    expect(antwoorden.filter((a) => a.status === 200)).toHaveLength(1);
    expect(bestelStatus(orderId)).toBe('refunded');
  });

  it('zet de bestelling terug op betaald als de betaaldienst weigert', async () => {
    const kaartsoortId = maakKaartsoort({ sold: 2 });
    const { orderId } = maakBetaaldeBestelling(kaartsoortId, 2);
    overgenomen.createRefund = async () => ({ success: false, error: 'Refund service unavailable' });

    const res = await alsAdmin('post', `/tickets/orders/${orderId}/refund`).send({ reason: 'Concert afgelast' });

    expect(res.status).toBe(500);
    // Blijft de bestelling hangen in een tussenstand, dan is een tweede poging
    // niet meer mogelijk terwijl er nog niets is terugbetaald.
    expect(bestelStatus(orderId)).toBe('paid');
    expect(verkocht(kaartsoortId)).toBe(2);
  });

  it('geeft de voorraad van een al ingetrokken kaart niet nog een keer vrij', async () => {
    // Vijf kaarten verkocht, waarvan twee in deze bestelling. Eén daarvan is
    // los ingetrokken en al teruggegeven aan de voorraad. De terugbetaling mag
    // alleen de kaart teruggeven die nog geldig is - anders lijken er meer
    // plaatsen vrij dan de zaal heeft.
    const kaartsoortId = maakKaartsoort({ quantity: 10, sold: 5 });
    const { orderId, kaarten } = maakBetaaldeBestelling(kaartsoortId, 2);

    const ingetrokken = await alsAdmin('post', `/tickets/${kaarten[0]}/cancel`).send({});
    expect(ingetrokken.status).toBe(200);
    expect(verkocht(kaartsoortId)).toBe(4);

    const res = await alsAdmin('post', `/tickets/orders/${orderId}/refund`).send({ reason: 'Concert afgelast' });

    expect(res.status).toBe(200);
    expect(verkocht(kaartsoortId)).toBe(3);
  });
});

describe('Bestellen als de reservering afketst', () => {
  it('meldt een uitverkochte kaartsoort als afwijzing en niet als storing', async () => {
    // reserveTickets is het enige dat de voorraad echt bijhoudt en kan er
    // tussen de controle en de reservering naast grijpen als er iemand anders
    // net voor was. Dat is een nette 400 voor de koper, geen 500.
    const kaartsoortId = maakKaartsoort({ quantity: 100 });
    overgenomen.reserveTickets = () => ({ success: false, message: 'Only 1 tickets available' });

    const res = await request(app)
      .post(`/api/concerts/${concertId}/tickets/order`)
      .send({
        items: [{ ticketTypeId: kaartsoortId, quantity: 2 }],
        buyerName: 'Jan Jansen',
        buyerEmail: 'jan@example.com',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Only 1 tickets available');
    const aantal = db.prepare('SELECT COUNT(*) AS n FROM ticket_orders WHERE concert_id = ?').get(concertId) as {
      n: number;
    };
    expect(aantal.n).toBe(0);
  });
});
