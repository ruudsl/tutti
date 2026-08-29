import logger from '../utils/logger';
import { beschermd, BeschermdOpties, DienstFout, herkansNaUitKop } from '../utils/veerkracht';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/api/token';

/**
 * Hoe lang we hooguit op Spotify wachten.
 *
 * Zonder limiet blijft een verzoek aan een trage of hangende dienst staan tot
 * de andere kant hem sluit. Onze eigen aanvraag blijft dan net zo lang open,
 * met een verbinding en een werker eraan vast, terwijl het hier om een
 * bijzaak gaat: een streaminglink bij een titel. Beter is: opgeven.
 */
const SPOTIFY_TIMEOUT_MS = 10000;

/**
 * Hoe we omgaan met een Spotify dat hikt of omvalt.
 *
 * Zoeken en een nummer opvragen zijn leesacties: die mogen zonder gevolgen
 * nog eens. Bij een reeks storingen slaan we de dienst een halve minuut over -
 * een streaminglink bij een titel is een aardigheid, en daarvoor hoort niemand
 * tien seconden op een timeout te wachten.
 */
const SPOTIFY_VEERKRACHT: BeschermdOpties = {
  pogingen: 3,
  basisMs: 200,
  maxMs: 1000,
  maxTotaalMs: 2000,
  onderbreker: { drempel: 5, openMs: 30_000 },
};

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    images: { url: string; width: number; height: number }[];
  };
  duration_ms: number;
  preview_url: string | null;
  external_urls: {
    spotify: string;
  };
}

export interface SpotifySearchResult {
  tracks: {
    items: SpotifyTrack[];
    total: number;
    limit: number;
    offset: number;
  };
}

export interface SpotifyTrackInfo {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumArt: string | null;
  durationMs: number;
  previewUrl: string | null;
  spotifyUrl: string;
}

/**
 * Spotify API Client using Client Credentials flow
 * No user authentication required for search functionality
 */
export class SpotifyClient {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private clientId: string;
  private clientSecret: string;

  constructor(clientId?: string, clientSecret?: string) {
    this.clientId = clientId || process.env.SPOTIFY_CLIENT_ID || '';
    this.clientSecret = clientSecret || process.env.SPOTIFY_CLIENT_SECRET || '';
  }

  /**
   * Check if Spotify credentials are configured
   */
  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  /**
   * Get access token using Client Credentials flow
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    if (!this.isConfigured()) {
      throw new Error(
        'Spotify API credentials not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables.',
      );
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const data = await beschermd(
      'spotify',
      async () => {
        const response = await fetch(SPOTIFY_AUTH_URL, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials',
          signal: AbortSignal.timeout(SPOTIFY_TIMEOUT_MS),
        });

        if (!response.ok) {
          const text = await response.text();
          logger.error('Spotify authentication failed', { status: response.status, body: text });
          throw new DienstFout(`Spotify authentication failed: ${response.status}`, {
            dienst: 'spotify',
            status: response.status,
            herkansNaMs: herkansNaUitKop(response.headers?.get?.('retry-after')),
          });
        }

        return (await response.json()) as { access_token: string; expires_in: number };
      },
      SPOTIFY_VEERKRACHT,
    );
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;

    return this.accessToken;
  }

  /**
   * Make authenticated request to Spotify API
   */
  private async request<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const token = await this.getAccessToken();

    const url = new URL(`${SPOTIFY_API_BASE}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    // De aanmelding hierboven heeft haar eigen bescherming en is al klaar; deze
    // aanroep wordt dus niet in die van het token genest.
    return beschermd(
      'spotify',
      async () => {
        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(SPOTIFY_TIMEOUT_MS),
        });

        if (!response.ok) {
          const text = await response.text();
          logger.error('Spotify API request failed', { endpoint, status: response.status, body: text });
          throw new DienstFout(`Spotify API request failed: ${response.status}`, {
            dienst: 'spotify',
            status: response.status,
            herkansNaMs: herkansNaUitKop(response.headers?.get?.('retry-after')),
          });
        }

        return response.json() as Promise<T>;
      },
      SPOTIFY_VEERKRACHT,
    );
  }

  /**
   * Search for tracks by title and optionally composer/artist
   */
  async searchTracks(query: string, composer?: string, limit: number = 10): Promise<SpotifyTrackInfo[]> {
    // Build search query
    let searchQuery = query;
    if (composer) {
      // Try to search for track with artist
      searchQuery = `track:${query} artist:${composer}`;
    }

    const result = await this.request<SpotifySearchResult>('/search', {
      q: searchQuery,
      type: 'track',
      limit: limit.toString(),
      market: 'NL', // Use Netherlands market for Dutch music apps
    });

    return result.tracks.items.map((track) => this.mapTrack(track));
  }

  /**
   * Get track details by Spotify ID
   */
  async getTrack(trackId: string): Promise<SpotifyTrackInfo> {
    const track = await this.request<SpotifyTrack>(`/tracks/${trackId}`);
    return this.mapTrack(track);
  }

  /**
   * Extract track ID from Spotify URL
   */
  static extractTrackId(url: string): string | null {
    // Handle various Spotify URL formats:
    // - https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6
    // - spotify:track:6rqhFgbbKwnb9MLmUQDhG6
    // - https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6?si=...

    const webMatch = url.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
    if (webMatch) return webMatch[1];

    const uriMatch = url.match(/spotify:track:([a-zA-Z0-9]+)/);
    if (uriMatch) return uriMatch[1];

    return null;
  }

  /**
   * Build Spotify URL from track ID
   */
  static buildTrackUrl(trackId: string): string {
    return `https://open.spotify.com/track/${trackId}`;
  }

  /**
   * Map Spotify API track to simplified format
   */
  private mapTrack(track: SpotifyTrack): SpotifyTrackInfo {
    return {
      id: track.id,
      name: track.name,
      artist: track.artists.map((a) => a.name).join(', '),
      album: track.album.name,
      albumArt: track.album.images[0]?.url || null,
      durationMs: track.duration_ms,
      previewUrl: track.preview_url,
      spotifyUrl: track.external_urls.spotify,
    };
  }
}

// Singleton instance for convenience
let spotifyClient: SpotifyClient | null = null;

export function getSpotifyClient(): SpotifyClient {
  if (!spotifyClient) {
    spotifyClient = new SpotifyClient();
  }
  return spotifyClient;
}

export default SpotifyClient;
