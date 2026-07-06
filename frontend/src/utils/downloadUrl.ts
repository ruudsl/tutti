/**
 * Short-lived download token helper.
 *
 * Some URLs cannot carry an Authorization header (<img src>, <audio src>,
 * window.open for file downloads, PDF viewers). Instead of appending the
 * full, long-lived JWT as a query parameter (which leaks into server logs,
 * proxies and browser history), we request a short-lived (5 minute) token
 * from POST /api/download-token and append that instead.
 *
 * The token is cached in memory for ~4 minutes so rendering a list of
 * thumbnails does not trigger a POST per image.
 */

import { useEffect, useState } from 'react';
import { STORAGE_KEYS } from './constants';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/** Cache slightly under the server-side expiry of 5 minutes. */
const TOKEN_CACHE_MS = 4 * 60 * 1000;

let cachedToken: string | null = null;
let cachedAt = 0;
let pendingRequest: Promise<string> | null = null;

function getFreshCachedToken(): string | null {
  return cachedToken && Date.now() - cachedAt < TOKEN_CACHE_MS ? cachedToken : null;
}

async function requestDownloadToken(): Promise<string> {
  const authToken = localStorage.getItem(STORAGE_KEYS.TOKEN);
  if (!authToken) {
    throw new Error('Not authenticated');
  }
  const response = await fetch(`${API_BASE}/download-token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!response.ok) {
    throw new Error('Failed to obtain download token');
  }
  const data = (await response.json()) as { token: string };
  return data.token;
}

/**
 * Get a short-lived download token, using the in-memory cache when possible.
 * Concurrent callers share a single in-flight request.
 */
export async function getDownloadToken(): Promise<string> {
  const fresh = getFreshCachedToken();
  if (fresh) {
    return fresh;
  }
  if (!pendingRequest) {
    pendingRequest = requestDownloadToken()
      .then((token) => {
        cachedToken = token;
        cachedAt = Date.now();
        return token;
      })
      .finally(() => {
        pendingRequest = null;
      });
  }
  return pendingRequest;
}

/**
 * Append a short-lived download token to a download/media URL.
 *
 * @example
 * const url = await withDownloadToken(`${API_BASE}/pdf-tools/download/${filepath}`);
 * window.open(url, '_blank');
 */
export async function withDownloadToken(url: string): Promise<string> {
  const token = await getDownloadToken();
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

/** Clear the cached token (e.g. on logout). */
export function clearDownloadTokenCache(): void {
  cachedToken = null;
  cachedAt = 0;
}

/**
 * React hook that resolves a download token for use in render (e.g. <img src>
 * thumbnails). Returns null until the token is available; callers should
 * render a fallback (avatar initials, placeholder) in the meantime.
 *
 * The token is fetched once per mount (served from the shared cache when
 * fresh) and intentionally not auto-refreshed, so already-rendered <img> and
 * <audio> elements are not disturbed by a src change.
 */
export function useDownloadToken(): string | null {
  const [token, setToken] = useState<string | null>(getFreshCachedToken());

  useEffect(() => {
    if (token) {
      return;
    }
    let active = true;
    getDownloadToken()
      .then((value) => {
        if (active) {
          setToken(value);
        }
      })
      .catch(() => {
        // Leave token null; callers render their fallback.
      });
    return () => {
      active = false;
    };
  }, [token]);

  return token;
}
