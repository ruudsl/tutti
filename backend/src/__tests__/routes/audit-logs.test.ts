/**
 * Het logboek: wie deed wat, wanneer, met welk ip-adres en welke browser.
 *
 * 321 regels zonder test, en het woord association_id kwam er niet in voor -
 * niet in de route en niet in de tabel. De route staat op requireRole('admin'),
 * de beheerder van een vereniging, en gaf zonder enig filter het logboek van
 * de hele installatie terug. Elke beheerder kon zo meelezen wat er bij elke
 * andere vereniging gebeurde, inclusief de namen van de objecten waar het over
 * ging en de ip-adressen van hun leden.
 *
 * De tabel kan het nu ook: association_id komt van het lid dat de handeling
 * deed, vastgelegd op dat moment. Niet later uit users halen - een lid kan van
 * vereniging wisselen, en dan zou zijn logboek meeverhuizen naar een
 * vereniging waar die handelingen nooit hebben plaatsgevonden.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import '../setup';
import db from '../../database/connection';

// De testopzet vervangt dit hele bestand door een lege logAuditEvent, zodat
// tests van andere routes niet ook nog logregels wegschrijven. Hier is het
// juist het onderwerp, dus hier draait het echte bestand.
vi.unmock('../../routes/audit-logs');
const { default: auditLogRoutes, logAuditEvent } =
  await vi.importActual<typeof import('../../routes/audit-logs')>('../../routes/audit-logs');
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
app.use('/api/audit-logs', auditLogRoutes);
app.use(errorHandler);

describe('logboek', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;

  let andereVereniging: TestAssociation;
  let andereBeheerder: TestUser;
  let andereBeheerderToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;

    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
    andereBeheerder = createTestUser(andereVereniging.id, { email: 'beheer@elders.nl', role: 'admin' });
    andereBeheerderToken = generateTestToken(andereBeheerder);
  });

  const als = (token: string, pad = '/') =>
    request(app).get(`/api/audit-logs${pad}`).set('Authorization', `Bearer ${token}`);

  const namen = (body: { logs: { entityName: string }[] }) => body.logs.map((l) => l.entityName);

  describe('wie erbij mag', () => {
    it('weigert een gewoon lid', async () => {
      expect((await als(lidToken)).status).toBe(403);
    });

    it('weigert een verzoek zonder token', async () => {
      expect((await request(app).get('/api/audit-logs')).status).toBe(401);
    });

    it('laat een beheerder toe', async () => {
      expect((await als(beheerderToken)).status).toBe(200);
    });
  });

  describe('de verenigingsgrens', () => {
    it('geeft een regel van de eigen vereniging terug', async () => {
      logAuditEvent(beheerder.id, 'update', 'orchestra', 'orkest-1', 'Harmonieorkest');
      const antwoord = await als(beheerderToken);
      expect(namen(antwoord.body)).toEqual(['Harmonieorkest']);
    });

    it('geeft geen regel van een andere vereniging', async () => {
      logAuditEvent(andereBeheerder.id, 'delete', 'orchestra', 'orkest-2', 'Fanfare Elders');
      const antwoord = await als(beheerderToken);
      expect(namen(antwoord.body)).not.toContain('Fanfare Elders');
    });

    it('houdt twee verenigingen volledig gescheiden', async () => {
      logAuditEvent(beheerder.id, 'create', 'concert', 'c1', 'Ons concert');
      logAuditEvent(andereBeheerder.id, 'create', 'concert', 'c2', 'Hun concert');

      expect(namen((await als(beheerderToken)).body)).toEqual(['Ons concert']);
      expect(namen((await als(andereBeheerderToken)).body)).toEqual(['Hun concert']);
    });

    it('telt het totaal alleen over de eigen vereniging', async () => {
      logAuditEvent(beheerder.id, 'create', 'concert', 'c1', 'Ons concert');
      for (let i = 0; i < 5; i++) {
        logAuditEvent(andereBeheerder.id, 'create', 'concert', `x${i}`, `Hun concert ${i}`);
      }

      const antwoord = await als(beheerderToken);
      expect(antwoord.body.total).toBe(1);
    });

    it('lekt ook niet via het filter op gebruiker', async () => {
      logAuditEvent(andereBeheerder.id, 'delete', 'member', 'm1', 'Lid van elders');
      const antwoord = await als(beheerderToken, `/?userId=${andereBeheerder.id}`);
      expect(antwoord.body.logs).toHaveLength(0);
    });

    it('lekt ook niet via het filter op soort object', async () => {
      logAuditEvent(andereBeheerder.id, 'delete', 'invoice', 'f1', 'Factuur van elders');
      const antwoord = await als(beheerderToken, '/?entityType=invoice');
      expect(antwoord.body.logs).toHaveLength(0);
    });
  });

  describe('wat er wordt vastgelegd', () => {
    it('legt de vereniging vast van het lid dat de handeling deed', async () => {
      logAuditEvent(beheerder.id, 'update', 'orchestra', 'o1', 'Harmonieorkest');
      const rij = db.prepare('SELECT association_id FROM audit_logs WHERE entity_id = ?').get('o1') as {
        association_id: string;
      };
      expect(rij.association_id).toBe(vereniging.id);
    });

    it('laat een regel bij de oude vereniging staan als het lid overstapt', async () => {
      logAuditEvent(beheerder.id, 'update', 'orchestra', 'o1', 'Harmonieorkest');
      db.prepare('UPDATE users SET association_id = ? WHERE id = ?').run(andereVereniging.id, beheerder.id);

      // De handeling gebeurde bij de eerste vereniging en hoort daar te blijven.
      const rij = db.prepare('SELECT association_id FROM audit_logs WHERE entity_id = ?').get('o1') as {
        association_id: string;
      };
      expect(rij.association_id).toBe(vereniging.id);

      const antwoord = await als(andereBeheerderToken);
      expect(namen(antwoord.body)).not.toContain('Harmonieorkest');
    });

    it('legt de naam van het lid erbij', async () => {
      logAuditEvent(beheerder.id, 'update', 'orchestra', 'o1', 'Harmonieorkest');
      const antwoord = await als(beheerderToken);
      expect(antwoord.body.logs[0].userName).toBe(`${beheerder.firstName} ${beheerder.lastName}`);
    });

    it('bewaart ip-adres en browser', async () => {
      logAuditEvent(beheerder.id, 'login', 'session', 's1', undefined, undefined, '10.0.0.5', 'Firefox');
      const antwoord = await als(beheerderToken);
      expect(antwoord.body.logs[0].ipAddress).toBe('10.0.0.5');
      expect(antwoord.body.logs[0].userAgent).toBe('Firefox');
    });

    it('geeft de wijzigingen ontleed terug, niet als tekst', async () => {
      logAuditEvent(beheerder.id, 'update', 'orchestra', 'o1', 'Harmonieorkest', {
        fields: [{ field: 'name', from: 'Oud', to: 'Nieuw' }],
      });
      const antwoord = await als(beheerderToken);
      expect(antwoord.body.logs[0].changes).toEqual({
        fields: [{ field: 'name', from: 'Oud', to: 'Nieuw' }],
      });
    });

    it('geeft null terug wanneer er niets is vastgelegd', async () => {
      logAuditEvent(beheerder.id, 'login', 'session', 's1');
      const antwoord = await als(beheerderToken);
      expect(antwoord.body.logs[0].changes).toBeNull();
    });
  });

  describe('filteren en bladeren', () => {
    beforeEach(() => {
      logAuditEvent(beheerder.id, 'create', 'concert', 'c1', 'Nieuwjaarsconcert');
      logAuditEvent(beheerder.id, 'update', 'concert', 'c2', 'Kerstconcert');
      logAuditEvent(beheerder.id, 'delete', 'orchestra', 'o1', 'Slagwerkgroep');
    });

    it('filtert op handeling', async () => {
      const antwoord = await als(beheerderToken, '/?action=delete');
      expect(namen(antwoord.body)).toEqual(['Slagwerkgroep']);
    });

    it('filtert op soort object', async () => {
      const antwoord = await als(beheerderToken, '/?entityType=concert');
      expect(namen(antwoord.body).sort()).toEqual(['Kerstconcert', 'Nieuwjaarsconcert']);
    });

    it('filtert op gebruiker', async () => {
      const ander = createTestUser(vereniging.id, { email: 'tweede@test.nl', role: 'admin' });
      logAuditEvent(ander.id, 'create', 'concert', 'c9', 'Van de tweede beheerder');

      const antwoord = await als(beheerderToken, `/?userId=${ander.id}`);
      expect(namen(antwoord.body)).toEqual(['Van de tweede beheerder']);
    });

    it('bladert', async () => {
      const eerste = await als(beheerderToken, '/?page=1&pageSize=2');
      const tweede = await als(beheerderToken, '/?page=2&pageSize=2');

      expect(eerste.body.logs).toHaveLength(2);
      expect(tweede.body.logs).toHaveLength(1);
      expect(eerste.body.total).toBe(3);
    });

    it('houdt de paginagrootte op ten hoogste honderd', async () => {
      const antwoord = await als(beheerderToken, '/?pageSize=9999');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.logs.length).toBeLessThanOrEqual(100);
    });

    it('valt terug op de eerste pagina bij onzin', async () => {
      const antwoord = await als(beheerderToken, '/?page=onzin');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.logs).toHaveLength(3);
    });
  });
});
