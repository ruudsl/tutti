/**
 * Zaalindelingen en de stoelen van een concert.
 *
 * 993 regels zonder test, en het gaat over kaartverkoop: als hier iets
 * misgaat verkoopt de vereniging dezelfde stoel twee keer, of verdwijnt een
 * stoel die al verkocht is. Daar liggen de zwaartepunten van deze tests:
 * dezelfde stoel raakt niet twee keer gereserveerd, een verlopen reservering
 * geeft de stoel weer vrij, een indeling die aan een concert hangt kan niet
 * zomaar weg, en een stoel met een reservering wordt niet stilletjes
 * weggegooid.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import venueLayoutsRoutes, { concertSeatsRouter } from '../../routes/venue-layouts';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/venue-layouts', venueLayoutsRoutes);
app.use('/api', concertSeatsRouter);
app.use(errorHandler);

/** Een kleine indeling: één vak, één rij, twee stoelen. */
function indelingGegevens(aantalStoelen = 2) {
  return {
    width: 100,
    height: 80,
    sections: [
      {
        id: 'vak-a',
        name: 'Vak A',
        x: 10,
        y: 20,
        rows: [
          {
            name: 'Rij 1',
            seats: Array.from({ length: aantalStoelen }, (_, i) => ({
              number: String(i + 1),
              type: 'regular' as const,
              x: i * 5,
              y: 0,
              priceCategory: 'standard',
            })),
          },
        ],
      },
    ],
  };
}

describe('zaalindelingen', () => {
  let vereniging: TestAssociation;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
  });

  type Methode = 'get' | 'post' | 'put' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](pad).set('Authorization', `Bearer ${token}`);
  const alsBeheerder = (methode: Methode, pad: string) => als(beheerderToken, methode, pad);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  async function maakIndeling(naam = 'Grote Zaal', stoelen = 2): Promise<string> {
    const antwoord = await alsBeheerder('post', '/api/venue-layouts').send({
      name: naam,
      description: 'Testzaal',
      layoutData: indelingGegevens(stoelen),
    });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    return antwoord.body.id;
  }

  function maakConcert(layoutId: string | null, opties: { gestoeld?: boolean; associationId?: string } = {}): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO concerts (id, association_id, name, date, venue_layout_id, is_seated_event)
       VALUES (?, ?, 'Nieuwjaarsconcert', '2026-12-31', ?, ?)`,
    ).run(id, opties.associationId ?? vereniging.id, layoutId, opties.gestoeld === false ? 0 : 1);
    return id;
  }

  /** Een bestelling om stoelen aan te hangen; concert_seat_reservations.order_id verwijst ernaar. */
  function maakBestelling(concertId: string): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO ticket_orders (id, concert_id, total, buyer_name, buyer_email)
       VALUES (?, ?, 0, 'Test Koper', 'koper@test.nl')`,
    ).run(id, concertId);
    return id;
  }

  function stoelenVan(layoutId: string): { id: string; row_name: string; seat_number: string }[] {
    return db
      .prepare('SELECT id, row_name, seat_number FROM venue_seats WHERE layout_id = ? ORDER BY seat_number')
      .all(layoutId) as { id: string; row_name: string; seat_number: string }[];
  }

  describe('overzicht en aanmaken', () => {
    it('begint met een lege lijst', async () => {
      const antwoord = await alsLid('get', '/api/venue-layouts');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.layouts).toEqual([]);
    });

    it('maakt een indeling en rekent de capaciteit uit', async () => {
      const antwoord = await alsBeheerder('post', '/api/venue-layouts').send({
        name: 'Grote Zaal',
        layoutData: indelingGegevens(4),
      });

      expect(antwoord.status).toBe(201);
      expect(antwoord.body.capacity).toBe(4);
    });

    it('legt elke stoel afzonderlijk vast', async () => {
      const id = await maakIndeling('Zaal', 3);
      expect(stoelenVan(id)).toHaveLength(3);
    });

    it('telt de positie van het vak bij die van de stoel op', async () => {
      const id = await maakIndeling('Zaal', 1);
      const stoel = db.prepare('SELECT x_position, y_position FROM venue_seats WHERE layout_id = ?').get(id) as {
        x_position: number;
        y_position: number;
      };
      // vak op (10, 20), stoel op (0, 0) binnen het vak
      expect(stoel).toMatchObject({ x_position: 10, y_position: 20 });
    });

    it('weigert een indeling zonder naam', async () => {
      const antwoord = await alsBeheerder('post', '/api/venue-layouts').send({ layoutData: indelingGegevens() });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een zaal zonder afmetingen', async () => {
      const antwoord = await alsBeheerder('post', '/api/venue-layouts').send({
        name: 'Zaal',
        layoutData: { width: 0, height: 80, sections: [] },
      });
      expect(antwoord.status).toBe(400);
    });

    it('houdt een gewoon lid van het aanmaken af', async () => {
      const antwoord = await alsLid('post', '/api/venue-layouts').send({
        name: 'Zaal',
        layoutData: indelingGegevens(),
      });
      expect(antwoord.status).toBe(403);
    });

    it('toont de indelingen van een andere vereniging niet', async () => {
      await maakIndeling('Eigen zaal');
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      db.prepare(
        'INSERT INTO venue_layouts (id, association_id, name, layout_data, capacity) VALUES (?, ?, ?, ?, 0)',
      ).run(uuidv4(), andere.id, 'Zaal van de buren', '{}');

      const antwoord = await alsLid('get', '/api/venue-layouts');
      expect(antwoord.body.layouts.map((l: { name: string }) => l.name)).toEqual(['Eigen zaal']);
    });
  });

  describe('een indeling opvragen', () => {
    it('geeft de indeling met haar stoelen', async () => {
      const id = await maakIndeling('Zaal', 2);

      const antwoord = await alsLid('get', `/api/venue-layouts/${id}`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.name).toBe('Zaal');
      expect(antwoord.body.layoutData.sections).toHaveLength(1);
      expect(antwoord.body.seats).toHaveLength(2);
      expect(antwoord.body.seats[0]).toMatchObject({ section: 'Vak A', rowName: 'Rij 1', isAvailable: true });
    });

    it('geeft 404 voor een indeling van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = uuidv4();
      db.prepare(
        'INSERT INTO venue_layouts (id, association_id, name, layout_data, capacity) VALUES (?, ?, ?, ?, 0)',
      ).run(vreemd, andere.id, 'Van de buren', '{}');

      expect((await alsLid('get', `/api/venue-layouts/${vreemd}`)).status).toBe(404);
    });
  });

  describe('bijwerken', () => {
    it('werkt alleen de naam bij en laat de stoelen staan', async () => {
      const id = await maakIndeling('Oude naam', 2);

      const antwoord = await alsBeheerder('put', `/api/venue-layouts/${id}`).send({ name: 'Nieuwe naam' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const na = await alsLid('get', `/api/venue-layouts/${id}`);
      expect(na.body.name).toBe('Nieuwe naam');
      expect(na.body.seats).toHaveLength(2);
    });

    it('bouwt de stoelen opnieuw op als de indeling verandert', async () => {
      const id = await maakIndeling('Zaal', 2);

      await alsBeheerder('put', `/api/venue-layouts/${id}`).send({ layoutData: indelingGegevens(5) });

      const na = await alsLid('get', `/api/venue-layouts/${id}`);
      expect(na.body.seats).toHaveLength(5);
      expect(na.body.capacity).toBe(5);
    });

    it('waarschuwt als de indeling aan een concert hangt', async () => {
      const id = await maakIndeling('Zaal', 2);
      maakConcert(id);

      const antwoord = await alsBeheerder('put', `/api/venue-layouts/${id}`).send({
        layoutData: indelingGegevens(3),
      });

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.inUseWarning).toContain('Nieuwjaarsconcert');
    });

    it('weigert een indeling van een andere vereniging bij te werken', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = uuidv4();
      db.prepare(
        'INSERT INTO venue_layouts (id, association_id, name, layout_data, capacity) VALUES (?, ?, ?, ?, 0)',
      ).run(vreemd, andere.id, 'Van de buren', '{}');

      expect((await alsBeheerder('put', `/api/venue-layouts/${vreemd}`).send({ name: 'Gekaapt' })).status).toBe(404);
    });

    it('houdt een gewoon lid van het bijwerken af', async () => {
      const id = await maakIndeling();
      expect((await alsLid('put', `/api/venue-layouts/${id}`).send({ name: 'Anders' })).status).toBe(403);
    });

    // De indeling werd bij elke wijziging van layoutData compleet opnieuw
    // opgebouwd: alle stoelen weg, daarna nieuwe rijen met nieuwe id's. De
    // reserveringen hangen met ON DELETE CASCADE aan venue_seats, dus die
    // gingen stilzwijgend mee. Een vak verschuiven tijdens een lopende
    // kaartverkoop wiste zo de hele verkoop, zonder melding en zonder dat het
    // antwoord er iets over zei. De bulkroute hiernaast weigerde datzelfde al
    // met een 409; alleen deze route deed het toch.
    it('houdt een verkochte stoel overeind als de indeling wordt bijgewerkt', async () => {
      const id = await maakIndeling('Zaal', 2);
      const concertId = maakConcert(id);
      const [, tweede] = stoelenVan(id);
      db.prepare(
        `INSERT INTO concert_seat_reservations (id, concert_id, seat_id, status) VALUES (?, ?, ?, 'sold')`,
      ).run(uuidv4(), concertId, tweede.id);

      const antwoord = await alsBeheerder('put', `/api/venue-layouts/${id}`).send({
        layoutData: indelingGegevens(3),
      });

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const reserveringen = db
        .prepare('SELECT seat_id FROM concert_seat_reservations WHERE concert_id = ?')
        .all(concertId) as { seat_id: string }[];
      expect(reserveringen.map((r) => r.seat_id)).toEqual([tweede.id]);
      expect(stoelenVan(id)).toHaveLength(3);
    });

    it('weigert een stoel met een reservering uit de indeling te halen', async () => {
      const id = await maakIndeling('Zaal', 3);
      const concertId = maakConcert(id);
      const stoelen = stoelenVan(id);
      const derde = stoelen.find((s) => s.seat_number === '3')!;
      db.prepare(
        `INSERT INTO concert_seat_reservations (id, concert_id, seat_id, status, reservation_expires_at)
         VALUES (?, ?, ?, 'reserved', '2099-01-01T00:00:00.000Z')`,
      ).run(uuidv4(), concertId, derde.id);

      const antwoord = await alsBeheerder('put', `/api/venue-layouts/${id}`).send({
        layoutData: indelingGegevens(2),
      });

      expect(antwoord.status).toBe(409);
      expect(stoelenVan(id)).toHaveLength(3);
      expect(
        db.prepare('SELECT COUNT(*) as aantal FROM concert_seat_reservations WHERE concert_id = ?').get(concertId),
      ).toMatchObject({ aantal: 1 });
    });

    it('laat een stoel zonder reservering wel verdwijnen', async () => {
      // De bewaking hierboven mag geen slot op de deur worden: een indeling
      // waar niets voor verkocht is moet gewoon kleiner kunnen.
      const id = await maakIndeling('Zaal', 3);

      const antwoord = await alsBeheerder('put', `/api/venue-layouts/${id}`).send({
        layoutData: indelingGegevens(1),
      });

      expect(antwoord.status).toBe(200);
      expect(stoelenVan(id)).toHaveLength(1);
      expect(db.prepare('SELECT capacity FROM venue_layouts WHERE id = ?').get(id)).toMatchObject({ capacity: 1 });
    });
  });

  describe('verwijderen', () => {
    it('verwijdert een indeling met haar stoelen', async () => {
      const id = await maakIndeling('Weg hiermee', 2);

      expect((await alsBeheerder('delete', `/api/venue-layouts/${id}`)).status).toBe(200);
      expect(stoelenVan(id)).toEqual([]);
    });

    it('verwijdert geen indeling die aan een concert hangt', async () => {
      const id = await maakIndeling('Zaal', 2);
      maakConcert(id);

      const antwoord = await alsBeheerder('delete', `/api/venue-layouts/${id}`);
      expect(antwoord.status).toBe(409);
      expect(antwoord.body.error).toContain('Nieuwjaarsconcert');
      expect(db.prepare('SELECT id FROM venue_layouts WHERE id = ?').get(id)).toBeDefined();
    });

    it('laat verwijderen alleen aan een beheerder over', async () => {
      const id = await maakIndeling();
      expect((await alsLid('delete', `/api/venue-layouts/${id}`)).status).toBe(403);
    });
  });

  describe('stoelen in bulk', () => {
    it('voegt stoelen toe en werkt de capaciteit bij', async () => {
      const id = await maakIndeling('Zaal', 1);

      const antwoord = await alsBeheerder('post', `/api/venue-layouts/${id}/seats`).send({
        seats: [
          { section: 'Vak B', rowName: 'Rij 1', seatNumber: '1', xPosition: 0, yPosition: 0 },
          { section: 'Vak B', rowName: 'Rij 1', seatNumber: '2', xPosition: 5, yPosition: 0 },
        ],
      });

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.created).toBe(2);
      expect(antwoord.body.totalSeats).toBe(3);

      const capaciteit = db.prepare('SELECT capacity FROM venue_layouts WHERE id = ?').get(id) as { capacity: number };
      expect(capaciteit.capacity).toBe(3);
    });

    it('werkt een bestaande stoel bij in plaats van er een tweede te maken', async () => {
      const id = await maakIndeling('Zaal', 1);
      const [stoel] = stoelenVan(id);

      const antwoord = await alsBeheerder('post', `/api/venue-layouts/${id}/seats`).send({
        seats: [
          {
            id: stoel.id,
            section: 'Vak A',
            rowName: 'Rij 1',
            seatNumber: '1',
            seatType: 'wheelchair',
            xPosition: 99,
            yPosition: 0,
          },
        ],
      });

      expect(antwoord.body.updated).toBe(1);
      expect(antwoord.body.created).toBe(0);
      const na = db.prepare('SELECT seat_type, x_position FROM venue_seats WHERE id = ?').get(stoel.id) as {
        seat_type: string;
        x_position: number;
      };
      expect(na).toMatchObject({ seat_type: 'wheelchair', x_position: 99 });
    });

    it('ruimt de overgebleven stoelen op als daarom wordt gevraagd', async () => {
      const id = await maakIndeling('Zaal', 3);
      const [eerste] = stoelenVan(id);

      const antwoord = await alsBeheerder('post', `/api/venue-layouts/${id}/seats`).send({
        seats: [{ id: eerste.id, section: 'Vak A', rowName: 'Rij 1', seatNumber: '1', xPosition: 0, yPosition: 0 }],
        deleteOtherSeats: true,
      });

      expect(antwoord.body.deleted).toBe(2);
      expect(stoelenVan(id)).toHaveLength(1);
    });

    it('gooit geen stoel weg waar een kaart voor is verkocht', async () => {
      const id = await maakIndeling('Zaal', 2);
      const [eerste, tweede] = stoelenVan(id);
      const concertId = maakConcert(id);
      db.prepare(
        `INSERT INTO concert_seat_reservations (id, concert_id, seat_id, status) VALUES (?, ?, ?, 'sold')`,
      ).run(uuidv4(), concertId, tweede.id);

      const antwoord = await alsBeheerder('post', `/api/venue-layouts/${id}/seats`).send({
        seats: [{ id: eerste.id, section: 'Vak A', rowName: 'Rij 1', seatNumber: '1', xPosition: 0, yPosition: 0 }],
        deleteOtherSeats: true,
      });

      expect(antwoord.status).toBe(409);
      expect(stoelenVan(id)).toHaveLength(2);
    });

    it('geeft 404 voor een indeling van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = uuidv4();
      db.prepare(
        'INSERT INTO venue_layouts (id, association_id, name, layout_data, capacity) VALUES (?, ?, ?, ?, 0)',
      ).run(vreemd, andere.id, 'Van de buren', '{}');

      const antwoord = await alsBeheerder('post', `/api/venue-layouts/${vreemd}/seats`).send({
        seats: [{ section: 'A', rowName: '1', seatNumber: '1', xPosition: 0, yPosition: 0 }],
      });
      expect(antwoord.status).toBe(404);
    });

    it('laat een geblokkeerde stoel geblokkeerd als de wijziging er niets over zegt', async () => {
      // isAvailable had een `.default(true)` in het schema. Een stoel die om
      // wat voor reden dan ook uit de verkoop was - kapot, gereserveerd voor
      // de techniek - kwam daardoor weer in de verkoop zodra iemand hem een
      // paar pixels verschoof. Het verzoek zei er niets over; de standaard
      // deed het werk. is_available wordt echt uitgelezen: GET
      // /concerts/:id/seats zet de stoel op 'blocked'.
      const id = await maakIndeling('Zaal', 1);
      const [stoel] = stoelenVan(id);
      db.prepare('UPDATE venue_seats SET is_available = 0 WHERE id = ?').run(stoel.id);

      const antwoord = await alsBeheerder('post', `/api/venue-layouts/${id}/seats`).send({
        seats: [{ id: stoel.id, section: 'Vak A', rowName: 'Rij 1', seatNumber: '1', xPosition: 42, yPosition: 0 }],
      });

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      const na = db.prepare('SELECT is_available, x_position FROM venue_seats WHERE id = ?').get(stoel.id) as {
        is_available: number;
        x_position: number;
      };
      expect(na.x_position).toBe(42);
      expect(na.is_available).toBe(0);
    });

    it('maakt van een rolstoelplaats geen gewone stoel bij een verplaatsing', async () => {
      const id = await maakIndeling('Zaal', 1);
      const [stoel] = stoelenVan(id);
      db.prepare("UPDATE venue_seats SET seat_type = 'wheelchair', price_category = 'premium' WHERE id = ?").run(
        stoel.id,
      );

      await alsBeheerder('post', `/api/venue-layouts/${id}/seats`).send({
        seats: [{ id: stoel.id, section: 'Vak A', rowName: 'Rij 1', seatNumber: '1', xPosition: 7, yPosition: 0 }],
      });

      expect(db.prepare('SELECT seat_type, price_category FROM venue_seats WHERE id = ?').get(stoel.id)).toMatchObject({
        seat_type: 'wheelchair',
        price_category: 'premium',
      });
    });

    it('deblokkeert een stoel wel als het verzoek daarom vraagt', async () => {
      const id = await maakIndeling('Zaal', 1);
      const [stoel] = stoelenVan(id);
      db.prepare('UPDATE venue_seats SET is_available = 0 WHERE id = ?').run(stoel.id);

      await alsBeheerder('post', `/api/venue-layouts/${id}/seats`).send({
        seats: [
          {
            id: stoel.id,
            section: 'Vak A',
            rowName: 'Rij 1',
            seatNumber: '1',
            xPosition: 0,
            yPosition: 0,
            isAvailable: true,
          },
        ],
      });

      expect(db.prepare('SELECT is_available FROM venue_seats WHERE id = ?').get(stoel.id)).toMatchObject({
        is_available: 1,
      });
    });
  });

  describe('stoelen van een concert', () => {
    it('geeft de stoelen met hun stand', async () => {
      const layoutId = await maakIndeling('Zaal', 3);
      const concertId = maakConcert(layoutId);
      const stoelen = stoelenVan(layoutId);
      db.prepare(
        `INSERT INTO concert_seat_reservations (id, concert_id, seat_id, status) VALUES (?, ?, ?, 'sold')`,
      ).run(uuidv4(), concertId, stoelen[0].id);

      const antwoord = await alsLid('get', `/api/concerts/${concertId}/seats`);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.stats).toMatchObject({ total: 3, sold: 1, available: 2 });
      expect(antwoord.body.layout.name).toBe('Zaal');
    });

    it('telt een verlopen reservering weer als vrij', async () => {
      const layoutId = await maakIndeling('Zaal', 2);
      const concertId = maakConcert(layoutId);
      const stoelen = stoelenVan(layoutId);
      db.prepare(
        `INSERT INTO concert_seat_reservations (id, concert_id, seat_id, status, reservation_expires_at)
         VALUES (?, ?, ?, 'reserved', '2020-01-01T00:00:00.000Z')`,
      ).run(uuidv4(), concertId, stoelen[0].id);

      const antwoord = await alsLid('get', `/api/concerts/${concertId}/seats`);
      expect(antwoord.body.stats).toMatchObject({ available: 2, reserved: 0 });
    });

    it('geeft 400 voor een concert zonder vaste plaatsen', async () => {
      const concertId = maakConcert(null, { gestoeld: false });
      expect((await alsLid('get', `/api/concerts/${concertId}/seats`)).status).toBe(400);
    });

    it('geeft 404 voor een concert van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdConcert = maakConcert(null, { associationId: andere.id });
      expect((await alsLid('get', `/api/concerts/${vreemdConcert}/seats`)).status).toBe(404);
    });
  });

  describe('stoelen reserveren', () => {
    it('reserveert stoelen met een vervaltijd', async () => {
      const layoutId = await maakIndeling('Zaal', 2);
      const concertId = maakConcert(layoutId);
      const stoelen = stoelenVan(layoutId);

      const antwoord = await alsLid('post', `/api/concerts/${concertId}/seats/reserve`).send({
        seatIds: [stoelen[0].id],
        reservationMinutes: 10,
      });

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(new Date(antwoord.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

      const rij = db
        .prepare('SELECT status FROM concert_seat_reservations WHERE concert_id = ? AND seat_id = ?')
        .get(concertId, stoelen[0].id) as { status: string };
      expect(rij.status).toBe('reserved');
    });

    it('reserveert een al verkochte stoel niet nog een keer', async () => {
      const layoutId = await maakIndeling('Zaal', 2);
      const concertId = maakConcert(layoutId);
      const stoelen = stoelenVan(layoutId);
      db.prepare(
        `INSERT INTO concert_seat_reservations (id, concert_id, seat_id, status) VALUES (?, ?, ?, 'sold')`,
      ).run(uuidv4(), concertId, stoelen[0].id);

      const antwoord = await alsLid('post', `/api/concerts/${concertId}/seats/reserve`).send({
        seatIds: [stoelen[0].id],
      });

      expect(antwoord.status).toBe(409);
    });

    it('reserveert een stoel niet die iemand anders net heeft vastgelegd', async () => {
      const layoutId = await maakIndeling('Zaal', 2);
      const concertId = maakConcert(layoutId);
      const stoelen = stoelenVan(layoutId);

      await alsLid('post', `/api/concerts/${concertId}/seats/reserve`).send({ seatIds: [stoelen[0].id] });
      const tweede = await alsBeheerder('post', `/api/concerts/${concertId}/seats/reserve`).send({
        seatIds: [stoelen[0].id],
      });

      expect(tweede.status).toBe(409);
    });

    it('laat een verlopen reservering wel overnemen', async () => {
      const layoutId = await maakIndeling('Zaal', 2);
      const concertId = maakConcert(layoutId);
      const stoelen = stoelenVan(layoutId);
      db.prepare(
        `INSERT INTO concert_seat_reservations (id, concert_id, seat_id, status, reservation_expires_at)
         VALUES (?, ?, ?, 'reserved', '2020-01-01T00:00:00.000Z')`,
      ).run(uuidv4(), concertId, stoelen[0].id);

      const antwoord = await alsLid('post', `/api/concerts/${concertId}/seats/reserve`).send({
        seatIds: [stoelen[0].id],
      });

      expect(antwoord.status).toBe(200);
    });

    it('weigert een stoel die niet bij deze zaal hoort', async () => {
      const layoutId = await maakIndeling('Zaal', 2);
      const andereLayout = await maakIndeling('Andere zaal', 2);
      const concertId = maakConcert(layoutId);
      const vreemdeStoel = stoelenVan(andereLayout)[0];

      const antwoord = await alsLid('post', `/api/concerts/${concertId}/seats/reserve`).send({
        seatIds: [vreemdeStoel.id],
      });

      expect(antwoord.status).toBe(400);
    });

    it('vraagt om ten minste een stoel', async () => {
      const layoutId = await maakIndeling('Zaal', 2);
      const concertId = maakConcert(layoutId);

      expect((await alsLid('post', `/api/concerts/${concertId}/seats/reserve`).send({ seatIds: [] })).status).toBe(400);
    });

    it('reserveert niets voor een concert van een andere vereniging', async () => {
      const layoutId = await maakIndeling('Zaal', 2);
      const stoelen = stoelenVan(layoutId);
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereGebruiker = createTestUser(andere.id, { email: `zaal-${uuidv4()}@test.nl` });
      const concertId = maakConcert(layoutId);

      const antwoord = await request(app)
        .post(`/api/concerts/${concertId}/seats/reserve`)
        .set('Authorization', `Bearer ${generateTestToken(andereGebruiker)}`)
        .send({ seatIds: [stoelen[0].id] });

      expect(antwoord.status).toBe(404);
    });
  });

  describe('reserveringen vrijgeven', () => {
    it('geeft de stoelen van een bestelling vrij', async () => {
      const layoutId = await maakIndeling('Zaal', 2);
      const concertId = maakConcert(layoutId);
      const stoelen = stoelenVan(layoutId);
      const orderId = maakBestelling(concertId);

      const gereserveerd = await alsLid('post', `/api/concerts/${concertId}/seats/reserve`).send({
        seatIds: stoelen.map((s) => s.id),
        orderId,
      });
      expect(gereserveerd.status, JSON.stringify(gereserveerd.body)).toBe(200);

      const antwoord = await alsLid('delete', `/api/concerts/${concertId}/seats/reserve`).send({ orderId });
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.releasedCount).toBe(2);
    });

    it('geeft losse stoelen vrij', async () => {
      const layoutId = await maakIndeling('Zaal', 2);
      const concertId = maakConcert(layoutId);
      const stoelen = stoelenVan(layoutId);

      await alsLid('post', `/api/concerts/${concertId}/seats/reserve`).send({ seatIds: stoelen.map((s) => s.id) });

      const antwoord = await alsLid('delete', `/api/concerts/${concertId}/seats/reserve`).send({
        seatIds: [stoelen[0].id],
      });
      expect(antwoord.body.releasedCount).toBe(1);
    });

    it('geeft een verkochte stoel niet vrij', async () => {
      const layoutId = await maakIndeling('Zaal', 2);
      const concertId = maakConcert(layoutId);
      const stoelen = stoelenVan(layoutId);
      db.prepare(
        `INSERT INTO concert_seat_reservations (id, concert_id, seat_id, status) VALUES (?, ?, ?, 'sold')`,
      ).run(uuidv4(), concertId, stoelen[0].id);

      const antwoord = await alsLid('delete', `/api/concerts/${concertId}/seats/reserve`).send({
        seatIds: [stoelen[0].id],
      });

      expect(antwoord.body.releasedCount).toBe(0);
    });

    it('vraagt om stoelen of een bestelling', async () => {
      const layoutId = await maakIndeling('Zaal', 2);
      const concertId = maakConcert(layoutId);

      expect((await alsLid('delete', `/api/concerts/${concertId}/seats/reserve`).send({})).status).toBe(400);
    });
  });

  it('vraagt overal om een geldige aanmelding', async () => {
    expect(lid.id).toBeTruthy();
    expect((await request(app).get('/api/venue-layouts')).status).toBe(401);
    expect((await request(app).post('/api/venue-layouts').send({})).status).toBe(401);
  });
});
