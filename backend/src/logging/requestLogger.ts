import { Request, Response, NextFunction } from 'express';
import logger, { logRequest, logSecurity } from './logger';

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
  logger.debug(`Request started: ${req.method} ${req.path}`, {
    type: 'request',
    phase: 'start',
    requestId,
    method: req.method,
    path: req.path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
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
    const safePath = sanitizeForLog(req.path);

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
      referer: req.get('referer'),
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
      // Redact sensitive fields
      const sanitizedBody = { ...req.body };
      const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard'];
      sensitiveFields.forEach((field) => {
        if (sanitizedBody[field]) {
          sanitizedBody[field] = '[REDACTED]';
        }
      });

      logger.debug(`Request body for ${req.method} ${req.path}`, {
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
    path: req.path,
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
