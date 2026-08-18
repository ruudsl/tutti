import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { cacheMiddleware, cacheInvalidator } from '../middleware/cache';
import { createGenreSchema, updateGenreSchema } from '../validation/schemas';

const router = Router();

// Cache path for invalidation
const CACHE_PATH = '/api/genres';

/**
 * @swagger
 * /genres:
 *   get:
 *     summary: Get all genres
 *     tags: [Genres]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of genres
 */
router.get(
  '/',
  authenticateToken,
  cacheMiddleware({ ttlSeconds: 300 }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const genres = db
      .prepare(
        `
        SELECT id, name, created_at
        FROM genres
        ORDER BY name
    `,
      )
      .all();

    res.json(
      genres.map((g: any) => ({
        id: g.id,
        name: g.name,
        createdAt: g.created_at,
      })),
    );
  }),
);

/**
 * @swagger
 * /genres:
 *   post:
 *     summary: Create a new genre
 *     tags: [Genres]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Genre created
 *       409:
 *         description: Genre already exists
 */
router.post(
  '/',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name } = createGenreSchema.parse(req.body);

    // Check if genre already exists
    const existing = db.prepare('SELECT id FROM genres WHERE LOWER(name) = LOWER(?)').get(name.trim());
    if (existing) {
      throw new ApiError(409, `Genre "${name}" bestaat al.`);
    }

    const genreId = uuidv4();
    db.prepare('INSERT INTO genres (id, name) VALUES (?, ?)').run(genreId, name.trim());

    res.status(201).json({
      id: genreId,
      name: name.trim(),
      message: 'Genre succesvol aangemaakt.',
    });
  }),
);

/**
 * @swagger
 * /genres/{id}:
 *   put:
 *     summary: Update a genre
 *     tags: [Genres]
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
 *         description: Genre updated
 *       404:
 *         description: Genre not found
 */
router.put(
  '/:id',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name } = updateGenreSchema.parse(req.body);

    const genre = db.prepare('SELECT id FROM genres WHERE id = ?').get(req.params.id);
    if (!genre) {
      throw new ApiError(404, 'Genre niet gevonden.');
    }

    // Check uniqueness
    const existing = db
      .prepare('SELECT id FROM genres WHERE LOWER(name) = LOWER(?) AND id != ?')
      .get(name.trim(), req.params.id);
    if (existing) {
      throw new ApiError(409, `Genre "${name}" bestaat al.`);
    }

    db.prepare('UPDATE genres SET name = ? WHERE id = ?').run(name.trim(), req.params.id);

    res.json({ message: 'Genre succesvol bijgewerkt.' });
  }),
);

/**
 * @swagger
 * /genres/{id}:
 *   delete:
 *     summary: Delete a genre
 *     tags: [Genres]
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
 *         description: Genre deleted
 *       404:
 *         description: Genre not found
 */
router.delete(
  '/:id',
  authenticateToken,
  requireRole('admin'),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare('DELETE FROM genres WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      throw new ApiError(404, 'Genre niet gevonden.');
    }

    res.json({ message: 'Genre succesvol verwijderd.' });
  }),
);

export default router;
