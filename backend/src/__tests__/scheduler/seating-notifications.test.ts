/**
 * De melding met de opstelling, kort voor een repetitie.
 *
 * Deze taak draait elke minuut en stuurt uit zichzelf berichten naar buiten -
 * een webhook of een WhatsApp-nummer. Twee dingen kunnen daarbij ongemerkt
 * misgaan: er gaat niets uit terwijl iedereen erop rekent, of er gaat iets uit
 * naar het verkeerde orkest. Beide kanten staan hier vastgelegd.
 *
 * Alles wat het netwerk op zou gaan (fetch en Twilio) is vervangen door een
 * dubbelganger; de tests kijken naar wat er verstuurd zou zijn en naar wat er
 * in seating_notification_logs terechtkomt.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestAssociation, TestAssociation } from '../testUtils';
import { runNotificationRound } from '../../scheduler/seating-notifications';
import { clearModuleCache } from '../../modules/service';

const whatsappVersturen = vi.hoisted(() => vi.fn());

vi.mock('twilio', () => ({
  default: vi.fn(() => ({ messages: { create: whatsappVersturen } })),
}));

/** De webhook-aanroepen die de taak zou doen. */
let webhookAanroepen: ReturnType<typeof vi.fn>;

/** Vandaag zoals de taak hem uitrekent. */
function vandaag(): string {
  return new Date().toISOString().split('T')[0];
}

/** Lokale kloktijd over n minuten, als HH:MM - de vorm waarin start_time staat. */
function tijdOverMinuten(minuten: number): string {
  return new Date(Date.now() + minuten * 60 * 1000).toTimeString().substring(0, 5);
}

function maakOrkest(associationId: string, naam = 'Groot Orkest'): string {
  const id = uuidv4();
  testDb.prepare('INSERT INTO orchestras (id, name, association_id) VALUES (?, ?, ?)').run(id, naam, associationId);
  return id;
}

/** Zet de module Podium en opstelling aan; die staat standaard uit. */
function zetPodiummoduleAan(associationId: string, aan = true): void {
  testDb
    .prepare('INSERT INTO association_modules (id, association_id, module_key, enabled) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), associationId, 'stage', aan ? 1 : 0);
  clearModuleCache();
}

interface Instellingen {
  type?: 'webhook' | 'whatsapp';
  webhookUrl?: string | null;
  minutenVooraf?: number;
  aan?: boolean;
  bericht?: string | null;
  whatsappNaar?: string | null;
}

function maakInstellingen(orchestraId: string, opties: Instellingen = {}): string {
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
      'test-token',
      'whatsapp:+14155238886',
      opties.whatsappNaar === undefined ? 'whatsapp:+31612345678' : opties.whatsappNaar,
      opties.minutenVooraf ?? 15,
      opties.aan === false ? 0 : 1,
      opties.bericht ?? null,
    );
  return id;
}

function maakRepetitie(
  associationId: string,
  orchestraId: string,
  opties: { start?: string; datum?: string; locatie?: string } = {},
): string {
  const id = uuidv4();
  const start = opties.start ?? tijdOverMinuten(15);
  testDb
    .prepare(
      `INSERT INTO rehearsals (id, association_id, orchestra_id, date, start_time, end_time, location, type)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'regular')`,
    )
    .run(id, associationId, orchestraId, opties.datum ?? vandaag(), start, '21:30', opties.locatie ?? 'De Kruisboog');
  return id;
}

function maakStoel(rehearsalId: string, naam: string, rij: number, positie: number, dirigent = false): void {
  testDb
    .prepare(
      `INSERT INTO rehearsal_seating (id, rehearsal_id, member_name, instrument_name, row_number, position_in_row, is_conductor)
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

describe('Melding met de opstelling', () => {
  let vereniging: TestAssociation;
  let orkest: string;

  beforeEach(() => {
    webhookAanroepen = vi.fn(async () => ({ ok: true, status: 200, text: async () => 'ok' }));
    vi.stubGlobal('fetch', webhookAanroepen);
    whatsappVersturen.mockReset();
    whatsappVersturen.mockResolvedValue({ sid: 'SM123' });
    clearModuleCache();

    vereniging = createTestAssociation({ name: 'Harmonie Sint Cecilia' });
    zetPodiummoduleAan(vereniging.id);
    orkest = maakOrkest(vereniging.id);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('wat er verstuurd wordt', () => {
    it('stuurt de opstelling naar de webhook en legt vast dat het gelukt is', async () => {
      maakInstellingen(orkest);
      const repetitie = maakRepetitie(vereniging.id, orkest);
      maakStoel(repetitie, 'Anna', 1, 0);
      maakStoel(repetitie, 'Bram', 1, 1);
      maakStoel(repetitie, 'Dirk', 0, 0, true);

      await runNotificationRound();

      expect(webhookAanroepen).toHaveBeenCalledTimes(1);
      expect(webhookAanroepen.mock.calls[0][0]).toBe('https://webhook.test/opstelling');

      const bericht = eersteBericht();
      expect(bericht.type).toBe('seating_notification');
      expect(bericht.rehearsal.id).toBe(repetitie);
      expect(bericht.seating.totalMembers).toBe(2);
      expect(bericht.seating.totalConductors).toBe(1);

      expect(logRegels(repetitie)).toEqual([{ status: 'sent', error_message: null }]);
    });

    it('noemt de afgemelde leden in het bericht', async () => {
      maakInstellingen(orkest);
      const repetitie = maakRepetitie(vereniging.id, orkest);
      maakStoel(repetitie, 'Anna', 1, 0);
      testDb
        .prepare(
          "INSERT INTO rehearsal_attendance (id, rehearsal_id, member_name, status) VALUES (?, ?, 'Carla', 'declined')",
        )
        .run(uuidv4(), repetitie);
      testDb
        .prepare(
          "INSERT INTO rehearsal_attendance (id, rehearsal_id, member_name, status) VALUES (?, ?, 'Bram', 'accepted')",
        )
        .run(uuidv4(), repetitie);

      await runNotificationRound();

      const tekst = eersteBericht().message as string;
      expect(tekst).toContain('Afgemeld');
      expect(tekst).toContain('Carla');
      expect(tekst).not.toContain('Bram');
    });

    it('vult de eigen berichttekst in', async () => {
      // De starttijd wordt eenmaal uitgerekend: tussen twee aanroepen van
      // tijdOverMinuten kan de minuut omslaan.
      const start = tijdOverMinuten(15);
      maakInstellingen(orkest, { bericht: '{orchestra} speelt om {time} in {location}' });
      const repetitie = maakRepetitie(vereniging.id, orkest, { start, locatie: 'De Schuur' });
      maakStoel(repetitie, 'Anna', 1, 0);

      await runNotificationRound();

      expect(eersteBericht().message).toBe(`Groot Orkest speelt om ${start} in De Schuur`);
    });

    it('stuurt een WhatsApp-bericht naar elk ingesteld nummer', async () => {
      maakInstellingen(orkest, { type: 'whatsapp', whatsappNaar: '+31612345678, whatsapp:+31698765432' });
      const repetitie = maakRepetitie(vereniging.id, orkest);
      maakStoel(repetitie, 'Anna', 1, 0);

      await runNotificationRound();

      expect(whatsappVersturen).toHaveBeenCalledTimes(2);
      expect(whatsappVersturen.mock.calls.map((c) => c[0].to)).toEqual([
        'whatsapp:+31612345678',
        'whatsapp:+31698765432',
      ]);
      expect(webhookAanroepen).not.toHaveBeenCalled();
      expect(logRegels(repetitie)[0].status).toBe('sent');
    });
  });

  describe('wat met rust gelaten wordt', () => {
    it('stuurt niets als er nog geen opstelling gemaakt is', async () => {
      maakInstellingen(orkest);
      const repetitie = maakRepetitie(vereniging.id, orkest);

      await runNotificationRound();

      expect(webhookAanroepen).not.toHaveBeenCalled();
      // Zonder opstelling hoort er ook geen regel in het logboek te komen: er
      // is niets geprobeerd, dus er is niets mislukt.
      expect(logRegels(repetitie)).toHaveLength(0);
    });

    it('stuurt niets voor een repetitie die pas over uren begint', async () => {
      maakInstellingen(orkest);
      const repetitie = maakRepetitie(vereniging.id, orkest, { start: tijdOverMinuten(180) });
      maakStoel(repetitie, 'Anna', 1, 0);

      await runNotificationRound();

      expect(webhookAanroepen).not.toHaveBeenCalled();
    });

    it('stuurt niets voor een repetitie van morgen', async () => {
      const morgen = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      maakInstellingen(orkest);
      const repetitie = maakRepetitie(vereniging.id, orkest, { datum: morgen });
      maakStoel(repetitie, 'Anna', 1, 0);

      await runNotificationRound();

      expect(webhookAanroepen).not.toHaveBeenCalled();
    });

    it('stuurt niet nog een keer als de melding al verstuurd is', async () => {
      maakInstellingen(orkest);
      const repetitie = maakRepetitie(vereniging.id, orkest);
      maakStoel(repetitie, 'Anna', 1, 0);
      testDb
        .prepare(
          "INSERT INTO seating_notification_logs (id, rehearsal_id, orchestra_id, status) VALUES (?, ?, ?, 'sent')",
        )
        .run(uuidv4(), repetitie, orkest);

      await runNotificationRound();

      expect(webhookAanroepen).not.toHaveBeenCalled();
    });

    it('probeert het wel opnieuw als de vorige poging mislukt is', async () => {
      maakInstellingen(orkest);
      const repetitie = maakRepetitie(vereniging.id, orkest);
      maakStoel(repetitie, 'Anna', 1, 0);
      testDb
        .prepare(
          "INSERT INTO seating_notification_logs (id, rehearsal_id, orchestra_id, status) VALUES (?, ?, ?, 'failed')",
        )
        .run(uuidv4(), repetitie, orkest);

      await runNotificationRound();

      expect(webhookAanroepen).toHaveBeenCalledTimes(1);
    });

    it('stuurt niets als de meldingen voor dit orkest uitstaan', async () => {
      maakInstellingen(orkest, { aan: false });
      const repetitie = maakRepetitie(vereniging.id, orkest);
      maakStoel(repetitie, 'Anna', 1, 0);

      await runNotificationRound();

      expect(webhookAanroepen).not.toHaveBeenCalled();
      expect(logRegels(repetitie)).toHaveLength(0);
    });

    it('stuurt niets als de module Podium en opstelling uitstaat', async () => {
      // De instellingen blijven staan als een vereniging de module uitzet; ze
      // worden alleen niet meer uitgevoerd.
      testDb
        .prepare("DELETE FROM association_modules WHERE association_id = ? AND module_key = 'stage'")
        .run(vereniging.id);
      zetPodiummoduleAan(vereniging.id, false);
      maakInstellingen(orkest);
      const repetitie = maakRepetitie(vereniging.id, orkest);
      maakStoel(repetitie, 'Anna', 1, 0);

      await runNotificationRound();

      expect(webhookAanroepen).not.toHaveBeenCalled();
    });
  });

  describe('de verenigingsgrens', () => {
    it('stuurt de opstelling van het ene orkest niet naar de webhook van het andere', async () => {
      const andereVereniging = createTestAssociation({ name: 'Fanfare Concordia' });
      zetPodiummoduleAan(andereVereniging.id);
      const anderOrkest = maakOrkest(andereVereniging.id, 'Fanfare');

      maakInstellingen(orkest, { webhookUrl: 'https://webhook.test/harmonie' });
      maakInstellingen(anderOrkest, { webhookUrl: 'https://webhook.test/fanfare' });

      const eigenRepetitie = maakRepetitie(vereniging.id, orkest);
      maakStoel(eigenRepetitie, 'Anna', 1, 0);
      const andereRepetitie = maakRepetitie(andereVereniging.id, anderOrkest);
      maakStoel(andereRepetitie, 'Bram', 1, 0);

      await runNotificationRound();

      const perUrl = new Map(
        webhookAanroepen.mock.calls.map((c) => [c[0] as string, JSON.parse(c[1].body).rehearsal.id as string]),
      );
      expect(perUrl.get('https://webhook.test/harmonie')).toBe(eigenRepetitie);
      expect(perUrl.get('https://webhook.test/fanfare')).toBe(andereRepetitie);
    });

    it('stuurt niets over een orkest zonder eigen instellingen', async () => {
      const tweedeOrkest = maakOrkest(vereniging.id, 'Opleidingsorkest');
      maakInstellingen(orkest);
      const repetitieZonderInstellingen = maakRepetitie(vereniging.id, tweedeOrkest);
      maakStoel(repetitieZonderInstellingen, 'Bram', 1, 0);

      await runNotificationRound();

      expect(webhookAanroepen).not.toHaveBeenCalled();
    });
  });

  describe('als het misgaat', () => {
    it('legt vast dat de webhook een foutstatus gaf', async () => {
      webhookAanroepen.mockResolvedValue({ ok: false, status: 500, text: async () => 'kapot' });
      maakInstellingen(orkest);
      const repetitie = maakRepetitie(vereniging.id, orkest);
      maakStoel(repetitie, 'Anna', 1, 0);

      await runNotificationRound();

      const regels = logRegels(repetitie);
      expect(regels).toHaveLength(1);
      expect(regels[0].status).toBe('failed');
      expect(regels[0].error_message).toBeTruthy();
    });

    it('gaat door met het volgende orkest als de webhook van het eerste stukloopt', async () => {
      const tweedeOrkest = maakOrkest(vereniging.id, 'Opleidingsorkest');
      maakInstellingen(orkest, { webhookUrl: 'https://webhook.test/kapot' });
      maakInstellingen(tweedeOrkest, { webhookUrl: 'https://webhook.test/werkt' });

      const kapotteRepetitie = maakRepetitie(vereniging.id, orkest);
      maakStoel(kapotteRepetitie, 'Anna', 1, 0);
      const goedeRepetitie = maakRepetitie(vereniging.id, tweedeOrkest);
      maakStoel(goedeRepetitie, 'Bram', 1, 0);

      webhookAanroepen.mockImplementation(async (url: string) => {
        if (url === 'https://webhook.test/kapot') throw new Error('netwerk weg');
        return { ok: true, status: 200, text: async () => 'ok' };
      });

      await runNotificationRound();

      expect(logRegels(kapotteRepetitie)[0].status).toBe('failed');
      expect(logRegels(goedeRepetitie)[0].status).toBe('sent');
    });

    it('legt een mislukt WhatsApp-bericht vast zonder de ronde af te breken', async () => {
      const tweedeOrkest = maakOrkest(vereniging.id, 'Opleidingsorkest');
      maakInstellingen(orkest, { type: 'whatsapp' });
      maakInstellingen(tweedeOrkest, { webhookUrl: 'https://webhook.test/werkt' });
      whatsappVersturen.mockRejectedValue(new Error('Twilio weigert'));

      const whatsappRepetitie = maakRepetitie(vereniging.id, orkest);
      maakStoel(whatsappRepetitie, 'Anna', 1, 0);
      const webhookRepetitie = maakRepetitie(vereniging.id, tweedeOrkest);
      maakStoel(webhookRepetitie, 'Bram', 1, 0);

      await runNotificationRound();

      expect(logRegels(whatsappRepetitie)[0].status).toBe('failed');
      expect(logRegels(webhookRepetitie)[0].status).toBe('sent');
    });

    it('stuurt niets als er geen webhook-adres is ingevuld', async () => {
      maakInstellingen(orkest, { webhookUrl: null });
      const repetitie = maakRepetitie(vereniging.id, orkest);
      maakStoel(repetitie, 'Anna', 1, 0);

      await runNotificationRound();

      expect(webhookAanroepen).not.toHaveBeenCalled();
      expect(logRegels(repetitie)[0].status).toBe('failed');
    });
  });
});
