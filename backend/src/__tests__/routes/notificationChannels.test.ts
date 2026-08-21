/**
 * Meldkanalen: voorkeuren per kanaal, het koppelen van Telegram en WhatsApp,
 * en de twee webhooks waar die diensten op terugbellen.
 *
 * 541 regels zonder test. Het gaat hier om de weg waarlangs een vereniging
 * haar leden bereikt, dus de nadruk ligt op drie vragen:
 *
 * 1. Blijft alles binnen de eigen gebruiker? Elke query filtert op user_id;
 *    er is geen id uit de body of het pad dat daar omheen kan. Een lid van
 *    een andere vereniging mag niets zien of ontkoppelen.
 * 2. Komen er geheimen terug in een antwoord? Het telefoonnummer wordt
 *    gemaskeerd, de verificatiecode hoort helemaal niet in het antwoord, en
 *    het chat-id van Telegram evenmin.
 * 3. Wie mag de webhooks aanspreken? De Telegram-webhook staat open op het
 *    internet en kan een koppeling verbreken; die hoort alleen door te laten
 *    wat het gedeelde geheim meestuurt.
 *
 * Twee echte fouten kwamen hierbij boven water: de vervaltijd van de
 * WhatsApp-verificatiecode (zie 'weigert een code die vandaag al verlopen
 * is') en een lijst met kanalen die geen lijst is (zie 'weigert kanalen die
 * geen lijst zijn').
 *
 * De diensten zelf (Telegram, WhatsApp) zijn gemockt: die praten met een
 * externe partij en dat hoort een test niet te doen.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import notificationChannelRoutes from '../../routes/notificationChannels';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestEnvironment, createTestAssociation, createTestUser, TestUser } from '../testUtils';
import {
  isTelegramConfigured,
  generateLinkUrl,
  getWebhookSecret,
  webhookGeheimKlopt,
  processUpdate,
} from '../../services/telegram';
import {
  isWhatsAppConfigured,
  generateVerificationCode,
  sendVerificationCode,
  verifyWebhook,
  parseWebhookPayload,
} from '../../services/whatsapp';

vi.mock('../../services/telegram', async (importOriginal) => {
  const echt = await importOriginal<typeof import('../../services/telegram')>();
  return {
    ...echt,
    isTelegramConfigured: vi.fn(),
    generateLinkUrl: vi.fn(),
    getWebhookSecret: vi.fn(),
    webhookGeheimKlopt: vi.fn(),
    processUpdate: vi.fn(),
  };
});

vi.mock('../../services/whatsapp', async (importOriginal) => {
  const echt = await importOriginal<typeof import('../../services/whatsapp')>();
  return {
    ...echt,
    isWhatsAppConfigured: vi.fn(),
    generateVerificationCode: vi.fn(),
    sendVerificationCode: vi.fn(),
    verifyWebhook: vi.fn(),
    parseWebhookPayload: vi.fn(),
  };
});

const app = express();
app.use(express.json());
app.use('/api/notification-channels', notificationChannelRoutes);
app.use(errorHandler);

describe('meldkanalen', () => {
  let lid: TestUser;
  let lidToken: string;
  let anderLid: TestUser;
  let anderLidToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    anderLid = omgeving.musicCommitteeUser;
    anderLidToken = omgeving.musicCommitteeToken;

    // Zonder dit houden de mocks de aanroepen uit de vorige test vast en zegt
    // 'is niet aangeroepen' niets meer.
    vi.clearAllMocks();
    vi.mocked(isTelegramConfigured).mockReturnValue(false);
    vi.mocked(isWhatsAppConfigured).mockReturnValue(false);
    vi.mocked(generateLinkUrl).mockResolvedValue(null);
    vi.mocked(getWebhookSecret).mockReturnValue(undefined);
    vi.mocked(webhookGeheimKlopt).mockReturnValue(false);
    vi.mocked(processUpdate).mockResolvedValue(undefined);
    vi.mocked(generateVerificationCode).mockReturnValue('123456');
    vi.mocked(sendVerificationCode).mockResolvedValue(true);
    vi.mocked(verifyWebhook).mockReturnValue(null);
    vi.mocked(parseWebhookPayload).mockReturnValue(null);
  });

  type Methode = 'get' | 'post' | 'put' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/notification-channels${pad}`).set('Authorization', `Bearer ${token}`);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);
  const zonderToken = (methode: Methode, pad: string) => request(app)[methode](`/api/notification-channels${pad}`);

  function koppelKanaal(userId: string, type: 'whatsapp' | 'telegram', kanaalId: string, geverifieerd = true): void {
    db.prepare(
      `INSERT INTO user_notification_channels (id, user_id, channel_type, channel_id, verified)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(uuidv4(), userId, type, kanaalId, geverifieerd ? 1 : 0);
  }

  function gekoppeldKanaal(userId: string, type: 'whatsapp' | 'telegram') {
    return db
      .prepare('SELECT channel_id, verified FROM user_notification_channels WHERE user_id = ? AND channel_type = ?')
      .get(userId, type) as { channel_id: string; verified: number } | undefined;
  }

  function verificatieVan(userId: string) {
    return db.prepare('SELECT * FROM whatsapp_verifications WHERE user_id = ?').get(userId) as
      { id: string; phone_number: string; code: string; expires_at: string } | undefined;
  }

  /**
   * Een tijdstip dat vandaag al voorbij is, in de datum die SQLite zelf
   * hanteert. Bewust niet 'nu min tien minuten': rond middernacht UTC valt
   * dat op de vorige dag, en juist de gelijke datum legt de fout bloot.
   */
  function vandaagAlVerlopen(): string {
    const nu = db.prepare("SELECT datetime('now') AS nu").get() as { nu: string };
    return `${nu.nu.slice(0, 10)}T00:00:00.000Z`;
  }

  describe('GET /channels', () => {
    it('geeft de vier kanalen met hun status', async () => {
      vi.mocked(isWhatsAppConfigured).mockReturnValue(true);

      const antwoord = await alsLid('get', '/channels');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.map((k: { channel: string }) => k.channel)).toEqual([
        'email',
        'push',
        'whatsapp',
        'telegram',
      ]);
      expect(antwoord.body.find((k: { channel: string }) => k.channel === 'whatsapp').configured).toBe(true);
      expect(antwoord.body.find((k: { channel: string }) => k.channel === 'telegram').configured).toBe(false);
    });

    it('geeft alleen of een kanaal aanstaat, geen sleutels of tokens', async () => {
      // 'configured' is een ja/nee. De bijbehorende bottoken en
      // toegangssleutel horen nooit over de lijn te gaan.
      vi.mocked(isTelegramConfigured).mockReturnValue(true);

      const antwoord = await alsLid('get', '/channels');

      for (const kanaal of antwoord.body) {
        expect(Object.keys(kanaal).sort()).toEqual(['channel', 'configured', 'name']);
        expect(typeof kanaal.configured).toBe('boolean');
      }
    });

    it('weigert een verzoek zonder token', async () => {
      const antwoord = await zonderToken('get', '/channels');
      expect(antwoord.status).toBe(401);
    });
  });

  describe('GET /preferences', () => {
    it('maakt standaardvoorkeuren aan voor een lid dat er nog geen heeft', async () => {
      const antwoord = await alsLid('get', '/preferences');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.userId).toBe(lid.id);
      expect(antwoord.body.channels.email.address).toBe(lid.email);
      expect(antwoord.body.notificationTypes.new_music.enabled).toBe(true);
    });

    it('geeft het eigen gekoppelde nummer, niet dat van een ander lid', async () => {
      koppelKanaal(anderLid.id, 'whatsapp', '+31600000001');
      koppelKanaal(lid.id, 'whatsapp', '+31600000002');

      const antwoord = await alsLid('get', '/preferences');

      expect(antwoord.body.channels.whatsapp.phoneNumber).toBe('+31600000002');
      expect(JSON.stringify(antwoord.body)).not.toContain('+31600000001');
    });

    it('geeft niets van een lid van een andere vereniging', async () => {
      const andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
      const vreemdeling = createTestUser(andereVereniging.id, { email: 'lid@andere-vereniging.test', role: 'admin' });
      koppelKanaal(vreemdeling.id, 'telegram', '999888777');

      const antwoord = await alsLid('get', '/preferences');

      expect(antwoord.body.channels.telegram.verified).toBe(false);
      expect(JSON.stringify(antwoord.body)).not.toContain('999888777');
    });

    it('weigert een verzoek zonder token', async () => {
      const antwoord = await zonderToken('get', '/preferences');
      expect(antwoord.status).toBe(401);
    });
  });

  describe('PUT /preferences', () => {
    it('werkt de eigen voorkeuren bij', async () => {
      const antwoord = await alsLid('put', '/preferences').send({ newMusic: false, emailEnabled: false });

      expect(antwoord.status).toBe(200);
      const opgeslagen = await alsLid('get', '/preferences');
      expect(opgeslagen.body.notificationTypes.new_music.enabled).toBe(false);
      expect(opgeslagen.body.channels.email.enabled).toBe(false);
    });

    it('laat velden die de aanvraag niet noemt ongemoeid', async () => {
      await alsLid('put', '/preferences').send({ newMusic: false });
      await alsLid('put', '/preferences').send({ chatMessages: false });

      const opgeslagen = await alsLid('get', '/preferences');
      expect(opgeslagen.body.notificationTypes.new_music.enabled).toBe(false);
      expect(opgeslagen.body.notificationTypes.chat_message.enabled).toBe(false);
      expect(opgeslagen.body.notificationTypes.rehearsal_change.enabled).toBe(true);
    });

    it('wijzigt niets bij een ander lid, ook niet als de body zijn id noemt', async () => {
      // De route leest de gebruiker uit het token en negeert alles wat de
      // body over een id zegt. Dit is de fout die elders in dit project
      // herhaaldelijk opdook: een id uit de body dat ongecontroleerd in de
      // UPDATE belandt.
      await als(anderLidToken, 'get', '/preferences');

      const antwoord = await alsLid('put', '/preferences').send({
        userId: anderLid.id,
        user_id: anderLid.id,
        id: anderLid.id,
        newMusic: false,
      });

      expect(antwoord.status).toBe(200);
      const vanDeAnder = await als(anderLidToken, 'get', '/preferences');
      expect(vanDeAnder.body.notificationTypes.new_music.enabled).toBe(true);
      expect(vanDeAnder.body.userId).toBe(anderLid.id);
    });

    it('weigert een verzoek zonder token', async () => {
      const antwoord = await zonderToken('put', '/preferences').send({ newMusic: false });
      expect(antwoord.status).toBe(401);
    });
  });

  describe('PUT /preferences/type/:type', () => {
    it('slaat de gekozen kanalen op voor dat soort melding', async () => {
      const antwoord = await alsLid('put', '/preferences/type/new_music').send({ channels: ['email', 'telegram'] });

      expect(antwoord.status).toBe(200);
      const rij = db
        .prepare('SELECT channels FROM notification_type_channels WHERE user_id = ? AND notification_type = ?')
        .get(lid.id, 'new_music') as { channels: string };
      expect(JSON.parse(rij.channels)).toEqual(['email', 'telegram']);
    });

    it('gooit onbekende kanalen weg', async () => {
      await alsLid('put', '/preferences/type/new_music').send({ channels: ['email', 'duif', 'sms', 'telegram'] });

      const rij = db
        .prepare('SELECT channels FROM notification_type_channels WHERE user_id = ? AND notification_type = ?')
        .get(lid.id, 'new_music') as { channels: string };
      expect(JSON.parse(rij.channels)).toEqual(['email', 'telegram']);
    });

    it('weigert een onbekend soort melding', async () => {
      const antwoord = await alsLid('put', '/preferences/type/verjaardagen').send({ channels: ['email'] });

      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toMatch(/notificatie type/i);
    });

    it('weigert kanalen die geen lijst zijn', async () => {
      // Zonder controle liep `channels.filter(...)` stuk op een TypeError en
      // kwam er een 500 terug. Een verkeerd ingevulde aanvraag is een fout
      // van de client, geen serverfout - en een 500 zet bovendien een
      // stacktrace in de logs.
      const antwoord = await alsLid('put', '/preferences/type/new_music').send({ channels: 'email' });

      expect(antwoord.status).toBe(400);
    });

    it('weigert een aanvraag zonder kanalen', async () => {
      const antwoord = await alsLid('put', '/preferences/type/new_music').send({});

      expect(antwoord.status).toBe(400);
    });

    it('raakt de voorkeuren van een ander lid niet', async () => {
      await als(anderLidToken, 'put', '/preferences/type/new_music').send({ channels: ['email'] });
      await alsLid('put', '/preferences/type/new_music').send({ channels: ['telegram'] });

      const rij = db
        .prepare('SELECT channels FROM notification_type_channels WHERE user_id = ? AND notification_type = ?')
        .get(anderLid.id, 'new_music') as { channels: string };
      expect(JSON.parse(rij.channels)).toEqual(['email']);
    });

    it('weigert een verzoek zonder token', async () => {
      const antwoord = await zonderToken('put', '/preferences/type/new_music').send({ channels: ['email'] });
      expect(antwoord.status).toBe(401);
    });
  });

  describe('POST /telegram/link', () => {
    it('meldt 503 als Telegram niet is ingesteld', async () => {
      vi.mocked(isTelegramConfigured).mockReturnValue(false);

      const antwoord = await alsLid('post', '/telegram/link');

      expect(antwoord.status).toBe(503);
      expect(generateLinkUrl).not.toHaveBeenCalled();
    });

    it('geeft een koppelcode voor de ingelogde gebruiker', async () => {
      vi.mocked(isTelegramConfigured).mockReturnValue(true);
      vi.mocked(generateLinkUrl).mockResolvedValue({ code: 'abc123', url: 'https://t.me/bot?start=abc123' });

      const antwoord = await alsLid('post', '/telegram/link');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual({ code: 'abc123', url: 'https://t.me/bot?start=abc123', expiresIn: 600 });
      // De code wordt voor de gebruiker uit het token gemaakt, niet voor een
      // gebruiker die de aanvrager zelf aanwijst.
      expect(vi.mocked(generateLinkUrl).mock.calls[0][0]).toBe(lid.id);
    });

    it('meldt 500 als er geen link gemaakt kon worden', async () => {
      vi.mocked(isTelegramConfigured).mockReturnValue(true);
      vi.mocked(generateLinkUrl).mockResolvedValue(null);

      const antwoord = await alsLid('post', '/telegram/link');

      expect(antwoord.status).toBe(500);
    });

    it('weigert een verzoek zonder token', async () => {
      vi.mocked(isTelegramConfigured).mockReturnValue(true);
      const antwoord = await zonderToken('post', '/telegram/link');
      expect(antwoord.status).toBe(401);
      expect(generateLinkUrl).not.toHaveBeenCalled();
    });
  });

  describe('GET /telegram/status', () => {
    it('meldt niet-gekoppeld als er niets staat', async () => {
      const antwoord = await alsLid('get', '/telegram/status');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual({ linked: false, verified: false, linkedAt: null });
    });

    it('meldt gekoppeld en geeft het chat-id niet terug', async () => {
      // Het chat-id is het adres waarop een lid bereikbaar is. Het staat wel
      // in de SELECT maar hoort het antwoord niet uit.
      koppelKanaal(lid.id, 'telegram', '123456789');

      const antwoord = await alsLid('get', '/telegram/status');

      expect(antwoord.body.linked).toBe(true);
      expect(antwoord.body.verified).toBe(true);
      expect(JSON.stringify(antwoord.body)).not.toContain('123456789');
    });

    it('kijkt niet naar de koppeling van een ander lid', async () => {
      koppelKanaal(anderLid.id, 'telegram', '123456789');

      const antwoord = await alsLid('get', '/telegram/status');

      expect(antwoord.body.linked).toBe(false);
    });

    it('weigert een verzoek zonder token', async () => {
      const antwoord = await zonderToken('get', '/telegram/status');
      expect(antwoord.status).toBe(401);
    });
  });

  describe('DELETE /telegram/unlink', () => {
    it('ontkoppelt de eigen koppeling', async () => {
      koppelKanaal(lid.id, 'telegram', '123456789');

      const antwoord = await alsLid('delete', '/telegram/unlink');

      expect(antwoord.status).toBe(200);
      expect(gekoppeldKanaal(lid.id, 'telegram')).toBeUndefined();
    });

    it('laat de koppeling van een ander lid staan', async () => {
      koppelKanaal(lid.id, 'telegram', '111');
      koppelKanaal(anderLid.id, 'telegram', '222');

      await alsLid('delete', '/telegram/unlink');

      expect(gekoppeldKanaal(anderLid.id, 'telegram')?.channel_id).toBe('222');
    });

    it('laat het WhatsApp-nummer van dezelfde gebruiker staan', async () => {
      koppelKanaal(lid.id, 'telegram', '111');
      koppelKanaal(lid.id, 'whatsapp', '+31600000000');

      await alsLid('delete', '/telegram/unlink');

      expect(gekoppeldKanaal(lid.id, 'whatsapp')?.channel_id).toBe('+31600000000');
    });

    it('weigert een verzoek zonder token', async () => {
      koppelKanaal(lid.id, 'telegram', '111');
      const antwoord = await zonderToken('delete', '/telegram/unlink');
      expect(antwoord.status).toBe(401);
      expect(gekoppeldKanaal(lid.id, 'telegram')).toBeDefined();
    });
  });

  describe('POST /telegram/webhook', () => {
    const bericht = { update_id: 1, message: { chat: { id: 42 }, text: '/stop' } };

    it('weigert alles zolang er geen gedeeld geheim is ingesteld', async () => {
      vi.mocked(getWebhookSecret).mockReturnValue(undefined);

      const antwoord = await request(app).post('/api/notification-channels/telegram/webhook').send(bericht);

      expect(antwoord.status).toBe(503);
      expect(processUpdate).not.toHaveBeenCalled();
    });

    it('weigert een verzoek zonder het geheim', async () => {
      // Deze route staat open op het internet en /stop verbreekt een
      // koppeling op het chat-id uit de body. Zonder deze controle kon
      // iedereen die de url kende leden van hun meldingen afsnijden.
      vi.mocked(getWebhookSecret).mockReturnValue('het-geheim');
      vi.mocked(webhookGeheimKlopt).mockReturnValue(false);

      const antwoord = await request(app).post('/api/notification-channels/telegram/webhook').send(bericht);

      expect(antwoord.status).toBe(401);
      expect(processUpdate).not.toHaveBeenCalled();
    });

    it('verwerkt een verzoek met het juiste geheim', async () => {
      vi.mocked(getWebhookSecret).mockReturnValue('het-geheim');
      vi.mocked(webhookGeheimKlopt).mockImplementation((aangeleverd) => aangeleverd === 'het-geheim');

      const antwoord = await request(app)
        .post('/api/notification-channels/telegram/webhook')
        .set('x-telegram-bot-api-secret-token', 'het-geheim')
        .send(bericht);

      expect(antwoord.status).toBe(200);
      expect(processUpdate).toHaveBeenCalledWith(bericht);
    });

    it('geeft de header die is meegestuurd door aan de controle', async () => {
      vi.mocked(getWebhookSecret).mockReturnValue('het-geheim');
      vi.mocked(webhookGeheimKlopt).mockReturnValue(true);

      await request(app)
        .post('/api/notification-channels/telegram/webhook')
        .set('x-telegram-bot-api-secret-token', 'iets-anders')
        .send(bericht);

      expect(webhookGeheimKlopt).toHaveBeenCalledWith('iets-anders');
    });

    it('antwoordt ook 200 als het verwerken later stukloopt', async () => {
      // Telegram herhaalt een update die geen 200 krijgt. De verwerking
      // gebeurt daarom losgekoppeld van het antwoord.
      vi.mocked(getWebhookSecret).mockReturnValue('het-geheim');
      vi.mocked(webhookGeheimKlopt).mockReturnValue(true);
      vi.mocked(processUpdate).mockRejectedValue(new Error('bot onbereikbaar'));

      const antwoord = await request(app)
        .post('/api/notification-channels/telegram/webhook')
        .set('x-telegram-bot-api-secret-token', 'het-geheim')
        .send(bericht);

      expect(antwoord.status).toBe(200);
    });
  });

  describe('POST /whatsapp/link', () => {
    beforeEach(() => {
      vi.mocked(isWhatsAppConfigured).mockReturnValue(true);
    });

    it('meldt 503 als WhatsApp niet is ingesteld', async () => {
      vi.mocked(isWhatsAppConfigured).mockReturnValue(false);

      const antwoord = await alsLid('post', '/whatsapp/link').send({ phoneNumber: '+31612345678' });

      expect(antwoord.status).toBe(503);
      expect(sendVerificationCode).not.toHaveBeenCalled();
    });

    it('weigert een aanvraag zonder telefoonnummer', async () => {
      const antwoord = await alsLid('post', '/whatsapp/link').send({});
      expect(antwoord.status).toBe(400);
    });

    it('weigert een te kort nummer', async () => {
      const antwoord = await alsLid('post', '/whatsapp/link').send({ phoneNumber: '06-1234' });

      expect(antwoord.status).toBe(400);
      expect(verificatieVan(lid.id)).toBeUndefined();
    });

    it('normaliseert het nummer en bewaart de code bij de ingelogde gebruiker', async () => {
      const antwoord = await alsLid('post', '/whatsapp/link').send({ phoneNumber: '+31 6 1234 5678' });

      expect(antwoord.status).toBe(200);
      const verificatie = verificatieVan(lid.id);
      expect(verificatie?.phone_number).toBe('+31612345678');
      expect(verificatie?.code).toBe('123456');
      expect(sendVerificationCode).toHaveBeenCalledWith('+31612345678', '123456');
    });

    it('geeft de verificatiecode niet terug in het antwoord', async () => {
      // De code is het enige bewijs dat iemand bij het nummer kan. Wie hem
      // uit het antwoord kan lezen hoeft de telefoon niet te hebben.
      const antwoord = await alsLid('post', '/whatsapp/link').send({ phoneNumber: '+31612345678' });

      expect(JSON.stringify(antwoord.body)).not.toContain('123456');
    });

    it('maskeert de laatste vier cijfers van het nummer', async () => {
      const antwoord = await alsLid('post', '/whatsapp/link').send({ phoneNumber: '+31612345678' });

      expect(antwoord.body.phoneNumber).toBe('+3161234****');
      expect(antwoord.body.phoneNumber).not.toContain('5678');
    });

    it('vervangt een eerdere aanvraag in plaats van er een tweede naast te zetten', async () => {
      await alsLid('post', '/whatsapp/link').send({ phoneNumber: '+31612345678' });
      vi.mocked(generateVerificationCode).mockReturnValue('654321');
      await alsLid('post', '/whatsapp/link').send({ phoneNumber: '+31698765432' });

      const rijen = db.prepare('SELECT * FROM whatsapp_verifications WHERE user_id = ?').all(lid.id);
      expect(rijen).toHaveLength(1);
      expect(verificatieVan(lid.id)?.code).toBe('654321');
      expect(verificatieVan(lid.id)?.phone_number).toBe('+31698765432');
    });

    it('raakt de aanvraag van een ander lid niet', async () => {
      await als(anderLidToken, 'post', '/whatsapp/link').send({ phoneNumber: '+31600000001' });
      vi.mocked(generateVerificationCode).mockReturnValue('654321');
      await alsLid('post', '/whatsapp/link').send({ phoneNumber: '+31600000002' });

      expect(verificatieVan(anderLid.id)?.code).toBe('123456');
      expect(verificatieVan(anderLid.id)?.phone_number).toBe('+31600000001');
    });

    it('meldt 500 als het bericht niet verstuurd kon worden', async () => {
      vi.mocked(sendVerificationCode).mockResolvedValue(false);

      const antwoord = await alsLid('post', '/whatsapp/link').send({ phoneNumber: '+31612345678' });

      expect(antwoord.status).toBe(500);
    });

    it('weigert een verzoek zonder token', async () => {
      const antwoord = await zonderToken('post', '/whatsapp/link').send({ phoneNumber: '+31612345678' });
      expect(antwoord.status).toBe(401);
      expect(sendVerificationCode).not.toHaveBeenCalled();
    });
  });

  describe('POST /whatsapp/verify', () => {
    function zetVerificatie(userId: string, code: string, expiresAt?: string): void {
      db.prepare(
        `INSERT INTO whatsapp_verifications (id, user_id, phone_number, code, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(uuidv4(), userId, '+31612345678', code, expiresAt ?? new Date(Date.now() + 10 * 60 * 1000).toISOString());
    }

    it('weigert een aanvraag zonder code', async () => {
      const antwoord = await alsLid('post', '/whatsapp/verify').send({});
      expect(antwoord.status).toBe(400);
    });

    it('weigert een verkeerde code', async () => {
      zetVerificatie(lid.id, '123456');

      const antwoord = await alsLid('post', '/whatsapp/verify').send({ code: '000000' });

      expect(antwoord.status).toBe(400);
      expect(gekoppeldKanaal(lid.id, 'whatsapp')).toBeUndefined();
    });

    it('weigert de code van een ander lid', async () => {
      // De code hoort bij de gebruiker die hem heeft aangevraagd. Zonder de
      // user_id-controle zou een lid het nummer van een ander kunnen
      // overnemen zodra hij diens code kent.
      zetVerificatie(anderLid.id, '123456');

      const antwoord = await alsLid('post', '/whatsapp/verify').send({ code: '123456' });

      expect(antwoord.status).toBe(400);
      expect(gekoppeldKanaal(lid.id, 'whatsapp')).toBeUndefined();
      expect(verificatieVan(anderLid.id)).toBeDefined();
    });

    it('weigert een code die vandaag al verlopen is', async () => {
      // expires_at wordt als ISO-tekst weggeschreven
      // ('2026-08-21T09:00:00.000Z') en vergeleken met datetime('now')
      // ('2026-08-21 19:00:00'). Bij een tekstvergelijking wint de 'T' van de
      // spatie, dus een code bleef de rest van de dag geldig in plaats van
      // tien minuten. Dat is bij een code van zes cijfers een wezenlijk
      // verschil: uren in plaats van minuten om te raden.
      zetVerificatie(lid.id, '123456', vandaagAlVerlopen());

      const antwoord = await alsLid('post', '/whatsapp/verify').send({ code: '123456' });

      expect(antwoord.status).toBe(400);
      expect(gekoppeldKanaal(lid.id, 'whatsapp')).toBeUndefined();
    });

    it('koppelt het nummer bij een geldige code', async () => {
      zetVerificatie(lid.id, '123456');

      const antwoord = await alsLid('post', '/whatsapp/verify').send({ code: '123456' });

      expect(antwoord.status).toBe(200);
      const kanaal = gekoppeldKanaal(lid.id, 'whatsapp');
      expect(kanaal?.channel_id).toBe('+31612345678');
      expect(kanaal?.verified).toBe(1);
    });

    it('zet het WhatsApp-kanaal aan in de voorkeuren', async () => {
      zetVerificatie(lid.id, '123456');

      await alsLid('post', '/whatsapp/verify').send({ code: '123456' });

      const voorkeur = db
        .prepare("SELECT enabled FROM notification_channel_preferences WHERE user_id = ? AND channel = 'whatsapp'")
        .get(lid.id) as { enabled: number } | undefined;
      expect(voorkeur?.enabled).toBe(1);
    });

    it('ruimt de gebruikte code op', async () => {
      zetVerificatie(lid.id, '123456');

      await alsLid('post', '/whatsapp/verify').send({ code: '123456' });

      expect(verificatieVan(lid.id)).toBeUndefined();
    });

    it('laat dezelfde code geen tweede keer gebruiken', async () => {
      zetVerificatie(lid.id, '123456');
      await alsLid('post', '/whatsapp/verify').send({ code: '123456' });

      const tweede = await alsLid('post', '/whatsapp/verify').send({ code: '123456' });

      expect(tweede.status).toBe(400);
    });

    it('vervangt een eerder gekoppeld nummer', async () => {
      koppelKanaal(lid.id, 'whatsapp', '+31600000000');
      zetVerificatie(lid.id, '123456');

      await alsLid('post', '/whatsapp/verify').send({ code: '123456' });

      const rijen = db
        .prepare("SELECT channel_id FROM user_notification_channels WHERE user_id = ? AND channel_type = 'whatsapp'")
        .all(lid.id) as { channel_id: string }[];
      expect(rijen.map((r) => r.channel_id)).toEqual(['+31612345678']);
    });

    it('weigert een verzoek zonder token', async () => {
      zetVerificatie(lid.id, '123456');
      const antwoord = await zonderToken('post', '/whatsapp/verify').send({ code: '123456' });
      expect(antwoord.status).toBe(401);
      expect(gekoppeldKanaal(lid.id, 'whatsapp')).toBeUndefined();
    });
  });

  describe('GET /whatsapp/status', () => {
    it('meldt niet-gekoppeld als er niets staat', async () => {
      const antwoord = await alsLid('get', '/whatsapp/status');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual({ linked: false, verified: false, phoneNumber: null, linkedAt: null });
    });

    it('geeft het nummer alleen gemaskeerd terug', async () => {
      koppelKanaal(lid.id, 'whatsapp', '+31612345678');

      const antwoord = await alsLid('get', '/whatsapp/status');

      expect(antwoord.body.phoneNumber).toBe('+3161234****');
      expect(JSON.stringify(antwoord.body)).not.toContain('5678');
    });

    it('kijkt niet naar het nummer van een ander lid', async () => {
      koppelKanaal(anderLid.id, 'whatsapp', '+31612345678');

      const antwoord = await alsLid('get', '/whatsapp/status');

      expect(antwoord.body.linked).toBe(false);
      expect(antwoord.body.phoneNumber).toBeNull();
    });

    it('weigert een verzoek zonder token', async () => {
      const antwoord = await zonderToken('get', '/whatsapp/status');
      expect(antwoord.status).toBe(401);
    });
  });

  describe('DELETE /whatsapp/unlink', () => {
    it('ontkoppelt het eigen nummer', async () => {
      koppelKanaal(lid.id, 'whatsapp', '+31612345678');

      const antwoord = await alsLid('delete', '/whatsapp/unlink');

      expect(antwoord.status).toBe(200);
      expect(gekoppeldKanaal(lid.id, 'whatsapp')).toBeUndefined();
    });

    it('laat het nummer van een ander lid staan', async () => {
      koppelKanaal(lid.id, 'whatsapp', '+31600000001');
      koppelKanaal(anderLid.id, 'whatsapp', '+31600000002');

      await alsLid('delete', '/whatsapp/unlink');

      expect(gekoppeldKanaal(anderLid.id, 'whatsapp')?.channel_id).toBe('+31600000002');
    });

    it('weigert een verzoek zonder token', async () => {
      koppelKanaal(lid.id, 'whatsapp', '+31612345678');
      const antwoord = await zonderToken('delete', '/whatsapp/unlink');
      expect(antwoord.status).toBe(401);
      expect(gekoppeldKanaal(lid.id, 'whatsapp')).toBeDefined();
    });
  });

  describe('GET /whatsapp/webhook (verificatie door Meta)', () => {
    beforeEach(() => {
      vi.mocked(verifyWebhook).mockImplementation((mode, token, challenge) =>
        mode === 'subscribe' && token === 'juiste-token' ? challenge : null,
      );
    });

    it('weigert een verkeerd verificatietoken', async () => {
      const antwoord = await request(app)
        .get('/api/notification-channels/whatsapp/webhook')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'fout', 'hub.challenge': '1234' });

      expect(antwoord.status).toBe(403);
    });

    it('echoot de challenge terug als platte tekst', async () => {
      const antwoord = await request(app)
        .get('/api/notification-channels/whatsapp/webhook')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'juiste-token', 'hub.challenge': '1158201444' });

      expect(antwoord.status).toBe(200);
      expect(antwoord.text).toBe('1158201444');
      expect(antwoord.headers['content-type']).toMatch(/text\/plain/);
    });

    it('weigert een challenge die geen getal is', async () => {
      // De challenge komt uit de queryparameters en gaat er onveranderd weer
      // uit. Alleen cijfers doorlaten voorkomt dat iemand hier zijn eigen
      // html of script doorheen praat.
      const antwoord = await request(app).get('/api/notification-channels/whatsapp/webhook').query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'juiste-token',
        'hub.challenge': '<script>alert(1)</script>',
      });

      expect(antwoord.status).toBe(400);
      expect(antwoord.text).not.toContain('script');
    });

    it('weigert een challenge die te lang is', async () => {
      const antwoord = await request(app)
        .get('/api/notification-channels/whatsapp/webhook')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'juiste-token', 'hub.challenge': '1'.repeat(33) });

      expect(antwoord.status).toBe(400);
    });
  });

  describe('POST /whatsapp/webhook (afleverstatus)', () => {
    it('antwoordt 200 op een statusbericht', async () => {
      vi.mocked(parseWebhookPayload).mockReturnValue({
        messageId: 'wamid.1',
        status: 'delivered',
        timestamp: '123',
      });

      const antwoord = await request(app).post('/api/notification-channels/whatsapp/webhook').send({ entry: [] });

      expect(antwoord.status).toBe(200);
    });

    it('antwoordt ook 200 op een payload die niets bruikbaars bevat', async () => {
      // Meta stopt met versturen als een webhook geen 200 geeft; een
      // onbekende payload mag dus geen fout opleveren.
      const antwoord = await request(app).post('/api/notification-channels/whatsapp/webhook').send({ onzin: true });

      expect(antwoord.status).toBe(200);
    });
  });
});
