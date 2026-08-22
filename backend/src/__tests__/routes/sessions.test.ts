/**
 * Sessiebeheer: het overzicht van actieve sessies en het intrekken ervan.
 *
 * 172 regels zonder test, terwijl dit precies de plek is waar een gebruiker
 * een gestolen of vergeten aanmelding moet kunnen beëindigen. Drie dingen
 * moeten daarvoor kloppen:
 *
 * 1. Alles is afgebakend op de eigen gebruiker. Een sessie van iemand anders
 *    hoort niet in het overzicht en is niet in te trekken - ook niet met een
 *    id dat je toevallig kent, en ook niet als die ander bij een andere
 *    vereniging zit.
 * 2. DELETE /all spaart je huidige token, anders sluit je jezelf buiten in
 *    plaats van de indringer.
 * 3. Het overzicht geeft geen token_hash terug. Die hash is precies wat de
 *    authenticatie opzoekt; hem teruggeven zou het bewaarde geheim alsnog
 *    over de lijn sturen.
 *
 * Bij het schrijven kwam de vervaltijd als echte fout boven water: zie de
 * test 'verzwijgt een sessie die vandaag al verlopen is'.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import sessionRoutes from '../../routes/sessions';
import { errorHandler } from '../../middleware/errorHandler';
import { hashToken } from '../../utils/sessionStore';
import {
  createTestEnvironment,
  TestUser,
  createTestAssociation,
  createTestUser,
  generateTestToken,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/sessions', sessionRoutes);
app.use(errorHandler);

describe('sessies', () => {
  let lid: TestUser;
  let lidToken: string;
  let anderLid: TestUser;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    anderLid = omgeving.musicCommitteeUser;
  });

  /** Een week vooruit, in hetzelfde formaat als registerSession() wegschrijft. */
  function overEenWeek(): string {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  /**
   * Een tijdstip dat vandaag al voorbij is, uitgedrukt in de datum die SQLite
   * zelf hanteert. Bewust niet `Date.now() - een uur`: rond middernacht UTC
   * zou dat op de vorige dag uitkomen, en juist de gelijke datum is wat deze
   * vergelijking blootlegt.
   */
  function vandaagAlVerlopen(): string {
    const nu = db.prepare("SELECT datetime('now') AS nu").get() as { nu: string };
    return `${nu.nu.slice(0, 10)}T00:00:00.000Z`;
  }

  function maakSessie(
    userId: string,
    token: string,
    opties: { expiresAt?: string; revokedAt?: string; userAgent?: string } = {},
  ): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO user_sessions (id, user_id, token_hash, ip_address, user_agent, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      userId,
      hashToken(token),
      '10.0.0.1',
      opties.userAgent ?? 'Testbrowser',
      opties.expiresAt ?? overEenWeek(),
      opties.revokedAt ?? null,
    );
    return id;
  }

  function ingetrokken(sessieId: string): boolean {
    const rij = db.prepare('SELECT revoked_at FROM user_sessions WHERE id = ?').get(sessieId) as
      { revoked_at: string | null } | undefined;
    return !!rij?.revoked_at;
  }

  const alsLid = (methode: 'get' | 'delete', pad: string) =>
    request(app)[methode](`/api/sessions${pad}`).set('Authorization', `Bearer ${lidToken}`);

  describe('GET /sessions', () => {
    it('geeft de eigen sessies', async () => {
      maakSessie(lid.id, lidToken, { userAgent: 'Deze browser' });
      maakSessie(lid.id, 'token-op-de-telefoon', { userAgent: 'Telefoon' });

      const antwoord = await alsLid('get', '/');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.map((s: { userAgent: string }) => s.userAgent).sort()).toEqual(['Deze browser', 'Telefoon']);
    });

    it('geeft geen sessies van een ander lid', async () => {
      maakSessie(lid.id, lidToken);
      const vanDeAnder = maakSessie(anderLid.id, 'token-van-de-ander');

      const antwoord = await alsLid('get', '/');

      expect(antwoord.body.map((s: { id: string }) => s.id)).not.toContain(vanDeAnder);
      expect(antwoord.body).toHaveLength(1);
    });

    it('geeft geen sessies van een lid van een andere vereniging', async () => {
      // De sessietabel kent geen association_id; de afbakening loopt via
      // user_id. Deze test legt vast dat dat ook over de verenigingsgrens
      // heen genoeg is.
      const andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
      const vreemdeling = createTestUser(andereVereniging.id, { email: 'lid@andere-vereniging.test', role: 'admin' });
      maakSessie(lid.id, lidToken);
      const vanDeVreemdeling = maakSessie(vreemdeling.id, 'token-van-de-vreemdeling');

      const antwoord = await alsLid('get', '/');

      expect(antwoord.body.map((s: { id: string }) => s.id)).not.toContain(vanDeVreemdeling);
    });

    it('markeert de sessie van het meegestuurde token als de huidige', async () => {
      const deze = maakSessie(lid.id, lidToken);
      const andere = maakSessie(lid.id, 'token-op-de-telefoon');

      const antwoord = await alsLid('get', '/');

      const perId = Object.fromEntries(
        antwoord.body.map((s: { id: string; isCurrent: boolean }) => [s.id, s.isCurrent]),
      );
      expect(perId[deze]).toBe(true);
      expect(perId[andere]).toBe(false);
    });

    it('geeft de token_hash niet terug', async () => {
      // De hash is waar de authenticatie een sessie op opzoekt. Hij staat wel
      // in de SELECT (voor isCurrent) maar mag het antwoord niet uit.
      maakSessie(lid.id, lidToken);

      const antwoord = await alsLid('get', '/');

      const alsTekst = JSON.stringify(antwoord.body);
      expect(alsTekst).not.toContain(hashToken(lidToken));
      expect(Object.keys(antwoord.body[0])).not.toContain('token_hash');
      expect(Object.keys(antwoord.body[0])).not.toContain('tokenHash');
    });

    it('verzwijgt een ingetrokken sessie', async () => {
      maakSessie(lid.id, lidToken);
      const ingetrokkenSessie = maakSessie(lid.id, 'oud-token', { revokedAt: new Date().toISOString() });

      const antwoord = await alsLid('get', '/');

      expect(antwoord.body.map((s: { id: string }) => s.id)).not.toContain(ingetrokkenSessie);
    });

    it('verzwijgt een sessie die vandaag al verlopen is', async () => {
      // registerSession() schrijft expires_at weg als ISO-tekst
      // ('2026-08-21T09:00:00.000Z'), terwijl datetime('now') een spatie
      // gebruikt ('2026-08-21 19:00:00'). Bij een tekstvergelijking wint de
      // 'T' van de spatie, dus elke sessie die vandaag verliep gold de rest
      // van de dag nog als actief. Precies andersom dan bedoeld: een
      // verlopen sessie hoort te verdwijnen, niet te blijven staan.
      maakSessie(lid.id, lidToken);
      const verlopen = maakSessie(lid.id, 'verlopen-token', { expiresAt: vandaagAlVerlopen() });

      const antwoord = await alsLid('get', '/');

      expect(antwoord.body.map((s: { id: string }) => s.id)).not.toContain(verlopen);
    });

    it('toont een sessie die pas volgende week verloopt wel', async () => {
      const geldig = maakSessie(lid.id, lidToken, { expiresAt: overEenWeek() });

      const antwoord = await alsLid('get', '/');

      expect(antwoord.body.map((s: { id: string }) => s.id)).toContain(geldig);
    });

    it('weigert een verzoek zonder token', async () => {
      const antwoord = await request(app).get('/api/sessions/');
      expect(antwoord.status).toBe(401);
    });
  });

  describe('DELETE /sessions/:id', () => {
    it('trekt de eigen sessie in', async () => {
      maakSessie(lid.id, lidToken);
      const telefoon = maakSessie(lid.id, 'token-op-de-telefoon');

      const antwoord = await alsLid('delete', `/${telefoon}`);

      expect(antwoord.status).toBe(200);
      expect(ingetrokken(telefoon)).toBe(true);
    });

    it('laat een ingetrokken sessie uit het overzicht verdwijnen', async () => {
      maakSessie(lid.id, lidToken);
      const telefoon = maakSessie(lid.id, 'token-op-de-telefoon');

      await alsLid('delete', `/${telefoon}`);
      const antwoord = await alsLid('get', '/');

      expect(antwoord.body.map((s: { id: string }) => s.id)).not.toContain(telefoon);
    });

    it('trekt de sessie van een ander lid niet in', async () => {
      // Het id staat in het pad, dus een gebruiker kan er alles invullen wat
      // hij wil. Zonder de user_id-controle in de UPDATE zou een lid iedereen
      // kunnen uitloggen van wie hij een sessie-id kent.
      maakSessie(lid.id, lidToken);
      const vanDeAnder = maakSessie(anderLid.id, 'token-van-de-ander');

      const antwoord = await alsLid('delete', `/${vanDeAnder}`);

      expect(antwoord.status).toBe(404);
      expect(ingetrokken(vanDeAnder)).toBe(false);
    });

    it('trekt de sessie van een lid van een andere vereniging niet in', async () => {
      const andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
      const vreemdeling = createTestUser(andereVereniging.id, {
        email: 'beheer@andere-vereniging.test',
        role: 'admin',
      });
      maakSessie(lid.id, lidToken);
      const vanDeVreemdeling = maakSessie(vreemdeling.id, 'token-van-de-vreemdeling');

      const antwoord = await alsLid('delete', `/${vanDeVreemdeling}`);

      expect(antwoord.status).toBe(404);
      expect(ingetrokken(vanDeVreemdeling)).toBe(false);
    });

    it('geeft 404 voor een onbekend sessie-id', async () => {
      maakSessie(lid.id, lidToken);
      const antwoord = await alsLid('delete', `/${uuidv4()}`);
      expect(antwoord.status).toBe(404);
    });

    it('geeft 404 als de sessie al was ingetrokken', async () => {
      maakSessie(lid.id, lidToken);
      const alIngetrokken = maakSessie(lid.id, 'oud-token', { revokedAt: new Date().toISOString() });

      const antwoord = await alsLid('delete', `/${alIngetrokken}`);

      expect(antwoord.status).toBe(404);
    });

    it('weigert een verzoek zonder token', async () => {
      const sessie = maakSessie(lid.id, lidToken);
      const antwoord = await request(app).delete(`/api/sessions/${sessie}`);
      expect(antwoord.status).toBe(401);
      expect(ingetrokken(sessie)).toBe(false);
    });
  });

  describe('DELETE /sessions/all', () => {
    it('trekt de andere sessies in maar spaart de huidige', async () => {
      const huidige = maakSessie(lid.id, lidToken);
      const telefoon = maakSessie(lid.id, 'token-op-de-telefoon');
      const tablet = maakSessie(lid.id, 'token-op-de-tablet');

      const antwoord = await alsLid('delete', '/all');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.revokedCount).toBe(2);
      expect(ingetrokken(huidige)).toBe(false);
      expect(ingetrokken(telefoon)).toBe(true);
      expect(ingetrokken(tablet)).toBe(true);
    });

    it('wordt niet als sessie-id gelezen', async () => {
      // Express kiest de eerste route die past. Stond '/:id' boven '/all',
      // dan belandde dit verzoek daar met id 'all', vond niets en gaf 404 -
      // terwijl de gebruiker denkt dat hij overal is uitgelogd.
      maakSessie(lid.id, lidToken);
      maakSessie(lid.id, 'token-op-de-telefoon');

      const antwoord = await alsLid('delete', '/all');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.message).not.toMatch(/niet gevonden/i);
    });

    it('raakt de sessies van een ander lid niet aan', async () => {
      maakSessie(lid.id, lidToken);
      const vanDeAnder = maakSessie(anderLid.id, 'token-van-de-ander');

      const antwoord = await alsLid('delete', '/all');

      expect(antwoord.body.revokedCount).toBe(0);
      expect(ingetrokken(vanDeAnder)).toBe(false);
    });

    it('telt een al ingetrokken sessie niet nog een keer mee', async () => {
      maakSessie(lid.id, lidToken);
      maakSessie(lid.id, 'oud-token', { revokedAt: new Date().toISOString() });
      maakSessie(lid.id, 'token-op-de-telefoon');

      const antwoord = await alsLid('delete', '/all');

      expect(antwoord.body.revokedCount).toBe(1);
    });

    it('spaart ook de huidige sessie als het token in de queryparameter staat', async () => {
      // authenticateToken accepteert een volledig token nog via ?token=; dan
      // moet de route dat token ook als 'de huidige' herkennen, anders logt
      // de gebruiker zichzelf alsnog uit.
      const huidige = maakSessie(lid.id, lidToken);
      const telefoon = maakSessie(lid.id, 'token-op-de-telefoon');

      const antwoord = await request(app).delete(`/api/sessions/all?token=${lidToken}`);

      expect(antwoord.status).toBe(200);
      expect(ingetrokken(huidige)).toBe(false);
      expect(ingetrokken(telefoon)).toBe(true);
    });

    it('weigert een verzoek zonder token', async () => {
      const huidige = maakSessie(lid.id, lidToken);
      const antwoord = await request(app).delete('/api/sessions/all');
      expect(antwoord.status).toBe(401);
      expect(ingetrokken(huidige)).toBe(false);
    });

    it('werkt ook voor een lid dat nog geen enkele sessie in de tabel heeft', async () => {
      // De middleware registreert een onbekend token alsnog; daarna hoort er
      // niets ingetrokken te worden behalve die ene nieuwe sessie niet.
      const nieuwToken = generateTestToken(anderLid);

      const antwoord = await request(app).delete('/api/sessions/all').set('Authorization', `Bearer ${nieuwToken}`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.revokedCount).toBe(0);
    });
  });
});
