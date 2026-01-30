import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all genres
router.get('/', authenticateToken, (req: AuthRequest, res: Response) => {
    try {
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
    } catch (error) {
        console.error('Get genres error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Create new genre (admin or music_committee)
router.post('/', authenticateToken, requireRole('admin', 'music_committee'), (req: AuthRequest, res: Response) => {
    try {
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Genre naam is verplicht.' });
        }

        // Check if genre already exists
        const existing = db.prepare('SELECT id FROM genres WHERE LOWER(name) = LOWER(?)').get(name.trim());
        if (existing) {
            return res.status(400).json({ error: `Genre "${name}" bestaat al.` });
        }

        const genreId = uuidv4();
        db.prepare('INSERT INTO genres (id, name) VALUES (?, ?)').run(genreId, name.trim());

        res.status(201).json({
            id: genreId,
            name: name.trim(),
            message: 'Genre succesvol aangemaakt.',
        });
    } catch (error) {
        console.error('Create genre error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Update genre (admin or music_committee)
router.put('/:id', authenticateToken, requireRole('admin', 'music_committee'), (req: AuthRequest, res: Response) => {
    try {
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Genre naam is verplicht.' });
        }

        const genre = db.prepare('SELECT id FROM genres WHERE id = ?').get(req.params.id);
        if (!genre) {
            return res.status(404).json({ error: 'Genre niet gevonden.' });
        }

        // Check uniqueness
        const existing = db.prepare('SELECT id FROM genres WHERE LOWER(name) = LOWER(?) AND id != ?').get(name.trim(), req.params.id);
        if (existing) {
            return res.status(400).json({ error: `Genre "${name}" bestaat al.` });
        }

        db.prepare('UPDATE genres SET name = ? WHERE id = ?').run(name.trim(), req.params.id);

        res.json({ message: 'Genre succesvol bijgewerkt.' });
    } catch (error) {
        console.error('Update genre error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Delete genre (admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), (req: AuthRequest, res: Response) => {
    try {
        const result = db.prepare('DELETE FROM genres WHERE id = ?').run(req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Genre niet gevonden.' });
        }

        res.json({ message: 'Genre succesvol verwijderd.' });
    } catch (error) {
        console.error('Delete genre error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

export default router;
