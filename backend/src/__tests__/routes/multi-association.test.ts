/**
 * Meerdere verenigingen op één installatie.
 *
 * Dit bestand stond op nul procent en het gaat precies over de eigenschap die
 * bij een gedeelde installatie het zwaarst weegt: wie mag waarbij. Er zitten
 * twee soorten grenzen in. De ene is de super-admin, die alles ziet; de andere
 * is een gewoon lid, dat alleen bij zijn eigen verenigingen mag. De meeste
 * tests gaan over die tweede.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import multiAssociationRoutes from '../../routes/multi-association';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/multi-association', multiAssociationRoutes);
app.use(errorHandler);

function maakSuperAdmin(userId: string): void {
  db.prepare('INSERT INTO super_admins (id, user_id) VALUES (?, ?)').run(uuidv4(), userId);
}

function koppelAanVereniging(userId: string, associationId: string, rol = 'member', status = 'active'): void {
  db.prepare('INSERT INTO user_associations (user_id, association_id, role, status) VALUES (?, ?, ?, ?)').run(
    userId,
    associationId,
    rol,
    status,
  );
}

describe('meerdere verenigingen', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let lid: TestUser;
  let beheerderToken: string;
  let lidToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    lid = omgeving.memberUser;
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;
  });

  const alsSuperAdmin = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) => {
    maakSuperAdmin(beheerder.id);
    return request(app)[methode](`/api/multi-association${pad}`).set('Authorization', `Bearer ${beheerderToken}`);
  };

  const alsLid = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
    request(app)[methode](`/api/multi-association${pad}`).set('Authorization', `Bearer ${lidToken}`);

  describe('wie is super-admin', () => {
    it('meldt een gewoon lid als geen super-admin', async () => {
      const antwoord = await alsLid('get', '/am-i-super-admin');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.isSuperAdmin).toBe(false);
    });

    it('meldt een super-admin als zodanig', async () => {
      const antwoord = await alsSuperAdmin('get', '/am-i-super-admin');
      expect(antwoord.body.isSuperAdmin).toBe(true);
    });

    it('vereist dat je bent ingelogd', async () => {
      const antwoord = await request(app).get('/api/multi-association/am-i-super-admin');
      expect(antwoord.status).toBe(401);
    });
  });

  describe('de super-admin-routes zijn dicht voor gewone leden', () => {
    const routes: Array<['get' | 'post' | 'put' | 'delete', string]> = [
      ['get', '/super-admin/associations'],
      ['post', '/super-admin/associations'],
      ['put', `/super-admin/associations/${uuidv4()}`],
      ['put', `/super-admin/associations/${uuidv4()}/subscription`],
      ['delete', `/super-admin/associations/${uuidv4()}`],
      ['get', '/super-admin/super-admins'],
      ['post', '/super-admin/super-admins'],
      ['delete', `/super-admin/super-admins/${uuidv4()}`],
    ];

    it.each(routes)('%s %s geeft 403 voor een lid', async (methode, pad) => {
      const antwoord = await alsLid(methode, pad);
      expect(antwoord.status).toBe(403);
    });

    it('geeft ook een beheerder 403 zolang die geen super-admin is', async () => {
      const antwoord = await request(app)
        .get('/api/multi-association/super-admin/associations')
        .set('Authorization', `Bearer ${beheerderToken}`);
      expect(antwoord.status).toBe(403);
    });
  });

  describe('verenigingen beheren als super-admin', () => {
    it('toont alle verenigingen met ledenaantal', async () => {
      createTestAssociation();
      const antwoord = await alsSuperAdmin('get', '/super-admin/associations');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.length).toBeGreaterThanOrEqual(2);
      expect(antwoord.body[0]).toHaveProperty('name');
    });

    it('maakt een vereniging aan', async () => {
      const antwoord = await alsSuperAdmin('post', '/super-admin/associations').send({
        name: 'Harmonie Sint Caecilia',
        city: 'Boxmeer',
      });

      expect(antwoord.status).toBe(201);
      expect(antwoord.body.slug).toBeTruthy();

      const rij = db.prepare('SELECT name, city FROM associations WHERE id = ?').get(antwoord.body.id) as {
        name: string;
        city: string;
      };
      expect(rij).toMatchObject({ name: 'Harmonie Sint Caecilia', city: 'Boxmeer' });
    });

    it('weigert een naam die al bestaat', async () => {
      const antwoord = await alsSuperAdmin('post', '/super-admin/associations').send({ name: vereniging.name });
      expect(antwoord.status).toBe(409);
    });

    it('kijkt niet naar hoofdletters bij die controle', async () => {
      const antwoord = await alsSuperAdmin('post', '/super-admin/associations').send({
        name: vereniging.name.toUpperCase(),
      });
      expect(antwoord.status).toBe(409);
    });

    it('weigert een slug die al in gebruik is', async () => {
      maakSuperAdmin(beheerder.id);
      const eerste = await request(app)
        .post('/api/multi-association/super-admin/associations')
        .set('Authorization', `Bearer ${beheerderToken}`)
        .send({ name: 'Eerste Orkest', slug: 'eerste-orkest' });
      expect(eerste.status).toBe(201);

      const tweede = await request(app)
        .post('/api/multi-association/super-admin/associations')
        .set('Authorization', `Bearer ${beheerderToken}`)
        .send({ name: 'Tweede Orkest', slug: 'eerste-orkest' });
      expect(tweede.status).toBe(409);
    });

    it('weigert een naam die leeg is', async () => {
      const antwoord = await alsSuperAdmin('post', '/super-admin/associations').send({ name: '' });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een slug met hoofdletters of spaties', async () => {
      const antwoord = await alsSuperAdmin('post', '/super-admin/associations').send({
        name: 'Nieuw Orkest',
        slug: 'Niet Goed',
      });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een vereniging met leden te verwijderen', async () => {
      const antwoord = await alsSuperAdmin('delete', `/super-admin/associations/${vereniging.id}`);
      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toMatch(/leden/i);
    });

    it('verwijdert een vereniging zonder leden', async () => {
      const leeg = createTestAssociation({ name: `Leeg-${uuidv4()}` });
      const antwoord = await alsSuperAdmin('delete', `/super-admin/associations/${leeg.id}`);

      expect(antwoord.status).toBe(200);
      expect(db.prepare('SELECT id FROM associations WHERE id = ?').get(leeg.id)).toBeUndefined();
    });
  });

  describe('super-admins beheren', () => {
    it('toont wie er super-admin zijn', async () => {
      const antwoord = await alsSuperAdmin('get', '/super-admin/super-admins');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.length).toBe(1);
    });

    it('maakt iemand super-admin', async () => {
      const antwoord = await alsSuperAdmin('post', '/super-admin/super-admins').send({ userId: lid.id });

      expect(antwoord.status).toBe(201);
      expect(db.prepare('SELECT id FROM super_admins WHERE user_id = ?').get(lid.id)).toBeTruthy();
    });

    it('weigert iemand die het al is', async () => {
      maakSuperAdmin(lid.id);
      const antwoord = await alsSuperAdmin('post', '/super-admin/super-admins').send({ userId: lid.id });
      expect(antwoord.status).toBe(409);
    });

    it('weigert een gebruiker die niet bestaat', async () => {
      const antwoord = await alsSuperAdmin('post', '/super-admin/super-admins').send({ userId: uuidv4() });
      expect(antwoord.status).toBe(404);
    });

    it('weigert een verzoek zonder gebruiker', async () => {
      const antwoord = await alsSuperAdmin('post', '/super-admin/super-admins').send({});
      expect(antwoord.status).toBe(400);
    });

    it('laat de laatste super-admin niet verwijderen', async () => {
      maakSuperAdmin(beheerder.id);
      const lijst = await request(app)
        .get('/api/multi-association/super-admin/super-admins')
        .set('Authorization', `Bearer ${beheerderToken}`);

      const antwoord = await request(app)
        .delete(`/api/multi-association/super-admin/super-admins/${lijst.body[0].id}`)
        .set('Authorization', `Bearer ${beheerderToken}`);

      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toMatch(/minimaal één/i);
    });

    it('verwijdert een super-admin zolang er een overblijft', async () => {
      maakSuperAdmin(beheerder.id);
      maakSuperAdmin(lid.id);

      const teVerwijderen = db.prepare('SELECT id FROM super_admins WHERE user_id = ?').get(lid.id) as { id: string };
      const antwoord = await request(app)
        .delete(`/api/multi-association/super-admin/super-admins/${teVerwijderen.id}`)
        .set('Authorization', `Bearer ${beheerderToken}`);

      expect(antwoord.status).toBe(200);
      expect(db.prepare('SELECT id FROM super_admins WHERE user_id = ?').get(lid.id)).toBeUndefined();
    });
  });

  describe('mijn verenigingen', () => {
    it('toont voor een gewoon lid alleen de eigen vereniging', async () => {
      createTestAssociation({ name: `Andere-${uuidv4()}` });
      const antwoord = await alsLid('get', '/my-associations');

      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toHaveLength(1);
      expect(antwoord.body[0].id).toBe(vereniging.id);
    });

    it('toont een tweede vereniging zodra het lid daar gekoppeld is', async () => {
      const tweede = createTestAssociation({ name: `Tweede-${uuidv4()}` });
      koppelAanVereniging(lid.id, tweede.id, 'board');

      const antwoord = await alsLid('get', '/my-associations');
      expect(antwoord.body.map((a: { id: string }) => a.id).sort()).toEqual([vereniging.id, tweede.id].sort());
      expect(antwoord.body.find((a: { id: string }) => a.id === tweede.id).myRole).toBe('board');
    });

    it('laat een koppeling die niet actief is buiten beschouwing', async () => {
      const tweede = createTestAssociation({ name: `Inactief-${uuidv4()}` });
      koppelAanVereniging(lid.id, tweede.id, 'member', 'invited');

      const antwoord = await alsLid('get', '/my-associations');
      expect(antwoord.body.map((a: { id: string }) => a.id)).not.toContain(tweede.id);
    });

    it('toont een super-admin alle verenigingen', async () => {
      createTestAssociation({ name: `Extra-${uuidv4()}` });
      const antwoord = await alsSuperAdmin('get', '/my-associations');

      expect(antwoord.body.length).toBeGreaterThanOrEqual(2);
      expect(antwoord.body.every((a: { myRole: string }) => a.myRole === 'super_admin')).toBe(true);
    });
  });

  describe('van vereniging wisselen', () => {
    it('weigert te wisselen naar een vereniging waar het lid niet bij hoort', async () => {
      const vreemde = createTestAssociation({ name: `Vreemd-${uuidv4()}` });
      const antwoord = await alsLid('post', '/switch-association').send({ associationId: vreemde.id });

      expect(antwoord.status).toBe(403);

      const rij = db.prepare('SELECT association_id FROM users WHERE id = ?').get(lid.id) as {
        association_id: string;
      };
      expect(rij.association_id).toBe(vereniging.id);
    });

    it('wisselt naar een vereniging waar het lid wel bij hoort', async () => {
      const tweede = createTestAssociation({ name: `Tweede-${uuidv4()}` });
      koppelAanVereniging(lid.id, tweede.id);

      const antwoord = await alsLid('post', '/switch-association').send({ associationId: tweede.id });

      expect(antwoord.status).toBe(200);
      expect(antwoord.body.token).toBeTruthy();

      const rij = db.prepare('SELECT association_id FROM users WHERE id = ?').get(lid.id) as {
        association_id: string;
      };
      expect(rij.association_id).toBe(tweede.id);
    });

    it('geeft een nieuw token mee dat bij de nieuwe vereniging hoort', async () => {
      const tweede = createTestAssociation({ name: `Tweede-${uuidv4()}` });
      koppelAanVereniging(lid.id, tweede.id);

      const antwoord = await alsLid('post', '/switch-association').send({ associationId: tweede.id });
      const inhoud = JSON.parse(Buffer.from(antwoord.body.token.split('.')[1], 'base64').toString());

      expect(inhoud.associationId).toBe(tweede.id);
    });

    it('legt een sessie vast voor het nieuwe token', async () => {
      const tweede = createTestAssociation({ name: `Tweede-${uuidv4()}` });
      koppelAanVereniging(lid.id, tweede.id);

      const antwoord = await alsLid('post', '/switch-association').send({ associationId: tweede.id });

      // Het oude token krijgt onderweg ook een sessie, want de
      // aanmeldcontrole legt die alsnog vast. Daarom niet tellen maar
      // opzoeken: hoort er een sessie bij het token dat we terugkregen?
      const hash = createHash('sha256').update(antwoord.body.token).digest('hex');
      const sessie = db.prepare('SELECT user_id FROM user_sessions WHERE token_hash = ?').get(hash) as
        { user_id: string } | undefined;

      expect(sessie?.user_id).toBe(lid.id);
    });

    it('laat een super-admin naar elke vereniging wisselen', async () => {
      const vreemde = createTestAssociation({ name: `Vreemd-${uuidv4()}` });
      const antwoord = await alsSuperAdmin('post', '/switch-association').send({ associationId: vreemde.id });

      expect(antwoord.status).toBe(200);
    });

    it('weigert een vereniging die niet bestaat', async () => {
      const antwoord = await alsLid('post', '/switch-association').send({ associationId: uuidv4() });
      expect(antwoord.status).toBe(404);
    });

    it('weigert een verzoek zonder vereniging', async () => {
      const antwoord = await alsLid('post', '/switch-association').send({});
      expect(antwoord.status).toBe(400);
    });

    it('weigert te wisselen zonder ingelogd te zijn', async () => {
      const antwoord = await request(app)
        .post('/api/multi-association/switch-association')
        .send({ associationId: vereniging.id });
      expect(antwoord.status).toBe(401);
    });
  });

  describe('uitnodigingen', () => {
    it('houdt de uitnodigingen van een andere vereniging buiten beeld', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andere.id, {
        email: `beheer-${uuidv4()}@test.nl`,
        role: 'admin',
      });

      const antwoord = await request(app)
        .get('/api/multi-association/invitations')
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`);

      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual([]);
    });

    it('is niet toegankelijk voor een gewoon lid', async () => {
      const antwoord = await alsLid('get', '/invitations');
      expect(antwoord.status).toBe(403);
    });
  });
});
