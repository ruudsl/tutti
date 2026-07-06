import jwt from 'jsonwebtoken';
import config from '../config';

/**
 * Short-lived download tokens.
 *
 * These tokens exist for contexts where the frontend cannot set an
 * Authorization header (e.g. <img src>, <audio src>, window.open for file
 * downloads, PDF viewers). Instead of putting the full, long-lived JWT in a
 * query string (which leaks into server logs, proxies and browser history),
 * the frontend requests a short-lived token via POST /api/download-token and
 * appends that to the URL instead.
 *
 * Properties:
 * - Signed with the same JWT secret as regular auth tokens.
 * - Carries a `purpose: 'download'` claim so it can be distinguished from a
 *   full auth token.
 * - Expires after 5 minutes, so a leaked URL is only briefly useful.
 * - Not backed by a session record: the auth middleware skips session
 *   validation for these tokens and only accepts them on GET/HEAD requests.
 */

export const DOWNLOAD_TOKEN_PURPOSE = 'download' as const;

/** Download tokens are valid for 5 minutes. */
export const DOWNLOAD_TOKEN_TTL_SECONDS = 5 * 60;

export interface DownloadTokenPayload {
  id: string;
  email?: string;
  role: string;
  associationId: string | null;
  purpose: typeof DOWNLOAD_TOKEN_PURPOSE;
  iat?: number;
  exp?: number;
}

/**
 * Generate a short-lived token that can safely be used in a query string for
 * downloads and media URLs.
 */
export function generateDownloadToken(
  userId: string,
  associationId: string | null,
  role: string,
  email?: string,
): string {
  return jwt.sign(
    {
      id: userId,
      email,
      role,
      associationId,
      purpose: DOWNLOAD_TOKEN_PURPOSE,
    },
    config.jwtSecret,
    { expiresIn: DOWNLOAD_TOKEN_TTL_SECONDS },
  );
}

/**
 * Verify a download token.
 *
 * @returns the decoded payload when the token is a valid, non-expired JWT
 * carrying the `purpose: 'download'` claim; otherwise null (also for valid
 * full auth JWTs, which do not carry the purpose claim).
 */
export function verifyDownloadToken(token: string): DownloadTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      (decoded as Record<string, unknown>).purpose === DOWNLOAD_TOKEN_PURPOSE &&
      typeof (decoded as Record<string, unknown>).id === 'string'
    ) {
      return decoded as unknown as DownloadTokenPayload;
    }
    return null;
  } catch {
    return null;
  }
}
