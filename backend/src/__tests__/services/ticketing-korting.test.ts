/**
 * Tests for the group discounts in services/ticketing. Kortingscodes staan in
 * services/kortingscodes.ts en hebben hun eigen test (kortingscodes.test.ts).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestEnvironment, TestAssociation } from '../testUtils';
import { calculateGroupDiscount } from '../../services/ticketing';

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
});
