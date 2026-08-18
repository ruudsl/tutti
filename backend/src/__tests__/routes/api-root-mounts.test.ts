/**
 * Routers die aan /api hangen mogen niets afvangen wat niet van hen is.
 *
 * Twee routers zijn op /api gemonteerd omdat ze paden onder meerdere
 * voorvoegsels bedienen. Allebei bleken ze verzoeken op te eten die ergens
 * anders thuishoren:
 *
 *   - stage-layouts heeft een router.get('/:id'). Op /api gemonteerd ving die
 *     elk /api/<een-segment> af dat daarvoor nog geen route had. /api/changelog
 *     en /api/csrf-token kwamen zo nooit aan: de eerste gaf "Podiumindeling
 *     niet gevonden", de tweede 401 omdat die route een token wil.
 *   - tickets had een kale router.use() met de module-guard erin. Die raakte
 *     elk verzoek dat langs de mount viel, ook verzoeken die deze router
 *     helemaal niet afhandelt. Stond kaartverkoop uit, dan gaf bijvoorbeeld
 *     /api/concerts/:id/stage een 404.
 *
 * Dit is dezelfde fout als in music-pieces (#110) en tasks/resources (#121),
 * nu tussen mounts in plaats van binnen een router.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import '../setup';
import ticketsRoutes from '../../routes/tickets';
import { createTestEnvironment } from '../testUtils';
import { clearModuleCache } from '../../modules/service';

const indexSource = fs.readFileSync(path.join(__dirname, '../../index.ts'), 'utf-8');

describe('de root-mount van stage-layouts staat onderaan', () => {
  it.each(['/api/changelog', '/api/csrf-token'])('registreert %s voor de /api-mount', (route) => {
    const mountIndex = indexSource.indexOf("app.use('/api', stageLayoutsRoutes)");
    const routeIndex = indexSource.indexOf(`app.get('${route}'`);

    expect(routeIndex, `${route} niet gevonden in index.ts`).toBeGreaterThan(-1);
    expect(routeIndex).toBeLessThan(mountIndex);
  });

  it('staat na alle andere /api-mounts', () => {
    const mountIndex = indexSource.indexOf("app.use('/api', stageLayoutsRoutes)");

    // De 404-handler op /api/* hoort er juist na te staan; die telt niet mee.
    const specifiekeMounts = [...indexSource.matchAll(/app\.use\('\/api\/(?!\*)[^']*'/g)].map((m) => m.index ?? 0);

    expect(Math.max(...specifiekeMounts)).toBeLessThan(mountIndex);
  });
});

describe('de module-guard van kaartverkoop blijft bij zijn eigen paden', () => {
  let adminToken: string;

  beforeEach(() => {
    adminToken = createTestEnvironment().adminToken;
    clearModuleCache();
  });

  /**
   * De opzet spiegelt index.ts: ticketsRoutes op /api, en daarna een route die
   * er niets mee te maken heeft. Die laatste moet bereikbaar blijven, ook als
   * kaartverkoop uit staat.
   */
  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api', ticketsRoutes);
    app.get('/api/iets-anders', (_req, res) => res.json({ ok: true }));
    app.get('/api/concerts/:id/stage', (_req, res) => res.json({ stage: true }));
    return app;
  }

  it('laat een route die na de mount komt gewoon door', async () => {
    const response = await request(buildApp()).get('/api/iets-anders').set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('laat /concerts/:id/stage door, ook al lijkt het pad op een ticketpad', async () => {
    const response = await request(buildApp())
      .get('/api/concerts/abc/stage')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ stage: true });
  });

  it('blokkeert wel de echte ticketpaden zolang de module uit staat', async () => {
    const response = await request(buildApp()).get('/api/tickets/my').set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
  });
});
