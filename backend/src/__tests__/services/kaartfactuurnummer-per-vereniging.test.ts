/**
 * Kaartfacturen: het nummer is uniek per vereniging.
 *
 * services/invoices.ts nummert per vereniging per dag (`INV-20261002-0001`),
 * maar de database eiste één uniek nummer over de hele installatie. De tweede
 * vereniging die op een dag een kaart verkocht, kreeg `UNIQUE constraint
 * failed` en geen factuur (migratie 20261002210000).
 */

import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestAssociation } from '../testUtils';
import { createInvoice } from '../../services/invoices';

/** Een vereniging met een betaalde bestelling; geeft het id van de bestelling. */
function verenigingMetBestelling(): { verenigingId: string; orderId: string } {
  const verenigingId = createTestAssociation().id;
  const concertId = uuidv4();
  testDb
    .prepare("INSERT INTO concerts (id, association_id, name, date, location) VALUES (?, ?, 'Concert', ?, 'Zaal')")
    .run(concertId, verenigingId, '2026-11-07');
  const kaartsoortId = uuidv4();
  testDb
    .prepare("INSERT INTO ticket_types (id, concert_id, name, price, quantity) VALUES (?, ?, 'Regulier', 15, 100)")
    .run(kaartsoortId, concertId);
  const orderId = uuidv4();
  testDb
    .prepare(
      `INSERT INTO ticket_orders (id, concert_id, total, status, buyer_name, buyer_email)
       VALUES (?, ?, 15, 'paid', 'Koper', 'koper@voorbeeld.nl')`,
    )
    .run(orderId, concertId);
  testDb
    .prepare(
      'INSERT INTO ticket_order_items (id, order_id, ticket_type_id, quantity, unit_price) VALUES (?, ?, ?, 1, 15)',
    )
    .run(uuidv4(), orderId, kaartsoortId);
  return { verenigingId, orderId };
}

describe('kaartfactuurnummer per vereniging', () => {
  it('geeft twee verenigingen op dezelfde dag elk hun eerste factuur', async () => {
    const eerste = verenigingMetBestelling();
    const tweede = verenigingMetBestelling();

    const a = await createInvoice(eerste.orderId);
    const b = await createInvoice(tweede.orderId);

    expect(a.invoiceNumber).toMatch(/-0001$/);
    expect(b.invoiceNumber).toBe(a.invoiceNumber);
    expect(a.associationId).toBe(eerste.verenigingId);
    expect(b.associationId).toBe(tweede.verenigingId);
  });

  it('houdt het nummer binnen één vereniging uniek', async () => {
    const { verenigingId, orderId } = verenigingMetBestelling();
    const factuur = await createInvoice(orderId);

    const tweedeOrder = uuidv4();
    testDb
      .prepare(
        `INSERT INTO ticket_orders (id, concert_id, total, status, buyer_name, buyer_email)
         SELECT ?, concert_id, total, status, buyer_name, buyer_email FROM ticket_orders WHERE id = ?`,
      )
      .run(tweedeOrder, orderId);

    expect(() =>
      testDb
        .prepare(
          `INSERT INTO ticket_invoices (id, order_id, invoice_number, association_id, subtotal, vat_amount, total)
           VALUES (?, ?, ?, ?, 0, 0, 0)`,
        )
        .run(uuidv4(), tweedeOrder, factuur.invoiceNumber, verenigingId),
    ).toThrow(/UNIQUE constraint failed/);
  });
});
