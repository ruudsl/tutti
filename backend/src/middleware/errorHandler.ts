import { Request, Response, NextFunction, RequestHandler } from 'express';
import logger from '../utils/logger';
import { veiligPad } from '../logging/requestLogger';
import { FileValidationError } from '../utils/errors';
import { DienstFout, StroomonderbrekerOpenFout, statusIsTijdelijk } from '../utils/veerkracht';
import { maskeerGeheimen } from '../utils/maskeren';

/** Geen status (timeout, netwerk) of een tijdelijke: de dienst was er niet. */
function isStoring(fout: DienstFout): boolean {
  return fout.status === undefined || statusIsTijdelijk(fout.status);
}

// Custom error class for API errors
export class ApiError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(statusCode: number, message: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Common API errors
export const errors = {
  badRequest: (message = 'Ongeldige aanvraag.') => new ApiError(400, message),
  unauthorized: (message = 'Niet geautoriseerd.') => new ApiError(401, message),
  forbidden: (message = 'Geen toegang.') => new ApiError(403, message),
  notFound: (message = 'Niet gevonden.') => new ApiError(404, message),
  conflict: (message = 'Conflict.') => new ApiError(409, message),
  internal: (message = 'Interne serverfout.') => new ApiError(500, message, false),
};

// Async handler wrapper to catch errors automatically
export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<any>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as T, res, next)).catch(next);
  };
}

/**
 * Het maskeren zelf staat in utils/maskeren.ts, gedeeld met de loggers en
 * Sentry. Hier bleef het exporteren staan voor wie het vanaf deze plek
 * importeert.
 *
 * De foutlogger hieronder schreef de volledige aanvraag weg. Bij een mislukte
 * Spond-koppeling stond het wachtwoord van de gebruiker daardoor leesbaar in
 * de productielogs.
 */
export { maskeerGeheimen };

// Central error handling middleware
/**
 * Herkent een schending van een uniciteitsregel.
 *
 * Vijf routes controleerden hierop met `err.code === 'SQLITE_CONSTRAINT_UNIQUE'`.
 * Dat is de vorm van better-sqlite3; sql.js, dat hier draait, zet helemaal geen
 * `code` op zijn fouten. Die tak werd dus nooit genomen en hun eigen, veel
 * duidelijkere melding ("Lid is al toegevoegd aan dit project") kwam nooit bij
 * de gebruiker aan - die kreeg de algemene "Dit item bestaat al." verderop.
 * Beide vormen worden nu herkend.
 */
export function isUniekheidsfout(err: unknown): boolean {
  const code = (err as { code?: string } | null | undefined)?.code;
  if (code === 'SQLITE_CONSTRAINT_UNIQUE') return true;
  const bericht = err instanceof Error ? err.message : String(err);
  return /UNIQUE constraint failed/i.test(bericht);
}

export function errorHandler(err: Error | ApiError, req: Request, res: Response, next: NextFunction): void {
  // Log the error with full details for debugging
  logger.error(`[${req.method} ${veiligPad(req.path)}] ${err.name}: ${err.message}`, {
    stack: err.stack,
    body: req.body && Object.keys(req.body).length > 0 ? maskeerGeheimen(req.body) : undefined,
  });

  // Handle known API errors
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Handle file upload validation errors (e.g. from multer fileFilter callbacks)
  if (err instanceof FileValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }

  // Legacy fallback: some fileFilter callbacks may still throw a plain Error
  // with this exact message (e.g. routes maintained elsewhere)
  if (err.message === 'Alleen PDF bestanden zijn toegestaan.') {
    res.status(400).json({ error: err.message });
    return;
  }

  // Handle validation errors (from Zod)
  if (err.name === 'ZodError') {
    res.status(400).json({
      error: 'Validatiefout.',
      details: (err as any).issues ?? (err as any).errors,
    });
    return;
  }

  // Een externe dienst (Mollie, Microsoft, Google, Spond) die niet reageert of
  // plat ligt. Dat is geen fout van ons en geen fout van de gebruiker: 503 zegt
  // "straks nog eens", en een 500 liet het lijken alsof Tutti zelf stuk was.
  // Een DienstFout met een blijvende status (401, 404) is een antwoord dat
  // niet klopte, geen storing: 502.
  if (err instanceof StroomonderbrekerOpenFout || (err instanceof DienstFout && isStoring(err))) {
    res.status(503).json({ error: 'Een externe dienst reageert nu niet. Probeer het over een paar minuten opnieuw.' });
    return;
  }
  if (err instanceof DienstFout) {
    res.status(502).json({ error: 'Een externe dienst gaf een onverwacht antwoord.' });
    return;
  }

  // Handle SQLite constraint errors
  if (err.message?.includes('UNIQUE constraint failed')) {
    res.status(409).json({ error: 'Dit item bestaat al.' });
    return;
  }

  if (err.message?.includes('FOREIGN KEY constraint failed')) {
    res.status(400).json({ error: 'Ongeldige referentie.' });
    return;
  }

  // Default to 500 Internal Server Error
  res.status(500).json({ error: 'Interne serverfout.' });
}

// 404 handler for unknown routes
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Route ${req.method} ${req.path} niet gevonden.` });
}
