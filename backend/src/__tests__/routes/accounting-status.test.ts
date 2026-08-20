/**
 * Boekingen en facturen van concept naar een volgende status.
 *
 * Gemeld vanuit de praktijk: ze blijven op concept staan en zijn niet te
 * bewerken. Deze tests lopen het hele traject na — aanmaken, boeken,
 * bijwerken, verzenden, betaald melden — zodat zichtbaar wordt waar het
 * blijft steken.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import accountingRoutes from '../../routes/accounting';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestUser,
  generateTestToken,
  TestAssociation,
} from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/accounting', accountingRoutes);
app.use(errorHandler);

describe('boekingen en facturen: status', () => {
  let vereniging: TestAssociation;
  let beheerderToken: string;
  let boekjaarId: string;
  let rekeningA: string;
  let rekeningB: string;

  function maakRekening(nummer: string, soort: string): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO accounts (id, association_id, code, name, account_type, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
    ).run(id, vereniging.id, nummer, `Rekening ${nummer}`, soort);
    return id;
  }

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerderToken = omgeving.adminToken;

    boekjaarId = uuidv4();
    db.prepare(
      `INSERT INTO fiscal_years (id, association_id, name, start_date, end_date, status, is_current)
       VALUES (?, ?, '2026', '2026-01-01', '2026-12-31', 'open', 1)`,
    ).run(boekjaarId, vereniging.id);

    rekeningA = maakRekening('1000', 'asset');
    rekeningB = maakRekening('8000', 'income');
  });

  const alsBeheerder = (methode: 'get' | 'post' | 'put' | 'delete', pad: string) =>
    request(app)[methode](`/api/accounting${pad}`).set('Authorization', `Bearer ${beheerderToken}`);

  async function maakBoeking(): Promise<string> {
    const antwoord = await alsBeheerder('post', '/transactions').send({
      transactionDate: '2026-03-01',
      transactionType: 'journal',
      description: 'Contributie maart',
      lines: [
        { accountId: rekeningA, debitAmount: 100 },
        { accountId: rekeningB, creditAmount: 100 },
      ],
    });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    return antwoord.body.id;
  }

  function isGeboekt(id: string): boolean {
    const rij = db.prepare('SELECT is_posted FROM transactions WHERE id = ?').get(id) as { is_posted: number };
    return Boolean(rij.is_posted);
  }

  describe('een boeking', () => {
    it('staat na aanmaken op concept', async () => {
      const id = await maakBoeking();
      expect(isGeboekt(id)).toBe(false);
    });

    it('is te boeken', async () => {
      const id = await maakBoeking();
      const antwoord = await alsBeheerder('post', `/transactions/${id}/post`);

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(isGeboekt(id)).toBe(true);
    });

    it('is niet twee keer te boeken', async () => {
      const id = await maakBoeking();
      await alsBeheerder('post', `/transactions/${id}/post`);
      const tweede = await alsBeheerder('post', `/transactions/${id}/post`);

      expect(tweede.status).toBe(400);
    });

    it('is te bewerken zolang hij op concept staat', async () => {
      const id = await maakBoeking();
      const antwoord = await alsBeheerder('put', `/transactions/${id}`).send({
        transactionDate: '2026-03-02',
        transactionType: 'journal',
        description: 'Contributie maart, gecorrigeerd',
        lines: [
          { accountId: rekeningA, debitAmount: 120 },
          { accountId: rekeningB, creditAmount: 120 },
        ],
      });

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      const rij = db.prepare('SELECT description FROM transactions WHERE id = ?').get(id) as { description: string };
      expect(rij.description).toBe('Contributie maart, gecorrigeerd');
    });

    it('geeft een duidelijke melding als debet en credit niet in balans zijn', async () => {
      const antwoord = await alsBeheerder('post', '/transactions').send({
        transactionDate: '2026-03-01',
        transactionType: 'journal',
        description: 'Scheef',
        lines: [
          { accountId: rekeningA, debitAmount: 100 },
          { accountId: rekeningB, creditAmount: 90 },
        ],
      });

      expect(antwoord.status).toBe(400);
      expect(antwoord.body.error).toMatch(/balans/i);
    });

    it('weigert een boeking van een andere vereniging te boeken', async () => {
      const id = await maakBoeking();
      const andereVereniging = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andereVereniging.id, {
        email: `beheer-${uuidv4()}@test.nl`,
        role: 'admin',
      });

      const antwoord = await request(app)
        .post(`/api/accounting/transactions/${id}/post`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`);

      expect(antwoord.status).toBe(404);
      expect(isGeboekt(id)).toBe(false);
    });
  });

  describe('een factuur', () => {
    async function maakFactuur(): Promise<string> {
      const relatieId = uuidv4();
      db.prepare(
        `INSERT INTO accounting_relations (id, association_id, name, relation_type, email)
         VALUES (?, ?, 'Muziekhandel Bakker', 'customer', 'bakker@test.nl')`,
      ).run(relatieId, vereniging.id);

      const antwoord = await alsBeheerder('post', '/invoices').send({
        invoiceType: 'sales',
        relationId: relatieId,
        invoiceDate: '2026-03-01',
        dueDate: '2026-03-15',
        description: 'Bladmuziek',
        lines: [{ description: 'Marsen', quantity: 1, unitPrice: 100, vatRate: 21, accountId: rekeningB }],
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
      return antwoord.body.id;
    }

    function statusVan(id: string): string {
      const rij = db.prepare('SELECT status FROM invoices WHERE id = ?').get(id) as { status: string };
      return rij.status;
    }

    it('staat na aanmaken op concept', async () => {
      expect(statusVan(await maakFactuur())).toBe('draft');
    });

    it('is te verzenden', async () => {
      const id = await maakFactuur();
      const antwoord = await alsBeheerder('post', `/invoices/${id}/send`);

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(statusVan(id)).toBe('sent');
    });

    it('is daarna betaald te melden', async () => {
      const id = await maakFactuur();
      await alsBeheerder('post', `/invoices/${id}/send`);
      const antwoord = await alsBeheerder('post', `/invoices/${id}/mark-paid`).send({
        amount: 121,
        paymentDate: '2026-03-10',
      });

      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);
      expect(statusVan(id)).toBe('paid');
    });

    it('is niet twee keer te verzenden', async () => {
      const id = await maakFactuur();
      await alsBeheerder('post', `/invoices/${id}/send`);
      expect((await alsBeheerder('post', `/invoices/${id}/send`)).status).toBe(400);
    });

    it('is alleen te verwijderen zolang hij op concept staat', async () => {
      const id = await maakFactuur();
      await alsBeheerder('post', `/invoices/${id}/send`);
      expect((await alsBeheerder('delete', `/invoices/${id}`)).status).toBe(400);
    });

    it('weigert een factuur van een andere vereniging te verzenden', async () => {
      const id = await maakFactuur();
      const andereVereniging = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const andereBeheerder = createTestUser(andereVereniging.id, {
        email: `beheer-${uuidv4()}@test.nl`,
        role: 'admin',
      });

      const antwoord = await request(app)
        .post(`/api/accounting/invoices/${id}/send`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`);

      expect(antwoord.status).toBe(404);
      expect(statusVan(id)).toBe('draft');
    });
  });
});
