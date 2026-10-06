/**
 * De rol "Bestuur" (`board`) toekennen.
 *
 * De rol bestond al - contactgegevens en het dashboard kennen hem - maar was
 * nergens te kiezen: de keuzelijst in Leden had hem niet, het schema van de
 * gebruikersroutes wees hem af en de ledenimport kende "Bestuur" niet. Een
 * bestuurslid moest daardoor als beheerder of als gewoon lid worden ingevoerd.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import '../setup';
import app from '../testApp';
import db from '../../database/connection';
import importerenRoutes from '../../routes/importeren';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestEnvironment, TestAssociation } from '../testUtils';

const importApp = express();
importApp.use(express.json());
importApp.use('/api/import', importerenRoutes);
importApp.use(errorHandler);

let vereniging: TestAssociation;
let beheerderToken: string;
let lidId: string;

beforeEach(() => {
  const omgeving = createTestEnvironment();
  vereniging = omgeving.association;
  beheerderToken = omgeving.adminToken;
  lidId = omgeving.memberUser.id;
});

const rolVan = (id: string) =>
  (db.prepare('SELECT role FROM users WHERE id = ? AND association_id = ?').get(id, vereniging.id) as { role: string })
    .role;

describe('een bestuurslid invoeren in Leden', () => {
  it('maakt een nieuw lid met de rol bestuur aan', async () => {
    const antwoord = await request(app).post('/api/users').set('Authorization', `Bearer ${beheerderToken}`).send({
      email: 'secretaris@voorbeeld.nl',
      password: 'Secretaris!2026',
      firstName: 'Sanne',
      lastName: 'Secretaris',
      role: 'board',
    });

    expect(antwoord.status).toBe(201);
    expect(antwoord.body.role).toBe('board');
    expect(rolVan(antwoord.body.id)).toBe('board');
  });

  it('wijst een rol die niet bestaat nog steeds af', async () => {
    const antwoord = await request(app).post('/api/users').set('Authorization', `Bearer ${beheerderToken}`).send({
      email: 'koning@voorbeeld.nl',
      password: 'Koning!2026',
      firstName: 'Karel',
      lastName: 'Koning',
      role: 'koning',
    });

    expect(antwoord.status).toBe(400);
  });

  it('maakt van een bestaand lid een bestuurslid', async () => {
    const antwoord = await request(app)
      .put(`/api/users/${lidId}`)
      .set('Authorization', `Bearer ${beheerderToken}`)
      .send({ role: 'board' });

    expect(antwoord.status).toBe(200);
    expect(rolVan(lidId)).toBe('board');
  });
});

describe('een bestuurslid importeren', () => {
  it('herkent "Bestuur" en "Vorstand" in de kolom Rol', async () => {
    const csv = [
      'Voornaam;Achternaam;E-mail;Rol',
      'Piet;Penning;penning@voorbeeld.nl;Bestuur',
      'Vera;Vorstand;vera@voorbeeld.nl;Vorstand',
    ].join('\n');

    const antwoord = await request(importApp)
      .post('/api/import/leden')
      .set('Authorization', `Bearer ${beheerderToken}`)
      .send({ csv });

    expect(antwoord.status).toBe(201);
    const rollen = db
      .prepare('SELECT email, role FROM users WHERE association_id = ? AND email IN (?, ?) ORDER BY email')
      .all(vereniging.id, 'penning@voorbeeld.nl', 'vera@voorbeeld.nl');
    expect(rollen).toEqual([
      { email: 'penning@voorbeeld.nl', role: 'board' },
      { email: 'vera@voorbeeld.nl', role: 'board' },
    ]);
  });
});
