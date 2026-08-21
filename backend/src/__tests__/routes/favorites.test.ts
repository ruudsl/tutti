/**
 * Favorieten: persoonlijk, en dus twee grenzen tegelijk.
 *
 * De eerste grens loopt tussen leden onderling. user_favorites heeft geen
 * association_id en geen eigen id: de rij is de combinatie van gebruiker en
 * titel. Alles wat een user_id uit de aanvraag zou halen in plaats van uit het
 * token laat lid X aan de favorieten van lid Y komen, dus elke route wordt
 * hier ook vanuit een tweede lid geprobeerd.
 *
 * De tweede grens is die van de vereniging: een titel van de buren mag niet in
 * de favorieten belanden en mag er ook niet uit terugkomen. Daar hoort een
 * zacht verwijderde titel bij - die bestaat voor de rest van de applicatie
 * niet meer.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import favoritesRoutes from '../../routes/favorites';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestMusicPiece,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/favorites', favoritesRoutes);
app.use(errorHandler);

describe('favorieten', () => {
  let vereniging: TestAssociation;
  let lid: TestUser;
  let lidToken: string;
  let tweedeLid: TestUser;
  let tweedeLidToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    tweedeLid = createTestUser(vereniging.id, { email: `tweede-${uuidv4()}@test.nl`, firstName: 'Tweede' });
    tweedeLidToken = generateTestToken(tweedeLid);
  });

  type Methode = 'get' | 'post' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/favorites${pad}`).set('Authorization', `Bearer ${token}`);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);
  const alsTweedeLid = (methode: Methode, pad: string) => als(tweedeLidToken, methode, pad);

  function maakTitel(associationId: string, titel: string, arranger: string | null = null): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO music_titles (id, title, arranger, association_id, youtube_url, duration_seconds, grade)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, titel, arranger, associationId, 'https://youtu.be/test', 240, '3');
    return id;
  }

  function favorietenVan(userId: string): string[] {
    return (
      db.prepare('SELECT music_title_id FROM user_favorites WHERE user_id = ?').all(userId) as {
        music_title_id: string;
      }[]
    ).map((r) => r.music_title_id);
  }

  describe('overzicht', () => {
    it('geeft de eigen favorieten terug met de gegevens van de titel', async () => {
      const titel = maakTitel(vereniging.id, 'Also sprach Zarathustra', 'Strauss');
      expect((await alsLid('post', '/').send({ musicTitleId: titel })).status).toBe(201);

      const antwoord = await alsLid('get', '/');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0]).toMatchObject({
        id: titel,
        title: 'Also sprach Zarathustra',
        arranger: 'Strauss',
        youtubeUrl: 'https://youtu.be/test',
        durationSeconds: 240,
        grade: '3',
      });
      expect(antwoord.body[0].favoritedAt).toBeTruthy();
    });

    it('laat de favorieten van een ander lid buiten beschouwing', async () => {
      const mijne = maakTitel(vereniging.id, 'Van mij');
      const zijne = maakTitel(vereniging.id, 'Van de ander');
      await alsLid('post', '/').send({ musicTitleId: mijne });
      await alsTweedeLid('post', '/').send({ musicTitleId: zijne });

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body.map((f: { title: string }) => f.title)).toEqual(['Van mij']);
    });

    it('laat een titel van een andere vereniging niet zien', async () => {
      // Deze rij kan alleen ontstaan als een lid van vereniging wisselt; de
      // favoriet blijft dan staan maar hoort niet meer getoond te worden.
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdeTitel = maakTitel(andere.id, 'Van de buren');
      db.prepare('INSERT INTO user_favorites (user_id, music_title_id) VALUES (?, ?)').run(lid.id, vreemdeTitel);

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body).toEqual([]);
    });

    it('laat een zacht verwijderde titel niet meer zien', async () => {
      const titel = maakTitel(vereniging.id, 'Uit het repertoire gehaald');
      await alsLid('post', '/').send({ musicTitleId: titel });

      db.prepare('UPDATE music_titles SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), titel);

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body).toEqual([]);
    });

    it('telt de bladmuziek van de eigen vereniging bij de titel', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const titel = maakTitel(vereniging.id, 'Gedeeld nummer', 'Jansen');
      createTestMusicPiece(vereniging.id, { title: 'Gedeeld nummer', arranger: 'Jansen' });
      createTestMusicPiece(vereniging.id, { title: 'Gedeeld nummer', arranger: 'Jansen' });
      createTestMusicPiece(andere.id, { title: 'Gedeeld nummer', arranger: 'Jansen' });
      await alsLid('post', '/').send({ musicTitleId: titel });

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body[0].pieceCount).toBe(2);
    });

    it('telt verwijderde bladmuziek niet mee', async () => {
      const titel = maakTitel(vereniging.id, 'Half weggegooid', 'Jansen');
      createTestMusicPiece(vereniging.id, { title: 'Half weggegooid', arranger: 'Jansen' });
      const weg = createTestMusicPiece(vereniging.id, { title: 'Half weggegooid', arranger: 'Jansen' });
      db.prepare('UPDATE music_pieces SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), weg.id);
      await alsLid('post', '/').send({ musicTitleId: titel });

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body[0].pieceCount).toBe(1);
    });

    it('weigert een verzoek zonder geldig token', async () => {
      expect((await request(app).get('/api/favorites')).status).toBe(401);
    });
  });

  describe('toevoegen', () => {
    it('zet de favoriet op naam van de ingelogde gebruiker', async () => {
      const titel = maakTitel(vereniging.id, 'Nieuw stuk');

      const antwoord = await alsLid('post', '/').send({ musicTitleId: titel });
      expect(antwoord.status).toBe(201);

      expect(favorietenVan(lid.id)).toEqual([titel]);
      expect(favorietenVan(tweedeLid.id)).toEqual([]);
    });

    it('weigert dezelfde titel twee keer', async () => {
      const titel = maakTitel(vereniging.id, 'Nog een stuk');
      await alsLid('post', '/').send({ musicTitleId: titel });

      const antwoord = await alsLid('post', '/').send({ musicTitleId: titel });
      expect(antwoord.status).toBe(409);
      expect(favorietenVan(lid.id)).toHaveLength(1);
    });

    it('laat twee leden dezelfde titel als favoriet zetten', async () => {
      const titel = maakTitel(vereniging.id, 'Populair stuk');

      expect((await alsLid('post', '/').send({ musicTitleId: titel })).status).toBe(201);
      expect((await alsTweedeLid('post', '/').send({ musicTitleId: titel })).status).toBe(201);
    });

    it('weigert een titel van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdeTitel = maakTitel(andere.id, 'Van de buren');

      const antwoord = await alsLid('post', '/').send({ musicTitleId: vreemdeTitel });
      expect(antwoord.status).toBe(404);
      expect(favorietenVan(lid.id)).toEqual([]);
    });

    it('weigert een zacht verwijderde titel', async () => {
      const titel = maakTitel(vereniging.id, 'Al opgeruimd');
      db.prepare('UPDATE music_titles SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), titel);

      const antwoord = await alsLid('post', '/').send({ musicTitleId: titel });
      expect(antwoord.status).toBe(404);
      expect(favorietenVan(lid.id)).toEqual([]);
    });

    it('weigert een titel die niet bestaat', async () => {
      const antwoord = await alsLid('post', '/').send({ musicTitleId: uuidv4() });
      expect(antwoord.status).toBe(404);
    });

    it('weigert een id dat geen uuid is', async () => {
      const antwoord = await alsLid('post', '/').send({ musicTitleId: 'niet-een-uuid' });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een verzoek zonder geldig token', async () => {
      const titel = maakTitel(vereniging.id, 'Zonder token');
      expect((await request(app).post('/api/favorites').send({ musicTitleId: titel })).status).toBe(401);
      expect(favorietenVan(lid.id)).toEqual([]);
    });
  });

  describe('verwijderen', () => {
    it('haalt de eigen favoriet er echt uit', async () => {
      const titel = maakTitel(vereniging.id, 'Toch maar niet');
      await alsLid('post', '/').send({ musicTitleId: titel });

      const antwoord = await alsLid('delete', `/${titel}`);
      expect(antwoord.status).toBe(200);
      expect(favorietenVan(lid.id)).toEqual([]);
    });

    it('laat de favoriet van een ander lid staan', async () => {
      // De DELETE mag alleen op user_id uit het token werken; als hij dat niet
      // deed kon elk lid de favorieten van een ander weggooien.
      const titel = maakTitel(vereniging.id, 'Van de ander');
      await alsTweedeLid('post', '/').send({ musicTitleId: titel });

      const antwoord = await alsLid('delete', `/${titel}`);
      expect(antwoord.status).toBe(404);
      expect(favorietenVan(tweedeLid.id)).toEqual([titel]);
    });

    it('geeft 404 als de favoriet niet bestaat', async () => {
      expect((await alsLid('delete', `/${uuidv4()}`)).status).toBe(404);
    });

    it('weigert een verzoek zonder geldig token', async () => {
      const titel = maakTitel(vereniging.id, 'Zonder token');
      await alsLid('post', '/').send({ musicTitleId: titel });

      expect((await request(app).delete(`/api/favorites/${titel}`)).status).toBe(401);
      expect(favorietenVan(lid.id)).toEqual([titel]);
    });
  });

  describe('controleren', () => {
    it('meldt true voor een eigen favoriet en false voor de rest', async () => {
      const favoriet = maakTitel(vereniging.id, 'Wel favoriet');
      const geenFavoriet = maakTitel(vereniging.id, 'Geen favoriet');
      await alsLid('post', '/').send({ musicTitleId: favoriet });

      expect((await alsLid('get', `/check/${favoriet}`)).body).toEqual({ isFavorite: true });
      expect((await alsLid('get', `/check/${geenFavoriet}`)).body).toEqual({ isFavorite: false });
    });

    it('meldt de favoriet van een ander lid niet als de jouwe', async () => {
      const titel = maakTitel(vereniging.id, 'Van de ander');
      await alsTweedeLid('post', '/').send({ musicTitleId: titel });

      expect((await alsLid('get', `/check/${titel}`)).body).toEqual({ isFavorite: false });
      expect((await alsTweedeLid('get', `/check/${titel}`)).body).toEqual({ isFavorite: true });
    });

    it('meldt false voor een titel van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdeTitel = maakTitel(andere.id, 'Van de buren');
      db.prepare('INSERT INTO user_favorites (user_id, music_title_id) VALUES (?, ?)').run(lid.id, vreemdeTitel);

      expect((await alsLid('get', `/check/${vreemdeTitel}`)).body).toEqual({ isFavorite: false });
    });

    it('meldt false voor een zacht verwijderde titel', async () => {
      const titel = maakTitel(vereniging.id, 'Opgeruimd');
      await alsLid('post', '/').send({ musicTitleId: titel });
      db.prepare('UPDATE music_titles SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), titel);

      expect((await alsLid('get', `/check/${titel}`)).body).toEqual({ isFavorite: false });
    });

    it('weigert een verzoek zonder geldig token', async () => {
      expect((await request(app).get(`/api/favorites/check/${uuidv4()}`)).status).toBe(401);
    });
  });
});
