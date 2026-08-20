import { Request, Response, NextFunction, RequestHandler } from 'express';
import logger from '../utils/logger';
import { FileValidationError } from '../utils/errors';

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
 * Veldnamen waarvan de inhoud nooit in een logregel mag belanden.
 *
 * De foutlogger schreef hieronder de volledige aanvraag weg. Bij een mislukte
 * Spond-koppeling stond het wachtwoord van de gebruiker daardoor leesbaar in
 * de productielogs. Logs worden bewaard, doorgestuurd en door meer mensen
 * gelezen dan de aanvraag zelf, dus dit is een lek en geen ongemak.
 */
const GEHEIME_VELDEN = [
  'password',
  'passwordConfirm',
  'currentPassword',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'clientSecret',
  'authorization',
  'mfaCode',
  'recoveryCode',
];

/** Sleutels die nooit worden overgenomen: ze raken het prototype van objecten. */
const GEVAARLIJKE_SLEUTELS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Vervang de inhoud van gevoelige velden door een markering. Blijft werken bij
 * geneste objecten, want een aanvraag kan gegevens meesturen als { config: {
 * password } }. Arrays worden meegenomen zodat een lijst met koppelingen niet
 * alsnog alles doorlaat.
 */
export function maskeerGeheimen(waarde: unknown, diepte = 0): unknown {
  if (diepte > 6 || waarde === null || typeof waarde !== 'object') return waarde;

  if (Array.isArray(waarde)) {
    return waarde.map((item) => maskeerGeheimen(item, diepte + 1));
  }

  // Zonder prototype, zodat een sleutel als __proto__ uit de aanvraag hier een
  // gewone eigenschap wordt in plaats van het prototype van dit object te
  // verzetten. De sleutels komen immers rechtstreeks van buiten.
  const uit: Record<string, unknown> = Object.create(null);
  for (const [sleutel, item] of Object.entries(waarde as Record<string, unknown>)) {
    if (GEVAARLIJKE_SLEUTELS.has(sleutel)) continue;

    if (GEHEIME_VELDEN.some((veld) => veld.toLowerCase() === sleutel.toLowerCase())) {
      uit[sleutel] = '[weggelaten]';
    } else {
      uit[sleutel] = maskeerGeheimen(item, diepte + 1);
    }
  }
  return uit;
}

// Central error handling middleware
export function errorHandler(err: Error | ApiError, req: Request, res: Response, next: NextFunction): void {
  // Log the error with full details for debugging
  logger.error(`[${req.method} ${req.path}] ${err.name}: ${err.message}`, {
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
