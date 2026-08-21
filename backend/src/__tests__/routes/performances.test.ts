/**
 * Uitvoeringsgeschiedenis: wat heeft de vereniging wanneer gespeeld.
 *
 * Dit bestand stond op nul. Alle zeven routes lezen uit concert_program via
 * een JOIN op concerts, en de verenigingsgrens ligt uitsluitend in die JOIN
 * (`c.association_id = ?`) - concert_program zelf heeft geen association_id.
 * Die grens is hier per route vastgelegd.
 *
 * Daarnaast: concerts kent een soft delete (`deleted_at`), en concerts.ts
 * filtert daar overal op. performances.ts deed dat nergens, waardoor een
 * weggegooid concert gewoon in de geschiedenis, de statistieken en de zoek-
 * resultaten bleef staan - en een stuk dat alleen op zo'n concert stond ten
 * onrechte niet meer "nooit gespeeld" was. De tests hieronder leggen het
 * gewenste gedrag vast.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import performancesRoutes from '../../routes/performances';
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
app.use('/api/performances', performancesRoutes);
app.use(errorHandler);

describe('uitvoeringsgeschiedenis', () => {
  let vereniging: TestAssociation;
  let lidToken: string;

  let andereVereniging: TestAssociation;
  let andereLid: TestUser;
  let andereToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    lidToken = omgeving.memberToken;

    // createTestEnvironment() gebruikt vaste e-mailadressen en users.email is
    // globaal uniek, dus de tweede vereniging wordt met de hand opgebouwd.
    andereVereniging = createTestAssociation({ name: 'Harmonie Buurdorp' });
    andereLid = createTestUser(andereVereniging.id, { email: `lid-b-${uuidv4()}@test.com` });
    andereToken = generateTestToken(andereLid);
  });

  const alsLid = (pad: string) =>
    request(app).get(`/api/performances${pad}`).set('Authorization', `Bearer ${lidToken}`);
  const alsAndereLid = (pad: string) =>
    request(app).get(`/api/performances${pad}`).set('Authorization', `Bearer ${andereToken}`);

  function maakConcert(
    associationId: string,
    opties: { naam?: string; datum?: string; type?: string; locatie?: string; verwijderd?: boolean } = {},
  ): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO concerts (id, association_id, name, date, location, concert_type, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      associationId,
      opties.naam || 'Voorjaarsconcert',
      opties.datum || '2025-04-12',
      opties.locatie || 'Dorpshuis',
      opties.type || 'regulier',
      opties.verwijderd ? '2025-06-01 10:00:00' : null,
    );
    return id;
  }

  function maakTitel(associationId: string, titel: string, opties: { verwijderd?: boolean } = {}): string {
    const id = uuidv4();
    db.prepare('INSERT INTO music_titles (id, title, composer, association_id, deleted_at) VALUES (?, ?, ?, ?, ?)').run(
      id,
      titel,
      'Componist',
      associationId,
      opties.verwijderd ? '2025-06-01 10:00:00' : null,
    );
    return id;
  }

  function maakProgrammaregel(
    concertId: string,
    opties: { titel?: string; componist?: string | null; titelId?: string | null } = {},
  ): string {
    const id = uuidv4();
    db.prepare(
      'INSERT INTO concert_program (id, concert_id, music_title_id, title, composer) VALUES (?, ?, ?, ?, ?)',
    ).run(
      id,
      concertId,
      opties.titelId ?? null,
      opties.titel || 'Fanfare Bolero',
      // Bewust geen ?? : een expliciete null moet null blijven, anders is de
      // test op "regel zonder componist" geen test.
      opties.componist === undefined ? 'Ravel' : opties.componist,
    );
    return id;
  }

  describe('authenticatie', () => {
    it('weigert een verzoek zonder token', async () => {
      const antwoord = await request(app).get('/api/performances/last-played');
      expect(antwoord.status).toBe(401);
    });
  });

  describe('GET /history', () => {
    it('eist titleId of title', async () => {
      const antwoord = await alsLid('/history');
      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('titleId');
    });

    it('geeft de concerten waarop de titel stond', async () => {
      const titelId = maakTitel(vereniging.id, 'Also sprach Zarathustra');
      const concertId = maakConcert(vereniging.id, { naam: 'Nieuwjaarsconcert', datum: '2025-01-05' });
      maakProgrammaregel(concertId, { titel: 'Also sprach Zarathustra', titelId });

      const antwoord = await alsLid(`/history?titleId=${titelId}`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0]).toMatchObject({
        title: 'Also sprach Zarathustra',
        concertName: 'Nieuwjaarsconcert',
        concertDate: '2025-01-05',
        concertLocation: 'Dorpshuis',
      });
    });

    it('sorteert de nieuwste uitvoering vooraan', async () => {
      const titelId = maakTitel(vereniging.id, 'Radetzky');
      const oud = maakConcert(vereniging.id, { naam: 'Oud', datum: '2020-01-01' });
      const nieuw = maakConcert(vereniging.id, { naam: 'Nieuw', datum: '2025-01-01' });
      maakProgrammaregel(oud, { titelId });
      maakProgrammaregel(nieuw, { titelId });

      const antwoord = await alsLid(`/history?titleId=${titelId}`);

      expect(antwoord.body.map((r: any) => r.concertName)).toEqual(['Nieuw', 'Oud']);
    });

    // De verenigingsgrens: het titel-id van een andere vereniging is geen
    // geheim (het staat in gedeelde muzieklijsten), dus het mag geen sleutel
    // zijn tot hun concertgeschiedenis.
    it('geeft niets terug voor een titel van een andere vereniging', async () => {
      const titelId = maakTitel(andereVereniging.id, 'Geheim Stuk');
      const concertId = maakConcert(andereVereniging.id, { naam: 'Concert van B' });
      maakProgrammaregel(concertId, { titel: 'Geheim Stuk', titelId });

      const antwoord = await alsLid(`/history?titleId=${titelId}`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual([]);
    });

    it('zoekt met title op naam binnen de eigen vereniging', async () => {
      const eigen = maakConcert(vereniging.id, { naam: 'Eigen concert' });
      maakProgrammaregel(eigen, { titel: 'Bolero' });
      const vreemd = maakConcert(andereVereniging.id, { naam: 'Concert van B' });
      maakProgrammaregel(vreemd, { titel: 'Bolero' });

      const antwoord = await alsLid('/history?title=Bole');

      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].concertName).toBe('Eigen concert');
    });

    it('laat een verwijderd concert weg uit de geschiedenis', async () => {
      const titelId = maakTitel(vereniging.id, 'Marche');
      const bewaard = maakConcert(vereniging.id, { naam: 'Bewaard' });
      const weggegooid = maakConcert(vereniging.id, { naam: 'Weggegooid', verwijderd: true });
      maakProgrammaregel(bewaard, { titelId });
      maakProgrammaregel(weggegooid, { titelId });

      const antwoord = await alsLid(`/history?titleId=${titelId}`);

      expect(antwoord.body.map((r: any) => r.concertName)).toEqual(['Bewaard']);
    });
  });

  describe('GET /last-played', () => {
    it('geeft per stuk de laatste datum en het aantal keren', async () => {
      const eerste = maakConcert(vereniging.id, { datum: '2023-05-01' });
      const tweede = maakConcert(vereniging.id, { datum: '2025-05-01' });
      maakProgrammaregel(eerste, { titel: 'Bolero', componist: 'Ravel' });
      maakProgrammaregel(tweede, { titel: 'Bolero', componist: 'Ravel' });

      const antwoord = await alsLid('/last-played');

      expect(antwoord.status).toBe(200);
      const bolero = antwoord.body.find((p: any) => p.title === 'Bolero');
      expect(bolero).toMatchObject({ lastPlayed: '2025-05-01', timesPlayed: 2 });
    });

    it('toont geen stukken van een andere vereniging', async () => {
      const vreemd = maakConcert(andereVereniging.id);
      maakProgrammaregel(vreemd, { titel: 'Stuk van B' });

      const antwoord = await alsLid('/last-played');

      expect(antwoord.body.map((p: any) => p.title)).not.toContain('Stuk van B');
    });

    it('telt een verwijderd concert niet mee', async () => {
      const bewaard = maakConcert(vereniging.id, { datum: '2023-05-01' });
      const weggegooid = maakConcert(vereniging.id, { datum: '2025-05-01', verwijderd: true });
      maakProgrammaregel(bewaard, { titel: 'Bolero' });
      maakProgrammaregel(weggegooid, { titel: 'Bolero' });

      const antwoord = await alsLid('/last-played');

      const bolero = antwoord.body.find((p: any) => p.title === 'Bolero');
      expect(bolero).toMatchObject({ lastPlayed: '2023-05-01', timesPlayed: 1 });
    });
  });

  describe('GET /never-played', () => {
    it('geeft de titels uit de bibliotheek die nooit op een programma stonden', async () => {
      const nooit = maakTitel(vereniging.id, 'Nooit gespeeld');
      const welEens = maakTitel(vereniging.id, 'Wel gespeeld');
      const concertId = maakConcert(vereniging.id);
      maakProgrammaregel(concertId, { titel: 'Wel gespeeld', titelId: welEens });

      const antwoord = await alsLid('/never-played');

      const ids = antwoord.body.map((p: any) => p.id);
      expect(ids).toContain(nooit);
      expect(ids).not.toContain(welEens);
    });

    it('laat een verwijderde titel weg', async () => {
      const verwijderd = maakTitel(vereniging.id, 'Uit de kast', { verwijderd: true });

      const antwoord = await alsLid('/never-played');

      expect(antwoord.body.map((p: any) => p.id)).not.toContain(verwijderd);
    });

    it('toont geen titels van een andere vereniging', async () => {
      const vreemdeTitel = maakTitel(andereVereniging.id, 'Titel van B');

      const antwoord = await alsLid('/never-played');

      expect(antwoord.body.map((p: any) => p.id)).not.toContain(vreemdeTitel);
    });

    // Een stuk dat alleen op een weggegooid concert stond is in de praktijk
    // nooit uitgevoerd: het concert bestaat niet meer.
    it('rekent een titel die alleen op een verwijderd concert stond weer als nooit gespeeld', async () => {
      const titelId = maakTitel(vereniging.id, 'Alleen op een verwijderd concert');
      const weggegooid = maakConcert(vereniging.id, { verwijderd: true });
      maakProgrammaregel(weggegooid, { titelId });

      const antwoord = await alsLid('/never-played');

      expect(antwoord.body.map((p: any) => p.id)).toContain(titelId);
    });
  });

  describe('GET /most-played', () => {
    it('sorteert op aantal uitvoeringen', async () => {
      const c1 = maakConcert(vereniging.id, { datum: '2021-01-01' });
      const c2 = maakConcert(vereniging.id, { datum: '2022-01-01' });
      const c3 = maakConcert(vereniging.id, { datum: '2023-01-01' });
      maakProgrammaregel(c1, { titel: 'Vaak' });
      maakProgrammaregel(c2, { titel: 'Vaak' });
      maakProgrammaregel(c3, { titel: 'Vaak' });
      maakProgrammaregel(c1, { titel: 'Zelden' });

      const antwoord = await alsLid('/most-played');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body[0]).toMatchObject({
        title: 'Vaak',
        timesPlayed: 3,
        firstPlayed: '2021-01-01',
        lastPlayed: '2023-01-01',
      });
    });

    it('respecteert limit', async () => {
      const concertId = maakConcert(vereniging.id);
      maakProgrammaregel(concertId, { titel: 'Een' });
      maakProgrammaregel(concertId, { titel: 'Twee' });

      const antwoord = await alsLid('/most-played?limit=1');

      expect(antwoord.body).toHaveLength(1);
    });

    it('klemt een absurde limit op honderd en valt terug op twintig bij onzin', async () => {
      const concertId = maakConcert(vereniging.id);
      maakProgrammaregel(concertId, { titel: 'Een' });

      expect((await alsLid('/most-played?limit=99999')).status).toBe(200);
      expect((await alsLid('/most-played?limit=onzin')).status).toBe(200);
    });

    it('telt een verwijderd concert niet mee', async () => {
      const bewaard = maakConcert(vereniging.id);
      const weggegooid = maakConcert(vereniging.id, { verwijderd: true });
      maakProgrammaregel(bewaard, { titel: 'Bolero' });
      maakProgrammaregel(weggegooid, { titel: 'Bolero' });

      const antwoord = await alsLid('/most-played');

      expect(antwoord.body.find((p: any) => p.title === 'Bolero').timesPlayed).toBe(1);
    });
  });

  describe('GET /by-year', () => {
    it('telt concerten en programmaregels per jaar', async () => {
      const c1 = maakConcert(vereniging.id, { datum: '2024-03-01' });
      const c2 = maakConcert(vereniging.id, { datum: '2024-11-01' });
      maakProgrammaregel(c1, { titel: 'Een' });
      maakProgrammaregel(c1, { titel: 'Twee' });
      maakProgrammaregel(c2, { titel: 'Een' });

      const antwoord = await alsLid('/by-year');

      const jaar = antwoord.body.find((s: any) => s.year === '2024');
      expect(jaar).toMatchObject({ concertCount: 2, pieceCount: 3, uniquePieces: 2 });
    });

    // De LEFT JOIN-valkuil: een concert zonder programma levert een rij met
    // NULL-kolommen. COUNT(cp.id) telt NULL niet mee, COUNT(*) wel - dat zou
    // hier ten onrechte 1 opleveren.
    it('telt nul stukken voor een concert zonder programma', async () => {
      maakConcert(vereniging.id, { datum: '2019-06-01' });

      const antwoord = await alsLid('/by-year');

      const jaar = antwoord.body.find((s: any) => s.year === '2019');
      expect(jaar).toMatchObject({ concertCount: 1, pieceCount: 0, uniquePieces: 0 });
    });

    it('telt de concerten van een andere vereniging niet mee', async () => {
      maakConcert(andereVereniging.id, { datum: '2018-06-01' });

      const antwoord = await alsLid('/by-year');

      expect(antwoord.body.find((s: any) => s.year === '2018')).toBeUndefined();
    });

    it('telt een verwijderd concert niet mee', async () => {
      maakConcert(vereniging.id, { datum: '2017-06-01', verwijderd: true });

      const antwoord = await alsLid('/by-year');

      expect(antwoord.body.find((s: any) => s.year === '2017')).toBeUndefined();
    });
  });

  describe('GET /by-composer', () => {
    it('telt per componist', async () => {
      const c1 = maakConcert(vereniging.id, { datum: '2024-01-01' });
      const c2 = maakConcert(vereniging.id, { datum: '2025-01-01' });
      maakProgrammaregel(c1, { titel: 'Bolero', componist: 'Ravel' });
      maakProgrammaregel(c2, { titel: 'Pavane', componist: 'Ravel' });

      const antwoord = await alsLid('/by-composer');

      expect(antwoord.body[0]).toMatchObject({
        composer: 'Ravel',
        timesPlayed: 2,
        uniquePieces: 2,
        lastPlayed: '2025-01-01',
      });
    });

    it('slaat regels zonder componist over', async () => {
      const concertId = maakConcert(vereniging.id);
      maakProgrammaregel(concertId, { titel: 'Zonder', componist: null });
      maakProgrammaregel(concertId, { titel: 'Leeg', componist: '' });

      const antwoord = await alsLid('/by-composer');

      expect(antwoord.body).toEqual([]);
    });

    it('telt een verwijderd concert niet mee', async () => {
      const weggegooid = maakConcert(vereniging.id, { verwijderd: true });
      maakProgrammaregel(weggegooid, { titel: 'Bolero', componist: 'Ravel' });

      const antwoord = await alsLid('/by-composer');

      expect(antwoord.body).toEqual([]);
    });
  });

  describe('GET /search', () => {
    it('geeft een lege lijst bij minder dan twee tekens', async () => {
      const concertId = maakConcert(vereniging.id);
      maakProgrammaregel(concertId, { titel: 'Bolero' });

      expect((await alsLid('/search?q=b')).body).toEqual([]);
      expect((await alsLid('/search')).body).toEqual([]);
    });

    it('vindt op titel en op componist', async () => {
      const concertId = maakConcert(vereniging.id, { naam: 'Gala' });
      maakProgrammaregel(concertId, { titel: 'Bolero', componist: 'Ravel' });

      expect((await alsLid('/search?q=ole')).body[0]).toMatchObject({ title: 'Bolero', concertName: 'Gala' });
      expect((await alsLid('/search?q=Rav')).body[0]).toMatchObject({ composer: 'Ravel' });
    });

    it('zoekt niet in de geschiedenis van een andere vereniging', async () => {
      const vreemd = maakConcert(andereVereniging.id, { naam: 'Gala van B' });
      maakProgrammaregel(vreemd, { titel: 'Bolero', componist: 'Ravel' });

      const antwoord = await alsAndereLid('/search?q=ole');
      expect(antwoord.body).toHaveLength(1);

      expect((await alsLid('/search?q=ole')).body).toEqual([]);
    });

    it('vindt een verwijderd concert niet', async () => {
      const weggegooid = maakConcert(vereniging.id, { verwijderd: true });
      maakProgrammaregel(weggegooid, { titel: 'Bolero' });

      expect((await alsLid('/search?q=ole')).body).toEqual([]);
    });
  });
});
