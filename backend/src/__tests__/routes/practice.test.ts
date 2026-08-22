/**
 * Oefenlogboek en oefendoelen: hoeveel heeft een lid op welk stuk geoefend.
 *
 * Dit bestand stond op nul. Het gaat om persoonsgegevens van het scherpste
 * soort: hoe vaak iemand thuis studeert. De routes gaan daar strak mee om -
 * elke query is aan `user_id = req.user.id` gebonden en er is geen enkele
 * route waarmee iemand anders het logboek van een lid kan opvragen, ook een
 * dirigent of beheerder niet. Dat is een ontwerpkeuze en die is hieronder
 * expliciet vastgelegd, zodat een latere "even meekijken"-route niet
 * ongemerkt binnenglipt.
 *
 * De verenigingsgrens ligt bij het aanmaken: practice_logs heeft zelf geen
 * association_id, dus de enige plek waar hij gecontroleerd kan worden is de
 * titel die je opgeeft.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import practiceRoutes from '../../routes/practice';
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
app.use('/api/practice', practiceRoutes);
app.use(errorHandler);

/** 'YYYY-MM-DD HH:MM:SS' voor n dagen geleden; sqlite vergelijkt dit als tekst. */
function dagenGeleden(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.toISOString().split('T')[0]} 12:00:00`;
}

describe('oefenlogboek', () => {
  let vereniging: TestAssociation;
  let lid: TestUser;
  let lidToken: string;
  let anderLid: TestUser;
  let anderLidToken: string;
  let beheerderToken: string;

  let andereVereniging: TestAssociation;

  let titelId: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    anderLid = omgeving.musicCommitteeUser;
    anderLidToken = omgeving.musicCommitteeToken;
    beheerderToken = omgeving.adminToken;

    // createTestEnvironment() gebruikt vaste e-mailadressen en users.email is
    // globaal uniek, dus de tweede vereniging wordt met de hand opgebouwd.
    andereVereniging = createTestAssociation({ name: 'Harmonie Buurdorp' });

    titelId = maakTitel(vereniging.id, 'Also sprach Zarathustra');
  });

  type Methode = 'get' | 'post' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/practice${pad}`).set('Authorization', `Bearer ${token}`);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  function maakTitel(associationId: string, titel: string, arrangeur: string | null = null): string {
    const id = uuidv4();
    db.prepare('INSERT INTO music_titles (id, title, arranger, association_id) VALUES (?, ?, ?, ?)').run(
      id,
      titel,
      arrangeur,
      associationId,
    );
    return id;
  }

  /** Schrijft rechtstreeks in het logboek, zodat practiced_at gestuurd kan worden. */
  function logOefening(
    userId: string,
    opties: { titelId?: string; minuten?: number; wanneer?: string; notitie?: string | null } = {},
  ): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO practice_logs (id, user_id, music_title_id, duration_minutes, notes, practiced_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      userId,
      opties.titelId || titelId,
      opties.minuten ?? 30,
      opties.notitie ?? null,
      opties.wanneer || dagenGeleden(0),
    );
    return id;
  }

  describe('GET /', () => {
    it('weigert een verzoek zonder token', async () => {
      expect((await request(app).get('/api/practice')).status).toBe(401);
    });

    it('geeft de eigen oefensessies met de titelgegevens erbij', async () => {
      const anderTitelId = maakTitel(vereniging.id, 'Bolero', 'Ravel');
      logOefening(lid.id, { titelId: anderTitelId, minuten: 45, notitie: 'maat 32 lastig' });

      const antwoord = await alsLid('get', '/');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0]).toMatchObject({
        durationMinutes: 45,
        notes: 'maat 32 lastig',
        musicTitle: { id: anderTitelId, title: 'Bolero', arranger: 'Ravel' },
      });
    });

    // De grens tussen leden onderling. Oefengedrag is persoonlijk; er is geen
    // route waarmee iemand het logboek van een ander opvraagt, ook niet met
    // een filter of een id.
    it('toont het logboek van een ander lid niet', async () => {
      logOefening(anderLid.id, { minuten: 90 });

      expect((await alsLid('get', '/')).body).toEqual([]);
      expect((await als(anderLidToken, 'get', '/')).body).toHaveLength(1);
    });

    it('laat ook een beheerder niet meekijken in het logboek van een lid', async () => {
      logOefening(lid.id, { minuten: 90 });

      expect((await als(beheerderToken, 'get', '/')).body).toEqual([]);
    });

    it('filtert op musicTitleId', async () => {
      const anderTitelId = maakTitel(vereniging.id, 'Bolero');
      logOefening(lid.id, { titelId });
      logOefening(lid.id, { titelId: anderTitelId });

      const antwoord = await alsLid('get', `/?musicTitleId=${anderTitelId}`);

      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].musicTitle.id).toBe(anderTitelId);
    });

    it('filtert op fromDate en toDate', async () => {
      logOefening(lid.id, { wanneer: dagenGeleden(40), minuten: 10 });
      logOefening(lid.id, { wanneer: dagenGeleden(2), minuten: 20 });

      const recent = await alsLid('get', `/?fromDate=${dagenGeleden(7).split(' ')[0]}`);
      expect(recent.body.map((l: any) => l.durationMinutes)).toEqual([20]);

      const oud = await alsLid('get', `/?toDate=${dagenGeleden(7).split(' ')[0]}`);
      expect(oud.body.map((l: any) => l.durationMinutes)).toEqual([10]);
    });

    it('zet de meest recente sessie vooraan', async () => {
      logOefening(lid.id, { wanneer: dagenGeleden(5), minuten: 10 });
      logOefening(lid.id, { wanneer: dagenGeleden(1), minuten: 20 });

      const antwoord = await alsLid('get', '/');

      expect(antwoord.body.map((l: any) => l.durationMinutes)).toEqual([20, 10]);
    });
  });

  describe('POST /', () => {
    it('legt een oefensessie vast op naam van de ingelogde gebruiker', async () => {
      const antwoord = await alsLid('post', '/').send({
        musicTitleId: titelId,
        durationMinutes: 25,
        notes: 'langzaam gestudeerd',
      });

      expect(antwoord.status).toBe(201);

      const regel = db.prepare('SELECT * FROM practice_logs WHERE id = ?').get(antwoord.body.id) as any;
      expect(regel).toMatchObject({
        user_id: lid.id,
        music_title_id: titelId,
        duration_minutes: 25,
        notes: 'langzaam gestudeerd',
      });
    });

    it('mag zonder notitie', async () => {
      const antwoord = await alsLid('post', '/').send({ musicTitleId: titelId, durationMinutes: 15 });

      expect(antwoord.status).toBe(201);
      const regel = db.prepare('SELECT notes FROM practice_logs WHERE id = ?').get(antwoord.body.id) as any;
      expect(regel.notes).toBeNull();
    });

    // De verenigingsgrens. Titel-ids zijn niet geheim (ze staan in gedeelde
    // muzieklijsten), dus dit is de plek waar hij gecontroleerd moet worden.
    it('weigert een titel van een andere vereniging', async () => {
      const vreemdeTitel = maakTitel(andereVereniging.id, 'Geheim Stuk van B');

      const antwoord = await alsLid('post', '/').send({ musicTitleId: vreemdeTitel, durationMinutes: 30 });

      expect(antwoord.status).toBe(404);
      expect(db.prepare('SELECT COUNT(*) as n FROM practice_logs').get()).toMatchObject({ n: 0 });
    });

    it('weigert een onbekende titel', async () => {
      const antwoord = await alsLid('post', '/').send({ musicTitleId: uuidv4(), durationMinutes: 30 });
      expect(antwoord.status).toBe(404);
    });

    it('weigert een ongeldig titel-id en een ongeldige duur', async () => {
      expect((await alsLid('post', '/').send({ musicTitleId: 'geen-uuid', durationMinutes: 30 })).status).toBe(400);
      expect((await alsLid('post', '/').send({ musicTitleId: titelId, durationMinutes: 0 })).status).toBe(400);
      expect((await alsLid('post', '/').send({ musicTitleId: titelId, durationMinutes: 12.5 })).status).toBe(400);
      expect((await alsLid('post', '/').send({ musicTitleId: titelId })).status).toBe(400);
    });

    // Het logboek hoort over de aanvrager te gaan; een userId in de body mag
    // daar niets aan veranderen.
    it('negeert een userId uit de body', async () => {
      const antwoord = await alsLid('post', '/').send({
        musicTitleId: titelId,
        durationMinutes: 20,
        userId: anderLid.id,
        user_id: anderLid.id,
      });

      const regel = db.prepare('SELECT user_id FROM practice_logs WHERE id = ?').get(antwoord.body.id) as any;
      expect(regel.user_id).toBe(lid.id);
    });
  });

  describe('DELETE /:id', () => {
    it('verwijdert de eigen oefensessie', async () => {
      const id = logOefening(lid.id);

      const antwoord = await alsLid('delete', `/${id}`);

      expect(antwoord.status).toBe(200);
      expect(db.prepare('SELECT id FROM practice_logs WHERE id = ?').get(id)).toBeUndefined();
    });

    // De grens tussen leden: een id uit het pad mag nooit zonder eigenaars-
    // controle in de DELETE belanden.
    it('laat de oefensessie van een ander lid staan', async () => {
      const id = logOefening(anderLid.id);

      const antwoord = await alsLid('delete', `/${id}`);

      expect(antwoord.status).toBe(404);
      expect(db.prepare('SELECT id FROM practice_logs WHERE id = ?').get(id)).toBeDefined();
    });

    it('geeft 404 voor een onbekende sessie', async () => {
      expect((await alsLid('delete', `/${uuidv4()}`)).status).toBe(404);
    });
  });

  describe('GET /stats', () => {
    it('telt totaal, week en maand apart', async () => {
      logOefening(lid.id, { minuten: 10, wanneer: dagenGeleden(1) });
      logOefening(lid.id, { minuten: 20, wanneer: dagenGeleden(15) });
      logOefening(lid.id, { minuten: 40, wanneer: dagenGeleden(200) });

      const antwoord = await alsLid('get', '/stats');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toMatchObject({ totalMinutes: 70, weekMinutes: 10, monthMinutes: 30 });
    });

    it('geeft nullen voor een lid dat nog nooit geoefend heeft', async () => {
      const antwoord = await alsLid('get', '/stats');

      expect(antwoord.body).toMatchObject({
        totalMinutes: 0,
        weekMinutes: 0,
        monthMinutes: 0,
        currentStreak: 0,
        mostPracticed: [],
      });
    });

    it('rangschikt de meest geoefende stukken', async () => {
      const bolero = maakTitel(vereniging.id, 'Bolero', 'Ravel');
      logOefening(lid.id, { titelId, minuten: 10 });
      logOefening(lid.id, { titelId: bolero, minuten: 30 });
      logOefening(lid.id, { titelId: bolero, minuten: 30 });

      const antwoord = await alsLid('get', '/stats');

      expect(antwoord.body.mostPracticed[0]).toMatchObject({
        id: bolero,
        title: 'Bolero',
        arranger: 'Ravel',
        totalMinutes: 60,
        sessionCount: 2,
      });
      expect(antwoord.body.mostPracticed[1]).toMatchObject({ id: titelId, totalMinutes: 10 });
    });

    it('telt een reeks aaneengesloten dagen als streak', async () => {
      logOefening(lid.id, { wanneer: dagenGeleden(0) });
      logOefening(lid.id, { wanneer: dagenGeleden(1) });
      logOefening(lid.id, { wanneer: dagenGeleden(2) });
      logOefening(lid.id, { wanneer: dagenGeleden(5) });

      const antwoord = await alsLid('get', '/stats');

      expect(antwoord.body.currentStreak).toBe(3);
    });

    it('rekent gisteren nog mee als er vandaag nog niet geoefend is', async () => {
      logOefening(lid.id, { wanneer: dagenGeleden(1) });
      logOefening(lid.id, { wanneer: dagenGeleden(2) });

      const antwoord = await alsLid('get', '/stats');

      expect(antwoord.body.currentStreak).toBe(2);
    });

    it('rekent de sessies van een ander lid niet mee', async () => {
      logOefening(anderLid.id, { minuten: 500 });

      const antwoord = await alsLid('get', '/stats');

      expect(antwoord.body).toMatchObject({ totalMinutes: 0, mostPracticed: [] });
    });
  });

  describe('oefendoelen', () => {
    it('begint zonder doelen en zonder voortgang', async () => {
      const antwoord = await alsLid('get', '/goals');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toMatchObject({ goals: [], progress: { daily: 0, weekly: 0 } });
    });

    it('maakt een doel aan en geeft het terug', async () => {
      const aanmaak = await alsLid('post', '/goals').send({ goalType: 'daily', targetMinutes: 45 });
      expect(aanmaak.status).toBe(201);

      const antwoord = await alsLid('get', '/goals');

      expect(antwoord.body.goals).toHaveLength(1);
      expect(antwoord.body.goals[0]).toMatchObject({
        id: aanmaak.body.id,
        goalType: 'daily',
        targetMinutes: 45,
        isActive: true,
      });
    });

    // Upsert: een tweede POST voor hetzelfde doeltype hoort het bestaande doel
    // bij te werken, niet een tweede rij te maken.
    it('werkt een bestaand doel bij in plaats van er een tweede aan te maken', async () => {
      const eerste = await alsLid('post', '/goals').send({ goalType: 'weekly', targetMinutes: 120 });
      const tweede = await alsLid('post', '/goals').send({ goalType: 'weekly', targetMinutes: 200 });

      expect(tweede.status).toBe(200);
      expect(tweede.body.id).toBe(eerste.body.id);

      const antwoord = await alsLid('get', '/goals');
      expect(antwoord.body.goals).toHaveLength(1);
      expect(antwoord.body.goals[0].targetMinutes).toBe(200);
    });

    it('weigert een onbekend doeltype en een onmogelijk aantal minuten', async () => {
      expect((await alsLid('post', '/goals').send({ goalType: 'jaarlijks', targetMinutes: 60 })).status).toBe(400);
      expect((await alsLid('post', '/goals').send({ goalType: 'daily', targetMinutes: 0 })).status).toBe(400);
      expect((await alsLid('post', '/goals').send({ goalType: 'daily', targetMinutes: 1441 })).status).toBe(400);
      expect((await alsLid('post', '/goals').send({ goalType: 'daily', targetMinutes: '60' })).status).toBe(400);
    });

    it('telt de voortgang van vandaag en van deze week', async () => {
      logOefening(lid.id, { minuten: 25, wanneer: dagenGeleden(0) });

      const antwoord = await alsLid('get', '/goals');

      expect(antwoord.body.progress.daily).toBe(25);
      expect(antwoord.body.progress.weekly).toBeGreaterThanOrEqual(25);
    });

    it('rekent de oefentijd van een ander lid niet mee in de voortgang', async () => {
      logOefening(anderLid.id, { minuten: 300, wanneer: dagenGeleden(0) });

      const antwoord = await alsLid('get', '/goals');

      expect(antwoord.body.progress).toMatchObject({ daily: 0, weekly: 0 });
    });

    it('toont de doelen van een ander lid niet', async () => {
      const eigen = await alsLid('post', '/goals').send({ goalType: 'daily', targetMinutes: 45 });

      const antwoord = await als(anderLidToken, 'get', '/goals');

      expect(antwoord.body.goals.map((g: any) => g.id)).not.toContain(eigen.body.id);
    });

    it('verwijdert het eigen doel', async () => {
      const doel = await alsLid('post', '/goals').send({ goalType: 'daily', targetMinutes: 45 });

      const antwoord = await alsLid('delete', `/goals/${doel.body.id}`);

      expect(antwoord.status).toBe(200);
      expect((await alsLid('get', '/goals')).body.goals).toEqual([]);
    });

    it('laat het doel van een ander lid staan', async () => {
      const doel = await als(anderLidToken, 'post', '/goals').send({ goalType: 'daily', targetMinutes: 45 });

      const antwoord = await alsLid('delete', `/goals/${doel.body.id}`);

      expect(antwoord.status).toBe(404);
      expect(db.prepare('SELECT id FROM practice_goals WHERE id = ?').get(doel.body.id)).toBeDefined();
    });

    // Express matcht op registratievolgorde en DELETE /:id staat boven
    // DELETE /goals/:id. Omdat ':id' niet over een schuine streep heen matcht
    // valt /goals/<id> er niet in - maar dat is precies het soort detail dat
    // bij een herschikking stilletjes omvalt, dus het staat hier vast.
    it('vangt DELETE /goals/:id niet af met de route voor oefensessies', async () => {
      const doel = await alsLid('post', '/goals').send({ goalType: 'weekly', targetMinutes: 90 });

      const antwoord = await alsLid('delete', `/goals/${doel.body.id}`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.message).toContain('Doel');
    });

    it('geeft 404 voor een onbekend doel', async () => {
      expect((await alsLid('delete', `/goals/${uuidv4()}`)).status).toBe(404);
    });
  });
});
