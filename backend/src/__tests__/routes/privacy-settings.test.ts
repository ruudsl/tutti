/**
 * Wie mag welk veld van wie zien.
 *
 * 482 regels zonder test, en de kern ervan deed niets. Twee dingen zaten mis.
 *
 * Het eerste: `section` en `orchestra` gaven in canViewField allebei
 * onvoorwaardelijk true terug. Een lid dat zijn instrumenten op "alleen mijn
 * sectie" zette kreeg precies hetzelfde resultaat als bij "alle leden". De
 * keuze stond in de tabel en op het scherm, en had geen enkele werking.
 *
 * Het tweede weegt zwaarder: buiten deze route werd user_privacy_settings
 * nergens gelezen. GET /users/directory staat open voor elk lid en gaf foto,
 * instrumenten en orkesten van iedereen, wat er ook was ingesteld. De hele
 * module was daarmee decoratief - je kon hem invullen, en er veranderde niets
 * aan wat een ander te zien kreeg.
 *
 * De trap loopt van public naar admin_only. Eigen gegevens en een beheerder
 * vallen erbuiten: jezelf zie je altijd, en de ledenadministratie ligt bij de
 * beheerder.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import privacyRoutes from '../../routes/privacy-settings';
import usersRoutes from '../../routes/users';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestInstrument,
  createTestOrchestra,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestOrchestra,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/privacy-settings', privacyRoutes);
app.use('/api/users', usersRoutes);
app.use(errorHandler);

describe('privacy-instellingen', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;
  let commissielid: TestUser;
  let commissielidToken: string;

  let orkest: TestOrchestra;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    commissielid = omgeving.musicCommitteeUser;
    commissielidToken = omgeving.musicCommitteeToken;
    orkest = createTestOrchestra(vereniging.id, { name: 'Harmonieorkest' });
  });

  type Methode = 'get' | 'post' | 'put' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/privacy-settings${pad}`).set('Authorization', `Bearer ${token}`);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);
  const alsBeheerder = (methode: Methode, pad: string) => als(beheerderToken, methode, pad);

  const gids = (token: string, zoekreeks = '') =>
    request(app).get(`/api/users/directory${zoekreeks}`).set('Authorization', `Bearer ${token}`);

  /** Zet rechtstreeks een zichtbaarheid voor een lid, zonder de route. */
  function zet(userId: string, veld: string, zichtbaarheid: string) {
    db.prepare(
      `INSERT INTO user_privacy_settings (id, user_id, field_name, visibility)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, field_name) DO UPDATE SET visibility = excluded.visibility`,
    ).run(uuidv4(), userId, veld, zichtbaarheid);
  }

  function zetStandaard(veld: string, zichtbaarheid: string, verplicht = false, doel: string | null = null) {
    db.prepare(
      `INSERT INTO association_privacy_defaults (id, association_id, field_name, default_visibility, purpose_statement, is_required)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(uuidv4(), vereniging.id, veld, zichtbaarheid, doel, verplicht ? 1 : 0);
  }

  function inOrkest(userId: string, orchestraId: string) {
    db.prepare('INSERT INTO user_orchestras (user_id, orchestra_id) VALUES (?, ?)').run(userId, orchestraId);
  }

  /** Een sectie op het podium met een instrument erin, en een lid dat het speelt. */
  function maakSectie(orchestraId: string, rij: number, naam: string): string {
    const id = uuidv4();
    db.prepare('INSERT INTO seating_sections (id, orchestra_id, name, row_number) VALUES (?, ?, ?, ?)').run(
      id,
      orchestraId,
      naam,
      rij,
    );
    return id;
  }

  function instrumentInSectie(sectieId: string, instrumentId: string) {
    db.prepare('INSERT INTO seating_section_instruments (id, section_id, instrument_id) VALUES (?, ?, ?)').run(
      uuidv4(),
      sectieId,
      instrumentId,
    );
  }

  function speelt(userId: string, instrumentId: string) {
    db.prepare('INSERT INTO user_instruments (user_id, instrument_id) VALUES (?, ?)').run(userId, instrumentId);
  }

  describe('GET /my-settings', () => {
    it('geeft de vier standaardvelden terug', async () => {
      const antwoord = await alsLid('get', '/my-settings');
      expect(antwoord.status).toBe(200);
      expect(Object.keys(antwoord.body).sort()).toEqual(['email', 'instruments', 'orchestras', 'profile_photo']);
    });

    it('valt terug op all_members als niemand iets heeft ingesteld', async () => {
      const antwoord = await alsLid('get', '/my-settings');
      expect(antwoord.body.email).toMatchObject({ visibility: 'all_members', isDefault: true });
    });

    it('gebruikt de standaard van de vereniging als het lid niets koos', async () => {
      zetStandaard('email', 'committee', false, 'Voor het rondsturen van repetitieroosters.');
      const antwoord = await alsLid('get', '/my-settings');
      expect(antwoord.body.email).toMatchObject({
        visibility: 'committee',
        isDefault: true,
        purposeStatement: 'Voor het rondsturen van repetitieroosters.',
      });
    });

    it('laat de eigen keuze voorgaan op de standaard', async () => {
      zetStandaard('email', 'all_members');
      zet(lid.id, 'email', 'admin_only');
      const antwoord = await alsLid('get', '/my-settings');
      expect(antwoord.body.email).toMatchObject({ visibility: 'admin_only', isDefault: false });
    });

    it('meldt of een veld verplicht is', async () => {
      zetStandaard('email', 'committee', true);
      const antwoord = await alsLid('get', '/my-settings');
      expect(antwoord.body.email.isRequired).toBe(true);
    });

    it('neemt maatwerkvelden van de vereniging mee', async () => {
      db.prepare(
        `INSERT INTO custom_field_definitions (id, association_id, entity_type, field_key, field_label, field_type)
         VALUES (?, ?, 'user', 'telefoon', 'Telefoonnummer', 'text')`,
      ).run(uuidv4(), vereniging.id);

      const antwoord = await alsLid('get', '/my-settings');
      expect(antwoord.body.custom_telefoon).toMatchObject({
        fieldLabel: 'Telefoonnummer',
        visibility: 'all_members',
      });
    });

    it('geeft twee leden hun eigen instellingen, niet die van de ander', async () => {
      zet(lid.id, 'email', 'admin_only');
      zet(commissielid.id, 'email', 'public');

      const vanLid = await alsLid('get', '/my-settings');
      const vanCommissie = await als(commissielidToken, 'get', '/my-settings');

      expect(vanLid.body.email.visibility).toBe('admin_only');
      expect(vanCommissie.body.email.visibility).toBe('public');
    });
  });

  describe('PUT /my-settings', () => {
    it('bewaart een keuze', async () => {
      const antwoord = await alsLid('put', '/my-settings').send({
        settings: [{ fieldName: 'email', visibility: 'admin_only' }],
      });
      expect(antwoord.status).toBe(200);

      const opgehaald = await alsLid('get', '/my-settings');
      expect(opgehaald.body.email.visibility).toBe('admin_only');
    });

    it('overschrijft een eerdere keuze in plaats van er een rij bij te zetten', async () => {
      await alsLid('put', '/my-settings').send({ settings: [{ fieldName: 'email', visibility: 'admin_only' }] });
      await alsLid('put', '/my-settings').send({ settings: [{ fieldName: 'email', visibility: 'public' }] });

      const rijen = db
        .prepare('SELECT visibility FROM user_privacy_settings WHERE user_id = ? AND field_name = ?')
        .all(lid.id, 'email') as { visibility: string }[];
      expect(rijen).toHaveLength(1);
      expect(rijen[0].visibility).toBe('public');
    });

    it('weigert een zichtbaarheid die niet bestaat', async () => {
      const antwoord = await alsLid('put', '/my-settings').send({
        settings: [{ fieldName: 'email', visibility: 'iedereen-op-straat' }],
      });
      expect(antwoord.status).toBe(400);
    });

    it('laat een verplicht veld niet opener zetten dan de vereniging vraagt', async () => {
      zetStandaard('email', 'committee', true);
      const antwoord = await alsLid('put', '/my-settings').send({
        settings: [{ fieldName: 'email', visibility: 'all_members' }],
      });
      expect(antwoord.status).toBe(400);
    });

    it('laat een verplicht veld wel strenger zetten', async () => {
      zetStandaard('email', 'committee', true);
      const antwoord = await alsLid('put', '/my-settings').send({
        settings: [{ fieldName: 'email', visibility: 'admin_only' }],
      });
      expect(antwoord.status).toBe(200);
    });

    it('raakt de instellingen van een ander lid niet aan', async () => {
      zet(commissielid.id, 'email', 'admin_only');
      await alsLid('put', '/my-settings').send({ settings: [{ fieldName: 'email', visibility: 'public' }] });

      const vanAnder = db
        .prepare('SELECT visibility FROM user_privacy_settings WHERE user_id = ? AND field_name = ?')
        .get(commissielid.id, 'email') as { visibility: string };
      expect(vanAnder.visibility).toBe('admin_only');
    });
  });

  describe('GET /user/:userId', () => {
    it('geeft een lid zijn eigen instellingen ongefilterd', async () => {
      zet(lid.id, 'email', 'admin_only');
      const antwoord = await alsLid('get', `/user/${lid.id}`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toMatchObject({ email: 'admin_only' });
    });

    it('kent een lid van een andere vereniging niet', async () => {
      const elders = createTestAssociation({ name: 'Elders' });
      const vreemde = createTestUser(elders.id, { email: 'vreemde@elders.nl' });
      const antwoord = await alsLid('get', `/user/${vreemde.id}`);
      expect(antwoord.status).toBe(404);
    });

    it('laat een beheerder alles zien', async () => {
      zet(commissielid.id, 'email', 'admin_only');
      const antwoord = await alsBeheerder('get', `/user/${commissielid.id}`);
      expect(antwoord.body.visibleFields).toContain('email');
    });

    it('verbergt admin_only voor een gewoon lid', async () => {
      zet(commissielid.id, 'email', 'admin_only');
      const antwoord = await alsLid('get', `/user/${commissielid.id}`);
      expect(antwoord.body.visibleFields).not.toContain('email');
    });

    it('toont een veld op committee aan een commissielid en niet aan een gewoon lid', async () => {
      zet(beheerder.id, 'email', 'committee');

      const voorCommissie = await als(commissielidToken, 'get', `/user/${beheerder.id}`);
      const voorLid = await alsLid('get', `/user/${beheerder.id}`);

      expect(voorCommissie.body.visibleFields).toContain('email');
      expect(voorLid.body.visibleFields).not.toContain('email');
    });

    it('noemt ook velden waarvoor het lid niets heeft ingesteld', async () => {
      const antwoord = await alsLid('get', `/user/${commissielid.id}`);
      expect(antwoord.body.visibleFields).toEqual(
        expect.arrayContaining(['email', 'instruments', 'orchestras', 'profile_photo']),
      );
    });

    describe('orchestra', () => {
      it('toont het veld aan een lid uit hetzelfde orkest', async () => {
        inOrkest(lid.id, orkest.id);
        inOrkest(commissielid.id, orkest.id);
        zet(commissielid.id, 'email', 'orchestra');

        const antwoord = await alsLid('get', `/user/${commissielid.id}`);
        expect(antwoord.body.visibleFields).toContain('email');
      });

      it('verbergt het veld voor een lid uit een ander orkest', async () => {
        const tweedeOrkest = createTestOrchestra(vereniging.id, { name: 'Slagwerkgroep' });
        inOrkest(lid.id, tweedeOrkest.id);
        inOrkest(commissielid.id, orkest.id);
        zet(commissielid.id, 'email', 'orchestra');

        const antwoord = await alsLid('get', `/user/${commissielid.id}`);
        expect(antwoord.body.visibleFields).not.toContain('email');
      });

      it('verbergt het veld voor een lid dat in geen enkel orkest speelt', async () => {
        inOrkest(commissielid.id, orkest.id);
        zet(commissielid.id, 'email', 'orchestra');

        const antwoord = await alsLid('get', `/user/${commissielid.id}`);
        expect(antwoord.body.visibleFields).not.toContain('email');
      });
    });

    describe('section', () => {
      it('toont het veld aan een lid uit dezelfde sectie', async () => {
        const trompet = createTestInstrument({ name: 'Trompet' });
        const bugel = createTestInstrument({ name: 'Bugel' });
        const koper = maakSectie(orkest.id, 1, 'Hoog koper');
        instrumentInSectie(koper, trompet.id);
        instrumentInSectie(koper, bugel.id);
        speelt(lid.id, trompet.id);
        speelt(commissielid.id, bugel.id);
        zet(commissielid.id, 'email', 'section');

        const antwoord = await alsLid('get', `/user/${commissielid.id}`);
        expect(antwoord.body.visibleFields).toContain('email');
      });

      it('verbergt het veld voor een lid uit een andere sectie', async () => {
        const trompet = createTestInstrument({ name: 'Trompet' });
        const klarinet = createTestInstrument({ name: 'Klarinet' });
        const koper = maakSectie(orkest.id, 1, 'Hoog koper');
        const hout = maakSectie(orkest.id, 2, 'Hout');
        instrumentInSectie(koper, trompet.id);
        instrumentInSectie(hout, klarinet.id);
        speelt(lid.id, klarinet.id);
        speelt(commissielid.id, trompet.id);
        zet(commissielid.id, 'email', 'section');

        const antwoord = await alsLid('get', `/user/${commissielid.id}`);
        expect(antwoord.body.visibleFields).not.toContain('email');
      });

      it('telt elke sectie mee van wie meer dan een instrument speelt', async () => {
        const trompet = createTestInstrument({ name: 'Trompet' });
        const klarinet = createTestInstrument({ name: 'Klarinet' });
        const koper = maakSectie(orkest.id, 1, 'Hoog koper');
        const hout = maakSectie(orkest.id, 2, 'Hout');
        instrumentInSectie(koper, trompet.id);
        instrumentInSectie(hout, klarinet.id);
        speelt(lid.id, trompet.id);
        speelt(lid.id, klarinet.id);
        speelt(commissielid.id, klarinet.id);
        zet(commissielid.id, 'email', 'section');

        const antwoord = await alsLid('get', `/user/${commissielid.id}`);
        expect(antwoord.body.visibleFields).toContain('email');
      });
    });
  });

  describe('standaarden van de vereniging', () => {
    it('laat een gewoon lid er niet bij', async () => {
      expect((await alsLid('get', '/defaults')).status).toBe(403);
      expect((await alsLid('put', '/defaults').send({ defaults: [] })).status).toBe(403);
      expect((await alsLid('delete', '/defaults/email')).status).toBe(403);
    });

    it('bewaart en geeft terug wat een beheerder instelt', async () => {
      const bewaren = await alsBeheerder('put', '/defaults').send({
        defaults: [
          {
            fieldName: 'email',
            defaultVisibility: 'committee',
            purposeStatement: 'Voor de ledenadministratie.',
            isRequired: true,
          },
        ],
      });
      expect(bewaren.status).toBe(200);

      const opgehaald = await alsBeheerder('get', '/defaults');
      expect(opgehaald.body).toEqual([
        expect.objectContaining({
          fieldName: 'email',
          defaultVisibility: 'committee',
          purposeStatement: 'Voor de ledenadministratie.',
          isRequired: true,
        }),
      ]);
    });

    it('werkt een bestaande standaard bij in plaats van er een bij te zetten', async () => {
      await alsBeheerder('put', '/defaults').send({
        defaults: [{ fieldName: 'email', defaultVisibility: 'committee' }],
      });
      await alsBeheerder('put', '/defaults').send({
        defaults: [{ fieldName: 'email', defaultVisibility: 'public' }],
      });

      const opgehaald = await alsBeheerder('get', '/defaults');
      expect(opgehaald.body).toHaveLength(1);
      expect(opgehaald.body[0].defaultVisibility).toBe('public');
    });

    it('verwijdert een standaard', async () => {
      zetStandaard('email', 'committee');
      const verwijderen = await alsBeheerder('delete', '/defaults/email');
      expect(verwijderen.status).toBe(200);
      expect((await alsBeheerder('get', '/defaults')).body).toHaveLength(0);
    });

    it('meldt netjes dat een standaard niet bestaat', async () => {
      const antwoord = await alsBeheerder('delete', '/defaults/bestaat-niet');
      expect(antwoord.status).toBe(404);
    });

    it('raakt de standaarden van een andere vereniging niet', async () => {
      const elders = createTestAssociation({ name: 'Elders' });
      const id = uuidv4();
      db.prepare(
        `INSERT INTO association_privacy_defaults (id, association_id, field_name, default_visibility)
         VALUES (?, ?, 'email', 'public')`,
      ).run(id, elders.id);

      await alsBeheerder('delete', '/defaults/email');

      const vanElders = db.prepare('SELECT id FROM association_privacy_defaults WHERE id = ?').get(id);
      expect(vanElders).toBeTruthy();
    });
  });

  describe('toestemming', () => {
    it('legt een toestemming vast', async () => {
      const antwoord = await alsLid('post', '/consent').send({ consentVersion: '2026-01' });
      expect(antwoord.status).toBe(201);
      expect(antwoord.body.consentVersion).toBe('2026-01');
    });

    it('legt dezelfde versie niet twee keer vast', async () => {
      await alsLid('post', '/consent').send({ consentVersion: '2026-01' });
      const tweede = await alsLid('post', '/consent').send({ consentVersion: '2026-01' });

      expect(tweede.status).toBe(200);
      expect(tweede.body.alreadyConsented).toBe(true);
      expect((await alsLid('get', '/consent')).body).toHaveLength(1);
    });

    it('houdt versies uit elkaar', async () => {
      await alsLid('post', '/consent').send({ consentVersion: '2026-01' });
      await alsLid('post', '/consent').send({ consentVersion: '2026-06' });
      expect((await alsLid('get', '/consent')).body).toHaveLength(2);
    });

    it('weigert een lege versie', async () => {
      const antwoord = await alsLid('post', '/consent').send({ consentVersion: '' });
      expect(antwoord.status).toBe(400);
    });

    it('vertelt of een versie is getekend', async () => {
      await alsLid('post', '/consent').send({ consentVersion: '2026-01' });

      const wel = await alsLid('get', '/consent/check/2026-01');
      const niet = await alsLid('get', '/consent/check/2026-06');

      expect(wel.body.hasConsented).toBe(true);
      expect(wel.body.consentedAt).toBeTruthy();
      expect(niet.body).toEqual({ hasConsented: false, consentedAt: null });
    });

    it('geeft alleen de eigen toestemmingen', async () => {
      await als(commissielidToken, 'post', '/consent').send({ consentVersion: '2026-01' });
      expect((await alsLid('get', '/consent')).body).toHaveLength(0);
    });
  });

  describe('de ledengids houdt zich aan de instellingen', () => {
    let trompet: { id: string; name: string };

    beforeEach(() => {
      trompet = createTestInstrument({ name: 'Trompet' });
      speelt(commissielid.id, trompet.id);
      inOrkest(commissielid.id, orkest.id);
    });

    const vanCommissielid = (body: { id: string }[]) => body.find((m) => m.id === commissielid.id) as any;

    it('toont instrumenten en orkesten als er niets is ingesteld', async () => {
      const antwoord = await gids(lidToken);
      expect(vanCommissielid(antwoord.body).instruments).toHaveLength(1);
      expect(vanCommissielid(antwoord.body).orchestras).toHaveLength(1);
    });

    it('verbergt instrumenten die op admin_only staan', async () => {
      zet(commissielid.id, 'instruments', 'admin_only');
      const antwoord = await gids(lidToken);
      expect(vanCommissielid(antwoord.body).instruments).toEqual([]);
    });

    it('laat de beheerder ze wel zien', async () => {
      zet(commissielid.id, 'instruments', 'admin_only');
      const antwoord = await gids(beheerderToken);
      expect(vanCommissielid(antwoord.body).instruments).toHaveLength(1);
    });

    it('laat het lid zelf zijn eigen gegevens zien', async () => {
      zet(commissielid.id, 'instruments', 'admin_only');
      const antwoord = await gids(commissielidToken);
      expect(vanCommissielid(antwoord.body).instruments).toHaveLength(1);
    });

    it('verbergt orkesten die op admin_only staan', async () => {
      zet(commissielid.id, 'orchestras', 'admin_only');
      const antwoord = await gids(lidToken);
      expect(vanCommissielid(antwoord.body).orchestras).toEqual([]);
    });

    it('verbergt de foto die op admin_only staat', async () => {
      db.prepare('UPDATE users SET profile_photo_path = ? WHERE id = ?').run('/foto.jpg', commissielid.id);
      zet(commissielid.id, 'profile_photo', 'admin_only');

      const voorLid = await gids(lidToken);
      const voorBeheerder = await gids(beheerderToken);

      expect(vanCommissielid(voorLid.body).photoUrl).toBeNull();
      expect(vanCommissielid(voorBeheerder.body).photoUrl).toBeTruthy();
    });

    it('volgt de standaard van de vereniging als het lid niets koos', async () => {
      zetStandaard('instruments', 'admin_only');
      const antwoord = await gids(lidToken);
      expect(vanCommissielid(antwoord.body).instruments).toEqual([]);
    });

    it('laat de eigen keuze voorgaan op een strengere standaard', async () => {
      zetStandaard('instruments', 'admin_only');
      zet(commissielid.id, 'instruments', 'all_members');
      const antwoord = await gids(lidToken);
      expect(vanCommissielid(antwoord.body).instruments).toHaveLength(1);
    });

    it('toont orkesten op orchestra alleen aan wie in hetzelfde orkest speelt', async () => {
      zet(commissielid.id, 'orchestras', 'orchestra');

      const zonder = await gids(lidToken);
      expect(vanCommissielid(zonder.body).orchestras).toEqual([]);

      inOrkest(lid.id, orkest.id);
      const met = await gids(lidToken);
      expect(vanCommissielid(met.body).orchestras).toHaveLength(1);
    });

    it('laat iemand die zijn orkest verbergt ook niet vinden via het orkestfilter', async () => {
      zet(commissielid.id, 'orchestras', 'admin_only');
      const antwoord = await gids(lidToken, `?orchestraId=${orkest.id}`);
      expect(antwoord.body.find((m: { id: string }) => m.id === commissielid.id)).toBeUndefined();
    });

    it('laat iemand die zijn instrument verbergt ook niet vinden via het instrumentfilter', async () => {
      zet(commissielid.id, 'instruments', 'admin_only');
      const antwoord = await gids(lidToken, `?instrumentId=${trompet.id}`);
      expect(antwoord.body.find((m: { id: string }) => m.id === commissielid.id)).toBeUndefined();
    });

    it('blijft het lid zelf tonen, ook met een filter en alles verborgen', async () => {
      zet(commissielid.id, 'orchestras', 'admin_only');
      const antwoord = await gids(commissielidToken, `?orchestraId=${orkest.id}`);
      expect(antwoord.body.find((m: { id: string }) => m.id === commissielid.id)).toBeTruthy();
    });
  });
});
