/**
 * Kortingscodes.
 *
 * Dit bestand stond op nul procent en het gaat over geld: een code die te veel
 * korting geeft, te vaak gebruikt kan worden of bij het verkeerde concert
 * geldt, kost de vereniging direct omzet. De controleroute is bovendien
 * openbaar — een koper hoeft niet ingelogd te zijn — dus daar telt ook wie er
 * wat te zien krijgt.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import discountCodesRoutes from '../../routes/discount-codes';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestAssociation, createTestEnvironment, TestAssociation } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/discount-codes', discountCodesRoutes);
app.use(errorHandler);

function overMorgen(dagen: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dagen);
  return d.toISOString();
}

describe('kortingscodes', () => {
  let vereniging: TestAssociation;
  let beheerderToken: string;
  let lidToken: string;
  let concertId: string;

  function maakConcert(associationId: string): string {
    const id = uuidv4();
    db.prepare(
      "INSERT INTO concerts (id, association_id, name, date, location) VALUES (?, ?, 'Concert', '2026-11-07', 'Zaal')",
    ).run(id, associationId);
    return id;
  }

  function maakCode(overrides: Record<string, unknown> = {}): string {
    const id = uuidv4();
    const w = {
      association_id: vereniging.id,
      code: `LENTE${Math.floor(Math.random() * 1e6)}`,
      discount_type: 'percentage',
      discount_value: 10,
      min_order_amount: 0,
      max_uses: null,
      uses_count: 0,
      max_uses_per_user: 1,
      valid_from: null,
      valid_until: null,
      concert_ids: null,
      ticket_type_ids: null,
      is_active: 1,
      ...overrides,
    };
    db.prepare(
      `INSERT INTO discount_codes
         (id, association_id, code, discount_type, discount_value, min_order_amount, max_uses, uses_count,
          max_uses_per_user, valid_from, valid_until, concert_ids, ticket_type_ids, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      w.association_id,
      w.code,
      w.discount_type,
      w.discount_value,
      w.min_order_amount,
      w.max_uses,
      w.uses_count,
      w.max_uses_per_user,
      w.valid_from,
      w.valid_until,
      w.concert_ids,
      w.ticket_type_ids,
      w.is_active,
    );
    return id;
  }

  function codeVan(id: string): { code: string } {
    return db.prepare('SELECT code FROM discount_codes WHERE id = ?').get(id) as { code: string };
  }

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;
    concertId = maakConcert(vereniging.id);
  });

  const alsBeheerder = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
    request(app)[methode](`/api/discount-codes${pad}`).set('Authorization', `Bearer ${beheerderToken}`);

  describe('rechten', () => {
    it('houdt een gewoon lid buiten het beheer', async () => {
      for (const [methode, pad] of [
        ['get', '/'],
        ['post', '/'],
        ['get', `/${uuidv4()}`],
        ['put', `/${uuidv4()}`],
        ['delete', `/${uuidv4()}`],
        ['get', `/${uuidv4()}/usage`],
      ] as Array<['get' | 'post' | 'put' | 'delete', string]>) {
        const verzoek = request(app)[methode](`/api/discount-codes${pad}`);
        const antwoord = await verzoek.set('Authorization', `Bearer ${lidToken}`);
        expect(antwoord.status, `${methode} ${pad}`).toBe(403);
      }
    });

    it('vereist inloggen voor het beheer', async () => {
      expect((await request(app).get('/api/discount-codes/')).status).toBe(401);
    });
  });

  describe('aanmaken', () => {
    it('maakt een procentuele code aan', async () => {
      const antwoord = await alsBeheerder('post', '/').send({
        code: 'LENTE10',
        discountType: 'percentage',
        discountValue: 10,
      });

      expect(antwoord.status).toBe(201);
      const rij = db
        .prepare('SELECT code, discount_value, association_id FROM discount_codes WHERE id = ?')
        .get(antwoord.body.id) as { code: string; discount_value: number; association_id: string };
      expect(rij).toMatchObject({ discount_value: 10, association_id: vereniging.id });
    });

    it('weigert een percentage boven de honderd', async () => {
      const antwoord = await alsBeheerder('post', '/').send({
        code: 'TEVEEL',
        discountType: 'percentage',
        discountValue: 150,
      });
      expect(antwoord.status).toBe(400);
    });

    it('staat een vast bedrag boven de honderd wel toe', async () => {
      const antwoord = await alsBeheerder('post', '/').send({
        code: 'HONDERDVIJFTIG',
        discountType: 'fixed_amount',
        discountValue: 150,
      });
      expect(antwoord.status).toBe(201);
    });

    it('weigert een einddatum die voor de begindatum ligt', async () => {
      const antwoord = await alsBeheerder('post', '/').send({
        code: 'OMGEKEERD',
        discountType: 'percentage',
        discountValue: 10,
        validFrom: overMorgen(10),
        validUntil: overMorgen(1),
      });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een code zonder soort korting', async () => {
      const antwoord = await alsBeheerder('post', '/').send({ code: 'GEENSOORT', discountValue: 10 });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een lege code', async () => {
      const antwoord = await alsBeheerder('post', '/').send({
        code: '',
        discountType: 'percentage',
        discountValue: 10,
      });
      expect(antwoord.status).toBe(400);
    });
  });

  describe('overzicht en ophalen', () => {
    it('toont de codes van de eigen vereniging', async () => {
      maakCode({ code: 'EIGEN' });
      const antwoord = await alsBeheerder('get', '/');

      expect(antwoord.status).toBe(200);
      const codes = (antwoord.body.discountCodes ?? antwoord.body).map((c: { code: string }) => c.code);
      expect(codes).toContain('EIGEN');
    });

    it('toont de codes van een andere vereniging niet', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      maakCode({ association_id: andere.id, code: 'VANDEBUREN' });

      const antwoord = await alsBeheerder('get', '/');
      const codes = (antwoord.body.discountCodes ?? antwoord.body).map((c: { code: string }) => c.code);
      expect(codes).not.toContain('VANDEBUREN');
    });

    it('geeft 404 voor een code van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdeId = maakCode({ association_id: andere.id });

      const antwoord = await alsBeheerder('get', `/${vreemdeId}`);
      expect(antwoord.status).toBe(404);
    });

    it('geeft 404 voor een code die niet bestaat', async () => {
      expect((await alsBeheerder('get', `/${uuidv4()}`)).status).toBe(404);
    });
  });

  describe('wijzigen en verwijderen', () => {
    it('werkt een code bij', async () => {
      const id = maakCode({ discount_value: 10 });
      const antwoord = await alsBeheerder('put', `/${id}`).send({ discountValue: 25 });

      expect(antwoord.status).toBe(200);
      const rij = db.prepare('SELECT discount_value FROM discount_codes WHERE id = ?').get(id) as {
        discount_value: number;
      };
      expect(rij.discount_value).toBe(25);
    });

    it('weigert een code van een andere vereniging bij te werken', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdeId = maakCode({ association_id: andere.id, discount_value: 10 });

      const antwoord = await alsBeheerder('put', `/${vreemdeId}`).send({ discountValue: 99 });
      expect(antwoord.status).toBe(404);

      const rij = db.prepare('SELECT discount_value FROM discount_codes WHERE id = ?').get(vreemdeId) as {
        discount_value: number;
      };
      expect(rij.discount_value).toBe(10);
    });

    it('verwijdert een code', async () => {
      const id = maakCode();
      expect((await alsBeheerder('delete', `/${id}`)).status).toBe(200);
    });

    it('weigert een code van een andere vereniging te verwijderen', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdeId = maakCode({ association_id: andere.id });

      expect((await alsBeheerder('delete', `/${vreemdeId}`)).status).toBe(404);
      expect(db.prepare('SELECT id FROM discount_codes WHERE id = ?').get(vreemdeId)).toBeTruthy();
    });
  });

  describe('een code controleren', () => {
    const controleer = (body: Record<string, unknown>) => request(app).post('/api/discount-codes/validate').send(body);

    it('keurt een geldige code goed', async () => {
      const id = maakCode({ discount_value: 10 });
      const antwoord = await controleer({ code: codeVan(id).code, concertId, orderTotal: 100 });

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.valid).toBe(true);
    });

    it('werkt zonder ingelogd te zijn', async () => {
      const id = maakCode();
      const antwoord = await controleer({ code: codeVan(id).code, concertId, orderTotal: 100 });
      expect(antwoord.body.valid).toBe(true);
    });

    it('wijst een onbekende code af', async () => {
      const antwoord = await controleer({ code: 'BESTAATNIET', concertId, orderTotal: 100 });
      expect(antwoord.body.valid).toBe(false);
    });

    it('wijst een uitgeschakelde code af', async () => {
      const id = maakCode({ is_active: 0 });
      const antwoord = await controleer({ code: codeVan(id).code, concertId, orderTotal: 100 });

      expect(antwoord.body.valid).toBe(false);
      expect(antwoord.body.message).toMatch(/no longer active/i);
    });

    it('wijst een code af die nog niet geldig is', async () => {
      const id = maakCode({ valid_from: overMorgen(5) });
      const antwoord = await controleer({ code: codeVan(id).code, concertId, orderTotal: 100 });

      expect(antwoord.body.valid).toBe(false);
      expect(antwoord.body.message).toMatch(/not yet valid/i);
    });

    it('wijst een verlopen code af', async () => {
      const id = maakCode({ valid_until: overMorgen(-5) });
      const antwoord = await controleer({ code: codeVan(id).code, concertId, orderTotal: 100 });

      expect(antwoord.body.valid).toBe(false);
      expect(antwoord.body.message).toMatch(/expired/i);
    });

    it('wijst een code af die zijn maximum heeft bereikt', async () => {
      const id = maakCode({ max_uses: 3, uses_count: 3 });
      const antwoord = await controleer({ code: codeVan(id).code, concertId, orderTotal: 100 });

      expect(antwoord.body.valid).toBe(false);
      expect(antwoord.body.message).toMatch(/maximum number of uses/i);
    });

    it('wijst een order af die onder het minimumbedrag blijft', async () => {
      const id = maakCode({ min_order_amount: 50 });

      expect((await controleer({ code: codeVan(id).code, concertId, orderTotal: 20 })).body.valid).toBe(false);
      expect((await controleer({ code: codeVan(id).code, concertId, orderTotal: 50 })).body.valid).toBe(true);
    });

    it('wijst een code af die aan een ander concert hangt', async () => {
      const anderConcert = maakConcert(vereniging.id);
      const id = maakCode({ concert_ids: JSON.stringify([anderConcert]) });

      expect((await controleer({ code: codeVan(id).code, concertId, orderTotal: 100 })).body.valid).toBe(false);
      expect((await controleer({ code: codeVan(id).code, concertId: anderConcert, orderTotal: 100 })).body.valid).toBe(
        true,
      );
    });

    it('wijst een concert af dat niet bestaat', async () => {
      const id = maakCode();
      const antwoord = await controleer({ code: codeVan(id).code, concertId: uuidv4(), orderTotal: 100 });
      expect(antwoord.body.valid).toBe(false);
    });

    it('wijst een verzoek zonder code af', async () => {
      const antwoord = await controleer({ concertId, orderTotal: 100 });
      expect(antwoord.body.valid).toBe(false);
    });

    it('wijst een negatief ordertotaal af', async () => {
      const id = maakCode();
      const antwoord = await controleer({ code: codeVan(id).code, concertId, orderTotal: -10 });
      expect(antwoord.body.valid).toBe(false);
    });

    it('telt eerder gebruik door dezelfde koper mee', async () => {
      const id = maakCode({ max_uses_per_user: 1 });
      const orderId = uuidv4();
      db.prepare(
        `INSERT INTO ticket_orders (id, concert_id, total, status, buyer_name, buyer_email)
         VALUES (?, ?, 100, 'paid', 'Jan', 'jan@test.nl')`,
      ).run(orderId, concertId);
      db.prepare(
        `INSERT INTO discount_code_usage (id, discount_code_id, order_id, user_email, discount_amount)
         VALUES (?, ?, ?, 'jan@test.nl', 10)`,
      ).run(uuidv4(), id, orderId);

      const zelfde = await controleer({
        code: codeVan(id).code,
        concertId,
        orderTotal: 100,
        buyerEmail: 'jan@test.nl',
      });
      expect(zelfde.body.valid).toBe(false);

      const ander = await controleer({
        code: codeVan(id).code,
        concertId,
        orderTotal: 100,
        buyerEmail: 'piet@test.nl',
      });
      expect(ander.body.valid).toBe(true);
    });

    it('kijkt niet naar een code van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdeId = maakCode({ association_id: andere.id, code: 'VANDEBUREN' });

      const antwoord = await controleer({ code: codeVan(vreemdeId).code, concertId, orderTotal: 100 });
      expect(antwoord.body.valid).toBe(false);
    });
  });
});
