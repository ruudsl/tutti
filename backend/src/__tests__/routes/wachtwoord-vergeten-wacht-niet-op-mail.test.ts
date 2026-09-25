/**
 * 'Wachtwoord vergeten' antwoordt voor een bestaand adres even snel als voor
 * een onbekend.
 *
 * Het antwoord was al hetzelfde, de looptijd niet: bij een bestaand adres
 * wachtte het verzoek op de mailserver. Dat verschil is van buitenaf te meten
 * en verraadt welke adressen een account hebben. Het maken van de link en het
 * versturen gebeurt nu in de wachtrij.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import '../setup';
import app from '../testApp';
import db from '../../database/connection';
import { sendPasswordResetEmail } from '../../utils/email';
import { WACHTWOORDHERSTEL_TAAK, verstuurWachtwoordHerstel } from '../../routes/auth';
import { registreerTaak, verwerkWachtrij } from '../../taken/wachtrij';
import { createTestEnvironment, TestUser } from '../testUtils';

const verstuur = vi.mocked(sendPasswordResetEmail);

describe('wachtwoord vergeten', () => {
  let lid: TestUser;

  beforeEach(() => {
    lid = createTestEnvironment().memberUser;
    verstuur.mockReset();
    verstuur.mockResolvedValue(true);
    registreerTaak(WACHTWOORDHERSTEL_TAAK, { herhaalbaar: false, uitvoeren: verstuurWachtwoordHerstel });
  });

  it('wacht bij een bestaand adres niet op de mailserver', async () => {
    // Een mailserver die niet antwoordt: het verzoek mag daar niet op blijven hangen.
    verstuur.mockImplementation(() => new Promise<boolean>(() => {}));

    const antwoord = await request(app).post('/api/auth/forgot-password').send({ email: lid.email }).timeout(3000);

    expect(antwoord.status).toBe(200);
    expect(verstuur).not.toHaveBeenCalled();
  });

  it('maakt de link en verstuurt hem in de wachtrij, zonder het token daar leesbaar neer te zetten', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email: lid.email });

    const taken = db.prepare('SELECT gegevens FROM achtergrondtaken WHERE soort = ?').all(WACHTWOORDHERSTEL_TAAK) as {
      gegevens: string;
    }[];
    expect(taken).toHaveLength(1);
    expect(JSON.parse(taken[0].gegevens)).toEqual({ userId: lid.id });

    await verwerkWachtrij();

    expect(verstuur).toHaveBeenCalledTimes(1);
    const [adres, token] = verstuur.mock.calls[0];
    expect(adres).toBe(lid.email);
    const opgeslagen = db
      .prepare('SELECT token FROM password_reset_tokens WHERE user_id = ? AND used = 0')
      .get(lid.id) as { token: string };
    expect(opgeslagen.token).toBe(crypto.createHash('sha256').update(token).digest('hex'));
  });

  it('zet niets in de wachtrij voor een onbekend adres', async () => {
    const antwoord = await request(app).post('/api/auth/forgot-password').send({ email: 'bestaat-niet@example.com' });

    expect(antwoord.status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) AS n FROM achtergrondtaken').get()).toEqual({ n: 0 });
  });

  it('laat een mislukte mail als mislukte taak staan', async () => {
    verstuur.mockResolvedValue(false);
    await request(app).post('/api/auth/forgot-password').send({ email: lid.email });

    await verwerkWachtrij();

    const taak = db.prepare('SELECT status FROM achtergrondtaken WHERE soort = ?').get(WACHTWOORDHERSTEL_TAAK) as {
      status: string;
    };
    expect(taak.status).toBe('mislukt');
  });
});
