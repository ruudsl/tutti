/**
 * Leden in- en uitschrijven.
 *
 * 1.788 regels op 12,2% dekking - de laagste van alle grote routebestanden,
 * terwijl het over het aanmaken en beëindigen van accounts gaat. Er zit veel
 * M365-koppeling in; die takken worden overgeslagen zolang er geen
 * Microsoft-configuratie voor de vereniging staat, en dat maakt de kern goed
 * te testen.
 *
 * Eén fout gevonden: de orkest-id's kwamen uit het verzoek en gingen zonder
 * controle in user_orchestras. Een orkest hoort bij een vereniging, dus een
 * beheerder kon een nieuw lid in het orkest van een andere vereniging zetten.
 * Dat lid komt daarna in hun repetitieoverzicht, hun beschikbaarheid en hun
 * opstelling terecht - user_orchestras is op al die plekken de bron, en sinds
 * kort ook voor de privacy-instellingen.
 *
 * Instrumenten hebben die controle niet nodig: die tabel is gedeeld en heeft
 * geen association_id.
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
  TestOrchestra,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/onboarding', onboardingRoutes);
app.use(errorHandler);

describe('leden in- en uitschrijven', () => {
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
    const omgeving = createTestEnvironment();
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

  type Methode = 'get' | 'post' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/onboarding${pad}`).set('Authorization', `Bearer ${token}`);

  const nieuwLid = (token: string, body: Record<string, unknown>) =>
    als(token, 'post', '/member').send({
      firstName: 'Nieuw',
      lastName: 'Lid',
      email: 'nieuw@vereniging.nl',
      ...body,
    });

  describe('een lid inschrijven', () => {
    it('maakt het account aan', async () => {
      const antwoord = await nieuwLid(beheerderToken, {});
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
      expect(antwoord.body.userId).toBeTruthy();
    });

    it('zet het lid op actief in de eigen vereniging', async () => {
      const antwoord = await nieuwLid(beheerderToken, {});
      const rij = db
        .prepare('SELECT association_id, status, role FROM users WHERE id = ?')
        .get(antwoord.body.userId) as { association_id: string; status: string; role: string };

      expect(rij.association_id).toBe(vereniging.id);
      expect(rij.status).toBe('active');
      expect(rij.role).toBe('member');
    });

    it('bewaart het wachtwoord niet leesbaar', async () => {
      const antwoord = await nieuwLid(beheerderToken, {});
      const rij = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(antwoord.body.userId) as {
        password_hash: string;
      };
      expect(rij.password_hash).not.toBe(antwoord.body.tempPassword);
      expect(rij.password_hash.length).toBeGreaterThan(20);
    });

    it('vraagt om voornaam, achternaam en e-mailadres', async () => {
      expect((await als(beheerderToken, 'post', '/member').send({ email: 'x@y.nl' })).status).toBe(400);
      expect((await als(beheerderToken, 'post', '/member').send({ firstName: 'A', lastName: 'B' })).status).toBe(400);
    });

    it('weigert een e-mailadres dat al bestaat', async () => {
      const antwoord = await nieuwLid(beheerderToken, { email: lid.email });
      expect(antwoord.status).toBe(409);
    });

    it('is niet voor een gewoon lid', async () => {
      expect((await nieuwLid(lidToken, {})).status).toBe(403);
    });

    it('weigert een verzoek zonder token', async () => {
      const antwoord = await request(app).post('/api/onboarding/member').send({ email: 'x@y.nl' });
      expect(antwoord.status).toBe(401);
    });
  });

  describe('het orkest waarin een nieuw lid komt', () => {
    it('koppelt aan een orkest van de eigen vereniging', async () => {
      const antwoord = await nieuwLid(beheerderToken, { orchestraIds: [orkest.id] });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);

      const rijen = db
        .prepare('SELECT orchestra_id FROM user_orchestras WHERE user_id = ?')
        .all(antwoord.body.userId) as { orchestra_id: string }[];
      expect(rijen.map((r) => r.orchestra_id)).toEqual([orkest.id]);
    });

    it('weigert een orkest van een andere vereniging', async () => {
      const antwoord = await nieuwLid(beheerderToken, { orchestraIds: [anderOrkest.id] });
      expect(antwoord.status).toBe(400);
    });

    it('laat er dan ook geen lid van achter in dat orkest', async () => {
      await nieuwLid(beheerderToken, { orchestraIds: [anderOrkest.id] });
      const rijen = db
        .prepare('SELECT COUNT(*) as aantal FROM user_orchestras WHERE orchestra_id = ?')
        .get(anderOrkest.id) as { aantal: number };
      expect(rijen.aantal).toBe(0);
    });

    it('weigert ook als er een goed en een fout orkest bij zit', async () => {
      const antwoord = await nieuwLid(beheerderToken, { orchestraIds: [orkest.id, anderOrkest.id] });
      expect(antwoord.status).toBe(400);
    });

    it('koppelt instrumenten zonder verenigingscontrole, want die tabel is gedeeld', async () => {
      const trompet = createTestInstrument({ name: 'Trompet' });
      const antwoord = await nieuwLid(beheerderToken, { instrumentIds: [trompet.id] });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);

      const rijen = db
        .prepare('SELECT instrument_id FROM user_instruments WHERE user_id = ?')
        .all(antwoord.body.userId) as { instrument_id: string }[];
      expect(rijen.map((r) => r.instrument_id)).toEqual([trompet.id]);
    });

    it('accepteert de id-lijst ook als JSON-tekst', async () => {
      const antwoord = await nieuwLid(beheerderToken, { orchestraIds: JSON.stringify([orkest.id]) });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    });
  });

  describe('een lid uitschrijven', () => {
    it('zet het lid op inactief', async () => {
      const antwoord = await als(beheerderToken, 'post', `/offboard/${lid.id}`).send({});
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const rij = db.prepare('SELECT status FROM users WHERE id = ?').get(lid.id) as { status: string };
      expect(rij.status).toBe('inactive');
    });

    it('haalt het lid uit zijn orkesten', async () => {
      db.prepare('INSERT INTO user_orchestras (user_id, orchestra_id) VALUES (?, ?)').run(lid.id, orkest.id);
      await als(beheerderToken, 'post', `/offboard/${lid.id}`).send({});

      const rijen = db.prepare('SELECT COUNT(*) as aantal FROM user_orchestras WHERE user_id = ?').get(lid.id) as {
        aantal: number;
      };
      expect(rijen.aantal).toBe(0);
    });

    it('weigert een lid van een andere vereniging', async () => {
      const elders = createTestUser(andereVereniging.id, { email: 'lid@elders.nl' });
      const antwoord = await als(beheerderToken, 'post', `/offboard/${elders.id}`).send({});
      expect(antwoord.status).toBe(404);

      const rij = db.prepare('SELECT status FROM users WHERE id = ?').get(elders.id) as { status: string };
      expect(rij.status).toBe('active');
    });

    it('laat een beheerder zichzelf niet uitschrijven', async () => {
      const antwoord = await als(beheerderToken, 'post', `/offboard/${beheerder.id}`).send({});
      expect(antwoord.status).toBe(400);
    });

    it('weigert een lid dat al uitgeschreven is', async () => {
      await als(beheerderToken, 'post', `/offboard/${lid.id}`).send({});
      const nogmaals = await als(beheerderToken, 'post', `/offboard/${lid.id}`).send({});
      expect(nogmaals.status).toBe(400);
    });

    it('is niet voor een gewoon lid', async () => {
      expect((await als(lidToken, 'post', `/offboard/${beheerder.id}`).send({})).status).toBe(403);
    });
  });

  describe('een lid weer inschrijven', () => {
    it('zet het lid terug op actief', async () => {
      await als(beheerderToken, 'post', `/offboard/${lid.id}`).send({});
      const antwoord = await als(beheerderToken, 'post', `/reactivate/${lid.id}`).send({});
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const rij = db.prepare('SELECT status, offboarded_at FROM users WHERE id = ?').get(lid.id) as {
        status: string;
        offboarded_at: string | null;
      };
      expect(rij.status).toBe('active');
      expect(rij.offboarded_at).toBeNull();
    });

    it('weigert een lid dat al actief is', async () => {
      expect((await als(beheerderToken, 'post', `/reactivate/${lid.id}`).send({})).status).toBe(400);
    });

    it('weigert een lid van een andere vereniging', async () => {
      const elders = createTestUser(andereVereniging.id, { email: 'lid@elders.nl' });
      db.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(elders.id);

      expect((await als(beheerderToken, 'post', `/reactivate/${elders.id}`).send({})).status).toBe(404);
    });
  });

  describe('het overzicht van uitgeschreven leden', () => {
    it('toont alleen de eigen vereniging', async () => {
      await als(beheerderToken, 'post', `/offboard/${lid.id}`).send({});

      const elders = createTestUser(andereVereniging.id, { email: 'weg@elders.nl', lastName: 'VanElders' });
      db.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(elders.id);

      const antwoord = await als(beheerderToken, 'get', '/inactive-members');
      expect(antwoord.status).toBe(200);
      expect(JSON.stringify(antwoord.body)).not.toContain('VanElders');
    });
  });

  describe('functietitels bij instrumenten', () => {
    // Dit blok stond al in dit bestand voordat ik het uitbreidde en dekt een
    // route die de rest hier niet raakt.
    it('geeft de lijst terug', async () => {
      expect((await als(beheerderToken, 'get', '/job-titles')).status).toBe(200);
    });

    it('eist een instrument en een titel', async () => {
      const antwoord = await als(beheerderToken, 'post', '/job-titles').send({ jobTitle: 'Zonder instrument' });
      expect(antwoord.status).toBe(400);
    });

    it('meldt dat een onbekend instrument niet bestaat', async () => {
      const antwoord = await als(beheerderToken, 'post', '/job-titles').send({
        instrumentId: '11111111-1111-1111-1111-111111111111',
        jobTitle: 'Trompettist',
      });
      expect(antwoord.status).toBe(404);
    });
  });

  describe('een lid dat niet bestaat', () => {
    const onbekend = '11111111-1111-1111-1111-111111111111';

    it('wordt netjes gemeld bij uitschrijven', async () => {
      expect((await als(beheerderToken, 'post', `/offboard/${onbekend}`).send({})).status).toBe(404);
    });

    it('wordt netjes gemeld bij weer inschrijven', async () => {
      expect((await als(beheerderToken, 'post', `/reactivate/${onbekend}`).send({})).status).toBe(404);
    });
  });

  describe('het overzicht van uitgeschreven leden, vervolg', () => {
    it('is niet voor een gewoon lid', async () => {
      expect((await als(lidToken, 'get', '/inactive-members')).status).toBe(403);
    });
  });

  describe('openstaande Spond-koppelingen', () => {
    it('toont alleen de eigen vereniging', async () => {
      await nieuwLid(beheerderToken, {});
      const antwoord = await als(beheerderToken, 'get', '/pending-links');
      expect(antwoord.status).toBe(200);
      expect(JSON.stringify(antwoord.body)).toContain('nieuw@vereniging.nl');

      const vanElders = await als(andereBeheerderToken, 'get', '/pending-links');
      expect(JSON.stringify(vanElders.body)).not.toContain('nieuw@vereniging.nl');
    });

    it('verwijdert er geen van een andere vereniging', async () => {
      const gemaakt = await nieuwLid(beheerderToken, {});
      const rij = db.prepare('SELECT id FROM pending_spond_links WHERE user_id = ?').get(gemaakt.body.userId) as {
        id: string;
      };

      const antwoord = await als(andereBeheerderToken, 'delete', `/pending-links/${rij.id}`);
      expect(antwoord.status).toBe(404);

      const nog = db.prepare('SELECT COUNT(*) as aantal FROM pending_spond_links WHERE id = ?').get(rij.id) as {
        aantal: number;
      };
      expect(nog.aantal).toBe(1);
    });
  });
});
