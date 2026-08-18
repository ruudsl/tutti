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
 *
 * LET OP bij het uitbreiden van deze test: importeer hier geen routers die een
 * grote afhankelijkheidsboom meebrengen. routes/tickets.ts trekt de
 * betaal-, verkoopvoorspellings- en Twilio-modules mee; die belanden dan in de
 * coverage-noemer zonder ooit uitgevoerd te worden, en dat kostte in een
 * eerdere versie van dit bestand ruim acht procentpunt. Het gedrag van de
 * guard wordt daarom nagebouwd met een eigen router, en dat de echte router
 * dat mechanisme ook gebruikt, wordt op de bron gecontroleerd.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import '../setup';
import { requireModule } from '../../middleware/requireModule';
import { optionalAuth } from '../../middleware/auth';
import { createTestEnvironment } from '../testUtils';
import { clearModuleCache } from '../../modules/service';

const indexSource = fs.readFileSync(path.join(__dirname, '../../index.ts'), 'utf-8');
const ticketsSource = fs.readFileSync(path.join(__dirname, '../../routes/tickets.ts'), 'utf-8');

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

describe('de module-guard van kaartverkoop is aan paden gebonden', () => {
  it('gebruikt geen kale router.use voor de guard', () => {
    // Een kale router.use(optionalAuth, requireModule(...)) raakt alles wat
    // langs de mount valt. Dat was de fout; de padenlijst is de reparatie.
    expect(ticketsSource).not.toMatch(/router\.use\(\s*optionalAuth,\s*requireModule\(/);
    expect(ticketsSource).toMatch(/router\.use\(\s*TICKET_PATHS,\s*optionalAuth,\s*requireModule\('ticketing'\)/);
  });

  it('somt de paden op die deze router echt bedient', () => {
    const block = ticketsSource.slice(ticketsSource.indexOf('const TICKET_PATHS'));
    const paths = [...block.slice(0, block.indexOf('];')).matchAll(/'(\/[^']+)'/g)].map((m) => m[1]);

    expect(paths).toContain('/tickets');
    expect(paths).toContain('/ticket-types');
    expect(paths).toContain('/concerts/:id/tickets');
  });
});

describe('een aan paden gebonden guard laat de rest met rust', () => {
  let adminToken: string;

  beforeEach(() => {
    adminToken = createTestEnvironment().adminToken;
    clearModuleCache();
  });

  /**
   * Dezelfde opzet als in index.ts: een router op /api met de guard op een
   * padenlijst, en daarnaast routes die er niets mee te maken hebben.
   */
  function buildApp() {
    const app = express();
    app.use(express.json());
    // Net als index.ts: eerst een rate limiter op /api, dan de mounts. Zonder
    // hem is dit een route met een autorisatiecheck en geen limiet, en dat is
    // precies het patroon dat productie wel afdekt. De grens staat zo hoog dat
    // geen enkele test hem raakt.
    app.use('/api', rateLimit({ windowMs: 60_000, limit: 10_000 }));

    const router = express.Router();
    router.use(['/tickets', '/concerts/:id/tickets'], optionalAuth, requireModule('ticketing'));
    router.get('/tickets/my', (_req, res) => res.json({ tickets: [] }));

    app.use('/api', router);
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
