/**
 * Activiteitenlog: wie heeft wat bekeken of gedownload.
 *
 * Dit bestand stond op nul. Het log gaat over gedrag van individuele leden,
 * dus twee grenzen tellen hier: /stats en /feed zijn alleen voor de
 * muziekcommissie en de beheerder (een gewoon lid mag niet zien wat de rest
 * uitspookt), en beide mogen uitsluitend over de eigen vereniging gaan.
 *
 * activity_log heeft zelf geen association_id - de vereniging komt uit de
 * JOIN op users. Het entity_id daarentegen komt rechtstreeks uit de body van
 * POST /log en wordt nergens gecontroleerd. In de feed werd dat id gebruikt
 * om de titel op te zoeken zonder te kijken van wie die titel was, waardoor
 * een lid met een id uit een andere vereniging de naam van dat stuk in het
 * eigen overzicht kon laten verschijnen. Die twee subqueries zijn nu op de
 * vereniging afgebakend.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import activityRoutes from '../../routes/activity';
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
app.use('/api/activity', activityRoutes);
app.use(errorHandler);

describe('activiteitenlog', () => {
  let vereniging: TestAssociation;
  let lid: TestUser;
  let lidToken: string;
  let commissieToken: string;
  let beheerderToken: string;

  let andereVereniging: TestAssociation;
  let andereLid: TestUser;
  let andereToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    commissieToken = omgeving.musicCommitteeToken;
    beheerderToken = omgeving.adminToken;

    // createTestEnvironment() gebruikt vaste e-mailadressen en users.email is
    // globaal uniek, dus de tweede vereniging wordt met de hand opgebouwd.
    andereVereniging = createTestAssociation({ name: 'Harmonie Buurdorp' });
    andereLid = createTestUser(andereVereniging.id, { email: `lid-b-${uuidv4()}@test.com`, role: 'admin' });
    andereToken = generateTestToken(andereLid);
  });

  type Methode = 'get' | 'post';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/activity${pad}`).set('Authorization', `Bearer ${token}`);

  function maakTitel(associationId: string, titel: string): string {
    const id = uuidv4();
    db.prepare('INSERT INTO music_titles (id, title, association_id) VALUES (?, ?, ?)').run(id, titel, associationId);
    return id;
  }

  /** Schrijft rechtstreeks in het log, zodat created_at gestuurd kan worden. */
  function logRegel(
    userId: string,
    opties: { actie?: string; type?: string; entityId?: string; wanneer?: string } = {},
  ): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO activity_log (id, user_id, action_type, entity_type, entity_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      userId,
      opties.actie || 'view',
      opties.type || 'music_piece',
      opties.entityId || uuidv4(),
      opties.wanneer || new Date().toISOString().replace('T', ' ').slice(0, 19),
    );
    return id;
  }

  describe('POST /log', () => {
    it('weigert een verzoek zonder token', async () => {
      const antwoord = await request(app).post('/api/activity/log').send({});
      expect(antwoord.status).toBe(401);
    });

    it('eist actionType, entityType en entityId', async () => {
      for (const body of [
        { entityType: 'music_piece', entityId: uuidv4() },
        { actionType: 'view', entityId: uuidv4() },
        { actionType: 'view', entityType: 'music_piece' },
      ]) {
        const antwoord = await als(lidToken, 'post', '/log').send(body);
        expect(antwoord.status).toBe(400);
      }
    });

    it('legt de regel vast op naam van de ingelogde gebruiker', async () => {
      const stuk = createTestMusicPiece(vereniging.id);

      const antwoord = await als(lidToken, 'post', '/log').send({
        actionType: 'download',
        entityType: 'music_piece',
        entityId: stuk.id,
      });

      expect(antwoord.status).toBe(201);
      expect(antwoord.body.success).toBe(true);

      const regel = db.prepare('SELECT * FROM activity_log WHERE id = ?').get(antwoord.body.id) as any;
      expect(regel).toMatchObject({
        user_id: lid.id,
        action_type: 'download',
        entity_type: 'music_piece',
        entity_id: stuk.id,
      });
      expect(regel.metadata).toBeNull();
    });

    // Het log hoort over de aanvrager te gaan; een userId in de body mag daar
    // niets aan veranderen, anders kan een lid activiteit op naam van een
    // ander schrijven.
    it('negeert een userId uit de body', async () => {
      const antwoord = await als(lidToken, 'post', '/log').send({
        actionType: 'view',
        entityType: 'music_piece',
        entityId: uuidv4(),
        userId: andereLid.id,
        user_id: andereLid.id,
      });

      const regel = db.prepare('SELECT user_id FROM activity_log WHERE id = ?').get(antwoord.body.id) as any;
      expect(regel.user_id).toBe(lid.id);
    });

    it('slaat metadata op als JSON', async () => {
      const antwoord = await als(lidToken, 'post', '/log').send({
        actionType: 'view',
        entityType: 'music_title',
        entityId: uuidv4(),
        metadata: { page: 3, bron: 'zoekscherm' },
      });

      const regel = db.prepare('SELECT metadata FROM activity_log WHERE id = ?').get(antwoord.body.id) as any;
      expect(JSON.parse(regel.metadata)).toEqual({ page: 3, bron: 'zoekscherm' });
    });
  });

  describe('GET /stats', () => {
    it('weigert een verzoek zonder token', async () => {
      expect((await request(app).get('/api/activity/stats')).status).toBe(401);
    });

    it('houdt een gewoon lid buiten de statistieken', async () => {
      const antwoord = await als(lidToken, 'get', '/stats');
      expect(antwoord.status).toBe(403);
    });

    it('laat de muziekcommissie en de beheerder wel binnen', async () => {
      expect((await als(commissieToken, 'get', '/stats')).status).toBe(200);
      expect((await als(beheerderToken, 'get', '/stats')).status).toBe(200);
    });

    it('telt de meest bekeken en gedownloade stukken van de eigen vereniging', async () => {
      const stuk = createTestMusicPiece(vereniging.id, { title: 'Bolero' });
      logRegel(lid.id, { actie: 'view', entityId: stuk.id });
      logRegel(lid.id, { actie: 'download', entityId: stuk.id });

      const antwoord = await als(commissieToken, 'get', '/stats');

      const bolero = antwoord.body.topPieces.find((p: any) => p.id === stuk.id);
      expect(bolero).toMatchObject({ title: 'Bolero', count: 2 });
    });

    it('telt andere handelingen dan bekijken en downloaden niet mee', async () => {
      const stuk = createTestMusicPiece(vereniging.id);
      logRegel(lid.id, { actie: 'print', entityId: stuk.id });

      const antwoord = await als(commissieToken, 'get', '/stats');

      expect(antwoord.body.topPieces).toEqual([]);
    });

    // De verenigingsgrens op de stukken: het id van een stuk uit een andere
    // vereniging mag geen titel opleveren in ons overzicht.
    it('telt een stuk van een andere vereniging niet mee', async () => {
      const vreemdStuk = createTestMusicPiece(andereVereniging.id, { title: 'Stuk van B' });
      logRegel(lid.id, { actie: 'view', entityId: vreemdStuk.id });

      const antwoord = await als(commissieToken, 'get', '/stats');

      expect(antwoord.body.topPieces).toEqual([]);
    });

    // De verenigingsgrens op de gebruikers: activiteit van een lid uit een
    // andere vereniging hoort niet in onze tellingen te staan.
    it('telt activiteit van een lid van een andere vereniging niet mee', async () => {
      logRegel(andereLid.id, { actie: 'download' });

      const antwoord = await als(commissieToken, 'get', '/stats');

      expect(antwoord.body.userActivity.map((u: any) => u.id)).not.toContain(andereLid.id);
      expect(antwoord.body.totals.total_activities).toBe(0);
    });

    it('kijkt alleen binnen de opgegeven periode terug', async () => {
      logRegel(lid.id, { actie: 'view', wanneer: '2020-01-01 12:00:00' });

      const kort = await als(commissieToken, 'get', '/stats?period=7');
      expect(kort.body.totals.total_activities).toBe(0);

      const lang = await als(commissieToken, 'get', '/stats?period=9999');
      expect(lang.body.totals.total_activities).toBe(1);
      expect(lang.body.period).toBe(9999);
    });

    it('valt terug op dertig dagen bij een onzinnige periode', async () => {
      const antwoord = await als(commissieToken, 'get', '/stats?period=onzin');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.period).toBe(30);
    });

    it('geeft de activiteit per dag met een splitsing tussen bekijken en downloaden', async () => {
      logRegel(lid.id, { actie: 'view', wanneer: '2026-08-20 10:00:00' });
      logRegel(lid.id, { actie: 'download', wanneer: '2026-08-20 11:00:00' });

      const antwoord = await als(commissieToken, 'get', '/stats?period=9999');

      const dag = antwoord.body.recentActivity.find((d: any) => d.date === '2026-08-20');
      expect(dag).toMatchObject({ views: 1, downloads: 1 });
    });
  });

  describe('GET /feed', () => {
    it('weigert een verzoek zonder token', async () => {
      expect((await request(app).get('/api/activity/feed')).status).toBe(401);
    });

    it('houdt een gewoon lid buiten de feed', async () => {
      expect((await als(lidToken, 'get', '/feed')).status).toBe(403);
    });

    it('toont de naam van het lid en van het stuk', async () => {
      const titelId = maakTitel(vereniging.id, 'Also sprach Zarathustra');
      logRegel(lid.id, { actie: 'view', type: 'music_title', entityId: titelId });

      const antwoord = await als(commissieToken, 'get', '/feed');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body[0]).toMatchObject({
        action_type: 'view',
        entity_type: 'music_title',
        user_name: 'Member User',
        entity_name: 'Also sprach Zarathustra',
      });
    });

    it('zoekt ook de naam van een music_piece op', async () => {
      const stuk = createTestMusicPiece(vereniging.id, { title: 'Partij trompet 1' });
      logRegel(lid.id, { type: 'music_piece', entityId: stuk.id });

      const antwoord = await als(commissieToken, 'get', '/feed');

      expect(antwoord.body[0].entity_name).toBe('Partij trompet 1');
    });

    it('laat de naam leeg bij een onbekend entiteitstype', async () => {
      logRegel(lid.id, { type: 'rehearsal' });

      const antwoord = await als(commissieToken, 'get', '/feed');

      expect(antwoord.body[0].entity_name).toBeNull();
    });

    it('toont geen activiteit van een lid van een andere vereniging', async () => {
      logRegel(andereLid.id);

      const antwoord = await als(commissieToken, 'get', '/feed');

      expect(antwoord.body).toEqual([]);
    });

    // De echte lekroute: entity_id komt ongecontroleerd uit de body van
    // POST /log. Een lid dat een titel-id uit een andere vereniging kent kan
    // dat loggen; de feed mag die naam dan niet alsnog opzoeken en tonen.
    it('lekt de titel van een andere vereniging niet via een gelogd id', async () => {
      const vreemdeTitel = maakTitel(andereVereniging.id, 'Geheim Stuk van B');
      const vreemdStuk = createTestMusicPiece(andereVereniging.id, { title: 'Geheime Partij van B' });

      await als(lidToken, 'post', '/log').send({
        actionType: 'view',
        entityType: 'music_title',
        entityId: vreemdeTitel,
      });
      await als(lidToken, 'post', '/log').send({
        actionType: 'view',
        entityType: 'music_piece',
        entityId: vreemdStuk.id,
      });

      const antwoord = await als(commissieToken, 'get', '/feed');

      expect(antwoord.body).toHaveLength(2);
      for (const regel of antwoord.body) {
        expect(regel.entity_name).toBeNull();
      }
    });

    it('respecteert limit en sorteert het nieuwste vooraan', async () => {
      logRegel(lid.id, { actie: 'view', wanneer: '2026-08-01 10:00:00' });
      logRegel(lid.id, { actie: 'download', wanneer: '2026-08-02 10:00:00' });

      const alles = await als(commissieToken, 'get', '/feed');
      expect(alles.body.map((r: any) => r.action_type)).toEqual(['download', 'view']);

      const beperkt = await als(commissieToken, 'get', '/feed?limit=1');
      expect(beperkt.body).toHaveLength(1);
    });

    it('geeft geen serverfout bij een onzinnige limit', async () => {
      logRegel(lid.id);

      const antwoord = await als(commissieToken, 'get', '/feed?limit=onzin');

      expect(antwoord.status).toBe(200);
    });
  });
});
