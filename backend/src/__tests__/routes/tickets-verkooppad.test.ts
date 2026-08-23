/**
 * Het pad waarlangs geld binnenkomt: het verkoopvenster van een kaartsoort, de
 * CAPTCHA voor de bestelpagina, en de betaal-webhook zoals die eruitziet met
 * een echte betaaldienst erachter.
 *
 * Dit staat los van tickets-beheer.test.ts omdat vi.mock voor een heel bestand
 * geldt. In tickets-beheer.test.ts is er geen betaaldienst ingesteld - de stand
 * van de testomgeving - en loopt de webhook door de neptak. Hier wordt juist
 * die neptak omzeild: getPaymentProvider levert 'mollie' of 'stripe', zodat de
 * twee takken worden afgelopen die in productie het werk doen.
 *
 * De echte services blijven de standaard; alleen een test die het expliciet
 * overneemt krijgt een ander antwoord terug.
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
 * vi.hoisted omdat de fabriek van vi.mock naar boven wordt verplaatst en
 * anders bij een variabele van later in het bestand zou uitkomen.
 */
const overgenomen = vi.hoisted(() => ({
  provider: null as null | 'mollie' | 'stripe',
  handleMollieWebhook: null as null | ((paymentId: string) => Promise<unknown>),
  verifyStripeWebhook: null as null | ((payload: unknown, signature: string) => unknown),
  handleStripeWebhook: null as null | ((event: unknown) => Promise<unknown>),
  shouldRequireCaptcha: null as null | ((ip: string, totaal: number) => boolean),
  verifyCaptcha: null as null | ((token: string, ip?: string) => Promise<unknown>),
}));

vi.mock('../../services/payments', async (importOriginal) => {
  const echt = await importOriginal<typeof import('../../services/payments')>();
  return {
    ...echt,
    getPaymentProvider: () => (overgenomen.provider !== null ? overgenomen.provider : echt.getPaymentProvider()),
    handleMollieWebhook: (paymentId: string) =>
      overgenomen.handleMollieWebhook
        ? (overgenomen.handleMollieWebhook(paymentId) as ReturnType<typeof echt.handleMollieWebhook>)
        : echt.handleMollieWebhook(paymentId),
    verifyStripeWebhook: (payload: Buffer | string, signature: string) =>
      overgenomen.verifyStripeWebhook
        ? (overgenomen.verifyStripeWebhook(payload, signature) as ReturnType<typeof echt.verifyStripeWebhook>)
        : echt.verifyStripeWebhook(payload, signature),
    handleStripeWebhook: (event: Record<string, unknown>) =>
      overgenomen.handleStripeWebhook
        ? (overgenomen.handleStripeWebhook(event) as ReturnType<typeof echt.handleStripeWebhook>)
        : echt.handleStripeWebhook(event),
  };
});

vi.mock('../../services/captcha', async (importOriginal) => {
  const echt = await importOriginal<typeof import('../../services/captcha')>();
  return {
    ...echt,
    shouldRequireCaptcha: (ip: string, totaal: number) =>
      overgenomen.shouldRequireCaptcha ? overgenomen.shouldRequireCaptcha(ip, totaal) : echt.shouldRequireCaptcha(ip, totaal),
    verifyCaptcha: (token: string, ip?: string) =>
      overgenomen.verifyCaptcha
        ? (overgenomen.verifyCaptcha(token, ip) as ReturnType<typeof echt.verifyCaptcha>)
        : echt.verifyCaptcha(token, ip),
  };
});

vi.mock('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const app = express();
app.use(express.json());
app.use('/api', ticketsRoutes);
app.use(errorHandler);

/**
 * Een tweede app die de webhook de ruwe bytes geeft, zoals index.ts dat doet.
 * Stripe rekent zijn handtekening over precies die bytes uit, dus zonder deze
 * mount is de handtekening niet na te kijken en weigert de route terecht.
 */
const appMetRuweBody = express();
appMetRuweBody.use('/api/tickets/webhooks/payment', express.raw({ type: 'application/json' }));
appMetRuweBody.use(express.json());
appMetRuweBody.use('/api', ticketsRoutes);
appMetRuweBody.use(errorHandler);

let associationId: string;
let adminId: string;
let adminToken: string;
let concertId: string;

beforeEach(() => {
  overgenomen.provider = null;
  overgenomen.handleMollieWebhook = null;
  overgenomen.verifyStripeWebhook = null;
  overgenomen.handleStripeWebhook = null;
  overgenomen.shouldRequireCaptcha = null;
  overgenomen.verifyCaptcha = null;

  const omgeving = createTestEnvironment();
  associationId = omgeving.association.id;
  adminId = omgeving.adminUser.id;
  adminToken = omgeving.adminToken;

  db.prepare(
    `INSERT INTO association_modules (id, association_id, module_key, enabled, updated_by)
     VALUES (?, ?, 'ticketing', 1, ?)
     ON CONFLICT(association_id, module_key) DO UPDATE SET enabled = 1`,
  ).run(uuidv4(), associationId, adminId);
  clearModuleCache();

  const overEenJaar = new Date();
  overEenJaar.setFullYear(overEenJaar.getFullYear() + 1);
  concertId = uuidv4();
  db.prepare(
    `INSERT INTO concerts (id, association_id, name, date, location, created_by)
     VALUES (?, ?, 'Nieuwjaarsconcert', ?, 'De Harmonie', ?)`,
  ).run(concertId, associationId, overEenJaar.toISOString().slice(0, 10), adminId);
});

function maakKaartsoort(overschrijf: { verkoopStart?: string | null; verkoopEind?: string | null } = {}) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO ticket_types (id, concert_id, name, price, quantity, sold, max_per_order, sale_start, sale_end)
     VALUES (?, ?, 'Entree', 12.5, 100, 0, 10, ?, ?)`,
  ).run(id, concertId, overschrijf.verkoopStart ?? null, overschrijf.verkoopEind ?? null);
  return id;
}

function maakOpenBestelling(kaartsoortId: string, aantal = 1) {
  const orderId = uuidv4();
  db.prepare(
    `INSERT INTO ticket_orders (id, concert_id, total, status, payment_id, buyer_name, buyer_email)
     VALUES (?, ?, ?, 'pending', ?, 'Jan Jansen', 'jan@example.com')`,
  ).run(orderId, concertId, 12.5 * aantal, `tr_${orderId.slice(0, 8)}`);
  db.prepare(
    `INSERT INTO ticket_order_items (id, order_id, ticket_type_id, quantity, unit_price)
     VALUES (?, ?, ?, ?, 12.5)`,
  ).run(uuidv4(), orderId, kaartsoortId, aantal);
  db.prepare('UPDATE ticket_types SET sold = sold + ? WHERE id = ?').run(aantal, kaartsoortId);
  return orderId;
}

function bestel(kaartsoortId: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .post(`/api/concerts/${concertId}/tickets/order`)
    .send({
      items: [{ ticketTypeId: kaartsoortId, quantity: 1 }],
      buyerName: 'Jan Jansen',
      buyerEmail: 'jan@example.com',
      ...extra,
    });
}

function bestelstatus(orderId: string) {
  return (db.prepare('SELECT status FROM ticket_orders WHERE id = ?').get(orderId) as { status: string }).status;
}

function overDagen(aantal: number) {
  return new Date(Date.now() + aantal * 24 * 60 * 60 * 1000).toISOString();
}

describe('Verkoopvenster', () => {
  it('verkoopt nog niets voordat de voorverkoop begint', async () => {
    const kaartsoortId = maakKaartsoort({ verkoopStart: overDagen(3) });
    const res = await bestel(kaartsoortId);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('not started');
    // En er is niets gereserveerd.
    expect((db.prepare('SELECT sold FROM ticket_types WHERE id = ?').get(kaartsoortId) as { sold: number }).sold).toBe(0);
  });

  it('verkoopt niets meer nadat de voorverkoop is gesloten', async () => {
    const kaartsoortId = maakKaartsoort({ verkoopEind: overDagen(-1) });
    const res = await bestel(kaartsoortId);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('ended');
  });

  it('verkoopt binnen het venster gewoon', async () => {
    const kaartsoortId = maakKaartsoort({ verkoopStart: overDagen(-1), verkoopEind: overDagen(1) });
    const res = await bestel(kaartsoortId);
    expect(res.status).toBe(201);
  });

  it('weigert een kaartsoort van een ander concert', async () => {
    const anderConcert = uuidv4();
    db.prepare(
      `INSERT INTO concerts (id, association_id, name, date, created_by) VALUES (?, ?, 'Ander', '2027-01-01', ?)`,
    ).run(anderConcert, associationId, adminId);
    const vreemdeSoort = uuidv4();
    db.prepare(
      `INSERT INTO ticket_types (id, concert_id, name, price, quantity, sold, max_per_order)
       VALUES (?, ?, 'Entree', 10, 100, 0, 10)`,
    ).run(vreemdeSoort, anderConcert);

    const res = await bestel(vreemdeSoort);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('does not belong');
  });

  it('weigert een kaartsoort die niet bestaat', async () => {
    const res = await bestel(uuidv4());
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('not found');
  });
});

describe('CAPTCHA bij het bestellen', () => {
  it('vraagt om een CAPTCHA en reserveert niets zolang die ontbreekt', async () => {
    const kaartsoortId = maakKaartsoort();
    overgenomen.shouldRequireCaptcha = () => true;

    const res = await bestel(kaartsoortId);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('CAPTCHA');
    expect((db.prepare('SELECT sold FROM ticket_types WHERE id = ?').get(kaartsoortId) as { sold: number }).sold).toBe(0);
  });

  it('weigert een CAPTCHA die niet klopt', async () => {
    const kaartsoortId = maakKaartsoort();
    overgenomen.shouldRequireCaptcha = () => true;
    overgenomen.verifyCaptcha = async () => ({ success: false, error: 'CAPTCHA verkeerd' });

    const res = await bestel(kaartsoortId, { captchaToken: 'fout' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CAPTCHA verkeerd');
  });

  it('laat de bestelling door bij een geldige CAPTCHA en legt dat vast', async () => {
    const kaartsoortId = maakKaartsoort();
    overgenomen.shouldRequireCaptcha = () => true;
    overgenomen.verifyCaptcha = async () => ({ success: true });

    const res = await bestel(kaartsoortId, { captchaToken: 'goed' });
    expect(res.status).toBe(201);
    expect(
      (
        db.prepare('SELECT captcha_verified FROM ticket_orders WHERE id = ?').get(res.body.orderId) as {
          captcha_verified: number;
        }
      ).captcha_verified,
    ).toBe(1);
  });
});

describe('Webhook met Mollie erachter', () => {
  beforeEach(() => {
    overgenomen.provider = 'mollie';
  });

  it('weigert een webhook zonder betaalkenmerk', async () => {
    const res = await request(app).post('/api/tickets/webhooks/payment').send({});
    expect(res.status).toBe(400);
  });

  it('weigert een betaalkenmerk dat geen tekst is', async () => {
    const res = await request(app).post('/api/tickets/webhooks/payment').send({ id: { kwaad: true } });
    expect(res.status).toBe(400);
  });

  /**
   * Mollie stuurt alleen het kenmerk mee; de status wordt bij Mollie zelf
   * opgehaald. Het kenmerk uit het verzoek hoeft daarom niet vertrouwd te
   * worden - en dat is precies wat hier telt: het bestelnummer komt uit het
   * antwoord van de dienst, niet uit de payload.
   */
  it('zet de bestelling op betaald op grond van wat Mollie terugmeldt', async () => {
    const kaartsoortId = maakKaartsoort();
    const orderId = maakOpenBestelling(kaartsoortId, 2);
    overgenomen.handleMollieWebhook = async () => ({ success: true, orderId, status: 'paid' });

    const res = await request(app).post('/api/tickets/webhooks/payment').send({ id: 'tr_van_de_aanvaller' });
    expect(res.status).toBe(200);
    expect(bestelstatus(orderId)).toBe('paid');
    expect((db.prepare('SELECT COUNT(*) as n FROM tickets WHERE order_id = ?').get(orderId) as { n: number }).n).toBe(2);
  });

  it('geeft de kaarten vrij als Mollie meldt dat de betaling is mislukt', async () => {
    const kaartsoortId = maakKaartsoort();
    const orderId = maakOpenBestelling(kaartsoortId, 3);
    overgenomen.handleMollieWebhook = async () => ({ success: true, orderId, status: 'failed' });

    await request(app).post('/api/tickets/webhooks/payment').send({ id: 'tr_test' });

    expect(bestelstatus(orderId)).toBe('failed');
    expect((db.prepare('SELECT sold FROM ticket_types WHERE id = ?').get(kaartsoortId) as { sold: number }).sold).toBe(0);
  });

  /**
   * Een 200 op een mislukte verwerking is opzet: Mollie stuurt de webhook
   * anders eindeloos opnieuw. De bestelling hoort dan wel te blijven staan
   * waar hij stond.
   */
  it('antwoordt met OK maar verandert niets als de verwerking mislukt', async () => {
    const kaartsoortId = maakKaartsoort();
    const orderId = maakOpenBestelling(kaartsoortId);
    overgenomen.handleMollieWebhook = async () => ({ success: false, error: 'Payment not found' });

    const res = await request(app).post('/api/tickets/webhooks/payment').send({ id: 'tr_test' });
    expect(res.status).toBe(200);
    expect(bestelstatus(orderId)).toBe('pending');
  });
});

describe('Webhook met Stripe erachter', () => {
  beforeEach(() => {
    overgenomen.provider = 'stripe';
  });

  it('weigert een webhook zonder handtekening', async () => {
    const res = await request(appMetRuweBody)
      .post('/api/tickets/webhooks/payment')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'checkout.session.completed' }));
    expect(res.status).toBe(400);
  });

  /**
   * Zonder express.raw() op dit pad is req.body al tot een object verwerkt. De
   * handtekening naast een opnieuw samengestelde JSON leggen zegt niets - dan
   * kan iedereen die de payload bedenkt hem laten kloppen. Weigeren is hier het
   * enige goede antwoord, en dat is wat de route doet.
   */
  it('weigert te tekenen over een body die al verwerkt is', async () => {
    overgenomen.verifyStripeWebhook = () => {
      throw new Error('had niet aangeroepen mogen worden');
    };

    const res = await request(app)
      .post('/api/tickets/webhooks/payment')
      .set('stripe-signature', 't=1,v1=abc')
      .send({ type: 'checkout.session.completed' });

    expect(res.status).toBe(500);
  });

  it('weigert een handtekening die niet klopt', async () => {
    overgenomen.verifyStripeWebhook = () => ({ valid: false });

    const res = await request(appMetRuweBody)
      .post('/api/tickets/webhooks/payment')
      .set('stripe-signature', 't=1,v1=fout')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'checkout.session.completed' }));

    expect(res.status).toBe(400);
  });

  it('zet de bestelling op betaald bij een handtekening die wel klopt', async () => {
    const kaartsoortId = maakKaartsoort();
    const orderId = maakOpenBestelling(kaartsoortId);
    overgenomen.verifyStripeWebhook = () => ({ valid: true, event: { type: 'checkout.session.completed' } });
    overgenomen.handleStripeWebhook = async () => ({ success: true, orderId, status: 'paid' });

    const res = await request(appMetRuweBody)
      .post('/api/tickets/webhooks/payment')
      .set('stripe-signature', 't=1,v1=goed')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'checkout.session.completed' }));

    expect(res.status).toBe(200);
    expect(bestelstatus(orderId)).toBe('paid');
  });
});

describe('Betaalgegevens ophalen bij een ingestelde dienst', () => {
  it('geeft terug welke dienst er achter de betaling zit', async () => {
    overgenomen.provider = 'mollie';
    const kaartsoortId = maakKaartsoort();
    const orderId = maakOpenBestelling(kaartsoortId);

    const res = await request(app)
      .get(`/api/tickets/sales/${orderId}/payment-details`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.provider).toBe('mollie');
    expect(res.body.paymentId).toBeTruthy();
  });
});
