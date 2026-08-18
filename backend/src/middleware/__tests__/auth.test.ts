import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  authenticateToken,
  requireRole,
  requireMinRole,
  requireSectionLeader,
  optionalAuth,
  generateToken,
  AuthRequest,
  UserPayload,
} from '../auth';
import { generateDownloadToken } from '../../utils/downloadToken';
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

describe('requireMinRole', () => {
  it.each([
    ['admin', 'member'],
    ['admin', 'admin'],
    ['music_committee', 'conductor'],
    ['conductor', 'section_leader'],
    ['section_leader', 'member'],
  ])('lets %s through when at least %s is required', (role, minRole) => {
    const middleware = requireMinRole(minRole as Parameters<typeof requireMinRole>[0]);
    const req = mockRequest({ user: { ...testUser, role } });
    const res = mockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([
    ['member', 'conductor'],
    ['section_leader', 'music_committee'],
    ['conductor', 'admin'],
  ])('rejects %s when %s is required', (role, minRole) => {
    const middleware = requireMinRole(minRole as Parameters<typeof requireMinRole>[0]);
    const req = mockRequest({ user: { ...testUser, role } });
    const res = mockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('treats an unknown role as level 0', () => {
    const middleware = requireMinRole('member');
    const req = mockRequest({ user: { ...testUser, role: 'guest_from_the_future' } });
    const res = mockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('rejects unauthenticated requests', () => {
    const middleware = requireMinRole('member');
    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('requireSectionLeader', () => {
  const getInstrumentId = (req: AuthRequest) => (req.params as Record<string, string>)?.instrumentId;

  it.each(['admin', 'music_committee', 'conductor'])('always lets %s through', async (role) => {
    const middleware = requireSectionLeader(getInstrumentId);
    const req = mockRequest({ user: { ...testUser, role }, params: {} } as Partial<AuthRequest>);
    const res = mockResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('rejects unauthenticated requests', async () => {
    const middleware = requireSectionLeader(getInstrumentId);
    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects a member who is not a section leader', async () => {
    const middleware = requireSectionLeader(getInstrumentId);
    const req = mockRequest({
      user: { ...testUser, role: 'member' },
      params: { instrumentId: 'instrument-1' },
    } as Partial<AuthRequest>);
    const res = mockResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a section leader when no instrument id can be resolved', async () => {
    const middleware = requireSectionLeader(() => undefined);
    const req = mockRequest({
      user: { ...testUser, role: 'section_leader' },
      params: {},
    } as Partial<AuthRequest>);
    const res = mockResponse();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('optionalAuth', () => {
  beforeEach(() => {
    vi.mocked(findSessionByTokenHash).mockReturnValue({
      id: 'session-1',
      user_id: 'user-1',
      token_hash: 'token-hash',
      revoked_at: null,
      expires_at: '2099-01-01T00:00:00.000Z',
    } as ReturnType<typeof findSessionByTokenHash>);
  });

  it('continues without a user when no token is present', () => {
    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('attaches the user for a valid token', () => {
    const token = generateToken({
      id: testUser.id,
      email: testUser.email,
      role: testUser.role,
      association_id: testUser.associationId,
    });
    const req = mockRequest({ headers: { authorization: `Bearer ${token}` } });
    const res = mockResponse();
    const next = vi.fn();

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user?.id).toBe(testUser.id);
  });

  it('accepts a token passed as a query parameter', () => {
    const token = generateToken({
      id: testUser.id,
      email: testUser.email,
      role: testUser.role,
      association_id: testUser.associationId,
    });
    const req = mockRequest({ query: { token } });
    const res = mockResponse();
    const next = vi.fn();

    optionalAuth(req, res, next);

    expect(req.user?.id).toBe(testUser.id);
  });

  it('ignores an invalid token instead of failing the request', () => {
    const req = mockRequest({ headers: { authorization: 'Bearer not-a-jwt' } });
    const res = mockResponse();
    const next = vi.fn();

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('does not attach a user for a revoked session', () => {
    vi.mocked(findSessionByTokenHash).mockReturnValue({
      id: 'session-1',
      user_id: 'user-1',
      token_hash: 'token-hash',
      revoked_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2099-01-01T00:00:00.000Z',
    } as ReturnType<typeof findSessionByTokenHash>);

    const token = generateToken({
      id: testUser.id,
      email: testUser.email,
      role: testUser.role,
      association_id: testUser.associationId,
    });
    const req = mockRequest({ headers: { authorization: `Bearer ${token}` } });
    const res = mockResponse();
    const next = vi.fn();

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('attaches the user for a download token on a GET request', () => {
    const token = generateDownloadToken(testUser.id, testUser.associationId, testUser.role, testUser.email);
    const req = mockRequest({ headers: { authorization: `Bearer ${token}` }, method: 'GET' });
    const res = mockResponse();
    const next = vi.fn();

    optionalAuth(req, res, next);

    expect(req.user?.id).toBe(testUser.id);
    expect(next).toHaveBeenCalled();
  });

  it('ignores a download token on a POST request', () => {
    const token = generateDownloadToken(testUser.id, testUser.associationId, testUser.role, testUser.email);
    const req = mockRequest({ headers: { authorization: `Bearer ${token}` }, method: 'POST' });
    const res = mockResponse();
    const next = vi.fn();

    optionalAuth(req, res, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});

describe('authenticateToken with download tokens', () => {
  it('accepts a download token on GET', () => {
    const token = generateDownloadToken(testUser.id, testUser.associationId, testUser.role, testUser.email);
    const req = mockRequest({ headers: { authorization: `Bearer ${token}` }, method: 'GET' });
    const res = mockResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user?.id).toBe(testUser.id);
  });

  it('accepts a download token passed via the query string', () => {
    const token = generateDownloadToken(testUser.id, testUser.associationId, testUser.role);
    const req = mockRequest({ query: { token }, method: 'HEAD' });
    const res = mockResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user?.email).toBe('');
  });

  it('rejects a download token on a mutating request', () => {
    const token = generateDownloadToken(testUser.id, testUser.associationId, testUser.role, testUser.email);
    const req = mockRequest({ headers: { authorization: `Bearer ${token}` }, method: 'DELETE' });
    const res = mockResponse();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
