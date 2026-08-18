import logger from '../utils/logger';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/api/token';

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

    const response = await fetch(SPOTIFY_AUTH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error('Spotify authentication failed', { status: response.status, body: text });
      throw new Error(`Spotify authentication failed: ${response.status}`);
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
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

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error('Spotify API request failed', { endpoint, status: response.status, body: text });
      throw new Error(`Spotify API request failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
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
