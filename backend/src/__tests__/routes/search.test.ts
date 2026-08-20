/**
 * Zoeken over de hele applicatie: muziek, leden, orkesten, lijsten, repetities
 * en snelkoppelingen naar instellingen. Plus de suggesties en de eigen
 * zoekgeschiedenis.
 *
 * 554 regels zonder test, en zoeken is bij uitstek de plek waar een ontbrekend
 * filter zichtbaar wordt: alles wat de query teruggeeft komt rechtstreeks op
 * het scherm. Drie dingen wegen hier het zwaarst.
 *
 * De verenigingsgrens. Vijf van de zes categorieën filteren op
 * association_id; de repetities deden dat via een LEFT JOIN op orkesten, met
 * `OR r.orchestra_id IS NULL` erachter. Een repetitie zonder orkest betekent
 * "alle orkesten van deze vereniging" - maar die voorwaarde staat naast de
 * verenigingscontrole in plaats van erbinnen, dus verenigingsbrede repetities
 * van elke andere vereniging kwamen mee, met locatie en notities erbij.
 *
 * Zachte verwijdering. music_titles, music_lists en users hebben alle drie een
 * deleted_at, en overal elders in de applicatie wordt daarop gefilterd. Zoeken
 * deed dat niet: verwijderde stukken, verwijderde lijsten en onder de AVG
 * verwijderde leden - inclusief e-mailadres - stonden gewoon in de uitslag.
 *
 * De zoekgeschiedenis is per gebruiker, niet per vereniging.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import searchRoutes from '../../routes/search';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestOrchestra,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestOrchestra,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/search', searchRoutes);
app.use(errorHandler);

describe('zoeken', () => {
  let vereniging: TestAssociation;
  let orkest: TestOrchestra;
  let lid: TestUser;
  let lidToken: string;
  let anderLid: TestUser;
  let anderLidToken: string;

  let andereVereniging: TestAssociation;
  let anderOrkest: TestOrchestra;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    anderLid = omgeving.musicCommitteeUser;
    anderLidToken = omgeving.musicCommitteeToken;
    orkest = createTestOrchestra(vereniging.id, { name: 'Harmonieorkest' });

    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
    anderOrkest = createTestOrchestra(andereVereniging.id, { name: 'Fanfare Elders' });
  });

  type Methode = 'get' | 'post' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/search${pad}`).set('Authorization', `Bearer ${token}`);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  function maakTitel(associationId: string, titel: string, overrides: Record<string, unknown> = {}): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO music_titles (id, title, arranger, association_id, youtube_url, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      titel,
      (overrides.arranger as string) ?? null,
      associationId,
      (overrides.youtubeUrl as string) ?? null,
      (overrides.deletedAt as string) ?? null,
    );
    return id;
  }

  function maakLijst(orchestraId: string, naam: string, overrides: Record<string, unknown> = {}): string {
    const id = uuidv4();
    db.prepare('INSERT INTO music_lists (id, name, orchestra_id, deleted_at) VALUES (?, ?, ?, ?)').run(
      id,
      naam,
      orchestraId,
      (overrides.deletedAt as string) ?? null,
    );
    return id;
  }

  function maakRepetitie(
    associationId: string,
    overrides: { orchestraId?: string | null; date?: string; location?: string; notes?: string } = {},
  ): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO rehearsals (id, association_id, orchestra_id, date, start_time, end_time, location, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      associationId,
      overrides.orchestraId ?? null,
      overrides.date ?? overDagen(7),
      '20:00',
      '22:00',
      overrides.location ?? null,
      overrides.notes ?? null,
    );
    return id;
  }

  /** Een datum een aantal dagen vanaf vandaag, als YYYY-MM-DD. */
  function overDagen(aantal: number): string {
    const datum = new Date();
    datum.setDate(datum.getDate() + aantal);
    return datum.toISOString().slice(0, 10);
  }

  const titelsVan = (body: { results: { type: string; title: string }[] }, type: string) =>
    body.results.filter((r) => r.type === type).map((r) => r.title);

  describe('GET /search', () => {
    it('vraagt om minstens twee tekens', async () => {
      const antwoord = await alsLid('get', '/?q=a');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual({ results: [], total: 0 });
    });

    it('geeft een lege uitslag zonder zoekterm', async () => {
      const antwoord = await alsLid('get', '/');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.total).toBe(0);
    });

    it('weigert een verzoek zonder token', async () => {
      const antwoord = await request(app).get('/api/search?q=test');
      expect(antwoord.status).toBe(401);
    });

    it('vindt een muziekstuk op titel', async () => {
      maakTitel(vereniging.id, 'Bohemian Rhapsody');
      const antwoord = await alsLid('get', '/?q=bohemian');
      expect(antwoord.status).toBe(200);
      expect(titelsVan(antwoord.body, 'music')).toEqual(['Bohemian Rhapsody']);
    });

    it('vindt een muziekstuk op arrangeur', async () => {
      maakTitel(vereniging.id, 'Ergens Anders', { arranger: 'Jan de Haan' });
      const antwoord = await alsLid('get', '/?q=de haan');
      expect(titelsVan(antwoord.body, 'music')).toEqual(['Ergens Anders']);
    });

    it('zoekt hoofdletterongevoelig', async () => {
      maakTitel(vereniging.id, 'MARS DER MEDICI');
      const antwoord = await alsLid('get', '/?q=medici');
      expect(titelsVan(antwoord.body, 'music')).toEqual(['MARS DER MEDICI']);
    });

    it('geeft geen muziek van een andere vereniging', async () => {
      maakTitel(andereVereniging.id, 'Geheime Ouverture');
      const antwoord = await alsLid('get', '/?q=geheime');
      expect(titelsVan(antwoord.body, 'music')).toEqual([]);
    });

    it('geeft een verwijderd muziekstuk niet terug', async () => {
      maakTitel(vereniging.id, 'Weggegooide Mars', { deletedAt: '2026-01-01 12:00:00' });
      const antwoord = await alsLid('get', '/?q=weggegooide');
      expect(titelsVan(antwoord.body, 'music')).toEqual([]);
    });

    it('vindt een lid op achternaam', async () => {
      createTestUser(vereniging.id, { firstName: 'Sanne', lastName: 'Vermeulen', email: 'sanne@test.nl' });
      const antwoord = await alsLid('get', '/?q=vermeulen');
      expect(titelsVan(antwoord.body, 'member')).toEqual(['Sanne Vermeulen']);
    });

    it('vindt een lid op e-mailadres', async () => {
      createTestUser(vereniging.id, { firstName: 'Tom', lastName: 'Bakker', email: 'trombone@test.nl' });
      const antwoord = await alsLid('get', '/?q=trombone');
      expect(titelsVan(antwoord.body, 'member')).toEqual(['Tom Bakker']);
    });

    it('geeft geen lid van een andere vereniging', async () => {
      createTestUser(andereVereniging.id, { firstName: 'Karel', lastName: 'Vermeulen', email: 'karel@elders.nl' });
      const antwoord = await alsLid('get', '/?q=vermeulen');
      expect(titelsVan(antwoord.body, 'member')).toEqual([]);
    });

    it('geeft een verwijderd lid niet terug', async () => {
      const weg = createTestUser(vereniging.id, {
        firstName: 'Weg',
        lastName: 'Gehaald',
        email: 'weg@test.nl',
      });
      db.prepare('UPDATE users SET deleted_at = ? WHERE id = ?').run('2026-01-01 12:00:00', weg.id);
      const antwoord = await alsLid('get', '/?q=gehaald');
      expect(titelsVan(antwoord.body, 'member')).toEqual([]);
    });

    it('vindt een orkest met het aantal leden en lijsten', async () => {
      db.prepare('INSERT INTO user_orchestras (user_id, orchestra_id) VALUES (?, ?)').run(lid.id, orkest.id);
      maakLijst(orkest.id, 'Concertlijst');
      const antwoord = await alsLid('get', '/?q=harmonieorkest');
      const orkesten = antwoord.body.results.filter((r: { type: string }) => r.type === 'orchestra');
      expect(orkesten).toHaveLength(1);
      expect(orkesten[0].metadata).toMatchObject({ memberCount: 1, listCount: 1 });
    });

    it('geeft geen orkest van een andere vereniging', async () => {
      const antwoord = await alsLid('get', '/?q=fanfare');
      expect(titelsVan(antwoord.body, 'orchestra')).toEqual([]);
    });

    it('vindt een muzieklijst via het orkest van de eigen vereniging', async () => {
      maakLijst(orkest.id, 'Kerstconcert 2026');
      const antwoord = await alsLid('get', '/?q=kerstconcert');
      expect(titelsVan(antwoord.body, 'list')).toEqual(['Kerstconcert 2026']);
    });

    it('geeft geen lijst van een andere vereniging', async () => {
      maakLijst(anderOrkest.id, 'Kerstconcert Elders');
      const antwoord = await alsLid('get', '/?q=kerstconcert');
      expect(titelsVan(antwoord.body, 'list')).toEqual([]);
    });

    it('geeft een verwijderde lijst niet terug', async () => {
      maakLijst(orkest.id, 'Oude Lijst', { deletedAt: '2026-01-01 12:00:00' });
      const antwoord = await alsLid('get', '/?q=oude lijst');
      expect(titelsVan(antwoord.body, 'list')).toEqual([]);
    });

    it('filtert lijsten op orkest wanneer orchestraId is meegegeven', async () => {
      const tweedeOrkest = createTestOrchestra(vereniging.id, { name: 'Slagwerkgroep' });
      maakLijst(orkest.id, 'Repertoire A');
      maakLijst(tweedeOrkest.id, 'Repertoire B');

      const alles = await alsLid('get', '/?q=repertoire');
      expect(titelsVan(alles.body, 'list').sort()).toEqual(['Repertoire A', 'Repertoire B']);

      const gefilterd = await alsLid('get', `/?q=repertoire&orchestraId=${tweedeOrkest.id}`);
      expect(titelsVan(gefilterd.body, 'list')).toEqual(['Repertoire B']);
    });

    it('vindt een repetitie op locatie', async () => {
      maakRepetitie(vereniging.id, { orchestraId: orkest.id, location: 'Dorpshuis De Brug' });
      const antwoord = await alsLid('get', '/?q=dorpshuis');
      const repetities = antwoord.body.results.filter((r: { type: string }) => r.type === 'rehearsal');
      expect(repetities).toHaveLength(1);
      expect(repetities[0].subtitle).toBe('Dorpshuis De Brug');
    });

    it('geeft een repetitie die al geweest is niet terug', async () => {
      maakRepetitie(vereniging.id, { orchestraId: orkest.id, location: 'Dorpshuis', date: overDagen(-3) });
      const antwoord = await alsLid('get', '/?q=dorpshuis');
      expect(antwoord.body.results.filter((r: { type: string }) => r.type === 'rehearsal')).toHaveLength(0);
    });

    it('vindt een verenigingsbrede repetitie zonder orkest van de eigen vereniging', async () => {
      maakRepetitie(vereniging.id, { orchestraId: null, location: 'Gezamenlijke repetitie Dorpshuis' });
      const antwoord = await alsLid('get', '/?q=gezamenlijke');
      expect(antwoord.body.results.filter((r: { type: string }) => r.type === 'rehearsal')).toHaveLength(1);
    });

    it('geeft geen verenigingsbrede repetitie van een andere vereniging', async () => {
      maakRepetitie(andereVereniging.id, {
        orchestraId: null,
        location: 'Clubhuis Elders',
        notes: 'Alleen voor onze leden',
      });
      const antwoord = await alsLid('get', '/?q=clubhuis');
      expect(antwoord.body.results.filter((r: { type: string }) => r.type === 'rehearsal')).toHaveLength(0);
    });

    it('geeft geen repetitie van een orkest van een andere vereniging', async () => {
      maakRepetitie(andereVereniging.id, { orchestraId: anderOrkest.id, location: 'Zaal Elders' });
      const antwoord = await alsLid('get', '/?q=zaal elders');
      expect(antwoord.body.results.filter((r: { type: string }) => r.type === 'rehearsal')).toHaveLength(0);
    });

    it('geeft snelkoppelingen naar instellingen', async () => {
      const antwoord = await alsLid('get', '/?q=thema');
      expect(titelsVan(antwoord.body, 'settings')).toContain('Thema');
    });

    it('beperkt de uitslag tot het gevraagde type', async () => {
      maakTitel(vereniging.id, 'Concert Mars');
      createTestUser(vereniging.id, { firstName: 'Concert', lastName: 'Ganger', email: 'cg@test.nl' });

      const antwoord = await alsLid('get', '/?q=concert&type=music');
      const typen = new Set(antwoord.body.results.map((r: { type: string }) => r.type));
      expect([...typen]).toEqual(['music']);
    });

    it('houdt limit op ten hoogste vijftig', async () => {
      for (let i = 0; i < 3; i++) maakTitel(vereniging.id, `Etude nummer ${i}`);
      const antwoord = await alsLid('get', '/?q=etude&limit=999');
      expect(antwoord.status).toBe(200);
      expect(titelsVan(antwoord.body, 'music')).toHaveLength(3);
    });

    it('respecteert een lagere limit', async () => {
      for (let i = 0; i < 4; i++) maakTitel(vereniging.id, `Etude nummer ${i}`);
      const antwoord = await alsLid('get', '/?q=etude&limit=2');
      expect(titelsVan(antwoord.body, 'music')).toHaveLength(2);
    });

    it('telt total gelijk aan het aantal resultaten', async () => {
      maakTitel(vereniging.id, 'Telbare Mars');
      const antwoord = await alsLid('get', '/?q=telbare');
      expect(antwoord.body.total).toBe(antwoord.body.results.length);
      expect(antwoord.body.query).toBe('telbare');
    });
  });

  describe('GET /search/suggestions', () => {
    it('vraagt om minstens twee tekens', async () => {
      const antwoord = await alsLid('get', '/suggestions?q=a');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual({ suggestions: [] });
    });

    it('vult een muziektitel aan vanaf het begin', async () => {
      maakTitel(vereniging.id, 'Toccata');
      const antwoord = await alsLid('get', '/suggestions?q=toc');
      expect(antwoord.body.suggestions).toContain('Toccata');
    });

    it('vult niet aan op een woord midden in de titel', async () => {
      maakTitel(vereniging.id, 'Grote Toccata');
      const antwoord = await alsLid('get', '/suggestions?q=toc');
      expect(antwoord.body.suggestions).not.toContain('Grote Toccata');
    });

    it('vult een lidnaam aan', async () => {
      createTestUser(vereniging.id, { firstName: 'Marieke', lastName: 'Peters', email: 'mp@test.nl' });
      const antwoord = await alsLid('get', '/suggestions?q=mari');
      expect(antwoord.body.suggestions).toContain('Marieke Peters');
    });

    it('suggereert niets van een andere vereniging', async () => {
      maakTitel(andereVereniging.id, 'Toccata Elders');
      createTestUser(andereVereniging.id, { firstName: 'Toon', lastName: 'Elders', email: 'te@elders.nl' });
      const antwoord = await alsLid('get', '/suggestions?q=to');
      expect(antwoord.body.suggestions).not.toContain('Toccata Elders');
      expect(antwoord.body.suggestions).not.toContain('Toon Elders');
    });

    it('suggereert geen verwijderd muziekstuk of verwijderd lid', async () => {
      maakTitel(vereniging.id, 'Sonate Weg', { deletedAt: '2026-01-01 12:00:00' });
      const weg = createTestUser(vereniging.id, { firstName: 'Sonja', lastName: 'Weg', email: 'sw@test.nl' });
      db.prepare('UPDATE users SET deleted_at = ? WHERE id = ?').run('2026-01-01 12:00:00', weg.id);

      const antwoord = await alsLid('get', '/suggestions?q=son');
      expect(antwoord.body.suggestions).not.toContain('Sonate Weg');
      expect(antwoord.body.suggestions).not.toContain('Sonja Weg');
    });

    it('geeft hoogstens tien suggesties', async () => {
      for (let i = 0; i < 8; i++) maakTitel(vereniging.id, `Prelude ${i}`);
      for (let i = 0; i < 8; i++) {
        createTestUser(vereniging.id, { firstName: `Preludia${i}`, lastName: 'Test', email: `p${i}@test.nl` });
      }
      const antwoord = await alsLid('get', '/suggestions?q=prel');
      expect(antwoord.body.suggestions.length).toBeLessThanOrEqual(10);
    });
  });

  describe('zoekgeschiedenis', () => {
    it('bewaart een zoekopdracht en geeft hem terug', async () => {
      const opslaan = await alsLid('post', '/recent').send({ query: 'mars der medici' });
      expect(opslaan.status).toBe(201);
      expect(opslaan.body.query).toBe('mars der medici');

      const ophalen = await alsLid('get', '/recent');
      expect(ophalen.body.searches.map((s: { query: string }) => s.query)).toEqual(['mars der medici']);
    });

    it('weigert een te korte zoekopdracht', async () => {
      const antwoord = await alsLid('post', '/recent').send({ query: 'a' });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een zoekopdracht die geen tekst is', async () => {
      const antwoord = await alsLid('post', '/recent').send({ query: 42 });
      expect(antwoord.status).toBe(400);
    });

    it('haalt spaties eromheen weg', async () => {
      await alsLid('post', '/recent').send({ query: '   toccata   ' });
      const ophalen = await alsLid('get', '/recent');
      expect(ophalen.body.searches[0].query).toBe('toccata');
    });

    it('bewaart dezelfde zoekopdracht niet twee keer', async () => {
      await alsLid('post', '/recent').send({ query: 'toccata' });
      await alsLid('post', '/recent').send({ query: 'TOCCATA' });

      const ophalen = await alsLid('get', '/recent');
      expect(ophalen.body.searches).toHaveLength(1);
    });

    it('bewaart hoogstens twintig zoekopdrachten', async () => {
      for (let i = 0; i < 25; i++) {
        await alsLid('post', '/recent').send({ query: `zoekterm ${i}` });
      }
      const ophalen = await alsLid('get', '/recent');
      expect(ophalen.body.searches.length).toBeLessThanOrEqual(20);
    });

    it('geeft hoogstens tien zoekopdrachten terug', async () => {
      for (let i = 0; i < 15; i++) {
        await alsLid('post', '/recent').send({ query: `zoekterm ${i}` });
      }
      const ophalen = await alsLid('get', '/recent');
      expect(ophalen.body.searches).toHaveLength(10);
    });

    it('houdt de geschiedenis van twee leden gescheiden', async () => {
      await alsLid('post', '/recent').send({ query: 'van het ene lid' });
      await als(anderLidToken, 'post', '/recent').send({ query: 'van het andere lid' });

      const eerste = await alsLid('get', '/recent');
      const tweede = await als(anderLidToken, 'get', '/recent');

      expect(eerste.body.searches.map((s: { query: string }) => s.query)).toEqual(['van het ene lid']);
      expect(tweede.body.searches.map((s: { query: string }) => s.query)).toEqual(['van het andere lid']);
    });

    it('verwijdert een eigen zoekopdracht', async () => {
      const opslaan = await alsLid('post', '/recent').send({ query: 'weg hiermee' });
      const verwijderen = await alsLid('delete', `/recent/${opslaan.body.id}`);
      expect(verwijderen.status).toBe(200);

      const ophalen = await alsLid('get', '/recent');
      expect(ophalen.body.searches).toHaveLength(0);
    });

    it('verwijdert niet de zoekopdracht van een ander lid', async () => {
      const vanAnder = await als(anderLidToken, 'post', '/recent').send({ query: 'niet van jou' });
      await alsLid('delete', `/recent/${vanAnder.body.id}`);

      const ophalen = await als(anderLidToken, 'get', '/recent');
      expect(ophalen.body.searches.map((s: { query: string }) => s.query)).toEqual(['niet van jou']);
    });

    it('wist de eigen geschiedenis en laat die van een ander lid staan', async () => {
      await alsLid('post', '/recent').send({ query: 'van mij' });
      await als(anderLidToken, 'post', '/recent').send({ query: 'van de ander' });

      const wissen = await alsLid('delete', '/recent');
      expect(wissen.status).toBe(200);

      expect((await alsLid('get', '/recent')).body.searches).toHaveLength(0);
      expect((await als(anderLidToken, 'get', '/recent')).body.searches).toHaveLength(1);
    });

    it('doet niet moeilijk over een zoekopdracht die niet bestaat', async () => {
      const antwoord = await alsLid('delete', `/recent/${uuidv4()}`);
      expect(antwoord.status).toBe(200);
    });
  });
});
