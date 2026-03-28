import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import config from '../config';
import logger from '../utils/logger';

// Store for CSRF tokens (in production, use Redis or a database)
// For now, we use a Map with TTL cleanup
const tokenStore = new Map<string, { token: string; createdAt: number }>();

// Token TTL: 24 hours
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// Clean up expired tokens periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of tokenStore.entries()) {
        if (now - value.createdAt > TOKEN_TTL_MS) {
            tokenStore.delete(key);
        }
    }
}, 60 * 60 * 1000); // Clean up every hour

/**
 * Generate a cryptographically secure CSRF token
 */
function generateCsrfToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Get client identifier from request (IP + User-Agent hash)
 * This helps bind the token to a specific client
 */
function getClientId(req: Request): string {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    return crypto.createHash('sha256').update(`${ip}:${userAgent}`).digest('hex').substring(0, 16);
}

/**
 * Routes that are exempt from CSRF protection
 * These typically include:
 * - API routes that are protected by JWT (stateless)
 * - Authentication routes that don't yet have a session
 * - Webhook endpoints
 */
const CSRF_EXEMPT_ROUTES: RegExp[] = [
    /^\/api\/auth\/login$/,
    /^\/api\/auth\/register$/,
    /^\/api\/auth\/refresh$/,
    /^\/api\/auth\/forgot-password$/,
    /^\/api\/auth\/reset-password$/,
    /^\/api\/auth\/microsoft\/.*/,
    /^\/api\/health$/,
    /^\/api\/settings\/theme$/, // Public theme endpoint
    /^\/api\/settings\/branding$/, // Public branding endpoint
    /^\/api\/settings\/logo\/.*/, // Public logo serving
    /^\/api\/changelog$/,
];

/**
 * Check if a route is exempt from CSRF protection
 */
function isExemptRoute(path: string): boolean {
    return CSRF_EXEMPT_ROUTES.some(pattern => pattern.test(path));
}

/**
 * Middleware to set CSRF token cookie
 * This should be called on initial page load or when starting a session
 */
export function csrfTokenMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!config.csrfEnabled) {
        return next();
    }

    const clientId = getClientId(req);
    let tokenEntry = tokenStore.get(clientId);

    // Generate new token if none exists or if expired
    if (!tokenEntry || Date.now() - tokenEntry.createdAt > TOKEN_TTL_MS) {
        const token = generateCsrfToken();
        tokenEntry = { token, createdAt: Date.now() };
        tokenStore.set(clientId, tokenEntry);
    }

    // Set the CSRF token as a cookie (httpOnly: false so JS can read it)
    res.cookie(config.csrfCookieName, tokenEntry.token, {
        httpOnly: false, // Allow JavaScript to read the cookie
        secure: config.isProduction, // HTTPS only in production
        sameSite: 'strict',
        maxAge: TOKEN_TTL_MS,
        path: '/',
    });

    // Also expose via response header for initial fetch
    res.setHeader('X-CSRF-Token', tokenEntry.token);

    next();
}

/**
 * Middleware to validate CSRF token on state-changing requests
 * Validates token sent in header against the stored token
 */
export function validateCsrfToken(req: Request, res: Response, next: NextFunction) {
    if (!config.csrfEnabled) {
        return next();
    }

    // Only validate on state-changing methods
    const method = req.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        return next();
    }

    // Skip validation for exempt routes
    if (isExemptRoute(req.path)) {
        return next();
    }

    // Routes protected by JWT don't need CSRF as they're stateless
    // Check if Authorization header is present
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        // JWT-protected routes are exempt from CSRF as tokens provide equivalent protection
        return next();
    }

    const clientId = getClientId(req);
    const storedEntry = tokenStore.get(clientId);

    if (!storedEntry) {
        logger.warn('CSRF validation failed: no stored token', {
            path: req.path,
            method: req.method,
            ip: req.ip
        });
        return res.status(403).json({
            error: 'CSRF token missing. Please refresh the page and try again.'
        });
    }

    // Get token from header (preferred) or cookie
    const headerToken = req.headers[config.csrfHeaderName.toLowerCase()] as string;
    const cookieToken = req.cookies?.[config.csrfCookieName];

    // Validate: header token must match stored token
    if (!headerToken || headerToken !== storedEntry.token) {
        logger.warn('CSRF validation failed: token mismatch', {
            path: req.path,
            method: req.method,
            ip: req.ip,
            hasHeaderToken: !!headerToken,
            hasCookieToken: !!cookieToken
        });
        return res.status(403).json({
            error: 'Invalid CSRF token. Please refresh the page and try again.'
        });
    }

    next();
}

/**
 * Endpoint handler to get a fresh CSRF token
 * Useful for SPAs that need to get a token before making requests
 */
export function getCsrfToken(req: Request, res: Response) {
    if (!config.csrfEnabled) {
        return res.json({ csrf: null, enabled: false });
    }

    const clientId = getClientId(req);
    let tokenEntry = tokenStore.get(clientId);

    if (!tokenEntry || Date.now() - tokenEntry.createdAt > TOKEN_TTL_MS) {
        const token = generateCsrfToken();
        tokenEntry = { token, createdAt: Date.now() };
        tokenStore.set(clientId, tokenEntry);
    }

    // Set cookie as well
    res.cookie(config.csrfCookieName, tokenEntry.token, {
        httpOnly: false,
        secure: config.isProduction,
        sameSite: 'strict',
        maxAge: TOKEN_TTL_MS,
        path: '/',
    });

    res.json({ csrf: tokenEntry.token, enabled: true });
}

/**
 * Add custom exempt routes programmatically
 */
export function addCsrfExemptRoute(pattern: RegExp) {
    CSRF_EXEMPT_ROUTES.push(pattern);
}
