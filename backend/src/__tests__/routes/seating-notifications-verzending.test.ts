/**
 * Meldingen rond de podiumopstelling: instellingen bewaren en handmatig
 * versturen.
 *
 * seating-notifications.test.ts legt vast wie er bij deze routes mag. Dit
 * bestand gaat over wat de routes vervolgens doen: welke velden verplicht
 * zijn per soort melding, wat er met het Twilio-token gebeurt bij opslaan, en
 * het verstuurpad van POST /send/:rehearsalId - de voorwaarden waaronder er
 * niets uitgaat, de inhoud van het bericht, en wat er in
 * seating_notification_logs belandt.
 *
 * Alles wat het netwerk op zou gaan (fetch en Twilio) is vervangen door een
 * dubbelganger, net als in de test van de geplande taak; de tests kijken naar
 * wat er verstuurd zou zijn.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import seatingNotificationRoutes from '../../routes/seating-notifications';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestOrchestra,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestOrchestra,
  TestUser,
} from '../testUtils';

const whatsappVersturen = vi.hoisted(() => vi.fn());

vi.mock('twilio', () => ({
  default: vi.fn(() => ({ messages: { create: whatsappVersturen } })),
}));

const app = express();
app.use(express.json());
app.use('/api/seating-notifications', seatingNotificationRoutes);
app.use(errorHandler);

/** De webhook-aanroepen die de route zou doen. */
let webhookAanroepen: ReturnType<typeof vi.fn>;

describe('meldingen rond de opstelling - instellingen en verzending', () => {
  let vereniging: TestAssociation;
  let orkest: TestOrchestra;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lidToken: string;

  let andereVereniging: TestAssociation;
  let anderOrkest: TestOrchestra;
  let andereBeheerderToken: string;

  beforeEach(() => {
    webhookAanroepen = vi.fn(async () => ({ ok: true, status: 200, text: async () => 'ontvangen' }));
    vi.stubGlobal('fetch', webhookAanroepen);
    whatsappVersturen.mockReset();
    whatsappVersturen.mockResolvedValue({ sid: 'SM123' });

    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;
    orkest = createTestOrchestra(vereniging.id, { name: 'Harmonieorkest' });

    andereVereniging = createTestAssociation({ name: 'Fanfare Elders' });
    anderOrkest = createTestOrchestra(andereVereniging.id, { name: 'Fanfare Elders A' });
    const andereBeheerder = createTestUser(andereVereniging.id, { email: 'beheer@elders.nl', role: 'admin' });
    andereBeheerderToken = generateTestToken(andereBeheerder);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const als = (token: string, methode: 'get' | 'put' | 'delete' | 'post', pad: string) =>
    request(app)[methode](`/api/seating-notifications${pad}`).set('Authorization', `Bearer ${token}`);

  interface InstellingOpties {
    type?: 'webhook' | 'whatsapp';
    webhookUrl?: string | null;
    token?: string | null;
    naar?: string | null;
    aan?: boolean;
    bericht?: string | null;
  }

  function zetInstellingen(orchestraId: string, opties: InstellingOpties = {}): string {
    const id = uuidv4();
    testDb
      .prepare(
        `INSERT INTO seating_notification_settings
           (id, orchestra_id, notification_type, webhook_url, twilio_account_sid, twilio_auth_token,
            twilio_whatsapp_from, twilio_whatsapp_to, minutes_before, enabled, message_template)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        orchestraId,
        opties.type ?? 'webhook',
        opties.webhookUrl === undefined ? 'https://webhook.test/opstelling' : opties.webhookUrl,
        'AC-test-sid',
        opties.token === undefined ? 'test-token' : opties.token,
        'whatsapp:+14155238886',
        opties.naar === undefined ? 'whatsapp:+31612345678' : opties.naar,
        15,
        opties.aan === false ? 0 : 1,
        opties.bericht ?? null,
      );
    return id;
  }

  function maakRepetitie(associationId: string, orchestraId: string | null, opties: { locatie?: string } = {}): string {
    const id = uuidv4();
    testDb
      .prepare(
        `INSERT INTO rehearsals (id, association_id, orchestra_id, date, start_time, end_time, location, type)
         VALUES (?, ?, ?, '2026-09-15', '19:30', '21:30', ?, 'regular')`,
      )
      .run(id, associationId, orchestraId, opties.locatie ?? 'De Kruisboog');
    return id;
  }

  function maakStoel(rehearsalId: string, naam: string, rij: number, positie: number, dirigent = false): void {
    testDb
      .prepare(
        `INSERT INTO rehearsal_seating
           (id, rehearsal_id, member_name, instrument_name, row_number, position_in_row, is_conductor)
         VALUES (?, ?, ?, 'Trompet', ?, ?, ?)`,
      )
      .run(uuidv4(), rehearsalId, naam, rij, positie, dirigent ? 1 : 0);
  }

  function logRegels(rehearsalId: string): { status: string; error_message: string | null }[] {
    return testDb
      .prepare('SELECT status, error_message FROM seating_notification_logs WHERE rehearsal_id = ?')
      .all(rehearsalId) as { status: string; error_message: string | null }[];
  }

  /** De payload van de eerste webhook-aanroep. */
  function eersteBericht(): Record<string, any> {
    return JSON.parse(webhookAanroepen.mock.calls[0][1].body);
  }

  // =====================================================
  // Instellingen opvragen
  // =====================================================

  describe('instellingen opvragen', () => {
    it('geeft null terug als er nog niets is ingesteld', async () => {
      const antwoord = await als(beheerderToken, 'get', `/settings/${orkest.id}`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toBeNull();
    });

    it('geeft 404 voor een onbekend orkest', async () => {
      expect((await als(beheerderToken, 'get', `/settings/${uuidv4()}`)).status).toBe(404);
    });

    it('geeft enabled en include_image als boolean terug', async () => {
      zetInstellingen(orkest.id);

      const antwoord = await als(beheerderToken, 'get', `/settings/${orkest.id}`);

      expect(antwoord.body.enabled).toBe(true);
      expect(antwoord.body.include_image).toBe(true);
    });

    it('geeft null voor het auth-token als dat niet is ingevuld', async () => {
      zetInstellingen(orkest.id, { token: null });

      const antwoord = await als(beheerderToken, 'get', `/settings/${orkest.id}`);

      expect(antwoord.body.twilio_auth_token).toBeNull();
    });
  });

  // =====================================================
  // Instellingen bewaren
  // =====================================================

  describe('instellingen bewaren', () => {
    it('eist een webhook-url bij het webhook-type', async () => {
      const antwoord = await als(beheerderToken, 'put', `/settings/${orkest.id}`).send({
        notification_type: 'webhook',
      });

      expect(antwoord.status).toBe(400);
      expect(testDb.prepare('SELECT COUNT(*) as n FROM seating_notification_settings').get()).toEqual({ n: 0 });
    });

    it('gaat uit van webhook als er geen soort is meegegeven', async () => {
      const antwoord = await als(beheerderToken, 'put', `/settings/${orkest.id}`).send({});

      expect(antwoord.status).toBe(400);
    });

    it('eist de Twilio-sid bij WhatsApp', async () => {
      const antwoord = await als(beheerderToken, 'put', `/settings/${orkest.id}`).send({
        notification_type: 'whatsapp',
        twilio_whatsapp_from: 'whatsapp:+14155238886',
        twilio_whatsapp_to: 'whatsapp:+31612345678',
      });

      expect(antwoord.status).toBe(400);
    });

    it('eist het afzendernummer bij WhatsApp', async () => {
      const antwoord = await als(beheerderToken, 'put', `/settings/${orkest.id}`).send({
        notification_type: 'whatsapp',
        twilio_account_sid: 'AC-sid',
        twilio_whatsapp_to: 'whatsapp:+31612345678',
      });

      expect(antwoord.status).toBe(400);
    });

    it('eist een bestemmingsnummer bij WhatsApp', async () => {
      const antwoord = await als(beheerderToken, 'put', `/settings/${orkest.id}`).send({
        notification_type: 'whatsapp',
        twilio_account_sid: 'AC-sid',
        twilio_whatsapp_from: 'whatsapp:+14155238886',
      });

      expect(antwoord.status).toBe(400);
    });

    it('legt een nieuwe instelling vast met de standaardwaarden', async () => {
      const antwoord = await als(beheerderToken, 'put', `/settings/${orkest.id}`).send({
        notification_type: 'webhook',
        webhook_url: 'https://intern.example/hook',
      });

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      const rij = testDb
        .prepare(
          'SELECT minutes_before, enabled, include_image FROM seating_notification_settings WHERE orchestra_id = ?',
        )
        .get(orkest.id);
      expect(rij).toEqual({ minutes_before: 15, enabled: 1, include_image: 1 });
    });

    it('werkt een bestaande instelling bij in plaats van er een tweede naast te zetten', async () => {
      zetInstellingen(orkest.id);

      await als(beheerderToken, 'put', `/settings/${orkest.id}`).send({
        notification_type: 'webhook',
        webhook_url: 'https://nieuw.example/hook',
        minutes_before: 30,
        enabled: false,
      });

      const rijen = testDb
        .prepare(
          'SELECT webhook_url, minutes_before, enabled FROM seating_notification_settings WHERE orchestra_id = ?',
        )
        .all(orkest.id);
      expect(rijen).toEqual([{ webhook_url: 'https://nieuw.example/hook', minutes_before: 30, enabled: 0 }]);
    });

    it('houdt het bestaande auth-token als de gemaskeerde waarde terugkomt', async () => {
      // De GET geeft het token als bolletjes terug. Slaat het scherm dat
      // ongewijzigd weer op, dan mag dat het echte token niet overschrijven.
      zetInstellingen(orkest.id, { type: 'whatsapp', token: 'echt-geheim' });

      await als(beheerderToken, 'put', `/settings/${orkest.id}`).send({
        notification_type: 'whatsapp',
        twilio_account_sid: 'AC-sid',
        twilio_auth_token: '••••••••',
        twilio_whatsapp_from: 'whatsapp:+14155238886',
        twilio_whatsapp_to: 'whatsapp:+31612345678',
      });

      const rij = testDb
        .prepare('SELECT twilio_auth_token FROM seating_notification_settings WHERE orchestra_id = ?')
        .get(orkest.id) as { twilio_auth_token: string };
      expect(rij.twilio_auth_token).toBe('echt-geheim');
    });

    it('vervangt het auth-token wel door een echt nieuwe waarde', async () => {
      zetInstellingen(orkest.id, { type: 'whatsapp', token: 'oud-token' });

      await als(beheerderToken, 'put', `/settings/${orkest.id}`).send({
        notification_type: 'whatsapp',
        twilio_account_sid: 'AC-sid',
        twilio_auth_token: 'nieuw-token',
        twilio_whatsapp_from: 'whatsapp:+14155238886',
        twilio_whatsapp_to: 'whatsapp:+31612345678',
      });

      const rij = testDb
        .prepare('SELECT twilio_auth_token FROM seating_notification_settings WHERE orchestra_id = ?')
        .get(orkest.id) as { twilio_auth_token: string };
      expect(rij.twilio_auth_token).toBe('nieuw-token');
    });

    it('geeft het opgeslagen token nooit onvermomd terug', async () => {
      const antwoord = await als(beheerderToken, 'put', `/settings/${orkest.id}`).send({
        notification_type: 'whatsapp',
        twilio_account_sid: 'AC-sid',
        twilio_auth_token: 'nieuw-token',
        twilio_whatsapp_from: 'whatsapp:+14155238886',
        twilio_whatsapp_to: 'whatsapp:+31612345678',
      });

      expect(antwoord.body.twilio_auth_token).toBe('••••••••');
      expect(JSON.stringify(antwoord.body)).not.toContain('nieuw-token');
    });

    it('verwijdert de instellingen', async () => {
      zetInstellingen(orkest.id);

      const antwoord = await als(beheerderToken, 'delete', `/settings/${orkest.id}`);

      expect(antwoord.status).toBe(200);
      expect(testDb.prepare('SELECT COUNT(*) as n FROM seating_notification_settings').get()).toEqual({ n: 0 });
    });

    it('raakt de instellingen van een andere vereniging niet bij het verwijderen', async () => {
      zetInstellingen(anderOrkest.id);

      const antwoord = await als(beheerderToken, 'delete', `/settings/${anderOrkest.id}`);

      expect(antwoord.status).toBe(404);
      expect(testDb.prepare('SELECT COUNT(*) as n FROM seating_notification_settings').get()).toEqual({ n: 1 });
    });
  });

  // =====================================================
  // Logboek
  // =====================================================

  describe('het logboek', () => {
    it('geeft de regels van deze repetitie, nieuwste eerst', async () => {
      const repetitie = maakRepetitie(vereniging.id, orkest.id);
      testDb
        .prepare(
          `INSERT INTO seating_notification_logs (id, rehearsal_id, orchestra_id, status, sent_at)
           VALUES (?, ?, ?, 'sent', '2026-09-01T10:00:00Z'), (?, ?, ?, 'failed', '2026-09-02T10:00:00Z')`,
        )
        .run(uuidv4(), repetitie, orkest.id, uuidv4(), repetitie, orkest.id);

      const antwoord = await als(beheerderToken, 'get', `/logs/${repetitie}`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.map((r: { status: string }) => r.status)).toEqual(['failed', 'sent']);
    });

    it('geeft een lege lijst als er nog niets verstuurd is', async () => {
      const repetitie = maakRepetitie(vereniging.id, orkest.id);

      expect((await als(beheerderToken, 'get', `/logs/${repetitie}`)).body).toEqual([]);
    });

    it('geeft 404 voor een onbekende repetitie', async () => {
      expect((await als(beheerderToken, 'get', `/logs/${uuidv4()}`)).status).toBe(404);
    });

    it('geeft geen logboek van een repetitie van een andere vereniging', async () => {
      const repetitie = maakRepetitie(andereVereniging.id, anderOrkest.id);
      testDb
        .prepare(
          `INSERT INTO seating_notification_logs (id, rehearsal_id, orchestra_id, status, webhook_response)
           VALUES (?, ?, ?, 'sent', 'antwoord van de buren')`,
        )
        .run(uuidv4(), repetitie, anderOrkest.id);

      const antwoord = await als(beheerderToken, 'get', `/logs/${repetitie}`);

      expect(antwoord.status).toBe(404);
      expect(JSON.stringify(antwoord.body)).not.toContain('antwoord van de buren');
    });

    it('laat de eigen vereniging haar logboek wel zien', async () => {
      const repetitie = maakRepetitie(andereVereniging.id, anderOrkest.id);

      expect((await als(andereBeheerderToken, 'get', `/logs/${repetitie}`)).status).toBe(200);
    });
  });

  // =====================================================
  // Versturen
  // =====================================================

  describe('handmatig versturen', () => {
    /** De gebruikelijke opzet: instellingen, een repetitie en drie stoelen. */
    function klaarVoorVerzending(opties: InstellingOpties = {}): string {
      zetInstellingen(orkest.id, opties);
      const repetitie = maakRepetitie(vereniging.id, orkest.id);
      maakStoel(repetitie, 'Anna', 1, 0);
      maakStoel(repetitie, 'Bram', 1, 1);
      maakStoel(repetitie, 'Dirk', 0, 0, true);
      return repetitie;
    }

    it('stuurt de opstelling naar de webhook en legt vast dat het gelukt is', async () => {
      const repetitie = klaarVoorVerzending();

      const antwoord = await als(beheerderToken, 'post', `/send/${repetitie}`);

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(webhookAanroepen).toHaveBeenCalledTimes(1);
      expect(webhookAanroepen.mock.calls[0][0]).toBe('https://webhook.test/opstelling');
      expect(logRegels(repetitie)).toEqual([{ status: 'sent', error_message: null }]);
    });

    it('zet de rijen en de aantallen in de payload', async () => {
      const repetitie = klaarVoorVerzending();

      await als(beheerderToken, 'post', `/send/${repetitie}`);

      const bericht = eersteBericht();
      expect(bericht.type).toBe('seating_notification');
      expect(bericht.rehearsal.id).toBe(repetitie);
      expect(bericht.rehearsal.location).toBe('De Kruisboog');
      expect(bericht.orchestra.name).toBe('Harmonieorkest');
      expect(bericht.seating.totalMembers).toBe(2);
      expect(bericht.seating.totalConductors).toBe(1);
      expect(bericht.seating.rows.map((r: { row: number; chairs: number }) => [r.row, r.chairs])).toEqual([
        [0, 1],
        [1, 2],
      ]);
    });

    it('noemt de afgemelde leden in het bericht', async () => {
      const repetitie = klaarVoorVerzending();
      testDb
        .prepare(
          "INSERT INTO rehearsal_attendance (id, rehearsal_id, member_name, status) VALUES (?, ?, 'Carla', 'declined')",
        )
        .run(uuidv4(), repetitie);
      testDb
        .prepare(
          "INSERT INTO rehearsal_attendance (id, rehearsal_id, member_name, status) VALUES (?, ?, 'Els', 'accepted')",
        )
        .run(uuidv4(), repetitie);

      await als(beheerderToken, 'post', `/send/${repetitie}`);

      const bericht = eersteBericht();
      expect(bericht.message).toContain('Carla');
      expect(bericht.message).not.toContain('Els');
    });

    it('vult de plaatshouders in een eigen berichttekst', async () => {
      const repetitie = klaarVoorVerzending({
        bericht: '{orchestra} op {date} om {time} in {location}: {total_members} leden, afgemeld: {absent_members}',
      });

      await als(beheerderToken, 'post', `/send/${repetitie}`);

      const bericht = eersteBericht().message as string;
      expect(bericht).toContain('Harmonieorkest');
      expect(bericht).toContain('19:30');
      expect(bericht).toContain('De Kruisboog');
      expect(bericht).toContain('2 leden');
      expect(bericht).toContain('afgemeld: Niemand');
      expect(bericht).not.toContain('{');
    });

    it('legt een mislukte webhook vast met de foutmelding', async () => {
      const repetitie = klaarVoorVerzending();
      webhookAanroepen.mockResolvedValue({ ok: false, status: 503, text: async () => 'dienst niet beschikbaar' });

      const antwoord = await als(beheerderToken, 'post', `/send/${repetitie}`);

      expect(antwoord.status).toBe(500);
      const regels = logRegels(repetitie);
      expect(regels).toHaveLength(1);
      expect(regels[0].status).toBe('failed');
      expect(regels[0].error_message).toContain('503');
    });

    it('legt een onbereikbare webhook vast in plaats van de route te laten klappen', async () => {
      const repetitie = klaarVoorVerzending();
      webhookAanroepen.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

      const antwoord = await als(beheerderToken, 'post', `/send/${repetitie}`);

      expect(antwoord.status).toBe(500);
      expect(logRegels(repetitie)[0].error_message).toContain('ENOTFOUND');
    });

    it('meldt het als er helemaal geen webhook-url staat', async () => {
      const repetitie = klaarVoorVerzending({ webhookUrl: null });

      const antwoord = await als(beheerderToken, 'post', `/send/${repetitie}`);

      expect(antwoord.status).toBe(500);
      expect(webhookAanroepen).not.toHaveBeenCalled();
      expect(logRegels(repetitie)[0].status).toBe('failed');
    });

    it('stuurt via WhatsApp naar elk bestemmingsnummer', async () => {
      const repetitie = klaarVoorVerzending({
        type: 'whatsapp',
        naar: '+31612345678, whatsapp:+31698765432',
      });

      const antwoord = await als(beheerderToken, 'post', `/send/${repetitie}`);

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(whatsappVersturen).toHaveBeenCalledTimes(2);
      expect(whatsappVersturen.mock.calls.map((c) => c[0].to)).toEqual([
        'whatsapp:+31612345678',
        'whatsapp:+31698765432',
      ]);
      expect(webhookAanroepen).not.toHaveBeenCalled();
    });

    it('legt een mislukte WhatsApp-verzending vast', async () => {
      const repetitie = klaarVoorVerzending({ type: 'whatsapp' });
      whatsappVersturen.mockRejectedValue(new Error('nummer niet geregistreerd'));

      const antwoord = await als(beheerderToken, 'post', `/send/${repetitie}`);

      expect(antwoord.status).toBe(500);
      expect(logRegels(repetitie)[0].error_message).toContain('nummer niet geregistreerd');
    });

    it('meldt ontbrekende Twilio-gegevens zonder Twilio aan te roepen', async () => {
      const repetitie = klaarVoorVerzending({ type: 'whatsapp', token: null });

      const antwoord = await als(beheerderToken, 'post', `/send/${repetitie}`);

      expect(antwoord.status).toBe(500);
      expect(whatsappVersturen).not.toHaveBeenCalled();
      expect(logRegels(repetitie)[0].error_message).toContain('Twilio');
    });

    it('meldt het als er geen bestemmingsnummer is', async () => {
      const repetitie = klaarVoorVerzending({ type: 'whatsapp', naar: null });

      const antwoord = await als(beheerderToken, 'post', `/send/${repetitie}`);

      expect(antwoord.status).toBe(500);
      expect(whatsappVersturen).not.toHaveBeenCalled();
    });

    it('geeft 404 voor een onbekende repetitie', async () => {
      const antwoord = await als(beheerderToken, 'post', `/send/${uuidv4()}`);

      expect(antwoord.status).toBe(404);
      expect(webhookAanroepen).not.toHaveBeenCalled();
    });

    it('verstuurt niets voor een repetitie van een andere vereniging', async () => {
      zetInstellingen(anderOrkest.id, { webhookUrl: 'https://elders.example/hook' });
      const repetitie = maakRepetitie(andereVereniging.id, anderOrkest.id);
      maakStoel(repetitie, 'Iemand elders', 1, 0);

      const antwoord = await als(beheerderToken, 'post', `/send/${repetitie}`);

      expect(antwoord.status).toBe(404);
      expect(webhookAanroepen).not.toHaveBeenCalled();
      expect(logRegels(repetitie)).toEqual([]);
    });

    it('weigert een repetitie zonder orkest', async () => {
      // Een repetitie zonder orkest heeft geen instellingen om bij te horen.
      // De route zoekt de repetitie op via een join met orchestras, dus
      // zonder orkest is er niets te vinden.
      const repetitie = maakRepetitie(vereniging.id, null);

      const antwoord = await als(beheerderToken, 'post', `/send/${repetitie}`);

      expect(antwoord.status).toBe(404);
      expect(webhookAanroepen).not.toHaveBeenCalled();
    });

    it('weigert als er geen instellingen zijn voor dit orkest', async () => {
      const repetitie = maakRepetitie(vereniging.id, orkest.id);
      maakStoel(repetitie, 'Anna', 1, 0);

      const antwoord = await als(beheerderToken, 'post', `/send/${repetitie}`);

      expect(antwoord.status).toBe(400);
      expect(logRegels(repetitie)).toEqual([]);
    });

    it('weigert als de melding uit staat', async () => {
      zetInstellingen(orkest.id, { aan: false });
      const repetitie = maakRepetitie(vereniging.id, orkest.id);
      maakStoel(repetitie, 'Anna', 1, 0);

      const antwoord = await als(beheerderToken, 'post', `/send/${repetitie}`);

      expect(antwoord.status).toBe(400);
      expect(webhookAanroepen).not.toHaveBeenCalled();
    });

    it('weigert als er nog geen opstelling gemaakt is', async () => {
      zetInstellingen(orkest.id);
      const repetitie = maakRepetitie(vereniging.id, orkest.id);

      const antwoord = await als(beheerderToken, 'post', `/send/${repetitie}`);

      expect(antwoord.status).toBe(400);
      expect(webhookAanroepen).not.toHaveBeenCalled();
      expect(logRegels(repetitie)).toEqual([]);
    });

    it('laat een lid niets versturen, ook niet als alles klaarstaat', async () => {
      const repetitie = klaarVoorVerzending();

      const antwoord = await als(lidToken, 'post', `/send/${repetitie}`);

      expect(antwoord.status).toBe(403);
      expect(webhookAanroepen).not.toHaveBeenCalled();
      expect(logRegels(repetitie)).toEqual([]);
    });
  });

  // =====================================================
  // Twilio uitproberen
  // =====================================================

  describe('de Twilio-koppeling uitproberen', () => {
    const volledig = {
      account_sid: 'AC-sid',
      auth_token: 'token',
      whatsapp_from: '+14155238886',
      whatsapp_to: '+31612345678',
    };

    it('eist alle vier de velden', async () => {
      for (const ontbrekend of Object.keys(volledig)) {
        const body: Record<string, string> = { ...volledig };
        delete body[ontbrekend];

        const antwoord = await als(beheerderToken, 'post', '/test-twilio').send(body);

        expect(antwoord.status, `zonder ${ontbrekend}`).toBe(400);
      }
      expect(whatsappVersturen).not.toHaveBeenCalled();
    });

    it('zet whatsapp: voor de nummers die dat nog niet hebben', async () => {
      const antwoord = await als(beheerderToken, 'post', '/test-twilio').send(volledig);

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(whatsappVersturen).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'whatsapp:+14155238886', to: 'whatsapp:+31612345678' }),
      );
    });

    it('laat een nummer dat het voorvoegsel al heeft ongemoeid', async () => {
      await als(beheerderToken, 'post', '/test-twilio').send({
        ...volledig,
        whatsapp_from: 'whatsapp:+14155238886',
        whatsapp_to: 'whatsapp:+31612345678',
      });

      expect(whatsappVersturen).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'whatsapp:+14155238886', to: 'whatsapp:+31612345678' }),
      );
    });

    it('geeft een fout van Twilio door als serverfout', async () => {
      whatsappVersturen.mockRejectedValue(new Error('ongeldige credentials'));

      const antwoord = await als(beheerderToken, 'post', '/test-twilio').send(volledig);

      expect(antwoord.status).toBe(500);
    });

    it('bewaart de meegestuurde credentials nergens', async () => {
      await als(beheerderToken, 'post', '/test-twilio').send(volledig);

      expect(testDb.prepare('SELECT COUNT(*) as n FROM seating_notification_settings').get()).toEqual({ n: 0 });
    });
  });

  it('noemt de aanvrager niet als afzender in het bericht', async () => {
    // Het bericht gaat naar buiten; er hoort niets van de ingelogde
    // gebruiker in te staan behalve wat er in de opstelling zelf staat.
    zetInstellingen(orkest.id);
    const repetitie = maakRepetitie(vereniging.id, orkest.id);
    maakStoel(repetitie, 'Anna', 1, 0);

    await als(beheerderToken, 'post', `/send/${repetitie}`);

    const ruw = webhookAanroepen.mock.calls[0][1].body as string;
    expect(ruw).not.toContain(beheerder.id);
    expect(ruw).not.toContain(beheerder.email);
  });
});
