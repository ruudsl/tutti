/**
 * De algemene snelheidsbegrenzer telt elk /api-verzoek.
 *
 * Een scherm van deze applicatie doet er al gauw enkele tientallen - modules,
 * meldingen, huisstijl, maatwerkvelden - dus bij het rondklikken op een eigen
 * machine is het budget van 1000 per kwartier binnen de kortste keren op. Daarna
 * geeft alles een 429, inclusief het aanmaken van een orkest, en blijft dat zo
 * tot het venster verloopt.
 *
 * Op een laptop beschermt die begrenzer niets. Deze test legt vast dat hij
 * tijdens ontwikkelen wordt overgeslagen en in productie wel telt.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';

/** Dezelfde opzet als in index.ts, met de begrenzing op 2 om het kort te houden. */
function maakApp(isDevelopment: boolean) {
  const app = express();
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      max: 2,
      message: { error: 'Te veel verzoeken. Probeer het later opnieuw.' },
      standardHeaders: true,
      legacyHeaders: false,
      skip: () => isDevelopment,
    }),
  );
  app.get('/api/iets', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('snelheidsbegrenzer', () => {
  it('telt mee in productie en geeft daarna een 429', async () => {
    const app = maakApp(false);
    expect((await request(app).get('/api/iets')).status).toBe(200);
    expect((await request(app).get('/api/iets')).status).toBe(200);

    const derde = await request(app).get('/api/iets');
    expect(derde.status).toBe(429);
    expect(derde.body.error).toBe('Te veel verzoeken. Probeer het later opnieuw.');
  });

  it('wordt tijdens ontwikkelen overgeslagen', async () => {
    const app = maakApp(true);
    for (let i = 0; i < 5; i++) {
      expect((await request(app).get('/api/iets')).status).toBe(200);
    }
  });
});
