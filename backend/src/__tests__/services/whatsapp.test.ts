/**
 * WhatsApp: welke vereniging levert de aansluiting, waar gaat het bericht
 * heen, en wat er met de sleutels en telefoonnummers gebeurt.
 *
 * Er zijn twee aanbieders met elk hun eigen geheim: Meta werkt met een
 * `Authorization: Bearer <accessToken>`, Twilio met basisauthenticatie op
 * account-sid en auth-token. Geen van beide hoort ooit in een logregel of in
 * een teruggegeven object terecht te komen, en het telefoonnummer van een lid
 * evenmin.
 *
 * De dienst leest zijn env-variabelen op moduleniveau, dus hij wordt per test
 * opnieuw ingeladen via `laadDienst()`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestAssociation, createTestUser, TestAssociation, TestUser } from '../testUtils';

const axiosMock = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
const loggerMock = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
const dbHouder = vi.hoisted(() => ({ huidig: null as any }));

vi.mock('axios', () => ({ default: axiosMock }));
vi.mock('../../utils/logger', () => ({ default: loggerMock }));

// Zie telegram.test.ts: de mock uit setup.ts importeert testDb dynamisch en
// zou na vi.resetModules() een lege database opleveren. Dit doorgeefluik wijst
// altijd naar de instantie die de opzet heeft klaargezet.
vi.mock('../../database/connection', () => ({
  default: new Proxy({} as any, {
    get: (_doel, sleutel) => {
      const waarde = dbHouder.huidig?.[sleutel];
      return typeof waarde === 'function' ? waarde.bind(dbHouder.huidig) : waarde;
    },
  }),
}));

dbHouder.huidig = testDb;

type WhatsAppDienst = typeof import('../../services/whatsapp');

const ENV_SLEUTELS = [
  'WHATSAPP_API_URL',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_FROM',
];

/** Laadt de dienst opnieuw met precies deze env-variabelen en geen andere. */
async function laadDienst(env: Record<string, string | undefined> = {}): Promise<WhatsAppDienst> {
  vi.resetModules();
  for (const sleutel of ENV_SLEUTELS) delete process.env[sleutel];
  for (const [sleutel, waarde] of Object.entries(env)) {
    if (waarde !== undefined) process.env[sleutel] = waarde;
  }
  return (await import('../../services/whatsapp')) as WhatsAppDienst;
}

const META_TOKEN = 'EAAG-geheim-meta-token';
const TWILIO_SID = 'ACgeheimsid0000000000000000000000';
const TWILIO_TOKEN = 'geheim-twilio-auth-token';
const NUMMER = '+31612345678';

function zetMetaAan(vereniging: TestAssociation, aan = true): void {
  testDb
    .prepare(
      `UPDATE associations
          SET whatsapp_enabled = ?, whatsapp_provider = 'meta',
              whatsapp_phone_number_id = ?, whatsapp_access_token = ?
        WHERE id = ?`,
    )
    .run(aan ? 1 : 0, '55501', META_TOKEN, vereniging.id);
}

function zetTwilioAan(vereniging: TestAssociation): void {
  testDb
    .prepare(
      `UPDATE associations
          SET whatsapp_enabled = 1, whatsapp_provider = 'twilio',
              twilio_account_sid = ?, twilio_auth_token = ?, twilio_whatsapp_from = ?
        WHERE id = ?`,
    )
    .run(TWILIO_SID, TWILIO_TOKEN, 'whatsapp:+14155238886', vereniging.id);
}

function koppelNummer(lid: TestUser, nummer: string, geverifieerd = true): void {
  testDb
    .prepare(
      `INSERT INTO user_notification_channels (id, user_id, channel_type, channel_id, verified)
       VALUES (?, ?, 'whatsapp', ?, ?)`,
    )
    .run(uuidv4(), lid.id, nummer, geverifieerd ? 1 : 0);
}

/** Antwoord zoals de Meta Graph API het geeft bij een geslaagde verzending. */
function metaGelukt(id = 'wamid.HBg') {
  return { data: { messages: [{ id }] } };
}

function axiosFout(status: number, data: unknown, url: string) {
  const fout: any = new Error(`Request failed with status code ${status}`);
  fout.isAxiosError = true;
  fout.response = { status, data };
  fout.config = { url, method: 'post', headers: { Authorization: `Bearer ${META_TOKEN}` } };
  return fout;
}

/** Alles wat er aan de logger is meegegeven, plat geslagen tot doorzoekbare tekst. */
function gelogdeTekst(): string {
  const alles = [
    ...loggerMock.info.mock.calls,
    ...loggerMock.warn.mock.calls,
    ...loggerMock.error.mock.calls,
    ...loggerMock.debug.mock.calls,
  ];
  return alles
    .flat()
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return `${arg.message} ${JSON.stringify((arg as any).config ?? {})}`;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' | ');
}

describe('whatsapp', () => {
  let vereniging: TestAssociation;
  let lid: TestUser;

  beforeEach(() => {
    vi.clearAllMocks();
    vereniging = createTestAssociation({ name: 'Harmonie Eén' });
    lid = createTestUser(vereniging.id, { email: 'lid@een.nl', firstName: 'Jan', lastName: 'Pieterse' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ------------------------------------------------------------------
  // 1. De verenigingsgrens
  // ------------------------------------------------------------------
  describe('configuratie per vereniging', () => {
    it('geeft de Meta-instellingen van de gevraagde vereniging', async () => {
      zetMetaAan(vereniging);
      const dienst = await laadDienst();

      expect(dienst.getWhatsAppConfig(vereniging.id)).toEqual({
        provider: 'meta',
        phoneNumberId: '55501',
        accessToken: META_TOKEN,
        apiUrl: 'https://graph.facebook.com/v18.0',
      });
    });

    it('geeft de Twilio-instellingen van de gevraagde vereniging', async () => {
      zetTwilioAan(vereniging);
      const dienst = await laadDienst();

      expect(dienst.getWhatsAppConfig(vereniging.id)).toEqual({
        provider: 'twilio',
        accountSid: TWILIO_SID,
        authToken: TWILIO_TOKEN,
        whatsappFrom: 'whatsapp:+14155238886',
      });
    });

    it('leent de instellingen van een andere vereniging niet uit', async () => {
      const andere = createTestAssociation({ name: 'Harmonie Twee' });
      zetMetaAan(vereniging);
      const dienst = await laadDienst();

      expect(dienst.getWhatsAppConfig(andere.id)).toBeNull();
    });

    it('negeert instellingen waarvan de schakelaar uit staat', async () => {
      zetMetaAan(vereniging, false);
      const dienst = await laadDienst();

      expect(dienst.getWhatsAppConfig(vereniging.id)).toBeNull();
    });

    it('negeert een halve Meta-instelling', async () => {
      testDb
        .prepare(
          `UPDATE associations
              SET whatsapp_enabled = 1, whatsapp_provider = 'meta', whatsapp_phone_number_id = ?
            WHERE id = ?`,
        )
        .run('55501', vereniging.id);
      const dienst = await laadDienst();

      // Zonder toegangssleutel is er niets te versturen; half ingevuld telt niet.
      expect(dienst.getWhatsAppConfig(vereniging.id)).toBeNull();
    });

    it('negeert een onbekende aanbieder', async () => {
      testDb
        .prepare(`UPDATE associations SET whatsapp_enabled = 1, whatsapp_provider = 'signal' WHERE id = ?`)
        .run(vereniging.id);
      const dienst = await laadDienst();

      expect(dienst.getWhatsAppConfig(vereniging.id)).toBeNull();
    });

    it('valt terug op de Meta-omgevingsvariabelen', async () => {
      const dienst = await laadDienst({
        WHATSAPP_PHONE_NUMBER_ID: 'env-nummer',
        WHATSAPP_ACCESS_TOKEN: 'env-sleutel',
      });

      expect(dienst.getWhatsAppConfig(vereniging.id)).toMatchObject({ provider: 'meta', phoneNumberId: 'env-nummer' });
    });

    it('valt terug op de Twilio-omgevingsvariabelen', async () => {
      const dienst = await laadDienst({
        TWILIO_ACCOUNT_SID: 'env-sid',
        TWILIO_AUTH_TOKEN: 'env-token',
        TWILIO_WHATSAPP_FROM: 'whatsapp:+10000000000',
      });

      expect(dienst.getWhatsAppConfig()).toMatchObject({ provider: 'twilio', accountSid: 'env-sid' });
    });

    it('kiest Meta als beide aanbieders in de omgeving staan', async () => {
      const dienst = await laadDienst({
        WHATSAPP_PHONE_NUMBER_ID: 'env-nummer',
        WHATSAPP_ACCESS_TOKEN: 'env-sleutel',
        TWILIO_ACCOUNT_SID: 'env-sid',
        TWILIO_AUTH_TOKEN: 'env-token',
        TWILIO_WHATSAPP_FROM: 'whatsapp:+10000000000',
      });

      expect(dienst.getWhatsAppConfig()?.provider).toBe('meta');
    });

    it('neemt een eigen api-url uit de omgeving over', async () => {
      zetMetaAan(vereniging);
      const dienst = await laadDienst({ WHATSAPP_API_URL: 'https://graph.facebook.com/v19.0' });

      expect(dienst.getWhatsAppConfig(vereniging.id)).toMatchObject({ apiUrl: 'https://graph.facebook.com/v19.0' });
    });

    it('geeft niets terug als er nergens iets is ingesteld', async () => {
      const dienst = await laadDienst();

      expect(dienst.getWhatsAppConfig(vereniging.id)).toBeNull();
      expect(dienst.getWhatsAppConfig()).toBeNull();
    });

    /**
     * Hetzelfde gat als bij Telegram, vastgelegd zoals het is.
     *
     * isWhatsAppConfigured() zonder vereniging kijkt of ERGENS in de tabel een
     * vereniging WhatsApp aan heeft staan. routes/notificationChannels.ts
     * roept precies zo aan (regel 300), dus een lid van een vereniging zonder
     * WhatsApp krijgt te horen dat het kanaal beschikbaar is. Koppelen loopt
     * daarna stuk op "Kon verificatiecode niet verzenden", omdat
     * sendVerificationCode het verenigings-id evenmin meekrijgt.
     */
    it('meldt platformbreed geconfigureerd zodra EEN willekeurige vereniging het aan heeft', async () => {
      const andere = createTestAssociation({ name: 'Harmonie Twee' });
      zetMetaAan(vereniging);
      const dienst = await laadDienst();

      expect(dienst.isWhatsAppConfigured(andere.id)).toBe(false);
      expect(dienst.isWhatsAppConfigured()).toBe(true);
    });

    it('telt een half ingevulde vereniging niet mee in de platformbrede controle', async () => {
      testDb
        .prepare(`UPDATE associations SET whatsapp_enabled = 1, whatsapp_provider = 'meta' WHERE id = ?`)
        .run(vereniging.id);
      const dienst = await laadDienst();

      expect(dienst.isWhatsAppConfigured()).toBe(false);
    });

    it('meldt geconfigureerd voor de eigen vereniging en via de omgeving', async () => {
      zetTwilioAan(vereniging);
      const dienst = await laadDienst();
      expect(dienst.isWhatsAppConfigured(vereniging.id)).toBe(true);

      const metEnv = await laadDienst({
        WHATSAPP_PHONE_NUMBER_ID: 'env-nummer',
        WHATSAPP_ACCESS_TOKEN: 'env-sleutel',
      });
      expect(metEnv.isWhatsAppConfigured()).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // 2. Gaat het bericht naar de juiste ontvanger?
  // ------------------------------------------------------------------
  describe('verzenden naar de juiste ontvanger', () => {
    it('stuurt naar het nummer van het lid zelf', async () => {
      zetMetaAan(vereniging);
      koppelNummer(lid, NUMMER);
      axiosMock.post.mockResolvedValue(metaGelukt());
      const dienst = await laadDienst();

      const gelukt = await dienst.sendWhatsAppNotification(lid.id, 'Titel', 'Tekst', undefined, vereniging.id);

      expect(gelukt).toBe(true);
      const [url, payload] = axiosMock.post.mock.calls[0];
      expect(url).toBe('https://graph.facebook.com/v18.0/55501/messages');
      expect(payload.to).toBe('31612345678');
      expect(payload.template).toMatchObject({ name: 'harmonie_notification', language: { code: 'nl' } });
    });

    it('gebruikt niet het nummer van een lid van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: 'Harmonie Twee' });
      const vreemdeLid = createTestUser(andere.id, { email: 'lid@twee.nl' });
      zetMetaAan(vereniging);
      koppelNummer(lid, NUMMER);
      koppelNummer(vreemdeLid, '+31699999999');
      axiosMock.post.mockResolvedValue(metaGelukt());
      const dienst = await laadDienst();

      await dienst.sendWhatsAppNotification(lid.id, 'Titel', 'Tekst', undefined, vereniging.id);

      expect(axiosMock.post).toHaveBeenCalledTimes(1);
      expect(axiosMock.post.mock.calls[0][1].to).toBe('31612345678');
    });

    it('stuurt niets als het nummer niet geverifieerd is', async () => {
      zetMetaAan(vereniging);
      koppelNummer(lid, NUMMER, false);
      const dienst = await laadDienst();

      expect(await dienst.sendWhatsAppNotification(lid.id, 'Titel', 'Tekst', undefined, vereniging.id)).toBe(false);
      expect(axiosMock.post).not.toHaveBeenCalled();
    });

    it('stuurt niets als het lid geen WhatsApp-kanaal heeft', async () => {
      zetMetaAan(vereniging);
      const dienst = await laadDienst();

      expect(await dienst.sendWhatsAppNotification(lid.id, 'Titel', 'Tekst', undefined, vereniging.id)).toBe(false);
      expect(axiosMock.post).not.toHaveBeenCalled();
    });

    /**
     * Zoals bij Telegram: zonder verenigings-id en zonder omgevingsvariabelen
     * is er geen aansluiting, dus mislukt elke verzending stil - ook voor een
     * vereniging die WhatsApp netjes heeft ingesteld. Dat is precies de
     * aanroep die services/notifications.ts doet (regel 446).
     */
    it('verstuurt niets zonder verenigings-id, ook al heeft de vereniging een aansluiting', async () => {
      zetMetaAan(vereniging);
      koppelNummer(lid, NUMMER);
      const dienst = await laadDienst();

      expect(await dienst.sendWhatsAppNotification(lid.id, 'Titel', 'Tekst')).toBe(false);
      expect(axiosMock.post).not.toHaveBeenCalled();
      expect(loggerMock.warn).toHaveBeenCalledWith('No WhatsApp provider configured');
    });

    it('haalt opmaaktekens uit het nummer voor Meta', async () => {
      zetMetaAan(vereniging);
      axiosMock.post.mockResolvedValue(metaGelukt());
      const dienst = await laadDienst();

      await dienst.sendWhatsAppMessage({ to: '+31 612-345 678', text: 'hoi' }, vereniging.id);

      // Meta wil alleen cijfers; de plus, spaties en streepjes gaan eruit.
      expect(axiosMock.post.mock.calls[0][1].to).toBe('31612345678');
    });

    it('stuurt een gewoon tekstbericht als er geen sjabloon is', async () => {
      zetMetaAan(vereniging);
      axiosMock.post.mockResolvedValue(metaGelukt());
      const dienst = await laadDienst();

      await dienst.sendWhatsAppMessage({ to: NUMMER, text: 'hoi' }, vereniging.id);

      const payload = axiosMock.post.mock.calls[0][1];
      expect(payload.type).toBe('text');
      expect(payload.text).toEqual({ body: 'hoi' });
    });

    it('zet sjabloonparameters in de juiste vorm', async () => {
      zetMetaAan(vereniging);
      axiosMock.post.mockResolvedValue(metaGelukt());
      const dienst = await laadDienst();

      await dienst.sendWhatsAppMessage(
        { to: NUMMER, templateName: 'harmonie_notification', templateParams: ['Titel', 'Tekst'] },
        vereniging.id,
      );

      expect(axiosMock.post.mock.calls[0][1].template.components).toEqual([
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Titel' },
            { type: 'text', text: 'Tekst' },
          ],
        },
      ]);
    });

    it('weigert een bericht zonder sjabloon en zonder tekst', async () => {
      zetMetaAan(vereniging);
      const dienst = await laadDienst();

      expect(await dienst.sendWhatsAppMessage({ to: NUMMER }, vereniging.id)).toBeNull();
      expect(axiosMock.post).not.toHaveBeenCalled();
      expect(loggerMock.error).toHaveBeenCalledWith('WhatsApp message must have either templateName or text');
    });

    it('stuurt via Twilio met het whatsapp-voorvoegsel en basisauthenticatie', async () => {
      zetTwilioAan(vereniging);
      axiosMock.post.mockResolvedValue({ data: { sid: 'SM123' } });
      const dienst = await laadDienst();

      const id = await dienst.sendWhatsAppMessage({ to: NUMMER, text: 'hoi' }, vereniging.id);

      expect(id).toBe('SM123');
      const [url, body, opties] = axiosMock.post.mock.calls[0];
      expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`);
      const velden = new URLSearchParams(body);
      expect(velden.get('From')).toBe('whatsapp:+14155238886');
      expect(velden.get('To')).toBe(`whatsapp:${NUMMER}`);
      expect(velden.get('Body')).toBe('hoi');
      expect(opties.auth).toEqual({ username: TWILIO_SID, password: TWILIO_TOKEN });
    });

    it('zet het whatsapp-voorvoegsel er niet twee keer voor', async () => {
      zetTwilioAan(vereniging);
      axiosMock.post.mockResolvedValue({ data: { sid: 'SM123' } });
      const dienst = await laadDienst();

      await dienst.sendWhatsAppMessage({ to: `whatsapp:${NUMMER}`, text: 'hoi' }, vereniging.id);

      expect(new URLSearchParams(axiosMock.post.mock.calls[0][1]).get('To')).toBe(`whatsapp:${NUMMER}`);
    });

    it('stuurt de verificatiecode als sjabloonparameter', async () => {
      zetMetaAan(vereniging);
      axiosMock.post.mockResolvedValue(metaGelukt());
      const dienst = await laadDienst();

      expect(await dienst.sendVerificationCode(NUMMER, '123456', vereniging.id)).toBe(true);
      const payload = axiosMock.post.mock.calls[0][1];
      expect(payload.template.name).toBe('harmonie_verification');
      expect(payload.template.components[0].parameters).toEqual([{ type: 'text', text: '123456' }]);
    });

    it('meldt het als de verificatiecode niet verstuurd kon worden', async () => {
      const dienst = await laadDienst();

      expect(await dienst.sendVerificationCode(NUMMER, '123456', vereniging.id)).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // 3. Geheimen en telefoonnummers
  // ------------------------------------------------------------------
  describe('geheimen', () => {
    it('zet de toegangssleutel in de kopregel en niet in de body', async () => {
      zetMetaAan(vereniging);
      axiosMock.post.mockResolvedValue(metaGelukt());
      const dienst = await laadDienst();

      await dienst.sendWhatsAppMessage({ to: NUMMER, text: 'hoi' }, vereniging.id);

      const [, payload, opties] = axiosMock.post.mock.calls[0];
      expect(opties.headers.Authorization).toBe(`Bearer ${META_TOKEN}`);
      expect(JSON.stringify(payload)).not.toContain(META_TOKEN);
    });

    it('zet de toegangssleutel niet in de log bij een geslaagde verzending', async () => {
      zetMetaAan(vereniging);
      axiosMock.post.mockResolvedValue(metaGelukt());
      const dienst = await laadDienst();

      await dienst.sendWhatsAppMessage({ to: NUMMER, text: 'hoi' }, vereniging.id);

      expect(loggerMock.info).toHaveBeenCalled();
      expect(gelogdeTekst()).not.toContain(META_TOKEN);
    });

    it('zet de toegangssleutel niet in de log bij een 401', async () => {
      zetMetaAan(vereniging);
      axiosMock.post.mockRejectedValue(
        axiosFout(
          401,
          { error: { message: 'Invalid OAuth access token', code: 190 } },
          'https://graph.facebook.com/v18.0/55501/messages',
        ),
      );
      const dienst = await laadDienst();

      expect(await dienst.sendWhatsAppMessage({ to: NUMMER, text: 'hoi' }, vereniging.id)).toBeNull();
      expect(gelogdeTekst()).not.toContain(META_TOKEN);
    });

    it('zet het Twilio-authtoken niet in de log bij een fout', async () => {
      zetTwilioAan(vereniging);
      const fout: any = new Error('Request failed with status code 401');
      fout.response = { status: 401, data: { code: 20003, message: 'Authenticate' } };
      fout.config = { url: 'https://api.twilio.com/...', auth: { username: TWILIO_SID, password: TWILIO_TOKEN } };
      axiosMock.post.mockRejectedValue(fout);
      const dienst = await laadDienst();

      expect(await dienst.sendWhatsAppMessage({ to: NUMMER, text: 'hoi' }, vereniging.id)).toBeNull();
      expect(gelogdeTekst()).not.toContain(TWILIO_TOKEN);
    });

    /**
     * De dienst zelf zet het telefoonnummer nergens in een logregel. Dat is
     * geen toeval maar de bedoeling: logbestanden worden breder gelezen dan de
     * ledenadministratie. De route die het nummer wel teruggeeft
     * (routes/notificationChannels.ts) maskeert de laatste vier cijfers.
     *
     * Deze test bewaakt dat er hier niet alsnog een `${message.to}` in een
     * logregel sluipt.
     */
    it('zet het telefoonnummer niet in een logregel', async () => {
      zetMetaAan(vereniging);
      koppelNummer(lid, NUMMER);
      axiosMock.post.mockResolvedValueOnce(metaGelukt());
      const dienst = await laadDienst();

      await dienst.sendWhatsAppNotification(lid.id, 'Titel', 'Tekst', undefined, vereniging.id);
      expect(gelogdeTekst()).not.toContain('31612345678');

      axiosMock.post.mockRejectedValueOnce(
        axiosFout(400, { error: { message: 'Bad Request' } }, 'https://graph.facebook.com/v18.0/55501/messages'),
      );
      await dienst.sendWhatsAppNotification(lid.id, 'Titel', 'Tekst', undefined, vereniging.id);
      expect(gelogdeTekst()).not.toContain('31612345678');
    });

    it('geeft de sleutels niet mee in een fout die naar de aanroeper gaat', async () => {
      zetMetaAan(vereniging);
      axiosMock.post.mockRejectedValue(
        axiosFout(500, { error: { message: 'oeps' } }, 'https://graph.facebook.com/v18.0/55501/messages'),
      );
      const dienst = await laadDienst();

      // De dienst werpt niet, hij geeft null terug. Er is dus geen foutobject
      // met een `config` waarin de kopregel met de sleutel meelift.
      await expect(dienst.sendWhatsAppMessage({ to: NUMMER, text: 'hoi' }, vereniging.id)).resolves.toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // 4. Foutafhandeling
  // ------------------------------------------------------------------
  describe('foutafhandeling', () => {
    it('valt niet om bij een 429', async () => {
      zetMetaAan(vereniging);
      axiosMock.post.mockRejectedValue(
        axiosFout(
          429,
          { error: { message: 'Too many requests', code: 4 } },
          'https://graph.facebook.com/v18.0/55501/messages',
        ),
      );
      const dienst = await laadDienst();

      await expect(dienst.sendWhatsAppMessage({ to: NUMMER, text: 'hoi' }, vereniging.id)).resolves.toBeNull();
    });

    it('valt niet om bij een time-out', async () => {
      zetMetaAan(vereniging);
      const fout: any = new Error('timeout of 10000ms exceeded');
      fout.code = 'ECONNABORTED';
      fout.config = { url: 'https://graph.facebook.com/v18.0/55501/messages' };
      axiosMock.post.mockRejectedValue(fout);
      const dienst = await laadDienst();

      await expect(dienst.sendWhatsAppMessage({ to: NUMMER, text: 'hoi' }, vereniging.id)).resolves.toBeNull();
    });

    it('valt niet om als Twilio het weigert', async () => {
      zetTwilioAan(vereniging);
      axiosMock.post.mockRejectedValue(new Error('socket hang up'));
      const dienst = await laadDienst();

      await expect(dienst.sendWhatsAppMessage({ to: NUMMER, text: 'hoi' }, vereniging.id)).resolves.toBeNull();
    });

    it('trekt de aanroeper van een melding niet mee omlaag', async () => {
      zetMetaAan(vereniging);
      koppelNummer(lid, NUMMER);
      axiosMock.post.mockRejectedValue(
        axiosFout(503, { error: { message: 'down' } }, 'https://graph.facebook.com/v18.0/55501/messages'),
      );
      const dienst = await laadDienst();

      await expect(dienst.sendWhatsAppNotification(lid.id, 'Titel', 'Tekst', undefined, vereniging.id)).resolves.toBe(
        false,
      );
    });

    it('geeft niets terug als Meta geen bericht-id meestuurt', async () => {
      zetMetaAan(vereniging);
      axiosMock.post.mockResolvedValue({ data: {} });
      const dienst = await laadDienst();

      expect(await dienst.sendWhatsAppMessage({ to: NUMMER, text: 'hoi' }, vereniging.id)).toBeUndefined();
    });

    /**
     * Zonder tijdslimiet blijft een verzending hangen zolang de tegenpartij de
     * verbinding openhoudt, en de melding wordt verstuurd binnen het verzoek
     * van een gebruiker.
     */
    it('geeft de Meta-aanroep een tijdslimiet mee', async () => {
      zetMetaAan(vereniging);
      axiosMock.post.mockResolvedValue(metaGelukt());
      const dienst = await laadDienst();

      await dienst.sendWhatsAppMessage({ to: NUMMER, text: 'hoi' }, vereniging.id);

      expect(axiosMock.post.mock.calls[0][2]?.timeout).toBeGreaterThan(0);
    });

    it('geeft de Twilio-aanroep een tijdslimiet mee', async () => {
      zetTwilioAan(vereniging);
      axiosMock.post.mockResolvedValue({ data: { sid: 'SM123' } });
      const dienst = await laadDienst();

      await dienst.sendWhatsAppMessage({ to: NUMMER, text: 'hoi' }, vereniging.id);

      expect(axiosMock.post.mock.calls[0][2]?.timeout).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------------
  // 5. Verificatiecodes
  // ------------------------------------------------------------------
  describe('verificatiecode', () => {
    it('maakt een code van zes cijfers', async () => {
      const dienst = await laadDienst();

      for (let i = 0; i < 50; i++) {
        const code = dienst.generateVerificationCode();
        expect(code).toMatch(/^[0-9]{6}$/);
        expect(Number(code)).toBeGreaterThanOrEqual(100000);
        expect(Number(code)).toBeLessThanOrEqual(999999);
      }
    });

    /**
     * Een verificatiecode is de enige drempel tussen "ik ken jouw
     * telefoonnummer" en "ik ontvang jouw meldingen". Math.random is een
     * voorspelbare generator: wie een paar uitkomsten ziet kan de volgende
     * berekenen. Daarom moet de code uit een cryptografische bron komen.
     *
     * Deze test vangt Math.random af op een vaste waarde. Een code die daarvan
     * afhangt is dan elke keer dezelfde.
     */
    it('leunt niet op Math.random', async () => {
      const dienst = await laadDienst();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const codes = new Set(Array.from({ length: 25 }, () => dienst.generateVerificationCode()));

      expect(codes.size).toBeGreaterThan(1);
    });
  });

  // ------------------------------------------------------------------
  // 6. Webhook
  // ------------------------------------------------------------------
  describe('webhook-verificatie', () => {
    it('geeft de uitdaging terug bij het juiste token', async () => {
      const dienst = await laadDienst({ WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'klopt-wel' });

      expect(dienst.verifyWebhook('subscribe', 'klopt-wel', 'uitdaging')).toBe('uitdaging');
    });

    it('wijst een verkeerd token af', async () => {
      const dienst = await laadDienst({ WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'klopt-wel' });

      expect(dienst.verifyWebhook('subscribe', 'klopt-niet', 'uitdaging')).toBeNull();
    });

    it('wijst een andere modus af', async () => {
      const dienst = await laadDienst({ WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'klopt-wel' });

      expect(dienst.verifyWebhook('unsubscribe', 'klopt-wel', 'uitdaging')).toBeNull();
    });

    /**
     * Zonder ingesteld token maakt de dienst er zelf een willekeurige van 32
     * bytes. Niemand kent die, dus de webhook gaat dicht in plaats van open.
     * Dat is de goede kant om op te falen.
     */
    it('gaat dicht als er geen token is ingesteld', async () => {
      const dienst = await laadDienst();

      expect(dienst.verifyWebhook('subscribe', '', 'uitdaging')).toBeNull();
      expect(dienst.verifyWebhook('subscribe', 'gok', 'uitdaging')).toBeNull();
    });
  });

  describe('binnenkomende berichten lezen', () => {
    it('leest een bezorgstatus van Meta', async () => {
      const dienst = await laadDienst();

      const status = dienst.parseWebhookPayload({
        entry: [
          { changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'delivered', timestamp: '1700000000' }] } }] },
        ],
      });

      expect(status).toEqual({
        messageId: 'wamid.1',
        status: 'delivered',
        timestamp: '1700000000',
        errorMessage: undefined,
      });
    });

    it('neemt de foutmelding van Meta over', async () => {
      const dienst = await laadDienst();

      const status = dienst.parseWebhookPayload({
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [
                    { id: 'wamid.2', status: 'failed', timestamp: '1', errors: [{ message: 'Nummer bestaat niet' }] },
                  ],
                },
              },
            ],
          },
        ],
      });

      expect(status).toMatchObject({ status: 'failed', errorMessage: 'Nummer bestaat niet' });
    });

    it('vertaalt de Twilio-statussen', async () => {
      const dienst = await laadDienst();

      expect(dienst.parseWebhookPayload({ MessageSid: 'SM1', MessageStatus: 'queued' })?.status).toBe('sent');
      expect(dienst.parseWebhookPayload({ MessageSid: 'SM1', MessageStatus: 'undelivered' })?.status).toBe('failed');
      expect(dienst.parseWebhookPayload({ MessageSid: 'SM1', MessageStatus: 'read' })?.status).toBe('read');
      // Een status die Twilio later toevoegt mag niet als mislukt gelden.
      expect(dienst.parseWebhookPayload({ MessageSid: 'SM1', MessageStatus: 'nieuw' })?.status).toBe('sent');
    });

    it('geeft niets terug bij een lading die nergens over gaat', async () => {
      const dienst = await laadDienst();

      expect(dienst.parseWebhookPayload({})).toBeNull();
      expect(dienst.parseWebhookPayload({ entry: [] })).toBeNull();
      expect(dienst.parseWebhookPayload(null)).toBeNull();
      expect(dienst.parseWebhookPayload('geen object')).toBeNull();
    });

    it('leest een binnenkomend bericht van Meta', async () => {
      const dienst = await laadDienst();

      expect(
        dienst.parseIncomingMessage({
          entry: [{ changes: [{ value: { messages: [{ from: '31612345678', text: { body: 'hallo' } }] } }] }],
        }),
      ).toEqual({ from: '31612345678', text: 'hallo' });
    });

    it('leest een binnenkomend bericht zonder tekst als lege tekst', async () => {
      const dienst = await laadDienst();

      expect(
        dienst.parseIncomingMessage({
          entry: [{ changes: [{ value: { messages: [{ from: '31612345678', type: 'image' }] } }] }],
        }),
      ).toEqual({ from: '31612345678', text: '' });
    });

    it('leest een binnenkomend bericht van Twilio en haalt het voorvoegsel eraf', async () => {
      const dienst = await laadDienst();

      expect(dienst.parseIncomingMessage({ From: 'whatsapp:+31612345678', Body: 'hallo' })).toEqual({
        from: '+31612345678',
        text: 'hallo',
      });
    });

    it('geeft niets terug bij een bericht dat nergens over gaat', async () => {
      const dienst = await laadDienst();

      expect(dienst.parseIncomingMessage({})).toBeNull();
      expect(dienst.parseIncomingMessage(null)).toBeNull();
    });
  });
});
