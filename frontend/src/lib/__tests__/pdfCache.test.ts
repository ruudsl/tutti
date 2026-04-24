import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  cachePdf,
  getCachedPdf,
  isPdfCached,
  cacheListPdfs,
  getCacheStats,
  clearPdfCache,
  removeCachedPdf,
} from '../pdfCache';

// In-memory mock of the Cache API
function createMockCache() {
  const store = new Map<string, Response>();
  const toKey = (req: string | { url: string }) =>
    typeof req === 'string' ? req : req.url;
  return {
    async put(url: string, response: Response) {
      store.set(url, response);
    },
    async match(req: string | { url: string }) {
      return store.get(toKey(req));
    },
    async delete(req: string | { url: string }) {
      return store.delete(toKey(req));
    },
    async keys() {
      // Return URL-bearing objects that work with both cache.match and new URL(req.url)
      return Array.from(store.keys()).map((url) => ({ url }) as unknown as Request);
    },
    _store: store,
  };
}

describe('pdfCache', () => {
  let mockCache: ReturnType<typeof createMockCache>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCache = createMockCache();

    // Mock caches global
    // @ts-expect-error - caches doesn't exist in jsdom by default
    global.caches = {
      open: vi.fn(async () => mockCache),
      delete: vi.fn(async () => true),
    };

    // Mock fetch
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    // Mock localStorage
    const localStorageMock: Record<string, string> = {};
    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: (key: string) => localStorageMock[key] ?? null,
        setItem: (key: string, value: string) => {
          localStorageMock[key] = value;
        },
        removeItem: (key: string) => {
          delete localStorageMock[key];
        },
      },
      configurable: true,
    });
    localStorage.setItem('token', 'test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('cachePdf', () => {
    it('should cache a successful PDF response', async () => {
      const mockResponse = new Response('pdf-content', {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      });
      fetchMock.mockResolvedValue(mockResponse);

      const result = await cachePdf('piece-1');

      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/music-pieces/piece-1/download'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        })
      );
      expect(mockCache._store.size).toBe(1);
    });

    it('should return false when no token is present', async () => {
      localStorage.removeItem('token');

      const result = await cachePdf('piece-1');

      expect(result).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should return false when response is not ok', async () => {
      fetchMock.mockResolvedValue(new Response('not found', { status: 404 }));

      const result = await cachePdf('piece-1');

      expect(result).toBe(false);
      expect(mockCache._store.size).toBe(0);
    });

    it('should return false when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));

      const result = await cachePdf('piece-1');

      expect(result).toBe(false);
    });
  });

  describe('isPdfCached', () => {
    it('should return true when piece is cached', async () => {
      const mockResponse = new Response('pdf-content', { status: 200 });
      fetchMock.mockResolvedValue(mockResponse);
      await cachePdf('piece-1');

      const result = await isPdfCached('piece-1');

      expect(result).toBe(true);
    });

    it('should return false when piece is not cached', async () => {
      const result = await isPdfCached('piece-missing');

      expect(result).toBe(false);
    });
  });

  describe('getCachedPdf', () => {
    it('should return the cached response', async () => {
      fetchMock.mockResolvedValue(new Response('content', { status: 200 }));
      await cachePdf('piece-1');

      const cached = await getCachedPdf('piece-1');

      expect(cached).toBeDefined();
    });

    it('should return undefined for non-cached piece', async () => {
      const cached = await getCachedPdf('non-existent');

      expect(cached).toBeUndefined();
    });
  });

  describe('cacheListPdfs', () => {
    it('should cache all pieces in the list', async () => {
      fetchMock.mockResolvedValue(new Response('content', { status: 200 }));

      const count = await cacheListPdfs([
        { id: 'piece-1' },
        { id: 'piece-2' },
        { id: 'piece-3' },
      ]);

      expect(count).toBe(3);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('should report progress as pieces are cached', async () => {
      fetchMock.mockResolvedValue(new Response('content', { status: 200 }));
      const onProgress = vi.fn();

      await cacheListPdfs(
        [{ id: 'piece-1' }, { id: 'piece-2' }],
        onProgress
      );

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2);
      expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2);
    });

    it('should return only successful cache count', async () => {
      fetchMock
        .mockResolvedValueOnce(new Response('content', { status: 200 }))
        .mockResolvedValueOnce(new Response('not found', { status: 404 }))
        .mockResolvedValueOnce(new Response('content', { status: 200 }));

      const count = await cacheListPdfs([
        { id: 'piece-1' },
        { id: 'piece-2' },
        { id: 'piece-3' },
      ]);

      expect(count).toBe(2);
    });

    it('should handle empty list', async () => {
      const count = await cacheListPdfs([]);

      expect(count).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('getCacheStats', () => {
    it('should return count and size of cached items', async () => {
      fetchMock.mockResolvedValue(new Response('hello', { status: 200 }));
      await cachePdf('piece-1');
      await cachePdf('piece-2');

      const stats = await getCacheStats();

      expect(stats.count).toBe(2);
      expect(stats.sizeBytes).toBeGreaterThan(0);
    });

    it('should return zeros for empty cache', async () => {
      const stats = await getCacheStats();

      expect(stats.count).toBe(0);
      expect(stats.sizeBytes).toBe(0);
    });
  });

  describe('removeCachedPdf', () => {
    it('should remove a cached piece', async () => {
      fetchMock.mockResolvedValue(new Response('content', { status: 200 }));
      await cachePdf('piece-1');
      expect(await isPdfCached('piece-1')).toBe(true);

      await removeCachedPdf('piece-1');

      expect(await isPdfCached('piece-1')).toBe(false);
    });

    it('should not throw when removing non-existent piece', async () => {
      await expect(removeCachedPdf('non-existent')).resolves.not.toThrow();
    });
  });

  describe('clearPdfCache', () => {
    it('should call caches.delete with the cache name', async () => {
      await clearPdfCache();

      expect(caches.delete).toHaveBeenCalledWith('pdf-offline-cache');
    });
  });
});
