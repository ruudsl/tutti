import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { authenticateToken, requireRole, generateToken, AuthRequest, UserPayload } from '../auth';
import { Response, NextFunction } from 'express';

// Mock the config module
vi.mock('../../config', () => ({
  default: {
    jwtSecret: 'test-secret-key',
    jwtExpiresIn: '1h',
  },
}));

// Mock the session store so these stay pure JWT unit tests; the session
// integration paths are covered by the auth route tests.
vi.mock('../../utils/sessionStore', () => ({
  hashToken: vi.fn(() => 'token-hash'),
  findSessionByTokenHash: vi.fn(() => ({
    id: 'session-1',
    user_id: 'user-1',
    token_hash: 'token-hash',
    revoked_at: null,
    expires_at: '2099-01-01T00:00:00.000Z',
  })),
  registerSession: vi.fn(),
  updateSessionActivityByHash: vi.fn(),
}));

import { findSessionByTokenHash } from '../../utils/sessionStore';

function mockResponse(): Response {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis() as any,
    json: vi.fn().mockReturnThis() as any,
  };
  return res as Response;
}

function mockRequest(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    headers: {},
    query: {},
    ...overrides,
  } as AuthRequest;
}

const testUser: UserPayload = {
  id: 'user-1',
  email: 'test@example.com',
  role: 'admin',
  associationId: 'assoc-1',
};

describe('generateToken', () => {
  it('generates a valid JWT token', () => {
    const token = generateToken({
      id: testUser.id,
      email: testUser.email,
      role: testUser.role,
      association_id: testUser.associationId,
    });

    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');

    const decoded = jwt.verify(token, 'test-secret-key') as UserPayload;
    expect(decoded.id).toBe('user-1');
    expect(decoded.email).toBe('test@example.com');
    expect(decoded.role).toBe('admin');
    expect(decoded.associationId).toBe('assoc-1');
  });
});

describe('authenticateToken', () => {
  it('rejects requests without token', () => {
    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts valid Bearer token', () => {
    const token = jwt.sign(testUser, 'test-secret-key');
    const req = mockRequest({
      headers: { authorization: `Bearer ${token}` } as any,
    });
    const res = mockResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user!.id).toBe('user-1');
  });

  it('accepts token from query parameter', () => {
    const token = jwt.sign(testUser, 'test-secret-key');
    const req = mockRequest({
      query: { token } as any,
    });
    const res = mockResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
  });

  it('rejects invalid token', () => {
    const req = mockRequest({
      headers: { authorization: 'Bearer invalid-token' } as any,
    });
    const res = mockResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects expired token', () => {
    const token = jwt.sign(testUser, 'test-secret-key', { expiresIn: '-1s' });
    const req = mockRequest({
      headers: { authorization: `Bearer ${token}` } as any,
    });
    const res = mockResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects token whose session was revoked', () => {
    vi.mocked(findSessionByTokenHash).mockReturnValueOnce({
      id: 'session-1',
      user_id: 'user-1',
      token_hash: 'token-hash',
      revoked_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2099-01-01T00:00:00.000Z',
    });

    const token = jwt.sign(testUser, 'test-secret-key');
    const req = mockRequest({
      headers: { authorization: `Bearer ${token}` } as any,
    });
    const res = mockResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireRole', () => {
  it('allows user with matching role', () => {
    const middleware = requireRole('admin', 'music_committee');
    const req = mockRequest({ user: testUser });
    const res = mockResponse();
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects user without matching role', () => {
    const middleware = requireRole('admin');
    const req = mockRequest({
      user: { ...testUser, role: 'member' },
    });
    const res = mockResponse();
    const next = vi.fn();

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests', () => {
    const middleware = requireRole('admin');
    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
