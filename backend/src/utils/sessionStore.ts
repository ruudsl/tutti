/**
 * Session store helpers for the user_sessions table.
 *
 * Lives in utils/ (not routes/) so both the auth middleware and the auth/session
 * routes can use it without creating a circular import
 * (routes import middleware/auth, so middleware/auth cannot import routes).
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import logger from './logger';

export interface SessionRecord {
  id: string;
  user_id: string;
  token_hash: string;
  revoked_at: string | null;
  expires_at: string;
}

/** How often (at most) a session's last_active is written to the database. */
const ACTIVITY_UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** Safety cap so the in-memory throttle map cannot grow without bound. */
const MAX_TRACKED_SESSIONS = 10000;

// token_hash -> timestamp (ms) of the last last_active write
const lastActivityWrite = new Map<string, number>();

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Find a session (revoked or not) by its token hash.
 */
export function findSessionByTokenHash(tokenHash: string): SessionRecord | undefined {
  return db
    .prepare('SELECT id, user_id, token_hash, revoked_at, expires_at FROM user_sessions WHERE token_hash = ? LIMIT 1')
    .get(tokenHash) as SessionRecord | undefined;
}

/**
 * Register a new session for a user (called on login / token issuance,
 * and lazily from the auth middleware for tokens issued before session
 * tracking existed).
 *
 * @param expiresAt Optional explicit expiry (e.g. derived from the JWT `exp`).
 *                  Falls back to `expiresInDays` from now.
 */
export function registerSession(
  userId: string,
  token: string,
  ipAddress: string | undefined,
  userAgent: string | undefined,
  expiresInDays: number = 7,
  expiresAt?: Date,
): string {
  const id = uuidv4();
  const tokenHash = hashToken(token);

  let expiry = expiresAt;
  if (!expiry) {
    expiry = new Date();
    expiry.setDate(expiry.getDate() + expiresInDays);
  }

  db.prepare(
    `
        INSERT INTO user_sessions (id, user_id, token_hash, ip_address, user_agent, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(id, userId, tokenHash, ipAddress || null, userAgent || null, expiry.toISOString());

  // Clean up expired sessions (also removes stale revoked ones once expired)
  db.prepare("DELETE FROM user_sessions WHERE expires_at < datetime('now')").run();

  // Fresh row already has last_active = now; no need to write again for a while
  rememberActivityWrite(tokenHash);

  return id;
}

/**
 * Update a session's last_active, throttled to at most one database write
 * per session per ACTIVITY_UPDATE_INTERVAL_MS.
 */
export function updateSessionActivity(token: string): void {
  updateSessionActivityByHash(hashToken(token));
}

export function updateSessionActivityByHash(tokenHash: string): void {
  const now = Date.now();
  const lastWrite = lastActivityWrite.get(tokenHash);

  if (lastWrite !== undefined && now - lastWrite < ACTIVITY_UPDATE_INTERVAL_MS) {
    return; // throttled
  }

  db.prepare('UPDATE user_sessions SET last_active = CURRENT_TIMESTAMP WHERE token_hash = ?').run(tokenHash);

  rememberActivityWrite(tokenHash);
}

function rememberActivityWrite(tokenHash: string): void {
  const now = Date.now();

  if (lastActivityWrite.size >= MAX_TRACKED_SESSIONS) {
    // Prune stale entries; if everything is fresh, drop the map entirely
    for (const [hash, ts] of lastActivityWrite) {
      if (now - ts >= ACTIVITY_UPDATE_INTERVAL_MS) {
        lastActivityWrite.delete(hash);
      }
    }
    if (lastActivityWrite.size >= MAX_TRACKED_SESSIONS) {
      lastActivityWrite.clear();
    }
  }

  lastActivityWrite.set(tokenHash, now);
}

/**
 * Soft-revoke sessions for a user. Revoked sessions stay in the table so the
 * auth middleware can distinguish "explicitly revoked" (401) from "legacy
 * token without a session record" (lazily registered).
 *
 * @param exceptTokenHash When provided, that session (typically the current
 *                        one) is left untouched.
 * @returns number of sessions revoked
 */
export function revokeUserSessions(userId: string, exceptTokenHash?: string): number {
  let result;
  if (exceptTokenHash) {
    result = db
      .prepare(
        `
            UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND token_hash != ? AND revoked_at IS NULL
        `,
      )
      .run(userId, exceptTokenHash);
  } else {
    result = db
      .prepare(
        `
            UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND revoked_at IS NULL
        `,
      )
      .run(userId);
  }

  if (result.changes > 0) {
    logger.info(`Revoked ${result.changes} session(s) for user ${userId}`);
  }

  return result.changes;
}
