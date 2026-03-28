import { Request, Response, NextFunction } from 'express';
import config from '../config';
import db from '../database/connection';
import logger from '../utils/logger';

// CIDR calculation utilities
interface IpRange {
    start: bigint;
    end: bigint;
}

/**
 * Convert IP address string to BigInt for range comparison
 */
function ipToNumber(ip: string): bigint | null {
    // Handle IPv4
    const ipv4Match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
        const [, a, b, c, d] = ipv4Match.map(Number);
        if ([a, b, c, d].every(n => n >= 0 && n <= 255)) {
            return BigInt((a << 24) | (b << 16) | (c << 8) | d);
        }
    }

    // Handle IPv6 (simplified - convert to BigInt)
    if (ip.includes(':')) {
        try {
            // Expand :: notation
            let fullIp = ip;
            if (ip.includes('::')) {
                const parts = ip.split('::');
                const left = parts[0] ? parts[0].split(':') : [];
                const right = parts[1] ? parts[1].split(':') : [];
                const missing = 8 - left.length - right.length;
                const middle = Array(missing).fill('0000');
                fullIp = [...left, ...middle, ...right].join(':');
            }

            const parts = fullIp.split(':').map(p => p.padStart(4, '0'));
            if (parts.length !== 8) return null;

            let result = BigInt(0);
            for (const part of parts) {
                result = (result << BigInt(16)) | BigInt(parseInt(part, 16));
            }
            return result;
        } catch {
            return null;
        }
    }

    return null;
}

/**
 * Parse CIDR notation and return IP range
 */
function parseCidr(cidr: string): IpRange | null {
    const [ip, prefix] = cidr.split('/');
    const prefixNum = parseInt(prefix);

    const ipNum = ipToNumber(ip);
    if (ipNum === null) return null;

    // Determine if IPv4 or IPv6
    const isIpv4 = ip.includes('.');
    const maxBits = isIpv4 ? 32 : 128;

    if (isNaN(prefixNum) || prefixNum < 0 || prefixNum > maxBits) return null;

    const mask = prefixNum === 0
        ? BigInt(0)
        : ((BigInt(1) << BigInt(maxBits)) - BigInt(1)) ^ ((BigInt(1) << BigInt(maxBits - prefixNum)) - BigInt(1));

    const start = ipNum & mask;
    const end = start | ((BigInt(1) << BigInt(maxBits - prefixNum)) - BigInt(1));

    return { start, end };
}

/**
 * Check if an IP is within a CIDR range
 */
function isIpInRange(ip: string, cidr: string): boolean {
    const ipNum = ipToNumber(ip);
    if (ipNum === null) return false;

    const range = parseCidr(cidr);
    if (range === null) return false;

    return ipNum >= range.start && ipNum <= range.end;
}

/**
 * Check if an IP matches a pattern (exact match or CIDR)
 */
function isIpAllowed(clientIp: string, allowedPattern: string): boolean {
    // Normalize IPv4-mapped IPv6 addresses
    let normalizedIp = clientIp;
    if (clientIp.startsWith('::ffff:')) {
        normalizedIp = clientIp.substring(7);
    }

    // Exact match
    if (normalizedIp === allowedPattern || clientIp === allowedPattern) {
        return true;
    }

    // CIDR range match
    if (allowedPattern.includes('/')) {
        return isIpInRange(normalizedIp, allowedPattern) || isIpInRange(clientIp, allowedPattern);
    }

    return false;
}

/**
 * Private network ranges that are allowed in development
 */
const PRIVATE_RANGES = [
    '127.0.0.1',
    '::1',
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    'fc00::/7', // IPv6 unique local addresses
    'fe80::/10', // IPv6 link-local addresses
];

/**
 * Check if IP is a private/localhost address
 */
function isPrivateIp(ip: string): boolean {
    return PRIVATE_RANGES.some(range => isIpAllowed(ip, range));
}

/**
 * Get allowed IPs from database
 */
function getWhitelistedIpsFromDb(associationId?: string | null): string[] {
    try {
        // Check if table exists
        const tableExists = db.prepare(`
            SELECT name FROM sqlite_master WHERE type='table' AND name='ip_whitelist'
        `).get();

        if (!tableExists) {
            return [];
        }

        // Get all enabled IPs, optionally filtered by association
        let query = 'SELECT ip_address FROM ip_whitelist WHERE is_enabled = 1';
        const params: (string | null)[] = [];

        if (associationId) {
            query += ' AND (association_id = ? OR association_id IS NULL)';
            params.push(associationId);
        }

        const rows = db.prepare(query).all(...params) as { ip_address: string }[];
        return rows.map(r => r.ip_address);
    } catch (error) {
        logger.error('Error fetching IP whitelist from database', { error });
        return [];
    }
}

/**
 * Get client IP from request
 * Handles various proxy scenarios
 */
function getClientIp(req: Request): string {
    // Check X-Forwarded-For header (behind proxy/load balancer)
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
        const ips = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor).split(',');
        return ips[0].trim();
    }

    // Check X-Real-IP header (nginx)
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
        return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    // Fall back to socket address
    return req.ip || req.socket.remoteAddress || 'unknown';
}

// Cache for database whitelist to avoid repeated queries
let whitelistCache: { ips: string[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

/**
 * Middleware to check if client IP is whitelisted for admin routes
 */
export function ipWhitelistMiddleware(req: Request, res: Response, next: NextFunction) {
    // Skip if IP whitelisting is disabled
    if (!config.ipWhitelistEnabled) {
        return next();
    }

    const clientIp = getClientIp(req);

    // In development, always allow private/localhost IPs
    if (config.isDevelopment && isPrivateIp(clientIp)) {
        return next();
    }

    // Check config-based allowed IPs first
    const configAllowedIps = config.adminAllowedIps;
    for (const allowedIp of configAllowedIps) {
        if (isIpAllowed(clientIp, allowedIp)) {
            return next();
        }
    }

    // Check database whitelist (with caching)
    const now = Date.now();
    if (!whitelistCache || now - whitelistCache.timestamp > CACHE_TTL_MS) {
        whitelistCache = {
            ips: getWhitelistedIpsFromDb(),
            timestamp: now,
        };
    }

    for (const allowedIp of whitelistCache.ips) {
        if (isIpAllowed(clientIp, allowedIp)) {
            return next();
        }
    }

    // IP not whitelisted
    logger.warn('IP whitelist check failed', {
        clientIp,
        path: req.path,
        method: req.method,
    });

    return res.status(403).json({
        error: 'Access denied. Your IP address is not authorized for this action.'
    });
}

/**
 * Create middleware that checks whitelist for specific association
 */
export function createAssociationIpWhitelist(getAssociationId: (req: Request) => string | null) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!config.ipWhitelistEnabled) {
            return next();
        }

        const clientIp = getClientIp(req);

        // In development, always allow private/localhost IPs
        if (config.isDevelopment && isPrivateIp(clientIp)) {
            return next();
        }

        // Check config-based allowed IPs
        for (const allowedIp of config.adminAllowedIps) {
            if (isIpAllowed(clientIp, allowedIp)) {
                return next();
            }
        }

        // Check database whitelist for specific association
        const associationId = getAssociationId(req);
        const allowedIps = getWhitelistedIpsFromDb(associationId);

        for (const allowedIp of allowedIps) {
            if (isIpAllowed(clientIp, allowedIp)) {
                return next();
            }
        }

        logger.warn('Association IP whitelist check failed', {
            clientIp,
            associationId,
            path: req.path,
            method: req.method,
        });

        return res.status(403).json({
            error: 'Access denied. Your IP address is not authorized for this action.'
        });
    };
}

/**
 * Invalidate the IP whitelist cache
 * Call this after modifying the whitelist in the database
 */
export function invalidateWhitelistCache() {
    whitelistCache = null;
}

/**
 * Utility to check if an IP would be allowed (for testing/validation)
 */
export function wouldIpBeAllowed(ip: string, patterns: string[]): boolean {
    return patterns.some(pattern => isIpAllowed(ip, pattern));
}

// Export utilities for testing
export { isIpAllowed, parseCidr, getClientIp, isPrivateIp };
