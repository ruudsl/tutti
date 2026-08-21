/**
 * Inloggen via Microsoft Entra ID.
 *
 * 344 regels zonder test. De publieke kant - /enabled en /login - had geen
 * ingelogde gebruiker om de vereniging aan af te leiden en deed daarom
 * `FROM associations LIMIT 1`: zonder ORDER BY, zonder filter, dus de eerst
 * aangemaakte vereniging.
 *
 * Op een installatie met een vereniging klopte dat toevallig. Met meer
 * verenigingen gebruikte iedereen de Azure-app van vereniging A, en werd er
 * ook in haar ledenlijst gezocht. Een beheerder van B kon zijn configuratie
 * netjes invullen via PUT /config - die route werkt wel op de eigen vereniging -
 * en zag "geconfigureerd" in zijn scherm, terwijl inloggen bij A uitkwam. Stond
 * SSO uit bij A maar aan bij B, dan meldde /enabled voor iedereen `false`.
 *
 * De slug bepaalt het nu, net als bij /settings/branding en het inlogscherm.
 * Zonder slug: precies een vereniging, dan die; meer dan een, dan geen enkele,
 * want dan is elke keuze de verkeerde.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import '../setup';
import db from '../../database/connection';
import microsoftAuthRoutes from '../../routes/microsoft-auth';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestAssociation, createTestUser, generateTestToken, TestAssociation, TestUser } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/auth/microsoft', microsoftAuthRoutes);
app.use(errorHandler);

describe('inloggen via Microsoft', () => {
  let eerste: TestAssociation;

  beforeEach(() => {
    eerste = createTestAssociation({ name: 'Eerst aangemaakte vereniging' });
    db.prepare('UPDATE associations SET slug = ? WHERE id = ?').run('eerste', eerste.id);
  });

  function zetSso(associationId: string, clientId: string, aan = true) {
    db.prepare(
      `UPDATE associations
         SET microsoft_client_id = ?, microsoft_client_secret = 'geheim',
             microsoft_tenant_id = 'tenant-id', microsoft_enabled = ?
       WHERE id = ?`,
    ).run(clientId, aan ? 1 : 0, associationId);
  }

  function tweedeVereniging(slug: string): TestAssociation {
    const vereniging = createTestAssociation({ name: `Vereniging ${slug}` });
    db.prepare('UPDATE associations SET slug = ? WHERE id = ?').run(slug, vereniging.id);
    return vereniging;
  }

  describe('met precies een vereniging', () => {
    it('meldt uit als er niets is ingesteld', async () => {
      const antwoord = await request(app).get('/api/auth/microsoft/enabled');
      expect(antwoord.body.enabled).toBe(false);
    });

    it('meldt aan zonder dat er een slug nodig is', async () => {
      zetSso(eerste.id, 'client-eerste');
      const antwoord = await request(app).get('/api/auth/microsoft/enabled');
      expect(antwoord.body.enabled).toBe(true);
    });

    it('stuurt door naar Microsoft met de juiste client_id', async () => {
      zetSso(eerste.id, 'client-eerste');
      const antwoord = await request(app).get('/api/auth/microsoft/login');
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.authUrl).toContain('client_id=client-eerste');
      expect(antwoord.body.authUrl).toContain('tenant-id');
    });
  });

  describe('met meer verenigingen', () => {
    let tweede: TestAssociation;

    beforeEach(() => {
      tweede = tweedeVereniging('tweede');
    });

    it('meldt uit zonder slug, ook al staat het bij de eerste aan', async () => {
      zetSso(eerste.id, 'client-eerste');
      const antwoord = await request(app).get('/api/auth/microsoft/enabled');
      expect(antwoord.body.enabled).toBe(false);
    });

    it('meldt aan met de slug van de vereniging die het aan heeft staan', async () => {
      zetSso(tweede.id, 'client-tweede');
      const antwoord = await request(app).get('/api/auth/microsoft/enabled?slug=tweede');
      expect(antwoord.body.enabled).toBe(true);
    });

    it('meldt uit met de slug van een vereniging die het uit heeft staan', async () => {
      zetSso(tweede.id, 'client-tweede');
      const antwoord = await request(app).get('/api/auth/microsoft/enabled?slug=eerste');
      expect(antwoord.body.enabled).toBe(false);
    });

    it('gebruikt de Azure-app van de vereniging in de slug, niet die van de eerste', async () => {
      zetSso(eerste.id, 'client-eerste');
      zetSso(tweede.id, 'client-tweede');

      const antwoord = await request(app).get('/api/auth/microsoft/login?slug=tweede');
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.authUrl).toContain('client_id=client-tweede');
      expect(antwoord.body.authUrl).not.toContain('client-eerste');
    });

    it('weigert inloggen zonder slug', async () => {
      zetSso(eerste.id, 'client-eerste');
      const antwoord = await request(app).get('/api/auth/microsoft/login');
      expect(antwoord.status).toBe(400);
    });

    it('weigert een slug die niet bestaat', async () => {
      zetSso(eerste.id, 'client-eerste');
      expect((await request(app).get('/api/auth/microsoft/login?slug=bestaat-niet')).status).toBe(400);
    });

    it('weigert een vereniging op non-actief', async () => {
      zetSso(tweede.id, 'client-tweede');
      db.prepare('UPDATE associations SET is_active = 0 WHERE id = ?').run(tweede.id);

      expect((await request(app).get('/api/auth/microsoft/enabled?slug=tweede')).body.enabled).toBe(false);
    });
  });

  describe('de configuratie beheren', () => {
    let beheerderTweede: TestUser;
    let tokenTweede: string;
    let tweede: TestAssociation;

    beforeEach(() => {
      tweede = tweedeVereniging('tweede');
      beheerderTweede = createTestUser(tweede.id, { email: 'beheer@tweede.nl', role: 'admin' });
      tokenTweede = generateTestToken(beheerderTweede);
    });

    it('slaat op bij de eigen vereniging en niet bij de eerste', async () => {
      const antwoord = await request(app)
        .put('/api/auth/microsoft/config')
        .set('Authorization', `Bearer ${tokenTweede}`)
        .send({ clientId: 'client-tweede', clientSecret: 'geheim', tenantId: 'tenant-tweede', enabled: true });

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const rijen = db.prepare('SELECT id, microsoft_client_id FROM associations').all() as {
        id: string;
        microsoft_client_id: string | null;
      }[];
      const bijTweede = rijen.find((r) => r.id === tweede.id);
      const bijEerste = rijen.find((r) => r.id === eerste.id);

      expect(bijTweede?.microsoft_client_id).toBe('client-tweede');
      expect(bijEerste?.microsoft_client_id).toBeNull();
    });

    it('en dan meldt /enabled met die slug ook aan', async () => {
      await request(app)
        .put('/api/auth/microsoft/config')
        .set('Authorization', `Bearer ${tokenTweede}`)
        .send({ clientId: 'client-tweede', clientSecret: 'geheim', tenantId: 'tenant-tweede', enabled: true });

      // Dit is precies wat er misging: invullen lukte, maar inloggen kwam bij
      // de eerst aangemaakte vereniging uit.
      const antwoord = await request(app).get('/api/auth/microsoft/enabled?slug=tweede');
      expect(antwoord.body.enabled).toBe(true);
    });

    it('is niet voor een gewoon lid', async () => {
      const lid = createTestUser(tweede.id, { email: 'lid@tweede.nl', role: 'member' });
      const antwoord = await request(app)
        .get('/api/auth/microsoft/config')
        .set('Authorization', `Bearer ${generateTestToken(lid)}`);
      expect(antwoord.status).toBe(403);
    });
  });

  describe('de callback', () => {
    it('weigert een state die niet bestaat', async () => {
      const antwoord = await request(app)
        .post('/api/auth/microsoft/callback')
        .send({ code: 'iets', state: 'nooit-uitgegeven' });
      expect(antwoord.status).toBe(400);
    });

    it('vraagt om code en state', async () => {
      expect((await request(app).post('/api/auth/microsoft/callback').send({})).status).toBe(400);
    });
  });
});
