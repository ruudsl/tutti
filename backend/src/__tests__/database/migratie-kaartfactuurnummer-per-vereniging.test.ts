/**
 * Migratie 20261002210000: kaartfactuurnummer per vereniging.
 *
 * Bouwt ticket_invoices opnieuw op zonder `UNIQUE` op het nummer en met een
 * unieke sleutel per vereniging. De factuurregels verwijzen ernaar met
 * ON DELETE CASCADE; die moeten de herbouw heelhuids doorstaan. `down` zet de
 * oude beperking terug, behalve als twee verenigingen al hetzelfde nummer
 * hebben.
 */

import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import { voerUit } from '../../migrations/runner';
import * as migratie from '../../migrations/20261002210000_kaartfactuurnummer_per_vereniging';
import { createTestAssociation } from '../testUtils';

const meta = { version: '20261002210000', name: 'kaartfactuurnummer_per_vereniging', zonderForeignKeys: true };
const omhoog = () => voerUit({ ...meta, up: migratie.up, down: migratie.down }, migratie.up);
const omlaag = () => voerUit({ ...meta, up: migratie.up, down: migratie.down }, migratie.down);

const definitie = () =>
  (db.prepare("SELECT sql FROM sqlite_master WHERE name = 'ticket_invoices'").get() as { sql: string }).sql;

/** Een factuur met één regel voor een nieuwe vereniging. */
function factuur(nummer: string): { factuurId: string; verenigingId: string } {
  const verenigingId = createTestAssociation().id;
  const concertId = uuidv4();
  db.prepare("INSERT INTO concerts (id, association_id, name, date) VALUES (?, ?, 'Concert', '2026-11-07')").run(
    concertId,
    verenigingId,
  );
  const orderId = uuidv4();
  db.prepare(
    "INSERT INTO ticket_orders (id, concert_id, total, status, buyer_name, buyer_email) VALUES (?, ?, 10, 'paid', 'K', 'k@v.nl')",
  ).run(orderId, concertId);
  const factuurId = uuidv4();
  db.prepare(
    `INSERT INTO ticket_invoices (id, order_id, invoice_number, association_id, subtotal, vat_amount, total)
     VALUES (?, ?, ?, ?, 9.17, 0.83, 10)`,
  ).run(factuurId, orderId, nummer, verenigingId);
  db.prepare(
    "INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price, vat_rate, total) VALUES (?, ?, 'Kaart', 1, 10, 9, 10)",
  ).run(uuidv4(), factuurId);
  return { factuurId, verenigingId };
}

const regels = (factuurId: string) =>
  (db.prepare('SELECT COUNT(*) AS n FROM invoice_line_items WHERE invoice_id = ?').get(factuurId) as { n: number }).n;

describe('migratie kaartfactuurnummer per vereniging', () => {
  it('staat na de migraties op een sleutel per vereniging', () => {
    expect(definitie()).not.toMatch(/invoice_number\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'idx_ticket_invoices_nummer_per_vereniging'").get(),
    ).toBeTruthy();
  });

  it('gaat heen en terug zonder facturen of factuurregels kwijt te raken', () => {
    const { factuurId } = factuur('INV-20261002-0001');

    omlaag();
    expect(definitie()).toMatch(/invoice_number\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);
    expect(regels(factuurId)).toBe(1);

    omhoog();
    expect(definitie()).not.toMatch(/invoice_number\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);
    expect(regels(factuurId)).toBe(1);
    expect(db.prepare('SELECT id FROM ticket_invoices WHERE id = ?').get(factuurId)).toBeTruthy();
  });

  it('weigert terug te draaien als twee verenigingen hetzelfde nummer hebben, en laat alles staan', () => {
    const eerste = factuur('INV-20261002-0007');
    const tweede = factuur('INV-20261002-0007');

    expect(() => omlaag()).toThrow(/meer dan één vereniging/);
    expect(definitie()).not.toMatch(/invoice_number\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);
    expect(regels(eerste.factuurId)).toBe(1);
    expect(regels(tweede.factuurId)).toBe(1);
  });

  it('is herhaalbaar', () => {
    omhoog();
    omhoog();
    expect(definitie()).not.toMatch(/invoice_number\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);
  });
});
