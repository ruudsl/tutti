/**
 * Regressietests voor routes die door een /:id-route werden afgevangen.
 *
 * Express matcht in registratievolgorde. Stond een letterlijke route als
 * /tasks/templates na /tasks/:id, dan kwam het verzoek terecht bij de
 * :id-handler met id = "templates" en antwoordde die 404 - met de
 * bijbehorende foutmelding ("Taak niet gevonden"), wat het gemeen maakte om
 * te herkennen. Deze test controleert per endpoint dat er geen 404 komt en
 * dat het antwoord van de bedoelde handler komt.
 *
 * Dezelfde fout is eerder gevonden in music-pieces.ts (PUT/DELETE /bulk).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import '../setup';
import app from '../testApp';
import { createTestEnvironment } from '../testUtils';

describe('Routes that must not be shadowed by /:id', () => {
  let adminToken: string;

  beforeEach(() => {
    adminToken = createTestEnvironment().adminToken;
  });

  const endpoints: { path: string; description: string }[] = [
    { path: '/api/tasks/templates', description: 'takensjablonen' },
    { path: '/api/tasks/summary', description: 'takenoverzicht' },
    { path: '/api/resources/bookings', description: 'reserveringen' },
    { path: '/api/equipment/loans', description: 'uitleningen' },
    { path: '/api/equipment/stats', description: 'apparatuurstatistieken' },
  ];

  it.each(endpoints)('reaches its own handler: $path ($description)', async ({ path }) => {
    const response = await request(app).get(path).set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).not.toBe(404);
  });

  it.each(endpoints)('does not answer with a not-found message: $path', async ({ path }) => {
    const response = await request(app).get(path).set('Authorization', `Bearer ${adminToken}`);

    // De :id-handlers antwoorden met "... niet gevonden"; dat mag hier niet.
    expect(String(response.body?.error ?? '')).not.toMatch(/niet gevonden/i);
  });

  it('still resolves a real id through the :id handler', async () => {
    const response = await request(app)
      .get('/api/tasks/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
  });
});
