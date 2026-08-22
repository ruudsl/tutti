/**
 * Genres.
 *
 * Let op de opzet: de tabel `genres` heeft geen association_id (zie
 * database/schema.ts), en de naam is globaal uniek. Genres zijn dus met opzet
 * een gedeelde woordenlijst voor alle verenigingen samen, net als
 * `instruments`. Dat maakt de rolcontrole hier het belangrijkste onderwerp -
 * er valt namelijk geen verenigingsgrens te bewaken die er niet is.
 *
 * De keerzijde daarvan leggen de laatste twee tests vast: een beheerder van de
 * ene vereniging kan een genre hernoemen of weggooien dat een andere
 * vereniging gebruikt. Dat is de huidige, bewuste opzet en geen fout in deze
 * route; het staat hier zodat een toekomstige wijziging het niet ongemerkt
 * anders doet.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import genresRoutes from '../../routes/genres';
import { errorHandler } from '../../middleware/errorHandler';
import { invalidateAllCache } from '../../middleware/cache';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestUser,
  generateTestToken,
  TestAssociation,
} from '../testUtils';

// Het pad moet '/api/genres' zijn: de cacheInvalidator in de route ruimt op
// aan de hand van precies dat pad.
const app = express();
app.use(express.json());
app.use('/api/genres', genresRoutes);
app.use(errorHandler);

describe('genres', () => {
  let beheerderToken: string;
  let lidToken: string;
  let commissieToken: string;

  let andereVereniging: TestAssociation;
  let andereBeheerderToken: string;

  beforeEach(() => {
    // De antwoordcache staat op moduleniveau en overleeft het legen van de
    // database.
    invalidateAllCache();

    const omgeving = createTestEnvironment();
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;
    commissieToken = omgeving.musicCommitteeToken;

    andereVereniging = createTestAssociation({ name: 'Harmonie B' });
    andereBeheerderToken = generateTestToken(
      createTestUser(andereVereniging.id, { email: 'beheerder-b@test.com', role: 'admin' }),
    );
  });

  type Methode = 'get' | 'post' | 'put' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/genres${pad}`).set('Authorization', `Bearer ${token}`);

  function maakGenre(naam: string): string {
    const id = uuidv4();
    db.prepare('INSERT INTO genres (id, name) VALUES (?, ?)').run(id, naam);
    return id;
  }

  function maakTitelMetGenre(associationId: string, genreId: string): string {
    const titelId = uuidv4();
    db.prepare('INSERT INTO music_titles (id, title, association_id) VALUES (?, ?, ?)').run(
      titelId,
      `Titel ${titelId.slice(0, 8)}`,
      associationId,
    );
    db.prepare('INSERT INTO music_title_genres (music_title_id, genre_id) VALUES (?, ?)').run(titelId, genreId);
    return titelId;
  }

  describe('GET /api/genres', () => {
    it('geeft de genres op naam gesorteerd', async () => {
      maakGenre('Marsen');
      maakGenre('Filmmuziek');

      const antwoord = await als(lidToken, 'get', '/');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.map((g: any) => g.name)).toEqual(['Filmmuziek', 'Marsen']);
      expect(antwoord.body[0]).toHaveProperty('createdAt');
    });

    it('geeft een lege lijst als er nog geen genres zijn', async () => {
      const antwoord = await als(lidToken, 'get', '/');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual([]);
    });

    it('weigert een verzoek zonder token', async () => {
      const antwoord = await request(app).get('/api/genres');

      expect(antwoord.status).toBe(401);
    });
  });

  describe('POST /api/genres', () => {
    it('maakt een genre aan als beheerder', async () => {
      const antwoord = await als(beheerderToken, 'post', '/').send({ name: '  Marsen  ' });

      expect(antwoord.status).toBe(201);
      const rij = db.prepare('SELECT name FROM genres WHERE id = ?').get(antwoord.body.id) as any;
      expect(rij.name).toBe('Marsen');
    });

    it('staat de muziekcommissie toe een genre aan te maken', async () => {
      const antwoord = await als(commissieToken, 'post', '/').send({ name: 'Filmmuziek' });

      expect(antwoord.status).toBe(201);
    });

    it('weigert een gewoon lid', async () => {
      const antwoord = await als(lidToken, 'post', '/').send({ name: 'Marsen' });

      expect(antwoord.status).toBe(403);
      const aantal = db.prepare('SELECT COUNT(*) AS aantal FROM genres').get() as { aantal: number };
      expect(aantal.aantal).toBe(0);
    });

    it('weigert een naam die al bestaat, ongeacht hoofdletters', async () => {
      maakGenre('Marsen');

      const antwoord = await als(beheerderToken, 'post', '/').send({ name: 'MARSEN' });

      expect(antwoord.status).toBe(409);
      const aantal = db.prepare('SELECT COUNT(*) AS aantal FROM genres').get() as { aantal: number };
      expect(aantal.aantal).toBe(1);
    });

    it('weigert een lege naam', async () => {
      const antwoord = await als(beheerderToken, 'post', '/').send({ name: '' });

      expect(antwoord.status).toBe(400);
    });

    it('weigert een naam van meer dan honderd tekens', async () => {
      const antwoord = await als(beheerderToken, 'post', '/').send({ name: 'x'.repeat(101) });

      expect(antwoord.status).toBe(400);
    });

    it('maakt de gecachete lijst ongeldig', async () => {
      const voor = await als(beheerderToken, 'get', '/');
      expect(voor.body).toEqual([]);

      await als(beheerderToken, 'post', '/').send({ name: 'Marsen' });

      const na = await als(beheerderToken, 'get', '/');
      expect(na.body.map((g: any) => g.name)).toEqual(['Marsen']);
    });
  });

  describe('PUT /api/genres/:id', () => {
    it('hernoemt een genre', async () => {
      const id = maakGenre('Marsen');

      const antwoord = await als(beheerderToken, 'put', `/${id}`).send({ name: '  Concertmarsen  ' });

      expect(antwoord.status).toBe(200);
      const rij = db.prepare('SELECT name FROM genres WHERE id = ?').get(id) as any;
      expect(rij.name).toBe('Concertmarsen');
    });

    it('staat de muziekcommissie toe te hernoemen', async () => {
      const id = maakGenre('Marsen');

      const antwoord = await als(commissieToken, 'put', `/${id}`).send({ name: 'Concertmarsen' });

      expect(antwoord.status).toBe(200);
    });

    it('geeft 404 voor een onbekend id', async () => {
      const antwoord = await als(beheerderToken, 'put', `/${uuidv4()}`).send({ name: 'Bestaat niet' });

      expect(antwoord.status).toBe(404);
    });

    it('weigert de naam van een ander genre over te nemen', async () => {
      const id = maakGenre('Marsen');
      maakGenre('Filmmuziek');

      const antwoord = await als(beheerderToken, 'put', `/${id}`).send({ name: 'filmmuziek' });

      expect(antwoord.status).toBe(409);
      const rij = db.prepare('SELECT name FROM genres WHERE id = ?').get(id) as any;
      expect(rij.name).toBe('Marsen');
    });

    it('staat het opnieuw opslaan van de eigen naam toe', async () => {
      const id = maakGenre('Marsen');

      const antwoord = await als(beheerderToken, 'put', `/${id}`).send({ name: 'Marsen' });

      expect(antwoord.status).toBe(200);
    });

    it('weigert een lege naam', async () => {
      const id = maakGenre('Marsen');

      const antwoord = await als(beheerderToken, 'put', `/${id}`).send({ name: '' });

      expect(antwoord.status).toBe(400);
      const rij = db.prepare('SELECT name FROM genres WHERE id = ?').get(id) as any;
      expect(rij.name).toBe('Marsen');
    });

    it('weigert een hernoeming door een gewoon lid', async () => {
      const id = maakGenre('Marsen');

      const antwoord = await als(lidToken, 'put', `/${id}`).send({ name: 'Overgenomen' });

      expect(antwoord.status).toBe(403);
      const rij = db.prepare('SELECT name FROM genres WHERE id = ?').get(id) as any;
      expect(rij.name).toBe('Marsen');
    });
  });

  describe('DELETE /api/genres/:id', () => {
    it('verwijdert een genre als beheerder', async () => {
      const id = maakGenre('Marsen');

      const antwoord = await als(beheerderToken, 'delete', `/${id}`);

      expect(antwoord.status).toBe(200);
      expect(db.prepare('SELECT id FROM genres WHERE id = ?').get(id)).toBeUndefined();
    });

    it('weigert verwijderen door de muziekcommissie', async () => {
      // Aanmaken en hernoemen mag de commissie wel, verwijderen niet: een
      // genre weghalen raakt de koppelingen van alle titels.
      const id = maakGenre('Marsen');

      const antwoord = await als(commissieToken, 'delete', `/${id}`);

      expect(antwoord.status).toBe(403);
      expect(db.prepare('SELECT id FROM genres WHERE id = ?').get(id)).toBeDefined();
    });

    it('weigert verwijderen door een gewoon lid', async () => {
      const id = maakGenre('Marsen');

      const antwoord = await als(lidToken, 'delete', `/${id}`);

      expect(antwoord.status).toBe(403);
      expect(db.prepare('SELECT id FROM genres WHERE id = ?').get(id)).toBeDefined();
    });

    it('geeft 404 voor een onbekend id', async () => {
      const antwoord = await als(beheerderToken, 'delete', `/${uuidv4()}`);

      expect(antwoord.status).toBe(404);
    });

    it('haalt ook de koppeling met een titel weg', async () => {
      const genreId = maakGenre('Marsen');
      const titelId = maakTitelMetGenre(andereVereniging.id, genreId);

      await als(beheerderToken, 'delete', `/${genreId}`);

      const koppeling = db
        .prepare('SELECT * FROM music_title_genres WHERE music_title_id = ? AND genre_id = ?')
        .get(titelId, genreId);
      expect(koppeling).toBeUndefined();
      // De titel zelf blijft bestaan; alleen het genre-etiket verdwijnt.
      expect(db.prepare('SELECT id FROM music_titles WHERE id = ?').get(titelId)).toBeDefined();
    });
  });

  describe('gedeelde woordenlijst', () => {
    it('toont een genre van de ene vereniging ook aan de andere', async () => {
      await als(beheerderToken, 'post', '/').send({ name: 'Marsen' });

      const antwoord = await als(andereBeheerderToken, 'get', '/');

      expect(antwoord.body.map((g: any) => g.name)).toEqual(['Marsen']);
    });

    it('laat de beheerder van de andere vereniging hetzelfde genre beheren', async () => {
      // Vastgelegd gedrag, geen aanbeveling: zolang `genres` geen
      // association_id heeft, is elk genre van iedereen. Wie dit wil
      // begrenzen, moet eerst het schema aanpassen.
      const antwoord = await als(beheerderToken, 'post', '/').send({ name: 'Marsen' });
      const genreId = antwoord.body.id;

      const hernoemen = await als(andereBeheerderToken, 'put', `/${genreId}`).send({ name: 'Van B' });
      expect(hernoemen.status).toBe(200);

      const verwijderen = await als(andereBeheerderToken, 'delete', `/${genreId}`);
      expect(verwijderen.status).toBe(200);
      expect(db.prepare('SELECT id FROM genres WHERE id = ?').get(genreId)).toBeUndefined();
    });
  });
});
