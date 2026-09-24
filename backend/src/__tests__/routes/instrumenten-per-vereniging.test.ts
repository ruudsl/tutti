/**
 * Instrumenten per vereniging (besluit september 2026, services/catalogus.ts).
 *
 * - Standaardinstrumenten ziet iedereen; wijzigen, verwijderen en hun aliassen
 *   beheren doet alleen de superbeheerder.
 * - Eigen instrumenten ziet en beheert alleen de eigen vereniging.
 * - Een vereniging kan een standaardinstrument verbergen; wat er al aan hangt,
 *   blijft.
 * - Zoeken op naam of alias kijkt alleen naar wat de vereniging ziet.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import instrumentsRoutes from '../../routes/instruments';
import { errorHandler } from '../../middleware/errorHandler';
import { invalidateAllCache } from '../../middleware/cache';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestUser,
  generateTestToken,
  TestAssociation,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/instruments', instrumentsRoutes);
app.use(errorHandler);

let vereniging: TestAssociation;
let andere: TestAssociation;
let beheerder: string;
let commissie: string;
let lid: string;
let beheerderB: string;
let superbeheerder: string;

beforeEach(() => {
  invalidateAllCache();
  const omgeving = createTestEnvironment();
  vereniging = omgeving.association;
  beheerder = omgeving.adminToken;
  commissie = omgeving.musicCommitteeToken;
  lid = omgeving.memberToken;
  andere = createTestAssociation({ name: 'Harmonie B' });
  beheerderB = generateTestToken(createTestUser(andere.id, { email: 'beheerder-b@test.com', role: 'admin' }));
  const superGebruiker = createTestUser(vereniging.id, { email: 'super@test.com', role: 'admin' });
  db.prepare('INSERT INTO super_admins (id, user_id) VALUES (?, ?)').run(uuidv4(), superGebruiker.id);
  superbeheerder = generateTestToken(superGebruiker);
});

type Methode = 'get' | 'post' | 'put' | 'delete';
const als = (token: string, methode: Methode, pad: string) =>
  request(app)[methode](`/api/instruments${pad}`).set('Authorization', `Bearer ${token}`);

function standaard(naam: string): string {
  const id = uuidv4();
  db.prepare("INSERT INTO instruments (id, name, tuning, clef) VALUES (?, ?, 'Bb', 'sol')").run(id, naam);
  return id;
}

describe('instrumenten per vereniging', () => {
  it('toont een eigen instrument alleen aan de eigen vereniging', async () => {
    const res = await als(beheerder, 'post', '/').send({ name: 'Alpenhoorn', tuning: 'F' });
    expect(res.status).toBe(201);

    expect((await als(lid, 'get', '/')).body.map((i: any) => i.name)).toEqual(['Alpenhoorn']);
    expect((await als(beheerderB, 'get', '/')).body).toEqual([]);
  });

  it('laat twee verenigingen elk een eigen instrument met dezelfde naam maken', async () => {
    expect((await als(beheerder, 'post', '/').send({ name: 'Alpenhoorn', tuning: 'F' })).status).toBe(201);
    expect((await als(beheerderB, 'post', '/').send({ name: 'Alpenhoorn', tuning: 'F' })).status).toBe(201);
  });

  it('laat een andere vereniging een eigen instrument niet wijzigen, verwijderen of van aliassen voorzien', async () => {
    const id = (await als(beheerder, 'post', '/').send({ name: 'Alpenhoorn', tuning: 'F' })).body.id;

    expect((await als(beheerderB, 'put', `/${id}`).send({ name: 'Van B' })).status).toBe(404);
    expect((await als(beheerderB, 'delete', `/${id}`)).status).toBe(404);
    expect((await als(beheerderB, 'post', `/${id}/aliases`).send({ alias: 'alp' })).status).toBe(404);
  });

  it('laat alleen de superbeheerder een standaardinstrument wijzigen, verwijderen of van aliassen voorzien', async () => {
    const trompet = standaard('Trompet');

    expect((await als(beheerder, 'put', `/${trompet}`).send({ name: 'Kornet', tuning: 'Bb' })).status).toBe(403);
    expect((await als(beheerder, 'delete', `/${trompet}`)).status).toBe(403);
    expect((await als(commissie, 'post', `/${trompet}/aliases`).send({ alias: 'trp' })).status).toBe(403);

    expect((await als(superbeheerder, 'post', `/${trompet}/aliases`).send({ alias: 'trp' })).status).toBe(201);
    expect((await als(superbeheerder, 'put', `/${trompet}`).send({ name: 'Trompet', tuning: 'C' })).status).toBe(200);
  });

  it('verbergt een standaardinstrument alleen voor de eigen vereniging, zonder het van leden weg te halen', async () => {
    const tuba = standaard('Tuba');
    const lidId = (
      db.prepare("SELECT id FROM users WHERE role = 'member' AND association_id = ?").get(vereniging.id) as {
        id: string;
      }
    ).id;
    db.prepare('INSERT INTO user_instruments (user_id, instrument_id) VALUES (?, ?)').run(lidId, tuba);

    expect((await als(commissie, 'post', `/${tuba}/verbergen`)).status).toBe(200);

    expect((await als(lid, 'get', '/')).body).toEqual([]);
    expect((await als(beheerder, 'get', '/?alles=true')).body).toEqual([
      expect.objectContaining({ id: tuba, standaard: true, verborgen: true }),
    ]);
    expect((await als(beheerderB, 'get', '/')).body).toHaveLength(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM user_instruments WHERE instrument_id = ?').get(tuba)).toEqual({
      n: 1,
    });

    expect((await als(beheerder, 'delete', `/${tuba}/verbergen`)).status).toBe(200);
    expect((await als(lid, 'get', '/')).body).toHaveLength(1);
  });

  it('zoekt op naam en alias alleen in wat de vereniging ziet', async () => {
    const id = (await als(beheerderB, 'post', '/').send({ name: 'Alpenhoorn', aliases: ['alp'] })).body.id;

    expect((await als(lid, 'get', '/find/alpenhoorn')).status).toBe(404);
    expect((await als(lid, 'get', '/find/alp')).status).toBe(404);
    expect((await als(beheerderB, 'get', '/find/alp')).body).toMatchObject({ id });
  });
});
