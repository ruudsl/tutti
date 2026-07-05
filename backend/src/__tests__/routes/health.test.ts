/**
 * Integration tests for health routes
 * Tests: GET /api/health, GET /api/health/ready, auth on /api/health/detailed
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import '../setup';
import healthRoutes from '../../routes/health';
import { createTestEnvironment, generateInvalidToken } from '../testUtils';

// Minimal app with only the health router mounted (same prefix as index.ts)
const app = express();
app.use(express.json());
app.use('/api/health', healthRoutes);

describe('Health Routes', () => {
  let adminToken: string;
  let memberToken: string;

  beforeEach(() => {
    const env = createTestEnvironment();
    adminToken = env.adminToken;
    memberToken = env.memberToken;
  });

  describe('GET /api/health', () => {
    it('returns 200 with a healthy status payload', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('environment');
    });

    it('returns a parseable ISO timestamp and numeric uptime', async () => {
      const response = await request(app).get('/api/health');

      expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('does not require authentication', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/health/ready', () => {
    it('returns 200 ready when the database responds', async () => {
      const response = await request(app).get('/api/health/ready');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ready' });
    });

    it('does not require authentication', async () => {
      const response = await request(app).get('/api/health/ready');
      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/health/detailed', () => {
    it('requires authentication', async () => {
      const response = await request(app).get('/api/health/detailed');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('rejects invalid tokens', async () => {
      const response = await request(app)
        .get('/api/health/detailed')
        .set('Authorization', `Bearer ${generateInvalidToken()}`);

      expect(response.status).toBe(401);
    });

    it('rejects non-admin users', async () => {
      const response = await request(app).get('/api/health/detailed').set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
    });

    it('returns service statuses for admins', async () => {
      const response = await request(app).get('/api/health/detailed').set('Authorization', `Bearer ${adminToken}`);

      // Overall status depends on host disk/memory, so both 200 (healthy or
      // degraded) and 503 (unhealthy) are acceptable; the shape must be there.
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('services');
      expect(response.body.services).toHaveProperty('database');
      expect(response.body.services).toHaveProperty('disk');
      expect(response.body.services).toHaveProperty('memory');
      expect(response.body).toHaveProperty('system');
      // Database check runs against the (seeded) test database
      expect(response.body.services.database.status).toBe('healthy');
    });
  });
});
