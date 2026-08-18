/**
 * Integration tests for music-pieces routes
 * Tests: Basic connectivity and authentication for music pieces endpoints
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import '../setup';
import app from '../testApp';
import { createTestEnvironment, TestUser, TestAssociation } from '../testUtils';

describe('Music Pieces Routes', () => {
  let association: TestAssociation;
  let adminUser: TestUser;
  let adminToken: string;
  let memberUser: TestUser;
  let memberToken: string;

  beforeEach(() => {
    const env = createTestEnvironment();
    association = env.association;
    adminUser = env.adminUser;
    adminToken = env.adminToken;
    memberUser = env.memberUser;
    memberToken = env.memberToken;
  });

  describe('GET /api/music-pieces', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/music-pieces');

      expect(response.status).toBe(401);
    });

    it('should return response for authenticated user', async () => {
      const response = await request(app).get('/api/music-pieces').set('Authorization', `Bearer ${memberToken}`);

      // Should not get 401 or 403
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('GET /api/music-pieces/my-pieces', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/music-pieces/my-pieces');

      expect(response.status).toBe(401);
    });

    it('should return response for authenticated user', async () => {
      const response = await request(app)
        .get('/api/music-pieces/my-pieces')
        .set('Authorization', `Bearer ${memberToken}`);

      // Should not get 401 or 403
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('GET /api/music-pieces/titles', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/music-pieces/titles');

      expect(response.status).toBe(401);
    });

    it('should fail for regular member (authorization)', async () => {
      const response = await request(app).get('/api/music-pieces/titles').set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(403);
    });

    it('should allow admin access', async () => {
      const response = await request(app).get('/api/music-pieces/titles').set('Authorization', `Bearer ${adminToken}`);

      // Should not get 401 or 403
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('GET /api/music-pieces/shared', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/music-pieces/shared');

      expect(response.status).toBe(401);
    });

    it('should return response for authenticated user', async () => {
      const response = await request(app).get('/api/music-pieces/shared').set('Authorization', `Bearer ${memberToken}`);

      // Should not get 401 or 403
      expect([200, 500]).toContain(response.status);
    });
  });
});
