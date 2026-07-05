/**
 * Integration tests for download-token routes
 * Tests: POST /api/download-token requires auth; the issued short-lived token
 * is accepted on GET requests and rejected on POST requests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express, { Response } from 'express';
import request from 'supertest';
import '../setup';
import downloadTokenRoutes from '../../routes/download-token';
import { authenticateToken, AuthRequest } from '../../middleware/auth';
import { verifyDownloadToken, DOWNLOAD_TOKEN_TTL_SECONDS } from '../../utils/downloadToken';
import { createTestEnvironment, generateInvalidToken, TestUser } from '../testUtils';

// Minimal app: the download-token router plus a protected resource route
// (mirrors how download/media routes use authenticateToken in production).
const app = express();
app.use(express.json());
app.use('/api/download-token', downloadTokenRoutes);
app.get('/api/protected', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({ ok: true, userId: req.user!.id, role: req.user!.role });
});
app.post('/api/protected', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({ ok: true });
});

async function mintDownloadToken(authToken: string): Promise<string> {
  const response = await request(app).post('/api/download-token').set('Authorization', `Bearer ${authToken}`);
  expect(response.status).toBe(200);
  return response.body.token;
}

describe('Download Token Routes', () => {
  let memberUser: TestUser;
  let memberToken: string;

  beforeEach(() => {
    const env = createTestEnvironment();
    memberUser = env.memberUser;
    memberToken = env.memberToken;
  });

  describe('POST /api/download-token', () => {
    it('requires authentication', async () => {
      const response = await request(app).post('/api/download-token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('rejects invalid tokens', async () => {
      const response = await request(app)
        .post('/api/download-token')
        .set('Authorization', `Bearer ${generateInvalidToken()}`);

      expect(response.status).toBe(401);
    });

    it('issues a short-lived download token for an authenticated user', async () => {
      const response = await request(app).post('/api/download-token').set('Authorization', `Bearer ${memberToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body.expiresIn).toBe(DOWNLOAD_TOKEN_TTL_SECONDS);

      // The issued token carries the download purpose and the user's identity
      const payload = verifyDownloadToken(response.body.token);
      expect(payload).not.toBeNull();
      expect(payload!.purpose).toBe('download');
      expect(payload!.id).toBe(memberUser.id);
      expect(payload!.role).toBe(memberUser.role);
    });

    it('cannot be called with a download token itself (no re-minting)', async () => {
      const downloadToken = await mintDownloadToken(memberToken);

      const response = await request(app).post('/api/download-token').set('Authorization', `Bearer ${downloadToken}`);

      expect(response.status).toBe(401);
    });
  });

  describe('using a download token on protected routes', () => {
    it('is accepted on GET requests via the token query parameter', async () => {
      const downloadToken = await mintDownloadToken(memberToken);

      const response = await request(app).get('/api/protected').query({ token: downloadToken });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.userId).toBe(memberUser.id);
    });

    it('is accepted on GET requests via the Authorization header', async () => {
      const downloadToken = await mintDownloadToken(memberToken);

      const response = await request(app).get('/api/protected').set('Authorization', `Bearer ${downloadToken}`);

      expect(response.status).toBe(200);
      expect(response.body.userId).toBe(memberUser.id);
    });

    it('is rejected on POST requests (downloads only)', async () => {
      const downloadToken = await mintDownloadToken(memberToken);

      const response = await request(app).post('/api/protected').query({ token: downloadToken });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('is rejected on POST requests via the Authorization header too', async () => {
      const downloadToken = await mintDownloadToken(memberToken);

      const response = await request(app).post('/api/protected').set('Authorization', `Bearer ${downloadToken}`);

      expect(response.status).toBe(401);
    });

    it('rejects garbage tokens on GET', async () => {
      const response = await request(app).get('/api/protected').query({ token: 'not-a-token' });

      expect(response.status).toBe(401);
    });

    it('still accepts a regular auth token on GET and POST', async () => {
      const getResponse = await request(app).get('/api/protected').set('Authorization', `Bearer ${memberToken}`);
      const postResponse = await request(app).post('/api/protected').set('Authorization', `Bearer ${memberToken}`);

      expect(getResponse.status).toBe(200);
      expect(postResponse.status).toBe(200);
    });
  });
});
