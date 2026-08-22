/**
 * Recent bekeken items: net als favorieten strikt persoonlijk.
 *
 * user_recent_views heeft geen association_id; de enige grens is user_id, en
 * die moet uit het token komen en nergens anders vandaan. Vandaar dat elke
 * route hier ook vanuit een tweede lid wordt geprobeerd: het overzicht mag
 * niets van de ander laten zien, een nieuwe registratie mag niet op naam van
 * de ander komen te staan, en het wissen van de geschiedenis mag die van de
 * ander niet raken.
 *
 * Daarnaast houdt de route zelf twee dingen bij: hetzelfde item twee keer
 * bekijken hoort een rij te blijven (met een nieuwe tijd), en de lijst wordt
 * op honderd rijen per gebruiker afgekapt.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import recentRoutes from '../../routes/recent';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestEnvironment, createTestUser, generateTestToken, TestUser } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/recent', recentRoutes);
app.use(errorHandler);

describe('recent bekeken', () => {
  let lid: TestUser;
  let lidToken: string;
  let tweedeLid: TestUser;
  let tweedeLidToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    tweedeLid = createTestUser(omgeving.association.id, {
      email: `tweede-${uuidv4()}@test.nl`,
      firstName: 'Tweede',
    });
    tweedeLidToken = generateTestToken(tweedeLid);
  });

  type Methode = 'get' | 'post' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/recent${pad}`).set('Authorization', `Bearer ${token}`);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);
  const alsTweedeLid = (methode: Methode, pad: string) => als(tweedeLidToken, methode, pad);

  const bekijk = (token: string, item: { itemType: string; itemId: string; itemTitle: string }) =>
    als(token, 'post', '/').send(item);

  function rijenVan(userId: string): { item_id: string; item_title: string; item_type: string }[] {
    return db.prepare('SELECT item_id, item_title, item_type FROM user_recent_views WHERE user_id = ?').all(userId) as {
      item_id: string;
      item_title: string;
      item_type: string;
    }[];
  }

  /**
   * Rijen rechtstreeks in de database met een oplopende viewed_at. Via de API
   * krijgen ze allemaal dezelfde seconde mee (CURRENT_TIMESTAMP heeft geen
   * fijnere resolutie), en dan is de volgorde niet meer voorspelbaar.
   */
  function zetGeschiedenis(userId: string, aantal: number, itemType = 'music_piece'): void {
    const stmt = db.prepare(
      'INSERT INTO user_recent_views (id, user_id, item_type, item_id, item_title, viewed_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (let i = 0; i < aantal; i++) {
      const minuut = String(i).padStart(2, '0');
      stmt.run(uuidv4(), userId, itemType, `item-${i}`, `Titel ${i}`, `2026-01-01 00:${minuut}:00`);
    }
  }

  describe('overzicht', () => {
    it('geeft de eigen geschiedenis terug, nieuwste eerst', async () => {
      zetGeschiedenis(lid.id, 3);

      const antwoord = await alsLid('get', '/');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.map((i: { itemTitle: string }) => i.itemTitle)).toEqual(['Titel 2', 'Titel 1', 'Titel 0']);
      expect(antwoord.body[0]).toMatchObject({ itemType: 'music_piece', itemId: 'item-2' });
    });

    it('laat de geschiedenis van een ander lid niet zien', async () => {
      zetGeschiedenis(tweedeLid.id, 2);

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body).toEqual([]);
    });

    it('filtert op soort item', async () => {
      await bekijk(lidToken, { itemType: 'music_piece', itemId: 'a', itemTitle: 'Een partij' });
      await bekijk(lidToken, { itemType: 'concert', itemId: 'b', itemTitle: 'Een concert' });

      const antwoord = await alsLid('get', '/?type=concert');
      expect(antwoord.body.map((i: { itemTitle: string }) => i.itemTitle)).toEqual(['Een concert']);
    });

    it('houdt zich aan de gevraagde limiet', async () => {
      zetGeschiedenis(lid.id, 5);

      const antwoord = await alsLid('get', '/?limit=2');
      expect(antwoord.body).toHaveLength(2);
      expect(antwoord.body.map((i: { itemTitle: string }) => i.itemTitle)).toEqual(['Titel 4', 'Titel 3']);
    });

    it('geeft er nooit meer dan vijftig terug', async () => {
      zetGeschiedenis(lid.id, 60);

      const antwoord = await alsLid('get', '/?limit=999');
      expect(antwoord.body).toHaveLength(50);
    });

    it('valt terug op twintig bij een onzinnige limiet', async () => {
      zetGeschiedenis(lid.id, 30);

      const antwoord = await alsLid('get', '/?limit=abc');
      expect(antwoord.body).toHaveLength(20);
    });

    it('weigert een verzoek zonder geldig token', async () => {
      expect((await request(app).get('/api/recent')).status).toBe(401);
    });
  });

  describe('registreren', () => {
    it('slaat een bekeken item op onder de ingelogde gebruiker', async () => {
      const antwoord = await bekijk(lidToken, {
        itemType: 'music_title',
        itemId: 'titel-1',
        itemTitle: 'Bolero',
      });
      expect(antwoord.status).toBe(201);

      expect(rijenVan(lid.id)).toEqual([{ item_id: 'titel-1', item_title: 'Bolero', item_type: 'music_title' }]);
      expect(rijenVan(tweedeLid.id)).toEqual([]);
    });

    it('houdt hetzelfde item op een rij en zet het weer bovenaan', async () => {
      zetGeschiedenis(lid.id, 2);
      await bekijk(lidToken, { itemType: 'music_piece', itemId: 'item-0', itemTitle: 'Titel 0' });

      const rijen = rijenVan(lid.id);
      expect(rijen).toHaveLength(2);

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body[0].itemId).toBe('item-0');
    });

    it('houdt hetzelfde item van een ander lid apart', async () => {
      // De ontdubbeling verwijdert op user_id + item_type + item_id; zonder de
      // user_id zou een lid de geschiedenis van een ander opschonen.
      zetGeschiedenis(tweedeLid.id, 1);
      await bekijk(lidToken, { itemType: 'music_piece', itemId: 'item-0', itemTitle: 'Titel 0' });

      expect(rijenVan(tweedeLid.id)).toHaveLength(1);
      expect(rijenVan(lid.id)).toHaveLength(1);
    });

    it('bewaart hoogstens honderd items per gebruiker', async () => {
      zetGeschiedenis(lid.id, 100);

      await bekijk(lidToken, { itemType: 'concert', itemId: 'nieuw', itemTitle: 'Het nieuwste' });

      expect(rijenVan(lid.id)).toHaveLength(100);
      const bewaard = rijenVan(lid.id).map((r) => r.item_id);
      expect(bewaard).toContain('nieuw');
      expect(bewaard).not.toContain('item-0'); // de oudste valt af
    });

    it('kapt de lijst van een ander lid niet af', async () => {
      zetGeschiedenis(tweedeLid.id, 100);
      zetGeschiedenis(lid.id, 100);

      await bekijk(lidToken, { itemType: 'concert', itemId: 'nieuw', itemTitle: 'Het nieuwste' });

      expect(rijenVan(tweedeLid.id)).toHaveLength(100);
    });

    it('weigert een registratie zonder itemType, itemId of itemTitle', async () => {
      expect((await bekijk(lidToken, { itemType: 'concert', itemId: 'x', itemTitle: '' })).status).toBe(400);
      expect((await als(lidToken, 'post', '/').send({ itemId: 'x', itemTitle: 'y' })).status).toBe(400);
      expect((await als(lidToken, 'post', '/').send({ itemType: 'concert', itemTitle: 'y' })).status).toBe(400);
      expect(rijenVan(lid.id)).toEqual([]);
    });

    it('weigert een verzoek zonder geldig token', async () => {
      const antwoord = await request(app)
        .post('/api/recent')
        .send({ itemType: 'concert', itemId: 'x', itemTitle: 'y' });
      expect(antwoord.status).toBe(401);
      expect(rijenVan(lid.id)).toEqual([]);
    });
  });

  describe('wissen', () => {
    it('wist de eigen geschiedenis', async () => {
      zetGeschiedenis(lid.id, 3);

      const antwoord = await alsLid('delete', '/');
      expect(antwoord.status).toBe(200);
      expect(rijenVan(lid.id)).toEqual([]);
    });

    it('laat de geschiedenis van een ander lid staan', async () => {
      zetGeschiedenis(lid.id, 2);
      zetGeschiedenis(tweedeLid.id, 2);

      await alsLid('delete', '/');

      expect(rijenVan(lid.id)).toEqual([]);
      expect(rijenVan(tweedeLid.id)).toHaveLength(2);
      expect((await alsTweedeLid('get', '/')).body).toHaveLength(2);
    });

    it('weigert een verzoek zonder geldig token', async () => {
      zetGeschiedenis(lid.id, 2);

      expect((await request(app).delete('/api/recent')).status).toBe(401);
      expect(rijenVan(lid.id)).toHaveLength(2);
    });
  });
});
