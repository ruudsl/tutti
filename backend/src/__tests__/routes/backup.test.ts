/**
 * Reservekopie maken en terugzetten.
 *
 * 473 regels zonder test, en het gat zat niet in de code maar in wie erbij
 * mocht. De reservekopie is het databasebestand plus alle uploads - dus van
 * alle verenigingen tegelijk - en terugzetten overschrijft datzelfde bestand.
 * Alle drie de routes stonden op requireRole('admin'), en dat is de beheerder
 * van een vereniging: een rol die elke vereniging zelf in handen heeft.
 *
 * Op een installatie met meer dan een vereniging kon een beheerder daarmee de
 * bladmuziek, de ledengegevens en de boekhouding van alle andere verenigingen
 * binnenhalen, en met een eigen bestand alles overschrijven. De ip-controle
 * die erbij stond verandert daar niets aan: die laat alles door zolang
 * IP_WHITELIST_ENABLED niet aan staat, en dat is de standaard.
 *
 * Deze tests leggen vast dat het super-admin is.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import backupRoutes, { isVeiligeBestandsnaam } from '../../routes/backup';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/backup', backupRoutes);
app.use(errorHandler);

describe('reservekopie', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;

  let andereVereniging: TestAssociation;
  let andereBeheerder: TestUser;
  let andereBeheerderToken: string;

  let superAdmin: TestUser;
  let superAdminToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;

    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
    andereBeheerder = createTestUser(andereVereniging.id, {
      email: 'beheer@elders.nl',
      role: 'admin',
    });
    andereBeheerderToken = generateTestToken(andereBeheerder);

    superAdmin = createTestUser(vereniging.id, { email: 'super@test.nl', role: 'admin' });
    superAdminToken = generateTestToken(superAdmin);
    db.prepare('INSERT INTO super_admins (id, user_id) VALUES (?, ?)').run(uuidv4(), superAdmin.id);
  });

  type Methode = 'get' | 'post';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/backup${pad}`).set('Authorization', `Bearer ${token}`);

  describe('wie erbij mag', () => {
    const routes: { naam: string; methode: Methode; pad: string }[] = [
      { naam: 'GET /backup', methode: 'get', pad: '/' },
      { naam: 'GET /backup/info', methode: 'get', pad: '/info' },
      { naam: 'POST /backup/restore', methode: 'post', pad: '/restore' },
    ];

    for (const route of routes) {
      it(`${route.naam} weigert een gewoon lid`, async () => {
        const antwoord = await als(lidToken, route.methode, route.pad);
        expect(antwoord.status).toBe(403);
      });

      it(`${route.naam} weigert de beheerder van een vereniging`, async () => {
        const antwoord = await als(beheerderToken, route.methode, route.pad);
        expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(403);
      });

      it(`${route.naam} weigert de beheerder van een andere vereniging`, async () => {
        const antwoord = await als(andereBeheerderToken, route.methode, route.pad);
        expect(antwoord.status).toBe(403);
      });

      it(`${route.naam} weigert een verzoek zonder token`, async () => {
        const antwoord = await request(app)[route.methode](`/api/backup${route.pad}`);
        expect(antwoord.status).toBe(401);
      });
    }

    it('zegt waarom het niet mag', async () => {
      const antwoord = await als(beheerderToken, 'get', '/info');
      expect(antwoord.body.error).toBe('Super admin rechten vereist.');
    });
  });

  describe('een super-admin komt er wel langs', () => {
    it('GET /backup/info geeft antwoord', async () => {
      const antwoord = await als(superAdminToken, 'get', '/info');
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
    });

    it('POST /backup/restore zonder bestand geeft een nette 400', async () => {
      // Langs de rechtencontrole heen, dus tot aan de inhoudelijke controle:
      // "geen bestand" is dan het juiste antwoord, geen 403.
      const antwoord = await als(superAdminToken, 'post', '/restore');
      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toContain('backup');
    });
  });

  describe('bestandsnamen uit een reservekopie', () => {
    /**
     * De namen in manifest.json komen uit het aangeleverde zipbestand en zijn
     * dus door de aanleveraar bepaald. Ze gingen rechtstreeks in path.join().
     * De controle op padverkeer die verderop staat kijkt alleen naar entryName
     * - de naam van de zip-ingang - en niet naar storedName uit het manifest,
     * dus die werd volledig omzeild: een manifest dat
     * `../../../etc/cron.d/iets` opgaf schreef daar ook.
     */
    it('laat een gewone bestandsnaam door', () => {
      expect(isVeiligeBestandsnaam('partij-trompet.pdf')).toBe(true);
    });

    it('laat een naam met punten erin door, die is geen pad', () => {
      expect(isVeiligeBestandsnaam('mars.der.medici.pdf')).toBe(true);
    });

    it('weigert een naam die uit de map wijst', () => {
      expect(isVeiligeBestandsnaam('../../../etc/cron.d/iets')).toBe(false);
    });

    it('weigert een naam met een submap erin', () => {
      expect(isVeiligeBestandsnaam('submap/partij.pdf')).toBe(false);
    });

    it('weigert een absoluut pad', () => {
      expect(isVeiligeBestandsnaam('/etc/passwd')).toBe(false);
    });

    it('weigert een lege naam en de puntnamen', () => {
      expect(isVeiligeBestandsnaam('')).toBe(false);
      expect(isVeiligeBestandsnaam('.')).toBe(false);
      expect(isVeiligeBestandsnaam('..')).toBe(false);
    });

    it('weigert een naam die na normaliseren nog steeds uit de map wijst', () => {
      expect(isVeiligeBestandsnaam('iets/../../buiten.pdf')).toBe(false);
    });
  });

  describe('de grens rond de doelmap', () => {
    /**
     * De controle bij de schrijfopdracht gebruikt aan beide kanten
     * path.resolve. Dat is geen detail: met path.join blijft het samengestelde
     * pad relatief als UPLOAD_DIR dat is - en die is via de omgeving te zetten
     * - terwijl de grens ernaast absoluut is. De vergelijking gaat dan altijd
     * mis, en het terugzetten slaat stilzwijgend elk bestand over.
     *
     * Deze test doet de vergelijking na met een relatieve map, precies zoals
     * de route hem doet.
     */
    const binnenDeGrens = (map: string, naam: string) =>
      path.resolve(map, naam).startsWith(path.resolve(map) + path.sep);

    it('laat een gewoon bestand door bij een absolute map', () => {
      expect(binnenDeGrens('/var/data/uploads', 'partij.pdf')).toBe(true);
    });

    it('laat een gewoon bestand ook door bij een relatieve map', () => {
      expect(binnenDeGrens('./uploads', 'partij.pdf')).toBe(true);
    });

    it('weigert een ontsnapping bij een absolute map', () => {
      expect(binnenDeGrens('/var/data/uploads', '../../buiten.pdf')).toBe(false);
    });

    it('weigert een ontsnapping bij een relatieve map', () => {
      expect(binnenDeGrens('./uploads', '../../buiten.pdf')).toBe(false);
    });

    it('weigert een map die alleen als tekst op de doelmap lijkt', () => {
      // /var/data/uploads-extern begint als tekst met /var/data/uploads, maar
      // is een andere map. Het scheidingsteken in de grens vangt dat.
      const doel = path.resolve('/var/data/uploads-extern/partij.pdf');
      expect(doel.startsWith(path.resolve('/var/data/uploads') + path.sep)).toBe(false);
    });
  });

  describe('super-admin is niet hetzelfde als beheerder', () => {
    it('een super-admin die geen beheerder is mag er ook langs', async () => {
      const superLid = createTestUser(vereniging.id, { email: 'superlid@test.nl', role: 'member' });
      db.prepare('INSERT INTO super_admins (id, user_id) VALUES (?, ?)').run(uuidv4(), superLid.id);

      const antwoord = await als(generateTestToken(superLid), 'get', '/info');
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
    });

    it('een ingetrokken super-admin mag er niet meer langs', async () => {
      db.prepare('DELETE FROM super_admins WHERE user_id = ?').run(superAdmin.id);

      const antwoord = await als(superAdminToken, 'get', '/info');
      expect(antwoord.status).toBe(403);
    });
  });
});
