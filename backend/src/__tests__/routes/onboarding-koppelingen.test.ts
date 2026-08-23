/**
 * De koppeltabellen rond in- en uitschrijven: M365-groepen, functietitels en
 * de taken die per lid worden bijgehouden.
 *
 * Dit zijn de instellingen die bepalen wat er bij het aanmaken van een lid
 * naar Microsoft gaat: in welke groep het lid belandt en welke functietitel
 * het account krijgt. Ze staan per vereniging in de database, dus de vraag die
 * hier steeds terugkomt is of vereniging A bij de rijen van B kan.
 *
 * Twee echte fouten gevonden, beide beschreven bij de test die ze aantoont:
 *
 *  1. POST /m365-groups nam het orkest-id rauw uit de aanvraag over. Een
 *     orkest hoort bij een vereniging, dus een beheerder kon een mapping maken
 *     die naar het orkest van een andere vereniging wijst - en GET /m365-groups
 *     gaf de naam van dat orkest daarna gewoon terug.
 *  2. POST /member liet een stukgeslagen `orchestraIds` als 500 bij de
 *     gebruiker landen: de JSON.parse van de aanvraag stond onbeschermd.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import '../setup';
import db from '../../database/connection';
import onboardingRoutes from '../../routes/onboarding';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestInstrument,
  createTestOrchestra,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestInstrument,
  TestOrchestra,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/onboarding', onboardingRoutes);
app.use(errorHandler);

const ONBEKEND = '11111111-1111-1111-1111-111111111111';

describe('de koppeltabellen rond in- en uitschrijven', () => {
  let vereniging: TestAssociation;
  let orkest: TestOrchestra;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;
  let trompet: TestInstrument;

  let andereVereniging: TestAssociation;
  let anderOrkest: TestOrchestra;
  let andereBeheerderToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    orkest = createTestOrchestra(vereniging.id, { name: 'Harmonieorkest' });
    trompet = createTestInstrument({ name: 'Trompet' });

    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
    anderOrkest = createTestOrchestra(andereVereniging.id, { name: 'Fanfare Elders' });
    const andereBeheerder = createTestUser(andereVereniging.id, { email: 'beheer@elders.nl', role: 'admin' });
    andereBeheerderToken = generateTestToken(andereBeheerder);
  });

  type Methode = 'get' | 'post' | 'put' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/onboarding${pad}`).set('Authorization', `Bearer ${token}`);

  // ==========================================================================

  describe('M365-groepen', () => {
    const maak = (token: string, body: Record<string, unknown>) => als(token, 'post', '/m365-groups').send(body);

    it('maakt een mapping voor een orkest van de eigen vereniging', async () => {
      const antwoord = await maak(beheerderToken, { orchestraId: orkest.id, groupName: 'Harmonie', groupType: 'orchestra' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);

      const rij = db
        .prepare('SELECT association_id, orchestra_id, group_name, group_type FROM m365_group_mappings WHERE id = ?')
        .get(antwoord.body.id) as Record<string, string>;
      expect(rij.association_id).toBe(vereniging.id);
      expect(rij.orchestra_id).toBe(orkest.id);
      expect(rij.group_type).toBe('orchestra');
    });

    it('gaat uit van een orkestgroep als het soort niet meegegeven wordt', async () => {
      const antwoord = await maak(beheerderToken, { orchestraId: orkest.id, groupName: 'Harmonie' });
      expect(antwoord.status).toBe(201);
      expect(antwoord.body.groupType).toBe('orchestra');
    });

    it('vraagt om een groepsnaam', async () => {
      expect((await maak(beheerderToken, { orchestraId: orkest.id })).status).toBe(400);
      expect((await maak(beheerderToken, { orchestraId: orkest.id, groupName: '' })).status).toBe(400);
    });

    it('vraagt om een orkest bij een orkestgroep', async () => {
      const antwoord = await maak(beheerderToken, { groupName: 'Harmonie', groupType: 'orchestra' });
      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toMatch(/Orkest/);
    });

    it('laat een slagwerkgroep zonder orkest toe', async () => {
      const antwoord = await maak(beheerderToken, { groupName: 'Slagwerk', groupType: 'percussion' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    });

    it('staat maar een mapping per orkest toe', async () => {
      await maak(beheerderToken, { orchestraId: orkest.id, groupName: 'Harmonie' });
      const nogmaals = await maak(beheerderToken, { orchestraId: orkest.id, groupName: 'Harmonie 2' });
      expect(nogmaals.status).toBe(409);
    });

    it('staat maar een slagwerkgroep per vereniging toe', async () => {
      await maak(beheerderToken, { groupName: 'Slagwerk', groupType: 'percussion' });
      const nogmaals = await maak(beheerderToken, { groupName: 'Slagwerk 2', groupType: 'percussion' });
      expect(nogmaals.status).toBe(409);
    });

    it('houdt de dubbelcontrole binnen de eigen vereniging', async () => {
      // Twee verenigingen mogen elk hun eigen slagwerkgroep hebben; de
      // controle mag niet over de grens heen kijken.
      await maak(beheerderToken, { groupName: 'Slagwerk', groupType: 'percussion' });
      expect((await maak(andereBeheerderToken, { groupName: 'Slagwerk', groupType: 'percussion' })).status).toBe(201);
    });

    /**
     * ECHTE FOUT - bewezen rood zonder de reparatie.
     *
     * `orchestraId` kwam rauw uit de aanvraag de INSERT in. De dubbelcontrole
     * erboven zoekt op `orchestra_id = ? AND association_id = ?` en vindt dus
     * niets voor een orkest van een ander, waarna de mapping werd aangemaakt
     * met een orkest-id van die andere vereniging.
     *
     * Zonder de reparatie: 201 in plaats van 400. Aangetoond door
     * onboarding.ts terug te zetten op HEAD en deze test te draaien.
     */
    it('weigert een orkest van een andere vereniging', async () => {
      const antwoord = await maak(beheerderToken, { orchestraId: anderOrkest.id, groupName: 'Gestolen' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(400);
    });

    it('laat dan ook geen mapping naar dat orkest achter', async () => {
      await maak(beheerderToken, { orchestraId: anderOrkest.id, groupName: 'Gestolen' });
      const rij = db
        .prepare('SELECT COUNT(*) as aantal FROM m365_group_mappings WHERE orchestra_id = ?')
        .get(anderOrkest.id) as { aantal: number };
      expect(rij.aantal).toBe(0);
    });

    it('geeft de naam van een orkest van een ander dus ook niet terug', async () => {
      // Dit is wat de fout hierboven lekte: GET /m365-groups doet een LEFT JOIN
      // op orchestras en zet `orchestra_name` in het antwoord.
      await maak(beheerderToken, { orchestraId: anderOrkest.id, groupName: 'Gestolen' });
      const antwoord = await als(beheerderToken, 'get', '/m365-groups');
      expect(JSON.stringify(antwoord.body)).not.toContain('Fanfare Elders');
    });

    it('weigert een orkest dat helemaal niet bestaat', async () => {
      expect((await maak(beheerderToken, { orchestraId: ONBEKEND, groupName: 'Spook' })).status).toBe(400);
    });

    describe('het overzicht', () => {
      it('toont de eigen mappings met de orkestnaam erbij', async () => {
        await maak(beheerderToken, { orchestraId: orkest.id, groupName: 'Harmonie' });
        const antwoord = await als(beheerderToken, 'get', '/m365-groups');

        expect(antwoord.status).toBe(200);
        expect(antwoord.body).toHaveLength(1);
        expect(antwoord.body[0].orchestraName).toBe('Harmonieorkest');
        expect(antwoord.body[0].groupName).toBe('Harmonie');
      });

      it('toont niets van een andere vereniging', async () => {
        await maak(andereBeheerderToken, { orchestraId: anderOrkest.id, groupName: 'Groep van hun' });
        const antwoord = await als(beheerderToken, 'get', '/m365-groups');
        expect(antwoord.body).toHaveLength(0);
      });

      it('is niet voor een gewoon lid', async () => {
        expect((await als(lidToken, 'get', '/m365-groups')).status).toBe(403);
      });
    });

    describe('een mapping wijzigen', () => {
      let mappingId: string;

      beforeEach(async () => {
        const antwoord = await maak(beheerderToken, { orchestraId: orkest.id, groupName: 'Harmonie' });
        mappingId = antwoord.body.id;
      });

      it('past de groepsnaam aan', async () => {
        const antwoord = await als(beheerderToken, 'put', `/m365-groups/${mappingId}`).send({ groupName: 'Nieuw' });
        expect(antwoord.status).toBe(200);

        const rij = db.prepare('SELECT group_name FROM m365_group_mappings WHERE id = ?').get(mappingId) as {
          group_name: string;
        };
        expect(rij.group_name).toBe('Nieuw');
      });

      it('vraagt om een groepsnaam', async () => {
        expect((await als(beheerderToken, 'put', `/m365-groups/${mappingId}`).send({})).status).toBe(400);
      });

      it('weigert een mapping die niet bestaat', async () => {
        expect((await als(beheerderToken, 'put', `/m365-groups/${ONBEKEND}`).send({ groupName: 'X' })).status).toBe(404);
      });

      it('weigert een mapping van een andere vereniging', async () => {
        const antwoord = await als(andereBeheerderToken, 'put', `/m365-groups/${mappingId}`).send({ groupName: 'Gekaapt' });
        expect(antwoord.status).toBe(404);

        const rij = db.prepare('SELECT group_name FROM m365_group_mappings WHERE id = ?').get(mappingId) as {
          group_name: string;
        };
        expect(rij.group_name).toBe('Harmonie');
      });

      it('is niet voor een gewoon lid', async () => {
        expect((await als(lidToken, 'put', `/m365-groups/${mappingId}`).send({ groupName: 'X' })).status).toBe(403);
      });
    });

    describe('een mapping verwijderen', () => {
      let mappingId: string;

      beforeEach(async () => {
        const antwoord = await maak(beheerderToken, { orchestraId: orkest.id, groupName: 'Harmonie' });
        mappingId = antwoord.body.id;
      });

      it('haalt hem weg', async () => {
        expect((await als(beheerderToken, 'delete', `/m365-groups/${mappingId}`)).status).toBe(200);
        expect(db.prepare('SELECT COUNT(*) as n FROM m365_group_mappings').get()).toEqual({ n: 0 });
      });

      it('weigert een mapping die niet bestaat', async () => {
        expect((await als(beheerderToken, 'delete', `/m365-groups/${ONBEKEND}`)).status).toBe(404);
      });

      it('weigert een mapping van een andere vereniging en laat hem staan', async () => {
        expect((await als(andereBeheerderToken, 'delete', `/m365-groups/${mappingId}`)).status).toBe(404);
        expect(db.prepare('SELECT COUNT(*) as n FROM m365_group_mappings').get()).toEqual({ n: 1 });
      });

      it('is niet voor een gewoon lid', async () => {
        expect((await als(lidToken, 'delete', `/m365-groups/${mappingId}`)).status).toBe(403);
      });
    });
  });

  // ==========================================================================

  describe('functietitels bij instrumenten', () => {
    const maak = (token: string, body: Record<string, unknown>) => als(token, 'post', '/job-titles').send(body);

    it('maakt een mapping voor de eigen vereniging', async () => {
      const antwoord = await maak(beheerderToken, { instrumentId: trompet.id, jobTitle: 'Trompettist' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
      expect(antwoord.body.instrumentName).toBe('Trompet');

      const rij = db
        .prepare('SELECT association_id, instrument_id, job_title FROM instrument_job_title_mappings WHERE id = ?')
        .get(antwoord.body.id) as Record<string, string>;
      expect(rij.association_id).toBe(vereniging.id);
      expect(rij.job_title).toBe('Trompettist');
    });

    it('vraagt om zowel een instrument als een titel', async () => {
      expect((await maak(beheerderToken, { jobTitle: 'Trompettist' })).status).toBe(400);
      expect((await maak(beheerderToken, { instrumentId: trompet.id })).status).toBe(400);
      expect((await maak(beheerderToken, {})).status).toBe(400);
    });

    it('staat maar een titel per instrument toe', async () => {
      await maak(beheerderToken, { instrumentId: trompet.id, jobTitle: 'Trompettist' });
      expect((await maak(beheerderToken, { instrumentId: trompet.id, jobTitle: 'Eerste trompet' })).status).toBe(409);
    });

    it('laat een andere vereniging hetzelfde instrument wel apart benoemen', async () => {
      // De instrumententabel is gedeeld, de mapping niet: elke vereniging
      // heeft haar eigen titel voor dezelfde trompet.
      await maak(beheerderToken, { instrumentId: trompet.id, jobTitle: 'Trompettist' });
      expect((await maak(andereBeheerderToken, { instrumentId: trompet.id, jobTitle: 'Trumpeter' })).status).toBe(201);
    });

    it('toont in het overzicht alleen de eigen mappings', async () => {
      await maak(beheerderToken, { instrumentId: trompet.id, jobTitle: 'Trompettist' });
      await maak(andereBeheerderToken, { instrumentId: trompet.id, jobTitle: 'Titel van hun' });

      const antwoord = await als(beheerderToken, 'get', '/job-titles');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].jobTitle).toBe('Trompettist');
      expect(antwoord.body[0].instrumentName).toBe('Trompet');
    });

    describe('een titel wijzigen', () => {
      let mappingId: string;

      beforeEach(async () => {
        mappingId = (await maak(beheerderToken, { instrumentId: trompet.id, jobTitle: 'Trompettist' })).body.id;
      });

      it('past hem aan', async () => {
        expect((await als(beheerderToken, 'put', `/job-titles/${mappingId}`).send({ jobTitle: 'Solotrompet' })).status).toBe(200);
        const rij = db.prepare('SELECT job_title FROM instrument_job_title_mappings WHERE id = ?').get(mappingId) as {
          job_title: string;
        };
        expect(rij.job_title).toBe('Solotrompet');
      });

      it('vraagt om een titel', async () => {
        expect((await als(beheerderToken, 'put', `/job-titles/${mappingId}`).send({})).status).toBe(400);
      });

      it('weigert een mapping die niet bestaat', async () => {
        expect((await als(beheerderToken, 'put', `/job-titles/${ONBEKEND}`).send({ jobTitle: 'X' })).status).toBe(404);
      });

      it('weigert een mapping van een andere vereniging en laat hem ongemoeid', async () => {
        expect((await als(andereBeheerderToken, 'put', `/job-titles/${mappingId}`).send({ jobTitle: 'Gekaapt' })).status).toBe(404);
        const rij = db.prepare('SELECT job_title FROM instrument_job_title_mappings WHERE id = ?').get(mappingId) as {
          job_title: string;
        };
        expect(rij.job_title).toBe('Trompettist');
      });

      it('is niet voor een gewoon lid', async () => {
        expect((await als(lidToken, 'put', `/job-titles/${mappingId}`).send({ jobTitle: 'X' })).status).toBe(403);
      });
    });

    describe('een titel verwijderen', () => {
      let mappingId: string;

      beforeEach(async () => {
        mappingId = (await maak(beheerderToken, { instrumentId: trompet.id, jobTitle: 'Trompettist' })).body.id;
      });

      it('haalt hem weg', async () => {
        expect((await als(beheerderToken, 'delete', `/job-titles/${mappingId}`)).status).toBe(200);
        expect(db.prepare('SELECT COUNT(*) as n FROM instrument_job_title_mappings').get()).toEqual({ n: 0 });
      });

      it('weigert een mapping die niet bestaat', async () => {
        expect((await als(beheerderToken, 'delete', `/job-titles/${ONBEKEND}`)).status).toBe(404);
      });

      it('weigert een mapping van een andere vereniging en laat hem staan', async () => {
        expect((await als(andereBeheerderToken, 'delete', `/job-titles/${mappingId}`)).status).toBe(404);
        expect(db.prepare('SELECT COUNT(*) as n FROM instrument_job_title_mappings').get()).toEqual({ n: 1 });
      });

      it('is niet voor een gewoon lid', async () => {
        expect((await als(lidToken, 'delete', `/job-titles/${mappingId}`)).status).toBe(403);
      });
    });
  });

  // ==========================================================================

  describe('de taken van een lid', () => {
    it('toont de taken die bij het inschrijven zijn aangemaakt', async () => {
      const gemaakt = await als(beheerderToken, 'post', '/member').send({
        firstName: 'Nieuw',
        lastName: 'Lid',
        email: 'nieuw@vereniging.nl',
      });
      expect(gemaakt.status, JSON.stringify(gemaakt.body)).toBe(201);

      const antwoord = await als(beheerderToken, 'get', `/tasks/${gemaakt.body.userId}`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.map((t: { taskType: string }) => t.taskType)).toEqual([
        'harmonie_create',
        'spond_link_pending',
      ]);
    });

    it('geeft de metadata als object terug, niet als tekst', async () => {
      const gemaakt = await als(beheerderToken, 'post', '/member').send({
        firstName: 'Nieuw',
        lastName: 'Lid',
        email: 'nieuw@vereniging.nl',
      });

      const antwoord = await als(beheerderToken, 'get', `/tasks/${gemaakt.body.userId}`);
      const aanmaak = antwoord.body.find((t: { taskType: string }) => t.taskType === 'harmonie_create');
      expect(aanmaak.metadata.tempPassword).toBe(gemaakt.body.tempPassword);
      expect(aanmaak.status).toBe('completed');
    });

    it('laat een taak zonder metadata leeg', async () => {
      db.prepare(
        `INSERT INTO onboarding_tasks (id, user_id, association_id, task_type, status) VALUES (?, ?, ?, 'test', 'pending')`,
      ).run('taak-1', lid.id, vereniging.id);

      const antwoord = await als(beheerderToken, 'get', `/tasks/${lid.id}`);
      expect(antwoord.body[0].metadata).toBeNull();
    });

    it('toont niets van een lid van een andere vereniging', async () => {
      const hunLid = createTestUser(andereVereniging.id, { email: 'lid@elders.nl' });
      db.prepare(
        `INSERT INTO onboarding_tasks (id, user_id, association_id, task_type, status, metadata)
         VALUES (?, ?, ?, 'harmonie_create', 'completed', ?)`,
      ).run('taak-hun', hunLid.id, andereVereniging.id, JSON.stringify({ tempPassword: 'geheim-van-hun' }));

      const antwoord = await als(beheerderToken, 'get', `/tasks/${hunLid.id}`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual([]);
    });

    it('geeft een lege lijst voor een lid dat niet bestaat', async () => {
      const antwoord = await als(beheerderToken, 'get', `/tasks/${ONBEKEND}`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual([]);
    });

    it('is niet voor een gewoon lid', async () => {
      // In de metadata van harmonie_create staat het tijdelijke wachtwoord.
      expect((await als(lidToken, 'get', `/tasks/${lid.id}`)).status).toBe(403);
    });
  });

  // ==========================================================================

  describe('een openstaande Spond-koppeling opruimen', () => {
    async function koppelingVan(email: string): Promise<string> {
      const gemaakt = await als(beheerderToken, 'post', '/member').send({
        firstName: 'Nieuw',
        lastName: 'Lid',
        email,
      });
      const rij = db.prepare('SELECT id FROM pending_spond_links WHERE user_id = ?').get(gemaakt.body.userId) as {
        id: string;
      };
      return rij.id;
    }

    it('verwijdert hem', async () => {
      const koppeling = await koppelingVan('nieuw@vereniging.nl');
      const antwoord = await als(beheerderToken, 'delete', `/pending-links/${koppeling}`);

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(db.prepare('SELECT COUNT(*) as n FROM pending_spond_links').get()).toEqual({ n: 0 });
    });

    it('weigert een koppeling die niet bestaat', async () => {
      expect((await als(beheerderToken, 'delete', `/pending-links/${ONBEKEND}`)).status).toBe(404);
    });

    it('is niet voor een gewoon lid', async () => {
      const koppeling = await koppelingVan('nieuw@vereniging.nl');
      expect((await als(lidToken, 'delete', `/pending-links/${koppeling}`)).status).toBe(403);
    });
  });

  describe('een lid inschrijven met invoer die niet deugt', () => {
    const nieuwLid = (body: Record<string, unknown>) =>
      als(beheerderToken, 'post', '/member').send({
        firstName: 'Nieuw',
        lastName: 'Lid',
        email: 'nieuw@vereniging.nl',
        ...body,
      });

    /**
     * ECHTE FOUT - bewezen rood zonder de reparatie.
     *
     * `orchestraIds` en `instrumentIds` komen als JSON-tekst binnen wanneer het
     * formulier een foto meestuurt (multipart). Die tekst ging rechtstreeks
     * door JSON.parse, zonder try. Een stukgeslagen waarde gaf daardoor een
     * SyntaxError die als "Interne serverfout" (500) bij de gebruiker landde,
     * terwijl het gewoon foute invoer is.
     *
     * Zonder de reparatie: 500 in plaats van 400. Aangetoond door onboarding.ts
     * terug te zetten op HEAD en deze test te draaien.
     */
    it('meldt een stukgeslagen orkestlijst als foute invoer, niet als serverfout', async () => {
      const antwoord = await nieuwLid({ orchestraIds: '[dit is geen json' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(400);
    });

    it('doet dat ook voor de instrumentenlijst', async () => {
      const antwoord = await nieuwLid({ instrumentIds: '{kapot' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(400);
    });

    it('weigert een lijst die wel geldige JSON is maar geen lijst', async () => {
      // `{"a":1}` gaat probleemloos door JSON.parse heen. Zonder de controle
      // erna belandt een object in de for-lus die de id's afloopt.
      expect((await nieuwLid({ orchestraIds: '{"a":1}' })).status).toBe(400);
      expect((await nieuwLid({ instrumentIds: '"losse tekst"' })).status).toBe(400);
    });

    it('weigert een waarde die helemaal geen lijst of tekst is', async () => {
      expect((await nieuwLid({ orchestraIds: 42 })).status).toBe(400);
      expect((await nieuwLid({ instrumentIds: { id: 'x' } })).status).toBe(400);
    });

    it('maakt bij zulke invoer geen half account aan', async () => {
      await nieuwLid({ orchestraIds: '[dit is geen json' });
      const rij = db.prepare('SELECT COUNT(*) as n FROM users WHERE email = ?').get('nieuw@vereniging.nl') as {
        n: number;
      };
      expect(rij.n).toBe(0);
    });

    it('vult ontbrekende lijsten aan met niets', async () => {
      const antwoord = await nieuwLid({});
      expect(antwoord.status).toBe(201);
      expect(db.prepare('SELECT COUNT(*) as n FROM user_orchestras WHERE user_id = ?').get(antwoord.body.userId)).toEqual({ n: 0 });
    });

    it('bewaart het prive-emailadres apart van het verenigingsadres', async () => {
      const antwoord = await nieuwLid({ privateEmail: 'thuis@gmail.com' });
      const rij = db.prepare('SELECT email, private_email FROM users WHERE id = ?').get(antwoord.body.userId) as {
        email: string;
        private_email: string;
      };
      expect(rij.email).toBe('nieuw@vereniging.nl');
      expect(rij.private_email).toBe('thuis@gmail.com');
    });

    it('slaat het emailadres in kleine letters op', async () => {
      const antwoord = await nieuwLid({ email: 'Nieuw@Vereniging.NL' });
      const rij = db.prepare('SELECT email FROM users WHERE id = ?').get(antwoord.body.userId) as { email: string };
      expect(rij.email).toBe('nieuw@vereniging.nl');
    });

    it('herkent een bestaand adres ongeacht hoofdletters', async () => {
      expect((await nieuwLid({ email: lid.email.toUpperCase() })).status).toBe(409);
    });

    it('meldt dat er geen M365-account is aangemaakt als daar niet om gevraagd is', async () => {
      const antwoord = await nieuwLid({});
      expect(antwoord.body.m365Created).toBe(false);
      expect(antwoord.body.instructions).toContain('Geen M365 account aangemaakt.');
    });

    it('meldt netjes dat Microsoft niet is ingesteld', async () => {
      const antwoord = await nieuwLid({ createM365Account: true });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
      expect(antwoord.body.m365Error).toBe('Microsoft integratie is niet geconfigureerd');
      expect(antwoord.body.m365Created).toBe(false);
    });

    it('maakt het lid dan toch gewoon lokaal aan', async () => {
      const antwoord = await nieuwLid({ createM365Account: true });
      const rij = db.prepare('SELECT status FROM users WHERE id = ?').get(antwoord.body.userId) as { status: string };
      expect(rij.status).toBe('active');
    });

    it('noteert de mislukte M365-stap als openstaande taak', async () => {
      const antwoord = await nieuwLid({ createM365Account: true });
      const taken = db
        .prepare('SELECT task_type, status FROM onboarding_tasks WHERE user_id = ?')
        .all(antwoord.body.userId) as { task_type: string; status: string }[];

      const m365 = taken.find((t) => t.task_type === 'm365_create_failed');
      expect(m365?.status).toBe('pending');
    });

    it('neemt een meegegeven wachtwoord over', async () => {
      const antwoord = await nieuwLid({ m365Password: 'ZelfGekozen!2026' });
      expect(antwoord.body.tempPassword).toBe('ZelfGekozen!2026');
    });

    it('verzint anders een wachtwoord dat aan de M365-eisen voldoet', async () => {
      const antwoord = await nieuwLid({});
      const wachtwoord: string = antwoord.body.tempPassword;

      expect(wachtwoord.length).toBeGreaterThanOrEqual(12);
      expect(wachtwoord).toMatch(/[A-Z]/);
      expect(wachtwoord).toMatch(/[a-z]/);
      expect(wachtwoord).toMatch(/[0-9]/);
      expect(wachtwoord).toMatch(/[!@#$%&*]/);
    });

    it('verzint elke keer een ander wachtwoord', async () => {
      const eerste = await nieuwLid({ email: 'een@vereniging.nl' });
      const tweede = await nieuwLid({ email: 'twee@vereniging.nl' });
      expect(eerste.body.tempPassword).not.toBe(tweede.body.tempPassword);
    });
  });
});
