/**
 * Meldingen rond de podiumopstelling.
 *
 * 595 regels zonder test, en zonder ook maar één rolcontrole: het woord
 * requireRole kwam in dit bestand niet voor. De buurbestanden van dezelfde
 * module doen dat wel - seating.ts veertien keer, stage-layouts.ts zeven keer -
 * dus het is aantoonbaar een vergeten controle en geen keuze.
 *
 * Wat een gewoon lid daardoor kon:
 *
 * - De instellingen uitlezen. Het auth-token wordt gemaskeerd teruggegeven,
 *   maar de webhook-url, de Twilio-account-sid, het afzendernummer en de
 *   bestemmingsnummers niet.
 * - Die instellingen wijzigen of weggooien, en de meldingen uitzetten.
 * - De webhook-url op een eigen adres zetten en dan zelf een verzending
 *   starten. Het bericht bevat de volledige opstelling met alle ledennamen en
 *   de lijst afgemelde leden.
 * - Met POST /test-twilio de server een bericht laten versturen met
 *   credentials en een bestemmingsnummer uit de body.
 *
 * De verenigingsgrens zat er wel: elke route controleert het orkest tegen
 * req.user.associationId. Het ging puur om wie er binnen de vereniging aan mag
 * komen.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import seatingNotificationRoutes from '../../routes/seating-notifications';
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
app.use('/api/seating-notifications', seatingNotificationRoutes);
app.use(errorHandler);

describe('meldingen rond de opstelling', () => {
  let vereniging: TestAssociation;
  let orkest: TestOrchestra;
  let beheerder: TestUser;
  let beheerderToken: string;
  let dirigent: TestUser;
  let dirigentToken: string;
  let lid: TestUser;
  let lidToken: string;

  let andereVereniging: TestAssociation;
  let anderOrkest: TestOrchestra;
  let andereBeheerderToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    orkest = createTestOrchestra(vereniging.id, { name: 'Harmonieorkest' });

    dirigent = createTestUser(vereniging.id, { email: 'dirigent@test.nl', role: 'conductor' });
    dirigentToken = generateTestToken(dirigent);

    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
    anderOrkest = createTestOrchestra(andereVereniging.id, { name: 'Fanfare Elders' });
    const andereBeheerder = createTestUser(andereVereniging.id, { email: 'beheer@elders.nl', role: 'admin' });
    andereBeheerderToken = generateTestToken(andereBeheerder);
  });

  function zetInstellingen(orchestraId: string, webhookUrl: string) {
    db.prepare(
      `INSERT INTO seating_notification_settings (id, orchestra_id, notification_type, webhook_url, twilio_account_sid)
       VALUES (?, ?, 'webhook', ?, 'AC-geheime-sid')`,
    ).run(uuidv4(), orchestraId, webhookUrl);
  }

  const als = (token: string, methode: 'get' | 'put' | 'delete' | 'post', pad: string) =>
    request(app)[methode](`/api/seating-notifications${pad}`).set('Authorization', `Bearer ${token}`);

  describe('wie de instellingen mag zien', () => {
    it('weigert een gewoon lid', async () => {
      zetInstellingen(orkest.id, 'https://intern.example/hook');
      const antwoord = await als(lidToken, 'get', `/settings/${orkest.id}`);
      expect(antwoord.status).toBe(403);
    });

    it('lekt de webhook-url en de Twilio-sid dus niet aan een lid', async () => {
      zetInstellingen(orkest.id, 'https://intern.example/hook');
      const antwoord = await als(lidToken, 'get', `/settings/${orkest.id}`);
      expect(JSON.stringify(antwoord.body)).not.toContain('intern.example');
      expect(JSON.stringify(antwoord.body)).not.toContain('AC-geheime-sid');
    });

    it('laat een beheerder toe', async () => {
      zetInstellingen(orkest.id, 'https://intern.example/hook');
      const antwoord = await als(beheerderToken, 'get', `/settings/${orkest.id}`);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.webhook_url).toBe('https://intern.example/hook');
    });

    it('laat een dirigent toe', async () => {
      zetInstellingen(orkest.id, 'https://intern.example/hook');
      expect((await als(dirigentToken, 'get', `/settings/${orkest.id}`)).status).toBe(200);
    });

    it('maskeert het auth-token ook voor een beheerder', async () => {
      db.prepare(
        `INSERT INTO seating_notification_settings (id, orchestra_id, notification_type, twilio_auth_token)
         VALUES (?, ?, 'whatsapp', 'geheim-token')`,
      ).run(uuidv4(), orkest.id);

      const antwoord = await als(beheerderToken, 'get', `/settings/${orkest.id}`);
      expect(antwoord.body.twilio_auth_token).toBe('••••••••');
    });
  });

  describe('wie de instellingen mag wijzigen', () => {
    const instelling = { notification_type: 'webhook', webhook_url: 'https://kwaadaardig.example/opvangen' };

    it('weigert een gewoon lid', async () => {
      const antwoord = await als(lidToken, 'put', `/settings/${orkest.id}`).send(instelling);
      expect(antwoord.status).toBe(403);
    });

    it('laat na een geweigerde poging niets achter', async () => {
      await als(lidToken, 'put', `/settings/${orkest.id}`).send(instelling);
      const rij = db
        .prepare('SELECT COUNT(*) as aantal FROM seating_notification_settings WHERE orchestra_id = ?')
        .get(orkest.id) as { aantal: number };
      expect(rij.aantal).toBe(0);
    });

    it('laat een beheerder wel wijzigen', async () => {
      const antwoord = await als(beheerderToken, 'put', `/settings/${orkest.id}`).send(instelling);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
    });

    it('weigert een gewoon lid ook het verwijderen', async () => {
      zetInstellingen(orkest.id, 'https://intern.example/hook');
      expect((await als(lidToken, 'delete', `/settings/${orkest.id}`)).status).toBe(403);
    });
  });

  describe('wie een verzending mag starten', () => {
    it('weigert een gewoon lid', async () => {
      const antwoord = await als(lidToken, 'post', `/send/${uuidv4()}`);
      expect(antwoord.status).toBe(403);
    });

    it('weigert een gewoon lid het logboek', async () => {
      expect((await als(lidToken, 'get', `/logs/${uuidv4()}`)).status).toBe(403);
    });

    it('houdt test-twilio bij de beheerder', async () => {
      // Deze route stuurt een bericht met credentials en een nummer uit de
      // body. Een dirigent hoort daar niet bij te kunnen.
      expect((await als(lidToken, 'post', '/test-twilio')).status).toBe(403);
      expect((await als(dirigentToken, 'post', '/test-twilio')).status).toBe(403);
    });
  });

  describe('de verenigingsgrens', () => {
    it('geeft geen instellingen van een orkest van een andere vereniging', async () => {
      zetInstellingen(anderOrkest.id, 'https://elders.example/hook');
      const antwoord = await als(beheerderToken, 'get', `/settings/${anderOrkest.id}`);
      expect(antwoord.status).toBe(404);
    });

    it('laat de andere vereniging haar eigen orkest wel zien', async () => {
      zetInstellingen(anderOrkest.id, 'https://elders.example/hook');
      const antwoord = await als(andereBeheerderToken, 'get', `/settings/${anderOrkest.id}`);
      expect(antwoord.status).toBe(200);
    });

    it('weigert wijzigen op een orkest van een andere vereniging', async () => {
      const antwoord = await als(beheerderToken, 'put', `/settings/${anderOrkest.id}`).send({
        notification_type: 'webhook',
        webhook_url: 'https://kwaadaardig.example/opvangen',
      });
      expect(antwoord.status).toBe(404);
    });
  });

  it('weigert elk verzoek zonder token', async () => {
    expect((await request(app).get(`/api/seating-notifications/settings/${orkest.id}`)).status).toBe(401);
  });
});
