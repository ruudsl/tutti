/**
 * Het webhook-adres van de opstellingsmelding is een geheim.
 *
 * Bij een webhook van Slack, Discord, Make of n8n zit het geheim in het adres
 * zelf: wie het kent, zet berichten in het kanaal van de vereniging. Het stond
 * als klaartekst in de database en ging bij elke GET volledig terug naar de
 * browser.
 *
 * Wat hoort: versleuteld opslaan, alleen een masker teruggeven, en bij het
 * versturen het ontsleutelde adres gebruiken. Een leeg veld (of het masker)
 * bij opslaan betekent "ongewijzigd", net als bij de andere geheimen.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { decrypt, encrypt, isEncrypted } from '../../utils/encryption';
import seatingNotificationRoutes from '../../routes/seating-notifications';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestEnvironment, createTestOrchestra, TestAssociation, TestOrchestra } from '../testUtils';

vi.mock('twilio', () => ({ default: vi.fn(() => ({ messages: { create: vi.fn() } })) }));

const app = express();
app.use(express.json());
app.use('/api/seating-notifications', seatingNotificationRoutes);
app.use(errorHandler);

const ADRES = 'https://hooks.chat.example/services/T0000/B0000/geheim-pad-van-de-vereniging';
const MASKER = '••••••••';

describe('webhook-adres van de opstellingsmelding', () => {
  let vereniging: TestAssociation;
  let orkest: TestOrchestra;
  let beheerderToken: string;
  let webhookAanroepen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    webhookAanroepen = vi.fn(async () => ({ ok: true, status: 200, text: async () => 'ontvangen' }));
    vi.stubGlobal('fetch', webhookAanroepen);

    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerderToken = omgeving.adminToken;
    orkest = createTestOrchestra(vereniging.id, { name: 'Harmonieorkest' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const als = (methode: 'get' | 'put' | 'post', pad: string) =>
    request(app)[methode](`/api/seating-notifications${pad}`).set('Authorization', `Bearer ${beheerderToken}`);

  const opgeslagen = () =>
    (
      testDb.prepare('SELECT webhook_url FROM seating_notification_settings WHERE orchestra_id = ?').get(orkest.id) as {
        webhook_url: string | null;
      }
    ).webhook_url;

  /** Een repetitie van dit orkest met één stoel: genoeg om te versturen. */
  function repetitieMetOpstelling(): string {
    const repetitie = uuidv4();
    testDb
      .prepare(
        `INSERT INTO rehearsals (id, association_id, orchestra_id, date, start_time, end_time, location, type)
         VALUES (?, ?, ?, '2026-10-01', '19:30', '21:30', 'De Kruisboog', 'regular')`,
      )
      .run(repetitie, vereniging.id, orkest.id);
    testDb
      .prepare(
        `INSERT INTO rehearsal_seating
           (id, rehearsal_id, member_name, instrument_name, row_number, position_in_row, is_conductor)
         VALUES (?, ?, 'Anna', 'Trompet', 1, 0, 0)`,
      )
      .run(uuidv4(), repetitie);
    return repetitie;
  }

  const slaOp = (webhookUrl: string | undefined) =>
    als('put', `/settings/${orkest.id}`).send({ notification_type: 'webhook', webhook_url: webhookUrl });

  it('slaat het adres versleuteld op, zonder klaartekst in de database', async () => {
    const antwoord = await slaOp(ADRES);

    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
    const waarde = opgeslagen()!;
    expect(waarde).not.toContain('hooks.chat.example');
    expect(waarde).not.toContain('geheim-pad');
    expect(isEncrypted(waarde)).toBe(true);
    expect(decrypt(waarde)).toBe(ADRES);
  });

  it('geeft bij opvragen alleen het masker terug, geen enkel teken van het adres', async () => {
    await slaOp(ADRES);

    const antwoord = await als('get', `/settings/${orkest.id}`);

    expect(antwoord.status).toBe(200);
    expect(antwoord.body.webhook_url).toBe(MASKER);
    const tekst = JSON.stringify(antwoord.body);
    expect(tekst).not.toContain('hooks.chat.example');
    expect(tekst).not.toContain('geheim-pad');
    expect(tekst).not.toContain('https://');
  });

  it('geeft ook bij opslaan alleen het masker terug', async () => {
    const antwoord = await slaOp(ADRES);

    expect(antwoord.body.webhook_url).toBe(MASKER);
    expect(JSON.stringify(antwoord.body)).not.toContain('geheim-pad');
  });

  it('maskeert ook een adres van vóór de versleuteling', async () => {
    testDb
      .prepare(
        `INSERT INTO seating_notification_settings (id, orchestra_id, notification_type, webhook_url)
         VALUES (?, ?, 'webhook', ?)`,
      )
      .run(uuidv4(), orkest.id, ADRES);

    const antwoord = await als('get', `/settings/${orkest.id}`);

    expect(antwoord.body.webhook_url).toBe(MASKER);
  });

  it.each([
    ['een leeg veld', ''],
    ['geen veld', undefined],
    ['het masker', MASKER],
  ])('houdt het bestaande adres bij %s', async (_omschrijving, waarde) => {
    await slaOp(ADRES);
    const voor = opgeslagen();

    const antwoord = await slaOp(waarde);

    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
    expect(opgeslagen()).toBe(voor);
    expect(decrypt(opgeslagen()!)).toBe(ADRES);
  });

  it('vervangt het adres door een echt nieuw adres', async () => {
    await slaOp(ADRES);

    await slaOp('https://nieuw.chat.example/haak');

    expect(decrypt(opgeslagen()!)).toBe('https://nieuw.chat.example/haak');
  });

  it('eist nog steeds een adres als er nog geen is', async () => {
    const antwoord = await slaOp('');

    expect(antwoord.status).toBe(400);
  });

  it('verstuurt naar het ontsleutelde adres', async () => {
    await slaOp(ADRES);
    const repetitie = repetitieMetOpstelling();

    const antwoord = await als('post', `/send/${repetitie}`);

    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
    expect(webhookAanroepen).toHaveBeenCalledTimes(1);
    expect(webhookAanroepen.mock.calls[0][0]).toBe(ADRES);
  });

  it('verstuurt ook naar een adres dat met encrypt is gezet', async () => {
    // Zoals de migratie het achterlaat.
    testDb
      .prepare(
        `INSERT INTO seating_notification_settings (id, orchestra_id, notification_type, webhook_url)
         VALUES (?, ?, 'webhook', ?)`,
      )
      .run(uuidv4(), orkest.id, encrypt(ADRES));
    const repetitie = repetitieMetOpstelling();

    await als('post', `/send/${repetitie}`);

    expect(webhookAanroepen.mock.calls[0][0]).toBe(ADRES);
  });
});
