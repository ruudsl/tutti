/**
 * Meldingen over fouten in bladmuziek (routes/issues.ts).
 *
 * 326 regels zonder enige test, terwijl elk endpoint hier over de
 * verenigingsgrens gaat: een melding hangt aan piece_issues.reported_by en
 * krijgt zijn vereniging pas via de join op music_pieces. Wie die join
 * verkeerd zet, laat de meldingen van de ene vereniging bij de andere
 * belanden.
 *
 * De tests leggen drie dingen vast: de grens per endpoint, de rolcontrole
 * (wie mag afhandelen en wie mag verwijderen) en het feit dat een melding op
 * een verwijderde partij niet meer opduikt.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import issuesRoutes from '../../routes/issues';
import { errorHandler } from '../../middleware/errorHandler';
import {
  createTestEnvironment,
  createTestAssociation,
  createTestInstrument,
  createTestMusicPiece,
  createTestUser,
  generateTestToken,
  TestAssociation,
  TestMusicPiece,
  TestUser,
} from '../testUtils';

/**
 * Een eigen app: de gedeelde test-app (testApp.ts) kent deze routes niet en
 * er routes bij zetten trekt andere bestanden de dekkingsmeting in. In
 * index.ts hangt hier nog requireModule('issues') voor; dat is een aparte
 * controle met een eigen test en staat de rolcontrole hieronder niet in de weg.
 */
const app = express();
app.use(express.json());
app.use('/api/issues', issuesRoutes);
app.use(errorHandler);

describe('meldingen over bladmuziek', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let beheerderToken: string;
  let lid: TestUser;
  let lidToken: string;
  let commissie: TestUser;
  let commissieToken: string;
  let partij: TestMusicPiece;

  let andereVereniging: TestAssociation;
  let andereCommissie: TestUser;
  let andereCommissieToken: string;
  let anderePartij: TestMusicPiece;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    beheerderToken = omgeving.adminToken;
    lid = omgeving.memberUser;
    lidToken = omgeving.memberToken;
    commissie = omgeving.musicCommitteeUser;
    commissieToken = omgeving.musicCommitteeToken;

    const trompet = createTestInstrument({ name: 'Trompet' });
    partij = createTestMusicPiece(vereniging.id, { title: 'Ouverture', instrumentId: trompet.id });

    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
    andereCommissie = createTestUser(andereVereniging.id, { email: 'muziek@elders.nl', role: 'music_committee' });
    andereCommissieToken = generateTestToken(andereCommissie);
    anderePartij = createTestMusicPiece(andereVereniging.id, { title: 'Van de buren' });
  });

  /** Rechtstreeks in de tabel, zodat ook meldingen buiten de eigen vereniging op te zetten zijn. */
  function meldingIn(
    musicPieceId: string,
    reportedBy: string,
    overrides: { status?: string; description?: string; pageNumber?: number } = {},
  ): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO piece_issues (id, music_piece_id, reported_by, page_number, description, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      musicPieceId,
      reportedBy,
      overrides.pageNumber ?? null,
      overrides.description ?? 'Maat 12 mist een kruis',
      overrides.status ?? 'open',
    );
    return id;
  }

  function verwijderPartij(pieceId: string): void {
    db.prepare(`UPDATE music_pieces SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`).run(pieceId);
  }

  describe('GET /api/issues', () => {
    it('weigert een aanvraag zonder token', async () => {
      const res = await request(app).get('/api/issues');

      expect(res.status).toBe(401);
    });

    it('weigert een gewoon lid: het overzicht is voor de muziekcommissie', async () => {
      const res = await request(app).get('/api/issues').set('Authorization', `Bearer ${lidToken}`);

      expect(res.status).toBe(403);
    });

    it('geeft de meldingen van de eigen vereniging met melder en instrument', async () => {
      meldingIn(partij.id, lid.id, { description: 'Bladzijde 3 is onleesbaar' });

      const res = await request(app).get('/api/issues').set('Authorization', `Bearer ${commissieToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        description: 'Bladzijde 3 is onleesbaar',
        piece_title: 'Ouverture',
        instrument_name: 'Trompet',
        reported_by_name: `${lid.firstName} ${lid.lastName}`,
        reported_by_email: lid.email,
        status: 'open',
      });
    });

    it('toont nooit een melding van een andere vereniging', async () => {
      meldingIn(anderePartij.id, andereCommissie.id, { description: 'Niet van ons' });
      meldingIn(partij.id, lid.id, { description: 'Wel van ons' });

      const res = await request(app).get('/api/issues').set('Authorization', `Bearer ${beheerderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.map((m: { description: string }) => m.description)).toEqual(['Wel van ons']);
    });

    it('filtert op status, en status=all laat alles zien', async () => {
      meldingIn(partij.id, lid.id, { status: 'open', description: 'Open melding' });
      meldingIn(partij.id, lid.id, { status: 'resolved', description: 'Afgehandelde melding' });

      const open = await request(app).get('/api/issues?status=open').set('Authorization', `Bearer ${commissieToken}`);
      expect(open.status).toBe(200);
      expect(open.body.map((m: { description: string }) => m.description)).toEqual(['Open melding']);

      const alles = await request(app).get('/api/issues?status=all').set('Authorization', `Bearer ${commissieToken}`);
      expect(alles.body).toHaveLength(2);
    });

    it('filtert op partij, en een partij-id van een andere vereniging levert niets op', async () => {
      const tweedePartij = createTestMusicPiece(vereniging.id, { title: 'Mars' });
      meldingIn(partij.id, lid.id, { description: 'Bij de ouverture' });
      meldingIn(tweedePartij.id, lid.id, { description: 'Bij de mars' });
      meldingIn(anderePartij.id, andereCommissie.id, { description: 'Bij de buren' });

      const eigen = await request(app)
        .get(`/api/issues?pieceId=${partij.id}`)
        .set('Authorization', `Bearer ${commissieToken}`);
      expect(eigen.body.map((m: { description: string }) => m.description)).toEqual(['Bij de ouverture']);

      // Een geraden id van een andere vereniging mag niets opleveren: het
      // filter mag de WHERE op association_id niet kunnen omzeilen.
      const vreemd = await request(app)
        .get(`/api/issues?pieceId=${anderePartij.id}`)
        .set('Authorization', `Bearer ${commissieToken}`);
      expect(vreemd.status).toBe(200);
      expect(vreemd.body).toEqual([]);
    });

    it('laat een melding op een verwijderde partij niet meer zien', async () => {
      meldingIn(partij.id, lid.id, { description: 'Hoort verdwenen te zijn' });
      verwijderPartij(partij.id);

      const res = await request(app).get('/api/issues').set('Authorization', `Bearer ${commissieToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/issues/my-issues', () => {
    it('weigert een aanvraag zonder token', async () => {
      const res = await request(app).get('/api/issues/my-issues');

      expect(res.status).toBe(401);
    });

    it('geeft alleen de eigen meldingen, niet die van een collega', async () => {
      meldingIn(partij.id, lid.id, { description: 'Van mij' });
      meldingIn(partij.id, commissie.id, { description: 'Van een collega' });

      const res = await request(app).get('/api/issues/my-issues').set('Authorization', `Bearer ${lidToken}`);

      expect(res.status).toBe(200);
      expect(res.body.map((m: { description: string }) => m.description)).toEqual(['Van mij']);
    });

    it('laat een eigen melding op een verwijderde partij niet meer zien', async () => {
      meldingIn(partij.id, lid.id, { description: 'Hoort verdwenen te zijn' });
      verwijderPartij(partij.id);

      const res = await request(app).get('/api/issues/my-issues').set('Authorization', `Bearer ${lidToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/issues/stats', () => {
    it('weigert een gewoon lid', async () => {
      const res = await request(app).get('/api/issues/stats').set('Authorization', `Bearer ${lidToken}`);

      expect(res.status).toBe(403);
    });

    it('telt per status en alleen binnen de eigen vereniging', async () => {
      meldingIn(partij.id, lid.id, { status: 'open' });
      meldingIn(partij.id, lid.id, { status: 'open' });
      meldingIn(partij.id, lid.id, { status: 'in_review' });
      meldingIn(partij.id, lid.id, { status: 'resolved' });
      meldingIn(partij.id, lid.id, { status: 'rejected' });
      meldingIn(anderePartij.id, andereCommissie.id, { status: 'open' });

      const res = await request(app).get('/api/issues/stats').set('Authorization', `Bearer ${commissieToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ total: 5, open: 2, in_review: 1, resolved: 1, rejected: 1 });
    });

    it('telt meldingen op een verwijderde partij niet mee', async () => {
      const weg = createTestMusicPiece(vereniging.id, { title: 'Weggegooid' });
      meldingIn(partij.id, lid.id, { status: 'open' });
      meldingIn(weg.id, lid.id, { status: 'open' });
      verwijderPartij(weg.id);

      const res = await request(app).get('/api/issues/stats').set('Authorization', `Bearer ${commissieToken}`);

      expect(res.body.total).toBe(1);
      expect(res.body.open).toBe(1);
    });
  });

  describe('POST /api/issues', () => {
    it('weigert een aanvraag zonder token', async () => {
      const res = await request(app).post('/api/issues').send({ musicPieceId: partij.id, description: 'Iets' });

      expect(res.status).toBe(401);
    });

    it('eist een muziekstuk en een beschrijving', async () => {
      const zonderStuk = await request(app)
        .post('/api/issues')
        .set('Authorization', `Bearer ${lidToken}`)
        .send({ description: 'Iets' });
      expect(zonderStuk.status).toBe(400);

      const zonderTekst = await request(app)
        .post('/api/issues')
        .set('Authorization', `Bearer ${lidToken}`)
        .send({ musicPieceId: partij.id });
      expect(zonderTekst.status).toBe(400);
    });

    it('laat een gewoon lid een melding maken op een eigen partij', async () => {
      const res = await request(app)
        .post('/api/issues')
        .set('Authorization', `Bearer ${lidToken}`)
        .send({ musicPieceId: partij.id, pageNumber: 3, measureNumber: '12', description: 'Kruis ontbreekt' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        music_piece_id: partij.id,
        reported_by: lid.id,
        page_number: 3,
        status: 'open',
        piece_title: 'Ouverture',
        reported_by_name: `${lid.firstName} ${lid.lastName}`,
      });

      const rij = db.prepare('SELECT reported_by FROM piece_issues WHERE id = ?').get(res.body.id) as any;
      expect(rij.reported_by).toBe(lid.id);
    });

    it('weigert een melding op een partij van een andere vereniging', async () => {
      const res = await request(app)
        .post('/api/issues')
        .set('Authorization', `Bearer ${lidToken}`)
        .send({ musicPieceId: anderePartij.id, description: 'Ik zag iets' });

      expect(res.status).toBe(404);
      expect(db.prepare('SELECT COUNT(*) as n FROM piece_issues').get()).toMatchObject({ n: 0 });
    });

    it('weigert een melding op een verwijderde partij', async () => {
      verwijderPartij(partij.id);

      const res = await request(app)
        .post('/api/issues')
        .set('Authorization', `Bearer ${lidToken}`)
        .send({ musicPieceId: partij.id, description: 'Bestaat niet meer' });

      expect(res.status).toBe(404);
      expect(db.prepare('SELECT COUNT(*) as n FROM piece_issues').get()).toMatchObject({ n: 0 });
    });
  });

  describe('PATCH /api/issues/:id/status', () => {
    it('weigert een gewoon lid: afhandelen is voor de muziekcommissie', async () => {
      const id = meldingIn(partij.id, lid.id);

      const res = await request(app)
        .patch(`/api/issues/${id}/status`)
        .set('Authorization', `Bearer ${lidToken}`)
        .send({ status: 'resolved' });

      expect(res.status).toBe(403);
      const rij = db.prepare('SELECT status FROM piece_issues WHERE id = ?').get(id) as any;
      expect(rij.status).toBe('open');
    });

    it('weigert een onbekende status', async () => {
      const id = meldingIn(partij.id, lid.id);

      const res = await request(app)
        .patch(`/api/issues/${id}/status`)
        .set('Authorization', `Bearer ${commissieToken}`)
        .send({ status: 'zomaar-iets' });

      expect(res.status).toBe(400);
    });

    it('laat de muziekcommissie van een andere vereniging er niet bij', async () => {
      const id = meldingIn(partij.id, lid.id);

      const res = await request(app)
        .patch(`/api/issues/${id}/status`)
        .set('Authorization', `Bearer ${andereCommissieToken}`)
        .send({ status: 'resolved', resolutionNotes: 'Overgenomen' });

      expect(res.status).toBe(404);
      const rij = db.prepare('SELECT status, resolved_by FROM piece_issues WHERE id = ?').get(id) as any;
      expect(rij.status).toBe('open');
      expect(rij.resolved_by).toBeNull();
    });

    it('legt bij afhandelen vast wie het deed en wanneer', async () => {
      const id = meldingIn(partij.id, lid.id);

      const res = await request(app)
        .patch(`/api/issues/${id}/status`)
        .set('Authorization', `Bearer ${commissieToken}`)
        .send({ status: 'resolved', resolutionNotes: 'Nieuwe partij gedrukt' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'resolved',
        resolution_notes: 'Nieuwe partij gedrukt',
        resolved_by: commissie.id,
        resolved_by_name: `${commissie.firstName} ${commissie.lastName}`,
      });
      expect(res.body.resolved_at).toBeTruthy();
    });

    it('wist de afhandelgegevens als de melding weer opengezet wordt', async () => {
      const id = meldingIn(partij.id, lid.id);
      await request(app)
        .patch(`/api/issues/${id}/status`)
        .set('Authorization', `Bearer ${commissieToken}`)
        .send({ status: 'resolved', resolutionNotes: 'Toch niet' });

      const res = await request(app)
        .patch(`/api/issues/${id}/status`)
        .set('Authorization', `Bearer ${beheerderToken}`)
        .send({ status: 'open' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('open');
      expect(res.body.resolution_notes).toBeNull();
      expect(res.body.resolved_by).toBeNull();
      expect(res.body.resolved_at).toBeNull();
    });

    it('kan een melding nog afhandelen nadat de partij is verwijderd', async () => {
      // Bewust: een melding wegwerken moet ook kunnen als het stuk weg is. De
      // leespaden filteren wel op deleted_at, dit pad expres niet - anders zou
      // een tijdelijk verwijderde partij een openstaande melding onaanraakbaar
      // maken. Deze test stond al in de suite en is hier bewaard gebleven bij
      // het samenvoegen van twee onafhankelijk geschreven testbestanden.
      const id = meldingIn(partij.id, lid.id);
      verwijderPartij(partij.id);

      const res = await request(app)
        .patch(`/api/issues/${id}/status`)
        .set('Authorization', `Bearer ${beheerderToken}`)
        .send({ status: 'resolved' });

      expect(res.status, JSON.stringify(res.body)).toBe(200);
    });
  });

  describe('DELETE /api/issues/:id', () => {
    it('meldt een onbekende melding als niet gevonden', async () => {
      const res = await request(app).delete(`/api/issues/${uuidv4()}`).set('Authorization', `Bearer ${lidToken}`);

      expect(res.status).toBe(404);
    });

    it('laat de melder zijn eigen open melding intrekken', async () => {
      const id = meldingIn(partij.id, lid.id);

      const res = await request(app).delete(`/api/issues/${id}`).set('Authorization', `Bearer ${lidToken}`);

      expect(res.status).toBe(200);
      expect(db.prepare('SELECT COUNT(*) as n FROM piece_issues WHERE id = ?').get(id)).toMatchObject({ n: 0 });
    });

    it('laat de melder een al afgehandelde melding niet meer weghalen', async () => {
      const id = meldingIn(partij.id, lid.id, { status: 'resolved' });

      const res = await request(app).delete(`/api/issues/${id}`).set('Authorization', `Bearer ${lidToken}`);

      expect(res.status).toBe(403);
      expect(db.prepare('SELECT COUNT(*) as n FROM piece_issues WHERE id = ?').get(id)).toMatchObject({ n: 1 });
    });

    it('laat een lid de melding van een ander niet weghalen', async () => {
      const id = meldingIn(partij.id, commissie.id);

      const res = await request(app).delete(`/api/issues/${id}`).set('Authorization', `Bearer ${lidToken}`);

      expect(res.status).toBe(403);
      expect(db.prepare('SELECT COUNT(*) as n FROM piece_issues WHERE id = ?').get(id)).toMatchObject({ n: 1 });
    });

    it('laat de beheerder elke melding van de eigen vereniging weghalen', async () => {
      const id = meldingIn(partij.id, lid.id, { status: 'resolved' });

      const res = await request(app).delete(`/api/issues/${id}`).set('Authorization', `Bearer ${beheerderToken}`);

      expect(res.status).toBe(200);
      expect(db.prepare('SELECT COUNT(*) as n FROM piece_issues WHERE id = ?').get(id)).toMatchObject({ n: 0 });
    });

    it('laat de beheerder van een andere vereniging er niet bij', async () => {
      const andereBeheerder = createTestUser(andereVereniging.id, { email: 'beheer@elders.nl', role: 'admin' });
      const id = meldingIn(partij.id, lid.id);

      const res = await request(app)
        .delete(`/api/issues/${id}`)
        .set('Authorization', `Bearer ${generateTestToken(andereBeheerder)}`);

      expect(res.status).toBe(403);
      expect(db.prepare('SELECT COUNT(*) as n FROM piece_issues WHERE id = ?').get(id)).toMatchObject({ n: 1 });
    });
  });
});
