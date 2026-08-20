/**
 * Facturen voor kaartbestellingen.
 *
 * Bij het afrekenen geldt total = som(prijs x aantal) + servicekosten; er komt
 * geen btw bovenop. De kaartprijs is dus de prijs inclusief btw, zoals
 * gebruikelijk bij consumentenverkoop. Een factuur moet daarom hetzelfde
 * bedrag noemen als er is afgerekend, met de btw eruit gerekend in plaats van
 * erbovenop geteld.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestAssociation, createTestEnvironment, TestAssociation } from '../testUtils';
import {
  generateInvoiceNumber,
  createInvoice,
  getInvoice,
  getInvoiceByOrder,
  getInvoicesByAssociation,
  getInvoicesByBuyerEmail,
  updateInvoiceStatus,
  cancelInvoice,
} from '../../services/invoices';

const BTW = 0.09;

describe('facturen', () => {
  let vereniging: TestAssociation;
  let concertId: string;
  let kaartsoortId: string;

  function maakBestelling(
    opties: {
      aantal?: number;
      stukprijs?: number;
      servicekosten?: number;
      status?: string;
      email?: string;
    } = {},
  ): string {
    const aantal = opties.aantal ?? 2;
    const stukprijs = opties.stukprijs ?? 21.8;
    const totaal = aantal * stukprijs + (opties.servicekosten ?? 0);

    const orderId = uuidv4();
    testDb
      .prepare(
        `INSERT INTO ticket_orders (id, concert_id, total, status, buyer_name, buyer_email)
         VALUES (?, ?, ?, ?, 'Jan Jansen', ?)`,
      )
      .run(orderId, concertId, totaal, opties.status ?? 'paid', opties.email ?? 'jan@test.nl');

    testDb
      .prepare(
        'INSERT INTO ticket_order_items (id, order_id, ticket_type_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?)',
      )
      .run(uuidv4(), orderId, kaartsoortId, aantal, stukprijs);

    return orderId;
  }

  beforeEach(() => {
    vereniging = createTestEnvironment().association;

    concertId = uuidv4();
    testDb
      .prepare("INSERT INTO concerts (id, association_id, name, date, location) VALUES (?, ?, 'Najaarsconcert', ?, ?)")
      .run(concertId, vereniging.id, '2026-11-07', 'De Zalen');

    kaartsoortId = uuidv4();
    testDb
      .prepare("INSERT INTO ticket_types (id, concert_id, name, price, quantity) VALUES (?, ?, 'Regulier', 21.8, 100)")
      .run(kaartsoortId, concertId);
  });

  describe('generateInvoiceNumber', () => {
    it('heeft de vorm INV-JJJJMMDD-NNNN', () => {
      expect(generateInvoiceNumber(vereniging.id)).toMatch(/^INV-\d{8}-\d{4}$/);
    });

    it('begint bij 0001 voor een vereniging zonder facturen vandaag', () => {
      expect(generateInvoiceNumber(createTestAssociation().id)).toMatch(/-0001$/);
    });

    it('zet de datum van vandaag in het nummer', () => {
      const vandaag = new Date().toISOString().split('T')[0].replace(/-/g, '');
      expect(generateInvoiceNumber(vereniging.id)).toContain(`INV-${vandaag}-`);
    });
  });

  describe('createInvoice', () => {
    it('noemt hetzelfde bedrag als er is afgerekend', async () => {
      // Dit is de kern: een factuur die een ander bedrag noemt dan de koper
      // heeft betaald, klopt niet, wat er verder ook in staat.
      const orderId = maakBestelling({ aantal: 2, stukprijs: 21.8 });
      const factuur = await createInvoice(orderId);
      expect(factuur.total).toBeCloseTo(43.6, 2);
    });

    it('rekent de btw uit het bedrag in plaats van erbovenop', async () => {
      const orderId = maakBestelling({ aantal: 2, stukprijs: 21.8 });
      const factuur = await createInvoice(orderId);

      expect(factuur.subtotal + factuur.vatAmount).toBeCloseTo(43.6, 2);
      expect(factuur.vatAmount).toBeCloseTo(43.6 - 43.6 / (1 + BTW), 2);
    });

    it('laat de onderdelen optellen tot het totaal', async () => {
      const orderId = maakBestelling({ aantal: 3, stukprijs: 15, servicekosten: 2.5 });
      const factuur = await createInvoice(orderId);

      const som = factuur.subtotal + factuur.vatAmount + factuur.serviceFee + factuur.serviceFeeVat;
      expect(som).toBeCloseTo(factuur.total, 2);
      expect(factuur.total).toBeCloseTo(47.5, 2);
    });

    it('haalt de servicekosten uit het verschil met het kaartbedrag', async () => {
      const orderId = maakBestelling({ aantal: 2, stukprijs: 20, servicekosten: 3 });
      const factuur = await createInvoice(orderId);

      expect(factuur.serviceFee + factuur.serviceFeeVat).toBeCloseTo(3, 2);
    });

    it('rekent geen servicekosten wanneer die er niet zijn', async () => {
      const factuur = await createInvoice(maakBestelling({ servicekosten: 0 }));
      expect(factuur.serviceFee).toBe(0);
      expect(factuur.serviceFeeVat).toBe(0);
    });

    it('neemt de gegevens van bestelling en concert over', async () => {
      const factuur = await createInvoice(maakBestelling());
      expect(factuur).toMatchObject({
        associationId: vereniging.id,
        concertId,
        concertName: 'Najaarsconcert',
        buyerName: 'Jan Jansen',
        buyerEmail: 'jan@test.nl',
      });
    });

    it('zet een regel per kaartsoort met het aantal erbij', async () => {
      const factuur = await createInvoice(maakBestelling({ aantal: 4, stukprijs: 10 }));
      expect(factuur.lineItems).toHaveLength(1);
      expect(factuur.lineItems[0]).toMatchObject({ description: 'Regulier', quantity: 4, vatRate: BTW });
    });

    it('laat de regelbedragen optellen tot het kaartbedrag', async () => {
      const factuur = await createInvoice(maakBestelling({ aantal: 4, stukprijs: 10 }));
      const regel = factuur.lineItems[0];
      expect(regel.totalPrice + regel.vatAmount).toBeCloseTo(40, 2);
    });

    it('markeert een betaalde bestelling als betaald', async () => {
      expect((await createInvoice(maakBestelling({ status: 'paid' }))).status).toBe('paid');
    });

    it('markeert een openstaande bestelling als verstuurd', async () => {
      expect((await createInvoice(maakBestelling({ status: 'pending' }))).status).toBe('issued');
    });

    it('geeft de bestaande factuur terug bij een tweede aanroep', async () => {
      const orderId = maakBestelling();
      const eerste = await createInvoice(orderId);
      const tweede = await createInvoice(orderId);
      expect(tweede.id).toBe(eerste.id);
      expect(tweede.invoiceNumber).toBe(eerste.invoiceNumber);
    });

    it('geeft een vervaldatum veertien dagen later', async () => {
      const factuur = await createInvoice(maakBestelling());
      const dagen = (new Date(factuur.dueDate).getTime() - new Date(factuur.issuedAt).getTime()) / 86_400_000;
      expect(Math.round(dagen)).toBe(14);
    });

    it('neemt de bedrijfsgegevens over wanneer die worden meegegeven', async () => {
      const factuur = await createInvoice(maakBestelling(), {
        companyName: 'Muziekhandel Bakker',
        vatNumber: 'NL123456789B01',
        address: 'Kerkstraat 1',
        postalCode: '1234 AB',
        city: 'Utrecht',
      });
      expect(factuur.businessDetails?.companyName).toBe('Muziekhandel Bakker');
    });

    it('weigert een bestelling die niet bestaat', async () => {
      await expect(createInvoice(uuidv4())).rejects.toThrow(/Order not found/);
    });

    it('weigert een bestelling zonder regels', async () => {
      const orderId = uuidv4();
      testDb
        .prepare(
          `INSERT INTO ticket_orders (id, concert_id, total, status, buyer_name, buyer_email)
           VALUES (?, ?, 50, 'paid', 'Jan', 'jan@test.nl')`,
        )
        .run(orderId, concertId);

      await expect(createInvoice(orderId)).rejects.toThrow(/No items found/);
    });
  });

  describe('opzoeken', () => {
    it('vindt een factuur op nummer en op bestelling', async () => {
      const orderId = maakBestelling();
      const factuur = await createInvoice(orderId);

      expect(getInvoice(factuur.id)?.id).toBe(factuur.id);
      expect(getInvoiceByOrder(orderId)?.id).toBe(factuur.id);
    });

    it('geeft null voor iets dat niet bestaat', () => {
      expect(getInvoice(uuidv4())).toBeNull();
      expect(getInvoiceByOrder(uuidv4())).toBeNull();
    });

    it('vindt de facturen van een vereniging', async () => {
      await createInvoice(maakBestelling());
      const facturen = getInvoicesByAssociation(vereniging.id);
      expect(facturen.length).toBeGreaterThanOrEqual(1);
      expect(facturen.every((f) => f.associationId === vereniging.id)).toBe(true);
    });

    it('vindt de facturen van een koper, ongeacht hoofdletters', async () => {
      const email = `koper-${uuidv4()}@test.nl`;
      await createInvoice(maakBestelling({ email }));
      expect(getInvoicesByBuyerEmail(email.toUpperCase()).length).toBe(1);
    });
  });

  describe('bewaren', () => {
    it('zet de factuur in de database in plaats van in het geheugen', async () => {
      // De service hield facturen eerst in een Map bij; die was bij elke
      // herstart leeg. Een factuur is een bewaarplichtig document.
      const factuur = await createInvoice(maakBestelling());

      const rij = testDb
        .prepare('SELECT invoice_number, total, status, association_id FROM ticket_invoices WHERE id = ?')
        .get(factuur.id) as { invoice_number: string; total: number; status: string; association_id: string };

      expect(rij).toMatchObject({
        invoice_number: factuur.invoiceNumber,
        status: factuur.status,
        association_id: vereniging.id,
      });
      expect(rij.total).toBeCloseTo(factuur.total, 2);
    });

    it('bewaart de regels bij de factuur', async () => {
      const factuur = await createInvoice(maakBestelling({ aantal: 3, stukprijs: 12 }));

      const regels = testDb
        .prepare('SELECT description, quantity, total, vat_amount FROM invoice_line_items WHERE invoice_id = ?')
        .all(factuur.id) as Array<{ description: string; quantity: number; total: number; vat_amount: number }>;

      expect(regels).toHaveLength(1);
      expect(regels[0]).toMatchObject({ description: 'Regulier', quantity: 3 });
      expect(regels[0].total + regels[0].vat_amount).toBeCloseTo(36, 2);
    });

    it('geeft na opnieuw inlezen dezelfde bedragen terug', async () => {
      const factuur = await createInvoice(maakBestelling({ aantal: 2, stukprijs: 21.8, servicekosten: 1.5 }));
      const opnieuw = getInvoice(factuur.id)!;

      expect(opnieuw.total).toBeCloseTo(factuur.total, 2);
      expect(opnieuw.subtotal).toBeCloseTo(factuur.subtotal, 2);
      expect(opnieuw.vatAmount).toBeCloseTo(factuur.vatAmount, 2);
      expect(opnieuw.vatRate).toBeCloseTo(BTW, 4);
      expect(opnieuw.lineItems).toHaveLength(factuur.lineItems.length);
    });

    it('bewaart de bedrijfsgegevens en leest ze terug', async () => {
      const factuur = await createInvoice(maakBestelling(), {
        companyName: 'Muziekhandel Bakker',
        vatNumber: 'NL123456789B01',
        address: 'Kerkstraat 1',
        postalCode: '1234 AB',
        city: 'Utrecht',
      });

      expect(getInvoice(factuur.id)?.businessDetails).toMatchObject({
        companyName: 'Muziekhandel Bakker',
        vatNumber: 'NL123456789B01',
        city: 'Utrecht',
      });
    });

    it('laat geen tweede factuur voor dezelfde bestelling toe', async () => {
      const orderId = maakBestelling();
      await createInvoice(orderId);
      await createInvoice(orderId);

      const rij = testDb.prepare('SELECT COUNT(*) AS n FROM ticket_invoices WHERE order_id = ?').get(orderId) as {
        n: number;
      };
      expect(rij.n).toBe(1);
    });
  });

  describe('status wijzigen', () => {
    it('werkt de status bij', async () => {
      const factuur = await createInvoice(maakBestelling({ status: 'pending' }));
      expect(updateInvoiceStatus(factuur.id, 'paid')?.status).toBe('paid');
      expect(getInvoice(factuur.id)?.status).toBe('paid');
    });

    it('geeft null voor een factuur die niet bestaat', () => {
      expect(updateInvoiceStatus(uuidv4(), 'paid')).toBeNull();
    });

    it('trekt een openstaande factuur in', async () => {
      const factuur = await createInvoice(maakBestelling({ status: 'pending' }));
      expect(cancelInvoice(factuur.id)?.status).toBe('cancelled');
    });

    it('weigert een betaalde factuur in te trekken', async () => {
      const factuur = await createInvoice(maakBestelling({ status: 'paid' }));
      expect(() => cancelInvoice(factuur.id)).toThrow(/Cannot cancel a paid invoice/);
    });

    it('geeft null bij het intrekken van iets dat niet bestaat', () => {
      expect(cancelInvoice(uuidv4())).toBeNull();
    });
  });
});
