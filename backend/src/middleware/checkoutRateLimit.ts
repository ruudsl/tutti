import { Request, Response, NextFunction, RequestHandler } from 'express';
import db from '../database/connection';
import logger from '../utils/logger';

/**
 * Rate limiting middleware for ticket checkout operations.
 * Tracks checkout attempts by IP address with configurable limits,
 * exponential backoff for violations, and auto-blocking.
 */

// Action types for rate limiting
type RateLimitAction = 'checkout_start' | 'checkout_complete' | 'failed_payment';

// Rate limit configuration per action type
interface RateLimitConfig {
    maxAttempts: number;
    windowMs: number;
    violationThreshold: number;
}

const RATE_LIMIT_CONFIG: Record<RateLimitAction, RateLimitConfig> = {
    checkout_start: {
        maxAttempts: 5,
        windowMs: 60 * 1000, // 1 minute
        violationThreshold: 10, // Block after 10 violations
    },
    failed_payment: {
        maxAttempts: 10,
        windowMs: 60 * 60 * 1000, // 1 hour
        violationThreshold: 5, // Block after 5 violations
    },
    checkout_complete: {
        maxAttempts: 3,
        windowMs: 60 * 60 * 1000, // 1 hour
        violationThreshold: 10, // Block after 10 violations
    },
};

// In-memory storage for rate limiting
interface RateLimitRecord {
    attempts: number;
    firstAttemptTime: number;
    violations: number;
    backoffUntil: number;
}

// Separate stores for each action type
const rateLimitStores: Record<RateLimitAction, Map<string, RateLimitRecord>> = {
    checkout_start: new Map(),
    failed_payment: new Map(),
    checkout_complete: new Map(),
};

// In-memory cache of blocked IPs (with periodic refresh from DB)
const blockedIpsCache: Map<string, { until: number | null; reason: string }> = new Map();
let blockedIpsCacheLastRefresh = 0;
const BLOCKED_IPS_CACHE_TTL_MS = 30 * 1000; // 30 seconds

/**
 * Initialize the blocked_ips table if it doesn't exist
 */
function ensureBlockedIpsTable(): void {
    try {
        const tableExists = db.prepare(`
            SELECT name FROM sqlite_master WHERE type='table' AND name='blocked_ips'
        `).get();

        if (!tableExists) {
            db.exec(`
                CREATE TABLE IF NOT EXISTS blocked_ips (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ip_address TEXT NOT NULL UNIQUE,
                    reason TEXT NOT NULL,
                    blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    blocked_until DATETIME,
                    is_permanent BOOLEAN DEFAULT 0,
                    created_by TEXT
                )
            `);
            logger.info('Created blocked_ips table');
        }
    } catch (error) {
        logger.error('Error ensuring blocked_ips table exists', { error });
    }
}

// Ensure table exists on module load
ensureBlockedIpsTable();

/**
 * Get client IP from request, handling proxies
 */
function getClientIp(req: Request): string {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
        const ips = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor).split(',');
        return ips[0].trim();
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) {
        return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Refresh the blocked IPs cache from database
 */
function refreshBlockedIpsCache(): void {
    const now = Date.now();
    if (now - blockedIpsCacheLastRefresh < BLOCKED_IPS_CACHE_TTL_MS) {
        return;
    }

    try {
        const rows = db.prepare(`
            SELECT ip_address, reason, blocked_until, is_permanent
            FROM blocked_ips
            WHERE is_permanent = 1 OR blocked_until IS NULL OR blocked_until > datetime('now')
        `).all() as Array<{
            ip_address: string;
            reason: string;
            blocked_until: string | null;
            is_permanent: number;
        }>;

        blockedIpsCache.clear();
        for (const row of rows) {
            blockedIpsCache.set(row.ip_address, {
                until: row.blocked_until ? new Date(row.blocked_until).getTime() : null,
                reason: row.reason,
            });
        }

        blockedIpsCacheLastRefresh = now;
    } catch (error) {
        logger.error('Error refreshing blocked IPs cache', { error });
    }
}

/**
 * Check if an IP address is blocked
 */
export function isIpBlocked(ip: string): boolean {
    refreshBlockedIpsCache();

    const blocked = blockedIpsCache.get(ip);
    if (!blocked) {
        return false;
    }

    // Permanent block or no expiration
    if (blocked.until === null) {
        return true;
    }

    // Check if block has expired
    if (Date.now() < blocked.until) {
        return true;
    }

    // Block expired, remove from cache
    blockedIpsCache.delete(ip);
    return false;
}

/**
 * Block an IP address
 */
export function blockIp(ip: string, reason: string, durationHours?: number): void {
    try {
        const isPermanent = durationHours === undefined || durationHours === null;
        const blockedUntil = durationHours
            ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString()
            : null;

        db.prepare(`
            INSERT INTO blocked_ips (ip_address, reason, blocked_until, is_permanent)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(ip_address) DO UPDATE SET
                reason = excluded.reason,
                blocked_until = excluded.blocked_until,
                is_permanent = excluded.is_permanent,
                blocked_at = CURRENT_TIMESTAMP
        `).run(ip, reason, blockedUntil, isPermanent ? 1 : 0);

        // Update cache immediately
        blockedIpsCache.set(ip, {
            until: blockedUntil ? new Date(blockedUntil).getTime() : null,
            reason,
        });

        logger.warn('IP blocked', {
            ip,
            reason,
            durationHours: durationHours || 'permanent',
        });
    } catch (error) {
        logger.error('Error blocking IP', { ip, reason, error });
    }
}

/**
 * Unblock an IP address
 */
export function unblockIp(ip: string): void {
    try {
        const result = db.prepare(`
            DELETE FROM blocked_ips WHERE ip_address = ?
        `).run(ip);

        blockedIpsCache.delete(ip);

        if (result.changes > 0) {
            logger.info('IP unblocked', { ip });
        }
    } catch (error) {
        logger.error('Error unblocking IP', { ip, error });
    }
}

/**
 * Calculate exponential backoff duration based on violation count
 * Returns milliseconds to wait
 */
function calculateBackoff(violations: number): number {
    // Exponential backoff: 2^violations seconds, capped at 1 hour
    const seconds = Math.min(Math.pow(2, violations), 3600);
    return seconds * 1000;
}

/**
 * Log suspicious activity
 */
function logSuspiciousActivity(
    ip: string,
    action: RateLimitAction,
    details: Record<string, unknown>
): void {
    logger.warn('Suspicious checkout activity detected', {
        ip,
        action,
        timestamp: new Date().toISOString(),
        ...details,
    });
}

/**
 * Get or create rate limit record for an IP
 */
function getRateLimitRecord(
    ip: string,
    action: RateLimitAction
): RateLimitRecord {
    const store = rateLimitStores[action];
    let record = store.get(ip);

    if (!record) {
        record = {
            attempts: 0,
            firstAttemptTime: Date.now(),
            violations: 0,
            backoffUntil: 0,
        };
        store.set(ip, record);
    }

    return record;
}

/**
 * Main rate limiter middleware factory
 */
export function checkoutRateLimiter(action: RateLimitAction): RequestHandler {
    const config = RATE_LIMIT_CONFIG[action];

    return (req: Request, res: Response, next: NextFunction) => {
        const ip = getClientIp(req);

        // Check if IP is blocked in database
        if (isIpBlocked(ip)) {
            logSuspiciousActivity(ip, action, {
                type: 'blocked_ip_attempt',
                path: req.path,
            });

            return res.status(403).json({
                error: 'Toegang geweigerd. Uw IP-adres is geblokkeerd.',
                code: 'IP_BLOCKED',
            });
        }

        const record = getRateLimitRecord(ip, action);
        const now = Date.now();

        // Check if currently in backoff period
        if (now < record.backoffUntil) {
            const retryAfter = Math.ceil((record.backoffUntil - now) / 1000);

            logSuspiciousActivity(ip, action, {
                type: 'backoff_violation',
                retryAfter,
                violations: record.violations,
            });

            return res.status(429).json({
                error: 'Te veel pogingen. Probeer het later opnieuw.',
                code: 'RATE_LIMITED',
                retryAfter,
            });
        }

        // Check if window has expired, reset if so
        if (now - record.firstAttemptTime > config.windowMs) {
            record.attempts = 0;
            record.firstAttemptTime = now;
        }

        // Increment attempts
        record.attempts++;

        // Check if limit exceeded
        if (record.attempts > config.maxAttempts) {
            record.violations++;

            // Calculate and apply backoff
            const backoffMs = calculateBackoff(record.violations);
            record.backoffUntil = now + backoffMs;

            const retryAfter = Math.ceil(backoffMs / 1000);

            logSuspiciousActivity(ip, action, {
                type: 'rate_limit_exceeded',
                attempts: record.attempts,
                violations: record.violations,
                backoffSeconds: retryAfter,
            });

            // Auto-block if too many violations
            if (record.violations >= config.violationThreshold) {
                const blockDuration = 24; // Block for 24 hours
                blockIp(
                    ip,
                    `Auto-blocked: ${config.violationThreshold} rate limit violations for ${action}`,
                    blockDuration
                );

                return res.status(403).json({
                    error: 'Toegang geweigerd wegens herhaalde overtredingen.',
                    code: 'IP_BLOCKED',
                });
            }

            return res.status(429).json({
                error: 'Te veel pogingen. Probeer het later opnieuw.',
                code: 'RATE_LIMITED',
                retryAfter,
            });
        }

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', config.maxAttempts);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, config.maxAttempts - record.attempts));
        res.setHeader(
            'X-RateLimit-Reset',
            Math.ceil((record.firstAttemptTime + config.windowMs) / 1000)
        );

        next();
    };
}

/**
 * Clean up old rate limit records to prevent memory leaks
 * Should be called periodically (e.g., every 5-10 minutes)
 */
export function cleanupOldRateLimitRecords(): void {
    const now = Date.now();
    let totalCleaned = 0;

    for (const [action, store] of Object.entries(rateLimitStores) as Array<
        [RateLimitAction, Map<string, RateLimitRecord>]
    >) {
        const config = RATE_LIMIT_CONFIG[action];
        const maxAge = config.windowMs * 2; // Keep records for 2x the window

        for (const [ip, record] of store.entries()) {
            // Remove records that are old and not in backoff
            if (
                now - record.firstAttemptTime > maxAge &&
                now > record.backoffUntil
            ) {
                store.delete(ip);
                totalCleaned++;
            }
        }
    }

    // Also clean up expired blocks from database
    try {
        const result = db.prepare(`
            DELETE FROM blocked_ips
            WHERE is_permanent = 0 AND blocked_until IS NOT NULL AND blocked_until < datetime('now')
        `).run();

        if (result.changes > 0) {
            logger.info('Cleaned up expired IP blocks', { count: result.changes });
        }
    } catch (error) {
        logger.error('Error cleaning up expired IP blocks', { error });
    }

    if (totalCleaned > 0) {
        logger.debug('Cleaned up rate limit records', { count: totalCleaned });
    }

    // Force refresh of blocked IPs cache
    blockedIpsCacheLastRefresh = 0;
}

/**
 * Reset rate limit record for a specific IP and action
 * Useful for admin operations
 */
export function resetRateLimitForIp(ip: string, action?: RateLimitAction): void {
    if (action) {
        rateLimitStores[action].delete(ip);
    } else {
        // Reset all actions for this IP
        for (const store of Object.values(rateLimitStores)) {
            store.delete(ip);
        }
    }

    logger.info('Rate limit reset for IP', { ip, action: action || 'all' });
}

/**
 * Get current rate limit status for an IP (useful for debugging/admin)
 */
export function getRateLimitStatus(
    ip: string
): Record<RateLimitAction, RateLimitRecord | null> {
    return {
        checkout_start: rateLimitStores.checkout_start.get(ip) || null,
        checkout_complete: rateLimitStores.checkout_complete.get(ip) || null,
        failed_payment: rateLimitStores.failed_payment.get(ip) || null,
    };
}

/**
 * Get list of all currently blocked IPs (useful for admin)
 */
export function getBlockedIps(): Array<{
    ip: string;
    reason: string;
    blockedUntil: string | null;
    isPermanent: boolean;
}> {
    try {
        const rows = db.prepare(`
            SELECT ip_address, reason, blocked_until, is_permanent
            FROM blocked_ips
            ORDER BY blocked_at DESC
        `).all() as Array<{
            ip_address: string;
            reason: string;
            blocked_until: string | null;
            is_permanent: number;
        }>;

        return rows.map((row) => ({
            ip: row.ip_address,
            reason: row.reason,
            blockedUntil: row.blocked_until,
            isPermanent: row.is_permanent === 1,
        }));
    } catch (error) {
        logger.error('Error fetching blocked IPs', { error });
        return [];
    }
}
