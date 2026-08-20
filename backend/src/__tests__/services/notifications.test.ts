/**
 * Meldingen: welke kanalen er zijn, wat een lid heeft ingesteld, en wat er
 * gebeurt als er iets verstuurd wordt.
 *
 * E-mail, WhatsApp en Telegram gaan naar buiten; die zijn in de opzet
 * afgevangen. Wat hier telt is de keuze ervoor: welk kanaal wordt gekozen, en
 * blijft een lid dat een soort melding heeft uitgezet daar ook van gevrijwaard.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestEnvironment, createTestUser, TestAssociation, TestUser } from '../testUtils';
import {
  getAvailableChannels,
  getUserPreferences,
  updateUserPreferences,
  updateTypeChannels,
  sendNotification,
} from '../../services/notifications';

vi.mock('../../services/whatsapp', () => ({
  sendWhatsAppNotification: vi.fn().mockResolvedValue(true),
  isWhatsAppConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock('../../services/telegram', () => ({
  sendTelegramNotification: vi.fn().mockResolvedValue(true),
  isTelegramConfigured: vi.fn().mockReturnValue(false),
}));

function bewaardeMeldingen(userId: string): Array<{ type: string; title: string; body: string; data: string | null }> {
  return testDb
    .prepare('SELECT type, title, body, data FROM notifications WHERE user_id = ? ORDER BY created_at')
    .all(userId) as Array<{ type: string; title: string; body: string; data: string | null }>;
}

describe('meldingen', () => {
  let vereniging: TestAssociation;
  let lid: TestUser;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    lid = omgeving.memberUser;
  });

  describe('getAvailableChannels', () => {
    it('noemt alle vier de kanalen', () => {
      expect(getAvailableChannels().map((k) => k.channel)).toEqual(['email', 'push', 'whatsapp', 'telegram']);
    });

    it('meldt e-mail altijd als beschikbaar', () => {
      expect(getAvailableChannels().find((k) => k.channel === 'email')?.configured).toBe(true);
    });

    it('meldt een kanaal zonder instellingen als niet beschikbaar', () => {
      const kanalen = getAvailableChannels();
      expect(kanalen.find((k) => k.channel === 'whatsapp')?.configured).toBe(false);
      expect(kanalen.find((k) => k.channel === 'telegram')?.configured).toBe(false);
    });
  });

  describe('getUserPreferences', () => {
    it('maakt bij het eerste ophalen standaardinstellingen aan', () => {
      const voor = testDb
        .prepare('SELECT COUNT(*) AS n FROM notification_preferences WHERE user_id = ?')
        .get(lid.id) as { n: number };
      expect(voor.n).toBe(0);

      getUserPreferences(lid.id);

      const na = testDb.prepare('SELECT COUNT(*) AS n FROM notification_preferences WHERE user_id = ?').get(lid.id) as {
        n: number;
      };
      expect(na.n).toBe(1);
    });

    it('maakt bij een tweede aanroep geen tweede rij', () => {
      getUserPreferences(lid.id);
      getUserPreferences(lid.id);

      const rij = testDb
        .prepare('SELECT COUNT(*) AS n FROM notification_preferences WHERE user_id = ?')
        .get(lid.id) as { n: number };
      expect(rij.n).toBe(1);
    });

    it('noemt het e-mailadres van het lid erbij', () => {
      expect(getUserPreferences(lid.id).channels.email.address).toBe(lid.email);
    });

    it('meldt WhatsApp en Telegram als ongekoppeld zolang er niets is ingesteld', () => {
      const voorkeuren = getUserPreferences(lid.id);
      expect(voorkeuren.channels.whatsapp).toMatchObject({ enabled: false, verified: false });
      expect(voorkeuren.channels.telegram).toMatchObject({ enabled: false, verified: false });
    });

    it('meldt een gekoppeld kanaal met de bijbehorende gegevens', () => {
      testDb
        .prepare(
          `INSERT INTO user_notification_channels (id, user_id, channel_type, channel_id, verified)
           VALUES (?, ?, 'telegram', '123456', 1)`,
        )
        .run(uuidv4(), lid.id);

      const telegram = getUserPreferences(lid.id).channels.telegram;
      expect(telegram).toMatchObject({ verified: true, chatId: '123456' });
    });

    it('geeft per soort melding terug of hij aanstaat', () => {
      const soorten = getUserPreferences(lid.id).notificationTypes;
      expect(soorten.new_music).toHaveProperty('enabled');
      expect(soorten.rehearsal_change).toHaveProperty('channels');
    });
  });

  describe('updateUserPreferences', () => {
    it('zet een kanaal uit', () => {
      getUserPreferences(lid.id);
      updateUserPreferences(lid.id, { emailEnabled: false });
      expect(getUserPreferences(lid.id).channels.email.enabled).toBe(false);
    });

    it('zet een soort melding uit', () => {
      getUserPreferences(lid.id);
      updateUserPreferences(lid.id, { newMusic: false });
      expect(getUserPreferences(lid.id).notificationTypes.new_music?.enabled).toBe(false);
    });

    it('maakt de instellingen aan wanneer die er nog niet zijn', () => {
      updateUserPreferences(lid.id, { pushEnabled: false });
      expect(getUserPreferences(lid.id).channels.push.enabled).toBe(false);
    });

    it('laat de andere instellingen ongemoeid', () => {
      getUserPreferences(lid.id);
      updateUserPreferences(lid.id, { newMusic: false });
      expect(getUserPreferences(lid.id).notificationTypes.rehearsal_change?.enabled).toBe(true);
    });

    it('doet niets bij een lege wijziging', () => {
      getUserPreferences(lid.id);
      expect(() => updateUserPreferences(lid.id, {})).not.toThrow();
      expect(getUserPreferences(lid.id).channels.email.enabled).toBe(true);
    });
  });

  describe('updateTypeChannels', () => {
    it('legt per soort melding vast welke kanalen gebruikt worden', () => {
      getUserPreferences(lid.id);
      updateTypeChannels(lid.id, 'new_music', ['email']);
      expect(getUserPreferences(lid.id).notificationTypes.new_music?.channels).toEqual(['email']);
    });

    it('overschrijft een eerdere keuze in plaats van er een naast te zetten', () => {
      updateTypeChannels(lid.id, 'new_music', ['email']);
      updateTypeChannels(lid.id, 'new_music', ['push']);

      const rij = testDb
        .prepare('SELECT COUNT(*) AS n FROM notification_type_channels WHERE user_id = ? AND notification_type = ?')
        .get(lid.id, 'new_music') as { n: number };
      expect(rij.n).toBe(1);
      expect(getUserPreferences(lid.id).notificationTypes.new_music?.channels).toEqual(['push']);
    });

    it('houdt de soorten uit elkaar', () => {
      getUserPreferences(lid.id);
      updateTypeChannels(lid.id, 'new_music', ['email']);
      updateTypeChannels(lid.id, 'concert_reminder', ['push']);

      const soorten = getUserPreferences(lid.id).notificationTypes;
      expect(soorten.new_music?.channels).toEqual(['email']);
      expect(soorten.concert_reminder?.channels).toEqual(['push']);
    });

    it('accepteert een lege lijst, zodat een soort helemaal stil blijft', () => {
      updateTypeChannels(lid.id, 'new_music', []);
      expect(getUserPreferences(lid.id).notificationTypes.new_music?.channels).toEqual([]);
    });
  });

  describe('sendNotification', () => {
    it('bewaart de melding bij het lid', async () => {
      await sendNotification({
        userId: lid.id,
        type: 'new_music',
        title: 'Nieuwe bladmuziek',
        body: 'Er staat een nieuw stuk klaar',
        associationId: vereniging.id,
      });

      const meldingen = bewaardeMeldingen(lid.id);
      expect(meldingen).toHaveLength(1);
      expect(meldingen[0]).toMatchObject({
        type: 'new_music',
        title: 'Nieuwe bladmuziek',
        body: 'Er staat een nieuw stuk klaar',
      });
    });

    it('bewaart de extra gegevens als json', async () => {
      await sendNotification({
        userId: lid.id,
        type: 'concert_reminder',
        title: 'Concert',
        body: 'Zaterdag',
        data: { concertId: 'abc-123' },
        associationId: vereniging.id,
      });

      expect(JSON.parse(bewaardeMeldingen(lid.id)[0].data!)).toEqual({ concertId: 'abc-123' });
    });

    it('bewaart de melding ook als er geen kanaal aanstaat', async () => {
      // De melding hoort in de app zichtbaar te blijven, ook als het lid geen
      // e-mail of push wil.
      updateUserPreferences(lid.id, { emailEnabled: false, pushEnabled: false });

      const resultaat = await sendNotification({
        userId: lid.id,
        type: 'general',
        title: 'Mededeling',
        body: 'Ter kennisgeving',
        associationId: vereniging.id,
      });

      expect(bewaardeMeldingen(lid.id)).toHaveLength(1);
      expect(resultaat.channels).toEqual([]);
    });

    it('houdt de meldingen van twee leden uit elkaar', async () => {
      const anderLid = createTestUser(vereniging.id, { email: `melding-${uuidv4()}@test.nl` });

      await sendNotification({
        userId: lid.id,
        type: 'general',
        title: 'Voor het ene lid',
        body: 'x',
        associationId: vereniging.id,
      });

      expect(bewaardeMeldingen(lid.id)).toHaveLength(1);
      expect(bewaardeMeldingen(anderLid.id)).toHaveLength(0);
    });

    it('gebruikt de standaardkanalen voor een lid dat nooit iets heeft ingesteld', async () => {
      const resultaat = await sendNotification({
        userId: lid.id,
        type: 'general',
        title: 'Mededeling',
        body: 'Ter kennisgeving',
        associationId: vereniging.id,
      });

      expect(resultaat.channels.map((k) => k.channel)).toEqual(['email', 'push']);
    });

    it('meldt per kanaal of het gelukt is', async () => {
      updateTypeChannels(lid.id, 'general', ['email']);

      const resultaat = await sendNotification({
        userId: lid.id,
        type: 'general',
        title: 'Mededeling',
        body: 'Ter kennisgeving',
        associationId: vereniging.id,
      });

      expect(resultaat.channels.map((k) => k.channel)).toEqual(['email']);
      expect(resultaat.channels[0]).toHaveProperty('success');
    });
  });
});
