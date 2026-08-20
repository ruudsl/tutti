/**
 * Meldingen: de lijst, het aantal ongelezen, de voorkeuren per soort en de
 * aanmelding voor pushmeldingen.
 *
 * 484 regels zonder test. Alles wat een melding ophaalt of wegzet is netjes op
 * user_id afgebakend; de aanmelding voor push was dat niet.
 *
 * push_subscriptions heeft `endpoint TEXT NOT NULL UNIQUE`, en een endpoint
 * hoort bij een browser, niet bij een account. Meldde een tweede lid zich aan
 * vanaf hetzelfde toestel - een gedeelde tablet in het repetitielokaal, een
 * huishouden met een gedeelde computer - dan werd de bestaande rij bijgewerkt
 * met zijn sleutels, maar bleef user_id op het eerste lid staan. Gevolg: de
 * meldingen van de eerste kwamen leesbaar aan op het toestel van de tweede, en
 * de tweede kreeg zelf nooit iets, want een eigen rij kon er niet bij.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import notificationRoutes from '../../routes/notifications';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestEnvironment, TestUser } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/notifications', notificationRoutes);
app.use(errorHandler);

describe('meldingen', () => {
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
  });

  type Methode = 'get' | 'post' | 'patch' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/notifications${pad}`).set('Authorization', `Bearer ${token}`);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  function maakMelding(
    userId: string,
    overrides: { type?: string; title?: string; gelezen?: boolean; data?: string } = {},
  ): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO notifications (id, user_id, type, title, body, data, is_read)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      userId,
      overrides.type ?? 'new_music',
      overrides.title ?? 'Nieuwe muziek',
      'Er staat een nieuw stuk klaar.',
      overrides.data ?? null,
      overrides.gelezen ? 1 : 0,
    );
    return id;
  }

  const geldigeAanmelding = {
    endpoint: 'https://push.example.com/abonnement/abc',
    keys: { p256dh: 'sleutel-p256dh', auth: 'sleutel-auth' },
  };

  describe('GET /notifications', () => {
    it('geeft de eigen meldingen', async () => {
      maakMelding(lid.id, { title: 'Voor mij' });
      const antwoord = await alsLid('get', '/');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.map((n: { title: string }) => n.title)).toEqual(['Voor mij']);
    });

    it('geeft geen meldingen van een ander lid', async () => {
      maakMelding(anderLid.id, { title: 'Voor de ander' });
      const antwoord = await alsLid('get', '/');
      expect(antwoord.body).toEqual([]);
    });

    it('weigert een verzoek zonder token', async () => {
      expect((await request(app).get('/api/notifications')).status).toBe(401);
    });

    it('filtert op ongelezen', async () => {
      maakMelding(lid.id, { title: 'Gelezen', gelezen: true });
      maakMelding(lid.id, { title: 'Ongelezen' });

      const antwoord = await alsLid('get', '/?unreadOnly=true');
      expect(antwoord.body.map((n: { title: string }) => n.title)).toEqual(['Ongelezen']);
    });

    it('filtert op soort', async () => {
      maakMelding(lid.id, { type: 'new_music', title: 'Muziek' });
      maakMelding(lid.id, { type: 'concert_reminder', title: 'Concert' });

      const antwoord = await alsLid('get', '/?type=concert_reminder');
      expect(antwoord.body.map((n: { title: string }) => n.title)).toEqual(['Concert']);
    });

    it('houdt zich aan limit en offset', async () => {
      for (let i = 0; i < 4; i++) maakMelding(lid.id, { title: `Melding ${i}` });

      const eerste = await alsLid('get', '/?limit=2');
      const tweede = await alsLid('get', '/?limit=2&offset=2');

      expect(eerste.body).toHaveLength(2);
      expect(tweede.body).toHaveLength(2);
      const titels = [...eerste.body, ...tweede.body].map((n: { title: string }) => n.title);
      expect(new Set(titels).size).toBe(4);
    });

    it('pakt de meegestuurde gegevens uit', async () => {
      maakMelding(lid.id, { data: JSON.stringify({ concertId: 'abc' }) });
      const antwoord = await alsLid('get', '/');
      expect(antwoord.body[0].data).toEqual({ concertId: 'abc' });
    });

    it('geeft null terug als er geen gegevens bij zitten', async () => {
      maakMelding(lid.id);
      const antwoord = await alsLid('get', '/');
      expect(antwoord.body[0].data).toBeNull();
    });
  });

  describe('GET /notifications/unread-count', () => {
    it('telt alleen de eigen ongelezen meldingen', async () => {
      maakMelding(lid.id);
      maakMelding(lid.id, { gelezen: true });
      maakMelding(anderLid.id);

      const antwoord = await alsLid('get', '/unread-count');
      expect(antwoord.body).toEqual({ count: 1 });
    });

    it('geeft nul als er niets is', async () => {
      expect((await alsLid('get', '/unread-count')).body).toEqual({ count: 0 });
    });
  });

  describe('een melding als gelezen zetten', () => {
    it('zet de eigen melding op gelezen', async () => {
      const id = maakMelding(lid.id);
      const antwoord = await alsLid('post', `/${id}/read`);
      expect(antwoord.status).toBe(200);

      const rij = db.prepare('SELECT is_read, read_at FROM notifications WHERE id = ?').get(id) as any;
      expect(rij.is_read).toBe(1);
      expect(rij.read_at).toBeTruthy();
    });

    it('raakt de melding van een ander lid niet aan', async () => {
      const id = maakMelding(anderLid.id);
      await alsLid('post', `/${id}/read`);

      const rij = db.prepare('SELECT is_read FROM notifications WHERE id = ?').get(id) as any;
      expect(rij.is_read).toBe(0);
    });

    it('zet alle eigen meldingen op gelezen en laat die van een ander staan', async () => {
      maakMelding(lid.id);
      maakMelding(lid.id);
      const vanAnder = maakMelding(anderLid.id);

      await alsLid('post', '/read-all');

      expect((await alsLid('get', '/unread-count')).body.count).toBe(0);
      const rij = db.prepare('SELECT is_read FROM notifications WHERE id = ?').get(vanAnder) as any;
      expect(rij.is_read).toBe(0);
    });
  });

  describe('voorkeuren', () => {
    it('maakt bij de eerste keer opvragen alles aan en zet het aan', async () => {
      const antwoord = await alsLid('get', '/preferences');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual({
        newMusic: true,
        rehearsalChanges: true,
        seatingUpdates: true,
        chatMessages: true,
        practiceReminders: true,
        concertReminders: true,
        emailEnabled: true,
        pushEnabled: true,
      });
    });

    it('maakt niet elke keer een nieuwe rij aan', async () => {
      await alsLid('get', '/preferences');
      await alsLid('get', '/preferences');

      const aantal = db.prepare('SELECT COUNT(*) as n FROM notification_preferences WHERE user_id = ?').get(lid.id) as {
        n: number;
      };
      expect(aantal.n).toBe(1);
    });

    it('zet een voorkeur uit', async () => {
      await alsLid('patch', '/preferences').send({ newMusic: false });
      const antwoord = await alsLid('get', '/preferences');
      expect(antwoord.body.newMusic).toBe(false);
      expect(antwoord.body.chatMessages).toBe(true);
    });

    it('laat velden die niet worden genoemd met rust', async () => {
      await alsLid('patch', '/preferences').send({ newMusic: false, pushEnabled: false });
      await alsLid('patch', '/preferences').send({ chatMessages: false });

      const antwoord = await alsLid('get', '/preferences');
      expect(antwoord.body).toMatchObject({ newMusic: false, pushEnabled: false, chatMessages: false });
    });

    it('maakt de rij ook aan als die er bij het wijzigen nog niet is', async () => {
      const antwoord = await alsLid('patch', '/preferences').send({ concertReminders: false });
      expect(antwoord.status).toBe(200);
      expect((await alsLid('get', '/preferences')).body.concertReminders).toBe(false);
    });

    it('doet niets bij een leeg verzoek', async () => {
      await alsLid('patch', '/preferences').send({ newMusic: false });
      const antwoord = await alsLid('patch', '/preferences').send({});
      expect(antwoord.status).toBe(200);
      expect((await alsLid('get', '/preferences')).body.newMusic).toBe(false);
    });

    it('houdt de voorkeuren van twee leden uit elkaar', async () => {
      await alsLid('patch', '/preferences').send({ newMusic: false });
      const vanAnder = await als(anderLidToken, 'get', '/preferences');
      expect(vanAnder.body.newMusic).toBe(true);
    });
  });

  describe('aanmelding voor pushmeldingen', () => {
    const rijVoor = (endpoint: string) =>
      db.prepare('SELECT user_id, p256dh_key, auth_key FROM push_subscriptions WHERE endpoint = ?').get(endpoint) as
        { user_id: string; p256dh_key: string; auth_key: string } | undefined;

    it('meldt een toestel aan', async () => {
      const antwoord = await alsLid('post', '/push-subscription').send(geldigeAanmelding);
      expect(antwoord.status).toBe(200);
      expect(rijVoor(geldigeAanmelding.endpoint)?.user_id).toBe(lid.id);
    });

    it('weigert een aanmelding zonder endpoint', async () => {
      const antwoord = await alsLid('post', '/push-subscription').send({ keys: geldigeAanmelding.keys });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een aanmelding zonder sleutels', async () => {
      expect((await alsLid('post', '/push-subscription').send({ endpoint: geldigeAanmelding.endpoint })).status).toBe(
        400,
      );
      expect(
        (
          await alsLid('post', '/push-subscription').send({
            endpoint: geldigeAanmelding.endpoint,
            keys: { p256dh: 'alleen-deze' },
          })
        ).status,
      ).toBe(400);
    });

    it('werkt de sleutels bij als hetzelfde lid zich opnieuw aanmeldt', async () => {
      await alsLid('post', '/push-subscription').send(geldigeAanmelding);
      await alsLid('post', '/push-subscription').send({
        ...geldigeAanmelding,
        keys: { p256dh: 'nieuw-p256dh', auth: 'nieuw-auth' },
      });

      const rij = rijVoor(geldigeAanmelding.endpoint);
      expect(rij).toMatchObject({ user_id: lid.id, p256dh_key: 'nieuw-p256dh', auth_key: 'nieuw-auth' });

      const aantal = db.prepare('SELECT COUNT(*) as n FROM push_subscriptions').get() as { n: number };
      expect(aantal.n).toBe(1);
    });

    it('draagt het toestel over aan wie zich als laatste aanmeldt', async () => {
      await alsLid('post', '/push-subscription').send(geldigeAanmelding);
      await als(anderLidToken, 'post', '/push-subscription').send({
        ...geldigeAanmelding,
        keys: { p256dh: 'ander-p256dh', auth: 'ander-auth' },
      });

      const rij = rijVoor(geldigeAanmelding.endpoint);
      expect(rij).toMatchObject({ user_id: anderLid.id, p256dh_key: 'ander-p256dh', auth_key: 'ander-auth' });
    });

    it('houdt twee toestellen van hetzelfde lid uit elkaar', async () => {
      await alsLid('post', '/push-subscription').send(geldigeAanmelding);
      await alsLid('post', '/push-subscription').send({
        ...geldigeAanmelding,
        endpoint: 'https://push.example.com/abonnement/tweede',
      });

      const aantal = db.prepare('SELECT COUNT(*) as n FROM push_subscriptions WHERE user_id = ?').get(lid.id) as {
        n: number;
      };
      expect(aantal.n).toBe(2);
    });

    it('meldt een toestel af', async () => {
      await alsLid('post', '/push-subscription').send(geldigeAanmelding);
      const antwoord = await alsLid('delete', '/push-subscription').send({ endpoint: geldigeAanmelding.endpoint });

      expect(antwoord.status).toBe(200);
      expect(rijVoor(geldigeAanmelding.endpoint)).toBeUndefined();
    });

    it('weigert afmelden zonder endpoint', async () => {
      expect((await alsLid('delete', '/push-subscription').send({})).status).toBe(400);
    });

    it('meldt het toestel van een ander lid niet af', async () => {
      await als(anderLidToken, 'post', '/push-subscription').send(geldigeAanmelding);
      await alsLid('delete', '/push-subscription').send({ endpoint: geldigeAanmelding.endpoint });

      expect(rijVoor(geldigeAanmelding.endpoint)?.user_id).toBe(anderLid.id);
    });
  });

  describe('GET /notifications/vapid-public-key', () => {
    it('meldt dat pushmeldingen niet zijn ingesteld', async () => {
      const antwoord = await alsLid('get', '/vapid-public-key');
      expect(antwoord.status).toBe(503);
    });
  });
});
