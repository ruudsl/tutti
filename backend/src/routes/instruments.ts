import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all instruments with aliases
router.get('/', authenticateToken, (req: AuthRequest, res: Response) => {
    try {
        const instruments = db.prepare(`
            SELECT id, name, tuning, clef, created_at
            FROM instruments
            ORDER BY name, tuning
        `).all();

        const result = instruments.map((instrument: any) => {
            const aliases = db.prepare(`
                SELECT id, alias
                FROM instrument_aliases
                WHERE instrument_id = ?
                ORDER BY alias
            `).all(instrument.id);

            return {
                id: instrument.id,
                name: instrument.name,
                tuning: instrument.tuning,
                clef: instrument.clef || 'sol',
                createdAt: instrument.created_at,
                aliases: aliases.map((a: any) => ({ id: a.id, name: a.alias })),
            };
        });

        res.json(result);
    } catch (error) {
        console.error('Get instruments error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Create new instrument (admin or music_committee)
router.post('/', authenticateToken, requireRole('admin', 'music_committee'), (req: AuthRequest, res: Response) => {
    try {
        const { name, tuning, clef, aliases } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Instrumentnaam is verplicht.' });
        }

        // Check if instrument with same name and tuning already exists
        const tuningValue = tuning || null;
        const existing = db.prepare(
            'SELECT id FROM instruments WHERE LOWER(name) = LOWER(?) AND (tuning = ? OR (tuning IS NULL AND ? IS NULL))'
        ).get(name, tuningValue, tuningValue);
        if (existing) {
            return res.status(400).json({ error: `Instrument "${name}" met stemming "${tuning || 'geen'}" bestaat al.` });
        }

        const instrumentId = uuidv4();
        db.prepare('INSERT INTO instruments (id, name, tuning, clef) VALUES (?, ?, ?, ?)').run(
            instrumentId,
            name,
            tuning || null,
            clef || 'sol'
        );

        // Add aliases
        if (aliases && Array.isArray(aliases)) {
            const insertAlias = db.prepare(
                'INSERT INTO instrument_aliases (id, instrument_id, alias) VALUES (?, ?, ?)'
            );
            for (const alias of aliases) {
                if (alias && alias.trim()) {
                    insertAlias.run(uuidv4(), instrumentId, alias.trim());
                }
            }
        }

        res.status(201).json({
            id: instrumentId,
            name,
            tuning,
            clef: clef || 'sol',
            message: 'Instrument succesvol aangemaakt.',
        });
    } catch (error) {
        console.error('Create instrument error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Update instrument (admin or music_committee)
router.put('/:id', authenticateToken, requireRole('admin', 'music_committee'), (req: AuthRequest, res: Response) => {
    try {
        const { name, tuning, clef } = req.body;

        const instrument = db.prepare('SELECT id FROM instruments WHERE id = ?').get(req.params.id);
        if (!instrument) {
            return res.status(404).json({ error: 'Instrument niet gevonden.' });
        }

        // Check name+tuning uniqueness if changed
        if (name) {
            const tuningValue = tuning || null;
            const existing = db.prepare(
                'SELECT id FROM instruments WHERE LOWER(name) = LOWER(?) AND (tuning = ? OR (tuning IS NULL AND ? IS NULL)) AND id != ?'
            ).get(name, tuningValue, tuningValue, req.params.id);
            if (existing) {
                return res.status(400).json({ error: `Instrument "${name}" met stemming "${tuning || 'geen'}" bestaat al.` });
            }
        }

        db.prepare('UPDATE instruments SET name = ?, tuning = ?, clef = ? WHERE id = ?').run(
            name,
            tuning || null,
            clef || 'sol',
            req.params.id
        );

        res.json({ message: 'Instrument succesvol bijgewerkt.' });
    } catch (error) {
        console.error('Update instrument error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Delete instrument (admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), (req: AuthRequest, res: Response) => {
    try {
        const result = db.prepare('DELETE FROM instruments WHERE id = ?').run(req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Instrument niet gevonden.' });
        }

        res.json({ message: 'Instrument succesvol verwijderd.' });
    } catch (error) {
        console.error('Delete instrument error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Add alias to instrument (admin or music_committee)
router.post('/:id/aliases', authenticateToken, requireRole('admin', 'music_committee'), (req: AuthRequest, res: Response) => {
    try {
        const { alias } = req.body;

        if (!alias || !alias.trim()) {
            return res.status(400).json({ error: 'Alias is verplicht.' });
        }

        const instrument = db.prepare('SELECT id FROM instruments WHERE id = ?').get(req.params.id);
        if (!instrument) {
            return res.status(404).json({ error: 'Instrument niet gevonden.' });
        }

        // Check if alias already exists for this instrument
        const existing = db.prepare(
            'SELECT id FROM instrument_aliases WHERE instrument_id = ? AND LOWER(alias) = LOWER(?)'
        ).get(req.params.id, alias.trim());

        if (existing) {
            return res.status(400).json({ error: 'Alias bestaat al voor dit instrument.' });
        }

        const aliasId = uuidv4();
        db.prepare('INSERT INTO instrument_aliases (id, instrument_id, alias) VALUES (?, ?, ?)').run(
            aliasId,
            req.params.id,
            alias.trim()
        );

        res.status(201).json({
            id: aliasId,
            alias: alias.trim(),
            message: 'Alias succesvol toegevoegd.',
        });
    } catch (error) {
        console.error('Add alias error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Delete alias (admin or music_committee)
router.delete('/:id/aliases/:aliasId', authenticateToken, requireRole('admin', 'music_committee'), (req: AuthRequest, res: Response) => {
    try {
        const result = db.prepare(
            'DELETE FROM instrument_aliases WHERE id = ? AND instrument_id = ?'
        ).run(req.params.aliasId, req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Alias niet gevonden.' });
        }

        res.json({ message: 'Alias succesvol verwijderd.' });
    } catch (error) {
        console.error('Delete alias error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Find instrument by name or alias
router.get('/find/:name', authenticateToken, (req: AuthRequest, res: Response) => {
    try {
        const searchName = req.params.name.toLowerCase();

        // First try exact match on instrument name
        let instrument = db.prepare(`
            SELECT id, name, tuning
            FROM instruments
            WHERE LOWER(name) = ?
        `).get(searchName) as any;

        // If not found, try alias
        if (!instrument) {
            const alias = db.prepare(`
                SELECT i.id, i.name, i.tuning
                FROM instruments i
                JOIN instrument_aliases ia ON i.id = ia.instrument_id
                WHERE LOWER(ia.alias) = ?
            `).get(searchName) as any;

            instrument = alias;
        }

        if (!instrument) {
            return res.status(404).json({ error: 'Instrument niet gevonden.' });
        }

        res.json({
            id: instrument.id,
            name: instrument.name,
            tuning: instrument.tuning,
        });
    } catch (error) {
        console.error('Find instrument error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

export default router;
