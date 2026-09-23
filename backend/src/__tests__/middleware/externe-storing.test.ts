/**
 * Wat de gebruiker ziet als een externe dienst het laat afweten.
 *
 * Een Mollie of Microsoft die niet reageert is geen fout van Tutti en geen
 * fout van de gebruiker. Een 500 "Interne serverfout" liet het lijken alsof
 * Tutti zelf stuk was; een 503 zegt: straks nog eens.
 */

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import '../setup';
import { errorHandler } from '../../middleware/errorHandler';
import { DienstFout, StroomonderbrekerOpenFout } from '../../utils/veerkracht';

function appDieGooit(fout: Error) {
  const app = express();
  app.get('/', () => {
    throw fout;
  });
  app.use(errorHandler);
  return app;
}

describe('externe storingen in de foutafhandeling', () => {
  it('geeft een 503 als de dienst niet reageerde', async () => {
    const res = await request(appDieGooit(new DienstFout('mollie reageert niet', { dienst: 'mollie' }))).get('/');

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/externe dienst/);
  });

  it('geeft een 503 bij een tijdelijke status van de dienst', async () => {
    const res = await request(appDieGooit(new DienstFout('mollie gaf 502', { dienst: 'mollie', status: 502 }))).get(
      '/',
    );

    expect(res.status).toBe(503);
  });

  it('geeft een 503 zolang de stroomonderbreker openstaat', async () => {
    const res = await request(appDieGooit(new StroomonderbrekerOpenFout('mollie', 30_000))).get('/');

    expect(res.status).toBe(503);
  });

  it('geeft een 502 als de dienst wel antwoordde maar niet met iets bruikbaars', async () => {
    const res = await request(
      appDieGooit(new DienstFout('Spotify authentication failed', { dienst: 'spotify', status: 401 })),
    ).get('/');

    expect(res.status).toBe(502);
  });

  it('verklapt niet welke dienst het was of wat die zei', async () => {
    const res = await request(
      appDieGooit(new DienstFout('mollie gaf 503: interne sleutel x', { dienst: 'mollie' })),
    ).get('/');

    expect(JSON.stringify(res.body)).not.toMatch(/mollie|sleutel/i);
  });
});
