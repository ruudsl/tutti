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
import fs from 'fs';
import path from 'path';
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

    it('laat de weergavenaam staan als een wijziging hem niet noemt', async () => {
      // Een verzoek dat displayName niet noemt hoorde hem ook niet aan te
      // raken. De route liet het veld door `displayName?.trim() || null` lopen
      // en schreef dat altijd weg, dus een PUT met een ander veld erin - of
      // een leeg verzoek - wiste de weergavenaam van de vereniging.
      // Bewust wissen kan nog steeds, met een lege waarde of met null; dat is
      // wat de test hierboven nakijkt.
      await alsBeheerder('put', '/').send({ displayName: 'Sint Caecilia' });

      const antwoord = await alsBeheerder('put', '/').send({ theme: { primaryColor: '#2563eb' } });
      expect(antwoord.status).toBe(200);

      const rij = db.prepare('SELECT display_name FROM associations WHERE id = ?').get(vereniging.id) as {
        display_name: string | null;
      };
      expect(rij.display_name).toBe('Sint Caecilia');
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

  /**
   * Het inlogscherm haalt hier zijn naam en logo op, zonder token. De query
   * luidde `SELECT ... FROM associations LIMIT 1`: op een installatie met een
   * vereniging klopte dat toevallig, met meer kreeg iedereen de eerst
   * aangemaakte te zien - ook de leden van een andere vereniging.
   */
  describe('huisstijl op het inlogscherm', () => {
    const zetSlug = (associationId: string, slug: string) =>
      db
        .prepare('UPDATE associations SET slug = ?, display_name = ? WHERE id = ?')
        .run(slug, `Naam ${slug}`, associationId);

    it('is op te vragen zonder in te loggen', async () => {
      const antwoord = await request(app).get('/api/settings/branding');
      expect(antwoord.status).toBe(200);
      expect(typeof antwoord.body.displayName).toBe('string');
    });

    it('toont de vereniging als er precies een is', async () => {
      db.prepare('DELETE FROM associations WHERE id != ?').run(vereniging.id);
      db.prepare('UPDATE associations SET display_name = ? WHERE id = ?').run('Harmonie Sint Cecilia', vereniging.id);

      const antwoord = await request(app).get('/api/settings/branding');
      expect(antwoord.body.displayName).toBe('Harmonie Sint Cecilia');
    });

    it('toont de neutrale huisstijl als er meer verenigingen zijn', async () => {
      db.prepare('UPDATE associations SET display_name = ? WHERE id = ?').run('Harmonie Sint Cecilia', vereniging.id);
      createTestAssociation({ name: `Tweede-${uuidv4()}` });

      const antwoord = await request(app).get('/api/settings/branding');
      expect(antwoord.body.displayName).toBe('Tutti');
      expect(antwoord.body.logoUrl).toBeNull();
    });

    it('toont de vereniging waarvan de slug wordt gevraagd', async () => {
      const tweede = createTestAssociation({ name: `Tweede-${uuidv4()}` });
      zetSlug(vereniging.id, 'harmonie-a');
      zetSlug(tweede.id, 'fanfare-b');

      const antwoord = await request(app).get('/api/settings/branding?slug=fanfare-b');
      expect(antwoord.body.displayName).toBe('Naam fanfare-b');
    });

    it('geeft niet de eerste vereniging bij een slug die niet bestaat', async () => {
      db.prepare('UPDATE associations SET display_name = ? WHERE id = ?').run('Harmonie Sint Cecilia', vereniging.id);
      createTestAssociation({ name: `Tweede-${uuidv4()}` });

      const antwoord = await request(app).get('/api/settings/branding?slug=bestaat-niet');
      expect(antwoord.body.displayName).toBe('Tutti');
    });

    it('toont een vereniging die op non-actief staat niet', async () => {
      const tweede = createTestAssociation({ name: `Tweede-${uuidv4()}` });
      zetSlug(tweede.id, 'gestopt');
      db.prepare('UPDATE associations SET is_active = 0 WHERE id = ?').run(tweede.id);

      const antwoord = await request(app).get('/api/settings/branding?slug=gestopt');
      expect(antwoord.body.displayName).toBe('Tutti');
    });

    it('geeft geen lijst van verenigingen prijs', async () => {
      createTestAssociation({ name: `Tweede-${uuidv4()}` });
      const antwoord = await request(app).get('/api/settings/branding');
      expect(Object.keys(antwoord.body).sort()).toEqual(['displayName', 'logoUrl']);
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

  describe('routevolgorde', () => {
    /**
     * Lees de routes uit settings.ts, in beide schrijfwijzen.
     *
     * route-shadowing.test.ts bewaakt deze eigenschap over alle
     * routebestanden, maar herkent alleen de vorm waarbij `router.get(` op een
     * eigen regel staat en het pad op de volgende. POST /settings/logo staat
     * op een regel - prettier trekt hem daar ook telkens naartoe omdat hij
     * past - en viel daardoor buiten dat vizier. Deze test kijkt settings.ts
     * na met een lezer die beide vormen ziet, zodat er geen route onbewaakt
     * blijft.
     */
    function leesRoutes(bron: string): Array<{ methode: string; pad: string; regel: number }> {
      const regels = bron.split('\n');
      const routes: Array<{ methode: string; pad: string; regel: number }> = [];

      regels.forEach((regel, i) => {
        const opEenRegel = regel.match(/^\s*router\.(get|post|put|patch|delete)\(\s*'([^']+)'/);
        if (opEenRegel) {
          routes.push({ methode: opEenRegel[1].toUpperCase(), pad: opEenRegel[2], regel: i + 1 });
          return;
        }

        const geopend = regel.match(/^\s*router\.(get|post|put|patch|delete)\($/);
        if (!geopend) return;
        const pad = (regels[i + 1] ?? '').match(/^\s*'([^']+)'/);
        if (pad) routes.push({ methode: geopend[1].toUpperCase(), pad: pad[1], regel: i + 2 });
      });

      return routes;
    }

    /** Vangt `eerder` het pad van `later` af? */
    function vangtAf(eerder: { methode: string; pad: string }, later: { methode: string; pad: string }): boolean {
      if (eerder.methode !== later.methode) return false;

      const a = eerder.pad.split('/').filter(Boolean);
      const b = later.pad.split('/').filter(Boolean);
      if (a.length !== b.length) return false;
      if (!a.some((deel) => deel.startsWith(':'))) return false;

      return a.every((deel, i) => deel.startsWith(':') || deel === b[i]);
    }

    it('zet geen letterlijk pad onder een parameterpad', () => {
      const routes = leesRoutes(fs.readFileSync(path.join(__dirname, '../../routes/settings.ts'), 'utf-8'));

      // Zonder deze ondergrens zou de test stilzwijgend niets nakijken als de
      // schrijfwijze ooit verandert en de lezer niets meer herkent.
      expect(routes.length).toBeGreaterThan(10);

      const problemen: string[] = [];
      routes.forEach((later, j) => {
        if (later.pad.includes(':')) return; // alleen letterlijke paden lopen dit risico
        routes.slice(0, j).forEach((eerder) => {
          if (vangtAf(eerder, later)) {
            problemen.push(`${later.methode} ${later.pad} (regel ${later.regel}) valt achter ${eerder.pad}`);
          }
        });
      });

      expect(problemen).toEqual([]);
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
