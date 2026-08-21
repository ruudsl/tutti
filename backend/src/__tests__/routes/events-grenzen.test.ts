/**
 * Evenementen: vervoer, passagiers, paklijsten en paginatie.
 *
 * Vier bevindingen uit de tweede auditronde, alle vier van hetzelfde soort:
 * een geneste bron waarvan de buurroute de verenigingsgrens wél bewaakt.
 *
 * - PUT /:eventId/transport/:transportId werkte bij op id + event_id, zonder
 *   het event aan de vereniging te binden. De DELETE ernaast doet dat wel.
 * - DELETE .../passengers/:passengerId idem, en die route heeft ook geen
 *   requireRole - elk ingelogd lid van welke vereniging dan ook.
 * - DELETE /:eventId/packing-lists/:listId/items/:itemId idem; de PUT erboven
 *   legt de drietrapsjoin wel af.
 * - templateId uit de body werd niet gecontroleerd, terwijl de inhoud van dat
 *   sjabloon naar de nieuwe lijst wordt gekopieerd.
 *
 * En de paginatie deed helemaal niets: getPaginationParams(req) in plaats van
 * (req.query) zette alles vast op pagina 1 met limiet 25, en de argumenten van
 * createPaginatedResult stonden verwisseld, zodat het antwoord page 25 en
 * limit 0 meldde.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import eventsRoutes from '../../routes/events';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/events', eventsRoutes);
app.use(errorHandler);

describe('evenementen: grenzen en paginatie', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lidToken: string;

  let andereVereniging: TestAssociation;
  let andereBeheerderToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;

    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
    const andereBeheerder = createTestUser(andereVereniging.id, { email: 'beheer@elders.nl', role: 'admin' });
    andereBeheerderToken = generateTestToken(andereBeheerder);
  });

  function maakEvenement(associationId: string, naam = 'Uitje'): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO events (id, association_id, name, event_type, start_datetime, created_by)
       VALUES (?, ?, ?, 'performance', '2026-09-01 20:00', ?)`,
    ).run(id, associationId, naam, beheerder.id);
    return id;
  }

  function maakVervoer(eventId: string, chauffeur = 'Jan'): string {
    const id = uuidv4();
    db.prepare(`INSERT INTO event_transport (id, event_id, transport_type, driver_name) VALUES (?, ?, 'car', ?)`).run(
      id,
      eventId,
      chauffeur,
    );
    return id;
  }

  const als = (token: string, methode: 'get' | 'put' | 'post' | 'delete', pad: string) =>
    request(app)[methode](`/api/events${pad}`).set('Authorization', `Bearer ${token}`);

  describe('vervoer van een andere vereniging', () => {
    it('is niet bij te werken', async () => {
      const hunEvent = maakEvenement(andereVereniging.id, 'Hun uitje');
      const hunVervoer = maakVervoer(hunEvent, 'Hun chauffeur');

      const antwoord = await als(beheerderToken, 'put', `/${hunEvent}/transport/${hunVervoer}`).send({
        driverName: 'Overgenomen',
      });
      expect(antwoord.status).toBe(404);

      const rij = db.prepare('SELECT driver_name FROM event_transport WHERE id = ?').get(hunVervoer) as {
        driver_name: string;
      };
      expect(rij.driver_name).toBe('Hun chauffeur');
    });

    it('is wel bij te werken door de eigen vereniging', async () => {
      const onsEvent = maakEvenement(vereniging.id);
      const onsVervoer = maakVervoer(onsEvent);

      const antwoord = await als(beheerderToken, 'put', `/${onsEvent}/transport/${onsVervoer}`).send({
        driverName: 'Nieuwe chauffeur',
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const rij = db.prepare('SELECT driver_name FROM event_transport WHERE id = ?').get(onsVervoer) as {
        driver_name: string;
      };
      expect(rij.driver_name).toBe('Nieuwe chauffeur');
    });
  });

  describe('een passagier van een andere vereniging', () => {
    it('is niet te verwijderen, ook niet door een gewoon lid', async () => {
      const hunEvent = maakEvenement(andereVereniging.id);
      const hunVervoer = maakVervoer(hunEvent);
      const passagier = uuidv4();
      db.prepare(
        `INSERT INTO event_transport_passengers (id, transport_id, user_id, passenger_name)
         VALUES (?, ?, ?, 'Passagier van elders')`,
      ).run(passagier, hunVervoer, beheerder.id);

      const antwoord = await als(lidToken, 'delete', `/${hunEvent}/transport/${hunVervoer}/passengers/${passagier}`);
      expect(antwoord.status).toBe(404);

      const nog = db
        .prepare('SELECT COUNT(*) as aantal FROM event_transport_passengers WHERE id = ?')
        .get(passagier) as { aantal: number };
      expect(nog.aantal).toBe(1);
    });
  });

  describe('een paklijst-sjabloon van een andere vereniging', () => {
    it('wordt niet gekopieerd', async () => {
      const hunSjabloon = uuidv4();
      db.prepare(`INSERT INTO packing_list_templates (id, association_id, name) VALUES (?, ?, 'Hun sjabloon')`).run(
        hunSjabloon,
        andereVereniging.id,
      );
      db.prepare(
        `INSERT INTO packing_list_template_items (id, template_id, item_name) VALUES (?, ?, 'Geheim item')`,
      ).run(uuidv4(), hunSjabloon);

      const onsEvent = maakEvenement(vereniging.id);
      const antwoord = await als(beheerderToken, 'post', `/${onsEvent}/packing-lists`).send({
        name: 'Onze lijst',
        templateId: hunSjabloon,
      });
      expect(antwoord.status).toBe(404);

      const items = db.prepare('SELECT COUNT(*) as aantal FROM event_packing_items').get() as { aantal: number };
      expect(items.aantal).toBe(0);
    });

    it('een eigen sjabloon wordt wel gekopieerd', async () => {
      const onsSjabloon = uuidv4();
      db.prepare(`INSERT INTO packing_list_templates (id, association_id, name) VALUES (?, ?, 'Ons sjabloon')`).run(
        onsSjabloon,
        vereniging.id,
      );
      db.prepare(`INSERT INTO packing_list_template_items (id, template_id, item_name) VALUES (?, ?, 'Lessenaar')`).run(
        uuidv4(),
        onsSjabloon,
      );

      const onsEvent = maakEvenement(vereniging.id);
      const antwoord = await als(beheerderToken, 'post', `/${onsEvent}/packing-lists`).send({
        name: 'Onze lijst',
        templateId: onsSjabloon,
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);

      const items = db.prepare('SELECT item_name FROM event_packing_items').all() as { item_name: string }[];
      expect(items.map((i) => i.item_name)).toEqual(['Lessenaar']);
    });
  });

  describe('paginatie', () => {
    it('geeft een tweede pagina met andere evenementen', async () => {
      for (let i = 0; i < 12; i++) maakEvenement(vereniging.id, `Uitje ${String(i).padStart(2, '0')}`);

      const eerste = await als(beheerderToken, 'get', '/?page=1&limit=5');
      const tweede = await als(beheerderToken, 'get', '/?page=2&limit=5');

      expect(eerste.status, JSON.stringify(eerste.body).slice(0, 200)).toBe(200);
      expect(eerste.body.data).toHaveLength(5);
      expect(tweede.body.data).toHaveLength(5);

      const eersteIds = eerste.body.data.map((e: { id: string }) => e.id);
      const tweedeIds = tweede.body.data.map((e: { id: string }) => e.id);
      expect(tweedeIds.some((id: string) => eersteIds.includes(id))).toBe(false);
    });

    it('meldt de paginagegevens kloppend', async () => {
      for (let i = 0; i < 12; i++) maakEvenement(vereniging.id, `Uitje ${i}`);

      const antwoord = await als(beheerderToken, 'get', '/?page=2&limit=5');
      expect(antwoord.body.pagination).toMatchObject({ page: 2, limit: 5, total: 12, totalPages: 3 });
    });

    it('telt alleen de eigen vereniging', async () => {
      maakEvenement(vereniging.id, 'Van ons');
      maakEvenement(andereVereniging.id, 'Van hun');

      const antwoord = await als(beheerderToken, 'get', '/');
      expect(antwoord.body.pagination.total).toBe(1);
    });
  });
});
