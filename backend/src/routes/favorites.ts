import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { addFavoriteSchema } from '../validation/schemas';
import logger from '../utils/logger';

const router = Router();

/**
 * @swagger
 * /favorites:
 *   get:
 *     summary: Get user's favorite music titles
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of favorite music titles
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const favorites = db
      .prepare(
        `
        SELECT mt.id, mt.title, mt.arranger, mt.youtube_url, mt.duration_seconds, mt.grade,
               uf.created_at as favorited_at,
               (SELECT COUNT(*) FROM music_pieces mp WHERE mp.title = mt.title AND COALESCE(mp.arranger, '') = COALESCE(mt.arranger, '') AND mp.association_id = ? AND mp.deleted_at IS NULL) as piece_count
        FROM user_favorites uf
        JOIN music_titles mt ON uf.music_title_id = mt.id
        -- Een zacht verwijderde titel bestaat voor de rest van de applicatie
        -- niet meer; de favoriet blijft in de tabel staan maar hoort hier niet
        -- meer op te duiken. Hetzelfde geldt voor het tellen van de
        -- bladmuziek: weggegooide partijen tellen niet mee.
        WHERE uf.user_id = ? AND mt.association_id = ? AND mt.deleted_at IS NULL
        ORDER BY uf.created_at DESC
    `,
      )
      .all(req.user!.associationId, req.user!.id, req.user!.associationId);

    res.json(
      favorites.map((f: any) => ({
        id: f.id,
        title: f.title,
        arranger: f.arranger,
        youtubeUrl: f.youtube_url,
        durationSeconds: f.duration_seconds,
        grade: f.grade,
        pieceCount: f.piece_count,
        favoritedAt: f.favorited_at,
      })),
    );
  }),
);

/**
 * @swagger
 * /favorites:
 *   post:
 *     summary: Add a music title to favorites
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - musicTitleId
 *             properties:
 *               musicTitleId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Added to favorites
 */
router.post(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = addFavoriteSchema.parse(req.body);

    // Check if title exists and belongs to user's association
    const title = db
      .prepare('SELECT id FROM music_titles WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(data.musicTitleId, req.user!.associationId);
    if (!title) {
      throw new ApiError(404, 'Titel niet gevonden.');
    }

    // Check if already favorited
    const existing = db
      .prepare('SELECT * FROM user_favorites WHERE user_id = ? AND music_title_id = ?')
      .get(req.user!.id, data.musicTitleId);

    if (existing) {
      throw new ApiError(409, 'Deze titel staat al in je favorieten.');
    }

    db.prepare('INSERT INTO user_favorites (user_id, music_title_id) VALUES (?, ?)').run(
      req.user!.id,
      data.musicTitleId,
    );

    logger.info(`User ${req.user!.id} added favorite: ${data.musicTitleId}`);

    res.status(201).json({ message: 'Toegevoegd aan favorieten.' });
  }),
);

/**
 * @swagger
 * /favorites/{musicTitleId}:
 *   delete:
 *     summary: Remove a music title from favorites
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: musicTitleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Removed from favorites
 */
router.delete(
  '/:musicTitleId',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db
      .prepare('DELETE FROM user_favorites WHERE user_id = ? AND music_title_id = ?')
      .run(req.user!.id, req.params.musicTitleId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Favoriet niet gevonden.');
    }

    logger.info(`User ${req.user!.id} removed favorite: ${req.params.musicTitleId}`);

    res.json({ message: 'Verwijderd uit favorieten.' });
  }),
);

/**
 * @swagger
 * /favorites/check/{musicTitleId}:
 *   get:
 *     summary: Check if a music title is favorited
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: musicTitleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Favorite status
 */
router.get(
  '/check/:musicTitleId',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Only return true if the title belongs to user's association
    const favorite = db
      .prepare(
        `
        SELECT uf.* FROM user_favorites uf
        JOIN music_titles mt ON uf.music_title_id = mt.id
        WHERE uf.user_id = ? AND uf.music_title_id = ? AND mt.association_id = ? AND mt.deleted_at IS NULL
    `,
      )
      .get(req.user!.id, req.params.musicTitleId, req.user!.associationId);

    res.json({ isFavorite: !!favorite });
  }),
);

export default router;
