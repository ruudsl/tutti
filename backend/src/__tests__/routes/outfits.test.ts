/**
 * Kleding (outfits): wie mag de garderobe beheren, en blijft die binnen de
 * eigen vereniging?
 *
 * Drie dingen wegen hier het zwaarst. Het eerste is de verenigingsgrens: een
 * outfit van de buren mag niet te zien, te wijzigen of te verwijderen zijn, en
 * de herschikking mag geen vreemde id's accepteren. Het tweede is de
 * standaard-outfit - het aanzetten daarvan zet alle andere op nul, en die
 * "alle andere" moet bij de eigen vereniging ophouden. Het derde is de
 * koppeling aan een concert: concert_outfits heeft zelf geen association_id,
 * dus de grens loopt volledig via de outfit en het concert.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import outfitsRoutes from '../../routes/outfits';
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
app.use('/api/outfits', outfitsRoutes);
app.use(errorHandler);

describe('kleding', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lidToken: string;
  let muziekcommissieToken: string;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;
    muziekcommissieToken = omgeving.musicCommitteeToken;
  });

  type Methode = 'get' | 'post' | 'patch' | 'put' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/outfits${pad}`).set('Authorization', `Bearer ${token}`);
  const alsBeheerder = (methode: Methode, pad: string) => als(beheerderToken, methode, pad);
  const alsLid = (methode: Methode, pad: string) => als(lidToken, methode, pad);

  async function maakOutfit(overrides: Record<string, unknown> = {}): Promise<string> {
    const antwoord = await alsBeheerder('post', '/').send({ name: 'Zwart tenue', ...overrides });
    expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    return antwoord.body.id;
  }

  /** Een outfit van een andere vereniging, rechtstreeks in de database. */
  function vreemdeOutfit(associationId: string, naam = 'Tenue van de buren'): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO outfits (id, association_id, name, is_default, sort_order, created_by)
       VALUES (?, ?, ?, 0, 0, ?)`,
    ).run(id, associationId, naam, beheerder.id);
    return id;
  }

  function maakConcert(associationId: string, naam = 'Nieuwjaarsconcert'): string {
    const id = uuidv4();
    db.prepare(`INSERT INTO concerts (id, association_id, name, date, created_by) VALUES (?, ?, ?, ?, ?)`).run(
      id,
      associationId,
      naam,
      '2026-01-01',
      beheerder.id,
    );
    return id;
  }

  function outfitRij(id: string): { name: string; is_default: number; deleted_at: string | null } {
    return db.prepare('SELECT name, is_default, deleted_at FROM outfits WHERE id = ?').get(id) as {
      name: string;
      is_default: number;
      deleted_at: string | null;
    };
  }

  describe('overzicht en detail', () => {
    it('geeft de outfits van de eigen vereniging terug', async () => {
      await maakOutfit({ name: 'Zwart tenue' });
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      vreemdeOutfit(andere.id);

      const antwoord = await alsLid('get', '/');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.map((o: { name: string }) => o.name)).toEqual(['Zwart tenue']);
    });

    it('toont een verwijderde outfit niet meer in het overzicht', async () => {
      const id = await maakOutfit({ name: 'Oud tenue' });
      await maakOutfit({ name: 'Nieuw tenue' });

      expect((await alsBeheerder('delete', `/${id}`)).status).toBe(200);

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body.map((o: { name: string }) => o.name)).toEqual(['Nieuw tenue']);
    });

    it('geeft items terug als lijst, ook als er geen zijn', async () => {
      await maakOutfit({ name: 'Met items', items: ['zwarte schoenen', 'vlinderdas'] });
      await maakOutfit({ name: 'Zonder items' });

      const antwoord = await alsLid('get', '/');
      const metItems = antwoord.body.find((o: { name: string }) => o.name === 'Met items');
      const zonderItems = antwoord.body.find((o: { name: string }) => o.name === 'Zonder items');
      expect(metItems.items).toEqual(['zwarte schoenen', 'vlinderdas']);
      expect(zonderItems.items).toEqual([]);
    });

    it('telt hoe vaak een outfit bij een concert gebruikt is', async () => {
      const id = await maakOutfit();
      const concert = maakConcert(vereniging.id);
      expect((await alsBeheerder('post', `/${id}/concerts/${concert}`)).status).toBe(201);

      const antwoord = await alsLid('get', '/');
      expect(antwoord.body[0].usageCount).toBe(1);
    });

    it('geeft het detail van een eigen outfit', async () => {
      const id = await maakOutfit({ name: 'Rokkostuum', description: 'Voor galaconcerten', colorCode: '#000000' });

      const antwoord = await alsLid('get', `/${id}`);
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toMatchObject({
        id,
        name: 'Rokkostuum',
        description: 'Voor galaconcerten',
        colorCode: '#000000',
        isDefault: false,
      });
      expect(antwoord.body.createdByName).toBe('Admin User');
    });

    it('geeft 404 voor de outfit van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const antwoord = await alsLid('get', `/${vreemdeOutfit(andere.id)}`);
      expect(antwoord.status).toBe(404);
    });

    it('noemt bij het detail de concerten waar de outfit bij hoort', async () => {
      const id = await maakOutfit();
      const concert = maakConcert(vereniging.id, 'Kerstconcert');
      await alsBeheerder('post', `/${id}/concerts/${concert}`);

      const antwoord = await alsLid('get', `/${id}`);
      expect(antwoord.body.recentConcerts.map((c: { name: string }) => c.name)).toEqual(['Kerstconcert']);
    });

    it('noemt een verwijderd concert niet meer bij het detail', async () => {
      // Een concert wordt zacht verwijderd (deleted_at); de koppeling in
      // concert_outfits blijft dan staan. Het detail mag dat concert daarna
      // niet meer opsommen, net zoals de rest van de applicatie het negeert.
      const id = await maakOutfit();
      const concert = maakConcert(vereniging.id, 'Afgelast concert');
      await alsBeheerder('post', `/${id}/concerts/${concert}`);

      db.prepare('UPDATE concerts SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), concert);

      const antwoord = await alsLid('get', `/${id}`);
      expect(antwoord.body.recentConcerts).toEqual([]);
    });
  });

  describe('aanmaken', () => {
    it('slaat een outfit op onder de eigen vereniging', async () => {
      const id = await maakOutfit({ name: 'Zomertenue', items: ['polo'] });

      const rij = db.prepare('SELECT association_id, created_by, items FROM outfits WHERE id = ?').get(id) as {
        association_id: string;
        created_by: string;
        items: string;
      };
      expect(rij.association_id).toBe(vereniging.id);
      expect(rij.created_by).toBe(beheerder.id);
      expect(JSON.parse(rij.items)).toEqual(['polo']);
    });

    it('laat de muziekcommissie een outfit aanmaken', async () => {
      const antwoord = await als(muziekcommissieToken, 'post', '/').send({ name: 'Tenue van de commissie' });
      expect(antwoord.status).toBe(201);
    });

    it('weigert een gewoon lid dat kleding wil aanmaken', async () => {
      const antwoord = await alsLid('post', '/').send({ name: 'Eigen tenue' });
      expect(antwoord.status).toBe(403);
    });

    it('weigert een verzoek zonder geldig token', async () => {
      const antwoord = await request(app).post('/api/outfits').send({ name: 'Tenue' });
      expect(antwoord.status).toBe(401);
    });

    it('weigert een lege naam', async () => {
      const antwoord = await alsBeheerder('post', '/').send({ name: '' });
      expect(antwoord.status).toBe(400);
    });

    it('haalt de standaard bij de andere outfits weg als er een nieuwe standaard komt', async () => {
      const eerste = await maakOutfit({ name: 'Eerste', isDefault: true });
      const tweede = await maakOutfit({ name: 'Tweede', isDefault: true });

      expect(outfitRij(eerste).is_default).toBe(0);
      expect(outfitRij(tweede).is_default).toBe(1);
    });

    it('laat de standaard van een andere vereniging met rust', async () => {
      // UPDATE outfits SET is_default = 0 mag alleen de eigen vereniging
      // raken; anders wist een nieuwe standaard hier de standaard van de buren.
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = vreemdeOutfit(andere.id);
      db.prepare('UPDATE outfits SET is_default = 1 WHERE id = ?').run(vreemd);

      await maakOutfit({ name: 'Onze standaard', isDefault: true });

      expect(outfitRij(vreemd).is_default).toBe(1);
    });
  });

  describe('wijzigen', () => {
    it('wijzigt alleen de genoemde velden', async () => {
      const id = await maakOutfit({ name: 'Origineel', description: 'Blijft staan', colorCode: '#123456' });

      const antwoord = await alsBeheerder('patch', `/${id}`).send({ name: 'Gewijzigd' });
      expect(antwoord.status).toBe(200);

      const detail = await alsLid('get', `/${id}`);
      expect(detail.body).toMatchObject({
        name: 'Gewijzigd',
        description: 'Blijft staan',
        colorCode: '#123456',
      });
    });

    it('weigert een gewoon lid dat kleding wil wijzigen', async () => {
      const id = await maakOutfit();
      const antwoord = await alsLid('patch', `/${id}`).send({ name: 'Van mij nu' });
      expect(antwoord.status).toBe(403);
      expect(outfitRij(id).name).toBe('Zwart tenue');
    });

    it('geeft 404 bij het wijzigen van de outfit van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = vreemdeOutfit(andere.id);

      const antwoord = await alsBeheerder('patch', `/${vreemd}`).send({ name: 'Gekaapt' });
      expect(antwoord.status).toBe(404);
      expect(outfitRij(vreemd).name).toBe('Tenue van de buren');
    });

    it('geeft 404 bij het wijzigen van een verwijderde outfit', async () => {
      const id = await maakOutfit();
      await alsBeheerder('delete', `/${id}`);

      const antwoord = await alsBeheerder('patch', `/${id}`).send({ name: 'Terug van weggeweest' });
      expect(antwoord.status).toBe(404);
    });

    it('verplaatst de standaard naar de gewijzigde outfit', async () => {
      const eerste = await maakOutfit({ name: 'Eerste', isDefault: true });
      const tweede = await maakOutfit({ name: 'Tweede' });

      expect((await alsBeheerder('patch', `/${tweede}`).send({ isDefault: true })).status).toBe(200);

      expect(outfitRij(eerste).is_default).toBe(0);
      expect(outfitRij(tweede).is_default).toBe(1);
    });

    it('laat bij het verplaatsen van de standaard de andere vereniging met rust', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = vreemdeOutfit(andere.id);
      db.prepare('UPDATE outfits SET is_default = 1 WHERE id = ?').run(vreemd);

      const eigen = await maakOutfit();
      await alsBeheerder('patch', `/${eigen}`).send({ isDefault: true });

      expect(outfitRij(vreemd).is_default).toBe(1);
    });
  });

  describe('verwijderen', () => {
    it('markeert de outfit als verwijderd zonder de rij weg te gooien', async () => {
      const id = await maakOutfit();

      expect((await alsBeheerder('delete', `/${id}`)).status).toBe(200);

      expect(outfitRij(id).deleted_at).not.toBeNull();
      expect((await alsLid('get', `/${id}`)).status).toBe(404);
    });

    it('geeft 404 bij twee keer verwijderen', async () => {
      const id = await maakOutfit();
      await alsBeheerder('delete', `/${id}`);

      expect((await alsBeheerder('delete', `/${id}`)).status).toBe(404);
    });

    it('weigert een gewoon lid dat kleding wil verwijderen', async () => {
      const id = await maakOutfit();
      expect((await alsLid('delete', `/${id}`)).status).toBe(403);
      expect(outfitRij(id).deleted_at).toBeNull();
    });

    it('geeft 404 bij het verwijderen van de outfit van een andere vereniging', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemd = vreemdeOutfit(andere.id);

      expect((await alsBeheerder('delete', `/${vreemd}`)).status).toBe(404);
      expect(outfitRij(vreemd).deleted_at).toBeNull();
    });
  });

  describe('koppelen aan een concert', () => {
    it('koppelt een outfit aan een concert en haalt de koppeling er weer af', async () => {
      const id = await maakOutfit();
      const concert = maakConcert(vereniging.id);

      expect((await alsBeheerder('post', `/${id}/concerts/${concert}`)).status).toBe(201);
      expect(koppelingen(id, concert)).toBe(1);

      expect((await alsBeheerder('delete', `/${id}/concerts/${concert}`)).status).toBe(200);
      expect(koppelingen(id, concert)).toBe(0);
    });

    function koppelingen(outfitId: string, concertId: string): number {
      const rij = db
        .prepare('SELECT COUNT(*) as aantal FROM concert_outfits WHERE outfit_id = ? AND concert_id = ?')
        .get(outfitId, concertId) as { aantal: number };
      return rij.aantal;
    }

    it('weigert dezelfde koppeling twee keer', async () => {
      const id = await maakOutfit();
      const concert = maakConcert(vereniging.id);
      await alsBeheerder('post', `/${id}/concerts/${concert}`);

      const antwoord = await alsBeheerder('post', `/${id}/concerts/${concert}`);
      expect(antwoord.status).toBe(409);
    });

    it('weigert een gewoon lid dat wil koppelen', async () => {
      const id = await maakOutfit();
      const concert = maakConcert(vereniging.id);

      expect((await alsLid('post', `/${id}/concerts/${concert}`)).status).toBe(403);
    });

    it('geeft 404 als de outfit van een andere vereniging is', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const concert = maakConcert(vereniging.id);
      const vreemd = vreemdeOutfit(andere.id);

      const antwoord = await alsBeheerder('post', `/${vreemd}/concerts/${concert}`);
      expect(antwoord.status).toBe(404);
      expect(koppelingen(vreemd, concert)).toBe(0);
    });

    it('geeft 404 als het concert van een andere vereniging is', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const id = await maakOutfit();
      const vreemdConcert = maakConcert(andere.id);

      const antwoord = await alsBeheerder('post', `/${id}/concerts/${vreemdConcert}`);
      expect(antwoord.status).toBe(404);
      expect(koppelingen(id, vreemdConcert)).toBe(0);
    });

    it('geeft 404 bij het koppelen aan een verwijderd concert', async () => {
      // Een zacht verwijderd concert bestaat voor de rest van de applicatie
      // niet meer; er mag dan ook geen nieuwe kleding meer aan gehangen worden.
      const id = await maakOutfit();
      const concert = maakConcert(vereniging.id);
      db.prepare('UPDATE concerts SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), concert);

      const antwoord = await alsBeheerder('post', `/${id}/concerts/${concert}`);
      expect(antwoord.status).toBe(404);
      expect(koppelingen(id, concert)).toBe(0);
    });

    it('laat de koppeling van een andere vereniging staan', async () => {
      // concert_outfits heeft zelf geen association_id: zonder controle via de
      // outfit en het concert zou een beheerder hier de koppeling van de buren
      // kunnen weghalen.
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdeKleding = vreemdeOutfit(andere.id);
      const vreemdConcert = maakConcert(andere.id);
      db.prepare('INSERT INTO concert_outfits (id, concert_id, outfit_id) VALUES (?, ?, ?)').run(
        uuidv4(),
        vreemdConcert,
        vreemdeKleding,
      );

      const antwoord = await alsBeheerder('delete', `/${vreemdeKleding}/concerts/${vreemdConcert}`);
      expect(antwoord.status).toBe(404);
      expect(koppelingen(vreemdeKleding, vreemdConcert)).toBe(1);
    });

    it('weigert een gewoon lid dat een koppeling wil weghalen', async () => {
      const id = await maakOutfit();
      const concert = maakConcert(vereniging.id);
      await alsBeheerder('post', `/${id}/concerts/${concert}`);

      expect((await alsLid('delete', `/${id}/concerts/${concert}`)).status).toBe(403);
      expect(koppelingen(id, concert)).toBe(1);
    });
  });

  describe('herschikken', () => {
    it('legt de volgorde vast in sort_order', async () => {
      const eerste = await maakOutfit({ name: 'A' });
      const tweede = await maakOutfit({ name: 'B' });

      const antwoord = await alsBeheerder('put', '/reorder').send({ outfitIds: [tweede, eerste] });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(200);

      const volgorde = await alsLid('get', '/');
      expect(volgorde.body.map((o: { name: string }) => o.name)).toEqual(['B', 'A']);
    });

    it('weigert de hele herschikking als er een vreemde outfit tussen zit', async () => {
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const eigen = await maakOutfit({ name: 'Van ons' });
      const vreemd = vreemdeOutfit(andere.id);

      const antwoord = await alsBeheerder('put', '/reorder').send({ outfitIds: [vreemd, eigen] });
      expect(antwoord.status).toBe(400);

      const rij = db.prepare('SELECT sort_order FROM outfits WHERE id = ?').get(vreemd) as { sort_order: number };
      expect(rij.sort_order).toBe(0);
    });

    it('weigert een verwijderde outfit in de herschikking', async () => {
      const eigen = await maakOutfit({ name: 'Van ons' });
      const weg = await maakOutfit({ name: 'Weg' });
      await alsBeheerder('delete', `/${weg}`);

      const antwoord = await alsBeheerder('put', '/reorder').send({ outfitIds: [weg, eigen] });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een gewoon lid dat wil herschikken', async () => {
      const id = await maakOutfit();
      expect((await alsLid('put', '/reorder').send({ outfitIds: [id] })).status).toBe(403);
    });

    it('weigert een lijst met iets anders dan uuids', async () => {
      const antwoord = await alsBeheerder('put', '/reorder').send({ outfitIds: ['geen-uuid'] });
      expect(antwoord.status).toBe(400);
    });
  });

  describe('afscherming per gebruiker', () => {
    it('laat een beheerder van een andere vereniging niets van onze kleding zien', async () => {
      const eigen = await maakOutfit({ name: 'Van ons' });
      const andere = createTestAssociation({ name: `Andere-${uuidv4()}` });
      const vreemdeBeheerder = createTestUser(andere.id, {
        email: `buur-${uuidv4()}@test.nl`,
        role: 'admin',
      });
      const token = generateTestToken(vreemdeBeheerder);

      expect((await als(token, 'get', '/')).body).toEqual([]);
      expect((await als(token, 'get', `/${eigen}`)).status).toBe(404);
      expect((await als(token, 'patch', `/${eigen}`).send({ name: 'Gekaapt' })).status).toBe(404);
      expect((await als(token, 'delete', `/${eigen}`)).status).toBe(404);
      expect(outfitRij(eigen).name).toBe('Van ons');
      expect(outfitRij(eigen).deleted_at).toBeNull();
    });
  });
});
