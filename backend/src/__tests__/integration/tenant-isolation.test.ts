/**
 * Integration tests for multi-tenant data isolation
 * Ensures users from one association cannot access data from another
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../testApp';
import testDb from '../testDb';
import {
  createTestAssociation,
  createTestUser,
  createTestOrchestra,
  createTestRehearsal,
  generateTestToken,
  TestAssociation,
  TestUser,
} from '../testUtils';

describe('Tenant Isolation', () => {
  // Association A
  let associationA: TestAssociation;
  let adminA: TestUser;
  let tokenA: string;

  // Association B
  let associationB: TestAssociation;
  let adminB: TestUser;
  let tokenB: string;

  beforeEach(() => {
    // Create two separate associations
    associationA = createTestAssociation({ name: 'Association A' });
    associationB = createTestAssociation({ name: 'Association B' });

    // Create admin users for each
    adminA = createTestUser(associationA.id, {
      email: 'admin-a@test.com',
      role: 'admin',
    });
    adminB = createTestUser(associationB.id, {
      email: 'admin-b@test.com',
      role: 'admin',
    });

    tokenA = generateTestToken(adminA);
    tokenB = generateTestToken(adminB);
  });

  describe('Users isolation', () => {
    it('should only list users from own association', async () => {
      // Create additional users in both associations
      createTestUser(associationA.id, { email: 'member-a@test.com', role: 'member' });
      createTestUser(associationB.id, { email: 'member-b@test.com', role: 'member' });

      const resA = await request(app).get('/api/users').set('Authorization', `Bearer ${tokenA}`);

      const resB = await request(app).get('/api/users').set('Authorization', `Bearer ${tokenB}`);

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);

      // API returns paginated result with 'data' array
      const usersA = resA.body.data || resA.body.users || resA.body;
      const usersB = resB.body.data || resB.body.users || resB.body;

      // Users in A should only see users from A
      const emailsA = usersA.map((u: any) => u.email);
      expect(emailsA).toContain('admin-a@test.com');
      expect(emailsA).toContain('member-a@test.com');
      expect(emailsA).not.toContain('admin-b@test.com');
      expect(emailsA).not.toContain('member-b@test.com');

      // Users in B should only see users from B
      const emailsB = usersB.map((u: any) => u.email);
      expect(emailsB).toContain('admin-b@test.com');
      expect(emailsB).toContain('member-b@test.com');
      expect(emailsB).not.toContain('admin-a@test.com');
      expect(emailsB).not.toContain('member-a@test.com');
    });

    it('should not allow accessing user from another association', async () => {
      const userB = createTestUser(associationB.id, {
        email: 'target@test.com',
        role: 'member',
      });

      // Admin A tries to access user from association B
      const res = await request(app).get(`/api/users/${userB.id}`).set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
    });

    it('should not allow modifying user from another association', async () => {
      const userB = createTestUser(associationB.id, {
        email: 'target@test.com',
        role: 'member',
      });

      // Admin A tries to update user from association B
      const res = await request(app)
        .put(`/api/users/${userB.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ first_name: 'Hacked' });

      expect(res.status).toBe(404);

      // Verify user was not modified
      const user = testDb.prepare('SELECT first_name FROM users WHERE id = ?').get(userB.id) as any;
      expect(user.first_name).toBe('Test');
    });

    it('should not allow deleting user from another association', async () => {
      const userB = createTestUser(associationB.id, {
        email: 'target@test.com',
        role: 'member',
      });

      // Admin A tries to delete user from association B
      const res = await request(app).delete(`/api/users/${userB.id}`).set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);

      // Verify user still exists
      const user = testDb.prepare('SELECT id FROM users WHERE id = ?').get(userB.id);
      expect(user).toBeDefined();
    });
  });

  describe('Orchestras isolation', () => {
    it('should only list orchestras from own association', async () => {
      createTestOrchestra(associationA.id, { name: 'Orchestra A' });
      createTestOrchestra(associationB.id, { name: 'Orchestra B' });

      const resA = await request(app).get('/api/orchestras').set('Authorization', `Bearer ${tokenA}`);

      const resB = await request(app).get('/api/orchestras').set('Authorization', `Bearer ${tokenB}`);

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);

      // API may return data in different formats
      const orchestrasA = resA.body.orchestras || resA.body.data || resA.body;
      const orchestrasB = resB.body.orchestras || resB.body.data || resB.body;

      const namesA = orchestrasA.map((o: any) => o.name);
      expect(namesA).toContain('Orchestra A');
      expect(namesA).not.toContain('Orchestra B');

      const namesB = orchestrasB.map((o: any) => o.name);
      expect(namesB).toContain('Orchestra B');
      expect(namesB).not.toContain('Orchestra A');
    });

    it('should not allow accessing orchestra from another association', async () => {
      const orchestraB = createTestOrchestra(associationB.id, { name: 'Orchestra B' });

      const res = await request(app).get(`/api/orchestras/${orchestraB.id}`).set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
    });

    it('should not allow modifying orchestra from another association', async () => {
      const orchestraB = createTestOrchestra(associationB.id, { name: 'Orchestra B' });

      const res = await request(app)
        .put(`/api/orchestras/${orchestraB.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Hacked Orchestra' });

      expect(res.status).toBe(404);

      // Verify orchestra was not modified
      const orchestra = testDb.prepare('SELECT name FROM orchestras WHERE id = ?').get(orchestraB.id) as any;
      expect(orchestra.name).toBe('Orchestra B');
    });
  });

  describe('Rehearsals isolation', () => {
    it('should only list rehearsals from own association', async () => {
      createTestRehearsal(associationA.id, adminA.id, {
        date: '2026-05-10',
        location: 'Location A',
      });
      createTestRehearsal(associationB.id, adminB.id, {
        date: '2026-05-10',
        location: 'Location B',
      });

      const resA = await request(app).get('/api/rehearsals').set('Authorization', `Bearer ${tokenA}`);

      expect(resA.status).toBe(200);

      // API may return data in different formats
      const rehearsalsA = resA.body.rehearsals || resA.body.data || resA.body;
      const locationsA = rehearsalsA.map((r: any) => r.location);
      expect(locationsA).toContain('Location A');
      expect(locationsA).not.toContain('Location B');
    });

    it('should not allow accessing rehearsal from another association', async () => {
      const rehearsalB = createTestRehearsal(associationB.id, adminB.id);

      const res = await request(app).get(`/api/rehearsals/${rehearsalB.id}`).set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
    });

    it('should not allow modifying rehearsal from another association', async () => {
      const rehearsalB = createTestRehearsal(associationB.id, adminB.id, {
        location: 'Original Location',
      });

      const res = await request(app)
        .put(`/api/rehearsals/${rehearsalB.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ location: 'Hacked Location' });

      expect(res.status).toBe(404);

      // Verify rehearsal was not modified
      const rehearsal = testDb.prepare('SELECT location FROM rehearsals WHERE id = ?').get(rehearsalB.id) as any;
      expect(rehearsal.location).toBe('Original Location');
    });

    it('should not allow deleting rehearsal from another association', async () => {
      const rehearsalB = createTestRehearsal(associationB.id, adminB.id);

      const res = await request(app)
        .delete(`/api/rehearsals/${rehearsalB.id}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);

      // Verify rehearsal still exists
      const rehearsal = testDb.prepare('SELECT id FROM rehearsals WHERE id = ?').get(rehearsalB.id);
      expect(rehearsal).toBeDefined();
    });
  });

  describe('Cross-association data injection prevention', () => {
    it('should not allow creating resources in another association', async () => {
      // Try to create an orchestra with association B's ID while authenticated as A
      const res = await request(app).post('/api/orchestras').set('Authorization', `Bearer ${tokenA}`).send({
        name: 'Injected Orchestra',
        association_id: associationB.id, // Attempt to inject
      });

      // Should either fail or create in association A
      if (res.status === 201) {
        const createdOrchestra = testDb
          .prepare('SELECT association_id FROM orchestras WHERE name = ?')
          .get('Injected Orchestra') as any;
        // The orchestra should be in association A, not B
        expect(createdOrchestra.association_id).toBe(associationA.id);
      }
    });

    it('should not allow batch operations on resources from another association', async () => {
      const rehearsalB = createTestRehearsal(associationB.id, adminB.id);

      // Try to batch delete including a rehearsal from another association
      const res = await request(app)
        .post('/api/rehearsals/batch-delete')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ids: [rehearsalB.id] });

      // Should not delete the rehearsal
      const rehearsal = testDb.prepare('SELECT id FROM rehearsals WHERE id = ?').get(rehearsalB.id);
      expect(rehearsal).toBeDefined();
    });
  });
});
