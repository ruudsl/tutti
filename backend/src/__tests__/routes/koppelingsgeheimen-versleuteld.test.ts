/**
 * Geheimen van koppelingen staan versleuteld in de database, en de koppeling
 * werkt daarna nog.
 *
 * Het SMTP-wachtwoord, de tokens voor Telegram, WhatsApp en Twilio, het
 * clientgeheim van Entra ID en de Google-tokens stonden als klaartekst in de
 * database. Wie een back-up of het databasebestand in handen kreeg, had ze
 * allemaal. Per koppeling: wat de route opslaat is geen klaartekst, de
 * dienst die het geheim gebruikt krijgt de klaartekst, en de browser krijgt
 * alleen te zien dát er een geheim is.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import settingsRoutes from '../../routes/settings';
import microsoftAuthRoutes from '../../routes/microsoft-auth';
import calendarRoutes from '../../routes/calendar';
import { errorHandler } from '../../middleware/errorHandler';
import { decrypt, encrypt, isEncrypted } from '../../utils/encryption';
import { getTelegramConfig } from '../../services/telegram';
import { getWhatsAppConfig } from '../../services/whatsapp';
import { getMicrosoftConfig } from '../../utils/m365';
import { createTestEnvironment, TestAssociation, TestUser } from '../testUtils';

const { createTransport, sendMail, verify } = vi.hoisted(() => {
  const sendMail = vi.fn().mockResolvedValue({ messageId: 'test-bericht' });
  const verify = vi.fn().mockResolvedValue(true);
  const createTransport = vi.fn(() => ({ sendMail, verify }));
  return { createTransport, sendMail, verify };
});
vi.mock('nodemailer', () => ({ default: { createTransport } }));

const google = vi.hoisted(() => ({
  exchangeGoogleCode: vi.fn(),
  refreshGoogleToken: vi.fn(),
  createGoogleCalendarEvent: vi.fn(),
}));
vi.mock('../../services/calendarSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/calendarSync')>()),
  ...google,
}));

// De testopzet vervangt utils/email door een nepversie; hier is het echte
// bestand juist het onderwerp.
vi.unmock('../../utils/email');
const { sendEmail } = await vi.importActual<typeof import('../../utils/email')>('../../utils/email');

// De SMTP-testknop controleert of de host naar buiten wijst; in de test wijst
// hij nergens heen.
vi.mock('../../utils/uitgaandAdres', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/uitgaandAdres')>()),
  controleerUitgaandAdres: vi.fn(async (adres: string) => new URL(adres)),
}));

const app = express();
app.use(express.json());
app.use('/api/settings', settingsRoutes);
app.use('/api/auth/microsoft', microsoftAuthRoutes);
app.use('/api/calendar', calendarRoutes);
app.use(errorHandler);

let vereniging: TestAssociation;
let beheerder: TestUser;
let beheerderToken: string;

const alsBeheerder = (methode: 'get' | 'post' | 'put', pad: string) =>
  request(app)[methode](pad).set('Authorization', `Bearer ${beheerderToken}`);

function associatieKolom(kolom: string): string | null {
  return (
    db.prepare(`SELECT ${kolom} AS waarde FROM associations WHERE id = ?`).get(vereniging.id) as {
      waarde: string | null;
    }
  ).waarde;
}

/** Opgeslagen als cijfertekst, en die ontsleutelt tot de oorspronkelijke waarde. */
function verwachtVersleuteld(opgeslagen: string | null, klaartekst: string): void {
  expect(opgeslagen).not.toBeNull();
  expect(opgeslagen).not.toContain(klaartekst);
  expect(isEncrypted(opgeslagen!)).toBe(true);
  expect(decrypt(opgeslagen!)).toBe(klaartekst);
}

beforeEach(() => {
  const omgeving = createTestEnvironment();
  vereniging = omgeving.association;
  beheerder = omgeving.adminUser;
  beheerderToken = omgeving.adminToken;
  createTransport.mockClear();
  sendMail.mockClear();
  verify.mockClear();
  vi.stubEnv('SMTP_HOST', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('SMTP-wachtwoord', () => {
  const smtp = {
    host: 'smtp.vereniging.example',
    port: 587,
    user: 'post@vereniging.example',
    password: 'smtp-wachtwoord-klaar',
    from: 'Vereniging <post@vereniging.example>',
    enabled: true,
  };

  it('staat na opslaan niet als klaartekst in de database', async () => {
    expect((await alsBeheerder('put', '/api/settings/smtp').send(smtp)).status).toBe(200);
    verwachtVersleuteld(associatieKolom('smtp_pass'), smtp.password);
  });

  it('gaat ontsleuteld naar de mailserver bij het versturen van mail', async () => {
    await alsBeheerder('put', '/api/settings/smtp').send(smtp);

    await sendEmail({ to: 'lid@vereniging.example', subject: 'Hallo', text: 'Tekst', associationId: vereniging.id });

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(createTransport.mock.calls[0]).toMatchObject([{ auth: { user: smtp.user, pass: smtp.password } }]);
  });

  it('gaat ontsleuteld naar de mailserver bij de testknop', async () => {
    await alsBeheerder('put', '/api/settings/smtp').send(smtp);

    const antwoord = await alsBeheerder('post', '/api/settings/smtp/test');

    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
    expect(createTransport.mock.calls[0]).toMatchObject([{ auth: { pass: smtp.password } }]);
  });

  it('komt niet terug naar de browser', async () => {
    await alsBeheerder('put', '/api/settings/smtp').send(smtp);
    const antwoord = await alsBeheerder('get', '/api/settings/smtp');
    expect(JSON.stringify(antwoord.body)).not.toContain(smtp.password);
  });
});

describe('Telegram-bottoken', () => {
  const token = '123456789:bottoken-voor-de-test';

  it('staat versleuteld opgeslagen en gaat ontsleuteld naar Telegram', async () => {
    await alsBeheerder('put', '/api/settings/telegram').send({ botToken: token, enabled: true });

    verwachtVersleuteld(associatieKolom('telegram_bot_token'), token);
    expect(getTelegramConfig(vereniging.id)?.botToken).toBe(token);
  });

  it('laat de browser alleen zien dát er een token is, geen enkel teken ervan', async () => {
    await alsBeheerder('put', '/api/settings/telegram').send({ botToken: token, enabled: true });

    const antwoord = await alsBeheerder('get', '/api/settings/telegram');

    expect(antwoord.body.configured).toBe(true);
    expect(antwoord.body.tokenPreview).toMatch(/^•+$/);
    expect(JSON.stringify(antwoord.body)).not.toContain(token.slice(0, 6));
  });
});

describe('WhatsApp-tokens', () => {
  it('bewaart het Meta-toegangstoken versleuteld en geeft het ontsleuteld aan de dienst', async () => {
    await alsBeheerder('put', '/api/settings/whatsapp').send({
      provider: 'meta',
      enabled: true,
      meta: { phoneNumberId: '1234567890', accessToken: 'meta-toegangstoken-test' },
    });

    verwachtVersleuteld(associatieKolom('whatsapp_access_token'), 'meta-toegangstoken-test');
    expect(getWhatsAppConfig(vereniging.id)).toMatchObject({
      provider: 'meta',
      accessToken: 'meta-toegangstoken-test',
    });
  });

  it('bewaart het Twilio-token versleuteld en geeft het ontsleuteld aan de dienst', async () => {
    await alsBeheerder('put', '/api/settings/whatsapp').send({
      provider: 'twilio',
      enabled: true,
      twilio: { accountSid: 'AC-test', authToken: 'twilio-token-test', whatsappFrom: 'whatsapp:+14155238886' },
    });

    verwachtVersleuteld(associatieKolom('twilio_auth_token'), 'twilio-token-test');
    expect(getWhatsAppConfig(vereniging.id)).toMatchObject({ provider: 'twilio', authToken: 'twilio-token-test' });
  });

  it('laat een bestaand token staan als er geen nieuw wordt meegestuurd', async () => {
    await alsBeheerder('put', '/api/settings/whatsapp').send({
      provider: 'meta',
      meta: { phoneNumberId: '1234567890', accessToken: 'meta-toegangstoken-test' },
    });
    const voor = associatieKolom('whatsapp_access_token');

    await alsBeheerder('put', '/api/settings/whatsapp').send({ provider: 'meta', meta: { phoneNumberId: '99' } });

    expect(associatieKolom('whatsapp_access_token')).toBe(voor);
  });

  it('geeft de browser geen enkel teken van de tokens', async () => {
    await alsBeheerder('put', '/api/settings/whatsapp').send({
      provider: 'meta',
      meta: { phoneNumberId: '1234567890', accessToken: 'meta-toegangstoken-test' },
      twilio: { accountSid: 'AC-test', authToken: 'twilio-token-test', whatsappFrom: 'whatsapp:+1' },
    });

    const antwoord = await alsBeheerder('get', '/api/settings/whatsapp');

    expect(antwoord.body.meta.accessTokenPreview).toMatch(/^•+$/);
    expect(antwoord.body.twilio.authTokenPreview).toMatch(/^•+$/);
    const tekst = JSON.stringify(antwoord.body);
    expect(tekst).not.toContain('meta-t');
    expect(tekst).not.toContain('twilio-');
  });
});

describe('Entra-clientgeheim', () => {
  it('staat versleuteld opgeslagen en gaat ontsleuteld naar Microsoft', async () => {
    const antwoord = await alsBeheerder('put', '/api/auth/microsoft/config').send({
      clientId: 'client-id-test',
      clientSecret: 'entra-clientgeheim-test',
      tenantId: 'vereniging.onmicrosoft.com',
      enabled: true,
    });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

    verwachtVersleuteld(associatieKolom('microsoft_client_secret'), 'entra-clientgeheim-test');
    expect(getMicrosoftConfig(vereniging.id)?.microsoft_client_secret).toBe('entra-clientgeheim-test');
  });

  it('komt niet terug naar de browser', async () => {
    await alsBeheerder('put', '/api/auth/microsoft/config').send({
      clientId: 'client-id-test',
      clientSecret: 'entra-clientgeheim-test',
      tenantId: 'vereniging.onmicrosoft.com',
    });
    const antwoord = await alsBeheerder('get', '/api/auth/microsoft/config');
    expect(JSON.stringify(antwoord.body)).not.toContain('entra-clientgeheim-test');
  });
});

describe('Google-tokens', () => {
  beforeEach(() => {
    google.exchangeGoogleCode.mockReset();
    google.refreshGoogleToken.mockReset();
    google.createGoogleCalendarEvent.mockReset();
    db.prepare(
      'UPDATE associations SET google_calendar_client_id = ?, google_calendar_client_secret = ? WHERE id = ?',
    ).run('google-client', encrypt('google-clientgeheim'), vereniging.id);
  });

  function kalenderRij(): { google_access_token: string | null; google_refresh_token: string | null } {
    return db
      .prepare('SELECT google_access_token, google_refresh_token FROM user_calendar_settings WHERE user_id = ?')
      .get(beheerder.id) as { google_access_token: string | null; google_refresh_token: string | null };
  }

  it('bewaart de tokens van Google versleuteld na het koppelen', async () => {
    google.exchangeGoogleCode.mockResolvedValue({
      accessToken: 'google-toegang-test',
      refreshToken: 'google-vernieuw-test',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    await alsBeheerder('get', '/api/calendar/settings');
    const state = uuidv4();
    db.prepare(
      "INSERT INTO oauth_states (id, user_id, state, expires_at) VALUES (?, ?, ?, datetime('now', '+10 minutes'))",
    ).run(uuidv4(), beheerder.id, state);

    const antwoord = await request(app).get(`/api/calendar/google/callback?code=code-test&state=${state}`);

    expect(antwoord.headers.location).toContain('calendar_connected=true');
    // Het clientgeheim van de vereniging gaat ontsleuteld naar Google.
    expect(google.exchangeGoogleCode.mock.calls[0][2]).toBe('google-clientgeheim');
    const rij = kalenderRij();
    verwachtVersleuteld(rij.google_access_token, 'google-toegang-test');
    verwachtVersleuteld(rij.google_refresh_token, 'google-vernieuw-test');
  });

  it('vernieuwt met het ontsleutelde token en bewaart het nieuwe toegangstoken versleuteld', async () => {
    await alsBeheerder('get', '/api/calendar/settings');
    db.prepare(
      `UPDATE user_calendar_settings
         SET google_access_token = ?, google_refresh_token = ?, google_token_expires_at = ?,
             include_rehearsals = 0, include_concerts = 0
       WHERE user_id = ?`,
    ).run(encrypt('verlopen-toegang'), encrypt('google-vernieuw-test'), new Date(0).toISOString(), beheerder.id);
    google.refreshGoogleToken.mockResolvedValue({
      accessToken: 'nieuwe-toegang-test',
      expiresAt: new Date(Date.now() + 3600_000),
    });

    const antwoord = await alsBeheerder('post', '/api/calendar/google/sync');

    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
    expect(google.refreshGoogleToken).toHaveBeenCalledWith(
      'google-vernieuw-test',
      'google-client',
      'google-clientgeheim',
    );
    verwachtVersleuteld(kalenderRij().google_access_token, 'nieuwe-toegang-test');
  });
});
