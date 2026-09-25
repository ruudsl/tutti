/**
 * Wie de contacten ziet, en wat (besluit september 2026, versie 1.18.0).
 *
 * - Beheerder en bestuur: alles.
 * - Muziek-, instrumenten- en uniformcommissie en dirigent: alle contacten,
 *   zonder IBAN, BIC, rekeninghouder, KvK, btw en notities.
 * - Lid: geen toegang.
 *
 * Tussen de contacten staan ook privépersonen; wie niet met contacten werkt,
 * hoeft ze niet te zien. Rekeningnummer en notities zijn voor wie betaalt of
 * beheert.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import '../setup';
import db from '../../database/connection';
import contactsRoutes from '../../routes/contacts';
import { errorHandler } from '../../middleware/errorHandler';
import { invalidateAllCache } from '../../middleware/cache';
import { createTestEnvironment, createTestUser, generateTestToken } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/contacts', contactsRoutes);
app.use(errorHandler);

let beheerder: string;
let bestuur: string;
let muziekcommissie: string;
let uniformcommissie: string;
let lid: string;
let contactId: string;

const AFGESCHERMD = ['iban', 'ibanHolderName', 'bic', 'vatNumber', 'chamberOfCommerce', 'notes'];

beforeEach(async () => {
  invalidateAllCache();
  const omgeving = createTestEnvironment();
  beheerder = omgeving.adminToken;
  muziekcommissie = omgeving.musicCommitteeToken;
  lid = omgeving.memberToken;
  bestuur = generateTestToken(createTestUser(omgeving.association.id, { email: 'bestuur@test.com', role: 'board' }));
  uniformcommissie = generateTestToken(
    createTestUser(omgeving.association.id, { email: 'uniform@test.com', role: 'uniforms_committee' }),
  );

  const res = await request(app).post('/api/contacts').set('Authorization', `Bearer ${beheerder}`).send({
    contactType: 'vendor',
    name: 'Muziekhandel De Toon',
    phone: '030-1234567',
    iban: 'NL91ABNA0417164300',
    vatNumber: 'NL001234567B01',
    chamberOfCommerce: '12345678',
    notes: 'Betaalt de creditnota altijd laat',
  });
  expect(res.status).toBe(201);
  contactId = res.body.id;
});

const lees = (token: string, pad = '') =>
  request(app).get(`/api/contacts${pad}`).set('Authorization', `Bearer ${token}`);

describe('contacten per rol', () => {
  it('laat een lid de contacten niet zien', async () => {
    expect((await lees(lid)).status).toBe(403);
    expect((await lees(lid, `/${contactId}`)).status).toBe(403);
    expect((await lees(lid, `/${contactId}/persons`)).status).toBe(403);
    expect((await lees(lid, '/categories')).status).toBe(403);
  });

  it('laat beheerder en bestuur alles zien', async () => {
    for (const token of [beheerder, bestuur]) {
      const antwoord = await lees(token, `/${contactId}`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toMatchObject({ iban: 'NL91ABNA0417164300', notes: 'Betaalt de creditnota altijd laat' });
    }
  });

  it('laat de commissies het contact zien zonder rekeningnummer, KvK, btw en notities', async () => {
    for (const token of [muziekcommissie, uniformcommissie]) {
      const lijst = await lees(token);
      const detail = await lees(token, `/${contactId}`);
      expect(lijst.status).toBe(200);
      expect(detail.status).toBe(200);
      expect(detail.body).toMatchObject({ name: 'Muziekhandel De Toon', phone: '030-1234567' });
      for (const veld of AFGESCHERMD) {
        expect(detail.body).not.toHaveProperty(veld);
        expect(lijst.body[0]).not.toHaveProperty(veld);
      }
    }
  });

  it('geeft een commissielid niet het gecachete antwoord van de beheerder', async () => {
    expect((await lees(beheerder)).body[0].iban).toBe('NL91ABNA0417164300');
    expect((await lees(muziekcommissie)).body[0]).not.toHaveProperty('iban');
  });

  it('laat een commissielid de afgeschermde velden niet wissen of overschrijven', async () => {
    const antwoord = await request(app)
      .patch(`/api/contacts/${contactId}`)
      .set('Authorization', `Bearer ${muziekcommissie}`)
      .send({ phone: '030-7654321', iban: '', notes: 'Overschreven' });

    expect(antwoord.status).toBe(200);
    expect(
      db.prepare('SELECT phone, iban, notes FROM contacts WHERE id = ?').get(contactId) as Record<string, unknown>,
    ).toEqual({ phone: '030-7654321', iban: 'NL91ABNA0417164300', notes: 'Betaalt de creditnota altijd laat' });
  });
});
