/**
 * Integration tests for annotations routes
 * Tests: CRUD operations, per-user isolation, authorization
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import app from '../testApp';
import testDb from '../testDb';
import { createTestEnvironment, TestUser, TestAssociation } from '../testUtils';

describe('Annotations Routes', () => {
  let association: TestAssociation;
  let adminUser: TestUser;
  let adminToken: string;
  let memberUser: TestUser;
  let memberToken: string;
  let musicCommitteeUser: TestUser;
  let musicCommitteeToken: string;
  let pieceId: string;

  beforeEach(() => {
    const env = createTestEnvironment();
    association = env.association;
    adminUser = env.adminUser;
    adminToken = env.adminToken;
    memberUser = env.memberUser;
    memberToken = env.memberToken;
    musicCommitteeUser = env.musicCommitteeUser;
    musicCommitteeToken = env.musicCommitteeToken;

    // Create a music piece for the annotations to reference
    pieceId = uuidv4();
    testDb
      .prepare(
        `INSERT INTO music_pieces (id, title, file_path, original_filename, association_id)
                 VALUES (?, ?, ?, ?, ?)`,
      )
      .run(pieceId, 'Test Piece', 'test.pdf', 'Test Piece.pdf', association.id);
  });

  describe('POST /api/annotations', () => {
    it('should create a new annotation', async () => {
      const response = await request(app).post('/api/annotations').set('Authorization', `Bearer ${memberToken}`).send({
        musicPieceId: pieceId,
        pageNumber: 1,
        annotationType: 'note',
        xPosition: 100,
        yPosition: 200,
        content: 'Watch the tempo here',
        color: '#FFFF00',
      });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('message');
    });

    it('should accept minimal required fields', async () => {
      const response = await request(app).post('/api/annotations').set('Authorization', `Bearer ${memberToken}`).send({
        musicPieceId: pieceId,
        pageNumber: 1,
        annotationType: 'highlight',
        xPosition: 50,
        yPosition: 75,
      });

      expect(response.status).toBe(201);
    });

    it('should return 404 if music piece does not exist', async () => {
      const response = await request(app).post('/api/annotations').set('Authorization', `Bearer ${memberToken}`).send({
        musicPieceId: uuidv4(),
        pageNumber: 1,
        annotationType: 'note',
        xPosition: 100,
        yPosition: 200,
      });

      expect(response.status).toBe(404);
    });

    it('should reject invalid annotation type', async () => {
      const response = await request(app).post('/api/annotations').set('Authorization', `Bearer ${memberToken}`).send({
        musicPieceId: pieceId,
        pageNumber: 1,
        annotationType: 'invalid-type',
        xPosition: 100,
        yPosition: 200,
      });

      expect(response.status).toBe(400);
    });

    it('should reject request without authentication', async () => {
      const response = await request(app).post('/api/annotations').send({
        musicPieceId: pieceId,
        pageNumber: 1,
        annotationType: 'note',
        xPosition: 100,
        yPosition: 200,
      });

      expect(response.status).toBe(401);
    });

    it('should reject invalid page number', async () => {
      const response = await request(app).post('/api/annotations').set('Authorization', `Bearer ${memberToken}`).send({
        musicPieceId: pieceId,
        pageNumber: 0,
        annotationType: 'note',
        xPosition: 100,
        yPosition: 200,
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/annotations/piece/:musicPieceId', () => {
    it('should return user own annotations for a piece', async () => {
      // Create two annotations
      await request(app).post('/api/annotations').set('Authorization', `Bearer ${memberToken}`).send({
        musicPieceId: pieceId,
        pageNumber: 1,
        annotationType: 'note',
        xPosition: 100,
        yPosition: 200,
        content: 'Annotation 1',
      });
      await request(app).post('/api/annotations').set('Authorization', `Bearer ${memberToken}`).send({
        musicPieceId: pieceId,
        pageNumber: 2,
        annotationType: 'note',
        xPosition: 150,
        yPosition: 250,
        content: 'Annotation 2',
      });

      const response = await request(app)
        .get(`/api/annotations/piece/${pieceId}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0]).toHaveProperty('content');
      expect(response.body[0]).toHaveProperty('pageNumber');
    });

    it('should NOT return other users annotations (privacy)', async () => {
      // Member creates an annotation
      await request(app).post('/api/annotations').set('Authorization', `Bearer ${memberToken}`).send({
        musicPieceId: pieceId,
        pageNumber: 1,
        annotationType: 'note',
        xPosition: 100,
        yPosition: 200,
        content: 'Member private annotation',
      });

      // Admin requests the annotations for the same piece
      const response = await request(app)
        .get(`/api/annotations/piece/${pieceId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(0);
    });

    it('should filter by pageNumber query param', async () => {
      await request(app).post('/api/annotations').set('Authorization', `Bearer ${memberToken}`).send({
        musicPieceId: pieceId,
        pageNumber: 1,
        annotationType: 'note',
        xPosition: 100,
        yPosition: 200,
      });
      await request(app).post('/api/annotations').set('Authorization', `Bearer ${memberToken}`).send({
        musicPieceId: pieceId,
        pageNumber: 2,
        annotationType: 'note',
        xPosition: 150,
        yPosition: 250,
      });

      const response = await request(app)
        .get(`/api/annotations/piece/${pieceId}?pageNumber=1`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
      expect(response.body[0].pageNumber).toBe(1);
    });

    it('should return empty array when no annotations exist', async () => {
      const response = await request(app)
        .get(`/api/annotations/piece/${pieceId}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('PUT /api/annotations/:id', () => {
    it('should update own annotation', async () => {
      const createResponse = await request(app)
        .post('/api/annotations')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          musicPieceId: pieceId,
          pageNumber: 1,
          annotationType: 'note',
          xPosition: 100,
          yPosition: 200,
          content: 'Original',
        });
      const id = createResponse.body.id;

      const response = await request(app)
        .put(`/api/annotations/${id}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ content: 'Updated content' });

      expect(response.status).toBe(200);

      // Verify the update by fetching the annotation
      const getResponse = await request(app)
        .get(`/api/annotations/piece/${pieceId}`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(getResponse.body[0].content).toBe('Updated content');
    });

    it('should NOT allow updating another users annotation', async () => {
      const createResponse = await request(app)
        .post('/api/annotations')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          musicPieceId: pieceId,
          pageNumber: 1,
          annotationType: 'note',
          xPosition: 100,
          yPosition: 200,
        });
      const id = createResponse.body.id;

      const response = await request(app)
        .put(`/api/annotations/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ content: 'Hacked' });

      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent annotation', async () => {
      const response = await request(app)
        .put(`/api/annotations/${uuidv4()}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ content: 'Something' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/annotations/:id', () => {
    it('should delete own annotation', async () => {
      const createResponse = await request(app)
        .post('/api/annotations')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          musicPieceId: pieceId,
          pageNumber: 1,
          annotationType: 'note',
          xPosition: 100,
          yPosition: 200,
        });
      const id = createResponse.body.id;

      const response = await request(app)
        .delete(`/api/annotations/${id}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(200);

      // Verify deletion
      const getResponse = await request(app)
        .get(`/api/annotations/piece/${pieceId}`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(getResponse.body.length).toBe(0);
    });

    it('should NOT allow deleting another users annotation', async () => {
      const createResponse = await request(app)
        .post('/api/annotations')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          musicPieceId: pieceId,
          pageNumber: 1,
          annotationType: 'note',
          xPosition: 100,
          yPosition: 200,
        });
      const id = createResponse.body.id;

      const response = await request(app).delete(`/api/annotations/${id}`).set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);

      // Verify annotation still exists for owner
      const getResponse = await request(app)
        .get(`/api/annotations/piece/${pieceId}`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(getResponse.body.length).toBe(1);
    });
  });

  describe('DELETE /api/annotations/piece/:musicPieceId', () => {
    it('should delete all own annotations for a piece', async () => {
      // Create 3 annotations
      for (let i = 1; i <= 3; i++) {
        await request(app).post('/api/annotations').set('Authorization', `Bearer ${memberToken}`).send({
          musicPieceId: pieceId,
          pageNumber: i,
          annotationType: 'note',
          xPosition: 100,
          yPosition: 200,
        });
      }

      const response = await request(app)
        .delete(`/api/annotations/piece/${pieceId}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(200);
      expect(response.body.deleted).toBe(3);

      // Verify all are deleted
      const getResponse = await request(app)
        .get(`/api/annotations/piece/${pieceId}`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(getResponse.body.length).toBe(0);
    });

    it('should not affect other users annotations', async () => {
      // Member creates annotations
      await request(app).post('/api/annotations').set('Authorization', `Bearer ${memberToken}`).send({
        musicPieceId: pieceId,
        pageNumber: 1,
        annotationType: 'note',
        xPosition: 100,
        yPosition: 200,
      });
      // Admin creates an annotation
      await request(app).post('/api/annotations').set('Authorization', `Bearer ${adminToken}`).send({
        musicPieceId: pieceId,
        pageNumber: 1,
        annotationType: 'note',
        xPosition: 100,
        yPosition: 200,
      });

      // Member deletes all their annotations
      await request(app).delete(`/api/annotations/piece/${pieceId}`).set('Authorization', `Bearer ${memberToken}`);

      // Admin still has their annotation
      const response = await request(app)
        .get(`/api/annotations/piece/${pieceId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.body.length).toBe(1);
    });
  });
});
