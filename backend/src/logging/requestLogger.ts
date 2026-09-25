import { Request, Response, NextFunction } from 'express';
import logger, { logRequest, logSecurity } from './logger';
import { maskeerGeheimen } from '../utils/maskeren';

/**
 * Interface for authenticated request
 */
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Sanitize untrusted values before writing to logs to prevent log injection
 */
function sanitizeForLog(value: unknown): string {
  return String(value ?? '').replace(/[\r\n]/g, '');
}

const WEGGELATEN = '[weggelaten]';

/**
 * Parameters in de querystring die een geheim dragen.
 *
 * Een link uit een e-mail (wachtwoord herstellen), een agenda-abonnement en
 * `<audio src>` zetten hun token in de URL, omdat er geen kopregel mee kan.
 * Wie het logboek leest, mag daarmee niet kunnen inloggen of een agenda
 * uitlezen. De namen zijn bewust ruim: een onschuldige parameter die hier
 * onterecht op lijkt kost alleen wat leesbaarheid.
 */
const GEHEIME_PARAMETER =
  /token|secret|password|wachtwoord|signature|^sig$|^code$|^key$|api[-_]?key|^auth$|authorization/i;

/**
 * Paden met een geheim als padsegment. Een uitnodiging accepteren en een
 * kaartje opvragen gaan op een code die op zichzelf toegang geeft.
 */
const GEHEIM_IN_PAD: RegExp[] = [
  /^(\/api\/multi-association\/invitations\/accept\/)[^/]+/,
  /^(\/api\/tickets\/)(?!webhooks(?:\/|$))[^/]+(?=\/validate$|$)/,
];

/** Het pad zoals het in het logboek mag: zonder geheimen erin. */
export function veiligPad(pad: string): string {
  let uit = sanitizeForLog(pad);
  for (const patroon of GEHEIM_IN_PAD) uit = uit.replace(patroon, `$1${WEGGELATEN}`);
  return uit;
}

function maskeerParameters(waarde: unknown, diepte: number): unknown {
  if (waarde === null || typeof waarde !== 'object') return waarde;
  if (diepte > 4) return WEGGELATEN;
  if (Array.isArray(waarde)) return waarde.map((item) => maskeerParameters(item, diepte + 1));
  const uit: Record<string, unknown> = Object.create(null);
  for (const [sleutel, item] of Object.entries(waarde as Record<string, unknown>)) {
    uit[sanitizeForLog(sleutel)] = GEHEIME_PARAMETER.test(sleutel) ? WEGGELATEN : maskeerParameters(item, diepte + 1);
  }
  return uit;
}

/**
 * De querystring als object, met de waarde van elke geheime parameter
 * weggelaten - ook genest, want `?filter[token]=…` wordt door Express een object.
 */
export function veiligeQuery(query: Record<string, unknown>): Record<string, unknown> | undefined {
  if (Object.keys(query).length === 0) return undefined;
  return maskeerParameters(query, 0) as Record<string, unknown>;
}

/**
 * Alleen de herkomst uit een Referer-kop.
 *
 * De volledige Referer is de URL van de pagina waar het verzoek vandaan kwam,
 * en die draagt soms een geheim: `/reset-password?token=…` roept de API aan
 * met precies dat adres als Referer. De herkomst (schema, host, poort) is wat
 * er te weten valt - van welke site kwam dit - zonder pad of querystring.
 */
export function refererHerkomst(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    const herkomst = new URL(referer).origin;
    return herkomst === 'null' ? undefined : herkomst;
  } catch {
    return undefined;
  }
}

/**
 * Middleware to add request ID to each request
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.get('X-Request-ID') || generateRequestId();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

/**
 * HTTP request logging middleware
 * Logs all incoming HTTP requests with timing information
 */
export function requestLoggerMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] as string;

  // Skip logging for health check endpoints and static assets to reduce noise
  const skipPaths = ['/api/health', '/api/health/detailed', '/favicon.ico', '/manifest.json', '/sw.js'];
  const skipExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf'];

  if (skipPaths.some((path) => req.path === path) || skipExtensions.some((ext) => req.path.endsWith(ext))) {
    return next();
  }

  // Capture request body size
  const requestBodySize = req.headers['content-length'] ? parseInt(req.headers['content-length'], 10) : 0;

  // Log request start in debug mode
  logger.debug(`Request started: ${sanitizeForLog(req.method)} ${veiligPad(req.path)}`, {
    type: 'request',
    phase: 'start',
    requestId,
    method: req.method,
    path: veiligPad(req.path),
    query: veiligeQuery(req.query as Record<string, unknown>),
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get('user-agent'),
    bodySize: requestBodySize,
  });

  // Capture response finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const userId = req.user?.id;
    const safeMethod = sanitizeForLog(req.method);
    const safePath = veiligPad(req.path);

    // Determine log level based on status code
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    // Parse response size
    const responseSize = res.get('content-length') ? parseInt(res.get('content-length') || '0', 10) : 0;
    const cacheStatus = res.get('x-cache') || 'N/A';

    // Log request completion
    logger[level](`${safeMethod} ${safePath} ${statusCode} ${duration}ms`, {
      type: 'request',
      phase: 'complete',
      requestId,
      method: safeMethod,
      path: safePath,
      statusCode,
      duration,
      userId,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
      responseSize,
      cacheStatus,
      // Nooit de volledige Referer: zie refererHerkomst.
      refererOrigin: refererHerkomst(req.get('referer')),
      // Add compression info if available
      contentEncoding: res.get('content-encoding'),
    });

    // Log slow requests as performance issues (warning at 2s, critical at 5s)
    if (duration > 5000) {
      logger.error(`Critical slow request: ${safeMethod} ${safePath}`, {
        type: 'performance',
        metric: 'critical_slow_request',
        requestId,
        duration,
        threshold: 5000,
        responseSize,
      });
    } else if (duration > 2000) {
      logger.warn(`Slow request detected: ${safeMethod} ${safePath}`, {
        type: 'performance',
        metric: 'slow_request',
        requestId,
        duration,
        threshold: 2000,
        responseSize,
      });
    }

    // Log large responses
    if (responseSize > 1024 * 1024) {
      // > 1MB
      logger.warn(`Large response: ${safeMethod} ${safePath}`, {
        type: 'performance',
        metric: 'large_response',
        requestId,
        responseSize,
        threshold: 1024 * 1024,
      });
    }

    // Log potential security issues
    if (statusCode === 401 || statusCode === 403) {
      logSecurity('access_denied', {
        requestId,
        method: safeMethod,
        path: safePath,
        statusCode,
        ip: req.ip || req.socket.remoteAddress,
        userId,
      });
    }

    // Log too many requests
    if (statusCode === 429) {
      logSecurity('rate_limit_exceeded', {
        requestId,
        method: safeMethod,
        path: safePath,
        ip: req.ip || req.socket.remoteAddress,
      });
    }
  });

  next();
}

/**
 * Log request body for specific routes (be careful with sensitive data)
 * Only use this for debugging specific issues
 */
export function requestBodyLogger(routes: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (routes.some((route) => req.path.includes(route))) {
      // Geheimen eruit, ook genest; zie utils/maskeren.ts. De logger kort
      // daarna ook nog de e-mailadressen af.
      const sanitizedBody = maskeerGeheimen(req.body);

      logger.debug(`Request body for ${sanitizeForLog(req.method)} ${veiligPad(req.path)}`, {
        type: 'request',
        phase: 'body',
        requestId: req.headers['x-request-id'],
        body: sanitizedBody,
      });
    }
    next();
  };
}

/**
 * Express error logger middleware
 * Should be placed before error handler middleware
 */
export function errorLoggerMiddleware(err: Error, req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const requestId = req.headers['x-request-id'] as string;

  logger.error(`Error: ${err.message}`, {
    type: 'error',
    requestId,
    method: req.method,
    path: veiligPad(req.path),
    userId: req.user?.id,
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
    },
    ip: req.ip || req.socket.remoteAddress,
  });

  next(err);
}

export default requestLoggerMiddleware;
