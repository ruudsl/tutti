/**
 * De agenda: export naar ICS, de persoonlijke feed en de publieke kalender.
 *
 * Drie dingen wegen hier zwaar. De feed hangt aan een token in de url en niet
 * aan een sessie, dus die token is het enige wat de agenda van een lid
 * beschermt. De publieke kalender is bewust zonder aanmelding bereikbaar, en
 * dan moet wat er níet in hoort er ook echt niet in staan - repetities alleen
 * als de vereniging dat aan heeft gezet. En het infoscherm hangt in de hal,
 * dus daar mag geen bericht op verschijnen als de module Nieuwsberichten uit
 * staat.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import calendarRoutes from '../../routes/calendar';
import { errorHandler } from '../../middleware/errorHandler';
import { setModuleEnabled, clearModuleCache } from '../../modules/service';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestOrchestra,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/calendar', calendarRoutes);
app.use(errorHandler);

describe('agenda', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let lid: TestUser;
  let lidToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    clearModuleCache();
  });

  const alsLid = (methode: 'get' | 'post' | 'put', pad: string) =>
    request(app)[methode](`/api/calendar${pad}`).set('Authorization', `Bearer ${lidToken}`);

  /** Een datum een aantal dagen vanaf vandaag, als YYYY-MM-DD. */
  function overDagen(aantal: number): string {
    const datum = new Date();
    datum.setDate(datum.getDate() + aantal);
    return datum.toISOString().split('T')[0];
  }

  function maakRepetitie(overrides: Record<string, unknown> = {}): string {
    const id = uuidv4();
    const w = {
      association_id: vereniging.id,
      date: overDagen(30),
      start_time: '19:30',
      end_time: '21:30',
      location: 'Dorpshuis',
      type: 'regular',
      orchestra_id: null as string | null,
      ...overrides,
    };
    db.prepare(
      `INSERT INTO rehearsals (id, association_id, orchestra_id, date, start_time, end_time, location, type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, w.association_id, w.orchestra_id, w.date, w.start_time, w.end_time, w.location, w.type);
    return id;
  }

  function maakConcert(overrides: Record<string, unknown> = {}): string {
    const id = uuidv4();
    const w = {
      association_id: vereniging.id,
      name: 'Kerstconcert',
      date: overDagen(60),
      location: 'Kerk',
      description: 'Met koor',
      ...overrides,
    };
    db.prepare(
      'INSERT INTO concerts (id, association_id, name, date, location, description) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, w.association_id, w.name, w.date, w.location, w.description);
    return id;
  }

  /** Haal de feed-instellingen op; die worden bij het eerste bezoek aangemaakt. */
  async function feedUrlVanLid(): Promise<{ token: string; userId: string }> {
    const antwoord = await alsLid('get', '/settings');
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
    const token = new URL(antwoord.body.feedUrl, 'http://localhost').searchParams.get('token');
    expect(token).toBeTruthy();
    return { token: token as string, userId: lid.id };
  }

  describe('een losse gebeurtenis exporteren', () => {
    it('levert een repetitie als ICS-bestand', async () => {
      const id = maakRepetitie();

      const antwoord = await alsLid('get', `/export/rehearsal/${id}`);
      expect(antwoord.status, antwoord.text).toBe(200);
      expect(antwoord.headers['content-type']).toContain('text/calendar');
      expect(antwoord.headers['content-disposition']).toContain(`rehearsal-${id}.ics`);
      expect(antwoord.text).toContain('BEGIN:VCALENDAR');
      expect(antwoord.text).toContain('LOCATION:Dorpshuis');
    });

    it('levert een concert als ICS-bestand', async () => {
      const id = maakConcert();

      const antwoord = await alsLid('get', `/export/concert/${id}`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.text).toContain('SUMMARY:Kerstconcert');
    });

    it('weigert een type dat niet bestaat', async () => {
      expect((await alsLid('get', `/export/verjaardag/${uuidv4()}`)).status).toBe(400);
    });

    it('exporteert niets van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdeRepetitie = maakRepetitie({ association_id: andere.id });
      const vreemdConcert = maakConcert({ association_id: andere.id });

      expect((await alsLid('get', `/export/rehearsal/${vreemdeRepetitie}`)).status).toBe(404);
      expect((await alsLid('get', `/export/concert/${vreemdConcert}`)).status).toBe(404);
    });

    it('exporteert een verwijderd concert niet', async () => {
      // Concerten worden zacht verwijderd; overal elders in de applicatie
      // filtert de vraag op deleted_at. Zonder die voorwaarde blijft een
      // afgelast en verwijderd concert hier gewoon op te halen.
      const id = maakConcert();
      db.prepare('UPDATE concerts SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);

      expect((await alsLid('get', `/export/concert/${id}`)).status).toBe(404);
    });

    it('vraagt om een geldige aanmelding', async () => {
      expect((await request(app).get(`/api/calendar/export/concert/${uuidv4()}`)).status).toBe(401);
    });
  });

  describe('instellingen en feed-url', () => {
    it('maakt bij het eerste bezoek instellingen aan', async () => {
      const antwoord = await alsLid('get', '/settings');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toMatchObject({ includeRehearsals: true, includeConcerts: true, googleConnected: false });
      expect(antwoord.body.feedUrl).toContain(`/api/calendar/feed/${lid.id}?token=`);
    });

    it('geeft bij een tweede bezoek dezelfde feed-url', async () => {
      const eerste = (await alsLid('get', '/settings')).body.feedUrl;
      const tweede = (await alsLid('get', '/settings')).body.feedUrl;
      expect(tweede).toBe(eerste);
    });

    it('zet repetities uit de feed', async () => {
      await alsLid('get', '/settings');

      expect((await alsLid('put', '/settings').send({ includeRehearsals: false })).status).toBe(200);
      expect((await alsLid('get', '/settings')).body).toMatchObject({
        includeRehearsals: false,
        includeConcerts: true,
      });
    });

    it('maakt instellingen aan als er nog geen zijn en er meteen wordt gewijzigd', async () => {
      const antwoord = await alsLid('put', '/settings').send({ includeConcerts: false });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect((await alsLid('get', '/settings')).body.includeConcerts).toBe(false);
    });

    it('geeft een nieuwe token uit en maakt de oude ongeldig', async () => {
      const { token: oud, userId } = await feedUrlVanLid();

      const nieuw = await alsLid('post', '/feed/regenerate');
      expect(nieuw.status, JSON.stringify(nieuw.body)).toBe(200);
      const nieuweToken = new URL(nieuw.body.feedUrl, 'http://localhost').searchParams.get('token');
      expect(nieuweToken).not.toBe(oud);

      expect((await request(app).get(`/api/calendar/feed/${userId}?token=${oud}`)).status).toBe(401);
      expect((await request(app).get(`/api/calendar/feed/${userId}?token=${nieuweToken}`)).status).toBe(200);
    });
  });

  describe('de persoonlijke feed', () => {
    it('vraagt om een token', async () => {
      await feedUrlVanLid();
      expect((await request(app).get(`/api/calendar/feed/${lid.id}`)).status).toBe(401);
    });

    it('wijst een verkeerde token af', async () => {
      await feedUrlVanLid();
      expect((await request(app).get(`/api/calendar/feed/${lid.id}?token=onzin`)).status).toBe(401);
    });

    it('wijst de token van een ander lid af', async () => {
      const { token } = await feedUrlVanLid();
      const anderLid = createTestUser(vereniging.id, { email: `agenda-${uuidv4()}@test.nl` });
      await request(app)
        .get('/api/calendar/settings')
        .set('Authorization', `Bearer ${generateTestToken(anderLid)}`);

      expect((await request(app).get(`/api/calendar/feed/${anderLid.id}?token=${token}`)).status).toBe(401);
    });

    it('geeft 401 voor een gebruiker zonder instellingen', async () => {
      expect((await request(app).get(`/api/calendar/feed/${uuidv4()}?token=iets`)).status).toBe(401);
    });

    it('zet de komende repetities en concerten in de feed', async () => {
      const orkest = createTestOrchestra(vereniging.id, { name: 'Fanfare' });
      maakRepetitie({ orchestra_id: orkest.id });
      maakConcert();
      const { token, userId } = await feedUrlVanLid();

      const antwoord = await request(app).get(`/api/calendar/feed/${userId}?token=${token}`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.headers['content-type']).toContain('text/calendar');
      expect(antwoord.text).toContain('SUMMARY:Repetitie - Fanfare');
      expect(antwoord.text).toContain('SUMMARY:Kerstconcert');
    });

    it('laat een vervallen repetitie weg', async () => {
      maakRepetitie({ type: 'cancelled' });
      const { token, userId } = await feedUrlVanLid();

      const antwoord = await request(app).get(`/api/calendar/feed/${userId}?token=${token}`);
      expect(antwoord.text).not.toContain('Vervallen');
    });

    it('laat een repetitie uit het verleden weg', async () => {
      maakRepetitie({ date: overDagen(-30) });
      const { token, userId } = await feedUrlVanLid();

      const antwoord = await request(app).get(`/api/calendar/feed/${userId}?token=${token}`);
      expect(antwoord.text).not.toContain('BEGIN:VEVENT');
    });

    it('laat repetities weg zodra het lid ze heeft uitgezet', async () => {
      maakRepetitie();
      maakConcert();
      const { token, userId } = await feedUrlVanLid();
      await alsLid('put', '/settings').send({ includeRehearsals: false });

      const antwoord = await request(app).get(`/api/calendar/feed/${userId}?token=${token}`);
      expect(antwoord.text).not.toContain('SUMMARY:Repetitie');
      expect(antwoord.text).toContain('SUMMARY:Kerstconcert');
    });

    it('laat niets van een andere vereniging zien', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      maakConcert({ association_id: andere.id, name: 'Concert van de buren' });
      const { token, userId } = await feedUrlVanLid();

      const antwoord = await request(app).get(`/api/calendar/feed/${userId}?token=${token}`);
      expect(antwoord.text).not.toContain('Concert van de buren');
    });

    it('laat een verwijderd concert uit de feed weg', async () => {
      // De feed staat in het agendaprogramma van het lid en wordt daar
      // periodiek opgehaald. Een concert dat is ingetrokken hoort er dus ook
      // uit te verdwijnen; anders blijft het bij iedereen in de agenda staan.
      const id = maakConcert();
      db.prepare('UPDATE concerts SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
      const { token, userId } = await feedUrlVanLid();

      const antwoord = await request(app).get(`/api/calendar/feed/${userId}?token=${token}`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.text).not.toContain('Kerstconcert');
    });

    it('sluit de feed van een verwijderd lid af', async () => {
      // De feed hangt aan een token in de url en niet aan een sessie. Wie
      // verwijderd wordt, verliest zijn aanmelding, maar de token in zijn
      // agendaprogramma blijft staan en wordt daar elk uur opnieuw opgehaald.
      // Zonder controle op deleted_at blijft een oud-lid dus de repetities en
      // concerten van de vereniging binnenkrijgen zolang niemand de token
      // vervangt.
      maakConcert();
      const { token, userId } = await feedUrlVanLid();
      expect((await request(app).get(`/api/calendar/feed/${userId}?token=${token}`)).status).toBe(200);

      // Zo verwijdert users.ts een lid: een tijdstip in deleted_at en de
      // status op inactive.
      db.prepare("UPDATE users SET deleted_at = CURRENT_TIMESTAMP, status = 'inactive' WHERE id = ?").run(userId);

      const antwoord = await request(app).get(`/api/calendar/feed/${userId}?token=${token}`);
      expect(antwoord.status).toBe(404);
      expect(antwoord.text).not.toContain('Kerstconcert');
    });
  });

  describe('de publieke kalender', () => {
    function zetSlug(slug: string, associationId = vereniging.id): void {
      db.prepare('UPDATE associations SET slug = ? WHERE id = ?').run(slug, associationId);
    }

    it('is zonder aanmelding te bekijken', async () => {
      zetSlug(`harmonie-${uuidv4().slice(0, 8)}`);
      maakConcert();
      const slug = (db.prepare('SELECT slug FROM associations WHERE id = ?').get(vereniging.id) as { slug: string })
        .slug;

      const antwoord = await request(app).get(`/api/calendar/public/${slug}`);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.events).toHaveLength(1);
      expect(antwoord.body.events[0]).toMatchObject({ type: 'concert', title: 'Kerstconcert' });
    });

    it('werkt ook op het id van de vereniging', async () => {
      maakConcert();
      const antwoord = await request(app).get(`/api/calendar/public/${vereniging.id}`);
      expect(antwoord.status).toBe(200);
    });

    it('geeft 404 voor een vereniging die niet bestaat', async () => {
      expect((await request(app).get(`/api/calendar/public/${uuidv4()}`)).status).toBe(404);
    });

    it('houdt repetities eruit zolang de vereniging dat niet aan zet', async () => {
      maakRepetitie();
      maakConcert();

      const antwoord = await request(app).get(`/api/calendar/public/${vereniging.id}?months=12`);
      expect(antwoord.body.events.map((e: { type: string }) => e.type)).toEqual(['concert']);
    });

    it('toont repetities zodra de vereniging dat aan zet', async () => {
      db.prepare('UPDATE associations SET show_rehearsals_public = 1 WHERE id = ?').run(vereniging.id);
      maakRepetitie();

      const antwoord = await request(app).get(`/api/calendar/public/${vereniging.id}?months=12`);
      expect(antwoord.body.events.some((e: { type: string }) => e.type === 'rehearsal')).toBe(true);
    });

    it('laat een verwijderd concert weg', async () => {
      const id = maakConcert();
      db.prepare('UPDATE concerts SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);

      const antwoord = await request(app).get(`/api/calendar/public/${vereniging.id}?months=12`);
      expect(antwoord.body.events).toEqual([]);
    });

    it('kijkt niet verder vooruit dan gevraagd', async () => {
      maakConcert({ date: overDagen(200) });

      const kort = await request(app).get(`/api/calendar/public/${vereniging.id}?months=1`);
      expect(kort.body.events).toEqual([]);

      const lang = await request(app).get(`/api/calendar/public/${vereniging.id}?months=12`);
      expect(lang.body.events).toHaveLength(1);
    });

    it('valt niet om op een onzinnig aantal maanden', async () => {
      // De url van de openbare agenda staat op websites van verenigingen en
      // is door iedereen aan te passen. parseInt('zes') geeft NaN, en een
      // datum die daarmee is opgeschoven gooit bij toISOString(). Dat is een
      // 500 op een publieke pagina, en dat hoort een onzinnige parameter niet
      // op te leveren.
      maakConcert();

      const antwoord = await request(app).get(`/api/calendar/public/${vereniging.id}?months=zes`);
      expect(antwoord.status).toBe(200);
    });

    it('valt niet om op een absurd aantal maanden', async () => {
      // Ook een getal kan de datum buiten het bereik van Date duwen, met
      // dezelfde 500 tot gevolg. Het bereik wordt daarom begrensd.
      maakConcert();

      const antwoord = await request(app).get(`/api/calendar/public/${vereniging.id}?months=99999999`);
      expect(antwoord.status).toBe(200);
    });

    it('levert desgevraagd een ICS-bestand', async () => {
      maakConcert();

      const antwoord = await request(app).get(`/api/calendar/public/${vereniging.id}?months=12&format=ics`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.headers['content-type']).toContain('text/calendar');
      expect(antwoord.text).toContain('BEGIN:VCALENDAR');
    });

    it('laat inbedden op een externe site toe', async () => {
      const antwoord = await request(app).get(`/api/calendar/public/${vereniging.id}`);
      expect(antwoord.headers['access-control-allow-origin']).toBe('*');
    });

    it('toont niets van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      maakConcert({ association_id: andere.id, name: 'Concert van de buren' });
      maakConcert();

      const antwoord = await request(app).get(`/api/calendar/public/${vereniging.id}?months=12`);
      expect(antwoord.body.events.map((e: { title: string }) => e.title)).toEqual(['Kerstconcert']);
    });
  });

  describe('het infoscherm', () => {
    function maakBericht(gepind = 1, associationId = vereniging.id): string {
      const id = uuidv4();
      db.prepare(
        `INSERT INTO posts (id, association_id, slug, title, content, status, is_pinned, published_at, created_by)
         VALUES (?, ?, ?, 'Let op', 'De repetitie van vrijdag vervalt', 'published', ?, '2026-01-01', ?)`,
      ).run(id, associationId, `let-op-${id}`, gepind, beheerder.id);
      return id;
    }

    it('noemt het eerstvolgende concert en de eerstvolgende repetitie', async () => {
      // De repetitie hoort er alleen bij als de vereniging repetities
      // openbaar heeft gezet; het infoscherm is net zo publiek als de
      // openbare agenda.
      db.prepare('UPDATE associations SET show_rehearsals_public = 1 WHERE id = ?').run(vereniging.id);
      maakConcert();
      maakRepetitie();

      const antwoord = await request(app).get(`/api/calendar/info-screen/${vereniging.id}`);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.nextConcert).toMatchObject({ name: 'Kerstconcert', venue: 'Kerk' });
      expect(antwoord.body.nextRehearsal).toMatchObject({ startTime: '19:30', location: 'Dorpshuis' });
    });

    it('houdt de repetitie eruit zolang de vereniging die niet openbaar heeft gezet', async () => {
      // Het scherm hangt in de hal en is zonder aanmelding op te vragen, met
      // Access-Control-Allow-Origin: *. Een repetitierooster zegt waar de
      // leden op welk moment zijn, dus de openbare agenda laat het pas zien
      // als de vereniging show_rehearsals_public aan zet. Het infoscherm haalt
      // zijn gegevens uit dezelfde tabel en hoort zich aan dezelfde
      // instelling te houden - anders is de instelling met een andere url
      // alsnog te omzeilen.
      maakConcert();
      maakRepetitie();

      const antwoord = await request(app).get(`/api/calendar/info-screen/${vereniging.id}`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.nextConcert).toMatchObject({ name: 'Kerstconcert' });
      expect(antwoord.body.nextRehearsal).toBeNull();
    });

    it('geeft null als er niets gepland staat', async () => {
      const antwoord = await request(app).get(`/api/calendar/info-screen/${vereniging.id}`);
      expect(antwoord.body.nextConcert).toBeNull();
      expect(antwoord.body.nextRehearsal).toBeNull();
    });

    it('rekent uit over hoeveel dagen het concert is', async () => {
      maakConcert();
      const antwoord = await request(app).get(`/api/calendar/info-screen/${vereniging.id}`);
      expect(antwoord.body.nextConcert.daysUntil).toBeGreaterThan(0);
    });

    it('toont een gepind bericht', async () => {
      setModuleEnabled(vereniging.id, 'posts', true, beheerder.id);
      maakBericht();

      const antwoord = await request(app).get(`/api/calendar/info-screen/${vereniging.id}`);
      expect(antwoord.body.announcement).toMatchObject({ title: 'Let op' });
    });

    it('toont geen bericht als de module Nieuwsberichten uit staat', async () => {
      setModuleEnabled(vereniging.id, 'posts', false, beheerder.id);
      maakBericht();

      const antwoord = await request(app).get(`/api/calendar/info-screen/${vereniging.id}`);
      expect(antwoord.body.announcement).toBeNull();
    });

    it('toont een bericht dat niet gepind is niet', async () => {
      setModuleEnabled(vereniging.id, 'posts', true, beheerder.id);
      maakBericht(0);

      const antwoord = await request(app).get(`/api/calendar/info-screen/${vereniging.id}`);
      expect(antwoord.body.announcement).toBeNull();
    });

    it('geeft 404 voor een vereniging die niet bestaat', async () => {
      expect((await request(app).get(`/api/calendar/info-screen/${uuidv4()}`)).status).toBe(404);
    });

    it('laat inbedden toe en zegt hoe vaak het scherm moet verversen', async () => {
      const antwoord = await request(app).get(`/api/calendar/info-screen/${vereniging.id}`);
      expect(antwoord.headers['access-control-allow-origin']).toBe('*');
      expect(antwoord.body.refreshInterval).toBe(60);
    });
  });

  describe('koppeling met Google Agenda', () => {
    it('weigert te beginnen als de vereniging het niet heeft ingesteld', async () => {
      const antwoord = await alsLid('post', '/google/auth');
      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('niet geconfigureerd');
    });

    it('geeft een aanmeldadres zodra de vereniging het heeft ingesteld', async () => {
      db.prepare(
        "UPDATE associations SET google_calendar_client_id = 'test-client', google_calendar_client_secret = 'geheim' WHERE id = ?",
      ).run(vereniging.id);

      const antwoord = await alsLid('post', '/google/auth');
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(antwoord.body.authUrl).toContain('accounts.google.com');
      expect(antwoord.body.authUrl).toContain('test-client');
    });

    it('bewaart een state-token dat na tien minuten verloopt', async () => {
      db.prepare("UPDATE associations SET google_calendar_client_id = 'test-client' WHERE id = ?").run(vereniging.id);
      await alsLid('post', '/google/auth');

      const rij = db.prepare('SELECT user_id, expires_at FROM oauth_states WHERE user_id = ?').get(lid.id) as {
        user_id: string;
        expires_at: string;
      };
      expect(rij.user_id).toBe(lid.id);
      expect(new Date(rij.expires_at + 'Z').getTime()).toBeGreaterThan(Date.now());
    });

    it('stuurt terug met een foutmelding als de gebruiker weigert', async () => {
      const antwoord = await request(app).get('/api/calendar/google/callback?error=access_denied');
      expect(antwoord.status).toBe(302);
      expect(antwoord.headers.location).toContain('calendar_error=denied');
    });

    it('stuurt terug met een foutmelding zonder code of state', async () => {
      const antwoord = await request(app).get('/api/calendar/google/callback');
      expect(antwoord.headers.location).toContain('calendar_error=invalid');
    });

    it('stuurt terug met een foutmelding bij een verlopen of onbekende state', async () => {
      const antwoord = await request(app).get('/api/calendar/google/callback?code=abc&state=onbekend');
      expect(antwoord.headers.location).toContain('calendar_error=expired');
    });

    it('koppelt los zonder te struikelen als er niets gekoppeld was', async () => {
      const antwoord = await alsLid('post', '/google/disconnect');
      expect(antwoord.status).toBe(200);
    });

    it('wist de bewaarde tokens bij loskoppelen', async () => {
      await alsLid('get', '/settings');
      db.prepare(
        "UPDATE user_calendar_settings SET google_refresh_token = 'geheim', google_calendar_id = 'primary' WHERE user_id = ?",
      ).run(lid.id);
      expect((await alsLid('get', '/settings')).body.googleConnected).toBe(true);

      await alsLid('post', '/google/disconnect');

      const na = await alsLid('get', '/settings');
      expect(na.body.googleConnected).toBe(false);
      expect(na.body.googleCalendarId).toBeNull();
    });
  });
});
