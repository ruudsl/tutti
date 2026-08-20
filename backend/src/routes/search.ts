import { Router, Response } from 'express';
import db from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import logger from '../utils/logger';

const router = Router();

interface SearchResult {
  id: string;
  type: 'music' | 'member' | 'orchestra' | 'list' | 'rehearsal' | 'settings';
  title: string;
  subtitle?: string;
  path: string;
  icon: string;
  metadata?: Record<string, unknown>;
}

interface RecentSearch {
  id: string;
  query: string;
  timestamp: string;
}

/**
 * @swagger
 * /search:
 *   get:
 *     summary: Unified search across all entities
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [music, member, orchestra, list, rehearsal, settings]
 *         description: Filter by result type
 *       - in: query
 *         name: orchestraId
 *         schema:
 *           type: string
 *         description: Filter by orchestra
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Maximum results per category
 *     responses:
 *       200:
 *         description: Search results grouped by category
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const query = ((req.query.q as string) || '').trim().toLowerCase();
    const typeFilter = req.query.type as string | undefined;
    const orchestraId = req.query.orchestraId as string | undefined;
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const associationId = req.user!.associationId;

    if (!query || query.length < 2) {
      return res.json({ results: [], total: 0 });
    }

    const results: SearchResult[] = [];
    const searchTerm = `%${query}%`;

    // Search music titles
    if (!typeFilter || typeFilter === 'music') {
      const musicResults = db
        .prepare(
          `
      SELECT mt.id, mt.title, mt.arranger, mt.youtube_url,
             GROUP_CONCAT(DISTINCT i.name) as instruments
      FROM music_titles mt
      LEFT JOIN music_pieces mp ON mp.title = mt.title AND mp.arranger IS mt.arranger
        AND mp.association_id = mt.association_id AND mp.deleted_at IS NULL
      LEFT JOIN instruments i ON mp.instrument_id = i.id
      WHERE mt.association_id = ?
        AND mt.deleted_at IS NULL
        AND (LOWER(mt.title) LIKE ? OR LOWER(mt.arranger) LIKE ?)
      GROUP BY mt.id
      LIMIT ?
    `,
        )
        .all(associationId, searchTerm, searchTerm, limit) as {
        id: string;
        title: string;
        arranger: string | null;
        youtube_url: string | null;
        instruments: string | null;
      }[];

      for (const music of musicResults) {
        results.push({
          id: music.id,
          type: 'music',
          title: music.title,
          subtitle: music.arranger || undefined,
          path: `/titles?search=${encodeURIComponent(music.title)}`,
          icon: 'music',
          metadata: {
            hasYoutube: !!music.youtube_url,
            instruments: music.instruments?.split(',') || [],
          },
        });
      }
    }

    // Search members
    if (!typeFilter || typeFilter === 'member') {
      const memberResults = db
        .prepare(
          `
      SELECT u.id, u.first_name, u.last_name, u.email, u.role,
             GROUP_CONCAT(DISTINCT i.name) as instruments,
             GROUP_CONCAT(DISTINCT o.name) as orchestras
      FROM users u
      LEFT JOIN user_instruments ui ON u.id = ui.user_id
      LEFT JOIN instruments i ON ui.instrument_id = i.id
      LEFT JOIN user_orchestras uo ON u.id = uo.user_id
      LEFT JOIN orchestras o ON uo.orchestra_id = o.id
      WHERE u.association_id = ?
        AND u.deleted_at IS NULL
        AND (LOWER(u.first_name) LIKE ? OR LOWER(u.last_name) LIKE ? OR LOWER(u.email) LIKE ?)
      GROUP BY u.id
      LIMIT ?
    `,
        )
        .all(associationId, searchTerm, searchTerm, searchTerm, limit) as {
        id: string;
        first_name: string;
        last_name: string;
        email: string;
        role: string;
        instruments: string | null;
        orchestras: string | null;
      }[];

      for (const member of memberResults) {
        results.push({
          id: member.id,
          type: 'member',
          title: `${member.first_name} ${member.last_name}`,
          subtitle: member.instruments || member.role,
          path: `/members?search=${encodeURIComponent(member.first_name + ' ' + member.last_name)}`,
          icon: 'user',
          metadata: {
            email: member.email,
            role: member.role,
            orchestras: member.orchestras?.split(',') || [],
          },
        });
      }
    }

    // Search orchestras
    if (!typeFilter || typeFilter === 'orchestra') {
      const orchestraResults = db
        .prepare(
          `
      SELECT o.id, o.name,
             (SELECT COUNT(*) FROM user_orchestras WHERE orchestra_id = o.id) as member_count,
             (SELECT COUNT(*) FROM music_lists WHERE orchestra_id = o.id) as list_count
      FROM orchestras o
      WHERE o.association_id = ?
        AND LOWER(o.name) LIKE ?
      LIMIT ?
    `,
        )
        .all(associationId, searchTerm, limit) as {
        id: string;
        name: string;
        member_count: number;
        list_count: number;
      }[];

      for (const orchestra of orchestraResults) {
        results.push({
          id: orchestra.id,
          type: 'orchestra',
          title: orchestra.name,
          subtitle: `${orchestra.member_count} leden, ${orchestra.list_count} lijsten`,
          path: `/orchestras`,
          icon: 'orchestra',
          metadata: {
            memberCount: orchestra.member_count,
            listCount: orchestra.list_count,
          },
        });
      }
    }

    // Search music lists
    if (!typeFilter || typeFilter === 'list') {
      let listQuery = `
      SELECT ml.id, ml.name, ml.is_active, o.name as orchestra_name,
             (SELECT COUNT(*) FROM music_list_pieces WHERE music_list_id = ml.id) as piece_count
      FROM music_lists ml
      JOIN orchestras o ON ml.orchestra_id = o.id
      WHERE o.association_id = ?
        AND ml.deleted_at IS NULL
        AND LOWER(ml.name) LIKE ?
    `;
      const listParams: (string | number)[] = [associationId!, searchTerm];

      if (orchestraId) {
        listQuery += ' AND ml.orchestra_id = ?';
        listParams.push(orchestraId);
      }

      listQuery += ' LIMIT ?';
      listParams.push(limit);

      const listResults = db.prepare(listQuery).all(...listParams) as {
        id: string;
        name: string;
        is_active: boolean;
        orchestra_name: string;
        piece_count: number;
      }[];

      for (const list of listResults) {
        results.push({
          id: list.id,
          type: 'list',
          title: list.name,
          subtitle: `${list.orchestra_name} - ${list.piece_count} stukken`,
          path: `/lists/${list.id}`,
          icon: 'list',
          metadata: {
            orchestraName: list.orchestra_name,
            pieceCount: list.piece_count,
            isActive: list.is_active,
          },
        });
      }
    }

    // Search rehearsals
    if (!typeFilter || typeFilter === 'rehearsal') {
      const rehearsalResults = db
        .prepare(
          `
      SELECT r.id, r.date, r.start_time, r.end_time, r.location, r.type, r.notes,
             o.name as orchestra_name
      FROM rehearsals r
      LEFT JOIN orchestras o ON r.orchestra_id = o.id
      WHERE r.association_id = ?
        AND (LOWER(r.location) LIKE ? OR LOWER(r.notes) LIKE ? OR r.date LIKE ?)
        AND r.date >= date('now')
      ORDER BY r.date ASC
      LIMIT ?
    `,
        )
        .all(associationId, searchTerm, searchTerm, searchTerm, limit) as {
        id: string;
        date: string;
        start_time: string;
        end_time: string;
        location: string | null;
        type: string;
        notes: string | null;
        orchestra_name: string | null;
      }[];

      for (const rehearsal of rehearsalResults) {
        results.push({
          id: rehearsal.id,
          type: 'rehearsal',
          title: `${rehearsal.date} ${rehearsal.start_time}`,
          subtitle: rehearsal.location || rehearsal.orchestra_name || undefined,
          path: `/rehearsals`,
          icon: 'calendar',
          metadata: {
            date: rehearsal.date,
            startTime: rehearsal.start_time,
            endTime: rehearsal.end_time,
            type: rehearsal.type,
          },
        });
      }
    }

    // Add settings shortcuts if query matches
    if (!typeFilter || typeFilter === 'settings') {
      const settingsItems = [
        { id: 'profile', title: 'Profiel', path: '/profile', keywords: ['profiel', 'account', 'gegevens', 'profile'] },
        {
          id: 'settings',
          title: 'Instellingen',
          path: '/settings',
          keywords: ['instellingen', 'settings', 'configuratie'],
        },
        {
          id: 'theme',
          title: 'Thema',
          path: '/theme',
          keywords: ['thema', 'kleuren', 'theme', 'donker', 'licht', 'dark', 'light'],
        },
        {
          id: 'upload',
          title: 'Muziek uploaden',
          path: '/upload',
          keywords: ['upload', 'uploaden', 'nieuw', 'toevoegen'],
        },
        { id: 'tools', title: 'Tools', path: '/tools', keywords: ['tools', 'metronoom', 'stemmer', 'tuner'] },
      ];

      for (const item of settingsItems) {
        if (item.keywords.some((kw) => kw.includes(query) || query.includes(kw))) {
          results.push({
            id: item.id,
            type: 'settings',
            title: item.title,
            path: item.path,
            icon: 'settings',
          });
        }
      }
    }

    logger.debug(`Search for "${query}" returned ${results.length} results`, { userId: req.user!.id });

    res.json({
      results,
      total: results.length,
      query,
    });
  }),
);

/**
 * @swagger
 * /search/suggestions:
 *   get:
 *     summary: Get autocomplete suggestions
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Partial search query
 *     responses:
 *       200:
 *         description: Autocomplete suggestions
 */
router.get(
  '/suggestions',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const query = ((req.query.q as string) || '').trim().toLowerCase();
    const associationId = req.user!.associationId;

    if (!query || query.length < 2) {
      return res.json({ suggestions: [] });
    }

    const searchTerm = `${query}%`;
    const suggestions: string[] = [];

    // Get music title suggestions
    const musicSuggestions = db
      .prepare(
        `
    SELECT DISTINCT title FROM music_titles
    WHERE association_id = ? AND deleted_at IS NULL AND LOWER(title) LIKE ?
    LIMIT 5
  `,
      )
      .all(associationId, searchTerm) as { title: string }[];

    suggestions.push(...musicSuggestions.map((m) => m.title));

    // Get member name suggestions
    const memberSuggestions = db
      .prepare(
        `
    SELECT first_name || ' ' || last_name as name FROM users
    WHERE association_id = ? AND deleted_at IS NULL
      AND (LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ?)
    LIMIT 5
  `,
      )
      .all(associationId, searchTerm, searchTerm) as { name: string }[];

    suggestions.push(...memberSuggestions.map((m) => m.name));

    // Deduplicate and limit
    const uniqueSuggestions = [...new Set(suggestions)].slice(0, 10);

    res.json({ suggestions: uniqueSuggestions });
  }),
);

/**
 * @swagger
 * /search/recent:
 *   get:
 *     summary: Get recent searches for current user
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Recent searches
 */
router.get(
  '/recent',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;

    const recentSearches = db
      .prepare(
        `
    SELECT id, query, created_at as timestamp
    FROM user_recent_searches
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 10
  `,
      )
      .all(userId) as RecentSearch[];

    res.json({ searches: recentSearches });
  }),
);

/**
 * @swagger
 * /search/recent:
 *   post:
 *     summary: Save a search to recent searches
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *     responses:
 *       201:
 *         description: Search saved
 */
router.post(
  '/recent',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { query } = req.body;
    const userId = req.user!.id;

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const trimmedQuery = query.trim();

    // Remove duplicate if exists
    db.prepare('DELETE FROM user_recent_searches WHERE user_id = ? AND LOWER(query) = LOWER(?)').run(
      userId,
      trimmedQuery,
    );

    // Insert new search
    const id = `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    db.prepare('INSERT INTO user_recent_searches (id, user_id, query) VALUES (?, ?, ?)').run(id, userId, trimmedQuery);

    // Keep only last 20 searches
    db.prepare(
      `
    DELETE FROM user_recent_searches
    WHERE user_id = ? AND id NOT IN (
      SELECT id FROM user_recent_searches WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
    )
  `,
    ).run(userId, userId);

    res.status(201).json({ id, query: trimmedQuery });
  }),
);

/**
 * @swagger
 * /search/recent/{id}:
 *   delete:
 *     summary: Delete a recent search
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Search deleted
 */
router.delete(
  '/recent/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    db.prepare('DELETE FROM user_recent_searches WHERE id = ? AND user_id = ?').run(id, userId);

    res.json({ message: 'Deleted' });
  }),
);

/**
 * @swagger
 * /search/recent:
 *   delete:
 *     summary: Clear all recent searches
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All searches cleared
 */
router.delete(
  '/recent',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;

    db.prepare('DELETE FROM user_recent_searches WHERE user_id = ?').run(userId);

    res.json({ message: 'Cleared' });
  }),
);

export default router;
