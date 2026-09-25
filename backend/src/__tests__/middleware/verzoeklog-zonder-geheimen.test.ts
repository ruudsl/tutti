/**
 * Het verzoeklogboek mag geen tokens bevatten.
 *
 * Een link om het wachtwoord te herstellen opent `/reset-password?token=…`.
 * Die pagina roept de API aan, en de browser stuurde het volledige adres van
 * de pagina mee als Referer. Het logboek schreef die Referer weg - en daarmee
 * het token. Hetzelfde voor tokens die zelf in de querystring staan: een
 * agenda-abonnement (`/api/calendar/feed/…?token=…`) en `<audio src>` met
 * `?token=`.
 *
 * Wie het logboek kan lezen, mag daarmee geen wachtwoord kunnen herstellen of
 * andermans agenda kunnen uitlezen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../logging/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logRequest: vi.fn(),
  logSecurity: vi.fn(),
}));

import logger, { logSecurity } from '../../logging/logger';
import {
  requestIdMiddleware,
  requestLoggerMiddleware,
  refererHerkomst,
  veiligPad,
  veiligeQuery,
} from '../../logging/requestLogger';

const GEHEIM = 'Zeer-Geheim-Token-123';

const app = express();
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);
app.get('/api/auth/reset-password/validate', (_req, res) => res.json({ ok: true }));
app.get('/api/calendar/feed/:id', (_req, res) => res.status(403).json({ fout: 'nee' }));
app.get('/api/multi-association/invitations/accept/:token', (_req, res) => res.json({ ok: true }));
app.get('/api/tickets/:code', (_req, res) => res.json({ ok: true }));
app.get('/api/zoek', (_req, res) => res.json({ ok: true }));

type Velden = { phase?: string; query?: Record<string, unknown>; [veld: string]: unknown };

/** De aanroepen van een nagemaakte logfunctie, als [boodschap, velden]. */
const aanroepen = (functie: unknown) => vi.mocked(functie as (...args: unknown[]) => unknown).mock.calls;

/** Alles wat er in dit verzoek naar het logboek ging, als één tekst. */
function allesGelogd(): string {
  return JSON.stringify(
    [logger.info, logger.warn, logger.error, logger.debug, logSecurity].flatMap((functie) => aanroepen(functie)),
  );
}

/** De velden van de eerste logregel in deze fase. */
function regel(fase: 'start' | 'complete'): Velden {
  const niveaus = fase === 'start' ? [logger.debug] : [logger.info, logger.warn, logger.error];
  const gevonden = niveaus.flatMap((functie) => aanroepen(functie)).find((a) => (a[1] as Velden)?.phase === fase);
  expect(gevonden).toBeDefined();
  return (gevonden?.[1] ?? {}) as Velden;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('verzoeklogboek', () => {
  it('schrijft de Referer niet weg, alleen de herkomst', async () => {
    await request(app)
      .get('/api/auth/reset-password/validate')
      .set('Referer', `https://tutti.voorbeeld.nl/reset-password?token=${GEHEIM}`)
      .expect(200);

    const afgerond = regel('complete');
    expect(afgerond.referer).toBeUndefined();
    expect(afgerond.refererOrigin).toBe('https://tutti.voorbeeld.nl');
    expect(allesGelogd()).not.toContain(GEHEIM);
  });

  it('laat een token in de querystring weg, ook in de debugregel', async () => {
    await request(app).get(`/api/auth/reset-password/validate?token=${GEHEIM}`).expect(200);

    expect(regel('start').query?.token).toBe('[weggelaten]');
    expect(allesGelogd()).not.toContain(GEHEIM);
  });

  it('laat het token van een agenda-abonnement weg, ook als de toegang wordt geweigerd', async () => {
    // Een 403 gaat ook naar het beveiligingslogboek; daar hoort het evenmin in.
    await request(app).get(`/api/calendar/feed/lid-1?token=${GEHEIM}`).expect(403);

    expect(logSecurity).toHaveBeenCalled();
    expect(allesGelogd()).not.toContain(GEHEIM);
  });

  it('laat een token als padsegment weg bij een uitnodiging en een kaartje', async () => {
    await request(app).get(`/api/multi-association/invitations/accept/${GEHEIM}`).expect(200);
    await request(app).get(`/api/tickets/${GEHEIM}`).expect(200);

    expect(allesGelogd()).not.toContain(GEHEIM);
  });

  it('houdt gewone zoekparameters leesbaar', async () => {
    await request(app).get('/api/zoek?q=bolero&author=Ravel').expect(200);

    expect(regel('start').query).toEqual({ q: 'bolero', author: 'Ravel' });
  });
});

describe('hulpjes voor het verzoeklogboek', () => {
  it('refererHerkomst geeft alleen schema, host en poort', () => {
    expect(refererHerkomst('https://a.voorbeeld.nl:8443/pad?token=x#y')).toBe('https://a.voorbeeld.nl:8443');
    expect(refererHerkomst(undefined)).toBeUndefined();
    expect(refererHerkomst('geen adres')).toBeUndefined();
    expect(refererHerkomst('about:blank')).toBeUndefined();
  });

  it('veiligeQuery maskeert geheime namen, ook genest', () => {
    expect(
      veiligeQuery({
        token: 'a',
        code: 'b',
        'hub.verify_token': 'c',
        access_token: 'd',
        filter: { apiKey: 'e', naam: 'f' },
        pagina: '2',
      }),
    ).toEqual({
      token: '[weggelaten]',
      code: '[weggelaten]',
      'hub.verify_token': '[weggelaten]',
      access_token: '[weggelaten]',
      filter: { apiKey: '[weggelaten]', naam: 'f' },
      pagina: '2',
    });
    expect(veiligeQuery({})).toBeUndefined();
  });

  it('veiligPad laat andere kaartjesroutes staan', () => {
    expect(veiligPad('/api/tickets/webhooks/payment')).toBe('/api/tickets/webhooks/payment');
    expect(veiligPad('/api/tickets/ABC123/validate')).toBe('/api/tickets/[weggelaten]/validate');
    expect(veiligPad('/api/concerts/1/tickets')).toBe('/api/concerts/1/tickets');
  });
});
