/**
 * Tests voor de koppelingen-api (Microsoft, SMTP, Telegram, WhatsApp, cloud).
 *
 * De functies in integrations.ts zetten een pad in elkaar, geven een body mee en
 * leveren `response.data` terug. Daarom wordt hier op het pad, de methode, de
 * body en de queryreeks getoetst - een typefout daarin geeft geen foutmelding
 * maar een leeg scherm. De routes zijn vergeleken met
 * backend/src/routes/microsoft-auth.ts (gemount op /api/auth/microsoft),
 * backend/src/routes/settings.ts (op /api/settings) en
 * backend/src/routes/cloud-import.ts (op /api/cloud-import).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  startNepserver,
  stopNepserver,
  antwoordMet,
  antwoordMetFout,
  antwoordMetNetwerkfout,
  antwoordMetTijdslimiet,
  laatsteVerzoek,
  alleVerzoeken,
} from './nepserver';
import {
  getMicrosoftEnabled,
  getMicrosoftLoginUrl,
  microsoftCallback,
  getMicrosoftConfig,
  saveMicrosoftConfig,
  removeMicrosoftConfig,
  getSmtpConfig,
  saveSmtpConfig,
  removeSmtpConfig,
  testSmtpConfig,
  getTelegramConfig,
  saveTelegramConfig,
  deleteTelegramConfig,
  getWhatsAppConfig,
  saveWhatsAppConfig,
  deleteWhatsAppConfig,
  getGoogleDriveSettings,
  updateGoogleDriveSettings,
  deleteGoogleDriveSettings,
  getCloudImportConfig,
  importFromOneDrive,
  importFromGoogleDrive,
} from '../integrations';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

// ===========================================
// MICROSOFT ENTRA ID
// ===========================================

describe('Microsoft-aanmelding', () => {
  it('getMicrosoftEnabled bevraagt /auth/microsoft/enabled zonder queryreeks', async () => {
    antwoordMet({ enabled: true });
    const resultaat = await getMicrosoftEnabled();

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('get');
    expect(verzoek.pad).toBe('/auth/microsoft/enabled');
    expect(verzoek.queryreeks).toBe('');
    expect(resultaat.enabled).toBe(true);
  });

  it('getMicrosoftEnabled geeft de vereniging mee als slug', async () => {
    antwoordMet({ enabled: false });
    await getMicrosoftEnabled('harmonie-sint-cecilia');

    expect(laatsteVerzoek().query.get('slug')).toBe('harmonie-sint-cecilia');
  });

  it('getMicrosoftLoginUrl bevraagt de aanmeldroute en geeft het adres door', async () => {
    antwoordMet({ authUrl: 'https://login.microsoftonline.com/nep' });
    const resultaat = await getMicrosoftLoginUrl('harmonie');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/auth/microsoft/login');
    expect(verzoek.query.get('slug')).toBe('harmonie');
    expect(resultaat.authUrl).toBe('https://login.microsoftonline.com/nep');
  });

  it('getMicrosoftLoginUrl codeert een slug met bijzondere tekens', async () => {
    antwoordMet({ authUrl: '' });
    await getMicrosoftLoginUrl('harmonie & fanfare');

    const { queryreeks, query } = laatsteVerzoek();
    // Een losse ampersand zou hier een tweede parameter opleveren.
    expect(queryreeks).not.toContain('& fanfare');
    expect(query.get('slug')).toBe('harmonie & fanfare');
  });

  it('microsoftCallback post code en state', async () => {
    antwoordMet({ token: 'nep-token', user: { id: 'u1' } });
    await microsoftCallback('code-123', 'state-456');

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/auth/microsoft/callback');
    expect(verzoek.body).toEqual({ code: 'code-123', state: 'state-456' });
  });

  it('laat een mislukte terugkoppeling als fout doorkomen', async () => {
    antwoordMetFout(400, { error: 'Ongeldige state.' });

    await expect(microsoftCallback('x', 'y')).rejects.toMatchObject({
      response: { status: 400, data: { error: 'Ongeldige state.' } },
    });
  });

  it('getMicrosoftConfig bevraagt de instellingen', async () => {
    antwoordMet({ clientId: 'nep-client', tenantId: 'nep-tenant', enabled: true });
    await getMicrosoftConfig();

    expect(laatsteVerzoek().pad).toBe('/auth/microsoft/config');
  });

  it('saveMicrosoftConfig gebruikt PUT met de volledige instellingen', async () => {
    antwoordMet({ message: 'Opgeslagen' });
    await saveMicrosoftConfig({
      clientId: 'nep-client',
      clientSecret: 'nep-geheim-voor-test',
      tenantId: 'nep-tenant',
      enabled: true,
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/auth/microsoft/config');
    expect(verzoek.body).toEqual({
      clientId: 'nep-client',
      clientSecret: 'nep-geheim-voor-test',
      tenantId: 'nep-tenant',
      enabled: true,
    });
  });

  it('saveMicrosoftConfig laat het geheim weg als het niet gewijzigd is', async () => {
    antwoordMet({ message: '' });
    await saveMicrosoftConfig({ clientId: 'nep-client', tenantId: 'nep-tenant', enabled: false });

    // Het bewaarde geheim mag niet met undefined overschreven worden; het veld
    // hoort er dan helemaal niet in te zitten.
    const body = laatsteVerzoek().body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['clientId', 'enabled', 'tenantId']);
    expect(body.enabled).toBe(false);
  });

  it('removeMicrosoftConfig verwijdert de instellingen', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await removeMicrosoftConfig();

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/auth/microsoft/config');
  });
});

// ===========================================
// SMTP
// ===========================================

describe('SMTP', () => {
  it('getSmtpConfig bevraagt /settings/smtp', async () => {
    antwoordMet({ host: 'smtp.example', port: 587, secure: false, enabled: true });
    const config = await getSmtpConfig();

    expect(laatsteVerzoek().pad).toBe('/settings/smtp');
    expect(config.host).toBe('smtp.example');
  });

  it('saveSmtpConfig gebruikt PUT met alle velden', async () => {
    antwoordMet({ message: 'Opgeslagen' });
    await saveSmtpConfig({
      host: 'smtp.example',
      port: 465,
      secure: true,
      user: 'post@example.com',
      password: 'nep-wachtwoord-voor-test',
      from: 'Harmonie <post@example.com>',
      enabled: true,
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/settings/smtp');
    expect(verzoek.body).toEqual({
      host: 'smtp.example',
      port: 465,
      secure: true,
      user: 'post@example.com',
      password: 'nep-wachtwoord-voor-test',
      from: 'Harmonie <post@example.com>',
      enabled: true,
    });
  });

  it('saveSmtpConfig stuurt secure false en poort 25 mee', async () => {
    antwoordMet({ message: '' });
    await saveSmtpConfig({
      host: 'smtp.example',
      port: 25,
      secure: false,
      user: '',
      from: 'post@example.com',
      enabled: false,
    });

    expect(laatsteVerzoek().body).toMatchObject({ port: 25, secure: false, enabled: false });
  });

  it('removeSmtpConfig verwijdert de instellingen', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await removeSmtpConfig();

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/settings/smtp');
  });

  it('testSmtpConfig post zonder body op de testroute', async () => {
    antwoordMet({ message: 'Testmail verstuurd' });
    await testSmtpConfig();

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/settings/smtp/test');
    expect(verzoek.body).toBeUndefined();
  });

  it('laat een mislukte testmail als fout doorkomen', async () => {
    antwoordMetFout(500, { error: 'Verbinding geweigerd.' });

    await expect(testSmtpConfig()).rejects.toMatchObject({
      response: { status: 500, data: { error: 'Verbinding geweigerd.' } },
    });
  });
});

// ===========================================
// TELEGRAM EN WHATSAPP
// ===========================================

describe('Telegram', () => {
  it('getTelegramConfig bevraagt /settings/telegram', async () => {
    antwoordMet({ enabled: false });
    await getTelegramConfig();

    expect(laatsteVerzoek().pad).toBe('/settings/telegram');
  });

  it('saveTelegramConfig gebruikt PUT met bot-sleutel en schakelaar', async () => {
    antwoordMet({ message: 'Opgeslagen' });
    await saveTelegramConfig({ botToken: 'nep-bot-sleutel', enabled: true });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/settings/telegram');
    expect(verzoek.body).toEqual({ botToken: 'nep-bot-sleutel', enabled: true });
  });

  it('saveTelegramConfig kan alleen uitzetten zonder de sleutel opnieuw te sturen', async () => {
    antwoordMet({ message: '' });
    await saveTelegramConfig({ enabled: false });

    expect(laatsteVerzoek().body).toEqual({ enabled: false });
  });

  it('deleteTelegramConfig verwijdert de koppeling', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteTelegramConfig();

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/settings/telegram');
  });
});

describe('WhatsApp', () => {
  it('getWhatsAppConfig bevraagt /settings/whatsapp', async () => {
    antwoordMet({ provider: 'meta', enabled: false });
    await getWhatsAppConfig();

    expect(laatsteVerzoek().pad).toBe('/settings/whatsapp');
  });

  it('saveWhatsAppConfig houdt de geneste blokken per aanbieder intact', async () => {
    antwoordMet({ message: 'Opgeslagen' });
    await saveWhatsAppConfig({
      provider: 'twilio',
      enabled: true,
      twilio: { accountSid: 'AC-test-0000', authToken: 'nep-token', whatsappFrom: '+31600000000' },
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/settings/whatsapp');
    // De geneste vorm moet blijven staan; platgeslagen velden leest de backend
    // niet en dan blijft de koppeling stil onvolledig.
    expect(verzoek.body).toEqual({
      provider: 'twilio',
      enabled: true,
      twilio: { accountSid: 'AC-test-0000', authToken: 'nep-token', whatsappFrom: '+31600000000' },
    });
  });

  it('saveWhatsAppConfig kan het meta-blok meesturen', async () => {
    antwoordMet({ message: '' });
    await saveWhatsAppConfig({
      provider: 'meta',
      enabled: true,
      meta: { phoneNumberId: '123', accessToken: 'nep-toegangssleutel' },
    });

    expect(laatsteVerzoek().body).toEqual({
      provider: 'meta',
      enabled: true,
      meta: { phoneNumberId: '123', accessToken: 'nep-toegangssleutel' },
    });
  });

  it('deleteWhatsAppConfig verwijdert de koppeling', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteWhatsAppConfig();

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/settings/whatsapp');
  });
});

// ===========================================
// GOOGLE DRIVE
// ===========================================

describe('Google Drive-instellingen', () => {
  it('getGoogleDriveSettings bevraagt /settings/google-drive', async () => {
    antwoordMet({ clientId: 'nep', apiKey: 'nep', enabled: true, configured: true });
    const instellingen = await getGoogleDriveSettings();

    expect(laatsteVerzoek().pad).toBe('/settings/google-drive');
    expect(instellingen.configured).toBe(true);
  });

  it('updateGoogleDriveSettings gebruikt PUT', async () => {
    antwoordMet({ message: 'Opgeslagen' });
    await updateGoogleDriveSettings({ clientId: 'nep-client', apiKey: 'nep-sleutel', enabled: true });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('put');
    expect(verzoek.pad).toBe('/settings/google-drive');
    expect(verzoek.body).toEqual({ clientId: 'nep-client', apiKey: 'nep-sleutel', enabled: true });
  });

  it('deleteGoogleDriveSettings verwijdert de instellingen', async () => {
    antwoordMet({ message: 'Verwijderd' });
    await deleteGoogleDriveSettings();

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/settings/google-drive');
  });
});

// ===========================================
// IMPORTEREN UIT DE CLOUD
// ===========================================

describe('cloudimport', () => {
  it('getCloudImportConfig bevraagt /cloud-import/config', async () => {
    antwoordMet({
      onedrive: { enabled: true, clientId: 'nep', tenantId: 'common' },
      googleDrive: { enabled: false, clientId: null, apiKey: null },
    });
    const config = await getCloudImportConfig();

    expect(laatsteVerzoek().pad).toBe('/cloud-import/config');
    expect(config.onedrive.tenantId).toBe('common');
  });

  it('importFromOneDrive post bestanden, sleutel en lijst', async () => {
    antwoordMet({ message: 'Geimporteerd', uploaded: [] });
    await importFromOneDrive({
      files: [{ id: 'f1', name: 'partij.pdf', downloadUrl: 'https://nep.example/f1' }],
      accessToken: 'nep-toegangssleutel',
      listId: 'l1',
    });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('post');
    expect(verzoek.pad).toBe('/cloud-import/onedrive');
    expect(verzoek.body).toEqual({
      files: [{ id: 'f1', name: 'partij.pdf', downloadUrl: 'https://nep.example/f1' }],
      accessToken: 'nep-toegangssleutel',
      listId: 'l1',
    });
  });

  it('importFromGoogleDrive gebruikt de google-drive-route', async () => {
    antwoordMet({ message: 'Geimporteerd', uploaded: [] });
    await importFromGoogleDrive({ files: [{ id: 'f1', name: 'partij.pdf' }], accessToken: 'nep-sleutel' });

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/cloud-import/google-drive');
    expect(verzoek.body).toEqual({ files: [{ id: 'f1', name: 'partij.pdf' }], accessToken: 'nep-sleutel' });
  });

  it('geeft het importverslag met fouten per bestand ongewijzigd door', async () => {
    const antwoord = {
      message: 'Deels geimporteerd',
      uploaded: [{ id: 'm1', filename: 'partij.pdf', title: 'Mars', instrumentId: 'i1', instrumentFound: true }],
      errors: [{ filename: 'kapot.pdf', error: 'Niet leesbaar' }],
    };
    antwoordMet(antwoord);

    await expect(importFromGoogleDrive({ files: [{ id: 'f1', name: 'x' }], accessToken: 'nep' })).resolves.toEqual(
      antwoord,
    );
  });

  it('stuurt een lege bestandenlijst mee in plaats van hem weg te laten', async () => {
    antwoordMet({ message: '', uploaded: [] });
    await importFromOneDrive({ files: [], accessToken: 'nep' });

    expect(laatsteVerzoek().body).toEqual({ files: [], accessToken: 'nep' });
  });
});

// ===========================================
// ALGEMEEN GEDRAG
// ===========================================

describe('algemeen gedrag van de koppelingen-api', () => {
  it('stuurt precies een verzoek per aanroep', async () => {
    antwoordMet({ enabled: false });
    await getMicrosoftEnabled();

    expect(alleVerzoeken()).toHaveLength(1);
  });

  it('werpt bij een netwerkfout zonder respons', async () => {
    antwoordMetNetwerkfout();

    await expect(getSmtpConfig()).rejects.toMatchObject({ code: 'ERR_NETWORK' });
  });

  it('werpt als het verzoek in de tijdslimiet loopt', async () => {
    antwoordMetTijdslimiet();

    await expect(getCloudImportConfig()).rejects.toMatchObject({ code: 'ECONNABORTED' });
  });

  it('laat een 403 door voor wie geen beheerder is', async () => {
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(getWhatsAppConfig()).rejects.toMatchObject({ response: { status: 403 } });
  });

  it('levert niets op bij een void-functie maar valt ook niet over een leeg antwoord', async () => {
    antwoordMet('', { status: 204 });

    await expect(removeSmtpConfig()).resolves.toBeUndefined();
  });
});
