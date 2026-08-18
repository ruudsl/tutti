/**
 * Integration tests for the music-pieces routes.
 *
 * music-pieces.ts is met ruim 3000 regels het grootste route-bestand, maar
 * werd alleen door een handvol smoke-tests geraakt die ook een 500 accepteerden.
 * Deze suite dekt de endpoints die zonder bestandsupload te testen zijn:
 * filteren en pagineren, de CRUD-operaties, soft delete en herstel, de
 * bulk-acties en het delen tussen verenigingen.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import request from 'supertest';
import '../setup';
import testDb from '../testDb';
import app from '../testApp';
import {
  createTestEnvironment,
  createTestInstrument,
  createTestMusicPiece,
  createTestOrchestra,
  addInstrumentToUser,
  addUserToOrchestra,
  TestAssociation,
  TestInstrument,
  TestOrchestra,
  TestUser,
} from '../testUtils';

describe('Music Pieces Routes', () => {
  let association: TestAssociation;
  let adminUser: TestUser;
  let adminToken: string;
  let memberUser: TestUser;
  let memberToken: string;
  let musicCommitteeToken: string;
  let trumpet: TestInstrument;
  let clarinet: TestInstrument;
  let orchestra: TestOrchestra;

  beforeEach(() => {
    const env = createTestEnvironment();
    association = env.association;
    adminUser = env.adminUser;
    adminToken = env.adminToken;
    memberUser = env.memberUser;
    memberToken = env.memberToken;
    musicCommitteeToken = env.musicCommitteeToken;
    trumpet = createTestInstrument({ name: 'Trompet' });
    clarinet = createTestInstrument({ name: 'Klarinet' });
    orchestra = createTestOrchestra(association.id);
  });

  function pieceRow(id: string) {
    return testDb.prepare('SELECT * FROM music_pieces WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  }

  describe('GET /api/music-pieces', () => {
    it('requires authentication', async () => {
      const response = await request(app).get('/api/music-pieces');

      expect(response.status).toBe(401);
    });

    it('returns the pieces of the caller association', async () => {
      createTestMusicPiece(association.id, { title: 'Ouverture' });
      createTestMusicPiece(association.id, { title: 'Mars' });

      const response = await request(app).get('/api/music-pieces').set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body.map((p: { title: string }) => p.title).sort()).toEqual(['Mars', 'Ouverture']);
    });

    it('never returns pieces of another association', async () => {
      const otherAssociation = uuidv4();
      testDb.prepare('INSERT INTO associations (id, name) VALUES (?, ?)').run(otherAssociation, 'Andere vereniging');
      createTestMusicPiece(otherAssociation, { title: 'Van de buren' });
      createTestMusicPiece(association.id, { title: 'Van onszelf' });

      const response = await request(app).get('/api/music-pieces').set('Authorization', `Bearer ${adminToken}`);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].title).toBe('Van onszelf');
    });

    it('hides soft-deleted pieces', async () => {
      createTestMusicPiece(association.id, { title: 'Actief' });
      createTestMusicPiece(association.id, { title: 'Weg', deletedAt: new Date().toISOString() });

      const response = await request(app).get('/api/music-pieces').set('Authorization', `Bearer ${adminToken}`);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].title).toBe('Actief');
    });

    it('searches on title, arranger and original filename', async () => {
      createTestMusicPiece(association.id, { title: 'Bolero', arranger: 'Ravel' });
      createTestMusicPiece(association.id, { title: 'Mars', arranger: 'Sousa' });
      createTestMusicPiece(association.id, { title: 'Wals', originalFilename: 'ravel-scan.pdf' });

      const byTitle = await request(app)
        .get('/api/music-pieces?search=bolero')
        .set('Authorization', `Bearer ${adminToken}`);
      const byArranger = await request(app)
        .get('/api/music-pieces?search=ravel')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(byTitle.body).toHaveLength(1);
      // Ravel matcht zowel de arrangeur van Bolero als de bestandsnaam van Wals
      expect(byArranger.body).toHaveLength(2);
    });

    it('searches case-insensitively', async () => {
      createTestMusicPiece(association.id, { title: 'Nieuwjaarsconcert' });

      const response = await request(app)
        .get('/api/music-pieces?search=NIEUWJAARS')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.body).toHaveLength(1);
    });

    it('filters by instrument', async () => {
      createTestMusicPiece(association.id, { title: 'Voor trompet', instrumentId: trumpet.id });
      createTestMusicPiece(association.id, { title: 'Voor klarinet', instrumentId: clarinet.id });

      const response = await request(app)
        .get(`/api/music-pieces?instrumentId=${trumpet.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].title).toBe('Voor trompet');
    });

    it('filters on pieces without an instrument via __none__', async () => {
      createTestMusicPiece(association.id, { title: 'Zonder instrument' });
      createTestMusicPiece(association.id, { title: 'Met instrument', instrumentId: trumpet.id });

      const response = await request(app)
        .get('/api/music-pieces?instrumentId=__none__')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].title).toBe('Zonder instrument');
    });

    it('filters by music list', async () => {
      const inList = createTestMusicPiece(association.id, { title: 'Op de lijst' });
      createTestMusicPiece(association.id, { title: 'Niet op de lijst' });

      const listId = uuidv4();
      testDb
        .prepare('INSERT INTO music_lists (id, name, orchestra_id) VALUES (?, ?, ?)')
        .run(listId, 'Concertmap', orchestra.id);
      testDb
        .prepare('INSERT INTO music_list_pieces (music_list_id, music_piece_id) VALUES (?, ?)')
        .run(listId, inList.id);

      const response = await request(app)
        .get(`/api/music-pieces?listId=${listId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].title).toBe('Op de lijst');
    });

    it('returns a paginated envelope when page is given', async () => {
      for (let i = 0; i < 5; i++) {
        createTestMusicPiece(association.id, { title: `Stuk ${i}` });
      }

      const response = await request(app)
        .get('/api/music-pieces?page=1&pageSize=2')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.total).toBe(5);
      expect(response.body.page).toBe(1);
      expect(response.body.pageSize).toBe(2);
      expect(response.body.totalPages).toBe(3);
    });

    it('returns the remainder on the last page', async () => {
      for (let i = 0; i < 5; i++) {
        createTestMusicPiece(association.id, { title: `Stuk ${i}` });
      }

      const response = await request(app)
        .get('/api/music-pieces?page=3&pageSize=2')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.body.data).toHaveLength(1);
    });

    it('caps the page size at 100', async () => {
      createTestMusicPiece(association.id);

      const response = await request(app)
        .get('/api/music-pieces?page=1&pageSize=5000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.body.pageSize).toBe(100);
    });

    it('falls back to page 1 for a nonsensical page number', async () => {
      createTestMusicPiece(association.id);

      const response = await request(app)
        .get('/api/music-pieces?page=onzin')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.body.page).toBe(1);
    });

    it('shows a member only pieces for their own instruments', async () => {
      addInstrumentToUser(memberUser.id, trumpet.id);
      createTestMusicPiece(association.id, { title: 'Trompetpartij', instrumentId: trumpet.id });
      createTestMusicPiece(association.id, { title: 'Klarinetpartij', instrumentId: clarinet.id });

      const response = await request(app).get('/api/music-pieces').set('Authorization', `Bearer ${memberToken}`);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].title).toBe('Trompetpartij');
    });

    it('returns nothing for a member without instruments', async () => {
      createTestMusicPiece(association.id, { title: 'Trompetpartij', instrumentId: trumpet.id });

      const response = await request(app).get('/api/music-pieces').set('Authorization', `Bearer ${memberToken}`);

      expect(response.body).toEqual([]);
    });

    it('returns an empty paginated envelope for a member without instruments', async () => {
      createTestMusicPiece(association.id, { instrumentId: trumpet.id });

      const response = await request(app).get('/api/music-pieces?page=1').set('Authorization', `Bearer ${memberToken}`);

      expect(response.body.data).toEqual([]);
      expect(response.body.total).toBe(0);
      expect(response.body.totalPages).toBe(0);
    });
  });

  describe('PUT /api/music-pieces/:id', () => {
    it('updates a piece', async () => {
      const piece = createTestMusicPiece(association.id, { title: 'Oude titel' });

      const response = await request(app)
        .put(`/api/music-pieces/${piece.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Nieuwe titel', arranger: 'Sousa', instrumentId: trumpet.id });

      expect(response.status).toBe(200);
      const row = pieceRow(piece.id)!;
      expect(row.title).toBe('Nieuwe titel');
      expect(row.arranger).toBe('Sousa');
      expect(row.instrument_id).toBe(trumpet.id);
    });

    it('allows the music committee too', async () => {
      const piece = createTestMusicPiece(association.id);

      const response = await request(app)
        .put(`/api/music-pieces/${piece.id}`)
        .set('Authorization', `Bearer ${musicCommitteeToken}`)
        .send({ title: 'Aangepast door commissie' });

      expect(response.status).toBe(200);
    });

    it('rejects a regular member', async () => {
      const piece = createTestMusicPiece(association.id);

      const response = await request(app)
        .put(`/api/music-pieces/${piece.id}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Mag niet' });

      expect(response.status).toBe(403);
    });

    it('requires a title', async () => {
      const piece = createTestMusicPiece(association.id);

      const response = await request(app)
        .put(`/api/music-pieces/${piece.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ arranger: 'Zonder titel' });

      expect(response.status).toBe(400);
    });

    it('rejects an invalid YouTube URL', async () => {
      const piece = createTestMusicPiece(association.id);

      const response = await request(app)
        .put(`/api/music-pieces/${piece.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Titel', youtubeUrl: 'geen-url' });

      expect(response.status).toBe(400);
    });

    it('returns 404 for a piece of another association', async () => {
      const otherAssociation = uuidv4();
      testDb.prepare('INSERT INTO associations (id, name) VALUES (?, ?)').run(otherAssociation, 'Andere vereniging');
      const foreign = createTestMusicPiece(otherAssociation);

      const response = await request(app)
        .put(`/api/music-pieces/${foreign.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Kaping' });

      expect(response.status).toBe(404);
    });

    it('returns 404 for a soft-deleted piece', async () => {
      const piece = createTestMusicPiece(association.id, { deletedAt: new Date().toISOString() });

      const response = await request(app)
        .put(`/api/music-pieces/${piece.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Titel' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/music-pieces/:id', () => {
    it('soft-deletes: the row stays, deleted_at is filled', async () => {
      const piece = createTestMusicPiece(association.id);

      const response = await request(app)
        .delete(`/api/music-pieces/${piece.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      const row = pieceRow(piece.id);
      expect(row).toBeDefined();
      expect(row!.deleted_at).toBeTruthy();
    });

    it('rejects a regular member', async () => {
      const piece = createTestMusicPiece(association.id);

      const response = await request(app)
        .delete(`/api/music-pieces/${piece.id}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(403);
      expect(pieceRow(piece.id)!.deleted_at).toBeNull();
    });

    it('returns 404 when deleting twice', async () => {
      const piece = createTestMusicPiece(association.id);

      await request(app).delete(`/api/music-pieces/${piece.id}`).set('Authorization', `Bearer ${adminToken}`);
      const second = await request(app)
        .delete(`/api/music-pieces/${piece.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(second.status).toBe(404);
    });
  });

  describe('POST /api/music-pieces/:id/restore', () => {
    it('restores a soft-deleted piece', async () => {
      const piece = createTestMusicPiece(association.id, { deletedAt: new Date().toISOString() });

      const response = await request(app)
        .post(`/api/music-pieces/${piece.id}/restore`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(pieceRow(piece.id)!.deleted_at).toBeNull();
    });

    it('returns 404 for a piece that was never deleted', async () => {
      const piece = createTestMusicPiece(association.id);

      const response = await request(app)
        .post(`/api/music-pieces/${piece.id}/restore`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });

    it('makes the piece visible in the list again', async () => {
      const piece = createTestMusicPiece(association.id, {
        title: 'Teruggehaald',
        deletedAt: new Date().toISOString(),
      });

      await request(app).post(`/api/music-pieces/${piece.id}/restore`).set('Authorization', `Bearer ${adminToken}`);
      const list = await request(app).get('/api/music-pieces').set('Authorization', `Bearer ${adminToken}`);

      expect(list.body.map((p: { title: string }) => p.title)).toContain('Teruggehaald');
    });
  });

  describe('POST /api/music-pieces/bulk-delete', () => {
    it('deletes several pieces at once', async () => {
      const first = createTestMusicPiece(association.id);
      const second = createTestMusicPiece(association.id);
      const untouched = createTestMusicPiece(association.id);

      const response = await request(app)
        .post('/api/music-pieces/bulk-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [first.id, second.id] });

      expect(response.status).toBe(200);
      expect(pieceRow(first.id)!.deleted_at).toBeTruthy();
      expect(pieceRow(second.id)!.deleted_at).toBeTruthy();
      expect(pieceRow(untouched.id)!.deleted_at).toBeNull();
    });

    it('refuses an empty selection', async () => {
      const response = await request(app)
        .post('/api/music-pieces/bulk-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: [] });

      expect(response.status).toBe(400);
    });

    it('refuses something that is not an array', async () => {
      const response = await request(app)
        .post('/api/music-pieces/bulk-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: 'alles' });

      expect(response.status).toBe(400);
    });

    it('refuses more than 500 at once', async () => {
      const ids = Array.from({ length: 501 }, () => uuidv4());

      const response = await request(app)
        .post('/api/music-pieces/bulk-delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids });

      expect(response.status).toBe(400);
    });

    it('rejects a regular member', async () => {
      const piece = createTestMusicPiece(association.id);

      const response = await request(app)
        .post('/api/music-pieces/bulk-delete')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ ids: [piece.id] });

      expect(response.status).toBe(403);
    });
  });

  describe('PUT /api/music-pieces/bulk', () => {
    it('assigns an instrument to several pieces', async () => {
      const first = createTestMusicPiece(association.id);
      const second = createTestMusicPiece(association.id);

      const response = await request(app)
        .put('/api/music-pieces/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pieceIds: [first.id, second.id], updates: { instrumentId: trumpet.id } });

      expect(response.status).toBe(200);
      expect(pieceRow(first.id)!.instrument_id).toBe(trumpet.id);
      expect(pieceRow(second.id)!.instrument_id).toBe(trumpet.id);
    });

    it('adds pieces to a music list', async () => {
      const piece = createTestMusicPiece(association.id);
      const listId = uuidv4();
      testDb
        .prepare('INSERT INTO music_lists (id, name, orchestra_id) VALUES (?, ?, ?)')
        .run(listId, 'Concertmap', orchestra.id);

      const response = await request(app)
        .put('/api/music-pieces/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pieceIds: [piece.id], updates: { addToListId: listId } });

      expect(response.status).toBe(200);
      const link = testDb
        .prepare('SELECT * FROM music_list_pieces WHERE music_list_id = ? AND music_piece_id = ?')
        .get(listId, piece.id);
      expect(link).toBeDefined();
    });

    it('refuses an empty selection', async () => {
      const response = await request(app)
        .put('/api/music-pieces/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pieceIds: [], updates: {} });

      expect(response.status).toBe(400);
    });

    it('rejects a non-uuid piece id', async () => {
      const response = await request(app)
        .put('/api/music-pieces/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pieceIds: ['geen-uuid'], updates: {} });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/music-pieces/bulk', () => {
    it('soft-deletes the selection', async () => {
      const piece = createTestMusicPiece(association.id);

      const response = await request(app)
        .delete('/api/music-pieces/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pieceIds: [piece.id] });

      expect(response.status).toBe(200);
      expect(pieceRow(piece.id)!.deleted_at).toBeTruthy();
    });

    it('refuses an empty selection', async () => {
      const response = await request(app)
        .delete('/api/music-pieces/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pieceIds: [] });

      expect(response.status).toBe(400);
    });

    it('leaves pieces of another association alone', async () => {
      const otherAssociation = uuidv4();
      testDb.prepare('INSERT INTO associations (id, name) VALUES (?, ?)').run(otherAssociation, 'Andere vereniging');
      const foreign = createTestMusicPiece(otherAssociation);

      await request(app)
        .delete('/api/music-pieces/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pieceIds: [foreign.id] });

      expect(pieceRow(foreign.id)!.deleted_at).toBeNull();
    });
  });

  describe('POST /api/music-pieces/:id/share', () => {
    let otherAssociation: string;

    beforeEach(() => {
      otherAssociation = uuidv4();
      testDb.prepare('INSERT INTO associations (id, name) VALUES (?, ?)').run(otherAssociation, 'Bevriende vereniging');
    });

    it('shares a piece with another association', async () => {
      const piece = createTestMusicPiece(association.id);

      const response = await request(app)
        .post(`/api/music-pieces/${piece.id}/share`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ associationId: otherAssociation });

      expect(response.status).toBeLessThan(300);
      const access = testDb
        .prepare('SELECT * FROM shared_music_access WHERE music_piece_id = ? AND association_id = ?')
        .get(piece.id, otherAssociation);
      expect(access).toBeDefined();
    });

    it('only allows an admin, not the music committee', async () => {
      const piece = createTestMusicPiece(association.id);

      const response = await request(app)
        .post(`/api/music-pieces/${piece.id}/share`)
        .set('Authorization', `Bearer ${musicCommitteeToken}`)
        .send({ associationId: otherAssociation });

      expect(response.status).toBe(403);
    });

    it('rejects an unknown association', async () => {
      const piece = createTestMusicPiece(association.id);

      const response = await request(app)
        .post(`/api/music-pieces/${piece.id}/share`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ associationId: uuidv4() });

      expect(response.status).toBe(404);
    });

    it('rejects an invalid association id', async () => {
      const piece = createTestMusicPiece(association.id);

      const response = await request(app)
        .post(`/api/music-pieces/${piece.id}/share`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ associationId: 'geen-uuid' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/music-pieces/shared', () => {
    it('returns nothing without shared pieces', async () => {
      const response = await request(app).get('/api/music-pieces/shared').set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('returns a piece another association shared with us', async () => {
      const otherAssociation = uuidv4();
      testDb.prepare('INSERT INTO associations (id, name) VALUES (?, ?)').run(otherAssociation, 'Bevriende vereniging');
      const foreign = createTestMusicPiece(otherAssociation, { title: 'Geleend stuk' });
      testDb
        .prepare('INSERT INTO shared_music_access (music_piece_id, association_id) VALUES (?, ?)')
        .run(foreign.id, association.id);

      const response = await request(app).get('/api/music-pieces/shared').set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].title).toBe('Geleend stuk');
    });

    it('does not return our own pieces as shared', async () => {
      const own = createTestMusicPiece(association.id, { title: 'Eigen stuk' });
      testDb
        .prepare('INSERT INTO shared_music_access (music_piece_id, association_id) VALUES (?, ?)')
        .run(own.id, association.id);

      const response = await request(app).get('/api/music-pieces/shared').set('Authorization', `Bearer ${adminToken}`);

      expect(response.body).toEqual([]);
    });
  });

  describe('GET /api/music-pieces/titles', () => {
    it('rejects a regular member', async () => {
      const response = await request(app).get('/api/music-pieces/titles').set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(403);
    });

    it('groups pieces by title', async () => {
      createTestMusicPiece(association.id, { title: 'Bolero', instrumentId: trumpet.id });
      createTestMusicPiece(association.id, { title: 'Bolero', instrumentId: clarinet.id });
      createTestMusicPiece(association.id, { title: 'Mars', instrumentId: trumpet.id });

      const response = await request(app).get('/api/music-pieces/titles').set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      const bolero = response.body.find((t: { title: string }) => t.title === 'Bolero');
      expect(bolero).toBeDefined();
      expect(bolero.pieceCount ?? bolero.piece_count).toBe(2);
    });

    it('filters titles on a search term', async () => {
      createTestMusicPiece(association.id, { title: 'Bolero' });
      createTestMusicPiece(association.id, { title: 'Mars' });

      const response = await request(app)
        .get('/api/music-pieces/titles?search=bol')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].title).toBe('Bolero');
    });
  });

  describe('GET /api/music-pieces/my-pieces', () => {
    it('requires authentication', async () => {
      const response = await request(app).get('/api/music-pieces/my-pieces');

      expect(response.status).toBe(401);
    });

    it('returns nothing for a member without instruments', async () => {
      const response = await request(app)
        .get('/api/music-pieces/my-pieces')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('returns nothing for a member who is in no orchestra', async () => {
      addInstrumentToUser(memberUser.id, trumpet.id);

      const response = await request(app)
        .get('/api/music-pieces/my-pieces')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(response.body).toEqual([]);
    });

    it('returns the pieces on a list of the orchestra that match the instruments of the member', async () => {
      addInstrumentToUser(memberUser.id, trumpet.id);
      addUserToOrchestra(memberUser.id, orchestra.id);

      const forMe = createTestMusicPiece(association.id, { title: 'Trompetpartij', instrumentId: trumpet.id });
      const otherInstrument = createTestMusicPiece(association.id, {
        title: 'Klarinetpartij',
        instrumentId: clarinet.id,
      });

      const listId = uuidv4();
      testDb
        .prepare('INSERT INTO music_lists (id, name, orchestra_id) VALUES (?, ?, ?)')
        .run(listId, 'Concertmap', orchestra.id);
      for (const piece of [forMe, otherInstrument]) {
        testDb
          .prepare('INSERT INTO music_list_pieces (music_list_id, music_piece_id) VALUES (?, ?)')
          .run(listId, piece.id);
      }

      const response = await request(app)
        .get('/api/music-pieces/my-pieces')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(200);
      const titles = JSON.stringify(response.body);
      expect(titles).toContain('Trompetpartij');
      expect(titles).not.toContain('Klarinetpartij');
    });

    it('does not return a piece that is on no list', async () => {
      addInstrumentToUser(memberUser.id, trumpet.id);
      addUserToOrchestra(memberUser.id, orchestra.id);
      createTestMusicPiece(association.id, { title: 'Losse partij', instrumentId: trumpet.id });

      const response = await request(app)
        .get('/api/music-pieces/my-pieces')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(JSON.stringify(response.body)).not.toContain('Losse partij');
    });
  });
});
