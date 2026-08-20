/**
 * De routes rond partnerschappen.
 *
 * Aanvragen was in de praktijk onmogelijk: de route wil een id van de andere
 * vereniging, en een beheerder kon nergens zien welke verenigingen er zijn -
 * dat overzicht is alleen voor een super-admin. Er is nu een karige lijst voor,
 * en drie routes die teruggeven wat een actief partnerschap oplevert.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import multiAssociationRoutes from '../../routes/multi-association';
import { errorHandler } from '../../middleware/errorHandler';
import { createTestEnvironment, createTestAssociation, TestAssociation, TestUser } from '../testUtils';

const app = express();
app.use(express.json());
app.use('/api/multi-association', multiAssociationRoutes);
app.use(errorHandler);

describe('partnerschappen (routes)', () => {
  let eigen: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lidToken: string;
  let partner: TestAssociation;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    eigen = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lidToken = omgeving.memberToken;
    partner = createTestAssociation({ name: `Fanfare-${uuidv4()}` });
  });

  type Methode = 'get' | 'post' | 'put' | 'delete';
  const als = (token: string, methode: Methode, pad: string) =>
    request(app)[methode](`/api/multi-association${pad}`).set('Authorization', `Bearer ${token}`);

  function maakActiefPartnerschap(opties: { music?: boolean; events?: boolean } = {}) {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO association_partnerships
         (id, association_a_id, association_b_id, share_music, share_events, status, requested_by)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
    ).run(id, eigen.id, partner.id, opties.music ? 1 : 0, opties.events ? 1 : 0, beheerder.id);
    return id;
  }

  describe('er is geen lijst van verenigingen', () => {
    /**
     * GET /directory gaf naam en plaats van elke actieve vereniging terug. Die
     * lijst bestond omdat het aanvragen van een partnerschap anders onmogelijk
     * was: de route erachter wil een id, en een beheerder kon nergens zien welke
     * verenigingen er zijn.
     *
     * Koppelen gaat nu via een code die je buiten Tutti om doorgeeft, en daarmee
     * verviel de reden voor die lijst. Deze test houdt hem weg: rondkijken wie er
     * verder op het platform zit hoort niet te kunnen.
     */
    it('geeft geen overzicht van verenigingen op het platform', async () => {
      expect((await als(beheerderToken, 'get', '/directory')).status).toBe(404);
    });
  });

  describe('POST /partnerships', () => {
    it('vraagt een partnerschap aan', async () => {
      const antwoord = await als(beheerderToken, 'post', '/partnerships').send({
        targetAssociationId: partner.id,
        shareMusic: true,
      });
      expect(antwoord.status, JSON.stringify(antwoord.body)).toBe(201);
    });

    it('komt binnen als aanvraag, niet meteen actief', async () => {
      await als(beheerderToken, 'post', '/partnerships').send({
        targetAssociationId: partner.id,
        shareMusic: true,
      });

      const rij = db
        .prepare('SELECT status FROM association_partnerships WHERE association_b_id = ?')
        .get(partner.id) as { status: string };
      expect(rij.status).toBe('pending');
    });

    it('weigert een partnerschap met de eigen vereniging', async () => {
      const antwoord = await als(beheerderToken, 'post', '/partnerships').send({
        targetAssociationId: eigen.id,
      });
      expect(antwoord.status).toBe(400);
    });

    it('weigert een vereniging die niet bestaat', async () => {
      const antwoord = await als(beheerderToken, 'post', '/partnerships').send({
        targetAssociationId: uuidv4(),
      });
      expect(antwoord.status).toBe(404);
    });

    it('weigert een tweede aanvraag voor dezelfde vereniging', async () => {
      await als(beheerderToken, 'post', '/partnerships').send({ targetAssociationId: partner.id });
      const tweede = await als(beheerderToken, 'post', '/partnerships').send({ targetAssociationId: partner.id });
      expect(tweede.status).toBe(409);
    });

    it('is niet voor een gewoon lid', async () => {
      const antwoord = await als(lidToken, 'post', '/partnerships').send({ targetAssociationId: partner.id });
      expect(antwoord.status).toBe(403);
    });
  });

  describe('GET /partners/music', () => {
    function maakGedeeldeTitel(associationId: string, titel: string) {
      db.prepare('INSERT INTO music_titles (id, title, is_shared, association_id) VALUES (?, ?, 1, ?)').run(
        uuidv4(),
        titel,
        associationId,
      );
    }

    it('geeft niets zonder partnerschap', async () => {
      maakGedeeldeTitel(partner.id, 'Gedeelde Mars');
      const antwoord = await als(lidToken, 'get', '/partners/music');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body).toEqual([]);
    });

    it('geeft de opengestelde titels van een actieve partner', async () => {
      maakActiefPartnerschap({ music: true });
      maakGedeeldeTitel(partner.id, 'Gedeelde Mars');

      const antwoord = await als(lidToken, 'get', '/partners/music');
      expect(antwoord.body.map((t: { title: string }) => t.title)).toEqual(['Gedeelde Mars']);
    });

    it('is voor elk lid, niet alleen voor een beheerder', async () => {
      maakActiefPartnerschap({ music: true });
      expect((await als(lidToken, 'get', '/partners/music')).status).toBe(200);
    });
  });

  describe('GET /partners/events', () => {
    it('geeft een aankomend concert van een actieve partner', async () => {
      maakActiefPartnerschap({ events: true });
      const overDertigDagen = new Date();
      overDertigDagen.setDate(overDertigDagen.getDate() + 30);

      db.prepare('INSERT INTO concerts (id, association_id, name, date) VALUES (?, ?, ?, ?)').run(
        uuidv4(),
        partner.id,
        'Kerstconcert',
        overDertigDagen.toISOString().slice(0, 10),
      );

      const antwoord = await als(lidToken, 'get', '/partners/events');
      expect(antwoord.body.map((c: { name: string }) => c.name)).toEqual(['Kerstconcert']);
    });

    it('geeft niets als de agenda niet gedeeld wordt', async () => {
      maakActiefPartnerschap({ events: false, music: true });
      const antwoord = await als(lidToken, 'get', '/partners/events');
      expect(antwoord.body).toEqual([]);
    });
  });

  describe('GET /partners/summary', () => {
    it('noemt per soort met wie er gedeeld wordt', async () => {
      maakActiefPartnerschap({ music: true, events: false });

      const antwoord = await als(lidToken, 'get', '/partners/summary');
      expect(antwoord.status).toBe(200);
      expect(antwoord.body.music.map((p: { id: string }) => p.id)).toEqual([partner.id]);
      expect(antwoord.body.events).toEqual([]);
    });
  });
});
