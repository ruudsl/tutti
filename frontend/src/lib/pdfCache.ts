const CACHE_NAME = 'pdf-offline-cache';
const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function cachePdf(pieceId: string): Promise<boolean> {
  const token = localStorage.getItem('token');
  if (!token) return false;

  const cache = await caches.open(CACHE_NAME);
  const url = `${API_BASE}/music-pieces/${pieceId}/download`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return false;
    await cache.put(url, response);
    return true;
  } catch {
    return false;
  }
}

export async function getCachedPdf(pieceId: string): Promise<Response | undefined> {
  const cache = await caches.open(CACHE_NAME);
  const url = `${API_BASE}/music-pieces/${pieceId}/download`;
  return cache.match(url);
}

export async function isPdfCached(pieceId: string): Promise<boolean> {
  const cached = await getCachedPdf(pieceId);
  return !!cached;
}

export async function cacheListPdfs(
  pieces: { id: string }[],
  onProgress?: (cached: number, total: number) => void,
): Promise<number> {
  let cached = 0;
  for (const piece of pieces) {
    const success = await cachePdf(piece.id);
    if (success) cached++;
    onProgress?.(cached, pieces.length);
  }
  return cached;
}

export async function getCacheStats(): Promise<{ count: number; sizeBytes: number }> {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  let sizeBytes = 0;
  for (const req of keys) {
    const res = await cache.match(req);
    if (res) {
      const blob = await res.clone().blob();
      sizeBytes += blob.size;
    }
  }
  return { count: keys.length, sizeBytes };
}

export async function clearPdfCache(): Promise<void> {
  await caches.delete(CACHE_NAME);
}

export async function removeCachedPdf(pieceId: string): Promise<void> {
  const cache = await caches.open(CACHE_NAME);
  const url = `${API_BASE}/music-pieces/${pieceId}/download`;
  await cache.delete(url);
}
