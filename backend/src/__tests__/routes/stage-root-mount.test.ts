/**
 * De podiumindeling-router mag op /api niets anders aanbieden dan de
 * concertroutes.
 *
 * Die router hangt er twee keer in: op /api/stage-layouts voor de gewone
 * routes, en op /api omdat de podiumindeling van een concert onder
 * /api/concerts/:id/stage hoort. Die tweede mount was de hele router, inclusief
 * een route op '/:id'. Daardoor gebeurden er twee dingen.
 *
 * Elk onbekend pad met een enkel segment kwam bij '/:id' uit, dus /api/onzin
 * antwoordde met "Podiumindeling niet gevonden" of met 401 in plaats van een
 * nette 404. En ernstiger: die mount droeg geen moduleguard, zodat de
 * detailroute bereikbaar bleef terwijl de module stage uitstond - precies wat
 * de guard moest voorkomen.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import stageLayoutsRoutes, { concertStageRouter } from '../../routes/stage-layouts';
import { optionalAuth } from '../../middleware/auth';
import { requireModule } from '../../middleware/requireModule';
import { errorHandler, notFoundHandler } from '../../middleware/errorHandler';
import { createTestEnvironment } from '../testUtils';
import { clearModuleCache } from '../../modules/service';

/** De mounts in dezelfde volgorde als index.ts, inclusief de 404-handler. */
const app = express();
app.use(express.json());
app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));
app.use('/api/stage-layouts', optionalAuth, requireModule('stage'), stageLayoutsRoutes);
app.use('/api', concertStageRouter);
app.use('/api/*', notFoundHandler);
app.use(errorHandler);

let adminToken: string;
let associationId: string;
let adminId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  adminToken = omgeving.adminToken;
  associationId = omgeving.association.id;
  adminId = omgeving.adminUser.id;
  clearModuleCache();
});

function zetModule(sleutel: string, aan: boolean) {
  db.prepare(
    `INSERT INTO association_modules (id, association_id, module_key, enabled, updated_by)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(association_id, module_key)
     DO UPDATE SET enabled = excluded.enabled`,
  ).run(uuidv4(), associationId, sleutel, aan ? 1 : 0, adminId);
  clearModuleCache();
}

describe('De root-mount van de podiumindelingen', () => {
  it('laat een onbekend pad met een enkel segment door naar de 404-handler', async () => {
    const res = await request(app).get('/api/dit-bestaat-niet').set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    // Niet de melding van de podiumindeling-route: dan had die alsnog gedraaid.
    expect(res.body.error).not.toContain('Podiumindeling');
  });

  it('vraagt geen token voor een pad dat niet bestaat', async () => {
    // Zonder token gaf dit eerder 401, omdat '/:id' authenticateToken droeg.
    // Een pad dat niet bestaat hoort niet om inloggegevens te vragen.
    const res = await request(app).get('/api/dit-bestaat-niet');

    expect(res.status).toBe(404);
  });

  it('biedt de lijstroute niet aan op de wortel van de API', async () => {
    zetModule('stage', true);

    const res = await request(app).get('/api/').set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('houdt de concertroute bereikbaar als de module aanstaat', async () => {
    zetModule('stage', true);

    const res = await request(app).get(`/api/concerts/${uuidv4()}/stage`).set('Authorization', `Bearer ${adminToken}`);

    // Het concert bestaat niet, dus 404 - maar wel vanuit de handler zelf en
    // niet omdat de route ontbreekt.
    expect(res.status).not.toBe(401);
    expect([200, 404]).toContain(res.status);
  });

  it('verbergt de concertroute als de module uitstaat', async () => {
    zetModule('stage', false);

    const res = await request(app).get(`/api/concerts/${uuidv4()}/stage`).set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).not.toContain('Podiumindeling');
  });
});
