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

// Central error handling middleware
export function errorHandler(err: Error | ApiError, req: Request, res: Response, next: NextFunction): void {
  // Log the error with full details for debugging
  logger.error(`[${req.method} ${req.path}] ${err.name}: ${err.message}`, {
    stack: err.stack,
    body: req.body && Object.keys(req.body).length > 0 ? req.body : undefined,
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
