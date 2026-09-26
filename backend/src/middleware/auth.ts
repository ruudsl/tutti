import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import db from '../database/connection';
import logger from '../utils/logger';
import { hashToken, findSessionByTokenHash, registerSession, updateSessionActivityByHash } from '../utils/sessionStore';
import { verifyDownloadToken, DownloadTokenPayload, controleerBronToken, Bronsoort } from '../utils/downloadToken';

export interface UserPayload {
  id: string;
  email: string;
  role: string;
  associationId: string | null;
}

export type DecodedToken = UserPayload & { iat?: number; exp?: number };

export interface AuthRequest extends Request {
  user?: UserPayload;
}

/** Zelfde melding als bij een lid uit dienst: een gesloten vereniging sluit haar leden buiten. */
export const MELDING_NIET_ACTIEF = 'Dit account is niet meer actief. Neem contact op met je vereniging.';

/**
 * Vaste code in het 403-antwoord voor een lid dat eerst zijn wachtwoord moet
 * wijzigen (users.moet_wachtwoord_wijzigen). De frontend herkent hem en
 * stuurt het lid naar het profiel, waar het wijzigen gebeurt.
 */
export const CODE_WACHTWOORD_WIJZIGEN_VERPLICHT = 'WACHTWOORD_WIJZIGEN_VERPLICHT';
const MELDING_WACHTWOORD_WIJZIGEN_VERPLICHT = 'Kies eerst een eigen wachtwoord.';

/** Uitkomst van beoordeelSessie. */
export interface Sessiebeoordeling {
  /** null als de sessie geldig is, anders de melding voor een 401. */
  fout: string | null;
  /** Het lid heeft nog een wachtwoord dat een ander heeft gekozen of gezien. */
  moetWachtwoordWijzigen: boolean;
}

/**
 * Is deze vereniging gedeactiveerd (associations.is_active = 0) voor deze
 * gebruiker?
 *
 * Een superbeheerder is uitgezonderd: die moet een gesloten vereniging kunnen
 * bekijken en weer openzetten. Zonder vereniging (null) is er niets te sluiten.
 */
export function verenigingGesloten(associationId: string | null | undefined, userId: string): boolean {
  if (!associationId) return false;
  const vereniging = db.prepare('SELECT is_active FROM associations WHERE id = ?').get(associationId) as
    { is_active: number | null } | undefined;
  if (!vereniging || vereniging.is_active === null || Number(vereniging.is_active) !== 0) {
    return false;
  }
  const superbeheerder = db.prepare('SELECT 1 FROM super_admins WHERE user_id = ?').get(userId);
  return !superbeheerder;
}

/**
 * Controleer een token tegen user_sessions én tegen de gebruiker zelf.
 *
 * Regels:
 * - Een sessie die expliciet is ingetrokken -> ongeldig (401).
 * - Een verwijderd lid (`deleted_at`) of een lid uit dienst (`status =
 *   'inactive'`) -> ongeldig, ook met een bekende, niet-ingetrokken sessie.
 *   Die controle zat alleen op het pad zonder sessierij; een lid dat buiten
 *   de routes om uit dienst ging (of waarbij het intrekken mislukte) hield
 *   daardoor zijn token tot het verliep. 'pending' blijft toegestaan, net als
 *   bij het inloggen (routes/auth.ts).
 * - Een token voor een gedeactiveerde vereniging -> ongeldig, behalve voor
 *   een superbeheerder (verenigingGesloten).
 * - Een bekende sessie -> geldig (last_active wordt bijgewerkt, gedoseerd).
 * - Geen sessierij (token van voor de sessieregistratie): alleen geldig als
 *   het token na de laatste wachtwoordwijziging is uitgegeven; dan wordt het
 *   alsnog geregistreerd, zodat het in te trekken is.
 *
 * password_changed_at telt alleen op dat laatste pad. De sessie die bij een
 * wachtwoordwijziging bewust blijft staan (de huidige, bij change-password)
 * blijft geldig via haar sessierij; alle andere worden op dat moment
 * expliciet ingetrokken - net als bij een rolwijziging door een beheerder.
 *
 * Ook de websocket gebruikt deze regels (websocket/index.ts): een sessie die
 * hier is beëindigd, mag daar ook geen chat of meldingen meer ontvangen.
 *
 * @param herkomst - adres en browser, alleen gebruikt om een onbekende
 *   sessie alsnog te registreren.
 * @returns null when valid, otherwise a 401 error message.
 */
export function validateSession(
  token: string,
  decoded: DecodedToken,
  herkomst: { ip?: string; userAgent?: string },
): string | null {
  return beoordeelSessie(token, decoded, herkomst).fout;
}

/**
 * Mag dit lid nog binnen, met een token voor deze vereniging? Verwijderd, uit
 * dienst of een gesloten vereniging: nee. Zie validateSession.
 */
function beoordeelLid(
  userId: string,
  associationId: string | null,
): { beoordeling: Sessiebeoordeling; passwordChangedAt: string | null } {
  const user = db
    .prepare('SELECT id, status, deleted_at, password_changed_at, moet_wachtwoord_wijzigen FROM users WHERE id = ?')
    .get(userId) as
    | {
        id: string;
        status: string | null;
        deleted_at: string | null;
        password_changed_at: string | null;
        moet_wachtwoord_wijzigen: number | null;
      }
    | undefined;

  const ongeldig = (fout: string) => ({
    beoordeling: { fout, moetWachtwoordWijzigen: false },
    passwordChangedAt: null,
  });

  if (!user || user.deleted_at) {
    return ongeldig('Token verlopen of ongeldig.');
  }

  if (user.status === 'inactive') {
    return ongeldig(MELDING_NIET_ACTIEF);
  }

  // Een gedeactiveerde vereniging: haar leden komen er niet meer in, ook niet
  // met een token van voor het deactiveren. De vereniging uit het token telt,
  // want die bepaalt waar dit verzoek over gaat.
  if (verenigingGesloten(associationId, user.id)) {
    return ongeldig(MELDING_NIET_ACTIEF);
  }

  return {
    beoordeling: { fout: null, moetWachtwoordWijzigen: Number(user.moet_wachtwoord_wijzigen) === 1 },
    passwordChangedAt: user.password_changed_at,
  };
}

/**
 * validateSession, plus of het lid eerst zijn wachtwoord moet wijzigen. Die
 * vlag maakt de sessie niet ongeldig; wat het lid ermee mag, bepaalt de
 * aanroeper (authenticateToken, optionalAuth, de websocket).
 */
export function beoordeelSessie(
  token: string,
  decoded: DecodedToken,
  herkomst: { ip?: string; userAgent?: string },
): Sessiebeoordeling {
  const ongeldig = (fout: string): Sessiebeoordeling => ({ fout, moetWachtwoordWijzigen: false });
  const tokenHash = hashToken(token);
  const session = findSessionByTokenHash(tokenHash);

  if (session) {
    if (session.revoked_at) {
      return ongeldig('Sessie is beëindigd. Log opnieuw in.');
    }
    if (session.user_id !== decoded.id) {
      return ongeldig('Token verlopen of ongeldig.');
    }
  }

  const { beoordeling: geldig, passwordChangedAt: wachtwoordGewijzigd } = beoordeelLid(
    decoded.id,
    decoded.associationId,
  );
  if (geldig.fout) {
    return geldig;
  }

  if (session) {
    updateSessionActivityByHash(tokenHash);
    return geldig;
  }

  // Legacy/unknown token: no session record exists
  if (wachtwoordGewijzigd && decoded.iat !== undefined) {
    const passwordChangedAt = new Date(wachtwoordGewijzigd).getTime();
    if (!isNaN(passwordChangedAt) && decoded.iat * 1000 < passwordChangedAt) {
      return ongeldig('Token verlopen of ongeldig.');
    }
  }

  // Lazily register the session so it shows up in session management
  // and becomes revocable. Align expiry with the JWT's own expiry.
  registerSession(
    decoded.id,
    token,
    herkomst.ip,
    herkomst.userAgent,
    7,
    decoded.exp !== undefined ? new Date(decoded.exp * 1000) : undefined,
  );

  return geldig;
}

/** Een download-token in de URL mag alleen bij lezen: zie authenticateToken. */
function isLezendVerzoek(req: Request): boolean {
  return req.method === 'GET' || req.method === 'HEAD';
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

/**
 * Aanmelden met het sessietoken uit de Authorization-kopregel.
 *
 * Een lid met users.moet_wachtwoord_wijzigen = 1 krijgt hier een 403 met
 * CODE_WACHTWOORD_WIJZIGEN_VERPLICHT: zijn wachtwoord heeft een ander gekozen
 * of gezien. Alleen de routes die nodig zijn om een eigen wachtwoord te
 * kiezen gebruiken authenticateTokenBijTijdelijkWachtwoord.
 */
export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  authenticeer(req, res, next, false);
}

/**
 * Als authenticateToken, maar laat ook een lid door dat eerst zijn wachtwoord
 * moet wijzigen. Alleen voor wat daarvoor nodig is: GET /auth/me,
 * POST /auth/change-password en POST /auth/logout.
 */
export function authenticateTokenBijTijdelijkWachtwoord(req: AuthRequest, res: Response, next: NextFunction) {
  authenticeer(req, res, next, true);
}

/**
 * Aanmelden voor één downloadroute: met de Authorization-kopregel (zoals
 * authenticateToken), of met een brontoken in `?token=` voor precies deze
 * soort en dit id (routes/download-token.ts, POST /bron). Voor een adres dat
 * geen kopregel kan meesturen, zoals <audio src>.
 *
 * Het brontoken is alleen geldig zolang de sessie waarmee het is aangevraagd
 * dat is, en het lid nog binnen mag (beoordeelLid).
 */
export function authenticateBronDownload(soort: Bronsoort, bronUitVerzoek: (req: Request) => string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    authenticeer(req, res, next, false, { soort, id: bronUitVerzoek(req) });
  };
}

/** De bron die een downloadroute aanbiedt, voor een brontoken in de URL. */
interface GevraagdeBron {
  soort: Bronsoort;
  id: string;
}

/**
 * Een brontoken uit de URL: geldig voor precies deze soort en dit id, zolang
 * de sessie waarmee het is aangevraagd bestaat en het lid nog binnen mag.
 */
function handelBronTokenAf(req: AuthRequest, res: Response, next: NextFunction, token: string, bron: GevraagdeBron) {
  if (!isLezendVerzoek(req)) {
    return res.status(401).json({ error: 'Download-token is alleen geldig voor downloads.' });
  }

  const inhoud = controleerBronToken(token, bron.soort, bron.id);
  if (!inhoud) {
    return res.status(401).json({ error: 'Download-token verlopen of ongeldig.' });
  }

  try {
    const sessie = findSessionByTokenHash(inhoud.sid);
    if (!sessie || sessie.revoked_at || sessie.user_id !== inhoud.sub) {
      return res.status(401).json({ error: 'Download-token verlopen of ongeldig.' });
    }
    const { beoordeling } = beoordeelLid(inhoud.sub, inhoud.ver);
    if (beoordeling.fout) {
      return res.status(401).json({ error: beoordeling.fout });
    }
    if (beoordeling.moetWachtwoordWijzigen) {
      return res
        .status(403)
        .json({ error: MELDING_WACHTWOORD_WIJZIGEN_VERPLICHT, code: CODE_WACHTWOORD_WIJZIGEN_VERPLICHT });
    }
  } catch (error) {
    logger.error('Controle van een download-token mislukt; verzoek geweigerd:', error);
    return res.status(503).json({ error: 'De dienst is tijdelijk niet beschikbaar. Probeer het zo opnieuw.' });
  }

  req.user = { id: inhoud.sub, email: '', role: inhoud.rol, associationId: inhoud.ver };
  next();
}

function authenticeer(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
  tijdelijkWachtwoordToegestaan: boolean,
  bron?: GevraagdeBron,
) {
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  // In de URL mag alleen een kortlevend download-token staan (zie
  // handleDownloadToken); een sessietoken daar wordt hieronder geweigerd.
  const queryToken = !headerToken ? (req.query.token as string | undefined) : undefined;
  const token = headerToken || queryToken;

  if (!token) {
    return res.status(401).json({ error: 'Toegang geweigerd. Geen token opgegeven.' });
  }

  // Een downloadroute voor één bron (authenticateBronDownload) neemt in de URL
  // alleen het brontoken voor die bron aan.
  if (bron && typeof queryToken === 'string') {
    return handelBronTokenAf(req, res, next, queryToken, bron);
  }

  // Short-lived download token (purpose: 'download'): no session record
  // exists for these, so session validation is skipped.
  if (handleDownloadToken(req, res, next, token)) {
    return;
  }

  if (queryToken) {
    // Een sessietoken in de URL belandt in logboeken, browsergeschiedenis en
    // Referer-kopregels, en geeft wie het daar vindt dagenlang toegang tot
    // alles. Media en downloads gebruiken een kortlevend download-token
    // (routes/download-token.ts); het sessietoken hoort in de kopregel.
    return res.status(401).json({ error: 'Een sessietoken is niet geldig in de URL.' });
  }

  let decoded: DecodedToken;
  try {
    decoded = jwt.verify(token, config.jwtSecret) as DecodedToken;
  } catch (error) {
    return res.status(401).json({ error: 'Token verlopen of ongeldig.' });
  }

  try {
    const beoordeling = beoordeelSessie(token, decoded, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (beoordeling.fout) {
      return res.status(401).json({ error: beoordeling.fout });
    }
    if (beoordeling.moetWachtwoordWijzigen && !tijdelijkWachtwoordToegestaan) {
      return res
        .status(403)
        .json({ error: MELDING_WACHTWOORD_WIJZIGEN_VERPLICHT, code: CODE_WACHTWOORD_WIJZIGEN_VERPLICHT });
    }
  } catch (error) {
    // Kan de sessie niet worden nagekeken (databasefout), dan gaat het verzoek
    // niet door. Doorlaten zou betekenen dat een ingetrokken sessie, een lid
    // uit dienst of een gesloten vereniging juist dan binnenkomt. 503 en geen
    // 401: de gebruiker is niet afgemeld, de dienst is even niet beschikbaar.
    logger.error('Sessiecontrole mislukt; verzoek geweigerd:', error);
    return res.status(503).json({ error: 'De dienst is tijdelijk niet beschikbaar. Probeer het zo opnieuw.' });
  }

  // Rol en vereniging komen uit het token. Wie een rol, wachtwoord of
  // lidmaatschap van iemand wijzigt, trekt daarom diens sessies in
  // (routes/users.ts, routes/multi-association.ts); zie validateSession.
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
  const headerToken = authHeader && authHeader.split(' ')[1];
  // Een download-token in de URL alleen bij lezen; zie authenticateToken.
  const queryToken = !headerToken && isLezendVerzoek(req) ? (req.query.token as string | undefined) : undefined;
  const token = headerToken || queryToken;

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

  // Een sessietoken in de URL telt niet mee; zie authenticateToken.
  if (queryToken) {
    return next();
  }

  let decoded: DecodedToken;
  try {
    decoded = jwt.verify(token, config.jwtSecret) as DecodedToken;
  } catch {
    // Ignore invalid tokens in optional auth
    return next();
  }

  // Dezelfde regels als authenticateToken: geen gebruiker bij een
  // ingetrokken sessie, een lid dat weg of uit dienst is, of een gesloten
  // vereniging. Lukt de controle niet (databasefout), dan ook geen gebruiker:
  // het verzoek gaat dan anoniem verder. Een lid dat eerst zijn wachtwoord
  // moet wijzigen gaat ook anoniem verder: een route die aanmelden vraagt,
  // geeft hem daarna de 403 van authenticateToken.
  let sessieGeldig = false;
  try {
    const beoordeling = beoordeelSessie(token, decoded, { ip: req.ip, userAgent: req.headers['user-agent'] });
    sessieGeldig = beoordeling.fout === null && !beoordeling.moetWachtwoordWijzigen;
  } catch (error) {
    logger.error('Sessiecontrole bij optionele aanmelding mislukt; verzoek gaat anoniem verder:', error);
  }

  if (sessieGeldig) {
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      associationId: decoded.associationId,
    };
  }

  next();
}
