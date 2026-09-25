import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { cacheMiddleware, cacheInvalidator } from '../middleware/cache';
import { createGenreSchema, updateGenreSchema } from '../validation/schemas';
import {
  catalogusItem,
  isSuperbeheerder,
  toon,
  verberg,
  zichtbaarParams,
  zichtbaarVoorwaarde,
} from '../services/catalogus';

/**
 * Genres: een standaardlijst voor de hele installatie, plus eigen genres per
 * vereniging. Een vereniging kan standaardgenres verbergen. Zie
 * services/catalogus.ts.
 *
 * - Een eigen genre maken, wijzigen en (beheerder) verwijderen doet de
 *   vereniging zelf.
 * - Een standaardgenre wijzigen of verwijderen raakt elke vereniging, en dat
 *   doet alleen de superbeheerder. Een vereniging die er een anders wil,
 *   verbergt het en maakt een eigen.
 */

const router = Router();

// Cache path for invalidation
const CACHE_PATH = '/api/genres';

/** Het genre, als de vereniging het mag beheren; anders een 403 of 404. */
function beheerbaarGenre(req: AuthRequest, id: string) {
  const genre = catalogusItem('genre', id);
  if (!genre || (genre.association_id !== null && genre.association_id !== req.user!.associationId)) {
    throw new ApiError(404, 'Genre niet gevonden.');
  }
  if (genre.association_id === null && !isSuperbeheerder(req.user!.id)) {
    throw new ApiError(
      403,
      'Dit is een standaardgenre voor alle verenigingen. Verberg het en maak een eigen genre als je het anders wilt.',
    );
  }
  return genre;
}

/** Bestaat er voor deze vereniging al een zichtbaar genre met deze naam? */
function naamBezet(req: AuthRequest, naam: string, behalve?: string): boolean {
  const associationId = req.user!.associationId ?? null;
  return !!db
    .prepare(
      `SELECT 1 FROM genres g
       WHERE LOWER(g.name) = LOWER(?) AND g.id != ?
         AND ${associationId ? zichtbaarVoorwaarde('g') : 'g.association_id IS NULL'}`,
    )
    .get(naam, behalve ?? '', ...(associationId ? zichtbaarParams(associationId, 'genre') : []));
}

/**
 * GET /genres - de genres die deze vereniging ziet: standaard (niet
 * verborgen) en eigen. Met `?alles=true` ook de verborgen standaardgenres,
 * voor het beheerscherm.
 */
router.get(
  '/',
  authenticateToken,
  cacheMiddleware({ ttlSeconds: 300 }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId ?? '';
    const alles = req.query.alles === 'true';
    const genres = db
      .prepare(
        `SELECT g.id, g.name, g.created_at, g.association_id,
                EXISTS (SELECT 1 FROM catalogus_verborgen v
                        WHERE v.association_id = ? AND v.soort = 'genre' AND v.item_id = g.id) AS verborgen
         FROM genres g
         WHERE ${alles ? '(g.association_id IS NULL OR g.association_id = ?)' : zichtbaarVoorwaarde('g')}
         ORDER BY g.name`,
      )
      .all(associationId, ...(alles ? [associationId] : zichtbaarParams(associationId, 'genre'))) as {
      id: string;
      name: string;
      created_at: string;
      association_id: string | null;
      verborgen: number;
    }[];

    res.json(
      genres.map((g) => ({
        id: g.id,
        name: g.name,
        standaard: g.association_id === null,
        verborgen: !!g.verborgen,
        createdAt: g.created_at,
      })),
    );
  }),
);

/**
 * POST /genres - een eigen genre voor deze vereniging. Een superbeheerder
 * zonder vereniging maakt een standaardgenre.
 */
router.post(
  '/',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const naam = createGenreSchema.parse(req.body).name.trim();
    const associationId = req.user!.associationId ?? null;
    if (!associationId && !isSuperbeheerder(req.user!.id)) {
      throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    if (naamBezet(req, naam)) {
      throw new ApiError(409, `Genre "${naam}" bestaat al.`);
    }

    const genreId = uuidv4();
    db.prepare('INSERT INTO genres (id, name, association_id) VALUES (?, ?, ?)').run(genreId, naam, associationId);

    res.status(201).json({
      id: genreId,
      name: naam,
      standaard: associationId === null,
      message: 'Genre succesvol aangemaakt.',
    });
  }),
);

/** PUT /genres/:id - een eigen genre hernoemen (een standaardgenre: alleen de superbeheerder). */
router.put(
  '/:id',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const naam = updateGenreSchema.parse(req.body).name.trim();
    beheerbaarGenre(req, req.params.id);

    if (naamBezet(req, naam, req.params.id)) {
      throw new ApiError(409, `Genre "${naam}" bestaat al.`);
    }

    db.prepare('UPDATE genres SET name = ? WHERE id = ?').run(naam, req.params.id);

    res.json({ message: 'Genre succesvol bijgewerkt.' });
  }),
);

/**
 * DELETE /genres/:id - een eigen genre verwijderen. Het verdwijnt ook van de
 * titels van deze vereniging; andere verenigingen kunnen er niet aan hangen.
 * Een standaardgenre verwijdert alleen de superbeheerder.
 */
router.delete(
  '/:id',
  authenticateToken,
  requireRole('admin'),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const genre = beheerbaarGenre(req, req.params.id);

    db.prepare('DELETE FROM genres WHERE id = ?').run(genre.id);
    if (genre.association_id === null) {
      db.prepare("DELETE FROM catalogus_verborgen WHERE soort = 'genre' AND item_id = ?").run(genre.id);
    }

    res.json({ message: 'Genre succesvol verwijderd.' });
  }),
);

/** Een standaardgenre verbergen of weer tonen, voor deze vereniging. */
function zetVerborgen(verbergen: boolean) {
  return asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    const genre = catalogusItem('genre', req.params.id);
    if (!genre || genre.association_id !== null) {
      throw new ApiError(404, 'Standaardgenre niet gevonden.');
    }
    if (verbergen) verberg(associationId, 'genre', genre.id);
    else toon(associationId, 'genre', genre.id);
    res.json({ id: genre.id, verborgen: verbergen });
  });
}

router.post(
  '/:id/verbergen',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  cacheInvalidator(CACHE_PATH),
  zetVerborgen(true),
);
router.delete(
  '/:id/verbergen',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  cacheInvalidator(CACHE_PATH),
  zetVerborgen(false),
);

export default router;
