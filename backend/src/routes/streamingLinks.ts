import { Router, Response } from 'express';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { getSpotifyClient, SpotifyTrackInfo } from '../services/spotify';
import { getAppleMusicClient, AppleMusicTrackInfo } from '../services/appleMusic';
import logger from '../utils/logger';

const router = Router();

export interface StreamingLinks {
    spotify_url?: string | null;
    apple_music_url?: string | null;
    youtube_music_url?: string | null;
    spotify_preview_url?: string | null;
    apple_music_preview_url?: string | null;
}

export interface SearchResult {
    id: string;
    name: string;
    artist: string;
    album: string;
    albumArt: string | null;
    durationMs: number;
    previewUrl: string | null;
    url: string;
    platform: 'spotify' | 'apple';
}

/**
 * @swagger
 * /streaming/status:
 *   get:
 *     summary: Get streaming services configuration status
 *     tags: [Streaming]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status of configured streaming services
 */
router.get('/status', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const spotifyClient = getSpotifyClient();
    const appleMusicClient = getAppleMusicClient();

    res.json({
        spotify: spotifyClient.isConfigured(),
        appleMusic: appleMusicClient.isConfigured(),
    });
}));

/**
 * @swagger
 * /streaming/search:
 *   get:
 *     summary: Search for tracks on streaming platforms
 *     tags: [Streaming]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query (title)
 *       - in: query
 *         name: composer
 *         schema:
 *           type: string
 *         description: Optional composer/artist name
 *       - in: query
 *         name: platform
 *         required: true
 *         schema:
 *           type: string
 *           enum: [spotify, apple]
 *         description: Platform to search on
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 10
 *         description: Maximum number of results
 *     responses:
 *       200:
 *         description: Search results
 */
router.get('/search', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { q, composer, platform, limit = '10' } = req.query;

    if (!q || typeof q !== 'string') {
        throw new ApiError(400, 'Search query (q) is required.');
    }

    if (!platform || (platform !== 'spotify' && platform !== 'apple')) {
        throw new ApiError(400, 'Platform must be "spotify" or "apple".');
    }

    const limitNum = Math.min(Math.max(parseInt(limit as string) || 10, 1), 50);
    const composerStr = typeof composer === 'string' ? composer : undefined;

    let results: SearchResult[] = [];

    if (platform === 'spotify') {
        const spotifyClient = getSpotifyClient();

        if (!spotifyClient.isConfigured()) {
            throw new ApiError(503, 'Spotify API is not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables.');
        }

        const tracks = await spotifyClient.searchTracks(q, composerStr, limitNum);
        results = tracks.map((track: SpotifyTrackInfo) => ({
            id: track.id,
            name: track.name,
            artist: track.artist,
            album: track.album,
            albumArt: track.albumArt,
            durationMs: track.durationMs,
            previewUrl: track.previewUrl,
            url: track.spotifyUrl,
            platform: 'spotify' as const,
        }));
    } else if (platform === 'apple') {
        const appleMusicClient = getAppleMusicClient();

        if (!appleMusicClient.isConfigured()) {
            throw new ApiError(503, 'Apple Music API is not configured. Set APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, and APPLE_MUSIC_PRIVATE_KEY environment variables.');
        }

        const tracks = await appleMusicClient.searchTracks(q, composerStr, limitNum);
        results = tracks.map((track: AppleMusicTrackInfo) => ({
            id: track.id,
            name: track.name,
            artist: track.artist,
            album: track.album,
            albumArt: track.albumArt,
            durationMs: track.durationMs,
            previewUrl: track.previewUrl,
            url: track.appleMusicUrl,
            platform: 'apple' as const,
        }));
    }

    res.json({ results });
}));

/**
 * @swagger
 * /streaming/music-titles/{id}/links:
 *   get:
 *     summary: Get streaming links for a music title
 *     tags: [Streaming]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Music title ID
 *     responses:
 *       200:
 *         description: Streaming links for the title
 */
router.get('/music-titles/:id/links', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const title = db.prepare('SELECT streaming_links FROM music_titles WHERE id = ? AND association_id = ?')
        .get(id, req.user!.associationId) as { streaming_links: string | null } | undefined;

    if (!title) {
        throw new ApiError(404, 'Music title not found.');
    }

    let links: StreamingLinks = {};
    if (title.streaming_links) {
        try {
            links = JSON.parse(title.streaming_links);
        } catch (e) {
            // Invalid JSON, return empty
        }
    }

    res.json(links);
}));

/**
 * @swagger
 * /streaming/music-titles/{id}/links:
 *   post:
 *     summary: Add or update streaming links for a music title
 *     tags: [Streaming]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Music title ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               spotify_url:
 *                 type: string
 *               apple_music_url:
 *                 type: string
 *               youtube_music_url:
 *                 type: string
 *               spotify_preview_url:
 *                 type: string
 *               apple_music_preview_url:
 *                 type: string
 *     responses:
 *       200:
 *         description: Streaming links updated
 */
router.post('/music-titles/:id/links', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { spotify_url, apple_music_url, youtube_music_url, spotify_preview_url, apple_music_preview_url } = req.body;

    // Check if title exists and belongs to user's association
    const title = db.prepare(`
        SELECT id, streaming_links, association_id
        FROM music_titles
        WHERE id = ?
    `).get(id) as { id: string; streaming_links: string | null; association_id: string } | undefined;

    if (!title) {
        throw new ApiError(404, 'Music title not found.');
    }

    // Authorization: must be same association
    if (title.association_id !== req.user!.associationId) {
        throw new ApiError(403, 'Access denied.');
    }

    // Parse existing links
    let existingLinks: StreamingLinks = {};
    if (title.streaming_links) {
        try {
            existingLinks = JSON.parse(title.streaming_links);
        } catch (e) {
            // Invalid JSON, start fresh
        }
    }

    // Merge with new links
    const updatedLinks: StreamingLinks = {
        ...existingLinks,
        spotify_url: spotify_url !== undefined ? spotify_url : existingLinks.spotify_url,
        apple_music_url: apple_music_url !== undefined ? apple_music_url : existingLinks.apple_music_url,
        youtube_music_url: youtube_music_url !== undefined ? youtube_music_url : existingLinks.youtube_music_url,
        spotify_preview_url: spotify_preview_url !== undefined ? spotify_preview_url : existingLinks.spotify_preview_url,
        apple_music_preview_url: apple_music_preview_url !== undefined ? apple_music_preview_url : existingLinks.apple_music_preview_url,
    };

    // Clean up null values
    Object.keys(updatedLinks).forEach(key => {
        if (updatedLinks[key as keyof StreamingLinks] === null) {
            delete updatedLinks[key as keyof StreamingLinks];
        }
    });

    db.prepare('UPDATE music_titles SET streaming_links = ? WHERE id = ?').run(
        Object.keys(updatedLinks).length > 0 ? JSON.stringify(updatedLinks) : null,
        id
    );

    logger.info(`User ${req.user!.id} updated streaming links for title ${id}`);

    res.json({
        message: 'Streaming links updated.',
        links: updatedLinks,
    });
}));

/**
 * @swagger
 * /streaming/music-titles/{id}/links/{platform}:
 *   delete:
 *     summary: Remove streaming link for a platform
 *     tags: [Streaming]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Music title ID
 *       - in: path
 *         name: platform
 *         required: true
 *         schema:
 *           type: string
 *           enum: [spotify, apple, youtube]
 *         description: Platform to remove
 *     responses:
 *       200:
 *         description: Streaming link removed
 */
router.delete('/music-titles/:id/links/:platform', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id, platform } = req.params;

    if (!['spotify', 'apple', 'youtube'].includes(platform)) {
        throw new ApiError(400, 'Platform must be "spotify", "apple", or "youtube".');
    }

    // Check if title exists and belongs to user's association
    const title = db.prepare(`
        SELECT id, streaming_links, association_id
        FROM music_titles
        WHERE id = ?
    `).get(id) as { id: string; streaming_links: string | null; association_id: string } | undefined;

    if (!title) {
        throw new ApiError(404, 'Music title not found.');
    }

    // Authorization: must be same association
    if (title.association_id !== req.user!.associationId) {
        throw new ApiError(403, 'Access denied.');
    }

    // Parse existing links
    let existingLinks: StreamingLinks = {};
    if (title.streaming_links) {
        try {
            existingLinks = JSON.parse(title.streaming_links);
        } catch (e) {
            // Invalid JSON
        }
    }

    // Remove the platform's links
    if (platform === 'spotify') {
        delete existingLinks.spotify_url;
        delete existingLinks.spotify_preview_url;
    } else if (platform === 'apple') {
        delete existingLinks.apple_music_url;
        delete existingLinks.apple_music_preview_url;
    } else if (platform === 'youtube') {
        delete existingLinks.youtube_music_url;
    }

    db.prepare('UPDATE music_titles SET streaming_links = ? WHERE id = ?').run(
        Object.keys(existingLinks).length > 0 ? JSON.stringify(existingLinks) : null,
        id
    );

    logger.info(`User ${req.user!.id} removed ${platform} link for title ${id}`);

    res.json({
        message: `${platform} link removed.`,
        links: existingLinks,
    });
}));

export default router;
