import logger from '../utils/logger';
import jwt from 'jsonwebtoken';

const APPLE_MUSIC_API_BASE = 'https://api.music.apple.com/v1';

export interface AppleMusicTrack {
    id: string;
    type: string;
    href: string;
    attributes: {
        name: string;
        artistName: string;
        albumName: string;
        durationInMillis: number;
        previews: { url: string }[];
        artwork?: {
            url: string;
            width: number;
            height: number;
        };
        url: string;
    };
}

export interface AppleMusicSearchResult {
    results: {
        songs?: {
            data: AppleMusicTrack[];
        };
    };
}

export interface AppleMusicTrackInfo {
    id: string;
    name: string;
    artist: string;
    album: string;
    albumArt: string | null;
    durationMs: number;
    previewUrl: string | null;
    appleMusicUrl: string;
}

/**
 * Apple Music API Client
 * Uses JWT authentication with developer token
 */
export class AppleMusicClient {
    private developerToken: string | null = null;
    private tokenExpiresAt: number = 0;
    private teamId: string;
    private keyId: string;
    private privateKey: string;

    constructor(teamId?: string, keyId?: string, privateKey?: string) {
        this.teamId = teamId || process.env.APPLE_MUSIC_TEAM_ID || '';
        this.keyId = keyId || process.env.APPLE_MUSIC_KEY_ID || '';
        this.privateKey = privateKey || process.env.APPLE_MUSIC_PRIVATE_KEY || '';
    }

    /**
     * Check if Apple Music credentials are configured
     */
    isConfigured(): boolean {
        return Boolean(this.teamId && this.keyId && this.privateKey);
    }

    /**
     * Generate developer token (JWT)
     */
    private generateDeveloperToken(): string {
        if (!this.isConfigured()) {
            throw new Error('Apple Music API credentials not configured. Set APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, and APPLE_MUSIC_PRIVATE_KEY environment variables.');
        }

        // Token valid for 6 hours (max is 6 months, but we'll regenerate often)
        const now = Math.floor(Date.now() / 1000);
        const expiresIn = 6 * 60 * 60; // 6 hours

        const token = jwt.sign(
            {
                iss: this.teamId,
                iat: now,
                exp: now + expiresIn,
            },
            this.privateKey,
            {
                algorithm: 'ES256',
                header: {
                    alg: 'ES256',
                    kid: this.keyId,
                },
            }
        );

        this.developerToken = token;
        this.tokenExpiresAt = (now + expiresIn) * 1000;

        return token;
    }

    /**
     * Get developer token (cached)
     */
    private getDeveloperToken(): string {
        // Return cached token if still valid (with 5 minute buffer)
        if (this.developerToken && Date.now() < this.tokenExpiresAt - 300000) {
            return this.developerToken;
        }

        return this.generateDeveloperToken();
    }

    /**
     * Make authenticated request to Apple Music API
     */
    private async request<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
        const token = this.getDeveloperToken();

        const url = new URL(`${APPLE_MUSIC_API_BASE}${endpoint}`);
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                url.searchParams.append(key, value);
            });
        }

        const response = await fetch(url.toString(), {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        if (!response.ok) {
            const text = await response.text();
            logger.error('Apple Music API request failed', { endpoint, status: response.status, body: text });
            throw new Error(`Apple Music API request failed: ${response.status}`);
        }

        return response.json() as Promise<T>;
    }

    /**
     * Search for tracks by title and optionally composer/artist
     */
    async searchTracks(query: string, composer?: string, limit: number = 10): Promise<AppleMusicTrackInfo[]> {
        // Build search query
        let searchQuery = query;
        if (composer) {
            searchQuery = `${query} ${composer}`;
        }

        const result = await this.request<AppleMusicSearchResult>('/catalog/nl/search', {
            term: searchQuery,
            types: 'songs',
            limit: limit.toString(),
        });

        if (!result.results.songs?.data) {
            return [];
        }

        return result.results.songs.data.map(track => this.mapTrack(track));
    }

    /**
     * Get track details by Apple Music ID
     */
    async getTrack(trackId: string): Promise<AppleMusicTrackInfo> {
        const result = await this.request<{ data: AppleMusicTrack[] }>(`/catalog/nl/songs/${trackId}`);

        if (!result.data || result.data.length === 0) {
            throw new Error('Track not found');
        }

        return this.mapTrack(result.data[0]);
    }

    /**
     * Extract track ID from Apple Music URL
     */
    static extractTrackId(url: string): string | null {
        // Handle various Apple Music URL formats:
        // - https://music.apple.com/nl/album/track-name/1234567890?i=1234567890
        // - https://music.apple.com/nl/song/track-name/1234567890
        // - apple-music://song/1234567890

        // Album URL with track ID in ?i= parameter
        const albumMatch = url.match(/music\.apple\.com\/[a-z]{2}\/album\/[^/]+\/\d+\?i=(\d+)/);
        if (albumMatch) return albumMatch[1];

        // Direct song URL
        const songMatch = url.match(/music\.apple\.com\/[a-z]{2}\/song\/[^/]+\/(\d+)/);
        if (songMatch) return songMatch[1];

        // App URI
        const uriMatch = url.match(/apple-music:\/\/song\/(\d+)/);
        if (uriMatch) return uriMatch[1];

        return null;
    }

    /**
     * Build Apple Music URL from track ID
     */
    static buildTrackUrl(trackId: string): string {
        return `https://music.apple.com/nl/song/${trackId}`;
    }

    /**
     * Format artwork URL with desired size
     */
    private formatArtworkUrl(url: string, size: number = 300): string {
        // Apple Music artwork URLs have {w}x{h} placeholders
        return url.replace('{w}', size.toString()).replace('{h}', size.toString());
    }

    /**
     * Map Apple Music API track to simplified format
     */
    private mapTrack(track: AppleMusicTrack): AppleMusicTrackInfo {
        const artwork = track.attributes.artwork;
        let albumArt: string | null = null;

        if (artwork?.url) {
            albumArt = this.formatArtworkUrl(artwork.url);
        }

        return {
            id: track.id,
            name: track.attributes.name,
            artist: track.attributes.artistName,
            album: track.attributes.albumName,
            albumArt,
            durationMs: track.attributes.durationInMillis,
            previewUrl: track.attributes.previews?.[0]?.url || null,
            appleMusicUrl: track.attributes.url,
        };
    }
}

// Singleton instance for convenience
let appleMusicClient: AppleMusicClient | null = null;

export function getAppleMusicClient(): AppleMusicClient {
    if (!appleMusicClient) {
        appleMusicClient = new AppleMusicClient();
    }
    return appleMusicClient;
}

export default AppleMusicClient;
