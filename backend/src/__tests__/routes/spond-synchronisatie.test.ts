/**
 * Het synchroniseren van aanwezigheid met Spond.
 *
 * spond.test.ts dekt de instellingen, de groepen en de ledenkoppelingen af.
 * Wat daar bewust buiten bleef is het grootste en gevoeligste deel van het
 * bestand: de vier routes die aanwezigheid heen en weer schuiven tussen Tutti
 * en Spond. Samen zijn dat ruim zevenhonderd regels waar geen enkele test
 * langskwam.
 *
 * Net als daar wordt SpondClient vervangen; er gaat geen enkel verzoek de deur
 * uit en er is nergens een echt Spond-account voor nodig. Het versleutelen van
 * het wachtwoord blijft wel echt, zodat het pad "opgeslagen wachtwoord lezen"
 * meegetest wordt.
 *
 * De nadruk ligt op wat er misgaat, want daar zit de schade:
 *
 * - Spond wijst de aanmelding af, is onbereikbaar, of geeft een onverwacht
 *   antwoord. Elk daarvan hoort een ander vervolg te krijgen; komen ze alle
 *   drie binnen als "wachtwoord fout", dan blijft iemand met kloppende
 *   gegevens zijn wachtwoord opnieuw typen.
 * - Spond begrenst het verkeer (429) of ligt eruit (500). Dat is geen lege
 *   agenda, en mag niet als geslaagde synchronisatie worden gemeld. Zie de
 *   uitgebreide toelichting bij die test - daar zat een echte fout.
 * - Een onleesbaar opgeslagen wachtwoord.
 * - De verenigingsgrens op alle vier de routes.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const aanmelden = vi.fn();
const haalGroepen = vi.fn();
const haalEvenementen = vi.fn();
const wijzigAntwoord = vi.fn();

vi.mock('../../services/spond', async (importOriginal) => {
  const echt = await importOriginal<typeof import('../../services/spond')>();
  return {
    ...echt,
    // Alleen de client wordt vervangen. encryptPassword/decryptPassword
    // blijven echt, anders test je de opslag van het wachtwoord niet.
    SpondClient: class {
      constructor(
        public gebruikersnaam: string,
        public wachtwoord: string,
      ) {}
      login = aanmelden;
      getGroups = haalGroepen;
      getEvents = haalEvenementen;
      changeResponse = wijzigAntwoord;
    },
  };
});

import '../setup';
import db from '../../database/connection';
import spondRoutes from '../../routes/spond';
import { errorHandler } from '../../middleware/errorHandler';
import { SpondLoginError, encryptPassword, SpondEvent, SpondResponse } from '../../services/spond';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestOrchestra,
  createTestRehearsal,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestOrchestra,
  TestUser,
  TestRehearsal,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/spond', spondRoutes);
app.use(errorHandler);

/** Een datum een aantal dagen vanaf vandaag, als YYYY-MM-DD. */
function overDagen(dagen: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dagen);
  return d.toISOString().split('T')[0];
}

function antwoord(overschrijf: Partial<SpondResponse> = {}): SpondResponse {
  return {
    id: overschrijf.id || 'spond-lid-1',
    firstName: overschrijf.firstName ?? 'Jan',
    lastName: overschrijf.lastName ?? 'Jansen',
    email: overschrijf.email,
    status: overschrijf.status || 'accepted',
  };
}

function evenement(datum: string, overschrijf: Partial<SpondEvent> = {}): SpondEvent {
  return {
    id: overschrijf.id || 'event-1',
    heading: overschrijf.heading || 'Repetitie',
    startTimestamp: overschrijf.startTimestamp || `${datum}T19:30:00Z`,
    endTimestamp: overschrijf.endTimestamp || `${datum}T21:30:00Z`,
    cancelled: overschrijf.cancelled ?? false,
    responses: overschrijf.responses || [antwoord()],
  };
}

describe('aanwezigheid synchroniseren met Spond', () => {
  let vereniging: TestAssociation;
  let orkest: TestOrchestra;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;

  let andereVereniging: TestAssociation;
  let andereBeheerderToken: string;

  beforeEach(() => {
    vi.clearAllMocks();
    aanmelden.mockResolvedValue(undefined);
    haalGroepen.mockResolvedValue([]);
    haalEvenementen.mockResolvedValue([]);
    wijzigAntwoord.mockResolvedValue(undefined);

    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    orkest = createTestOrchestra(vereniging.id, { name: 'Harmonieorkest' });

    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
    const andereBeheerder = createTestUser(andereVereniging.id, { email: 'beheer@elders.nl', role: 'admin' });
    andereBeheerderToken = generateTestToken(andereBeheerder);
  });

  type Methode = 'get' | 'put' | 'post' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/spond${pad}`).set('Authorization', `Bearer ${token}`);

  function zetKoppeling(
    associationId: string,
    opties: { groupId?: string | null; wachtwoord?: string; onleesbaar?: boolean } = {},
  ): void {
    db.prepare(
      `INSERT INTO spond_config (id, association_id, username, password_encrypted, group_id, sync_enabled)
       VALUES (?, ?, ?, ?, ?, 1)`,
    ).run(
      uuidv4(),
      associationId,
      'dirigent@vereniging.nl',
      opties.onleesbaar ? 'onleesbare-rommel' : encryptPassword(opties.wachtwoord || 'geheim'),
      opties.groupId === undefined ? 'groep-1' : opties.groupId,
    );
  }

  function maakRepetitie(overschrijf: Partial<TestRehearsal> = {}): TestRehearsal {
    return createTestRehearsal(vereniging.id, beheerder.id, {
      date: overDagen(7),
      startTime: '19:30',
      endTime: '21:30',
      ...overschrijf,
    });
  }

  const aanwezigheidVan = (repetitieId: string) =>
    db
      .prepare('SELECT user_id, spond_member_id, member_name, status FROM rehearsal_attendance WHERE rehearsal_id = ?')
      .all(repetitieId) as { user_id: string | null; spond_member_id: string; member_name: string; status: string }[];

  const eventVan = (repetitieId: string) =>
    (db.prepare('SELECT spond_event_id FROM rehearsals WHERE id = ?').get(repetitieId) as { spond_event_id: string })
      .spond_event_id;

  // ================================================================
  // POST /spond/sync
  // ================================================================
  describe('alle repetities synchroniseren', () => {
    it('vraagt eerst om een ingestelde koppeling', async () => {
      const res = await als(beheerderToken, 'post', '/sync');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('niet geconfigureerd');
    });

    it('meldt een onleesbaar opgeslagen wachtwoord als "opnieuw instellen"', async () => {
      // Er is niets mis met de gegevens zelf, alleen met de sleutel waarmee ze
      // zijn opgeslagen. "Spond weigert je wachtwoord" stuurt de beheerder dan
      // de verkeerde kant op.
      zetKoppeling(vereniging.id, { onleesbaar: true });

      const res = await als(beheerderToken, 'post', '/sync');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('opnieuw');
      expect(haalEvenementen).not.toHaveBeenCalled();
    });

    it('vraagt om minstens één Spond-groep', async () => {
      zetKoppeling(vereniging.id, { groupId: null });

      const res = await als(beheerderToken, 'post', '/sync');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Geen Spond-groepen');
    });

    it('stopt met een duidelijke melding als Spond de aanmelding afwijst', async () => {
      // Zonder dit onderscheid vulde de lus stilletjes lege lijsten en meldde
      // de synchronisatie dat er nul repetities waren - wat eruitziet als een
      // lege agenda in plaats van een mislukte aanmelding.
      maakRepetitie();
      zetKoppeling(vereniging.id);
      haalEvenementen.mockRejectedValue(new SpondLoginError('afgewezen', 'rejected', 401));

      const res = await als(beheerderToken, 'post', '/sync');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('af');
    });

    it('meldt een onbereikbare dienst als iets tijdelijks (502)', async () => {
      maakRepetitie();
      zetKoppeling(vereniging.id);
      haalEvenementen.mockRejectedValue(new SpondLoginError('geen verbinding', 'unreachable'));

      const res = await als(beheerderToken, 'post', '/sync');
      expect(res.status).toBe(502);
      expect(res.body.error).toContain('niet bereikbaar');
    });

    it('geeft bij een onverwacht antwoord de reden mee in plaats van "wachtwoord fout"', async () => {
      maakRepetitie();
      zetKoppeling(vereniging.id);
      haalEvenementen.mockRejectedValue(new SpondLoginError('geen aanmeldtoken ontvangen', 'unexpected'));

      const res = await als(beheerderToken, 'post', '/sync');
      expect(res.status).toBe(502);
      expect(res.body.error).toContain('geen aanmeldtoken ontvangen');
    });

    /**
     * BEWIJS. Draai deze twee tests op de oude routes/spond.ts (kopie in de
     * scratchpad, `git checkout HEAD -- src/routes/spond.ts`, testen, kopie
     * terugzetten) en ze zijn allebei rood:
     *
     *   verwacht 502, ontvangen 200
     *   verwacht 'event-1', ontvangen null
     *
     * Wat er misging: `getEvents` gooit bij een 429 of een 500 van Spond geen
     * SpondLoginError maar een gewone Error ("Spond API error: 429"). Die werd
     * gelogd als waarschuwing, waarna de groep een lege lijst kreeg. Direct
     * daarna wist de route álle spond_event_id's in het venster van drie
     * maanden leeg om schoon opnieuw te kunnen koppelen - en met nul events
     * werd er niets teruggekoppeld.
     *
     * De schade zit niet in die ene mislukte synchronisatie maar in wat er
     * daarna niet meer werkt: PUT /spond/attendance meldt een aan- of afmelding
     * alleen door aan Spond als de repetitie een spond_event_id heeft. Na een
     * enkele synchronisatie tijdens een storing was die voor iedereen weg, en
     * meldde de app nog wel "Je bent aangemeld" terwijl er in Spond niets
     * veranderde. Tot iemand toevallig opnieuw synchroniseerde.
     *
     * En het werd als succes gemeld: 200 met "0 repetities gesynchroniseerd",
     * dus niets in de app wees erop dat er iets mis was.
     */
    it('meldt een storing bij Spond niet als geslaagde synchronisatie', async () => {
      maakRepetitie();
      zetKoppeling(vereniging.id);
      haalEvenementen.mockRejectedValue(new Error('Spond API error: 429'));

      const res = await als(beheerderToken, 'post', '/sync');
      expect(res.status).toBe(502);
      expect(res.body.error).toBeTruthy();
    });

    it('houdt de bestaande koppelingen heel als geen enkele groep bereikbaar is', async () => {
      const repetitie = maakRepetitie();
      db.prepare('UPDATE rehearsals SET spond_event_id = ? WHERE id = ?').run('event-1', repetitie.id);
      zetKoppeling(vereniging.id);
      haalEvenementen.mockRejectedValue(new Error('Spond API error: 500'));

      await als(beheerderToken, 'post', '/sync');

      expect(eventVan(repetitie.id)).toBe('event-1');
    });

    it('gaat door als één van meerdere groepen faalt', async () => {
      // Eén onbereikbare groep is geen reden om de rest te laten staan; alleen
      // als er niets meer over is heeft doorgaan geen zin.
      const repetitie = maakRepetitie();
      zetKoppeling(vereniging.id);
      db.prepare(
        'INSERT INTO spond_orchestra_groups (id, orchestra_id, spond_group_id) VALUES (?, ?, ?)',
      ).run(uuidv4(), orkest.id, 'groep-orkest');
      haalEvenementen.mockImplementation(async (groepId: string) => {
        if (groepId === 'groep-orkest') throw new Error('Spond API error: 429');
        return [evenement(repetitie.date)];
      });

      const res = await als(beheerderToken, 'post', '/sync');
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.synced).toBe(1);
    });

    it('gaat goed om met een leeg antwoord van Spond', async () => {
      maakRepetitie();
      zetKoppeling(vereniging.id);
      haalEvenementen.mockResolvedValue([]);

      const res = await als(beheerderToken, 'post', '/sync');
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.synced).toBe(0);
      expect(res.body.total).toBe(1);
    });

    it('koppelt het event en neemt de aanwezigheid over', async () => {
      const repetitie = maakRepetitie();
      zetKoppeling(vereniging.id);
      haalEvenementen.mockResolvedValue([
        evenement(repetitie.date, {
          responses: [
            antwoord({ id: 'spond-a', firstName: 'Anna', lastName: 'Bakker', status: 'accepted' }),
            antwoord({ id: 'spond-b', firstName: 'Bert', lastName: 'Klaassen', status: 'declined' }),
          ],
        }),
      ]);

      const res = await als(beheerderToken, 'post', '/sync');
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.synced).toBe(1);

      expect(eventVan(repetitie.id)).toBe('event-1');
      const rijen = aanwezigheidVan(repetitie.id);
      expect(rijen).toHaveLength(2);
      expect(rijen.map((r) => r.status).sort()).toEqual(['accepted', 'declined']);
    });

    it('zet "unanswered" om naar "unknown"', async () => {
      // De statuslijst van Spond en die van Tutti lopen niet gelijk; blijft
      // "unanswered" staan, dan valt die rij overal buiten de telling.
      const repetitie = maakRepetitie();
      zetKoppeling(vereniging.id);
      haalEvenementen.mockResolvedValue([
        evenement(repetitie.date, { responses: [antwoord({ status: 'unanswered' })] }),
      ]);

      await als(beheerderToken, 'post', '/sync');
      expect(aanwezigheidVan(repetitie.id)[0].status).toBe('unknown');
    });

    it('gebruikt een lid zonder naam niet als lege rij', async () => {
      const repetitie = maakRepetitie();
      zetKoppeling(vereniging.id);
      haalEvenementen.mockResolvedValue([
        evenement(repetitie.date, {
          responses: [{ id: 'spond-x', firstName: '', lastName: '', status: 'accepted' }],
        }),
      ]);

      await als(beheerderToken, 'post', '/sync');
      expect(aanwezigheidVan(repetitie.id)[0].member_name).toBe('Onbekend');
    });

    it('kiest bij meerdere events op dezelfde dag het event met de dichtstbijzijnde starttijd', async () => {
      const datum = overDagen(7);
      const repetitie = maakRepetitie({ date: datum, startTime: '20:00' });
      zetKoppeling(vereniging.id);
      haalEvenementen.mockResolvedValue([
        evenement(datum, { id: 'ochtend', startTimestamp: `${datum}T09:00:00Z` }),
        evenement(datum, { id: 'avond', startTimestamp: `${datum}T19:45:00Z` }),
      ]);

      await als(beheerderToken, 'post', '/sync');
      expect(eventVan(repetitie.id)).toBe('avond');
    });

    it('gebruikt een Spond-event maar één keer', async () => {
      // Twee repetities op dezelfde dag mogen niet allebei aan hetzelfde event
      // hangen; dan telt dezelfde opkomst dubbel.
      const datum = overDagen(7);
      const eerste = maakRepetitie({ date: datum, startTime: '19:00' });
      const tweede = maakRepetitie({ date: datum, startTime: '21:00' });
      zetKoppeling(vereniging.id);
      haalEvenementen.mockResolvedValue([evenement(datum, { id: 'enig-event' })]);

      await als(beheerderToken, 'post', '/sync');

      const gekoppeld = [eventVan(eerste.id), eventVan(tweede.id)].filter(Boolean);
      expect(gekoppeld).toEqual(['enig-event']);
    });

    it('koppelt een Spond-lid automatisch aan een gebruiker op e-mailadres', async () => {
      const repetitie = maakRepetitie();
      zetKoppeling(vereniging.id);
      const anna = createTestUser(vereniging.id, { email: 'anna@vereniging.nl', firstName: 'A', lastName: 'B' });
      haalEvenementen.mockResolvedValue([
        evenement(repetitie.date, {
          // Andere schrijfwijze dan in de database: het vergelijken hoort
          // hoofdletterongevoelig te gaan.
          responses: [antwoord({ id: 'spond-anna', email: 'Anna@Vereniging.NL' })],
        }),
      ]);

      const res = await als(beheerderToken, 'post', '/sync');
      expect(res.body.newLinks).toBe(1);
      expect(aanwezigheidVan(repetitie.id)[0].user_id).toBe(anna.id);

      const koppeling = db
        .prepare('SELECT user_id FROM spond_member_links WHERE association_id = ? AND spond_member_id = ?')
        .get(vereniging.id, 'spond-anna') as { user_id: string };
      expect(koppeling.user_id).toBe(anna.id);
    });

    it('koppelt op naam als er geen e-mailadres is', async () => {
      const repetitie = maakRepetitie();
      zetKoppeling(vereniging.id);
      const kees = createTestUser(vereniging.id, {
        email: 'kees@vereniging.nl',
        firstName: 'Kees',
        lastName: 'de Vries',
      });
      haalEvenementen.mockResolvedValue([
        evenement(repetitie.date, {
          responses: [antwoord({ id: 'spond-kees', firstName: 'kees', lastName: 'DE VRIES' })],
        }),
      ]);

      await als(beheerderToken, 'post', '/sync');
      expect(aanwezigheidVan(repetitie.id)[0].user_id).toBe(kees.id);
    });

    it('koppelt een pas aangemeld lid via de wachtlijst en ruimt die rij op', async () => {
      // pending_spond_links is wat onboarding achterlaat: dit lid bestaat wel
      // in Tutti maar was nog nooit in een Spond-antwoord gezien. Blijft de rij
      // staan, dan blijft de app vragen om een koppeling die er al is.
      const repetitie = maakRepetitie();
      zetKoppeling(vereniging.id);
      const nieuw = createTestUser(vereniging.id, { email: 'nieuw@vereniging.nl', status: 'inactive' } as never);
      db.prepare(
        'INSERT INTO pending_spond_links (id, user_id, association_id, expected_email) VALUES (?, ?, ?, ?)',
      ).run(uuidv4(), nieuw.id, vereniging.id, 'privé@gmail.com');
      haalEvenementen.mockResolvedValue([
        evenement(repetitie.date, { responses: [antwoord({ id: 'spond-n', email: 'privé@gmail.com' })] }),
      ]);

      const res = await als(beheerderToken, 'post', '/sync');
      expect(res.body.newLinks).toBe(1);

      const over = db.prepare('SELECT COUNT(*) as aantal FROM pending_spond_links WHERE user_id = ?').get(nieuw.id) as {
        aantal: number;
      };
      expect(over.aantal).toBe(0);
    });

    it('gebruikt de groep van het orkest boven de algemene groep', async () => {
      const repetitie = maakRepetitie({ orchestraId: orkest.id });
      zetKoppeling(vereniging.id);
      db.prepare(
        'INSERT INTO spond_orchestra_groups (id, orchestra_id, spond_group_id) VALUES (?, ?, ?)',
      ).run(uuidv4(), orkest.id, 'groep-orkest');
      haalEvenementen.mockImplementation(async (groepId: string) =>
        groepId === 'groep-orkest' ? [evenement(repetitie.date, { id: 'uit-orkestgroep' })] : [],
      );

      await als(beheerderToken, 'post', '/sync');
      expect(eventVan(repetitie.id)).toBe('uit-orkestgroep');
    });

    it('slaat een orkest zonder groep over in plaats van te struikelen', async () => {
      // Geen algemene groep, wel een groep voor één orkest: de repetities van
      // het andere orkest hebben nergens een tegenhanger en horen gewoon te
      // worden overgeslagen.
      const tweedeOrkest = createTestOrchestra(vereniging.id, { name: 'Slagwerkgroep' });
      const metGroep = maakRepetitie({ orchestraId: orkest.id });
      const zonderGroep = maakRepetitie({ orchestraId: tweedeOrkest.id });
      zetKoppeling(vereniging.id, { groupId: null });
      db.prepare(
        'INSERT INTO spond_orchestra_groups (id, orchestra_id, spond_group_id) VALUES (?, ?, ?)',
      ).run(uuidv4(), orkest.id, 'groep-orkest');
      haalEvenementen.mockResolvedValue([evenement(metGroep.date)]);

      const res = await als(beheerderToken, 'post', '/sync');
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.synced).toBe(1);
      expect(eventVan(zonderGroep.id)).toBeNull();
    });

    it('laat repetities uit het verleden en afgelaste repetities met rust', async () => {
      const verleden = maakRepetitie({ date: overDagen(-30) });
      const afgelast = maakRepetitie({ type: 'cancelled' });
      zetKoppeling(vereniging.id);
      haalEvenementen.mockResolvedValue([
        evenement(verleden.date, { id: 'oud' }),
        evenement(afgelast.date, { id: 'afgelast' }),
      ]);

      const res = await als(beheerderToken, 'post', '/sync');
      expect(res.body.total).toBe(0);
      expect(eventVan(verleden.id)).toBeNull();
      expect(eventVan(afgelast.id)).toBeNull();
    });

    it('raakt de repetities van een andere vereniging niet aan', async () => {
      const eigen = maakRepetitie();
      const andereBeheerder = db
        .prepare('SELECT id FROM users WHERE association_id = ?')
        .get(andereVereniging.id) as { id: string };
      const elders = createTestRehearsal(andereVereniging.id, andereBeheerder.id, { date: eigen.date });
      zetKoppeling(vereniging.id);
      haalEvenementen.mockResolvedValue([evenement(eigen.date)]);

      await als(beheerderToken, 'post', '/sync');

      expect(eventVan(eigen.id)).toBe('event-1');
      expect(eventVan(elders.id)).toBeNull();
    });

    it('werkt het tijdstip van de laatste synchronisatie bij', async () => {
      zetKoppeling(vereniging.id);
      await als(beheerderToken, 'post', '/sync');

      const rij = db.prepare('SELECT last_sync FROM spond_config WHERE association_id = ?').get(vereniging.id) as {
        last_sync: string | null;
      };
      expect(rij.last_sync).toBeTruthy();
    });

    it('is niet voor een gewoon lid', async () => {
      expect((await als(lidToken, 'post', '/sync')).status).toBe(403);
    });

    it('weigert een verzoek zonder token', async () => {
      expect((await request(app).post('/api/spond/sync')).status).toBe(401);
    });
  });

  // ================================================================
  // POST /spond/sync/:rehearsalId
  // ================================================================
  describe('één repetitie synchroniseren', () => {
    it('meldt een onbekende repetitie als niet gevonden', async () => {
      zetKoppeling(vereniging.id);
      expect((await als(beheerderToken, 'post', `/sync/${uuidv4()}`)).status).toBe(404);
    });

    it('geeft geen toegang tot de repetitie van een andere vereniging', async () => {
      // Nadrukkelijk 404 en niet 403: een beheerder van elders hoort niet te
      // kunnen afleiden dát deze repetitie bestaat.
      const repetitie = maakRepetitie();
      zetKoppeling(andereVereniging.id);

      const res = await als(andereBeheerderToken, 'post', `/sync/${repetitie.id}`);
      expect(res.status).toBe(404);
    });

    it('vraagt om een ingestelde koppeling', async () => {
      const repetitie = maakRepetitie();
      const res = await als(beheerderToken, 'post', `/sync/${repetitie.id}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('niet geconfigureerd');
    });

    it('meldt dat er geen groep is voor dit orkest', async () => {
      const repetitie = maakRepetitie({ orchestraId: orkest.id });
      zetKoppeling(vereniging.id, { groupId: null });

      const res = await als(beheerderToken, 'post', `/sync/${repetitie.id}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Geen Spond-groep');
    });

    it('meldt een onleesbaar opgeslagen wachtwoord als "opnieuw instellen"', async () => {
      const repetitie = maakRepetitie();
      zetKoppeling(vereniging.id, { onleesbaar: true });

      const res = await als(beheerderToken, 'post', `/sync/${repetitie.id}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('opnieuw');
    });

    it('meldt een onbereikbare dienst als 502', async () => {
      const repetitie = maakRepetitie();
      zetKoppeling(vereniging.id);
      haalEvenementen.mockRejectedValue(new SpondLoginError('geen verbinding', 'unreachable'));

      const res = await als(beheerderToken, 'post', `/sync/${repetitie.id}`);
      expect(res.status).toBe(502);
    });

    it('meldt afgewezen gegevens als 400 en niet als lege agenda', async () => {
      const repetitie = maakRepetitie();
      zetKoppeling(vereniging.id);
      haalEvenementen.mockRejectedValue(new SpondLoginError('afgewezen', 'rejected', 401));

      const res = await als(beheerderToken, 'post', `/sync/${repetitie.id}`);
      expect(res.status).toBe(400);
    });

    it('meldt dat er geen passend event is bij een leeg antwoord', async () => {
      const repetitie = maakRepetitie();
      zetKoppeling(vereniging.id);
      haalEvenementen.mockResolvedValue([]);

      const res = await als(beheerderToken, 'post', `/sync/${repetitie.id}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Spond-event');
    });

    it('neemt de aanwezigheid over en koppelt het event', async () => {
      const repetitie = maakRepetitie();
      zetKoppeling(vereniging.id);
      haalEvenementen.mockResolvedValue([
        evenement(repetitie.date, { responses: [antwoord({ id: 's1' }), antwoord({ id: 's2', firstName: 'Piet' })] }),
      ]);

      const res = await als(beheerderToken, 'post', `/sync/${repetitie.id}`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.attendanceCount).toBe(2);
      expect(eventVan(repetitie.id)).toBe('event-1');
    });

    it('houdt zich aan een al vastgelegd event, ook als er die dag meer zijn', async () => {
      const datum = overDagen(7);
      const repetitie = maakRepetitie({ date: datum });
      db.prepare('UPDATE rehearsals SET spond_event_id = ? WHERE id = ?').run('vastgelegd', repetitie.id);
      zetKoppeling(vereniging.id);
      haalEvenementen.mockResolvedValue([
        evenement(datum, { id: 'anders', startTimestamp: `${datum}T19:30:00Z` }),
        evenement(datum, { id: 'vastgelegd', startTimestamp: `${datum}T09:00:00Z` }),
      ]);

      await als(beheerderToken, 'post', `/sync/${repetitie.id}`);
      expect(eventVan(repetitie.id)).toBe('vastgelegd');
    });

    it('kiest bij meerdere events zonder starttijd gewoon het eerste', async () => {
      // start_time is NOT NULL in het schema, dus een repetitie zonder tijd is
      // in de praktijk een lege tekst. Zonder tijd valt er niets te vergelijken
      // en hoort de route het eerste event te nemen in plaats van niets.
      const datum = overDagen(7);
      const repetitie = maakRepetitie({ date: datum });
      db.prepare("UPDATE rehearsals SET start_time = '' WHERE id = ?").run(repetitie.id);
      zetKoppeling(vereniging.id);
      haalEvenementen.mockResolvedValue([
        evenement(datum, { id: 'eerste' }),
        evenement(datum, { id: 'tweede', startTimestamp: `${datum}T21:00:00Z` }),
      ]);

      const res = await als(beheerderToken, 'post', `/sync/${repetitie.id}`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(eventVan(repetitie.id)).toBe('eerste');
    });

    it('vervangt de oude aanwezigheid in plaats van er rijen bij te zetten', async () => {
      const repetitie = maakRepetitie();
      db.prepare(
        'INSERT INTO rehearsal_attendance (id, rehearsal_id, spond_member_id, member_name, status) VALUES (?, ?, ?, ?, ?)',
      ).run(uuidv4(), repetitie.id, 'oud-lid', 'Oud Lid', 'accepted');
      zetKoppeling(vereniging.id);
      haalEvenementen.mockResolvedValue([evenement(repetitie.date, { responses: [antwoord({ id: 'nieuw-lid' })] })]);

      await als(beheerderToken, 'post', `/sync/${repetitie.id}`);

      const rijen = aanwezigheidVan(repetitie.id);
      expect(rijen).toHaveLength(1);
      expect(rijen[0].spond_member_id).toBe('nieuw-lid');
    });

    it('respecteert een bestaande handmatige ledenkoppeling boven de naam', async () => {
      const repetitie = maakRepetitie();
      zetKoppeling(vereniging.id);
      db.prepare(
        'INSERT INTO spond_member_links (id, association_id, spond_member_id, user_id) VALUES (?, ?, ?, ?)',
      ).run(uuidv4(), vereniging.id, 'spond-handmatig', lid.id);
      haalEvenementen.mockResolvedValue([
        evenement(repetitie.date, {
          responses: [antwoord({ id: 'spond-handmatig', firstName: 'Heel', lastName: 'Anders' })],
        }),
      ]);

      const res = await als(beheerderToken, 'post', `/sync/${repetitie.id}`);
      expect(res.body.newLinks).toBe(0);
      expect(aanwezigheidVan(repetitie.id)[0].user_id).toBe(lid.id);
    });

    it('kiest ook hier het event met de dichtstbijzijnde starttijd', async () => {
      // Deze route heeft een eigen kopie van de matchingregels; wijkt die af
      // van de bulksynchronisatie, dan hangt dezelfde repetitie aan een ander
      // Spond-event al naar gelang welke knop iemand indrukt.
      const datum = overDagen(7);
      const repetitie = maakRepetitie({ date: datum, startTime: '20:00' });
      zetKoppeling(vereniging.id);
      haalEvenementen.mockResolvedValue([
        evenement(datum, { id: 'ochtend', startTimestamp: `${datum}T09:00:00Z` }),
        evenement(datum, { id: 'avond', startTimestamp: `${datum}T19:45:00Z` }),
      ]);

      await als(beheerderToken, 'post', `/sync/${repetitie.id}`);
      expect(eventVan(repetitie.id)).toBe('avond');
    });

    it('koppelt ook hier automatisch op e-mailadres en bewaart die koppeling', async () => {
      const repetitie = maakRepetitie();
      zetKoppeling(vereniging.id);
      const anna = createTestUser(vereniging.id, { email: 'anna@vereniging.nl', firstName: 'A', lastName: 'B' });
      haalEvenementen.mockResolvedValue([
        evenement(repetitie.date, { responses: [antwoord({ id: 'spond-anna', email: 'Anna@Vereniging.NL' })] }),
      ]);

      const res = await als(beheerderToken, 'post', `/sync/${repetitie.id}`);
      expect(res.body.newLinks).toBe(1);
      expect(aanwezigheidVan(repetitie.id)[0].user_id).toBe(anna.id);

      const koppeling = db
        .prepare('SELECT user_id FROM spond_member_links WHERE association_id = ? AND spond_member_id = ?')
        .get(vereniging.id, 'spond-anna') as { user_id: string };
      expect(koppeling.user_id).toBe(anna.id);
    });

    it('koppelt ook hier een lid van de wachtlijst en ruimt die rij op', async () => {
      const repetitie = maakRepetitie();
      zetKoppeling(vereniging.id);
      const nieuw = createTestUser(vereniging.id, { email: 'nieuw@vereniging.nl' });
      db.prepare(
        'INSERT INTO pending_spond_links (id, user_id, association_id, expected_name) VALUES (?, ?, ?, ?)',
      ).run(uuidv4(), nieuw.id, vereniging.id, 'Pietje Puk');
      haalEvenementen.mockResolvedValue([
        evenement(repetitie.date, { responses: [antwoord({ id: 'spond-p', firstName: 'Pietje', lastName: 'Puk' })] }),
      ]);

      const res = await als(beheerderToken, 'post', `/sync/${repetitie.id}`);
      expect(res.body.newLinks).toBe(1);
      expect(aanwezigheidVan(repetitie.id)[0].user_id).toBe(nieuw.id);

      const over = db.prepare('SELECT COUNT(*) as aantal FROM pending_spond_links WHERE user_id = ?').get(nieuw.id) as {
        aantal: number;
      };
      expect(over.aantal).toBe(0);
    });

    it('is niet voor een gewoon lid', async () => {
      const repetitie = maakRepetitie();
      expect((await als(lidToken, 'post', `/sync/${repetitie.id}`)).status).toBe(403);
    });
  });

  // ================================================================
  // PUT /spond/attendance/:rehearsalId
  // ================================================================
  describe('zelf aan- of afmelden', () => {
    const meld = (token: string, repetitieId: string, body: Record<string, unknown>) =>
      als(token, 'put', `/attendance/${repetitieId}`).send(body);

    it('eist een echte ja of nee, geen tekst', async () => {
      const repetitie = maakRepetitie();
      expect((await meld(lidToken, repetitie.id, { accepted: 'ja' })).status).toBe(400);
      expect((await meld(lidToken, repetitie.id, {})).status).toBe(400);
    });

    it('geeft geen toegang tot een repetitie van een andere vereniging', async () => {
      const repetitie = maakRepetitie();
      const res = await meld(andereBeheerderToken, repetitie.id, { accepted: true });
      expect(res.status).toBe(404);
    });

    it('maakt een nieuwe aanwezigheidsrij aan als die er nog niet is', async () => {
      const repetitie = maakRepetitie();

      const res = await meld(lidToken, repetitie.id, { accepted: true });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.status).toBe('accepted');
      expect(res.body.spondSynced).toBe(false);

      const rijen = aanwezigheidVan(repetitie.id);
      expect(rijen).toHaveLength(1);
      expect(rijen[0].user_id).toBe(lid.id);
    });

    it('werkt een bestaande rij bij in plaats van er een tweede te maken', async () => {
      const repetitie = maakRepetitie();
      await meld(lidToken, repetitie.id, { accepted: true });
      const res = await meld(lidToken, repetitie.id, { accepted: false });

      expect(res.body.status).toBe('declined');
      const rijen = aanwezigheidVan(repetitie.id);
      expect(rijen).toHaveLength(1);
      expect(rijen[0].status).toBe('declined');
    });

    it('vindt een uit Spond gehaalde rij terug via de ledenkoppeling', async () => {
      // De rij komt uit Spond en heeft alleen een spond_member_id. Zonder deze
      // tweede zoekwijze kreeg het lid er een eigen tweede rij bij en telde
      // dezelfde persoon dubbel.
      const repetitie = maakRepetitie();
      db.prepare(
        'INSERT INTO spond_member_links (id, association_id, spond_member_id, user_id) VALUES (?, ?, ?, ?)',
      ).run(uuidv4(), vereniging.id, 'spond-lid', lid.id);
      db.prepare(
        'INSERT INTO rehearsal_attendance (id, rehearsal_id, spond_member_id, member_name, status) VALUES (?, ?, ?, ?, ?)',
      ).run(uuidv4(), repetitie.id, 'spond-lid', 'Member User', 'unknown');

      await meld(lidToken, repetitie.id, { accepted: true });

      const rijen = aanwezigheidVan(repetitie.id);
      expect(rijen).toHaveLength(1);
      expect(rijen[0].user_id).toBe(lid.id);
      expect(rijen[0].status).toBe('accepted');
    });

    it('vindt een uit Spond gehaalde rij terug op naam als er geen koppeling is', async () => {
      const repetitie = maakRepetitie();
      db.prepare(
        'INSERT INTO rehearsal_attendance (id, rehearsal_id, spond_member_id, member_name, status) VALUES (?, ?, ?, ?, ?)',
      ).run(uuidv4(), repetitie.id, 'spond-los', 'member user', 'unknown');

      await meld(lidToken, repetitie.id, { accepted: false });

      const rijen = aanwezigheidVan(repetitie.id);
      expect(rijen).toHaveLength(1);
      expect(rijen[0].user_id).toBe(lid.id);
    });

    it('meldt de wijziging door aan Spond als de repetitie aan een event hangt', async () => {
      const repetitie = maakRepetitie();
      db.prepare('UPDATE rehearsals SET spond_event_id = ? WHERE id = ?').run('event-1', repetitie.id);
      zetKoppeling(vereniging.id);
      db.prepare(
        'INSERT INTO spond_member_links (id, association_id, spond_member_id, user_id) VALUES (?, ?, ?, ?)',
      ).run(uuidv4(), vereniging.id, 'spond-lid', lid.id);

      const res = await meld(lidToken, repetitie.id, { accepted: true });
      expect(res.body.spondSynced).toBe(true);
      expect(wijzigAntwoord).toHaveBeenCalledWith('event-1', 'spond-lid', true);
    });

    it('slaat de afmelding lokaal op, ook als Spond de wijziging weigert', async () => {
      // De gebruiker heeft zich afgemeld; dat mag niet verloren gaan omdat
      // Spond op dat moment niet meewerkt. Wel hoort het antwoord eerlijk te
      // zeggen dat het niet is doorgegeven.
      const repetitie = maakRepetitie();
      db.prepare('UPDATE rehearsals SET spond_event_id = ? WHERE id = ?').run('event-1', repetitie.id);
      zetKoppeling(vereniging.id);
      db.prepare(
        'INSERT INTO spond_member_links (id, association_id, spond_member_id, user_id) VALUES (?, ?, ?, ?)',
      ).run(uuidv4(), vereniging.id, 'spond-lid', lid.id);
      wijzigAntwoord.mockRejectedValue(new Error('Spond API error: 429'));

      const res = await meld(lidToken, repetitie.id, { accepted: false });
      expect(res.status).toBe(200);
      expect(res.body.spondSynced).toBe(false);
      expect(aanwezigheidVan(repetitie.id)[0].status).toBe('declined');
    });

    it('meldt niets door als het wachtwoord onleesbaar is, en laat de app doorwerken', async () => {
      const repetitie = maakRepetitie();
      db.prepare('UPDATE rehearsals SET spond_event_id = ? WHERE id = ?').run('event-1', repetitie.id);
      zetKoppeling(vereniging.id, { onleesbaar: true });
      db.prepare(
        'INSERT INTO spond_member_links (id, association_id, spond_member_id, user_id) VALUES (?, ?, ?, ?)',
      ).run(uuidv4(), vereniging.id, 'spond-lid', lid.id);

      const res = await meld(lidToken, repetitie.id, { accepted: true });
      expect(res.status).toBe(200);
      expect(res.body.spondSynced).toBe(false);
    });

    it('weigert een verzoek zonder token', async () => {
      const repetitie = maakRepetitie();
      expect((await request(app).put(`/api/spond/attendance/${repetitie.id}`).send({ accepted: true })).status).toBe(
        401,
      );
    });
  });

  // ================================================================
  // GET /spond/attendance/:rehearsalId/my-status
  // ================================================================
  describe('de eigen status opvragen', () => {
    const status = (token: string, repetitieId: string) =>
      als(token, 'get', `/attendance/${repetitieId}/my-status`);

    it('geeft "unknown" als er nog niets is vastgelegd', async () => {
      const repetitie = maakRepetitie();
      const res = await status(lidToken, repetitie.id);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'unknown', canSyncToSpond: false });
    });

    it('geeft de vastgelegde status terug', async () => {
      const repetitie = maakRepetitie();
      await als(lidToken, 'put', `/attendance/${repetitie.id}`).send({ accepted: true });

      const res = await status(lidToken, repetitie.id);
      expect(res.body.status).toBe('accepted');
    });

    it('vindt de rij ook via de Spond-ledenkoppeling', async () => {
      const repetitie = maakRepetitie();
      db.prepare(
        'INSERT INTO spond_member_links (id, association_id, spond_member_id, user_id) VALUES (?, ?, ?, ?)',
      ).run(uuidv4(), vereniging.id, 'spond-lid', lid.id);
      db.prepare(
        'INSERT INTO rehearsal_attendance (id, rehearsal_id, spond_member_id, member_name, status) VALUES (?, ?, ?, ?, ?)',
      ).run(uuidv4(), repetitie.id, 'spond-lid', 'Iemand Anders', 'declined');

      const res = await status(lidToken, repetitie.id);
      expect(res.body.status).toBe('declined');
    });

    it('vindt de rij ook op naam', async () => {
      const repetitie = maakRepetitie();
      db.prepare(
        'INSERT INTO rehearsal_attendance (id, rehearsal_id, spond_member_id, member_name, status) VALUES (?, ?, ?, ?, ?)',
      ).run(uuidv4(), repetitie.id, 'spond-los', 'MEMBER USER', 'waiting');

      const res = await status(lidToken, repetitie.id);
      expect(res.body.status).toBe('waiting');
    });

    it('meldt dat er naar Spond gemeld kan worden zodra er een event en een lid-id is', async () => {
      const repetitie = maakRepetitie();
      db.prepare('UPDATE rehearsals SET spond_event_id = ? WHERE id = ?').run('event-1', repetitie.id);
      db.prepare(
        'INSERT INTO spond_member_links (id, association_id, spond_member_id, user_id) VALUES (?, ?, ?, ?)',
      ).run(uuidv4(), vereniging.id, 'spond-lid', lid.id);

      const res = await status(lidToken, repetitie.id);
      expect(res.body.canSyncToSpond).toBe(true);
    });

    it('geeft geen toegang tot een repetitie van een andere vereniging', async () => {
      const repetitie = maakRepetitie();
      expect((await status(andereBeheerderToken, repetitie.id)).status).toBe(404);
    });

    it('weigert een verzoek zonder token', async () => {
      const repetitie = maakRepetitie();
      expect((await request(app).get(`/api/spond/attendance/${repetitie.id}/my-status`)).status).toBe(401);
    });
  });
});
