/**
 * Een kaartje overdragen aan iemand anders.
 *
 * De hele keten liep stuk op kolomnamen: ticket_transfers heeft
 * recipient_email en recipient_name, niet to_email en to_name, en het
 * afronden schreef naar completed_at terwijl de kolom accepted_at heet. Het
 * bijwerken van het kaartje zette bovendien updated_at, een kolom die tickets
 * niet heeft. Aanmaken, ophalen én afronden faalden dus alle drie.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestEnvironment, TestAssociation } from '../testUtils';
import { initiateTicketTransfer, completeTicketTransfer, cancelTicketTransfer } from '../../services/ticketing';

const VERKOPER = 'verkoper@test.nl';
const KOPER = 'koper@test.nl';

describe('Kaartoverdracht', () => {
  let vereniging: TestAssociation;
  let concertId: string;
  let kaartId: string;

  beforeEach(() => {
    vereniging = createTestEnvironment().association;

    concertId = uuidv4();
    testDb
      .prepare(
        `INSERT INTO concerts (id, association_id, name, date, location)
         VALUES (?, ?, 'Voorjaarsconcert', '2026-04-11', 'De Zalen')`,
      )
      .run(concertId, vereniging.id);

    const soortId = uuidv4();
    testDb
      .prepare('INSERT INTO ticket_types (id, concert_id, name, price, quantity) VALUES (?, ?, ?, 15, 100)')
      .run(soortId, concertId, 'Regulier');

    const bestellingId = uuidv4();
    testDb
      .prepare(
        `INSERT INTO ticket_orders (id, concert_id, total, buyer_name, buyer_email)
         VALUES (?, ?, 15, 'Verkoper', ?)`,
      )
      .run(bestellingId, concertId, VERKOPER);

    kaartId = uuidv4();
    testDb
      .prepare(
        `INSERT INTO tickets (id, ticket_type_id, order_id, buyer_name, buyer_email, status, qr_code)
         VALUES (?, ?, ?, 'Verkoper', ?, 'valid', ?)`,
      )
      .run(kaartId, soortId, bestellingId, VERKOPER, `QR-${uuidv4()}`);
  });

  function kaart(): { buyer_email: string; buyer_name: string; qr_code: string; status: string } {
    return testDb.prepare('SELECT buyer_email, buyer_name, qr_code, status FROM tickets WHERE id = ?').get(kaartId) as {
      buyer_email: string;
      buyer_name: string;
      qr_code: string;
      status: string;
    };
  }

  function overdracht(id: string): { status: string; accepted_at: string | null; recipient_email: string } {
    return testDb.prepare('SELECT status, accepted_at, recipient_email FROM ticket_transfers WHERE id = ?').get(id) as {
      status: string;
      accepted_at: string | null;
      recipient_email: string;
    };
  }

  describe('initiateTicketTransfer', () => {
    it('legt een overdracht vast met een code voor de ontvanger', () => {
      const resultaat = initiateTicketTransfer(kaartId, VERKOPER, KOPER, 'Koper');
      expect(resultaat.success).toBe(true);
      expect(resultaat.transferCode).toBeTruthy();
      expect(overdracht(resultaat.transferId!)).toMatchObject({
        status: 'pending',
        recipient_email: KOPER,
        accepted_at: null,
      });
    });

    it('maakt een overdrachtscode die niet te raden is', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const { transferId, transferCode } = initiateTicketTransfer(kaartId, VERKOPER, KOPER, 'Koper');
        expect(transferCode).toMatch(/^[0-9A-F]{32}$/);
        codes.add(transferCode!);
        cancelTicketTransfer(transferId!);
      }
      expect(codes.size).toBe(20);
    });

    it('staat maar één lopende overdracht per kaartje toe', () => {
      expect(initiateTicketTransfer(kaartId, VERKOPER, KOPER, 'Koper').success).toBe(true);
      expect(initiateTicketTransfer(kaartId, VERKOPER, 'derde@test.nl', 'Derde').success).toBe(false);
    });

    it('weigert een kaartje van iemand anders', () => {
      const resultaat = initiateTicketTransfer(kaartId, 'iemandanders@test.nl', KOPER, 'Koper');
      expect(resultaat.success).toBe(false);
    });

    it('weigert een kaartje dat niet bestaat', () => {
      expect(initiateTicketTransfer(uuidv4(), VERKOPER, KOPER, 'Koper').success).toBe(false);
    });

    it('kijkt niet naar hoofdletters in het e-mailadres van de verkoper', () => {
      expect(initiateTicketTransfer(kaartId, VERKOPER.toUpperCase(), KOPER, 'Koper').success).toBe(true);
    });
  });

  describe('completeTicketTransfer', () => {
    it('zet het kaartje op naam van de ontvanger', () => {
      const { transferCode } = initiateTicketTransfer(kaartId, VERKOPER, KOPER, 'Koper');
      const resultaat = completeTicketTransfer(transferCode!);

      expect(resultaat.success).toBe(true);
      expect(kaart()).toMatchObject({ buyer_email: KOPER, buyer_name: 'Koper' });
    });

    it('geeft het kaartje een nieuwe code, zodat de oude niet meer werkt', () => {
      const oudeCode = kaart().qr_code;
      const { transferCode } = initiateTicketTransfer(kaartId, VERKOPER, KOPER, 'Koper');
      completeTicketTransfer(transferCode!);
      expect(kaart().qr_code).not.toBe(oudeCode);
    });

    it('markeert de overdracht als afgerond met een datum', () => {
      const { transferId, transferCode } = initiateTicketTransfer(kaartId, VERKOPER, KOPER, 'Koper');
      completeTicketTransfer(transferCode!);
      const na = overdracht(transferId!);
      expect(na.status).toBe('completed');
      expect(na.accepted_at).not.toBeNull();
    });

    it('weigert een onbekende code', () => {
      expect(completeTicketTransfer('BESTAAT-NIET').success).toBe(false);
    });

    it('laat dezelfde code geen tweede keer werken', () => {
      const { transferCode } = initiateTicketTransfer(kaartId, VERKOPER, KOPER, 'Koper');
      expect(completeTicketTransfer(transferCode!).success).toBe(true);
      expect(completeTicketTransfer(transferCode!).success).toBe(false);
    });

    it('weigert een verlopen code en noteert dat', () => {
      const { transferId, transferCode } = initiateTicketTransfer(kaartId, VERKOPER, KOPER, 'Koper');
      testDb
        .prepare("UPDATE ticket_transfers SET expires_at = '2020-01-01T00:00:00.000Z' WHERE id = ?")
        .run(transferId);

      expect(completeTicketTransfer(transferCode!).success).toBe(false);
      expect(overdracht(transferId!).status).toBe('expired');
      expect(kaart().buyer_email).toBe(VERKOPER);
    });

    it('weigert een kaartje dat inmiddels is gebruikt', () => {
      const { transferCode } = initiateTicketTransfer(kaartId, VERKOPER, KOPER, 'Koper');
      testDb.prepare("UPDATE tickets SET status = 'used' WHERE id = ?").run(kaartId);

      expect(completeTicketTransfer(transferCode!).success).toBe(false);
      expect(kaart().buyer_email).toBe(VERKOPER);
    });
  });

  describe('cancelTicketTransfer', () => {
    it('trekt een lopende overdracht in', () => {
      const { transferId, transferCode } = initiateTicketTransfer(kaartId, VERKOPER, KOPER, 'Koper');
      cancelTicketTransfer(transferId!);

      expect(overdracht(transferId!).status).toBe('cancelled');
      expect(completeTicketTransfer(transferCode!).success).toBe(false);
    });

    it('weigert een overdracht die al is afgerond', () => {
      const { transferId, transferCode } = initiateTicketTransfer(kaartId, VERKOPER, KOPER, 'Koper');
      completeTicketTransfer(transferCode!);
      expect(() => cancelTicketTransfer(transferId!)).toThrow(/not found or already processed/);
    });

    it('weigert een overdracht die niet bestaat', () => {
      expect(() => cancelTicketTransfer(uuidv4())).toThrow(/not found or already processed/);
    });
  });
});
