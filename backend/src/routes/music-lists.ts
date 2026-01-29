import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all music lists for an orchestra
router.get('/orchestra/:orchestraId', authenticateToken, (req: AuthRequest, res: Response) => {
    try {
        // Verify orchestra belongs to user's association
        const orchestra = db.prepare(
            'SELECT id FROM orchestras WHERE id = ? AND association_id = ?'
        ).get(req.params.orchestraId, req.user!.associationId);

        if (!orchestra) {
            return res.status(404).json({ error: 'Orkest niet gevonden.' });
        }

        const lists = db.prepare(`
            SELECT ml.id, ml.name, ml.created_at,
                   (SELECT COUNT(*) FROM music_list_pieces WHERE music_list_id = ml.id) as piece_count
            FROM music_lists ml
            WHERE ml.orchestra_id = ?
            ORDER BY ml.name
        `).all(req.params.orchestraId);

        res.json(lists.map((l: any) => ({
            id: l.id,
            name: l.name,
            createdAt: l.created_at,
            pieceCount: l.piece_count,
        })));
    } catch (error) {
        console.error('Get music lists error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Get all music lists user has access to (through orchestras)
router.get('/my-lists', authenticateToken, (req: AuthRequest, res: Response) => {
    try {
        const lists = db.prepare(`
            SELECT ml.id, ml.name, ml.created_at, o.name as orchestra_name, o.id as orchestra_id,
                   (SELECT COUNT(*) FROM music_list_pieces WHERE music_list_id = ml.id) as piece_count
            FROM music_lists ml
            JOIN orchestras o ON ml.orchestra_id = o.id
            JOIN user_orchestras uo ON o.id = uo.orchestra_id
            WHERE uo.user_id = ?
            ORDER BY o.name, ml.name
        `).all(req.user!.id);

        res.json(lists.map((l: any) => ({
            id: l.id,
            name: l.name,
            createdAt: l.created_at,
            orchestraId: l.orchestra_id,
            orchestraName: l.orchestra_name,
            pieceCount: l.piece_count,
        })));
    } catch (error) {
        console.error('Get my lists error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Get single music list with pieces
router.get('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
    try {
        const list = db.prepare(`
            SELECT ml.id, ml.name, ml.created_at, ml.orchestra_id, o.name as orchestra_name
            FROM music_lists ml
            JOIN orchestras o ON ml.orchestra_id = o.id
            WHERE ml.id = ? AND o.association_id = ?
        `).get(req.params.id, req.user!.associationId) as any;

        if (!list) {
            return res.status(404).json({ error: 'Muzieklijst niet gevonden.' });
        }

        // Get user's instruments for filtering
        const userInstruments = db.prepare(`
            SELECT instrument_id FROM user_instruments WHERE user_id = ?
        `).all(req.user!.id) as { instrument_id: string }[];

        const instrumentIds = userInstruments.map(i => i.instrument_id);

        // Get pieces in this list, filtered by user's instruments for regular members
        let pieces: any[];
        if (req.user!.role === 'admin' || req.user!.role === 'music_committee') {
            // Admins and music committee see all pieces
            pieces = db.prepare(`
                SELECT mp.id, mp.title, mp.arranger, mp.tuning, mp.group_number, mp.clef,
                       mp.youtube_url, mp.original_filename, mp.created_at,
                       i.id as instrument_id, i.name as instrument_name
                FROM music_pieces mp
                JOIN music_list_pieces mlp ON mp.id = mlp.music_piece_id
                LEFT JOIN instruments i ON mp.instrument_id = i.id
                WHERE mlp.music_list_id = ?
                ORDER BY mp.title, i.name, mp.group_number
            `).all(req.params.id);
        } else {
            // Regular members only see pieces for their instruments
            if (instrumentIds.length === 0) {
                pieces = [];
            } else {
                const placeholders = instrumentIds.map(() => '?').join(',');
                pieces = db.prepare(`
                    SELECT mp.id, mp.title, mp.arranger, mp.tuning, mp.group_number, mp.clef,
                           mp.youtube_url, mp.original_filename, mp.created_at,
                           i.id as instrument_id, i.name as instrument_name
                    FROM music_pieces mp
                    JOIN music_list_pieces mlp ON mp.id = mlp.music_piece_id
                    LEFT JOIN instruments i ON mp.instrument_id = i.id
                    WHERE mlp.music_list_id = ? AND mp.instrument_id IN (${placeholders})
                    ORDER BY mp.title, i.name, mp.group_number
                `).all(req.params.id, ...instrumentIds);
            }
        }

        res.json({
            id: list.id,
            name: list.name,
            createdAt: list.created_at,
            orchestraId: list.orchestra_id,
            orchestraName: list.orchestra_name,
            pieces: pieces.map((p: any) => ({
                id: p.id,
                title: p.title,
                arranger: p.arranger,
                tuning: p.tuning,
                groupNumber: p.group_number,
                clef: p.clef,
                youtubeUrl: p.youtube_url,
                originalFilename: p.original_filename,
                createdAt: p.created_at,
                instrumentId: p.instrument_id,
                instrumentName: p.instrument_name,
            })),
        });
    } catch (error) {
        console.error('Get music list error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Create music list (admin or music_committee)
router.post('/', authenticateToken, requireRole('admin', 'music_committee'), (req: AuthRequest, res: Response) => {
    try {
        const { name, orchestraId } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Lijstnaam is verplicht.' });
        }

        if (!orchestraId) {
            return res.status(400).json({ error: 'Orkest is verplicht.' });
        }

        // Verify orchestra belongs to user's association
        const orchestra = db.prepare(
            'SELECT id FROM orchestras WHERE id = ? AND association_id = ?'
        ).get(orchestraId, req.user!.associationId);

        if (!orchestra) {
            return res.status(404).json({ error: 'Orkest niet gevonden.' });
        }

        // Check if list name already exists for this orchestra
        const existing = db.prepare(
            'SELECT id FROM music_lists WHERE LOWER(name) = LOWER(?) AND orchestra_id = ?'
        ).get(name.trim(), orchestraId);

        if (existing) {
            return res.status(400).json({ error: 'Muzieklijst met deze naam bestaat al voor dit orkest.' });
        }

        const listId = uuidv4();
        db.prepare('INSERT INTO music_lists (id, name, orchestra_id) VALUES (?, ?, ?)').run(
            listId,
            name.trim(),
            orchestraId
        );

        res.status(201).json({
            id: listId,
            name: name.trim(),
            orchestraId,
            message: 'Muzieklijst succesvol aangemaakt.',
        });
    } catch (error) {
        console.error('Create music list error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Update music list (admin or music_committee)
router.put('/:id', authenticateToken, requireRole('admin', 'music_committee'), (req: AuthRequest, res: Response) => {
    try {
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Lijstnaam is verplicht.' });
        }

        const list = db.prepare(`
            SELECT ml.id, ml.orchestra_id
            FROM music_lists ml
            JOIN orchestras o ON ml.orchestra_id = o.id
            WHERE ml.id = ? AND o.association_id = ?
        `).get(req.params.id, req.user!.associationId) as any;

        if (!list) {
            return res.status(404).json({ error: 'Muzieklijst niet gevonden.' });
        }

        // Check name uniqueness
        const existing = db.prepare(
            'SELECT id FROM music_lists WHERE LOWER(name) = LOWER(?) AND orchestra_id = ? AND id != ?'
        ).get(name.trim(), list.orchestra_id, req.params.id);

        if (existing) {
            return res.status(400).json({ error: 'Muzieklijst met deze naam bestaat al voor dit orkest.' });
        }

        db.prepare('UPDATE music_lists SET name = ? WHERE id = ?').run(name.trim(), req.params.id);

        res.json({ message: 'Muzieklijst succesvol bijgewerkt.' });
    } catch (error) {
        console.error('Update music list error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Delete music list (admin or music_committee)
router.delete('/:id', authenticateToken, requireRole('admin', 'music_committee'), (req: AuthRequest, res: Response) => {
    try {
        const list = db.prepare(`
            SELECT ml.id
            FROM music_lists ml
            JOIN orchestras o ON ml.orchestra_id = o.id
            WHERE ml.id = ? AND o.association_id = ?
        `).get(req.params.id, req.user!.associationId);

        if (!list) {
            return res.status(404).json({ error: 'Muzieklijst niet gevonden.' });
        }

        db.prepare('DELETE FROM music_lists WHERE id = ?').run(req.params.id);

        res.json({ message: 'Muzieklijst succesvol verwijderd.' });
    } catch (error) {
        console.error('Delete music list error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Add piece to list (admin or music_committee)
router.post('/:id/pieces', authenticateToken, requireRole('admin', 'music_committee'), (req: AuthRequest, res: Response) => {
    try {
        const { pieceId } = req.body;

        if (!pieceId) {
            return res.status(400).json({ error: 'Muziekstuk ID is verplicht.' });
        }

        // Verify list belongs to user's association
        const list = db.prepare(`
            SELECT ml.id
            FROM music_lists ml
            JOIN orchestras o ON ml.orchestra_id = o.id
            WHERE ml.id = ? AND o.association_id = ?
        `).get(req.params.id, req.user!.associationId);

        if (!list) {
            return res.status(404).json({ error: 'Muzieklijst niet gevonden.' });
        }

        // Verify piece exists and belongs to same association
        const piece = db.prepare(
            'SELECT id FROM music_pieces WHERE id = ? AND association_id = ?'
        ).get(pieceId, req.user!.associationId);

        if (!piece) {
            return res.status(404).json({ error: 'Muziekstuk niet gevonden.' });
        }

        // Check if already in list
        const existing = db.prepare(
            'SELECT * FROM music_list_pieces WHERE music_list_id = ? AND music_piece_id = ?'
        ).get(req.params.id, pieceId);

        if (existing) {
            return res.status(400).json({ error: 'Muziekstuk staat al op deze lijst.' });
        }

        db.prepare(
            'INSERT INTO music_list_pieces (music_list_id, music_piece_id) VALUES (?, ?)'
        ).run(req.params.id, pieceId);

        res.status(201).json({ message: 'Muziekstuk succesvol toegevoegd aan lijst.' });
    } catch (error) {
        console.error('Add piece to list error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Remove piece from list (admin or music_committee)
router.delete('/:id/pieces/:pieceId', authenticateToken, requireRole('admin', 'music_committee'), (req: AuthRequest, res: Response) => {
    try {
        // Verify list belongs to user's association
        const list = db.prepare(`
            SELECT ml.id
            FROM music_lists ml
            JOIN orchestras o ON ml.orchestra_id = o.id
            WHERE ml.id = ? AND o.association_id = ?
        `).get(req.params.id, req.user!.associationId);

        if (!list) {
            return res.status(404).json({ error: 'Muzieklijst niet gevonden.' });
        }

        const result = db.prepare(
            'DELETE FROM music_list_pieces WHERE music_list_id = ? AND music_piece_id = ?'
        ).run(req.params.id, req.params.pieceId);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Muziekstuk niet gevonden op deze lijst.' });
        }

        res.json({ message: 'Muziekstuk succesvol verwijderd van lijst.' });
    } catch (error) {
        console.error('Remove piece from list error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

export default router;
