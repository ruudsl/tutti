/**
 * De gastenlijst bij een concert.
 *
 * Dit bestand stond op nul procent. Een gastkaart is een kaart die niet betaald
 * wordt, dus wie er op de lijst komt en hoeveel kaarten iemand krijgt, is een
 * geldkwestie. Daarnaast staat er een e-mailadres bij elke gast, en die hoort
 * niet zichtbaar te zijn voor een andere vereniging.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import guestListRoutes from '../../routes/guest-list';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestUser,
  generateTestToken,
  TestAssociation,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api', guestListRoutes);
app.use(errorHandler);

describe('gastenlijst', () => {
  let vereniging: TestAssociation;
  let beheerderToken: string;
  let lidToken: string;
  let concertId: string;

  function maakConcert(associationId: string): string {
    const id = uuidv4();
    db.prepare(
      "INSERT INTO concerts (id, association_id, name, date, location) VALUES (?, ?, 'Najaarsconcert', '2026-11-07', 'De Zalen')",
    ).run(id, associationId);
    return id;
  }

  function maakGast(overrides: Record<string, unknown> = {}): string {
    const id = uuidv4();
    const w = {
      concert_id: concertId,
      organisation: 'Gemeente',
      name: 'Jan Jansen',
      email: 'jan@test.nl',
      ticket_count: 2,
      notes: null,
      ticket_type_id: null,
      ...overrides,
    };
    db.prepare(
      `INSERT INTO guest_list (id, concert_id, organisation, name, email, ticket_count, notes, ticket_type_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, w.concert_id, w.organisation, w.name, w.email, w.ticket_count, w.notes, w.ticket_type_id);
    return id;
  }

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;
    concertId = maakConcert(vereniging.id);
  });

  const alsBeheerder = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
    request(app)[methode](`/api${pad}`).set('Authorization', `Bearer ${beheerderToken}`);

  describe('rechten', () => {
    it('houdt een gewoon lid van de gastenlijst af', async () => {
      const paden: Array<['get' | 'post' | 'put' | 'delete', string]> = [
        ['get', `/concerts/${concertId}/guest-list`],
        ['post', `/concerts/${concertId}/guest-list`],
        ['put', `/guest-list/${uuidv4()}`],
        ['delete', `/guest-list/${uuidv4()}`],
      ];

      for (const [methode, pad] of paden) {
        const verzoek = request(app)[methode](`/api${pad}`);
        const antwoord = await verzoek.set('Authorization', `Bearer ${lidToken}`);
        expect(antwoord.status, `${methode} ${pad}`).toBe(403);
      }
    });

    it('vereist inloggen', async () => {
      expect((await request(app).get(`/api/concerts/${concertId}/guest-list`)).status).toBe(401);
    });
  });

  describe('overzicht', () => {
    it('geeft een lege lijst voor een concert zonder gasten', async () => {
      const antwoord = await alsBeheerder('get', `/concerts/${concertId}/guest-list`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.entries).toEqual([]);
    });

    it('toont de gasten van het concert', async () => {
      maakGast({ name: 'Jan Jansen' });
      maakGast({ name: 'Piet Pieters', email: 'piet@test.nl' });

      const antwoord = await alsBeheerder('get', `/concerts/${concertId}/guest-list`);
      expect(antwoord.body.entries).toHaveLength(2);
    });

    it('geeft 404 voor een concert van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdConcert = maakConcert(andere.id);

      const antwoord = await alsBeheerder('get', `/concerts/${vreemdConcert}/guest-list`);
      expect(antwoord.status).toBe(404);
    });

    it('geeft 404 voor een concert dat niet bestaat', async () => {
      expect((await alsBeheerder('get', `/concerts/${uuidv4()}/guest-list`)).status).toBe(404);
    });
  });

  describe('een gast toevoegen', () => {
    it('zet een gast op de lijst met een ordernummer', async () => {
      const antwoord = await alsBeheerder('post', `/concerts/${concertId}/guest-list`).send({
        organisation: 'Gemeente Boxmeer',
        name: 'Jan Jansen',
        email: 'jan@test.nl',
        ticketCount: 2,
      });

      expect(antwoord.status).toBe(201);
      const rij = db
        .prepare('SELECT name, ticket_count, order_number, tickets_sent FROM guest_list WHERE concert_id = ?')
        .get(concertId) as { name: string; ticket_count: number; order_number: string; tickets_sent: number };

      expect(rij).toMatchObject({ name: 'Jan Jansen', ticket_count: 2, tickets_sent: 0 });
      expect(rij.order_number).toMatch(/^GL-\d{4}-\d+$/);
    });

    it('weigert een ongeldig e-mailadres', async () => {
      const antwoord = await alsBeheerder('post', `/concerts/${concertId}/guest-list`).send({
        name: 'Jan',
        email: 'geen-adres',
        ticketCount: 1,
      });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een naam die leeg is', async () => {
      const antwoord = await alsBeheerder('post', `/concerts/${concertId}/guest-list`).send({
        name: '',
        email: 'jan@test.nl',
        ticketCount: 1,
      });
      expect(antwoord.status).toBe(400);
    });

    it('weigert minder dan één kaart', async () => {
      const antwoord = await alsBeheerder('post', `/concerts/${concertId}/guest-list`).send({
        name: 'Jan',
        email: 'jan@test.nl',
        ticketCount: 0,
      });
      expect(antwoord.status).toBe(400);
    });

    it('weigert meer dan twintig kaarten', async () => {
      // Zonder bovengrens kan één regel een halve zaal weggeven.
      const antwoord = await alsBeheerder('post', `/concerts/${concertId}/guest-list`).send({
        name: 'Jan',
        email: 'jan@test.nl',
        ticketCount: 21,
      });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een kaartsoort van een ander concert', async () => {
      const anderConcert = maakConcert(vereniging.id);
      const soortId = uuidv4();
      db.prepare(
        "INSERT INTO ticket_types (id, concert_id, name, price, quantity) VALUES (?, ?, 'Regulier', 15, 50)",
      ).run(soortId, anderConcert);

      const antwoord = await alsBeheerder('post', `/concerts/${concertId}/guest-list`).send({
        name: 'Jan',
        email: 'jan@test.nl',
        ticketCount: 1,
        ticketTypeId: soortId,
      });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een gast bij een concert van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdConcert = maakConcert(andere.id);

      const antwoord = await alsBeheerder('post', `/concerts/${vreemdConcert}/guest-list`).send({
        name: 'Jan',
        email: 'jan@test.nl',
        ticketCount: 1,
      });

      expect(antwoord.status).toBe(404);
      const rij = db.prepare('SELECT COUNT(*) AS n FROM guest_list WHERE concert_id = ?').get(vreemdConcert) as {
        n: number;
      };
      expect(rij.n).toBe(0);
    });

    it('nummert een tweede gast verder door', async () => {
      await alsBeheerder('post', `/concerts/${concertId}/guest-list`).send({
        name: 'Eerste',
        email: 'een@test.nl',
        ticketCount: 1,
      });
      await alsBeheerder('post', `/concerts/${concertId}/guest-list`).send({
        name: 'Tweede',
        email: 'twee@test.nl',
        ticketCount: 1,
      });

      const nummers = db
        .prepare('SELECT order_number FROM guest_list WHERE concert_id = ? ORDER BY created_at')
        .all(concertId) as Array<{ order_number: string }>;

      expect(new Set(nummers.map((n) => n.order_number)).size).toBe(2);
    });
  });

  describe('een gast wijzigen', () => {
    it('werkt de gegevens bij', async () => {
      const id = maakGast({ name: 'Jan Jansen', ticket_count: 2 });
      const antwoord = await alsBeheerder('put', `/guest-list/${id}`).send({ name: 'Jan de Jong', ticketCount: 4 });

      expect(antwoord.status).toBe(200);
      const rij = db.prepare('SELECT name, ticket_count FROM guest_list WHERE id = ?').get(id) as {
        name: string;
        ticket_count: number;
      };
      expect(rij).toMatchObject({ name: 'Jan de Jong', ticket_count: 4 });
    });

    it('weigert meer dan twintig kaarten', async () => {
      const id = maakGast();
      expect((await alsBeheerder('put', `/guest-list/${id}`).send({ ticketCount: 25 })).status).toBe(400);
    });

    it('geeft 404 voor een gast die niet bestaat', async () => {
      expect((await alsBeheerder('put', `/guest-list/${uuidv4()}`).send({ name: 'X' })).status).toBe(404);
    });

    it('weigert een gast van een andere vereniging te wijzigen', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdConcert = maakConcert(andere.id);
      const vreemdeGast = maakGast({ concert_id: vreemdConcert, name: 'Van de buren' });

      const antwoord = await alsBeheerder('put', `/guest-list/${vreemdeGast}`).send({ name: 'Gekaapt' });
      expect(antwoord.status).toBe(404);

      const rij = db.prepare('SELECT name FROM guest_list WHERE id = ?').get(vreemdeGast) as { name: string };
      expect(rij.name).toBe('Van de buren');
    });
  });

  describe('een gast verwijderen', () => {
    it('haalt de gast van de lijst', async () => {
      const id = maakGast();
      expect((await alsBeheerder('delete', `/guest-list/${id}`)).status).toBe(204);
      expect(db.prepare('SELECT id FROM guest_list WHERE id = ?').get(id)).toBeUndefined();
    });

    it('geeft 404 voor een gast die niet bestaat', async () => {
      expect((await alsBeheerder('delete', `/guest-list/${uuidv4()}`)).status).toBe(404);
    });

    it('weigert een gast van een andere vereniging te verwijderen', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdConcert = maakConcert(andere.id);
      const vreemdeGast = maakGast({ concert_id: vreemdConcert });

      expect((await alsBeheerder('delete', `/guest-list/${vreemdeGast}`)).status).toBe(404);
      expect(db.prepare('SELECT id FROM guest_list WHERE id = ?').get(vreemdeGast)).toBeTruthy();
    });
  });

  describe('kaarten versturen', () => {
    function maakKaartsoort(vanConcert = concertId): string {
      const id = uuidv4();
      db.prepare(
        "INSERT INTO ticket_types (id, concert_id, name, price, quantity) VALUES (?, ?, 'Regulier', 15, 50)",
      ).run(id, vanConcert);
      return id;
    }

    it('maakt de kaarten aan en zet de gast op verstuurd', async () => {
      const soortId = maakKaartsoort();
      const gastId = maakGast({ ticket_type_id: soortId, ticket_count: 2 });

      const antwoord = await alsBeheerder('post', `/guest-list/${gastId}/send-tickets`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.ticketCount).toBe(2);
      const kaarten = db
        .prepare('SELECT ticket_type_id FROM tickets WHERE order_id = ?')
        .all(antwoord.body.orderId) as Array<{ ticket_type_id: string }>;
      expect(kaarten).toHaveLength(2);
      expect(kaarten.every((k) => k.ticket_type_id === soortId)).toBe(true);
    });

    it('weigert versturen zolang er geen kaartsoort bij de gast staat', async () => {
      // Zonder kaartsoort is er niets om de kaart aan te hangen: tickets
      // verwijst met een verplichte sleutel naar ticket_types. Dat hoort een
      // duidelijke afwijzing te zijn en geen storing halverwege het aanmaken.
      const gastId = maakGast({ ticket_type_id: null, ticket_count: 2 });

      const antwoord = await alsBeheerder('post', `/guest-list/${gastId}/send-tickets`);

      expect(antwoord.status).toBe(400);
      const rij = db.prepare('SELECT tickets_sent FROM guest_list WHERE id = ?').get(gastId) as {
        tickets_sent: number;
      };
      expect(rij.tickets_sent).toBe(0);
      const aantal = db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE buyer_email = 'jan@test.nl'").get() as {
        n: number;
      };
      expect(aantal.n).toBe(0);
    });

    it('slaat bij verstuur-alles de gasten zonder kaartsoort over', async () => {
      const soortId = maakKaartsoort();
      maakGast({ ticket_type_id: soortId, name: 'Met soort', email: 'met@test.nl' });
      maakGast({ ticket_type_id: null, name: 'Zonder soort', email: 'zonder@test.nl' });

      const antwoord = await alsBeheerder('post', `/concerts/${concertId}/guest-list/send-all`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.sent).toBe(1);
      expect(antwoord.body.failed).toBe(1);
      const verstuurd = db
        .prepare('SELECT name FROM guest_list WHERE tickets_sent = 1 AND concert_id = ?')
        .all(concertId) as Array<{ name: string }>;
      expect(verstuurd.map((v) => v.name)).toEqual(['Met soort']);
    });

    it('verstuurt niets voor een verwijderd concert', async () => {
      // concerts.ts verwijdert zacht; het concert staat er dus nog. Gratis
      // kaarten versturen voor een avond die niet doorgaat hoort niet.
      const soortId = maakKaartsoort();
      const gastId = maakGast({ ticket_type_id: soortId });
      db.prepare('UPDATE concerts SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(concertId);

      const antwoord = await alsBeheerder('post', `/guest-list/${gastId}/send-tickets`);
      expect(antwoord.status).toBe(404);
    });

    it('weigert kaarten te versturen voor een gast van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdConcert = maakConcert(andere.id);
      const vreemdeGast = maakGast({ concert_id: vreemdConcert });

      const antwoord = await alsBeheerder('post', `/guest-list/${vreemdeGast}/send-tickets`);
      expect(antwoord.status).toBe(404);

      const rij = db.prepare('SELECT tickets_sent FROM guest_list WHERE id = ?').get(vreemdeGast) as {
        tickets_sent: number;
      };
      expect(rij.tickets_sent).toBe(0);
    });

    it('verstuurt niets bij een concert van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdConcert = maakConcert(andere.id);
      maakGast({ concert_id: vreemdConcert });

      const antwoord = await alsBeheerder('post', `/concerts/${vreemdConcert}/guest-list/send-all`);
      expect(antwoord.body.sent).toBe(0);

      const rij = db
        .prepare('SELECT COUNT(*) AS n FROM guest_list WHERE concert_id = ? AND tickets_sent = 1')
        .get(vreemdConcert) as { n: number };
      expect(rij.n).toBe(0);
    });
  });

  describe('scheiding tussen verenigingen', () => {
    it('laat een beheerder van een andere vereniging de gasten niet zien', async () => {
      maakGast({ name: 'Jan Jansen', email: 'jan@test.nl' });

      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, {
        email: `beheer-${uuidv4()}@test.nl`,
        role: 'admin',
      });

      const antwoord = await request(app)
        .get(`/api/concerts/${concertId}/guest-list`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`);

      expect(antwoord.status).toBe(404);
      expect(JSON.stringify(antwoord.body)).not.toContain('jan@test.nl');
    });
  });
});
