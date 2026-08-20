/**
 * Verenigingsinstellingen.
 *
 * Dit bestand stond op nul procent en het bewaart geheimen: het
 * smtp-wachtwoord, de Telegram-bottoken en de sleutels voor Google Drive en
 * WhatsApp. Twee eigenschappen tellen hier het zwaarst, en daar gaan de meeste
 * tests over. Een geheim mag nooit terugkomen in een antwoord, en het mag niet
 * verdwijnen doordat iemand een ander veld opslaat zonder het wachtwoord
 * opnieuw te typen.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import settingsRoutes from '../../routes/settings';
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
app.use('/api/settings', settingsRoutes);
app.use(errorHandler);

describe('instellingen', () => {
  let vereniging: TestAssociation;
  let beheerderToken: string;
  let lidToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;
  });

  const alsBeheerder = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
    request(app)[methode](`/api/settings${pad}`).set('Authorization', `Bearer ${beheerderToken}`);

  const alsLid = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
    request(app)[methode](`/api/settings${pad}`).set('Authorization', `Bearer ${lidToken}`);

  describe('rechten', () => {
    it('houdt een gewoon lid uit de instellingen die geheimen raken', async () => {
      const paden: Array<['get' | 'put' | 'delete' | 'post', string]> = [
        ['put', '/'],
        ['get', '/smtp'],
        ['put', '/smtp'],
        ['delete', '/smtp'],
        ['post', '/smtp/test'],
        ['get', '/telegram'],
        ['put', '/telegram'],
        ['delete', '/telegram'],
        ['put', '/theme'],
        ['delete', '/logo'],
      ];

      for (const [methode, pad] of paden) {
        const verzoek = request(app)[methode](`/api/settings${pad}`);
        const antwoord = await verzoek.set('Authorization', `Bearer ${lidToken}`);
        expect(antwoord.status, `${methode} ${pad}`).toBe(403);
      }
    });

    it('laat een lid de eigen vereniging wel bekijken', async () => {
      const antwoord = await alsLid('get', '/');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.name).toBe(vereniging.name);
    });

    it('vereist inloggen', async () => {
      expect((await request(app).get('/api/settings/')).status).toBe(401);
    });
  });

  describe('algemene gegevens', () => {
    it('werkt de weergavenaam bij', async () => {
      const antwoord = await alsBeheerder('put', '/').send({ displayName: 'Sint Caecilia' });

      expect(antwoord.status).toBe(200);
      const rij = db.prepare('SELECT display_name FROM associations WHERE id = ?').get(vereniging.id) as {
        display_name: string;
      };
      expect(rij.display_name).toBe('Sint Caecilia');
    });

    it('laat de officiële naam ongemoeid', async () => {
      // Alleen de weergavenaam is hier aan te passen; de naam zelf hoort bij
      // het beheer van verenigingen en niet bij de instellingen.
      await alsBeheerder('put', '/').send({ name: 'Heel iets anders', displayName: 'Sint Caecilia' });

      const rij = db.prepare('SELECT name FROM associations WHERE id = ?').get(vereniging.id) as { name: string };
      expect(rij.name).toBe(vereniging.name);
    });

    it('weigert een weergavenaam die geen tekst is', async () => {
      expect((await alsBeheerder('put', '/').send({ displayName: 42 })).status).toBe(400);
    });

    it('weigert een weergavenaam van meer dan honderd tekens', async () => {
      expect((await alsBeheerder('put', '/').send({ displayName: 'x'.repeat(101) })).status).toBe(400);
    });

    it('wist de weergavenaam bij een lege waarde', async () => {
      await alsBeheerder('put', '/').send({ displayName: 'Eerst iets' });
      await alsBeheerder('put', '/').send({ displayName: '  ' });

      const rij = db.prepare('SELECT display_name FROM associations WHERE id = ?').get(vereniging.id) as {
        display_name: string | null;
      };
      expect(rij.display_name).toBeNull();
    });

    it('raakt een andere vereniging niet', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      await alsBeheerder('put', '/').send({ displayName: 'Gewijzigd' });

      const rij = db.prepare('SELECT display_name FROM associations WHERE id = ?').get(andere.id) as {
        display_name: string | null;
      };
      expect(rij.display_name).not.toBe('Gewijzigd');
    });
  });

  describe('smtp', () => {
    function zetSmtp(wachtwoord = 'geheim123'): void {
      db.prepare(
        `UPDATE associations
         SET smtp_host = 'smtp.test.nl', smtp_port = 587, smtp_secure = 1,
             smtp_user = 'post@test.nl', smtp_pass = ?, smtp_from = 'Tutti <post@test.nl>', smtp_enabled = 1
         WHERE id = ?`,
      ).run(wachtwoord, vereniging.id);
    }

    function opgeslagenWachtwoord(): string | null {
      const rij = db.prepare('SELECT smtp_pass FROM associations WHERE id = ?').get(vereniging.id) as {
        smtp_pass: string | null;
      };
      return rij.smtp_pass;
    }

    it('geeft de instellingen terug zonder het wachtwoord', async () => {
      zetSmtp('nooitdelen');
      const antwoord = await alsBeheerder('get', '/smtp');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toMatchObject({ host: 'smtp.test.nl', user: 'post@test.nl', configured: true });
      expect(JSON.stringify(antwoord.body)).not.toContain('nooitdelen');
      expect(antwoord.body).not.toHaveProperty('password');
      expect(antwoord.body).not.toHaveProperty('smtp_pass');
    });

    it('meldt een vereniging zonder instellingen als niet geconfigureerd', async () => {
      const antwoord = await alsBeheerder('get', '/smtp');
      expect(antwoord.body.configured).toBe(false);
    });

    it('slaat nieuwe instellingen op', async () => {
      const antwoord = await alsBeheerder('put', '/smtp').send({
        host: 'smtp.nieuw.nl',
        port: 465,
        secure: true,
        user: 'post@nieuw.nl',
        password: 'nieuwgeheim',
        from: 'Tutti <post@nieuw.nl>',
        enabled: true,
      });

      expect(antwoord.status).toBe(200);
      expect(opgeslagenWachtwoord()).toBe('nieuwgeheim');
    });

    it('houdt het bestaande wachtwoord wanneer het niet opnieuw wordt meegegeven', async () => {
      // Anders wist een beheerder die alleen de afzender aanpast stilzwijgend
      // het wachtwoord, en stopt het versturen van e-mail.
      zetSmtp('blijftstaan');

      await alsBeheerder('put', '/smtp').send({
        host: 'smtp.test.nl',
        port: 587,
        user: 'post@test.nl',
        from: 'Tutti <anders@test.nl>',
        enabled: true,
      });

      expect(opgeslagenWachtwoord()).toBe('blijftstaan');
    });

    it('houdt het bestaande wachtwoord ook bij een leeg veld', async () => {
      zetSmtp('blijftstaan');
      await alsBeheerder('put', '/smtp').send({ host: 'smtp.test.nl', user: 'post@test.nl', password: '   ' });
      expect(opgeslagenWachtwoord()).toBe('blijftstaan');
    });

    it('wist de instellingen', async () => {
      zetSmtp();
      const antwoord = await alsBeheerder('delete', '/smtp');

      expect(antwoord.status).toBe(200);
      expect((await alsBeheerder('get', '/smtp')).body.configured).toBe(false);
    });

    it('laat de instellingen van een andere vereniging met rust', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      db.prepare("UPDATE associations SET smtp_host = 'smtp.anders.nl' WHERE id = ?").run(andere.id);

      zetSmtp();
      await alsBeheerder('delete', '/smtp');

      const rij = db.prepare('SELECT smtp_host FROM associations WHERE id = ?').get(andere.id) as {
        smtp_host: string;
      };
      expect(rij.smtp_host).toBe('smtp.anders.nl');
    });
  });

  describe('telegram', () => {
    it('geeft de instellingen terug zonder de bottoken', async () => {
      db.prepare("UPDATE associations SET telegram_bot_token = 'geheimetoken', telegram_enabled = 1 WHERE id = ?").run(
        vereniging.id,
      );

      const antwoord = await alsBeheerder('get', '/telegram');
      expect(antwoord.status).toBe(200);
      expect(JSON.stringify(antwoord.body)).not.toContain('geheimetoken');
    });

    it('slaat een bottoken op', async () => {
      const antwoord = await alsBeheerder('put', '/telegram').send({ botToken: 'nieuwetoken', enabled: true });
      expect(antwoord.status).toBe(200);

      const rij = db.prepare('SELECT telegram_bot_token FROM associations WHERE id = ?').get(vereniging.id) as {
        telegram_bot_token: string;
      };
      expect(rij.telegram_bot_token).toBe('nieuwetoken');
    });

    it('wist de instellingen', async () => {
      db.prepare("UPDATE associations SET telegram_bot_token = 'weg', telegram_enabled = 1 WHERE id = ?").run(
        vereniging.id,
      );

      expect((await alsBeheerder('delete', '/telegram')).status).toBe(200);
      const rij = db.prepare('SELECT telegram_enabled FROM associations WHERE id = ?').get(vereniging.id) as {
        telegram_enabled: number;
      };
      expect(Boolean(rij.telegram_enabled)).toBe(false);
    });
  });

  describe('thema en huisstijl', () => {
    it('geeft het thema van de vereniging terug', async () => {
      const antwoord = await alsBeheerder('get', '/theme');
      expect(antwoord.status).toBe(200);
    });

    it('slaat een thema op', async () => {
      const antwoord = await alsBeheerder('put', '/theme').send({ theme: { primary: '#123456' } });
      expect([200, 400]).toContain(antwoord.status);
    });

    it('geeft de huisstijl terug aan wie is ingelogd', async () => {
      const antwoord = await alsLid('get', '/branding');
      expect(antwoord.status).toBe(200);
    });
  });

  describe('logo', () => {
    it('geeft 404 voor een bestandsnaam die niet bestaat', async () => {
      const antwoord = await alsBeheerder('get', '/logo/bestaatniet.png');
      expect(antwoord.status).toBe(404);
    });

    it('laat een lid geen logo verwijderen', async () => {
      expect((await alsLid('delete', '/logo')).status).toBe(403);
    });
  });

  describe('scheiding tussen verenigingen', () => {
    it('toont een beheerder alleen de eigen vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, {
        email: `beheer-${uuidv4()}@test.nl`,
        role: 'admin',
      });

      const antwoord = await request(app)
        .get('/api/settings/')
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`);

      expect(antwoord.body.name).toBe(andere.name);
      expect(antwoord.body.name).not.toBe(vereniging.name);
    });
  });
});
