/**
 * De grenzen uit het abonnement op de plekken waar er iets bij komt.
 *
 * De service telt en weigert; deze tests leggen vast dat de vier routes die
 * een lid of orkest toevoegen die weigering ook echt afwachten - en dat ze een
 * 409 met uitleg geven in plaats van een 500 of een stille toevoeging.
 *
 * De uitnodiging wordt op twee momenten gewogen: bij versturen, zodat de
 * uitgenodigde niet voor niets een mail krijgt, en bij aannemen, omdat daar tot
 * een week tussen kan zitten.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import '../setup';
import db from '../../database/connection';
import usersRoutes from '../../routes/users';
import orchestraRoutes from '../../routes/orchestras';
import multiAssociationRoutes from '../../routes/multi-association';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestEnvironment,
  createTestUser,
  createTestOrchestra,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/users', usersRoutes);
app.use('/api/orchestras', orchestraRoutes);
app.use('/api/multi-association', multiAssociationRoutes);
app.use(errorHandler);

describe('grenzen uit het abonnement', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
  });

  const zetLimiet = (kolom: 'max_members' | 'max_orchestras', waarde: number | null) =>
    db.prepare(`UPDATE associations SET ${kolom} = ? WHERE id = ?`).run(waarde, vereniging.id);

  const nieuwLid = {
    email: 'nieuw@test.nl',
    password: 'eenLangGenoegWachtwoord1!',
    firstName: 'Nieuw',
    lastName: 'Lid',
    role: 'member',
  };

  describe('POST /users', () => {
    it('voegt een lid toe zolang er ruimte is', async () => {
      zetLimiet('max_members', 100);
      const antwoord = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${beheerderToken}`)
        .send(nieuwLid);
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    });

    it('weigert zodra de vereniging vol zit', async () => {
      // createTestEnvironment maakt er al drie.
      zetLimiet('max_members', 3);
      const antwoord = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${beheerderToken}`)
        .send(nieuwLid);

      expect(antwoord.status).toBe(409);
      expect(antwoord.body.error).toMatch(/maximum van 3 leden/);
    });

    it('voegt bij een geweigerd verzoek niets toe', async () => {
      zetLimiet('max_members', 3);
      await request(app).post('/api/users').set('Authorization', `Bearer ${beheerderToken}`).send(nieuwLid);

      const bestaat = db.prepare('SELECT id FROM users WHERE email = ?').get(nieuwLid.email);
      expect(bestaat).toBeUndefined();
    });

    it('houdt niets tegen zonder ingevulde grens', async () => {
      zetLimiet('max_members', null);
      const antwoord = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${beheerderToken}`)
        .send(nieuwLid);
      expect(antwoord.status).toBe(201);
    });
  });

  describe('POST /orchestras', () => {
    it('maakt een orkest zolang er ruimte is', async () => {
      zetLimiet('max_orchestras', 2);
      const antwoord = await request(app)
        .post('/api/orchestras')
        .set('Authorization', `Bearer ${beheerderToken}`)
        .send({ name: 'Harmonieorkest' });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    });

    it('weigert zodra de grens bereikt is', async () => {
      createTestOrchestra(vereniging.id, { name: 'Bestaand orkest' });
      zetLimiet('max_orchestras', 1);

      const antwoord = await request(app)
        .post('/api/orchestras')
        .set('Authorization', `Bearer ${beheerderToken}`)
        .send({ name: 'Nog een orkest' });

      expect(antwoord.status).toBe(409);
      expect(antwoord.body.error).toMatch(/maximum van 1 orkesten/);
    });
  });

  describe('uitnodigingen', () => {
    it('weigert een uitnodiging als de vereniging al vol zit', async () => {
      zetLimiet('max_members', 3);
      const antwoord = await request(app)
        .post('/api/multi-association/invitations')
        .set('Authorization', `Bearer ${beheerderToken}`)
        .send({ email: 'gast@test.nl', role: 'member' });

      expect(antwoord.status).toBe(409);
      expect(antwoord.body.error).toMatch(/maximum van 3 leden/);
    });

    it('verstuurt een uitnodiging zolang er ruimte is', async () => {
      zetLimiet('max_members', 10);
      const antwoord = await request(app)
        .post('/api/multi-association/invitations')
        .set('Authorization', `Bearer ${beheerderToken}`)
        .send({ email: 'gast@test.nl', role: 'member' });

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    });

    it('weigert het aannemen als de vereniging ondertussen is volgelopen', async () => {
      zetLimiet('max_members', 10);
      const versturen = await request(app)
        .post('/api/multi-association/invitations')
        .set('Authorization', `Bearer ${beheerderToken}`)
        .send({ email: 'gast@test.nl', role: 'member' });
      expect(versturen.status).toBe(201);

      const token = db.prepare('SELECT token FROM association_invitations WHERE email = ?').get('gast@test.nl') as {
        token: string;
      };

      // De vereniging loopt vol in de week dat de uitnodiging openstaat.
      zetLimiet('max_members', 3);

      const gast = createTestUser(vereniging.id, { email: 'gast@test.nl', id: undefined });
      db.prepare('UPDATE users SET association_id = ? WHERE id = ?').run(null, gast.id);

      const aannemen = await request(app)
        .post(`/api/multi-association/invitations/accept/${token.token}`)
        .set('Authorization', `Bearer ${generateTestToken({ ...gast, associationId: vereniging.id })}`);

      expect(aannemen.status).toBe(409);
      expect(aannemen.body.error).toMatch(/maximum van 3 leden/);
    });
  });

  describe('het getal op het beheerscherm', () => {
    it('telt hetzelfde als de grens telt: zonder verwijderde leden', async () => {
      const weg = createTestUser(vereniging.id, { email: 'weg@test.nl' });
      db.prepare('UPDATE users SET deleted_at = ? WHERE id = ?').run('2026-01-01 12:00:00', weg.id);

      db.prepare('INSERT INTO super_admins (id, user_id) VALUES (?, ?)').run('sa-test', beheerder.id);

      const antwoord = await request(app)
        .get('/api/multi-association/super-admin/associations')
        .set('Authorization', `Bearer ${beheerderToken}`);

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      const eigen = antwoord.body.find((a: { id: string }) => a.id === vereniging.id);
      expect(eigen.memberCount).toBe(3);
    });
  });
});
