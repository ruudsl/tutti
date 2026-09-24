/**
 * WhatsApp en Telegram stelt elke vereniging zelf in (Instellingen). Of een
 * kanaal voor een lid beschikbaar is, hangt dus af van zijn eigen vereniging.
 *
 * Voorheen vroeg de lijst met kanalen het zonder vereniging op, en dan gold:
 * "heeft een vereniging dit ingesteld?". Een lid zag Telegram als beschikbaar
 * omdat een andere vereniging op de installatie een bot had, en het koppelen
 * mislukte daarna. Zonder mocks: de echte diensten lezen de tabel.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../setup';
import db from '../../database/connection';
import { getAvailableChannels } from '../../services/notifications';
import { createTestAssociation, createTestEnvironment, TestAssociation } from '../testUtils';

const OMGEVING = ['TELEGRAM_BOT_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN', 'TWILIO_ACCOUNT_SID'];
const vorige: Record<string, string | undefined> = {};

describe('meldkanalen per vereniging', () => {
  let eigen: TestAssociation;
  let andere: TestAssociation;

  beforeEach(() => {
    for (const sleutel of OMGEVING) {
      vorige[sleutel] = process.env[sleutel];
      delete process.env[sleutel];
    }
    eigen = createTestEnvironment().association;
    andere = createTestAssociation({ name: 'Andere vereniging' });
  });

  afterEach(() => {
    for (const sleutel of OMGEVING) {
      if (vorige[sleutel] === undefined) delete process.env[sleutel];
      else process.env[sleutel] = vorige[sleutel];
    }
  });

  const telegramVoor = (associationId: string) =>
    getAvailableChannels(associationId).find((kanaal) => kanaal.channel === 'telegram')?.configured;

  it('meldt Telegram niet als beschikbaar omdat een andere vereniging een bot heeft', () => {
    db.prepare(
      "UPDATE associations SET telegram_enabled = 1, telegram_bot_token = 'bot-van-de-ander' WHERE id = ?",
    ).run(andere.id);

    expect(telegramVoor(eigen.id)).toBe(false);
    expect(telegramVoor(andere.id)).toBe(true);
  });
});
