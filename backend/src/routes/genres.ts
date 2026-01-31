import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { createGenreSchema, updateGenreSchema } from '../validation/schemas';

const router = Router();

// Get all genres
router.get('/', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const genres = db.prepare(`
        SELECT id, name, created_at
        FROM genres
        ORDER BY name
    `).all();

    res.json(genres.map((g: any) => ({
        id: g.id,
        name: g.name,
        createdAt: g.created_at,
    })));
}));

// Create new genre (admin or music_committee)
router.post('/', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
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
}));

// Update genre (admin or music_committee)
router.put('/:id', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name } = updateGenreSchema.parse(req.body);

    const genre = db.prepare('SELECT id FROM genres WHERE id = ?').get(req.params.id);
    if (!genre) {
        throw new ApiError(404, 'Genre niet gevonden.');
    }

    // Check uniqueness
    const existing = db.prepare('SELECT id FROM genres WHERE LOWER(name) = LOWER(?) AND id != ?').get(name.trim(), req.params.id);
    if (existing) {
        throw new ApiError(409, `Genre "${name}" bestaat al.`);
    }

    db.prepare('UPDATE genres SET name = ? WHERE id = ?').run(name.trim(), req.params.id);

    res.json({ message: 'Genre succesvol bijgewerkt.' });
}));

// Delete genre (admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare('DELETE FROM genres WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
        throw new ApiError(404, 'Genre niet gevonden.');
    }

    res.json({ message: 'Genre succesvol verwijderd.' });
}));

export default router;
