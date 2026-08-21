import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import db from '../database/connection';
import logger from '../utils/logger';
import { hashToken, findSessionByTokenHash, registerSession, updateSessionActivityByHash } from '../utils/sessionStore';
import { verifyDownloadToken, DownloadTokenPayload } from '../utils/downloadToken';

export interface UserPayload {
  id: string;
  email: string;
  role: string;
  associationId: string | null;
}

type DecodedToken = UserPayload & { iat?: number; exp?: number };

export interface AuthRequest extends Request {
  user?: UserPayload;
}

/**
 * Validate the token against the user_sessions table and the user's
 * password_changed_at timestamp.
 *
 * Rules:
 * - A session that was explicitly revoked -> invalid (401).
 * - A known, non-revoked session -> valid (its last_active is updated, throttled).
 * - No session record at all (token issued before session tracking existed):
 *   the token is only accepted if it was issued after the user's last password
 *   change, and is then lazily registered (upsert) so it becomes revocable.
 *
 * Note: password_changed_at is only checked on the lazy path. Sessions kept
 * intentionally across a password change (the current session during
 * change-password) remain valid via their session record; all other sessions
 * are revoked explicitly at password change/reset time.
 *
 * @returns null when valid, otherwise a 401 error message.
 */
function validateSession(req: AuthRequest, token: string, decoded: DecodedToken): string | null {
  const tokenHash = hashToken(token);
  const session = findSessionByTokenHash(tokenHash);

  if (session) {
    if (session.revoked_at) {
      return 'Sessie is beëindigd. Log opnieuw in.';
    }
    if (session.user_id !== decoded.id) {
      return 'Token verlopen of ongeldig.';
    }
    updateSessionActivityByHash(tokenHash);
    return null;
  }

  // Legacy/unknown token: no session record exists
  const user = db
    .prepare('SELECT id, password_changed_at FROM users WHERE id = ? AND deleted_at IS NULL')
    .get(decoded.id) as { id: string; password_changed_at: string | null } | undefined;

  if (!user) {
    return 'Token verlopen of ongeldig.';
  }

  if (user.password_changed_at && decoded.iat !== undefined) {
    const passwordChangedAt = new Date(user.password_changed_at).getTime();
    if (!isNaN(passwordChangedAt) && decoded.iat * 1000 < passwordChangedAt) {
      return 'Token verlopen of ongeldig.';
    }
  }

  // Lazily register the session so it shows up in session management
  // and becomes revocable. Align expiry with the JWT's own expiry.
  registerSession(
    decoded.id,
    token,
    req.ip,
    req.get('user-agent'),
    7,
    decoded.exp !== undefined ? new Date(decoded.exp * 1000) : undefined,
  );

  return null;
}

/**
 * Handle a short-lived download token (purpose: 'download').
 *
 * Download tokens are minted by POST /api/download-token for URLs where the
 * frontend cannot set an Authorization header (<img src>, <audio src>,
 * window.open, PDF viewer). They expire after 5 minutes, carry no session
 * record (so session validation is skipped) and are only accepted on
 * GET/HEAD requests, which also prevents them from minting new tokens.
 *
 * @returns true when the request was handled (user attached or response
 * sent), false when the token is not a download token.
 */
function handleDownloadToken(req: AuthRequest, res: Response, next: NextFunction, token: string): boolean {
  const payload: DownloadTokenPayload | null = verifyDownloadToken(token);
  if (!payload) {
    return false;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(401).json({ error: 'Download-token is alleen geldig voor downloads.' });
    return true;
  }

  req.user = {
    id: payload.id,
    email: payload.email ?? '',
    role: payload.role,
    associationId: payload.associationId,
  };
  next();
  return true;
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  // Check Authorization header first, then query parameter (for downloads)
  const queryToken = !headerToken ? (req.query.token as string | undefined) : undefined;
  const token = headerToken || queryToken;

  if (!token) {
    return res.status(401).json({ error: 'Toegang geweigerd. Geen token opgegeven.' });
  }

  // Short-lived download token (purpose: 'download'): no session record
  // exists for these, so session validation is skipped.
  if (handleDownloadToken(req, res, next, token)) {
    return;
  }

  if (queryToken) {
    // Legacy: a full JWT passed via query parameter. Still accepted during
    // the transition period, but log it so remaining call sites can be
    // migrated to short-lived download tokens (POST /api/download-token).
    logger.warn(
      `Legacy full JWT accepted via query parameter (path: ${req.path}). Migrate to short-lived download tokens.`,
    );
  }

  let decoded: DecodedToken;
  try {
    decoded = jwt.verify(token, config.jwtSecret) as DecodedToken;
  } catch (error) {
    return res.status(401).json({ error: 'Token verlopen of ongeldig.' });
  }

  try {
    const sessionError = validateSession(req, token, decoded);
    if (sessionError) {
      return res.status(401).json({ error: sessionError });
    }
  } catch (error) {
    // Infrastructure error (e.g. database not initialized yet): don't lock
    // everyone out, but log it. Explicit revocations are handled above.
    logger.warn('Session validation skipped due to error:', error);
  }

  req.user = {
    id: decoded.id,
    email: decoded.email,
    role: decoded.role,
    associationId: decoded.associationId,
  };
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Niet geauthenticeerd.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Onvoldoende rechten voor deze actie.' });
    }

    next();
  };
}

/**
 * Alleen voor een super-admin: iemand die over de hele installatie gaat, niet
 * over een vereniging.
 *
 * requireRole('admin') is verenigingsgebonden - het is de beheerder van een
 * vereniging. Voor handelingen die alle verenigingen tegelijk raken is dat te
 * ruim. De controle stond tot nu toe als losse regel in elke route van
 * multi-association.ts; hier staat hij een keer.
 */
export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Niet geauthenticeerd.' });
  }

  const superAdmin = db.prepare('SELECT id FROM super_admins WHERE user_id = ?').get(req.user.id);

  if (!superAdmin) {
    return res.status(403).json({ error: 'Super admin rechten vereist.' });
  }

  next();
}

export function generateToken(user: {
  id: string;
  email: string;
  role: string;
  association_id: string | null;
}): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      associationId: user.association_id,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] },
  );
}

/**
 * Optional authentication - attaches user if token is present, but allows unauthenticated access
 */
/**
 * Check if user has at least the specified role level
 * Hierarchy: admin > music_committee > conductor > section_leader > member
 */
export function requireMinRole(minRole: 'admin' | 'music_committee' | 'conductor' | 'section_leader' | 'member') {
  const roleHierarchy: Record<string, number> = {
    admin: 5,
    music_committee: 4,
    conductor: 3,
    section_leader: 2,
    member: 1,
  };

  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Niet geauthenticeerd.' });
    }

    const userLevel = roleHierarchy[req.user.role] || 0;
    const requiredLevel = roleHierarchy[minRole] || 0;

    if (userLevel < requiredLevel) {
      return res.status(403).json({ error: 'Onvoldoende rechten voor deze actie.' });
    }

    next();
  };
}

/**
 * Check if user is section leader for a specific instrument section
 */
export function requireSectionLeader(getInstrumentId: (req: AuthRequest) => string | undefined) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Niet geauthenticeerd.' });
    }

    // Admin, music_committee, and conductor can always access
    if (['admin', 'music_committee', 'conductor'].includes(req.user.role)) {
      return next();
    }

    // Section leaders can only manage their own section
    if (req.user.role === 'section_leader') {
      const instrumentId = getInstrumentId(req);
      if (instrumentId) {
        // Import db dynamically to avoid circular dependency
        const db = (await import('../database/connection')).default;
        const userInstrument = db
          .prepare('SELECT 1 FROM user_instruments WHERE user_id = ? AND instrument_id = ?')
          .get(req.user.id, instrumentId);

        if (userInstrument) {
          return next();
        }
      }
    }

    return res.status(403).json({ error: 'Je kunt alleen je eigen sectie beheren.' });
  };
}

/**
 * Optional authentication - attaches user if token is present, but allows unauthenticated access
 */
export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || (req.query.token as string);

  if (!token) {
    return next();
  }

  // Short-lived download token (purpose: 'download'): no session record
  // exists for these, so the session check below is skipped.
  const downloadPayload = verifyDownloadToken(token);
  if (downloadPayload) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      req.user = {
        id: downloadPayload.id,
        email: downloadPayload.email ?? '',
        role: downloadPayload.role,
        associationId: downloadPayload.associationId,
      };
    }
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as DecodedToken;

    // Don't attach a user for an explicitly revoked session
    try {
      const session = findSessionByTokenHash(hashToken(token));
      if (session?.revoked_at) {
        return next();
      }
    } catch (error) {
      logger.warn('Optional auth session check skipped due to error:', error);
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      associationId: decoded.associationId,
    };
  } catch {
    // Ignore invalid tokens in optional auth
  }

  next();
}
