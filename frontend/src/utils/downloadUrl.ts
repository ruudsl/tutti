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

/**
 * Telt op bij elke keer dat de cache wordt leeggemaakt.
 *
 * Een aanvraag die op dat moment nog onderweg is, hoort niet meer in de cache
 * terecht te komen: bij uitloggen is dat het token van de vórige gebruiker.
 */
let cacheGeneratie = 0;

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
    const generatie = cacheGeneratie;
    pendingRequest = requestDownloadToken()
      .then((token) => {
        // Alleen bewaren als de cache ondertussen niet is leeggemaakt.
        if (generatie === cacheGeneratie) {
          cachedToken = token;
          cachedAt = Date.now();
        }
        return token;
      })
      .finally(() => {
        // Niet de aanvraag van een nieuwere generatie weggooien.
        if (generatie === cacheGeneratie) {
          pendingRequest = null;
        }
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

/**
 * Clear the cached token (e.g. on logout).
 *
 * Maakt ook de aanvraag ongeldig die op dit moment nog onderweg is. Zonder die
 * stap schreef een tokenaanvraag die tijdens het uitloggen liep het token van
 * de vorige gebruiker alsnog in de cache, tot vier minuten lang. Op een
 * gedeelde tablet haalde de volgende gebruiker zijn pasfoto's dan op met het
 * token van zijn voorganger, en aan de serverkant is dat niet van echt te
 * onderscheiden.
 */
export function clearDownloadTokenCache(): void {
  cachedToken = null;
  cachedAt = 0;
  cacheGeneratie += 1;
  pendingRequest = null;
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
