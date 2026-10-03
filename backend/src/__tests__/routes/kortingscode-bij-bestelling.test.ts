/**
 * Een kortingscode bij het bestellen van kaarten.
 *
 * Kortingscodes konden worden aangemaakt en gecontroleerd, maar de
 * bestelroute nam er geen aan: niemand kon er een gebruiken. Nu:
 *
 * - de bestelling neemt `discountCode`, rekent de korting zelf uit (over de
 *   kaarten, niet over de servicekosten) en bewaart code en bedrag;
 * - een ongeldige code geeft een 400 met de reden in `code`;
 * - de code wordt bij het bestellen gereserveerd en telt bij betalen als
 *   gebruikt; een verlopen of terugbetaalde bestelling geeft hem weer vrij;
 * - het maximum, ook per koper, houdt stand;
 * - niets te betalen: de bestelling is meteen betaald, zonder betaaldienst.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import ticketsRoutes from '../../routes/tickets';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestAssociation, createTestEnvironment } from '../testUtils';
import { clearModuleCache } from '../../modules/service';

vi.mock('express-rate-limit', () => ({
  default: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../services/captcha', async (importOriginal) => {
  const echt = await importOriginal<typeof import('../../services/captcha')>();
  return { ...echt, shouldRequireCaptcha: () => false };
});

const app = express();
app.use(express.json());
app.use('/api', ticketsRoutes);
app.use(errorHandler);

let associationId: string;
let concertId: string;
let kaartsoortId: string;
let beheerderToken: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  associationId = omgeving.association.id;
  beheerderToken = omgeving.adminToken;
  db.prepare(
    `INSERT INTO association_modules (id, association_id, module_key, enabled, updated_by)
     VALUES (?, ?, 'ticketing', 1, ?)
     ON CONFLICT(association_id, module_key) DO UPDATE SET enabled = 1`,
  ).run(uuidv4(), associationId, omgeving.adminUser.id);
  clearModuleCache();

  const overEenJaar = new Date();
  overEenJaar.setFullYear(overEenJaar.getFullYear() + 1);
  concertId = uuidv4();
  db.prepare(
    `INSERT INTO concerts (id, association_id, name, date, location) VALUES (?, ?, 'Najaarsconcert', ?, 'Zaal')`,
  ).run(concertId, associationId, overEenJaar.toISOString().slice(0, 10));
  kaartsoortId = maakKaartsoort(20, 1);
});

function maakKaartsoort(prijs: number, servicekosten = 0): string {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO ticket_types (id, concert_id, name, price, quantity, sold, max_per_order, service_fee)
     VALUES (?, ?, 'Regulier', ?, 100, 0, 10, ?)`,
  ).run(id, concertId, prijs, servicekosten);
  return id;
}

function maakCode(waarden: Record<string, unknown> = {}): string {
  const w = {
    code: 'LENTE10',
    discount_type: 'percentage',
    discount_value: 10,
    max_uses: null,
    uses_count: 0,
    max_uses_per_user: 1,
    ticket_type_ids: null,
    ...waarden,
  };
  const id = uuidv4();
  db.prepare(
    `INSERT INTO discount_codes
       (id, association_id, code, discount_type, discount_value, max_uses, uses_count, max_uses_per_user, ticket_type_ids)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    associationId,
    w.code,
    w.discount_type,
    w.discount_value,
    w.max_uses,
    w.uses_count,
    w.max_uses_per_user,
    w.ticket_type_ids,
  );
  return id;
}

const bestel = (velden: { code?: string; email?: string; items?: { ticketTypeId: string; quantity: number }[] }) =>
  request(app)
    .post(`/api/concerts/${concertId}/tickets/order`)
    .send({
      items: velden.items ?? [{ ticketTypeId: kaartsoortId, quantity: 2 }],
      buyerName: 'Koper',
      buyerEmail: velden.email ?? 'koper@voorbeeld.nl',
      discountCode: velden.code,
    });

const bestelling = (id: string) =>
  db.prepare('SELECT status, total, discount_code_id, discount_amount FROM ticket_orders WHERE id = ?').get(id) as {
    status: string;
    total: number;
    discount_code_id: string | null;
    discount_amount: number;
  };

const gebruik = (codeId: string) =>
  (db.prepare('SELECT COUNT(*) AS n FROM discount_code_usage WHERE discount_code_id = ?').get(codeId) as { n: number })
    .n;

const gebruikt = (codeId: string) =>
  (db.prepare('SELECT uses_count FROM discount_codes WHERE id = ?').get(codeId) as { uses_count: number }).uses_count;

describe('kortingscode bij een bestelling', () => {
  it('trekt de korting af van de kaarten, niet van de servicekosten, en bewaart code en bedrag', async () => {
    const codeId = maakCode();

    const antwoord = await bestel({ code: 'lente10' });

    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    // 2 x 20 = 40, 10% korting = 4, plus 2 x 1 servicekosten.
    expect(antwoord.body).toMatchObject({ subtotal: 40, discount: 4, serviceFee: 2, total: 38, status: 'pending' });
    expect(bestelling(antwoord.body.orderId)).toEqual({
      status: 'pending',
      total: 38,
      discount_code_id: codeId,
      discount_amount: 4,
    });
    expect(gebruik(codeId)).toBe(1);
    expect(gebruikt(codeId)).toBe(0);
  });

  it('bestelt zonder code zoals altijd', async () => {
    const antwoord = await bestel({});

    expect(antwoord.status).toBe(201);
    expect(antwoord.body).toMatchObject({ subtotal: 40, discount: 0, total: 42 });
  });

  it('weigert een onbekende code met een 400 en de reden, zonder bestelling', async () => {
    const voor = (db.prepare('SELECT COUNT(*) AS n FROM ticket_orders').get() as { n: number }).n;

    const antwoord = await bestel({ code: 'BESTAATNIET' });

    expect(antwoord.status).toBe(400);
    expect(antwoord.body.code).toBe('KORTINGSCODE_ONBEKEND');
    expect((db.prepare('SELECT COUNT(*) AS n FROM ticket_orders').get() as { n: number }).n).toBe(voor);
  });

  it('kent geen codes van een andere vereniging', async () => {
    const ander = createTestAssociation().id;
    db.prepare(
      `INSERT INTO discount_codes (id, association_id, code, discount_type, discount_value) VALUES (?, ?, 'ANDER', 'percentage', 50)`,
    ).run(uuidv4(), ander);

    const antwoord = await bestel({ code: 'ANDER' });

    expect(antwoord.status).toBe(400);
    expect(antwoord.body.code).toBe('KORTINGSCODE_ONBEKEND');
  });

  it('telt de code als gebruikt zodra er betaald is', async () => {
    const codeId = maakCode();
    const { body } = await bestel({ code: 'LENTE10' });

    await request(app).post('/api/tickets/webhooks/payment').send({ orderId: body.orderId });

    expect(bestelling(body.orderId).status).toBe('paid');
    expect(gebruikt(codeId)).toBe(1);
  });

  it('houdt het maximum aan, ook met lopende bestellingen', async () => {
    const codeId = maakCode({ max_uses: 1, max_uses_per_user: 0 });

    expect((await bestel({ code: 'LENTE10', email: 'a@voorbeeld.nl' })).status).toBe(201);
    const tweede = await bestel({ code: 'LENTE10', email: 'b@voorbeeld.nl' });

    expect(tweede.status).toBe(400);
    expect(tweede.body.code).toBe('KORTINGSCODE_OP');
    expect(gebruik(codeId)).toBe(1);
  });

  it('laat een koper de code niet vaker gebruiken dan toegestaan, ongeacht hoofdletters', async () => {
    maakCode({ max_uses_per_user: 1 });

    expect((await bestel({ code: 'LENTE10', email: 'kees@voorbeeld.nl' })).status).toBe(201);
    const tweede = await bestel({ code: 'LENTE10', email: 'Kees@Voorbeeld.nl' });

    expect(tweede.status).toBe(400);
    expect(tweede.body.code).toBe('KORTINGSCODE_KOPER');
  });

  it('geeft de code vrij als de bestelling verloopt', async () => {
    const codeId = maakCode({ max_uses: 1, max_uses_per_user: 0 });
    const { body } = await bestel({ code: 'LENTE10', email: 'a@voorbeeld.nl' });
    db.prepare("UPDATE ticket_orders SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(body.orderId);

    // Ook zonder dat iemand de verlopen bestelling aanraakt, telt hij niet meer mee.
    expect((await bestel({ code: 'LENTE10', email: 'b@voorbeeld.nl' })).status).toBe(201);

    // En wie de verlopen bestelling alsnog wil betalen, ruimt de reservering op.
    const betalen = await request(app).post(`/api/tickets/orders/${body.orderId}/pay`).send({});
    expect(betalen.status).toBe(400);
    expect(db.prepare('SELECT 1 FROM discount_code_usage WHERE order_id = ?').get(body.orderId)).toBeUndefined();
    expect(gebruik(codeId)).toBe(1);
  });

  it('geeft de code vrij als de bestelling wordt terugbetaald, één keer', async () => {
    const codeId = maakCode({ max_uses: 1, max_uses_per_user: 1 });
    const { body } = await bestel({ code: 'LENTE10', email: 'a@voorbeeld.nl' });
    await request(app).post('/api/tickets/webhooks/payment').send({ orderId: body.orderId });
    db.prepare("UPDATE ticket_orders SET payment_id = 'tr_test' WHERE id = ?").run(body.orderId);
    expect(gebruikt(codeId)).toBe(1);

    const terug = await request(app)
      .post(`/api/tickets/orders/${body.orderId}/refund`)
      .set('Authorization', `Bearer ${beheerderToken}`)
      .send({});

    expect(terug.status, JSON.stringify(terug.body)).toBe(200);
    expect(gebruikt(codeId)).toBe(0);
    expect(gebruik(codeId)).toBe(0);
    // Code en bedrag blijven op de bestelling, voor de administratie.
    expect(bestelling(body.orderId)).toMatchObject({
      status: 'refunded',
      discount_code_id: codeId,
      discount_amount: 4,
    });

    // Dezelfde koper mag hem weer gebruiken, en het maximum is weer vrij.
    expect((await bestel({ code: 'LENTE10', email: 'a@voorbeeld.nl' })).status).toBe(201);
  });

  it('rekent bij een code voor één kaartsoort alleen die kaarten mee', async () => {
    const duur = maakKaartsoort(50);
    maakCode({ ticket_type_ids: JSON.stringify([kaartsoortId]), discount_value: 50 });

    const antwoord = await bestel({
      code: 'LENTE10',
      items: [
        { ticketTypeId: kaartsoortId, quantity: 1 },
        { ticketTypeId: duur, quantity: 1 },
      ],
    });

    // 50% van alleen de kaart van 20, niet van 70.
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    expect(antwoord.body).toMatchObject({ subtotal: 70, discount: 10 });
  });

  it('maakt een bestelling zonder te betalen bedrag meteen betaald, met kaarten', async () => {
    const gratis = maakKaartsoort(15, 0);
    const codeId = maakCode({ code: 'VRIJKAART', discount_value: 100 });

    const antwoord = await bestel({ code: 'VRIJKAART', items: [{ ticketTypeId: gratis, quantity: 2 }] });

    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    expect(antwoord.body).toMatchObject({ total: 0, status: 'paid' });
    expect(bestelling(antwoord.body.orderId).status).toBe('paid');
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE order_id = ?').get(antwoord.body.orderId) as { n: number })
        .n,
    ).toBe(2);
    expect(gebruikt(codeId)).toBe(1);
  });
});

describe('kortingscodes achter de module kaartverkoop', () => {
  it('hangt /api/discount-codes in index.ts achter requireModule', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const bron = fs.readFileSync(path.join(__dirname, '../../index.ts'), 'utf-8');

    expect(bron).toMatch(/app\.use\('\/api\/discount-codes',\s*optionalAuth,\s*requireModule\('ticketing'\)/);
  });
});
