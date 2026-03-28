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

    // Skip logging for health check endpoints to reduce noise
    const skipPaths = ['/api/health', '/api/health/detailed', '/favicon.ico'];
    if (skipPaths.some(path => req.path === path)) {
        return next();
    }

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
    });

    // Capture response finish
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode;
        const userId = req.user?.id;

        // Determine log level based on status code
        const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

        // Log request completion
        logger[level](`${req.method} ${req.path} ${statusCode} ${duration}ms`, {
            type: 'request',
            phase: 'complete',
            requestId,
            method: req.method,
            path: req.path,
            statusCode,
            duration,
            userId,
            ip: req.ip || req.socket.remoteAddress,
            userAgent: req.get('user-agent'),
            contentLength: res.get('content-length'),
            referer: req.get('referer'),
        });

        // Log slow requests as performance issues
        if (duration > 3000) {
            logger.warn(`Slow request detected: ${req.method} ${req.path}`, {
                type: 'performance',
                metric: 'slow_request',
                requestId,
                duration,
                threshold: 3000,
            });
        }

        // Log potential security issues
        if (statusCode === 401 || statusCode === 403) {
            logSecurity('access_denied', {
                requestId,
                method: req.method,
                path: req.path,
                statusCode,
                ip: req.ip || req.socket.remoteAddress,
                userId,
            });
        }

        // Log too many requests
        if (statusCode === 429) {
            logSecurity('rate_limit_exceeded', {
                requestId,
                method: req.method,
                path: req.path,
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
        if (routes.some(route => req.path.includes(route))) {
            // Redact sensitive fields
            const sanitizedBody = { ...req.body };
            const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard'];
            sensitiveFields.forEach(field => {
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
