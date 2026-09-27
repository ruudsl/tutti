import crypto from 'crypto';
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

// ---------------------------------------------------------------------------
// Download-token voor één bron
// ---------------------------------------------------------------------------

/**
 * Bronnen waarvoor een download-token per bron bestaat. Elke soort hoort bij
 * precies één downloadroute, die met authenticateBronDownload alleen een
 * token voor die soort en dat ene id aanneemt.
 */
export const BRONSOORTEN = ['mp3'] as const;
export type Bronsoort = (typeof BRONSOORTEN)[number];

const BRON_DOEL = 'download-bron';

/** Een download-token voor één bron is 5 minuten geldig. */
export const BRON_TOKEN_GELDIG_SECONDEN = 5 * 60;

/**
 * Een eigen sleutel, afgeleid van het JWT-geheim. Een sessietoken of een
 * algemeen download-token is daardoor nooit een geldig brontoken, en een
 * brontoken is nergens anders een geldig token.
 */
function bronSleutel(): Buffer {
  return crypto.createHmac('sha256', config.jwtSecret).update('tutti:download-bron').digest();
}

export interface BronToken {
  /** De gebruiker voor wie het token is uitgegeven. */
  sub: string;
  /** De vereniging uit de sessie waarmee het is aangevraagd. */
  ver: string | null;
  rol: string;
  soort: Bronsoort;
  bron: string;
  /** Hash van het sessietoken: afmelden of intrekken maakt dit token ook ongeldig. */
  sid: string;
  doel: typeof BRON_DOEL;
  iat?: number;
  exp?: number;
}

/**
 * Maak een kortlevend token voor één bron (soort + id), één gebruiker, één
 * vereniging en één sessie. Bedoeld voor een adres zonder Authorization-
 * kopregel, zoals <audio src>.
 */
export function maakBronToken(gegevens: {
  soort: Bronsoort;
  bronId: string;
  userId: string;
  associationId: string | null;
  rol: string;
  sessieHash: string;
}): string {
  return jwt.sign(
    {
      doel: BRON_DOEL,
      soort: gegevens.soort,
      bron: gegevens.bronId,
      ver: gegevens.associationId,
      rol: gegevens.rol,
      sid: gegevens.sessieHash,
    },
    bronSleutel(),
    { algorithm: 'HS256', subject: gegevens.userId, expiresIn: BRON_TOKEN_GELDIG_SECONDEN },
  );
}

/**
 * Controleer een brontoken voor precies deze soort en dit id.
 *
 * @returns de inhoud als handtekening, vervaltijd, soort en id kloppen;
 *   anders null. Of de gebruiker en zijn sessie nog geldig zijn, kijkt
 *   authenticateBronDownload na.
 */
export function controleerBronToken(token: string, soort: Bronsoort, bronId: string): BronToken | null {
  try {
    const inhoud = jwt.verify(token, bronSleutel(), { algorithms: ['HS256'] }) as Partial<BronToken>;
    if (
      inhoud.doel !== BRON_DOEL ||
      inhoud.soort !== soort ||
      inhoud.bron !== bronId ||
      typeof inhoud.sub !== 'string' ||
      typeof inhoud.sid !== 'string' ||
      typeof inhoud.rol !== 'string'
    ) {
      return null;
    }
    return inhoud as BronToken;
  } catch {
    return null;
  }
}
