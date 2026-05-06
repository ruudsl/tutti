import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

interface CacheEntry {
  data: unknown;
  timestamp: number;
  etag: string;
}

interface CacheOptions {
  /**
   * Time-to-live in seconds. Default: 300 (5 minutes)
   */
  ttlSeconds?: number;
  /**
   * Whether to vary cache by user's association ID. Default: false
   */
  varyByAssociation?: boolean;
  /**
   * Additional cache key suffix. Default: undefined
   */
  keySuffix?: string;
}

// In-memory cache store
const cache = new Map<string, CacheEntry>();

// Track which paths have caching enabled (for invalidation)
const cachedPaths = new Set<string>();

/**
 * Generate a cache key based on the request
 */
function generateCacheKey(req: Request, options: CacheOptions): string {
  const parts = [req.method, req.originalUrl];

  if (options.varyByAssociation && (req as any).user?.associationId) {
    parts.push(`assoc:${(req as any).user.associationId}`);
  }

  if (options.keySuffix) {
    parts.push(options.keySuffix);
  }

  return parts.join('|');
}

/**
 * Generate an ETag for response data
 */
function generateETag(data: unknown): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `"${Math.abs(hash).toString(16)}"`;
}

/**
 * Check if a cache entry is still valid
 */
function isValid(entry: CacheEntry, ttlSeconds: number): boolean {
  const now = Date.now();
  return (now - entry.timestamp) < (ttlSeconds * 1000);
}

/**
 * Cache middleware factory.
 * Caches GET requests and returns cached responses when available.
 *
 * @example
 * // Cache for 5 minutes (default)
 * router.get('/', authenticateToken, cacheMiddleware(), handler);
 *
 * @example
 * // Cache for 10 minutes, vary by association
 * router.get('/', authenticateToken, cacheMiddleware({ ttlSeconds: 600, varyByAssociation: true }), handler);
 */
export function cacheMiddleware(options: CacheOptions = {}) {
  const { ttlSeconds = 300, varyByAssociation = false, keySuffix } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = generateCacheKey(req, { ttlSeconds, varyByAssociation, keySuffix });

    // Debug logging for cache
    if (varyByAssociation) {
      console.log(`[CACHE] Key: ${cacheKey}, User assocId: ${(req as any).user?.associationId}`);
    }

    // Register this path for invalidation tracking
    cachedPaths.add(req.baseUrl + req.path);

    // Check for cached response
    const cached = cache.get(cacheKey);
    if (cached && isValid(cached, ttlSeconds)) {
      // Check If-None-Match header for conditional GET
      const clientEtag = req.headers['if-none-match'];
      if (clientEtag === cached.etag) {
        res.status(304).end();
        return;
      }

      // Return cached response
      res.set('X-Cache', 'HIT');
      res.set('ETag', cached.etag);
      res.set('Cache-Control', `private, max-age=${ttlSeconds}`);
      return res.json(cached.data);
    }

    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json to cache the response
    res.json = (data: unknown): Response => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const etag = generateETag(data);
        cache.set(cacheKey, {
          data,
          timestamp: Date.now(),
          etag,
        });

        res.set('X-Cache', 'MISS');
        res.set('ETag', etag);
        res.set('Cache-Control', `private, max-age=${ttlSeconds}`);
      }

      return originalJson(data);
    };

    next();
  };
}

/**
 * Invalidate cache entries for a specific path pattern.
 * Call this after POST/PUT/DELETE operations to ensure fresh data.
 *
 * @param pathPattern - Base path to invalidate (e.g., '/api/instruments')
 */
export function invalidateCache(pathPattern: string): void {
  let invalidatedCount = 0;

  for (const key of cache.keys()) {
    // Key format: "METHOD|/path|...", check if path matches pattern
    if (key.includes(pathPattern)) {
      cache.delete(key);
      invalidatedCount++;
    }
  }

  if (invalidatedCount > 0) {
    logger.debug(`Cache invalidated: ${invalidatedCount} entries for pattern "${pathPattern}"`);
  }
}

/**
 * Invalidate all cache entries.
 */
export function invalidateAllCache(): void {
  const count = cache.size;
  cache.clear();
  logger.debug(`Cache cleared: ${count} entries removed`);
}

/**
 * Get cache statistics.
 */
export function getCacheStats(): { size: number; paths: string[] } {
  return {
    size: cache.size,
    paths: Array.from(cachedPaths),
  };
}

/**
 * Middleware to invalidate cache on mutation operations.
 * Use this on routes that modify data.
 *
 * @example
 * router.post('/', authenticateToken, cacheInvalidator('/api/instruments'), handler);
 */
export function cacheInvalidator(pathPattern: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store original methods
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    const originalEnd = res.end.bind(res);

    // Helper to invalidate after successful response
    const invalidateOnSuccess = () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        invalidateCache(pathPattern);
      }
    };

    // Override response methods to trigger invalidation
    res.json = (data: unknown): Response => {
      invalidateOnSuccess();
      return originalJson(data);
    };

    res.send = (data?: unknown): Response => {
      invalidateOnSuccess();
      return originalSend(data);
    };

    res.end = ((...args: unknown[]): Response => {
      invalidateOnSuccess();
      return (originalEnd as any)(...args);
    }) as any;

    next();
  };
}

/**
 * Periodic cache cleanup to remove expired entries.
 * Run this periodically (e.g., every 5 minutes).
 */
export function cleanupExpiredCache(maxAge: number = 600): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, entry] of cache.entries()) {
    if ((now - entry.timestamp) > (maxAge * 1000)) {
      cache.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug(`Cache cleanup: ${cleaned} expired entries removed`);
  }
}

// Start periodic cleanup (every 5 minutes)
setInterval(() => cleanupExpiredCache(600), 5 * 60 * 1000);

export default cacheMiddleware;
