/**
 * Waar de OAuth-client voor Google Agenda vandaan komt.
 *
 * De routes lazen alleen `associations.google_calendar_client_*`, en niets in
 * de applicatie vulde die kolommen: er is geen instellingenscherm voor, en de
 * kolommen bestonden alleen via database/init.ts. De knop "Koppel Google
 * Agenda" in het profiel gaf daardoor altijd "niet geconfigureerd".
 *
 * Wat hoort: de client van de installatie uit GOOGLE_CALENDAR_CLIENT_ID en
 * GOOGLE_CALENDAR_CLIENT_SECRET. Een client die voor een vereniging met de
 * hand in de database staat, gaat voor - zo werkte het, en zo blijft het
 * werken.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import calendarRoutes from '../../routes/calendar';
import { errorHandler } from '../../middleware/errorHandler';
import { encrypt } from '../../utils/encryption';
import { createTestEnvironment, TestAssociation, TestUser } from '../testUtils';

const google = vi.hoisted(() => ({
  exchangeGoogleCode: vi.fn(),
  refreshGoogleToken: vi.fn(),
  createGoogleCalendarEvent: vi.fn(),
}));
vi.mock('../../services/calendarSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/calendarSync')>()),
  ...google,
}));

const app = express();
app.use(express.json());
app.use('/api/calendar', calendarRoutes);
app.use(errorHandler);

describe('OAuth-client voor Google Agenda', () => {
  let vereniging: TestAssociation;
  let lid: TestUser;
  let lidToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    google.exchangeGoogleCode.mockReset();
    google.refreshGoogleToken.mockReset();
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', '');
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_SECRET', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const alsLid = (methode: 'get' | 'post', pad: string) =>
    request(app)[methode](`/api/calendar${pad}`).set('Authorization', `Bearer ${lidToken}`);

  const zetInstallatieClient = () => {
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', 'installatie-client.apps.example');
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_SECRET', 'installatie-clientgeheim');
  };

  /** Een geldige state voor de terugkeer van Google, zoals /google/auth die maakt. */
  async function stateVoorLid(): Promise<string> {
    await alsLid('get', '/settings');
    const state = uuidv4();
    db.prepare(
      "INSERT INTO oauth_states (id, user_id, state, expires_at) VALUES (?, ?, ?, datetime('now', '+10 minutes'))",
    ).run(uuidv4(), lid.id, state);
    return state;
  }

  it('geeft een aanmeldadres met de client van de installatie', async () => {
    zetInstallatieClient();

    const antwoord = await alsLid('post', '/google/auth');

    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
    expect(antwoord.body.authUrl).toContain('client_id=installatie-client.apps.example');
    expect(antwoord.body.authUrl).not.toContain('installatie-clientgeheim');
  });

  it('wisselt de code in met het geheim van de installatie', async () => {
    zetInstallatieClient();
    google.exchangeGoogleCode.mockResolvedValue({
      accessToken: 'toegang-test',
      refreshToken: 'vernieuw-test',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const state = await stateVoorLid();

    const antwoord = await request(app).get(`/api/calendar/google/callback?code=code-test&state=${state}`);

    expect(antwoord.headers.location).toContain('calendar_connected=true');
    expect(google.exchangeGoogleCode).toHaveBeenCalledWith(
      'code-test',
      'installatie-client.apps.example',
      'installatie-clientgeheim',
      expect.stringContaining('/api/calendar/google/callback'),
    );
  });

  it('vernieuwt het token met de client van de installatie', async () => {
    zetInstallatieClient();
    await alsLid('get', '/settings');
    db.prepare(
      `UPDATE user_calendar_settings
         SET google_access_token = ?, google_refresh_token = ?, google_token_expires_at = ?,
             include_rehearsals = 0, include_concerts = 0
       WHERE user_id = ?`,
    ).run(encrypt('verlopen-toegang'), encrypt('vernieuw-test'), new Date(0).toISOString(), lid.id);
    google.refreshGoogleToken.mockResolvedValue({
      accessToken: 'nieuwe-toegang',
      expiresAt: new Date(Date.now() + 3600_000),
    });

    const antwoord = await alsLid('post', '/google/sync');

    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
    expect(google.refreshGoogleToken).toHaveBeenCalledWith(
      'vernieuw-test',
      'installatie-client.apps.example',
      'installatie-clientgeheim',
    );
  });

  it('is niet ingesteld zonder geheim bij de installatie', async () => {
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', 'installatie-client.apps.example');

    const antwoord = await alsLid('post', '/google/auth');

    expect(antwoord.status).toBe(400);
    expect(antwoord.body.error).toContain('niet geconfigureerd');
  });

  it('gebruikt een client die voor de vereniging in de database staat eerst', async () => {
    zetInstallatieClient();
    db.prepare(
      'UPDATE associations SET google_calendar_client_id = ?, google_calendar_client_secret = ? WHERE id = ?',
    ).run('eigen-client.apps.example', encrypt('eigen-clientgeheim'), vereniging.id);
    google.exchangeGoogleCode.mockResolvedValue({
      accessToken: 'toegang-test',
      refreshToken: 'vernieuw-test',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const state = await stateVoorLid();

    await request(app).get(`/api/calendar/google/callback?code=code-test&state=${state}`);

    expect(google.exchangeGoogleCode.mock.calls[0][1]).toBe('eigen-client.apps.example');
    expect(google.exchangeGoogleCode.mock.calls[0][2]).toBe('eigen-clientgeheim');
  });
});
