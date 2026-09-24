/**
 * Annotaties en de verenigingsgrens.
 *
 * pdf_annotations kent geen eigen vereniging; die loopt via het muziekstuk. De
 * routes controleerden alleen dat het stuk bestond, niet van wie het was. Een
 * lid van vereniging B kon daardoor met `?includeShared=true` de gedeelde
 * annotaties op een stuk van vereniging A lezen, en er zelf gedeelde
 * annotaties op zetten die daarna bij de leden van A verschenen.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import app from '../testApp';
import testDb from '../testDb';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestMusicPiece,
  createTestUser,
  generateTestToken,
  TestUser,
} from '../testUtils';

describe('annotaties blijven binnen de vereniging', () => {
  let verenigingA: string;
  let lidA: TestUser;
  let lidAToken: string;
  let stukA: string;
  let lidBToken: string;
  let lidB: TestUser;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    verenigingA = omgeving.association.id;
    lidA = omgeving.memberUser;
    lidAToken = omgeving.memberToken;
    stukA = createTestMusicPiece(omgeving.association.id).id;

    const verenigingB = createTestAssociation({ name: 'Vereniging B' });
    lidB = createTestUser(verenigingB.id, { email: `lid-${uuidv4()}@b.nl`, role: 'member' });
    lidBToken = generateTestToken(lidB);
  });

  function legGedeeldeAnnotatieNeer(userId: string, pieceId: string): string {
    const id = uuidv4();
    testDb
      .prepare(
        `INSERT INTO pdf_annotations (id, user_id, music_piece_id, page_number, annotation_type, x_position, y_position, data, is_shared)
         VALUES (?, ?, ?, 1, 'freehand', 0, 0, '{"punten":[]}', 1)`,
      )
      .run(id, userId, pieceId);
    return id;
  }

  it('geeft de gedeelde annotaties van een andere vereniging niet vrij', async () => {
    const annotatieA = legGedeeldeAnnotatieNeer(lidA.id, stukA);

    const antwoord = await request(app)
      .get(`/api/annotations/${stukA}/1?includeShared=true`)
      .set('Authorization', `Bearer ${lidBToken}`);

    expect(antwoord.status).toBe(404);
    expect(JSON.stringify(antwoord.body)).not.toContain(annotatieA);
  });

  it('toont gedeelde annotaties wel binnen de eigen vereniging', async () => {
    const collega = createTestUser(verenigingA, { email: `collega-${uuidv4()}@a.nl`, role: 'member' });
    const annotatie = legGedeeldeAnnotatieNeer(collega.id, stukA);

    const antwoord = await request(app)
      .get(`/api/annotations/${stukA}/1?includeShared=true`)
      .set('Authorization', `Bearer ${lidAToken}`);

    expect(antwoord.status).toBe(200);
    expect(antwoord.body.map((a: { id: string }) => a.id)).toEqual([annotatie]);
  });

  it('toont een gedeelde annotatie van een buitenstaander niet aan de eigen leden', async () => {
    // Wat een lid van B vóór de controle op een stuk van A zette, hoort niet
    // alsnog bij de leden van A te verschijnen.
    legGedeeldeAnnotatieNeer(lidB.id, stukA);

    const antwoord = await request(app)
      .get(`/api/annotations/${stukA}/1?includeShared=true`)
      .set('Authorization', `Bearer ${lidAToken}`);

    expect(antwoord.status).toBe(200);
    expect(antwoord.body).toEqual([]);
  });

  it('laat geen tekening op een stuk van een andere vereniging zetten', async () => {
    // Let op: POST /drawing loopt op dit moment voor iedereen stuk op
    // `NOT NULL constraint failed: pdf_annotations.x_position` (500). Deze
    // test vraagt de 404 van de verenigingscontrole, die vóór de insert komt.
    const antwoord = await request(app)
      .post('/api/annotations/drawing')
      .set('Authorization', `Bearer ${lidBToken}`)
      .send({
        musicPieceId: stukA,
        pageNumber: 1,
        annotationType: 'text',
        data: { tekst: 'Klik hier' },
        isShared: true,
      });

    expect(antwoord.status).toBe(404);
    const aantal = testDb.prepare('SELECT COUNT(*) as n FROM pdf_annotations').get() as { n: number };
    expect(aantal.n).toBe(0);
  });

  it('laat geen annotatie op een stuk van een andere vereniging zetten', async () => {
    const antwoord = await request(app)
      .post('/api/annotations')
      .set('Authorization', `Bearer ${lidBToken}`)
      .send({ musicPieceId: stukA, pageNumber: 1, annotationType: 'note', xPosition: 1, yPosition: 1 });

    expect(antwoord.status).toBe(404);
    const aantal = testDb.prepare('SELECT COUNT(*) as n FROM pdf_annotations').get() as { n: number };
    expect(aantal.n).toBe(0);
  });
});
