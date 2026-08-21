/**
 * Telegram: welke vereniging levert de bot, waar gaat het bericht heen, en wat
 * gebeurt er als Telegram niet meewerkt.
 *
 * Het bottoken staat middenin de api-url (`https://api.telegram.org/bot<token>`).
 * Alles wat die url of een axios-foutobject in een logregel zet, zet daarmee
 * ook het token in de log. Dat is de reden dat hier zo vaak op logregels wordt
 * gecontroleerd in plaats van alleen op de teruggegeven waarde.
 *
 * De dienst leest zijn env-variabelen op moduleniveau. Daarom wordt hij per
 * test opnieuw ingeladen via `laadDienst()`; anders zou de eerste test bepalen
 * wat alle volgende zien.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestAssociation, createTestUser, TestAssociation, TestUser } from '../testUtils';

// vi.hoisted zorgt dat deze objecten al bestaan wanneer de mock-fabrieken
// draaien. Belangrijk is dat het steeds DEZELFDE objecten zijn: vi.resetModules()
// laat de fabrieken opnieuw lopen, en zonder deze vaste verwijzing zou de
// dienst na een herlaadbeurt tegen een andere mock praten dan de test bekijkt.
const axiosMock = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
const loggerMock = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
const dbHouder = vi.hoisted(() => ({ huidig: null as any }));

vi.mock('axios', () => ({ default: axiosMock }));
vi.mock('../../utils/logger', () => ({ default: loggerMock }));

// De opzet in setup.ts mockt de databaseverbinding met een dynamische import
// van testDb. Die import levert na vi.resetModules() een nieuwe, lege
// wrapper op. Daarom hier een doorgeefluik naar de instantie die de opzet al
// heeft klaargezet, zodat herladen de database niet kwijtraakt.
vi.mock('../../database/connection', () => ({
  default: new Proxy({} as any, {
    get: (_doel, sleutel) => {
      const waarde = dbHouder.huidig?.[sleutel];
      return typeof waarde === 'function' ? waarde.bind(dbHouder.huidig) : waarde;
    },
  }),
}));

dbHouder.huidig = testDb;

type TelegramDienst = typeof import('../../services/telegram');

/** Laadt de dienst opnieuw met precies deze env-variabelen en geen andere. */
async function laadDienst(env: Record<string, string | undefined> = {}): Promise<TelegramDienst> {
  vi.resetModules();
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  for (const [sleutel, waarde] of Object.entries(env)) {
    if (waarde !== undefined) process.env[sleutel] = waarde;
  }
  return (await import('../../services/telegram')) as TelegramDienst;
}

function zetTelegramAan(vereniging: TestAssociation, token: string, aan = true): void {
  testDb
    .prepare('UPDATE associations SET telegram_bot_token = ?, telegram_enabled = ? WHERE id = ?')
    .run(token, aan ? 1 : 0, vereniging.id);
}

function koppelChat(lid: TestUser, chatId: string, geverifieerd = true): void {
  testDb
    .prepare(
      `INSERT INTO user_notification_channels (id, user_id, channel_type, channel_id, verified)
       VALUES (?, ?, 'telegram', ?, ?)`,
    )
    .run(uuidv4(), lid.id, chatId, geverifieerd ? 1 : 0);
}

/** Antwoord zoals Telegram het geeft bij een geslaagde sendMessage. */
function gelukt(messageId = 4711) {
  return { data: { ok: true, result: { message_id: messageId } } };
}

/**
 * Een axios-fout heeft altijd een `config` met de aangeroepen url erin, en die
 * url bevat het bottoken. Precies dat maakt het loggen van een heel
 * foutobject gevaarlijk, dus de nagemaakte fout draagt die config ook.
 */
function axiosFout(status: number, data: unknown, url: string) {
  const fout: any = new Error(`Request failed with status code ${status}`);
  fout.isAxiosError = true;
  fout.response = { status, data };
  fout.config = { url, method: 'post', headers: { Authorization: 'Bearer iets' } };
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

const TOKEN = '123456:AAHgeheimBotToken';

describe('telegram', () => {
  let vereniging: TestAssociation;
  let lid: TestUser;

  beforeEach(() => {
    vi.clearAllMocks();
    vereniging = createTestAssociation({ name: 'Harmonie Eén' });
    lid = createTestUser(vereniging.id, { email: 'lid@een.nl', firstName: 'Jan', lastName: 'Pieterse' });
  });

  // ------------------------------------------------------------------
  // 1. De verenigingsgrens
  // ------------------------------------------------------------------
  describe('configuratie per vereniging', () => {
    it('geeft het token van de gevraagde vereniging', async () => {
      zetTelegramAan(vereniging, TOKEN);
      const dienst = await laadDienst();

      expect(dienst.getTelegramConfig(vereniging.id)).toEqual({
        botToken: TOKEN,
        apiUrl: `https://api.telegram.org/bot${TOKEN}`,
      });
    });

    it('leent het token van een andere vereniging niet uit', async () => {
      const andere = createTestAssociation({ name: 'Harmonie Twee' });
      zetTelegramAan(vereniging, TOKEN);
      const dienst = await laadDienst();

      // De tweede vereniging heeft niets ingesteld en moet dus niets krijgen,
      // ook al staat er verderop in de tabel wel een werkend token.
      expect(dienst.getTelegramConfig(andere.id)).toBeNull();
    });

    it('negeert een token waarvan de schakelaar uit staat', async () => {
      zetTelegramAan(vereniging, TOKEN, false);
      const dienst = await laadDienst();

      expect(dienst.getTelegramConfig(vereniging.id)).toBeNull();
    });

    it('valt terug op de omgevingsvariabele als de vereniging niets heeft', async () => {
      const dienst = await laadDienst({ TELEGRAM_BOT_TOKEN: 'env-token' });

      expect(dienst.getTelegramConfig(vereniging.id)?.botToken).toBe('env-token');
    });

    it('geeft niets terug als er nergens een token staat', async () => {
      const dienst = await laadDienst();

      expect(dienst.getTelegramConfig(vereniging.id)).toBeNull();
      expect(dienst.getTelegramConfig()).toBeNull();
    });

    it('geeft niets terug voor een vereniging die niet bestaat', async () => {
      const dienst = await laadDienst();

      expect(dienst.getTelegramConfig('bestaat-niet')).toBeNull();
    });

    /**
     * Dit is het gat waar de opdracht om vraagt, en het wordt hier vastgelegd
     * zoals het is - niet zoals het hoort.
     *
     * isTelegramConfigured() ZONDER vereniging kijkt of ergens in de tabel een
     * vereniging Telegram aan heeft staan. Voor een lid van een vereniging die
     * niets heeft ingesteld komt er dus `true` uit. routes/notificationChannels.ts
     * roept precies zo aan (regel 175), dus die route meldt "geconfigureerd"
     * terwijl het koppelen daarna nergens toe leidt.
     *
     * Die route mag hier niet aangepast worden; deze test is er zodat het
     * gedrag zwart op wit staat en een latere reparatie hem laat omvallen.
     */
    it('meldt platformbreed geconfigureerd zodra EEN willekeurige vereniging het aan heeft', async () => {
      const andere = createTestAssociation({ name: 'Harmonie Twee' });
      zetTelegramAan(vereniging, TOKEN);
      const dienst = await laadDienst();

      expect(dienst.isTelegramConfigured(andere.id)).toBe(false);
      expect(dienst.isTelegramConfigured()).toBe(true);
    });

    it('meldt niet geconfigureerd als geen enkele vereniging het aan heeft', async () => {
      zetTelegramAan(vereniging, TOKEN, false);
      const dienst = await laadDienst();

      expect(dienst.isTelegramConfigured()).toBe(false);
    });

    it('meldt geconfigureerd zodra de omgevingsvariabele er is', async () => {
      const dienst = await laadDienst({ TELEGRAM_BOT_TOKEN: 'env-token' });

      expect(dienst.isTelegramConfigured()).toBe(true);
      expect(dienst.isTelegramConfigured(vereniging.id)).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // 2. Gaat het bericht naar de juiste ontvanger?
  // ------------------------------------------------------------------
  describe('verzenden naar de juiste ontvanger', () => {
    it('stuurt naar het chat-id van het lid zelf', async () => {
      zetTelegramAan(vereniging, TOKEN);
      koppelChat(lid, '999111');
      axiosMock.post.mockResolvedValue(gelukt());
      const dienst = await laadDienst();

      const gelukt_ = await dienst.sendTelegramNotification(lid.id, 'Titel', 'Tekst', undefined, vereniging.id);

      expect(gelukt_).toBe(true);
      expect(axiosMock.post).toHaveBeenCalledTimes(1);
      const [url, body] = axiosMock.post.mock.calls[0];
      expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
      expect(body.chat_id).toBe('999111');
    });

    it('gebruikt niet het chat-id van een lid van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: 'Harmonie Twee' });
      const vreemdeLid = createTestUser(andere.id, { email: 'lid@twee.nl' });
      zetTelegramAan(vereniging, TOKEN);
      koppelChat(lid, '111');
      koppelChat(vreemdeLid, '222');
      axiosMock.post.mockResolvedValue(gelukt());
      const dienst = await laadDienst();

      await dienst.sendTelegramNotification(lid.id, 'Titel', 'Tekst', undefined, vereniging.id);

      expect(axiosMock.post.mock.calls[0][1].chat_id).toBe('111');
      expect(gelogdeTekst()).not.toContain('222');
    });

    it('stuurt niets als het kanaal niet geverifieerd is', async () => {
      zetTelegramAan(vereniging, TOKEN);
      koppelChat(lid, '999111', false);
      const dienst = await laadDienst();

      expect(await dienst.sendTelegramNotification(lid.id, 'Titel', 'Tekst', undefined, vereniging.id)).toBe(false);
      expect(axiosMock.post).not.toHaveBeenCalled();
    });

    it('stuurt niets als het lid helemaal geen Telegram-kanaal heeft', async () => {
      zetTelegramAan(vereniging, TOKEN);
      const dienst = await laadDienst();

      expect(await dienst.sendTelegramNotification(lid.id, 'Titel', 'Tekst', undefined, vereniging.id)).toBe(false);
      expect(axiosMock.post).not.toHaveBeenCalled();
    });

    /**
     * Feitelijk gedrag, geen goedkeuring: de dienst controleert niet of het lid
     * bij de meegegeven vereniging hoort. Wie een verenigings-id meegeeft,
     * bepaalt daarmee alleen welke bot er verstuurt.
     *
     * In de praktijk valt dit nu niet op omdat services/notifications.ts het
     * verenigings-id helemaal niet doorgeeft (regels 446 en 450), maar zodra
     * dat gerepareerd wordt is dit de plek waar de controle hoort.
     */
    it('controleert niet of het lid bij de meegegeven vereniging hoort', async () => {
      const andere = createTestAssociation({ name: 'Harmonie Twee' });
      const vreemdeLid = createTestUser(andere.id, { email: 'lid@twee.nl' });
      zetTelegramAan(vereniging, TOKEN);
      koppelChat(vreemdeLid, '777');
      axiosMock.post.mockResolvedValue(gelukt());
      const dienst = await laadDienst();

      const resultaat = await dienst.sendTelegramNotification(
        vreemdeLid.id,
        'Titel',
        'Tekst',
        undefined,
        vereniging.id,
      );

      expect(resultaat).toBe(true);
      expect(axiosMock.post.mock.calls[0][0]).toContain(TOKEN);
    });

    /**
     * Het gevolg van hetzelfde gat, maar dan andersom: zonder verenigings-id
     * en zonder omgevingsvariabele is er geen bot, dus mislukt elke verzending
     * stil - ook voor een lid van een vereniging die Telegram netjes heeft
     * ingesteld. Dat is precies de aanroep die notifications.ts doet.
     */
    it('verstuurt niets zonder verenigings-id, ook al heeft de vereniging een bot', async () => {
      zetTelegramAan(vereniging, TOKEN);
      koppelChat(lid, '999111');
      const dienst = await laadDienst();

      expect(await dienst.sendTelegramNotification(lid.id, 'Titel', 'Tekst')).toBe(false);
      expect(axiosMock.post).not.toHaveBeenCalled();
      expect(loggerMock.warn).toHaveBeenCalledWith('Telegram Bot not configured');
    });

    it('zet een knop onder het bericht als er een url meekomt', async () => {
      zetTelegramAan(vereniging, TOKEN);
      koppelChat(lid, '999111');
      axiosMock.post.mockResolvedValue(gelukt());
      const dienst = await laadDienst();

      await dienst.sendTelegramNotification(
        lid.id,
        'Titel',
        'Tekst',
        { url: 'https://app.example/agenda' },
        vereniging.id,
      );

      expect(axiosMock.post.mock.calls[0][1].reply_markup).toEqual({
        inline_keyboard: [[{ text: 'Openen in app', url: 'https://app.example/agenda' }]],
      });
    });
  });

  // ------------------------------------------------------------------
  // 3. Geheimen
  // ------------------------------------------------------------------
  describe('geheimen', () => {
    it('zet het bottoken niet in de logregel bij een geslaagde verzending', async () => {
      zetTelegramAan(vereniging, TOKEN);
      axiosMock.post.mockResolvedValue(gelukt(88));
      const dienst = await laadDienst();

      await dienst.sendTelegramMessage({ chatId: '1', text: 'hoi' }, vereniging.id);

      expect(loggerMock.info).toHaveBeenCalled();
      expect(gelogdeTekst()).not.toContain(TOKEN);
    });

    it('zet het bottoken niet in de log bij een 401 van Telegram', async () => {
      zetTelegramAan(vereniging, TOKEN);
      axiosMock.post.mockRejectedValue(
        axiosFout(401, { ok: false, description: 'Unauthorized' }, `https://api.telegram.org/bot${TOKEN}/sendMessage`),
      );
      const dienst = await laadDienst();

      await dienst.sendTelegramMessage({ chatId: '1', text: 'hoi' }, vereniging.id);

      expect(gelogdeTekst()).not.toContain(TOKEN);
    });

    it('zet het bottoken niet in de log als het opvragen van de botnaam mislukt', async () => {
      zetTelegramAan(vereniging, TOKEN);
      axiosMock.get.mockRejectedValue(
        axiosFout(404, { ok: false, description: 'Not Found' }, `https://api.telegram.org/bot${TOKEN}/getMe`),
      );
      const dienst = await laadDienst();

      expect(await dienst.getBotUsername(vereniging.id)).toBeNull();
      expect(gelogdeTekst()).not.toContain(TOKEN);
    });

    it('zet het bottoken niet in de log als het verwijderen van de webhook mislukt', async () => {
      zetTelegramAan(vereniging, TOKEN);
      axiosMock.post.mockRejectedValue(
        axiosFout(500, { ok: false }, `https://api.telegram.org/bot${TOKEN}/deleteWebhook`),
      );
      const dienst = await laadDienst();

      expect(await dienst.deleteWebhook(vereniging.id)).toBe(false);
      expect(gelogdeTekst()).not.toContain(TOKEN);
    });

    it('zet het webhookgeheim niet in de log als het instellen mislukt', async () => {
      zetTelegramAan(vereniging, TOKEN);
      axiosMock.post.mockRejectedValue(
        axiosFout(400, { ok: false, description: 'Bad Request' }, `https://api.telegram.org/bot${TOKEN}/setWebhook`),
      );
      const dienst = await laadDienst({ TELEGRAM_WEBHOOK_SECRET: 'zeer-geheim-woord' });

      expect(await dienst.setWebhook('https://app.example/hook', vereniging.id)).toBe(false);
      expect(gelogdeTekst()).not.toContain('zeer-geheim-woord');
    });
  });

  // ------------------------------------------------------------------
  // 4. Foutafhandeling
  // ------------------------------------------------------------------
  describe('foutafhandeling', () => {
    it('valt niet om bij een 429 en geeft niets terug', async () => {
      zetTelegramAan(vereniging, TOKEN);
      axiosMock.post.mockRejectedValue(
        axiosFout(
          429,
          { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 30 } },
          `https://api.telegram.org/bot${TOKEN}/sendMessage`,
        ),
      );
      const dienst = await laadDienst();

      await expect(dienst.sendTelegramMessage({ chatId: '1', text: 'hoi' }, vereniging.id)).resolves.toBeNull();
    });

    it('valt niet om bij een 401', async () => {
      zetTelegramAan(vereniging, TOKEN);
      axiosMock.post.mockRejectedValue(
        axiosFout(401, { ok: false, description: 'Unauthorized' }, `https://api.telegram.org/bot${TOKEN}/sendMessage`),
      );
      const dienst = await laadDienst();

      await expect(dienst.sendTelegramMessage({ chatId: '1', text: 'hoi' }, vereniging.id)).resolves.toBeNull();
    });

    it('valt niet om bij een time-out', async () => {
      zetTelegramAan(vereniging, TOKEN);
      const fout: any = new Error('timeout of 10000ms exceeded');
      fout.code = 'ECONNABORTED';
      fout.config = { url: `https://api.telegram.org/bot${TOKEN}/sendMessage` };
      axiosMock.post.mockRejectedValue(fout);
      const dienst = await laadDienst();

      await expect(dienst.sendTelegramMessage({ chatId: '1', text: 'hoi' }, vereniging.id)).resolves.toBeNull();
      expect(gelogdeTekst()).not.toContain(TOKEN);
    });

    /**
     * Zonder tijdslimiet blijft een verzending hangen zolang de tegenpartij
     * de verbinding openhoudt. De aanroeper - een melding versturen tijdens
     * een verzoek - wacht dan mee.
     */
    it('geeft axios een tijdslimiet mee', async () => {
      zetTelegramAan(vereniging, TOKEN);
      axiosMock.post.mockResolvedValue(gelukt());
      const dienst = await laadDienst();

      await dienst.sendTelegramMessage({ chatId: '1', text: 'hoi' }, vereniging.id);

      const opties = axiosMock.post.mock.calls[0][2];
      expect(opties?.timeout).toBeGreaterThan(0);
    });

    it('geeft ook bij het opvragen van de botnaam een tijdslimiet mee', async () => {
      zetTelegramAan(vereniging, TOKEN);
      axiosMock.get.mockResolvedValue({ data: { ok: true, result: { username: 'harmoniebot' } } });
      const dienst = await laadDienst();

      await dienst.getBotUsername(vereniging.id);

      expect(axiosMock.get.mock.calls[0][1]?.timeout).toBeGreaterThan(0);
    });

    it('geeft niets terug als Telegram ok:false antwoordt', async () => {
      zetTelegramAan(vereniging, TOKEN);
      axiosMock.post.mockResolvedValue({ data: { ok: false, description: 'chat not found' } });
      const dienst = await laadDienst();

      expect(await dienst.sendTelegramMessage({ chatId: '1', text: 'hoi' }, vereniging.id)).toBeNull();
      expect(loggerMock.error).toHaveBeenCalledWith('Telegram API error:', 'chat not found');
    });

    it('laat een binnenkomend bericht niet omvallen als het antwoord niet verstuurd kan worden', async () => {
      zetTelegramAan(vereniging, TOKEN);
      axiosMock.post.mockRejectedValue(
        axiosFout(500, { ok: false }, `https://api.telegram.org/bot${TOKEN}/sendMessage`),
      );
      const dienst = await laadDienst();

      await expect(
        dienst.processUpdate(
          {
            update_id: 1,
            message: {
              message_id: 1,
              from: { id: 5, is_bot: false, first_name: 'Jan' },
              chat: { id: 5, type: 'private' },
              date: 0,
              text: '/status',
            },
          },
          vereniging.id,
        ),
      ).resolves.toBeUndefined();
    });

    it('valt niet om als er helemaal geen bot is ingesteld', async () => {
      const dienst = await laadDienst();

      await expect(
        dienst.processUpdate({
          update_id: 1,
          message: {
            message_id: 1,
            from: { id: 5, is_bot: false, first_name: 'Jan' },
            chat: { id: 5, type: 'private' },
            date: 0,
            text: '/onbekend',
          },
        }),
      ).resolves.toBeUndefined();
      expect(axiosMock.post).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  // 5. Berichtopbouw
  // ------------------------------------------------------------------
  describe('berichtopbouw', () => {
    it('ontsnapt de tekens die de HTML-modus van Telegram breken', async () => {
      zetTelegramAan(vereniging, TOKEN);
      koppelChat(lid, '999111');
      axiosMock.post.mockResolvedValue(gelukt());
      const dienst = await laadDienst();

      await dienst.sendTelegramNotification(lid.id, 'Kop & <b>vet</b>', 'Tekst met <script>', undefined, vereniging.id);

      const body = axiosMock.post.mock.calls[0][1];
      expect(body.parse_mode).toBe('HTML');
      expect(body.text).toBe('<b>Kop &amp; &lt;b&gt;vet&lt;/b&gt;</b>\n\nTekst met &lt;script&gt;');
    });

    /**
     * De opdracht noemt Markdown, maar deze dienst stuurt in HTML-modus. In
     * HTML zijn `_`, `*` en `[` gewone tekens, dus die horen ongemoeid te
     * blijven. Zou de modus ooit op Markdown gezet worden, dan valt deze test
     * om en is dat een aanwijzing dat er ook een Markdown-ontsnapping moet
     * komen.
     */
    it('laat onderstrepen, sterretjes en haken met rust in de HTML-modus', async () => {
      zetTelegramAan(vereniging, TOKEN);
      koppelChat(lid, '999111');
      axiosMock.post.mockResolvedValue(gelukt());
      const dienst = await laadDienst();

      await dienst.sendTelegramNotification(lid.id, 'Jan_Pieter *let op* [1]', 'niets', undefined, vereniging.id);

      expect(axiosMock.post.mock.calls[0][1].text).toContain('Jan_Pieter *let op* [1]');
    });

    /**
     * Bevestigingen op /start en /status gaan via sendTelegramMessage, dat
     * standaard parse_mode HTML zet. Er staat een naam en een e-mailadres in
     * die uit de database komen. Een lid dat "Jan <de> Vries" heet levert dan
     * ongeldige HTML op en Telegram weigert het hele bericht met een 400: de
     * gebruiker krijgt geen bevestiging te zien terwijl de koppeling wel is
     * gelegd.
     */
    it('ontsnapt de naam in de bevestiging van een koppeling', async () => {
      zetTelegramAan(vereniging, TOKEN);
      const bijzonder = createTestUser(vereniging.id, {
        email: 'raar@een.nl',
        firstName: 'Jan <de>',
        lastName: 'Vries & Zn',
      });
      testDb
        .prepare(
          `INSERT INTO telegram_link_codes (id, user_id, code, expires_at)
                  VALUES (?, ?, ?, datetime('now', '+10 minutes'))`,
        )
        .run(uuidv4(), bijzonder.id, 'code-abc');
      const dienst = await laadDienst();

      const tekst = await dienst.handleStartCommand(4242, 'code-abc', vereniging.id);

      expect(tekst).toContain('Jan &lt;de&gt; Vries &amp; Zn');
      expect(tekst).not.toContain('Jan <de>');
    });

    it('ontsnapt naam en e-mailadres in het statusbericht', async () => {
      const bijzonder = createTestUser(vereniging.id, {
        email: 'a&b@een.nl',
        firstName: 'Jan <de>',
        lastName: 'Vries',
      });
      koppelChat(bijzonder, '4242');
      const dienst = await laadDienst();

      const tekst = await dienst.handleStatusCommand(4242);

      expect(tekst).toContain('Jan &lt;de&gt; Vries');
      expect(tekst).toContain('a&amp;b@een.nl');
    });
  });

  // ------------------------------------------------------------------
  // 6. Koppelen en commando's
  // ------------------------------------------------------------------
  describe('koppelcodes', () => {
    it('vervangt een eerder uitgegeven code van hetzelfde lid', async () => {
      const dienst = await laadDienst();

      dienst.storeLinkCode(lid.id, 'eerste');
      dienst.storeLinkCode(lid.id, 'tweede');

      const codes = testDb.prepare('SELECT code FROM telegram_link_codes WHERE user_id = ?').all(lid.id) as Array<{
        code: string;
      }>;
      expect(codes.map((c) => c.code)).toEqual(['tweede']);
    });

    it('maakt een code die niet te raden is', async () => {
      const dienst = await laadDienst();

      const code = dienst.generateLinkCode();
      expect(code).toMatch(/^[0-9a-f]{32}$/);
      expect(dienst.generateLinkCode()).not.toBe(code);
    });

    it('bouwt een koppel-url met de botnaam erin', async () => {
      zetTelegramAan(vereniging, TOKEN);
      axiosMock.get.mockResolvedValue({ data: { ok: true, result: { username: 'harmoniebot' } } });
      const dienst = await laadDienst();

      const resultaat = await dienst.generateLinkUrl(lid.id, vereniging.id);

      expect(resultaat?.url).toBe(`https://t.me/harmoniebot?start=${resultaat?.code}`);
      const bewaard = testDb.prepare('SELECT code FROM telegram_link_codes WHERE user_id = ?').get(lid.id) as
        { code: string } | undefined;
      expect(bewaard?.code).toBe(resultaat?.code);
    });

    it('geeft geen url als er geen bot is', async () => {
      const dienst = await laadDienst();

      expect(await dienst.generateLinkUrl(lid.id, vereniging.id)).toBeNull();
      expect(testDb.prepare('SELECT COUNT(*) AS n FROM telegram_link_codes').get()).toEqual({ n: 0 });
    });
  });

  describe('commandos', () => {
    it('geeft een welkomsttekst zonder koppelcode', async () => {
      const dienst = await laadDienst();

      const tekst = await dienst.handleStartCommand(1);
      expect(tekst).toContain('Welkom');
      expect(tekst).toContain('/stop');
    });

    it('weigert een onbekende koppelcode', async () => {
      const dienst = await laadDienst();

      const tekst = await dienst.handleStartCommand(1, 'bestaat-niet');

      expect(tekst).toContain('ongeldig of verlopen');
      expect(testDb.prepare('SELECT COUNT(*) AS n FROM user_notification_channels').get()).toEqual({ n: 0 });
    });

    /**
     * De vervaltijd wordt weggezet met datetime('now', '+10 minutes') en
     * vergeleken met datetime('now'). Beide kanten zijn dus SQLite-notatie met
     * een spatie; er komt geen ISO-tekst aan te pas, dus deze vergelijking
     * gaat goed. Deze test bewaakt dat.
     */
    it('weigert een verlopen koppelcode', async () => {
      testDb
        .prepare(
          `INSERT INTO telegram_link_codes (id, user_id, code, expires_at)
                  VALUES (?, ?, ?, datetime('now', '-1 minutes'))`,
        )
        .run(uuidv4(), lid.id, 'oud');
      const dienst = await laadDienst();

      expect(await dienst.handleStartCommand(1, 'oud')).toContain('ongeldig of verlopen');
      expect(testDb.prepare('SELECT COUNT(*) AS n FROM user_notification_channels').get()).toEqual({ n: 0 });
    });

    it('koppelt de chat en ruimt de gebruikte code op', async () => {
      testDb
        .prepare(
          `INSERT INTO telegram_link_codes (id, user_id, code, expires_at)
                  VALUES (?, ?, ?, datetime('now', '+10 minutes'))`,
        )
        .run(uuidv4(), lid.id, 'goed');
      const dienst = await laadDienst();

      const tekst = await dienst.handleStartCommand(555, 'goed');

      expect(tekst).toContain('succesvol gekoppeld');
      const kanaal = testDb.prepare('SELECT user_id, channel_id, verified FROM user_notification_channels').get() as {
        user_id: string;
        channel_id: string;
        verified: number;
      };
      expect(kanaal).toEqual({ user_id: lid.id, channel_id: '555', verified: 1 });
      expect(testDb.prepare('SELECT COUNT(*) AS n FROM telegram_link_codes').get()).toEqual({ n: 0 });
    });

    it('haalt een chat weg bij het vorige lid als die opnieuw gekoppeld wordt', async () => {
      const tweede = createTestUser(vereniging.id, { email: 'tweede@een.nl' });
      koppelChat(lid, '555');
      testDb
        .prepare(
          `INSERT INTO telegram_link_codes (id, user_id, code, expires_at)
                  VALUES (?, ?, ?, datetime('now', '+10 minutes'))`,
        )
        .run(uuidv4(), tweede.id, 'goed');
      const dienst = await laadDienst();

      await dienst.handleStartCommand(555, 'goed');

      const kanalen = testDb
        .prepare('SELECT user_id FROM user_notification_channels WHERE channel_id = ?')
        .all('555') as Array<{ user_id: string }>;
      expect(kanalen).toEqual([{ user_id: tweede.id }]);
    });

    it('verbreekt met /stop alleen de koppeling van deze chat', async () => {
      const tweede = createTestUser(vereniging.id, { email: 'tweede@een.nl' });
      koppelChat(lid, '111');
      koppelChat(tweede, '222');
      const dienst = await laadDienst();

      const tekst = await dienst.handleStopCommand(111);

      expect(tekst).toContain('uitgeschakeld');
      const over = testDb.prepare('SELECT channel_id FROM user_notification_channels').all() as Array<{
        channel_id: string;
      }>;
      expect(over).toEqual([{ channel_id: '222' }]);
    });

    it('meldt bij /stop netjes dat er niets gekoppeld is', async () => {
      const dienst = await laadDienst();

      expect(await dienst.handleStopCommand(111)).toContain('niet gekoppeld');
    });

    it('toont bij /settings de standaard ingeschakelde soorten', async () => {
      koppelChat(lid, '111');
      const dienst = await laadDienst();

      const antwoord = await dienst.handleSettingsCommand(111);

      expect(antwoord.text).toContain('Nieuwe muziek');
      expect(antwoord.text).toContain('Concert herinneringen');
    });

    it('toont bij /settings alleen wat het lid aan heeft staan', async () => {
      koppelChat(lid, '111');
      testDb
        .prepare(
          `INSERT INTO notification_preferences
             (id, user_id, new_music, rehearsal_changes, seating_updates, chat_messages, practice_reminders, concert_reminders)
           VALUES (?, ?, 1, 0, 0, 0, 0, 0)`,
        )
        .run(uuidv4(), lid.id);
      const dienst = await laadDienst();

      const antwoord = await dienst.handleSettingsCommand(111);

      expect(antwoord.text).toContain('Nieuwe muziek');
      expect(antwoord.text).not.toContain('Repetitie wijzigingen');
    });

    it('meldt bij /settings dat er niets gekoppeld is', async () => {
      const dienst = await laadDienst();

      expect((await dienst.handleSettingsCommand(111)).text).toContain('niet gekoppeld');
    });

    it('meldt bij /status dat er niets gekoppeld is', async () => {
      const dienst = await laadDienst();

      expect(await dienst.handleStatusCommand(111)).toContain('niet gekoppeld');
    });

    it('beantwoordt een onbekend commando zonder de database aan te raken', async () => {
      zetTelegramAan(vereniging, TOKEN);
      axiosMock.post.mockResolvedValue(gelukt());
      const dienst = await laadDienst();

      await dienst.processUpdate(
        {
          update_id: 1,
          message: {
            message_id: 1,
            from: { id: 9, is_bot: false, first_name: 'Jan' },
            chat: { id: 9, type: 'private' },
            date: 0,
            text: 'hallo daar',
          },
        },
        vereniging.id,
      );

      expect(axiosMock.post.mock.calls[0][1].text).toContain('Onbekend commando');
    });

    it('pakt de koppelcode uit /start <code>', async () => {
      testDb
        .prepare(
          `INSERT INTO telegram_link_codes (id, user_id, code, expires_at)
                  VALUES (?, ?, ?, datetime('now', '+10 minutes'))`,
        )
        .run(uuidv4(), lid.id, 'viacommando');
      zetTelegramAan(vereniging, TOKEN);
      axiosMock.post.mockResolvedValue(gelukt());
      const dienst = await laadDienst();

      await dienst.processUpdate(
        {
          update_id: 1,
          message: {
            message_id: 1,
            from: { id: 9, is_bot: false, first_name: 'Jan' },
            chat: { id: 9, type: 'private' },
            date: 0,
            text: '/start viacommando',
          },
        },
        vereniging.id,
      );

      expect(axiosMock.post.mock.calls[0][1].text).toContain('succesvol gekoppeld');
    });

    it('bevestigt een knopdruk bij Telegram', async () => {
      zetTelegramAan(vereniging, TOKEN);
      axiosMock.post.mockResolvedValue({ data: { ok: true } });
      const dienst = await laadDienst();

      await dienst.processUpdate(
        { update_id: 1, callback_query: { id: 'cb1', from: { id: 9, first_name: 'Jan' } } },
        vereniging.id,
      );

      expect(axiosMock.post.mock.calls[0][0]).toContain('/answerCallbackQuery');
      expect(axiosMock.post.mock.calls[0][1]).toEqual({ callback_query_id: 'cb1' });
    });
  });

  // ------------------------------------------------------------------
  // 7. Het webhookgeheim
  // ------------------------------------------------------------------
  describe('webhookgeheim', () => {
    it('herkent het juiste geheim', async () => {
      const dienst = await laadDienst({ TELEGRAM_WEBHOOK_SECRET: 'klopt-wel' });

      expect(dienst.webhookGeheimKlopt('klopt-wel')).toBe(true);
    });

    it('wijst een verkeerd geheim af', async () => {
      const dienst = await laadDienst({ TELEGRAM_WEBHOOK_SECRET: 'klopt-wel' });

      expect(dienst.webhookGeheimKlopt('klopt-niet')).toBe(false);
      expect(dienst.webhookGeheimKlopt('')).toBe(false);
      expect(dienst.webhookGeheimKlopt(undefined)).toBe(false);
    });

    /**
     * Zonder ingesteld geheim staat de webhook voor iedereen open, en /stop
     * werkt zonder inloggen op het chat-id uit de body. Dan is dichtgaan de
     * enige veilige keus.
     */
    it('wijst alles af als er geen geheim is ingesteld', async () => {
      const dienst = await laadDienst();

      expect(dienst.getWebhookSecret()).toBeUndefined();
      expect(dienst.webhookGeheimKlopt('wat dan ook')).toBe(false);
    });

    it('vergelijkt geheimen van verschillende lengte zonder om te vallen', async () => {
      const dienst = await laadDienst({ TELEGRAM_WEBHOOK_SECRET: 'kort' });

      expect(() => dienst.webhookGeheimKlopt('een veel langer geheim')).not.toThrow();
      expect(dienst.webhookGeheimKlopt('een veel langer geheim')).toBe(false);
    });

    it('stelt de webhook in met het geheim erbij', async () => {
      zetTelegramAan(vereniging, TOKEN);
      axiosMock.post.mockResolvedValue({ data: { ok: true } });
      const dienst = await laadDienst({ TELEGRAM_WEBHOOK_SECRET: 'zeer-geheim-woord' });

      expect(await dienst.setWebhook('https://app.example/hook', vereniging.id)).toBe(true);
      expect(axiosMock.post.mock.calls[0][1]).toMatchObject({
        url: 'https://app.example/hook',
        secret_token: 'zeer-geheim-woord',
      });
    });

    it('stelt de webhook niet in zonder geheim', async () => {
      zetTelegramAan(vereniging, TOKEN);
      const dienst = await laadDienst();

      expect(await dienst.setWebhook('https://app.example/hook', vereniging.id)).toBe(false);
      expect(axiosMock.post).not.toHaveBeenCalled();
    });

    it('stelt de webhook niet in zonder bot', async () => {
      const dienst = await laadDienst({ TELEGRAM_WEBHOOK_SECRET: 'zeer-geheim-woord' });

      expect(await dienst.setWebhook('https://app.example/hook', vereniging.id)).toBe(false);
      expect(axiosMock.post).not.toHaveBeenCalled();
    });
  });
});
