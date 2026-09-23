/**
 * Het beheerscherm voor achtergrondtaken: de wachtrij bekijken en een
 * mislukte taak opnieuw proberen.
 *
 * Alleen voor superbeheerders. De taken zijn nu allemaal systeemtaken
 * (back-up, AVG-opschoning, meldingen) die bij geen vereniging horen; een
 * beheerder van één vereniging heeft er niets te zoeken, ook niet om te zien
 * welke er mislukten.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import achtergrondtakenRoutes from '../../routes/achtergrondtaken';
import { errorHandler } from '../../middleware/errorHandler';
import { plaatsTaak } from '../../taken/wachtrij';
import { createTestEnvironment, createTestUser, generateTestToken } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/achtergrondtaken', achtergrondtakenRoutes);
app.use(errorHandler);

/** Een taak in een bepaalde toestand, zoals de werker hem zou achterlaten. */
function taak(soort: string, status: string, extra: { laatste_fout?: string; pogingen?: number } = {}): string {
  const id = plaatsTaak(soort, {}, {})!;
  db.prepare(
    `UPDATE achtergrondtaken SET status = ?, laatste_fout = ?, pogingen = ?,
            afgerond_op = CASE WHEN ? IN ('gelukt', 'mislukt') THEN bijgewerkt_op END
      WHERE id = ?`,
  ).run(status, extra.laatste_fout ?? null, extra.pogingen ?? 0, status, id);
  return id;
}

const rij = (id: string) =>
  db.prepare('SELECT status, pogingen, laatste_fout, afgerond_op FROM achtergrondtaken WHERE id = ?').get(id) as {
    status: string;
    pogingen: number;
    laatste_fout: string | null;
    afgerond_op: string | null;
  };

describe('het beheerscherm voor achtergrondtaken', () => {
  let superToken: string;
  let beheerderToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    beheerderToken = omgeving.adminToken;
    const superbeheerder = createTestUser(omgeving.association.id, { email: 'super@test.nl', role: 'admin' });
    db.prepare('INSERT INTO super_admins (id, user_id) VALUES (?, ?)').run(uuidv4(), superbeheerder.id);
    superToken = generateTestToken(superbeheerder);
  });

  const lijst = (token: string, query = '') =>
    request(app).get(`/api/achtergrondtaken${query}`).set('Authorization', `Bearer ${token}`);
  const opnieuw = (token: string, id: string) =>
    request(app).post(`/api/achtergrondtaken/${id}/opnieuw`).set('Authorization', `Bearer ${token}`);

  describe('wie erbij mag', () => {
    it('vraagt om aanmelden', async () => {
      expect((await request(app).get('/api/achtergrondtaken')).status).toBe(401);
    });

    it('weigert een gewone beheerder van een vereniging', async () => {
      expect((await lijst(beheerderToken)).status).toBe(403);
    });

    it('laat een gewone beheerder ook geen taak opnieuw proberen', async () => {
      const id = taak('database-back-up', 'mislukt', { laatste_fout: 'schijf vol' });
      expect((await opnieuw(beheerderToken, id)).status).toBe(403);
      expect(rij(id).status).toBe('mislukt');
    });
  });

  describe('de lijst', () => {
    it('toont de taken met hun status, pogingen en fout', async () => {
      const id = taak('database-back-up', 'mislukt', { laatste_fout: 'schijf vol', pogingen: 3 });

      const antwoord = await lijst(superToken);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.data).toHaveLength(1);
      expect(antwoord.body.data[0]).toMatchObject({
        id,
        soort: 'database-back-up',
        status: 'mislukt',
        pogingen: 3,
        laatste_fout: 'schijf vol',
      });
      expect(antwoord.body.pagination).toMatchObject({ page: 1, total: 1 });
    });

    it('telt per status, los van het filter', async () => {
      taak('a', 'wachtend');
      taak('b', 'gelukt');
      taak('c', 'gelukt');
      taak('d', 'mislukt');

      const antwoord = await lijst(superToken, '?status=mislukt');
      expect(antwoord.body.data).toHaveLength(1);
      expect(antwoord.body.tellingen).toEqual({ wachtend: 1, bezig: 0, gelukt: 2, mislukt: 1 });
    });

    it('filtert op soort', async () => {
      taak('database-back-up', 'gelukt');
      taak('avg-opschonen', 'gelukt');

      const antwoord = await lijst(superToken, '?soort=avg-opschonen');
      expect(antwoord.body.data.map((t: { soort: string }) => t.soort)).toEqual(['avg-opschonen']);
    });

    it('pagineert', async () => {
      for (let i = 0; i < 5; i++) taak('iets', 'gelukt');
      const antwoord = await lijst(superToken, '?limit=2&page=2');
      expect(antwoord.body.data).toHaveLength(2);
      expect(antwoord.body.pagination).toMatchObject({ page: 2, limit: 2, total: 5, totalPages: 3 });
    });

    it('weigert een status die niet bestaat', async () => {
      expect((await lijst(superToken, '?status=kwijt')).status).toBe(400);
    });

    it('weigert een soort met tekens die er niet in horen', async () => {
      expect((await lijst(superToken, "?soort=x' OR 1=1")).status).toBe(400);
    });
  });

  describe('opnieuw proberen', () => {
    it('zet een mislukte taak terug in de wachtrij, met een verse teller', async () => {
      const id = taak('database-back-up', 'mislukt', { laatste_fout: 'schijf vol', pogingen: 3 });

      const antwoord = await opnieuw(superToken, id);
      expect(antwoord.status).toBe(200);

      const na = rij(id);
      expect(na.status).toBe('wachtend');
      expect(na.pogingen).toBe(0);
      expect(na.afgerond_op).toBeNull();
      // De fout blijft zichtbaar tot de volgende poging.
      expect(na.laatste_fout).toBe('schijf vol');
    });

    it.each(['wachtend', 'bezig', 'gelukt'])('weigert een taak die %s is', async (status) => {
      const id = taak('iets', status);
      const antwoord = await opnieuw(superToken, id);
      expect(antwoord.status).toBe(409);
      expect(rij(id).status).toBe(status);
    });

    it('meldt een taak die niet bestaat', async () => {
      expect((await opnieuw(superToken, uuidv4())).status).toBe(404);
    });

    it('weigert iets dat geen id is', async () => {
      expect((await opnieuw(superToken, 'geen-id')).status).toBe(400);
    });
  });
});
