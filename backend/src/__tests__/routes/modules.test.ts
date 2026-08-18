/**
 * Modules aan- en uitzetten per vereniging.
 *
 * Twee dingen moeten kloppen:
 *   1. uitzetten verbergt echt - de API van de module geeft 404, en niet 403,
 *      want een uitgezette module hoort niet te bestaan voor deze vereniging;
 *   2. uitzetten verwijdert niets - de gegevens staan er na aanzetten weer,
 *      ongewijzigd.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import app from '../testApp';
import db from '../../database/connection';
import { createTestAssociation, createTestEnvironment, createTestUser, generateTestToken } from '../testUtils';
import { clearModuleCache } from '../../modules/service';

describe('modules', () => {
  let adminToken: string;
  let memberToken: string;
  let associationId: string;
  let adminId: string;

  beforeEach(() => {
    const env = createTestEnvironment();
    adminToken = env.adminToken;
    memberToken = env.memberToken;
    associationId = env.association.id;
    adminId = env.adminUser.id;
    clearModuleCache();
  });

  /** Zet een module aan of uit buiten de API om, zoals een eerdere sessie zou doen. */
  function setModule(key: string, enabled: boolean) {
    db.prepare(
      `INSERT INTO association_modules (id, association_id, module_key, enabled, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(association_id, module_key)
       DO UPDATE SET enabled = excluded.enabled`,
    ).run(uuidv4(), associationId, key, enabled ? 1 : 0, adminId);
    clearModuleCache();
  }

  describe('GET /api/modules', () => {
    it('geeft de actieve modules aan elke ingelogde gebruiker', async () => {
      const response = await request(app).get('/api/modules').set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.enabled)).toBe(true);
    });

    it('vereist een token', async () => {
      const response = await request(app).get('/api/modules');

      expect(response.status).toBe(401);
    });

    it('noemt een module zodra die aan staat', async () => {
      setModule('stage', true);

      const response = await request(app).get('/api/modules').set('Authorization', `Bearer ${memberToken}`);

      expect(response.body.enabled).toContain('stage');
    });

    it('noemt een module niet meer zodra die uit staat', async () => {
      setModule('stage', false);

      const response = await request(app).get('/api/modules').set('Authorization', `Bearer ${memberToken}`);

      expect(response.body.enabled).not.toContain('stage');
    });
  });

  describe('GET /api/modules/settings', () => {
    it('geeft de beheerder alle modules met omschrijving', async () => {
      const response = await request(app).get('/api/modules/settings').set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBeGreaterThanOrEqual(3);
      expect(response.body[0]).toHaveProperty('key');
      expect(response.body[0]).toHaveProperty('title');
      expect(response.body[0]).toHaveProperty('description');
      expect(response.body[0]).toHaveProperty('enabled');
    });

    it('is niet voor gewone leden', async () => {
      const response = await request(app).get('/api/modules/settings').set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('PUT /api/modules/:key', () => {
    it('zet een module aan', async () => {
      const response = await request(app)
        .put('/api/modules/stage')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: true });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ key: 'stage', enabled: true });
    });

    it('bewaart de keuze', async () => {
      await request(app)
        .put('/api/modules/accounting')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: true });

      const response = await request(app).get('/api/modules').set('Authorization', `Bearer ${adminToken}`);

      expect(response.body.enabled).toContain('accounting');
    });

    it('kan twee keer achter elkaar dezelfde module bijwerken', async () => {
      const put = (enabled: boolean) =>
        request(app).put('/api/modules/stage').set('Authorization', `Bearer ${adminToken}`).send({ enabled });

      await put(true);
      const second = await put(false);

      expect(second.status).toBe(200);
      expect(second.body.enabled).toBe(false);
    });

    it('is niet voor gewone leden', async () => {
      const response = await request(app)
        .put('/api/modules/stage')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ enabled: true });

      expect(response.status).toBe(403);
    });

    it('kent geen verzonnen modules', async () => {
      const response = await request(app)
        .put('/api/modules/tijdmachine')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: true });

      expect(response.status).toBe(404);
    });
  });

  describe('een uitgezette module verbergt zijn API', () => {
    it('geeft 404 en niet 403, zodat de module lijkt niet te bestaan', async () => {
      setModule('stage', false);

      const response = await request(app).get('/api/stage-layouts').set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });

    it('geeft de module terug zodra hij weer aan staat', async () => {
      setModule('stage', false);
      setModule('stage', true);

      const response = await request(app).get('/api/stage-layouts').set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('uitzetten verbergt, het verwijdert niet', () => {
    it('laat de gegevens van de module ongemoeid', async () => {
      const layoutId = uuidv4();
      db.prepare(
        `INSERT INTO stage_layouts (id, association_id, name, stage_width, stage_depth, layout_data, created_by)
         VALUES (?, ?, 'Grote zaal', 1000, 600, '{}', ?)`,
      ).run(layoutId, associationId, adminId);

      setModule('stage', false);

      // Onzichtbaar via de API...
      const hidden = await request(app).get('/api/stage-layouts').set('Authorization', `Bearer ${adminToken}`);
      expect(hidden.status).toBe(404);

      // ...maar nog gewoon in de database.
      const row = db.prepare('SELECT name FROM stage_layouts WHERE id = ?').get(layoutId) as { name: string };
      expect(row.name).toBe('Grote zaal');

      // En na aanzetten weer zichtbaar, ongewijzigd.
      setModule('stage', true);
      const restored = await request(app).get('/api/stage-layouts').set('Authorization', `Bearer ${adminToken}`);
      expect(restored.status).toBe(200);
      expect(restored.body.map((l: { name: string }) => l.name)).toContain('Grote zaal');
    });
  });

  describe('de stand is per vereniging', () => {
    it('raakt een andere vereniging niet', async () => {
      setModule('stage', false);

      const otherAssociation = createTestAssociation();
      const otherAdmin = createTestUser(otherAssociation.id, {
        email: 'admin@andere-vereniging.test',
        role: 'admin',
      });

      const response = await request(app)
        .get('/api/modules')
        .set('Authorization', `Bearer ${generateTestToken(otherAdmin)}`);

      // De tweede vereniging heeft niets ingesteld en volgt dus de standaard,
      // niet de keuze van de eerste.
      expect(response.status).toBe(200);
      const stored = db
        .prepare('SELECT COUNT(*) as count FROM association_modules WHERE association_id = ?')
        .get(otherAssociation.id) as { count: number };
      expect(stored.count).toBe(0);
    });
  });
});
