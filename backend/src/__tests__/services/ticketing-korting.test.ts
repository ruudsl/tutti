/**
 * Tests for the discount logic in services/ticketing: group discounts,
 * discount-code validation and applying a code to an order.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestEnvironment, TestAssociation } from '../testUtils';
import { calculateGroupDiscount, validateDiscountCode, applyDiscountCode } from '../../services/ticketing';

function maakConcert(associationId: string): string {
  const id = uuidv4();
  testDb
    .prepare(
      `INSERT INTO concerts (id, association_id, name, date, location)
       VALUES (?, ?, 'Nieuwjaarsconcert', '2026-01-10', 'De Zalen')`,
    )
    .run(id, associationId);
  return id;
}

function maakBestelling(concertId: string): string {
  const id = uuidv4();
  testDb
    .prepare(
      `INSERT INTO ticket_orders (id, concert_id, total, buyer_name, buyer_email)
       VALUES (?, ?, 100, 'Test Koper', 'lid@test.nl')`,
    )
    .run(id, concertId);
  return id;
}

function maakKaartsoort(concertId: string, prijs: number): string {
  const id = uuidv4();
  testDb
    .prepare('INSERT INTO ticket_types (id, concert_id, name, price, quantity) VALUES (?, ?, ?, ?, ?)')
    .run(id, concertId, 'Regulier', prijs, 100);
  return id;
}

describe('ticketing: kortingen', () => {
  let vereniging: TestAssociation;
  let concertId: string;

  beforeEach(() => {
    vereniging = createTestEnvironment().association;
    concertId = maakConcert(vereniging.id);
  });

  describe('calculateGroupDiscount', () => {
    it('geeft geen korting onder de laagste drempel', () => {
      const kaartsoort = maakKaartsoort(concertId, 10);
      expect(calculateGroupDiscount(kaartsoort, 4)).toEqual({ discountAmount: 0, finalPrice: 40 });
    });

    it('past de staffels 5, 10 en 20 toe', () => {
      const kaartsoort = maakKaartsoort(concertId, 10);
      expect(calculateGroupDiscount(kaartsoort, 5)).toEqual({ discountAmount: 2.5, finalPrice: 47.5 });
      expect(calculateGroupDiscount(kaartsoort, 10)).toEqual({ discountAmount: 10, finalPrice: 90 });
      expect(calculateGroupDiscount(kaartsoort, 20)).toEqual({ discountAmount: 30, finalPrice: 170 });
    });

    it('gebruikt de hoogste staffel waar het aantal aan voldoet', () => {
      const kaartsoort = maakKaartsoort(concertId, 10);
      // 25 kaarten haalt alle drie de drempels; 15% moet winnen.
      expect(calculateGroupDiscount(kaartsoort, 25).discountAmount).toBe(37.5);
    });

    it('geeft nul terug voor een onbekende kaartsoort', () => {
      expect(calculateGroupDiscount(uuidv4(), 10)).toEqual({ discountAmount: 0, finalPrice: 0 });
    });
  });

  describe('validateDiscountCode', () => {
    function maakKortingscode(overrides: Record<string, unknown> = {}): string {
      const id = uuidv4();
      const waarden = {
        code: 'LENTE10',
        discount_type: 'percentage',
        discount_value: 10,
        min_order_amount: 0,
        max_uses: null,
        uses_count: 0,
        valid_from: null,
        valid_until: null,
        concert_ids: null,
        is_active: 1,
        ...overrides,
      };
      testDb
        .prepare(
          `INSERT INTO discount_codes
             (id, association_id, code, discount_type, discount_value, min_order_amount,
              max_uses, uses_count, valid_from, valid_until, concert_ids, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          vereniging.id,
          waarden.code,
          waarden.discount_type,
          waarden.discount_value,
          waarden.min_order_amount,
          waarden.max_uses,
          waarden.uses_count,
          waarden.valid_from,
          waarden.valid_until,
          waarden.concert_ids,
          waarden.is_active,
        );
      return id;
    }

    it('rekent een procentuele korting uit', () => {
      maakKortingscode({ discount_type: 'percentage', discount_value: 10 });
      const resultaat = validateDiscountCode('LENTE10', vereniging.id, concertId, 100, 'lid@test.nl');
      expect(resultaat.valid).toBe(true);
      expect(resultaat.discountAmount).toBe(10);
    });

    it('rekent een vast bedrag af', () => {
      maakKortingscode({ code: 'VIJFEURO', discount_type: 'fixed_amount', discount_value: 5 });
      const resultaat = validateDiscountCode('VIJFEURO', vereniging.id, concertId, 100, 'lid@test.nl');
      expect(resultaat.valid).toBe(true);
      expect(resultaat.discountAmount).toBe(5);
    });

    it('laat de korting nooit boven het ordertotaal uitkomen', () => {
      maakKortingscode({ code: 'HONDERD', discount_type: 'fixed_amount', discount_value: 100 });
      expect(validateDiscountCode('HONDERD', vereniging.id, concertId, 20, 'lid@test.nl').discountAmount).toBe(20);
    });

    it('herkent de code ongeacht hoofdlettergebruik', () => {
      maakKortingscode();
      expect(validateDiscountCode('lente10', vereniging.id, concertId, 100, 'lid@test.nl').valid).toBe(true);
    });

    it('weigert een onbekende code', () => {
      const resultaat = validateDiscountCode('BESTAATNIET', vereniging.id, concertId, 100, 'lid@test.nl');
      expect(resultaat).toMatchObject({ valid: false, discountAmount: 0 });
    });

    it('weigert een code van een andere vereniging', () => {
      maakKortingscode();
      expect(validateDiscountCode('LENTE10', uuidv4(), concertId, 100, 'lid@test.nl').valid).toBe(false);
    });

    it('weigert een uitgeschakelde code', () => {
      maakKortingscode({ is_active: 0 });
      expect(validateDiscountCode('LENTE10', vereniging.id, concertId, 100, 'lid@test.nl').valid).toBe(false);
    });

    it('weigert een code die zijn maximum aantal keer is gebruikt', () => {
      maakKortingscode({ max_uses: 3, uses_count: 3 });
      expect(validateDiscountCode('LENTE10', vereniging.id, concertId, 100, 'lid@test.nl').valid).toBe(false);
    });

    it('accepteert een code die zijn maximum nog niet heeft bereikt', () => {
      maakKortingscode({ max_uses: 3, uses_count: 2 });
      expect(validateDiscountCode('LENTE10', vereniging.id, concertId, 100, 'lid@test.nl').valid).toBe(true);
    });

    it('weigert een code die nog niet geldig is', () => {
      maakKortingscode({ valid_from: '2099-01-01T00:00:00.000Z' });
      expect(validateDiscountCode('LENTE10', vereniging.id, concertId, 100, 'lid@test.nl').valid).toBe(false);
    });

    it('weigert een verlopen code', () => {
      maakKortingscode({ valid_until: '2020-01-01T00:00:00.000Z' });
      expect(validateDiscountCode('LENTE10', vereniging.id, concertId, 100, 'lid@test.nl').valid).toBe(false);
    });

    it('weigert een order onder het minimumbedrag', () => {
      maakKortingscode({ min_order_amount: 50 });
      expect(validateDiscountCode('LENTE10', vereniging.id, concertId, 20, 'lid@test.nl').valid).toBe(false);
      expect(validateDiscountCode('LENTE10', vereniging.id, concertId, 50, 'lid@test.nl').valid).toBe(true);
    });

    it('weigert een code die aan een ander concert is gebonden', () => {
      const anderConcert = maakConcert(vereniging.id);
      maakKortingscode({ concert_ids: JSON.stringify([anderConcert]) });
      expect(validateDiscountCode('LENTE10', vereniging.id, concertId, 100, 'lid@test.nl').valid).toBe(false);
      expect(validateDiscountCode('LENTE10', vereniging.id, anderConcert, 100, 'lid@test.nl').valid).toBe(true);
    });
  });

  describe('applyDiscountCode', () => {
    it('telt het gebruik op en legt het vast', () => {
      const id = uuidv4();
      testDb
        .prepare(
          `INSERT INTO discount_codes (id, association_id, code, discount_type, discount_value, uses_count)
           VALUES (?, ?, 'LENTE10', 'percentage', 10, 0)`,
        )
        .run(id, vereniging.id);

      const orderId = maakBestelling(concertId);
      applyDiscountCode(id, orderId, 'lid@test.nl', 10);

      const na = testDb.prepare('SELECT uses_count FROM discount_codes WHERE id = ?').get(id) as {
        uses_count: number;
      };
      expect(na.uses_count).toBe(1);

      const gebruik = testDb
        .prepare('SELECT discount_code_id, user_email, discount_amount FROM discount_code_usage WHERE order_id = ?')
        .get(orderId) as { discount_code_id: string; user_email: string; discount_amount: number };
      expect(gebruik).toMatchObject({ discount_code_id: id, user_email: 'lid@test.nl', discount_amount: 10 });
    });
  });
});
