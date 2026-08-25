/**
 * De koppeling met Spond: instellingen, groepen per orkest, ledenkoppelingen
 * en het overnemen van aan- en afmeldingen.
 *
 * 1.178 regels zonder test, het grootste onbeteste routebestand. Het bleef
 * liggen omdat het met een externe dienst praat - maar dat doet dit bestand
 * niet zelf: alle verzoeken lopen via SpondClient uit services/spond.ts. Die
 * client wordt hier vervangen, en dan is de hele route te testen zonder ooit
 * een echt Spond-account nodig te hebben.
 *
 * Wat deze tests vastleggen:
 *
 * - De verenigingsgrens op elke route. Die zat er al netjes in; deze tests
 *   houden dat zo.
 * - Dat het wachtwoord nooit terugkomt in een antwoord.
 * - Dat een bestaand wachtwoord blijft staan als een beheerder alleen zijn
 *   e-mailadres wijzigt, en dat de gegevens pas worden opgeslagen nadat Spond
 *   ze heeft geaccepteerd.
 * - De drie manieren waarop aanmelden bij Spond kan mislukken, die elk een
 *   ander vervolg hebben: afgewezen (400), onbereikbaar (502), en een
 *   onleesbaar opgeslagen wachtwoord (400 met het verzoek opnieuw in te
 *   stellen). Zonder dat onderscheid komt elke storing binnen als
 *   "wachtwoord fout".
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
    // Het versleutelen blijft echt - anders test je de opslag niet - maar de
    // client praat nergens meer heen.
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
import { SpondLoginError, SpondCredentialsUnreadableError, encryptPassword } from '../../services/spond';
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
import { setModuleEnabled } from '../../modules/service';

const app = express();
app.use(express.json());
app.use('/api/spond', spondRoutes);
app.use(errorHandler);

describe('koppeling met Spond', () => {
  let vereniging: TestAssociation;
  let orkest: TestOrchestra;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;

  let andereVereniging: TestAssociation;
  let anderOrkest: TestOrchestra;
  let andereBeheerderToken: string;

  beforeEach(() => {
    vi.clearAllMocks();
    aanmelden.mockResolvedValue(undefined);
    haalGroepen.mockResolvedValue([]);
    haalEvenementen.mockResolvedValue([]);
    wijzigAntwoord.mockResolvedValue(undefined);

    const omgeving = createTestEnvironment();

    // De Spond-koppeling is sinds 24-08-2026 een module, en die staat standaard

    // uit. Zonder deze regel antwoorden de routes hieronder met 404 - terecht,

    // maar dat is niet wat dit bestand onderzoekt.

    setModuleEnabled(omgeving.association.id, 'spond', true, omgeving.adminUser.id);
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    orkest = createTestOrchestra(vereniging.id, { name: 'Harmonieorkest' });

    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
    anderOrkest = createTestOrchestra(andereVereniging.id, { name: 'Fanfare Elders' });
    const andereBeheerder = createTestUser(andereVereniging.id, { email: 'beheer@elders.nl', role: 'admin' });
    andereBeheerderToken = generateTestToken(andereBeheerder);
  });

  function zetKoppeling(associationId: string, gebruikersnaam: string, wachtwoord = 'geheim'): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO spond_config (id, association_id, username, password_encrypted, sync_enabled)
       VALUES (?, ?, ?, ?, 1)`,
    ).run(id, associationId, gebruikersnaam, encryptPassword(wachtwoord));
    return id;
  }

  type Methode = 'get' | 'put' | 'post' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/spond${pad}`).set('Authorization', `Bearer ${token}`);

  describe('de instellingen', () => {
    it('meldt dat er niets is ingesteld', async () => {
      const antwoord = await als(beheerderToken, 'get', '/config');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual({ configured: false });
    });

    it('geeft het e-mailadres terug maar nooit het wachtwoord', async () => {
      zetKoppeling(vereniging.id, 'dirigent@vereniging.nl', 'zeer-geheim');

      const antwoord = await als(beheerderToken, 'get', '/config');
      expect(antwoord.body.configured).toBe(true);
      expect(antwoord.body.username).toBe('dirigent@vereniging.nl');
      expect(JSON.stringify(antwoord.body)).not.toContain('zeer-geheim');
      expect(JSON.stringify(antwoord.body)).not.toContain('password');
    });

    it('geeft de instellingen van een andere vereniging niet', async () => {
      zetKoppeling(andereVereniging.id, 'elders@test.nl');
      const antwoord = await als(beheerderToken, 'get', '/config');
      expect(antwoord.body.configured).toBe(false);
    });

    it('is niet voor een gewoon lid', async () => {
      expect((await als(lidToken, 'get', '/config')).status).toBe(403);
    });

    it('weigert een verzoek zonder token', async () => {
      expect((await request(app).get('/api/spond/config')).status).toBe(401);
    });
  });

  describe('de koppeling instellen', () => {
    const instellen = (token: string, body: Record<string, unknown>) => als(token, 'put', '/config').send(body);

    it('controleert de gegevens bij Spond voordat ze worden opgeslagen', async () => {
      const antwoord = await instellen(beheerderToken, {
        username: 'dirigent@vereniging.nl',
        password: 'geheim',
      });

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(aanmelden).toHaveBeenCalledTimes(1);
    });

    it('slaat niets op als Spond de gegevens afwijst', async () => {
      aanmelden.mockRejectedValue(new SpondLoginError('afgewezen', 'rejected', 401));

      const antwoord = await instellen(beheerderToken, {
        username: 'dirigent@vereniging.nl',
        password: 'fout',
      });

      expect(antwoord.status).toBe(400);
      const rijen = db.prepare('SELECT COUNT(*) as aantal FROM spond_config').get() as { aantal: number };
      expect(rijen.aantal).toBe(0);
    });

    it('meldt een onbereikbare dienst als iets tijdelijks, niet als een fout wachtwoord', async () => {
      aanmelden.mockRejectedValue(new SpondLoginError('geen verbinding', 'unreachable'));

      const antwoord = await instellen(beheerderToken, {
        username: 'dirigent@vereniging.nl',
        password: 'geheim',
      });

      expect(antwoord.status).toBe(502);
      expect(antwoord.body.error).toContain('niet bereikbaar');
    });

    it('vraagt om een e-mailadres', async () => {
      expect((await instellen(beheerderToken, { password: 'geheim' })).status).toBe(400);
    });

    it('vraagt om een wachtwoord als er nog niets is ingesteld', async () => {
      expect((await instellen(beheerderToken, { username: 'dirigent@vereniging.nl' })).status).toBe(400);
    });

    it('laat het wachtwoord weg zolang het om hetzelfde account gaat', async () => {
      // Wie alleen een andere groep kiest hoeft zijn wachtwoord niet opnieuw
      // te typen - het bewerkscherm maakt dat veld leeg, en dan kon dat scherm
      // zichzelf niet opslaan.
      zetKoppeling(vereniging.id, 'dirigent@vereniging.nl', 'blijft-staan');
      const voor = db
        .prepare('SELECT password_encrypted FROM spond_config WHERE association_id = ?')
        .get(vereniging.id) as { password_encrypted: string };

      const antwoord = await instellen(beheerderToken, {
        username: 'dirigent@vereniging.nl',
        groupId: 'groep-2',
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const na = db
        .prepare('SELECT group_id, password_encrypted FROM spond_config WHERE association_id = ?')
        .get(vereniging.id) as { group_id: string; password_encrypted: string };
      expect(na.group_id).toBe('groep-2');
      expect(na.password_encrypted).toBe(voor.password_encrypted);
    });

    it('vraagt wel om een wachtwoord bij een ander e-mailadres', async () => {
      // Een ander adres is een ander Spond-account; het oude wachtwoord zegt
      // daar niets over en mag er niet stilzwijgend bij worden gebruikt.
      zetKoppeling(vereniging.id, 'oud@vereniging.nl', 'blijft-staan');

      const antwoord = await instellen(beheerderToken, { username: 'nieuw@vereniging.nl' });
      expect(antwoord.status).toBe(400);

      const na = db.prepare('SELECT username FROM spond_config WHERE association_id = ?').get(vereniging.id) as {
        username: string;
      };
      expect(na.username).toBe('oud@vereniging.nl');
    });

    it('controleert bij hergebruik het opgeslagen wachtwoord, niet een leeg wachtwoord', async () => {
      zetKoppeling(vereniging.id, 'dirigent@vereniging.nl', 'blijft-staan');

      await instellen(beheerderToken, { username: 'dirigent@vereniging.nl', groupId: 'groep-2' });

      // De client krijgt het ontsleutelde wachtwoord mee; zou dat leeg zijn,
      // dan zou Spond het terecht afwijzen zodra hij echt bevraagd wordt.
      expect(aanmelden).toHaveBeenCalledTimes(1);
    });

    it('bewaart het wachtwoord versleuteld, niet als leesbare tekst', async () => {
      await instellen(beheerderToken, { username: 'dirigent@vereniging.nl', password: 'zeer-geheim' });

      const rij = db
        .prepare('SELECT password_encrypted FROM spond_config WHERE association_id = ?')
        .get(vereniging.id) as { password_encrypted: string };
      expect(rij.password_encrypted).not.toContain('zeer-geheim');
    });

    it('is niet voor een gewoon lid', async () => {
      const antwoord = await instellen(lidToken, { username: 'x@y.nl', password: 'geheim' });
      expect(antwoord.status).toBe(403);
    });
  });

  describe('de koppeling weghalen', () => {
    it('verwijdert alleen de eigen koppeling', async () => {
      zetKoppeling(vereniging.id, 'ons@test.nl');
      zetKoppeling(andereVereniging.id, 'hun@test.nl');

      const antwoord = await als(beheerderToken, 'delete', '/config');
      expect(antwoord.status).toBe(200);

      const over = db.prepare('SELECT association_id FROM spond_config').all() as { association_id: string }[];
      expect(over.map((r) => r.association_id)).toEqual([andereVereniging.id]);
    });
  });

  describe('groepen ophalen bij Spond', () => {
    it('vraagt om een ingestelde koppeling', async () => {
      const antwoord = await als(beheerderToken, 'get', '/groups');
      expect(antwoord.status).toBe(400);
    });

    it('geeft de groepen door', async () => {
      zetKoppeling(vereniging.id, 'dirigent@vereniging.nl');
      haalGroepen.mockResolvedValue([{ id: 'groep-1', name: 'Harmonie' }]);

      const antwoord = await als(beheerderToken, 'get', '/groups');
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(JSON.stringify(antwoord.body)).toContain('groep-1');
    });

    it('meldt een onleesbaar opgeslagen wachtwoord als zodanig', async () => {
      // Niet "Spond weigert je gegevens" maar "stel de koppeling opnieuw in":
      // er is niets mis met de gegevens, alleen met de sleutel.
      const id = uuidv4();
      db.prepare(`INSERT INTO spond_config (id, association_id, username, password_encrypted) VALUES (?, ?, ?, ?)`).run(
        id,
        vereniging.id,
        'dirigent@vereniging.nl',
        'onleesbare-rommel',
      );

      const antwoord = await als(beheerderToken, 'get', '/groups');
      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('opnieuw');
    });
  });

  describe('een Spond-groep aan een orkest hangen', () => {
    it('koppelt en ontkoppelt', async () => {
      const koppelen = await als(beheerderToken, 'put', `/orchestra-groups/${orkest.id}`).send({
        spondGroupId: 'groep-1',
        spondGroupName: 'Harmonie',
      });
      expect(koppelen.status, JSON.stringify(koppelen.body)).toBe(200);

      const ontkoppelen = await als(beheerderToken, 'put', `/orchestra-groups/${orkest.id}`).send({});
      expect(ontkoppelen.status).toBe(200);

      const over = db
        .prepare('SELECT COUNT(*) as aantal FROM spond_orchestra_groups WHERE orchestra_id = ?')
        .get(orkest.id) as { aantal: number };
      expect(over.aantal).toBe(0);
    });

    it('werkt een bestaande koppeling bij in plaats van er een tweede te maken', async () => {
      await als(beheerderToken, 'put', `/orchestra-groups/${orkest.id}`).send({ spondGroupId: 'groep-1' });
      await als(beheerderToken, 'put', `/orchestra-groups/${orkest.id}`).send({ spondGroupId: 'groep-2' });

      const rijen = db
        .prepare('SELECT spond_group_id FROM spond_orchestra_groups WHERE orchestra_id = ?')
        .all(orkest.id) as { spond_group_id: string }[];
      expect(rijen).toHaveLength(1);
      expect(rijen[0].spond_group_id).toBe('groep-2');
    });

    it('weigert een orkest van een andere vereniging', async () => {
      const antwoord = await als(beheerderToken, 'put', `/orchestra-groups/${anderOrkest.id}`).send({
        spondGroupId: 'groep-1',
      });
      expect(antwoord.status).toBe(404);
    });

    it('geeft in het overzicht alleen de eigen orkesten', async () => {
      await als(andereBeheerderToken, 'put', `/orchestra-groups/${anderOrkest.id}`).send({ spondGroupId: 'groep-x' });

      const antwoord = await als(beheerderToken, 'get', '/orchestra-groups');
      expect(antwoord.status).toBe(200);
      expect(JSON.stringify(antwoord.body)).not.toContain('groep-x');
    });
  });

  describe('leden koppelen', () => {
    const koppel = (token: string, body: Record<string, unknown>) => als(token, 'post', '/member-links').send(body);

    it('koppelt een Spond-lid aan een gebruiker', async () => {
      const antwoord = await koppel(beheerderToken, {
        spondMemberId: 'spond-1',
        userId: lid.id,
        spondMemberName: 'Jan Jansen',
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
    });

    it('weigert een gebruiker van een andere vereniging', async () => {
      const elders = createTestUser(andereVereniging.id, { email: 'lid@elders.nl' });
      const antwoord = await koppel(beheerderToken, { spondMemberId: 'spond-1', userId: elders.id });
      expect(antwoord.status).toBe(404);
    });

    it('vraagt om beide ids', async () => {
      expect((await koppel(beheerderToken, { spondMemberId: 'spond-1' })).status).toBe(400);
      expect((await koppel(beheerderToken, { userId: lid.id })).status).toBe(400);
    });

    it('verlegt een bestaande koppeling in plaats van er een tweede te maken', async () => {
      await koppel(beheerderToken, { spondMemberId: 'spond-1', userId: lid.id });
      await koppel(beheerderToken, { spondMemberId: 'spond-1', userId: beheerder.id });

      const rijen = db
        .prepare('SELECT user_id FROM spond_member_links WHERE association_id = ? AND spond_member_id = ?')
        .all(vereniging.id, 'spond-1') as { user_id: string }[];
      expect(rijen).toHaveLength(1);
      expect(rijen[0].user_id).toBe(beheerder.id);
    });

    it('verwijdert geen koppeling van een andere vereniging', async () => {
      const id = uuidv4();
      db.prepare(
        `INSERT INTO spond_member_links (id, association_id, spond_member_id, user_id) VALUES (?, ?, ?, ?)`,
      ).run(id, andereVereniging.id, 'spond-elders', createTestUser(andereVereniging.id, { email: 'x@elders.nl' }).id);

      await als(beheerderToken, 'delete', `/member-links/${id}`);

      const nog = db.prepare('SELECT COUNT(*) as aantal FROM spond_member_links WHERE id = ?').get(id) as {
        aantal: number;
      };
      expect(nog.aantal).toBe(1);
    });

    it('toont in het overzicht alleen de eigen koppelingen', async () => {
      await koppel(beheerderToken, { spondMemberId: 'spond-1', userId: lid.id, spondMemberName: 'Van ons' });
      db.prepare(
        `INSERT INTO spond_member_links (id, association_id, spond_member_id, user_id, spond_member_name)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        uuidv4(),
        andereVereniging.id,
        'spond-elders',
        createTestUser(andereVereniging.id, { email: 'y@elders.nl' }).id,
        'Van elders',
      );

      const antwoord = await als(beheerderToken, 'get', '/member-links');
      expect(JSON.stringify(antwoord.body)).toContain('Van ons');
      expect(JSON.stringify(antwoord.body)).not.toContain('Van elders');
    });

    it('is niet voor een gewoon lid', async () => {
      expect((await koppel(lidToken, { spondMemberId: 'spond-1', userId: lid.id })).status).toBe(403);
    });
  });
});
