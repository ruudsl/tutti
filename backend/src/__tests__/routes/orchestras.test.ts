/**
 * Integration tests for orchestras routes
 * Tests: CRUD operations, authentication, authorization
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import '../setup';
import app from '../testApp';
import testDb from '../testDb';
import {
  createTestEnvironment,
  createTestOrchestra,
  createTestUser,
  addUserToOrchestra,
  generateTestToken,
  TestUser,
  TestAssociation,
  TestOrchestra,
} from '../testUtils';

describe('Orchestras Routes', () => {
  let association: TestAssociation;
  let adminUser: TestUser;
  let adminToken: string;
  let memberUser: TestUser;
  let memberToken: string;
  let musicCommitteeUser: TestUser;
  let musicCommitteeToken: string;

  beforeEach(() => {
    const env = createTestEnvironment();
    association = env.association;
    adminUser = env.adminUser;
    adminToken = env.adminToken;
    memberUser = env.memberUser;
    memberToken = env.memberToken;
    musicCommitteeUser = env.musicCommitteeUser;
    musicCommitteeToken = env.musicCommitteeToken;
  });

  describe('GET /api/orchestras', () => {
    it('should return list of orchestras for authenticated user', async () => {
      const orchestra1 = createTestOrchestra(association.id, { name: 'Concert Band' });
      const orchestra2 = createTestOrchestra(association.id, { name: 'Jazz Ensemble' });

      const response = await request(app).get('/api/orchestras').set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body.some((o: any) => o.name === 'Concert Band')).toBe(true);
      expect(response.body.some((o: any) => o.name === 'Jazz Ensemble')).toBe(true);
    });

    it('should return orchestra with member and list counts', async () => {
      const orchestra = createTestOrchestra(association.id, { name: 'Counting Orchestra' });
      addUserToOrchestra(memberUser.id, orchestra.id);
      addUserToOrchestra(adminUser.id, orchestra.id);

      const response = await request(app).get('/api/orchestras').set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(200);
      const countingOrchestra = response.body.find((o: any) => o.name === 'Counting Orchestra');
      expect(countingOrchestra).toBeDefined();
      expect(countingOrchestra.memberCount).toBe(2);
      expect(countingOrchestra).toHaveProperty('listCount');
    });

    it('should only return orchestras from the same association', async () => {
      const orchestra = createTestOrchestra(association.id, { name: 'My Association Orchestra' });

      // Create orchestra in different association
      testDb.prepare('INSERT INTO associations (id, name) VALUES (?, ?)').run('other-assoc-orch', 'Other Association');

      createTestOrchestra('other-assoc-orch', { name: 'Other Association Orchestra' });

      const response = await request(app).get('/api/orchestras').set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(200);
      expect(response.body.every((o: any) => o.name !== 'Other Association Orchestra')).toBe(true);
      expect(response.body.some((o: any) => o.name === 'My Association Orchestra')).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/orchestras');

      expect(response.status).toBe(401);
    });

    it('should fail with invalid token', async () => {
      const response = await request(app).get('/api/orchestras').set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/orchestras/:id', () => {
    it('should return single orchestra with members and lists', async () => {
      const orchestra = createTestOrchestra(association.id, { name: 'Detail Orchestra' });
      addUserToOrchestra(memberUser.id, orchestra.id);

      const response = await request(app)
        .get(`/api/orchestras/${orchestra.id}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', orchestra.id);
      expect(response.body).toHaveProperty('name', 'Detail Orchestra');
      expect(response.body).toHaveProperty('members');
      expect(response.body).toHaveProperty('lists');
      expect(Array.isArray(response.body.members)).toBe(true);
      expect(Array.isArray(response.body.lists)).toBe(true);
    });

    it('should include member details', async () => {
      const orchestra = createTestOrchestra(association.id, { name: 'Member Orchestra' });
      addUserToOrchestra(memberUser.id, orchestra.id);

      const response = await request(app)
        .get(`/api/orchestras/${orchestra.id}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(200);
      expect(response.body.members.length).toBe(1);
      expect(response.body.members[0]).toHaveProperty('id', memberUser.id);
      expect(response.body.members[0]).toHaveProperty('firstName', memberUser.firstName);
      expect(response.body.members[0]).toHaveProperty('lastName', memberUser.lastName);
      expect(response.body.members[0]).toHaveProperty('email', memberUser.email);
    });

    it('should return 404 for non-existent orchestra', async () => {
      const response = await request(app)
        .get('/api/orchestras/non-existent-id')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(404);
    });

    it('should return 404 for orchestra from different association', async () => {
      testDb
        .prepare('INSERT INTO associations (id, name) VALUES (?, ?)')
        .run('other-assoc-orch-2', 'Other Association 2');

      const otherOrchestra = createTestOrchestra('other-assoc-orch-2', { name: 'Other Orchestra' });

      const response = await request(app)
        .get(`/api/orchestras/${otherOrchestra.id}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(404);
    });

    it('should require authentication', async () => {
      const orchestra = createTestOrchestra(association.id, { name: 'Auth Orchestra' });

      const response = await request(app).get(`/api/orchestras/${orchestra.id}`);

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/orchestras', () => {
    it('should create orchestra as admin', async () => {
      const response = await request(app)
        .post('/api/orchestras')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Orchestra' });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name', 'New Orchestra');

      // Verify in database
      const orchestra = testDb.prepare('SELECT * FROM orchestras WHERE id = ?').get(response.body.id) as any;

      expect(orchestra).toBeDefined();
      expect(orchestra.name).toBe('New Orchestra');
      expect(orchestra.association_id).toBe(association.id);
    });

    it('should trim whitespace from name', async () => {
      const response = await request(app)
        .post('/api/orchestras')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '  Trimmed Orchestra  ' });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Trimmed Orchestra');
    });

    it('should fail with duplicate name in same association', async () => {
      createTestOrchestra(association.id, { name: 'Existing Orchestra' });

      const response = await request(app)
        .post('/api/orchestras')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Existing Orchestra' });

      expect(response.status).toBe(409);
    });

    it('should fail with duplicate name (case insensitive)', async () => {
      createTestOrchestra(association.id, { name: 'Case Test Orchestra' });

      const response = await request(app)
        .post('/api/orchestras')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'CASE TEST ORCHESTRA' });

      expect(response.status).toBe(409);
    });

    it('should allow same name in different associations', async () => {
      createTestOrchestra(association.id, { name: 'Shared Name Orchestra' });

      testDb
        .prepare('INSERT INTO associations (id, name) VALUES (?, ?)')
        .run('other-assoc-orch-3', 'Other Association 3');

      const otherAdmin = createTestUser('other-assoc-orch-3', {
        email: 'otheradmin@test.com',
        role: 'admin',
      });
      const otherAdminToken = generateTestToken(otherAdmin);

      const response = await request(app)
        .post('/api/orchestras')
        .set('Authorization', `Bearer ${otherAdminToken}`)
        .send({ name: 'Shared Name Orchestra' });

      expect(response.status).toBe(201);
    });

    it('should fail with empty name', async () => {
      const response = await request(app)
        .post('/api/orchestras')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '' });

      expect(response.status).toBe(400);
    });

    it('should fail without name', async () => {
      const response = await request(app).post('/api/orchestras').set('Authorization', `Bearer ${adminToken}`).send({});

      expect(response.status).toBe(400);
    });

    it('should deny access to regular members', async () => {
      const response = await request(app)
        .post('/api/orchestras')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Forbidden Orchestra' });

      expect(response.status).toBe(403);
    });

    it('should deny access to music committee', async () => {
      const response = await request(app)
        .post('/api/orchestras')
        .set('Authorization', `Bearer ${musicCommitteeToken}`)
        .send({ name: 'Forbidden Orchestra' });

      expect(response.status).toBe(403);
    });

    it('should require authentication', async () => {
      const response = await request(app).post('/api/orchestras').send({ name: 'No Auth Orchestra' });

      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/orchestras/:id', () => {
    let testOrchestra: TestOrchestra;

    beforeEach(() => {
      testOrchestra = createTestOrchestra(association.id, { name: 'Original Orchestra' });
    });

    it('should update orchestra name as admin', async () => {
      const response = await request(app)
        .put(`/api/orchestras/${testOrchestra.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Orchestra' });

      expect(response.status).toBe(200);

      // Verify in database
      const orchestra = testDb.prepare('SELECT name FROM orchestras WHERE id = ?').get(testOrchestra.id) as any;

      expect(orchestra.name).toBe('Updated Orchestra');
    });

    it('should trim whitespace from updated name', async () => {
      const response = await request(app)
        .put(`/api/orchestras/${testOrchestra.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '  Updated Trimmed  ' });

      expect(response.status).toBe(200);

      const orchestra = testDb.prepare('SELECT name FROM orchestras WHERE id = ?').get(testOrchestra.id) as any;

      expect(orchestra.name).toBe('Updated Trimmed');
    });

    it('should fail with duplicate name', async () => {
      createTestOrchestra(association.id, { name: 'Other Orchestra' });

      const response = await request(app)
        .put(`/api/orchestras/${testOrchestra.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Other Orchestra' });

      expect(response.status).toBe(409);
    });

    it('should allow keeping same name', async () => {
      const response = await request(app)
        .put(`/api/orchestras/${testOrchestra.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Original Orchestra' });

      expect(response.status).toBe(200);
    });

    it('should return 404 for non-existent orchestra', async () => {
      const response = await request(app)
        .put('/api/orchestras/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(404);
    });

    it('should return 404 for orchestra from different association', async () => {
      testDb
        .prepare('INSERT INTO associations (id, name) VALUES (?, ?)')
        .run('other-assoc-orch-4', 'Other Association 4');

      const otherOrchestra = createTestOrchestra('other-assoc-orch-4', { name: 'Other Assoc Orchestra' });

      const response = await request(app)
        .put(`/api/orchestras/${otherOrchestra.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Hacked Name' });

      expect(response.status).toBe(404);
    });

    it('should fail with empty name', async () => {
      const response = await request(app)
        .put(`/api/orchestras/${testOrchestra.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '' });

      expect(response.status).toBe(400);
    });

    it('should deny access to regular members', async () => {
      const response = await request(app)
        .put(`/api/orchestras/${testOrchestra.id}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Hacked Orchestra' });

      expect(response.status).toBe(403);
    });

    it('should require authentication', async () => {
      const response = await request(app).put(`/api/orchestras/${testOrchestra.id}`).send({ name: 'No Auth Update' });

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /api/orchestras/:id', () => {
    let testOrchestra: TestOrchestra;

    beforeEach(() => {
      testOrchestra = createTestOrchestra(association.id, { name: 'To Delete Orchestra' });
    });

    it('should delete orchestra as admin', async () => {
      const response = await request(app)
        .delete(`/api/orchestras/${testOrchestra.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);

      // Verify deletion
      const orchestra = testDb.prepare('SELECT id FROM orchestras WHERE id = ?').get(testOrchestra.id);

      expect(orchestra).toBeUndefined();
    });

    it('should return 404 for non-existent orchestra', async () => {
      const response = await request(app)
        .delete('/api/orchestras/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });

    it('should return 404 for orchestra from different association', async () => {
      testDb
        .prepare('INSERT INTO associations (id, name) VALUES (?, ?)')
        .run('other-assoc-orch-5', 'Other Association 5');

      const otherOrchestra = createTestOrchestra('other-assoc-orch-5', { name: 'Other Delete Orchestra' });

      const response = await request(app)
        .delete(`/api/orchestras/${otherOrchestra.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });

    it('should cascade delete user_orchestras', async () => {
      addUserToOrchestra(memberUser.id, testOrchestra.id);

      // Verify user is in orchestra
      let userOrchestras = testDb.prepare('SELECT * FROM user_orchestras WHERE orchestra_id = ?').all(testOrchestra.id);
      expect(userOrchestras.length).toBe(1);

      await request(app).delete(`/api/orchestras/${testOrchestra.id}`).set('Authorization', `Bearer ${adminToken}`);

      // Verify user_orchestras are deleted
      userOrchestras = testDb.prepare('SELECT * FROM user_orchestras WHERE orchestra_id = ?').all(testOrchestra.id);
      expect(userOrchestras.length).toBe(0);
    });

    it('should deny access to regular members', async () => {
      const response = await request(app)
        .delete(`/api/orchestras/${testOrchestra.id}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(403);
    });

    it('should deny access to music committee', async () => {
      const response = await request(app)
        .delete(`/api/orchestras/${testOrchestra.id}`)
        .set('Authorization', `Bearer ${musicCommitteeToken}`);

      expect(response.status).toBe(403);
    });

    it('should require authentication', async () => {
      const response = await request(app).delete(`/api/orchestras/${testOrchestra.id}`);

      expect(response.status).toBe(401);
    });
  });
});
