/**
 * Schoolvakanties en feestdagen.
 *
 * Dit bestand stond op nul procent. De route mengt twee bronnen: een vaste
 * lijst met Nederlandse schoolvakanties uit de service (globaal, per regio) en
 * de eigen aangepaste feestdagen van een vereniging uit de database. Die
 * tweede bron is verenigingsgebonden, en juist daar kan het misgaan: een
 * aangepaste feestdag van vereniging B hoort nergens in het antwoord van A
 * terecht te komen, ook niet via de gedeelde antwoordcache.
 *
 * Verder telt de regio-instelling zwaar mee: die bepaalt welke systeemvakantie
 * je krijgt, dus een verkeerd opgeslagen regio geeft stilzwijgend de verkeerde
 * vakanties in de agenda.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import holidaysRoutes from '../../routes/holidays';
import { errorHandler } from '../../middleware/errorHandler';
import { invalidateAllCache } from '../../middleware/cache';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

// De cache-invalidatie in de route werkt op het pad '/api/holidays', dus de
// testapp moet de router op datzelfde pad hangen.
const app = express();
app.use(express.json());
app.use('/api/holidays', holidaysRoutes);
app.use(errorHandler);

/** Datum van vandaag plus (of min) een aantal dagen, als YYYY-MM-DD. */
function dagen(verschil: number): string {
  const d = new Date();
  d.setDate(d.getDate() + verschil);
  return d.toISOString().split('T')[0];
}

describe('feestdagen', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lidToken: string;
  let commissieToken: string;

  let andereVereniging: TestAssociation;
  let andereBeheerderToken: string;

  beforeEach(() => {
    // De antwoordcache leeft op moduleniveau en overleeft het legen van de
    // database, dus zonder dit ziet de volgende test het antwoord van de vorige.
    invalidateAllCache();

    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;
    commissieToken = omgeving.musicCommitteeToken;

    // users.email is globaal uniek, dus de tweede vereniging krijgt een eigen
    // adres in plaats van nog een createTestEnvironment().
    andereVereniging = createTestAssociation({ name: 'Andere Vereniging' });
    const andereBeheerder = createTestUser(andereVereniging.id, {
      email: 'beheerder-b@test.com',
      role: 'admin',
    });
    andereBeheerderToken = generateTestToken(andereBeheerder);
  });

  type Methode = 'get' | 'post' | 'put' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/holidays${pad}`).set('Authorization', `Bearer ${token}`);

  /** Zet rechtstreeks een aangepaste feestdag in de database. */
  function maakFeestdag(
    associationId: string,
    overrides: { id?: string; name?: string; start?: string; end?: string; isCustom?: boolean; region?: string } = {},
  ): string {
    const id = overrides.id || uuidv4();
    const start = overrides.start || '2026-03-02';
    const end = overrides.end || '2026-03-04';
    db.prepare(
      `INSERT INTO school_holidays (id, association_id, name, region, country, start_date, end_date, year, holiday_type, is_custom, source)
       VALUES (?, ?, ?, ?, 'NL', ?, ?, ?, 'eigen', ?, 'manual')`,
    ).run(
      id,
      associationId,
      overrides.name || 'Verenigingsweekend',
      overrides.region ?? null,
      start,
      end,
      parseInt(start.substring(0, 4)),
      overrides.isCustom === false ? 0 : 1,
    );
    return id;
  }

  function zetRegio(associationId: string, regio: string): void {
    db.prepare(
      `INSERT INTO association_holiday_settings (id, association_id, region, show_holidays_in_calendar, auto_block_rehearsals)
       VALUES (?, ?, ?, 1, 0)`,
    ).run(uuidv4(), associationId, regio);
  }

  describe('GET /api/holidays', () => {
    it('geeft systeemvakanties van de eigen regio en de eigen aangepaste feestdagen', async () => {
      zetRegio(vereniging.id, 'noord');
      maakFeestdag(vereniging.id, { name: 'Verenigingsweekend' });

      const antwoord = await als(beheerderToken, 'get', '/?year=2026');

      expect(antwoord.status).toBe(200);
      const namen = antwoord.body.holidays.map((h: any) => h.name);
      expect(namen).toContain('Verenigingsweekend');
      expect(namen).toContain('Nieuwjaarsdag');

      // De zomervakantie van noord begint in 2026 op 4 juli, die van zuid op
      // 11 juli. De regio bepaalt dus welke er in het antwoord staat.
      const zomer = antwoord.body.holidays.find((h: any) => h.name === 'Zomervakantie');
      expect(zomer.startDate).toBe('2026-07-04');
      expect(antwoord.body.settings.region).toBe('noord');
    });

    it('toont de aangepaste feestdag van een andere vereniging niet', async () => {
      maakFeestdag(andereVereniging.id, { name: 'Feest van B' });

      const antwoord = await als(beheerderToken, 'get', '/?year=2026');

      expect(antwoord.status).toBe(200);
      const namen = antwoord.body.holidays.map((h: any) => h.name);
      expect(namen).not.toContain('Feest van B');
    });

    it('laat het gecachete antwoord van de ene vereniging niet aan de andere zien', async () => {
      maakFeestdag(vereniging.id, { name: 'Alleen van A' });

      // A eerst, zodat het antwoord in de cache staat als B daarna dezelfde
      // URL opvraagt.
      const eerste = await als(beheerderToken, 'get', '/?year=2026');
      const tweede = await als(andereBeheerderToken, 'get', '/?year=2026');

      expect(eerste.body.holidays.map((h: any) => h.name)).toContain('Alleen van A');
      expect(tweede.body.holidays.map((h: any) => h.name)).not.toContain('Alleen van A');
    });

    it('maakt bij de eerste opvraging instellingen aan met regio midden', async () => {
      const voor = db
        .prepare('SELECT COUNT(*) AS aantal FROM association_holiday_settings WHERE association_id = ?')
        .get(vereniging.id) as { aantal: number };
      expect(voor.aantal).toBe(0);

      const antwoord = await als(beheerderToken, 'get', '/');

      expect(antwoord.status).toBe(200);
      const na = db
        .prepare('SELECT region FROM association_holiday_settings WHERE association_id = ?')
        .get(vereniging.id) as { region: string };
      expect(na.region).toBe('midden');
    });

    it('sluit een aangepaste feestdag buiten het gevraagde jaar uit', async () => {
      maakFeestdag(vereniging.id, { name: 'Feest in 2027', start: '2027-03-01', end: '2027-03-02' });

      const antwoord = await als(beheerderToken, 'get', '/?year=2026');

      expect(antwoord.body.holidays.map((h: any) => h.name)).not.toContain('Feest in 2027');
    });

    it('weigert een verzoek zonder token', async () => {
      const antwoord = await request(app).get('/api/holidays');

      expect(antwoord.status).toBe(401);
    });

    it('geeft 400 als er geen vereniging aan de gebruiker hangt', async () => {
      const zonderVereniging = generateTestToken({ ...beheerder, associationId: null as unknown as string });

      const antwoord = await als(zonderVereniging, 'get', '/');

      expect(antwoord.status).toBe(400);
    });
  });

  describe('GET /api/holidays/check', () => {
    it('herkent een systeemvakantie op basis van de ingestelde regio', async () => {
      zetRegio(vereniging.id, 'noord');

      const antwoord = await als(beheerderToken, 'get', '/check?date=2026-07-05');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.isHoliday).toBe(true);
      expect(antwoord.body.holiday.name).toBe('Zomervakantie');
      expect(antwoord.body.holiday.isCustom).toBe(false);
    });

    it('geeft voor dezelfde datum in een andere regio geen vakantie', async () => {
      // 5 juli 2026 valt wel in de zomervakantie van noord, maar niet in die
      // van zuid (die begint op 11 juli). Zonder regiofilter zou dit slagen.
      zetRegio(vereniging.id, 'zuid');

      const antwoord = await als(beheerderToken, 'get', '/check?date=2026-07-05');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.isHoliday).toBe(false);
    });

    it('herkent een eigen aangepaste feestdag', async () => {
      maakFeestdag(vereniging.id, { name: 'Verenigingsweekend', start: '2026-03-02', end: '2026-03-04' });

      const antwoord = await als(beheerderToken, 'get', '/check?date=2026-03-03');

      expect(antwoord.body.isHoliday).toBe(true);
      expect(antwoord.body.holiday.name).toBe('Verenigingsweekend');
      expect(antwoord.body.holiday.isCustom).toBe(true);
    });

    it('kijkt niet naar de aangepaste feestdag van een andere vereniging', async () => {
      maakFeestdag(andereVereniging.id, { name: 'Feest van B', start: '2026-03-02', end: '2026-03-04' });

      const antwoord = await als(beheerderToken, 'get', '/check?date=2026-03-03');

      expect(antwoord.body.isHoliday).toBe(false);
      expect(antwoord.body.holiday).toBeNull();
    });

    it('vereist een datum', async () => {
      const antwoord = await als(beheerderToken, 'get', '/check');

      expect(antwoord.status).toBe(400);
    });
  });

  describe('GET /api/holidays/sync', () => {
    it('geeft een beheerder het aantal gesynchroniseerde feestdagen', async () => {
      const antwoord = await als(beheerderToken, 'get', '/sync?year=2026');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.year).toBe(2026);
      expect(antwoord.body.count).toBeGreaterThan(0);
    });

    it('weigert synchroniseren door een gewoon lid', async () => {
      const antwoord = await als(lidToken, 'get', '/sync');

      expect(antwoord.status).toBe(403);
    });

    it('weigert synchroniseren door de muziekcommissie', async () => {
      const antwoord = await als(commissieToken, 'get', '/sync');

      expect(antwoord.status).toBe(403);
    });
  });

  describe('POST /api/holidays', () => {
    const nieuw = { name: 'Studiedag', startDate: '2026-09-14', endDate: '2026-09-15' };

    it('slaat een aangepaste feestdag op bij de eigen vereniging', async () => {
      const antwoord = await als(beheerderToken, 'post', '/').send({ ...nieuw, holidayType: 'eigen' });

      expect(antwoord.status).toBe(201);
      const rij = db.prepare('SELECT * FROM school_holidays WHERE id = ?').get(antwoord.body.id) as any;
      expect(rij.association_id).toBe(vereniging.id);
      expect(rij.name).toBe('Studiedag');
      expect(rij.year).toBe(2026);
      // is_custom en source bepalen of de feestdag later nog te wijzigen is.
      expect(Boolean(rij.is_custom)).toBe(true);
      expect(rij.source).toBe('manual');
    });

    it('staat de muziekcommissie toe een feestdag toe te voegen', async () => {
      const antwoord = await als(commissieToken, 'post', '/').send(nieuw);

      expect(antwoord.status).toBe(201);
    });

    it('weigert een gewoon lid', async () => {
      const antwoord = await als(lidToken, 'post', '/').send(nieuw);

      expect(antwoord.status).toBe(403);
      const aantal = db.prepare('SELECT COUNT(*) AS aantal FROM school_holidays').get() as { aantal: number };
      expect(aantal.aantal).toBe(0);
    });

    it('vereist naam, startdatum en einddatum', async () => {
      const antwoord = await als(beheerderToken, 'post', '/').send({ name: 'Zonder datums' });

      expect(antwoord.status).toBe(400);
    });

    it('weigert een startdatum na de einddatum', async () => {
      const antwoord = await als(beheerderToken, 'post', '/').send({
        name: 'Omgekeerd',
        startDate: '2026-09-15',
        endDate: '2026-09-14',
      });

      expect(antwoord.status).toBe(400);
    });

    it('maakt het gecachete overzicht ongeldig, zodat de nieuwe feestdag meteen zichtbaar is', async () => {
      const voor = await als(beheerderToken, 'get', '/?year=2026');
      expect(voor.body.holidays.map((h: any) => h.name)).not.toContain('Studiedag');

      await als(beheerderToken, 'post', '/').send(nieuw);

      const na = await als(beheerderToken, 'get', '/?year=2026');
      expect(na.body.holidays.map((h: any) => h.name)).toContain('Studiedag');
    });
  });

  describe('instellingen', () => {
    it('geeft de standaardinstellingen terug', async () => {
      const antwoord = await als(lidToken, 'get', '/settings');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.region).toBe('midden');
      expect(antwoord.body.regions.map((r: any) => r.value)).toEqual(['noord', 'midden', 'zuid']);
    });

    it('wordt door de beheerder gewijzigd en blijft bewaard', async () => {
      const antwoord = await als(beheerderToken, 'put', '/settings').send({
        region: 'zuid',
        autoBlockRehearsals: true,
      });

      expect(antwoord.status).toBe(200);
      const rij = db
        .prepare('SELECT * FROM association_holiday_settings WHERE association_id = ?')
        .get(vereniging.id) as any;
      expect(rij.region).toBe('zuid');
      expect(Boolean(rij.auto_block_rehearsals)).toBe(true);
    });

    it('kan een vinkje ook uitzetten', async () => {
      await als(beheerderToken, 'put', '/settings').send({ showHolidaysInCalendar: true });

      const antwoord = await als(beheerderToken, 'put', '/settings').send({ showHolidaysInCalendar: false });

      expect(antwoord.status).toBe(200);
      const rij = db
        .prepare('SELECT show_holidays_in_calendar FROM association_holiday_settings WHERE association_id = ?')
        .get(vereniging.id) as any;
      expect(Boolean(rij.show_holidays_in_calendar)).toBe(false);
    });

    it('laat de regio ongemoeid als het verzoek hem niet noemt', async () => {
      await als(beheerderToken, 'put', '/settings').send({ region: 'noord' });

      await als(beheerderToken, 'put', '/settings').send({ autoBlockRehearsals: true });

      const rij = db
        .prepare('SELECT region FROM association_holiday_settings WHERE association_id = ?')
        .get(vereniging.id) as any;
      expect(rij.region).toBe('noord');
    });

    it('weigert een onbekende regio', async () => {
      const antwoord = await als(beheerderToken, 'put', '/settings').send({ region: 'oost' });

      expect(antwoord.status).toBe(400);
    });

    it('weigert een wijziging door een gewoon lid', async () => {
      const antwoord = await als(lidToken, 'put', '/settings').send({ region: 'zuid' });

      expect(antwoord.status).toBe(403);
    });

    it('weigert een wijziging door de muziekcommissie', async () => {
      const antwoord = await als(commissieToken, 'put', '/settings').send({ region: 'zuid' });

      expect(antwoord.status).toBe(403);
    });

    it('raakt de instellingen van een andere vereniging niet aan', async () => {
      zetRegio(andereVereniging.id, 'noord');

      await als(beheerderToken, 'put', '/settings').send({ region: 'zuid' });

      const rij = db
        .prepare('SELECT region FROM association_holiday_settings WHERE association_id = ?')
        .get(andereVereniging.id) as any;
      expect(rij.region).toBe('noord');
    });

    it('wordt niet door de route voor /:id afgevangen', async () => {
      // PUT /settings staat in de router boven PUT /:id. Zou die volgorde
      // omdraaien, dan komt dit verzoek bij de feestdagroute uit en geeft het
      // 404 in plaats van de instellingen bij te werken.
      const antwoord = await als(beheerderToken, 'put', '/settings').send({ region: 'noord' });

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.settings.region).toBe('noord');
    });
  });

  describe('GET /api/holidays/upcoming', () => {
    it('geeft alleen feestdagen die nog moeten komen', async () => {
      maakFeestdag(vereniging.id, { name: 'Al geweest', start: dagen(-30), end: dagen(-29) });
      maakFeestdag(vereniging.id, { name: 'Komt eraan', start: dagen(10), end: dagen(11) });

      const antwoord = await als(lidToken, 'get', '/upcoming?limit=50');

      expect(antwoord.status).toBe(200);
      const namen = antwoord.body.map((h: any) => h.name);
      expect(namen).toContain('Komt eraan');
      expect(namen).not.toContain('Al geweest');
    });

    it('houdt zich aan de gevraagde limiet en sorteert op startdatum', async () => {
      maakFeestdag(vereniging.id, { name: 'Later', start: dagen(20), end: dagen(21) });
      maakFeestdag(vereniging.id, { name: 'Eerder', start: dagen(2), end: dagen(3) });

      const antwoord = await als(lidToken, 'get', '/upcoming?limit=1');

      expect(antwoord.body).toHaveLength(1);
      // De limiet wordt na het sorteren toegepast, dus de eerstvolgende
      // feestdag hoort over te blijven - niet zomaar de eerste uit de lijst.
      expect(antwoord.body[0].startDate <= dagen(3)).toBe(true);
    });

    it('toont de feestdag van een andere vereniging niet', async () => {
      maakFeestdag(andereVereniging.id, { name: 'Feest van B', start: dagen(5), end: dagen(6) });

      const antwoord = await als(beheerderToken, 'get', '/upcoming?limit=50');

      expect(antwoord.body.map((h: any) => h.name)).not.toContain('Feest van B');
    });
  });

  describe('PUT /api/holidays/:id', () => {
    it('werkt een eigen feestdag bij', async () => {
      const id = maakFeestdag(vereniging.id, { name: 'Oude naam' });

      const antwoord = await als(beheerderToken, 'put', `/${id}`).send({
        name: 'Nieuwe naam',
        startDate: '2027-03-01',
        endDate: '2027-03-03',
      });

      expect(antwoord.status).toBe(200);
      const rij = db.prepare('SELECT * FROM school_holidays WHERE id = ?').get(id) as any;
      expect(rij.name).toBe('Nieuwe naam');
      expect(rij.start_date).toBe('2027-03-01');
      // Het jaar wordt afgeleid van de nieuwe startdatum en moet meebewegen,
      // anders staat de feestdag in het verkeerde jaaroverzicht.
      expect(rij.year).toBe(2027);
    });

    it('laat velden die het verzoek niet noemt ongemoeid', async () => {
      const id = maakFeestdag(vereniging.id, { name: 'Verenigingsweekend', start: '2026-03-02', end: '2026-03-04' });

      const antwoord = await als(beheerderToken, 'put', `/${id}`).send({ name: 'Weekend' });

      expect(antwoord.status).toBe(200);
      const rij = db.prepare('SELECT * FROM school_holidays WHERE id = ?').get(id) as any;
      expect(rij.name).toBe('Weekend');
      expect(rij.start_date).toBe('2026-03-02');
      expect(rij.end_date).toBe('2026-03-04');
      expect(rij.year).toBe(2026);
    });

    it('weigert de feestdag van een andere vereniging en laat hem ongewijzigd', async () => {
      const id = maakFeestdag(andereVereniging.id, { name: 'Feest van B' });

      const antwoord = await als(beheerderToken, 'put', `/${id}`).send({ name: 'Gekaapt' });

      expect(antwoord.status).toBe(404);
      const rij = db.prepare('SELECT name FROM school_holidays WHERE id = ?').get(id) as any;
      expect(rij.name).toBe('Feest van B');
    });

    it('geeft 404 voor een onbekend id', async () => {
      const antwoord = await als(beheerderToken, 'put', `/${uuidv4()}`).send({ name: 'Bestaat niet' });

      expect(antwoord.status).toBe(404);
    });

    it('geeft 404 voor een systeemfeestdag', async () => {
      const id = maakFeestdag(vereniging.id, { name: 'Systeemfeestdag', isCustom: false });

      const antwoord = await als(beheerderToken, 'put', `/${id}`).send({ name: 'Aangepast' });

      expect(antwoord.status).toBe(404);
    });

    it('weigert een startdatum na de einddatum', async () => {
      const id = maakFeestdag(vereniging.id);

      const antwoord = await als(beheerderToken, 'put', `/${id}`).send({
        startDate: '2026-05-10',
        endDate: '2026-05-01',
      });

      expect(antwoord.status).toBe(400);
    });

    it('weigert een wijziging door een gewoon lid', async () => {
      const id = maakFeestdag(vereniging.id, { name: 'Verenigingsweekend' });

      const antwoord = await als(lidToken, 'put', `/${id}`).send({ name: 'Gewijzigd' });

      expect(antwoord.status).toBe(403);
      const rij = db.prepare('SELECT name FROM school_holidays WHERE id = ?').get(id) as any;
      expect(rij.name).toBe('Verenigingsweekend');
    });
  });

  describe('DELETE /api/holidays/:id', () => {
    it('verwijdert een eigen aangepaste feestdag', async () => {
      const id = maakFeestdag(vereniging.id);

      const antwoord = await als(beheerderToken, 'delete', `/${id}`);

      expect(antwoord.status).toBe(200);
      expect(db.prepare('SELECT id FROM school_holidays WHERE id = ?').get(id)).toBeUndefined();
    });

    it('weigert de feestdag van een andere vereniging te verwijderen', async () => {
      const id = maakFeestdag(andereVereniging.id, { name: 'Feest van B' });

      const antwoord = await als(beheerderToken, 'delete', `/${id}`);

      expect(antwoord.status).toBe(404);
      expect(db.prepare('SELECT id FROM school_holidays WHERE id = ?').get(id)).toBeDefined();
    });

    it('weigert een systeemfeestdag te verwijderen', async () => {
      const id = maakFeestdag(vereniging.id, { isCustom: false });

      const antwoord = await als(beheerderToken, 'delete', `/${id}`);

      expect(antwoord.status).toBe(404);
      expect(db.prepare('SELECT id FROM school_holidays WHERE id = ?').get(id)).toBeDefined();
    });

    it('geeft 404 voor een onbekend id', async () => {
      const antwoord = await als(beheerderToken, 'delete', `/${uuidv4()}`);

      expect(antwoord.status).toBe(404);
    });

    it('weigert verwijderen door een gewoon lid', async () => {
      const id = maakFeestdag(vereniging.id);

      const antwoord = await als(lidToken, 'delete', `/${id}`);

      expect(antwoord.status).toBe(403);
      expect(db.prepare('SELECT id FROM school_holidays WHERE id = ?').get(id)).toBeDefined();
    });
  });
});
