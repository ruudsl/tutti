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
            SELECT ml.id, ml.name, ml.position, ml.is_active, ml.created_at,
                   (SELECT COUNT(*) FROM music_list_pieces WHERE music_list_id = ml.id) as piece_count,
                   (SELECT COUNT(DISTINCT mp.title) FROM music_pieces mp
                    JOIN music_list_pieces mlp ON mp.id = mlp.music_piece_id
                    WHERE mlp.music_list_id = ml.id) as title_count,
                   (SELECT COALESCE(SUM(mt.duration_seconds), 0) FROM music_titles mt
                    WHERE EXISTS (
                        SELECT 1 FROM music_pieces mp
                        JOIN music_list_pieces mlp ON mp.id = mlp.music_piece_id
                        WHERE mlp.music_list_id = ml.id
                        AND mp.title = mt.title
                        AND COALESCE(mp.arranger, '') = COALESCE(mt.arranger, '')
                    )) as total_duration
            FROM music_lists ml
            WHERE ml.orchestra_id = ?
            ORDER BY ml.position, ml.name
        `).all(req.params.orchestraId);

        res.json(lists.map((l: any) => ({
            id: l.id,
            name: l.name,
            position: l.position,
            isActive: l.is_active === 1,
            createdAt: l.created_at,
            pieceCount: l.piece_count,
            titleCount: l.title_count,
            totalDuration: l.total_duration,
        })));
    } catch (error) {
        console.error('Get music lists error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Get all music lists user has access to (through orchestras)
router.get('/my-lists', authenticateToken, (req: AuthRequest, res: Response) => {
    try {
        // For regular members, only show active lists
        const isPrivileged = req.user!.role === 'admin' || req.user!.role === 'music_committee';
        const activeFilter = isPrivileged ? '' : 'AND ml.is_active = 1';

        const lists = db.prepare(`
            SELECT ml.id, ml.name, ml.position, ml.is_active, ml.created_at, o.name as orchestra_name, o.id as orchestra_id,
                   (SELECT COUNT(*) FROM music_list_pieces WHERE music_list_id = ml.id) as piece_count,
                   (SELECT COUNT(DISTINCT mp.title) FROM music_pieces mp
                    JOIN music_list_pieces mlp ON mp.id = mlp.music_piece_id
                    WHERE mlp.music_list_id = ml.id) as title_count,
                   (SELECT COALESCE(SUM(mt.duration_seconds), 0) FROM music_titles mt
                    WHERE EXISTS (
                        SELECT 1 FROM music_pieces mp
                        JOIN music_list_pieces mlp ON mp.id = mlp.music_piece_id
                        WHERE mlp.music_list_id = ml.id
                        AND mp.title = mt.title
                        AND COALESCE(mp.arranger, '') = COALESCE(mt.arranger, '')
                    )) as total_duration
            FROM music_lists ml
            JOIN orchestras o ON ml.orchestra_id = o.id
            JOIN user_orchestras uo ON o.id = uo.orchestra_id
            WHERE uo.user_id = ? ${activeFilter}
            ORDER BY o.name, ml.position, ml.name
        `).all(req.user!.id);

        res.json(lists.map((l: any) => ({
            id: l.id,
            name: l.name,
            position: l.position,
            isActive: l.is_active === 1,
            createdAt: l.created_at,
            orchestraId: l.orchestra_id,
            orchestraName: l.orchestra_name,
            pieceCount: l.piece_count,
            titleCount: l.title_count,
            totalDuration: l.total_duration,
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

        // Get next position
        const maxPos = db.prepare(
            'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM music_lists WHERE orchestra_id = ?'
        ).get(orchestraId) as { next_pos: number };

        const listId = uuidv4();
        db.prepare('INSERT INTO music_lists (id, name, orchestra_id, position) VALUES (?, ?, ?, ?)').run(
            listId,
            name.trim(),
            orchestraId,
            maxPos.next_pos
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

// Toggle list active status (admin or music_committee)
router.patch('/:id/toggle-active', authenticateToken, requireRole('admin', 'music_committee'), (req: AuthRequest, res: Response) => {
    try {
        const list = db.prepare(`
            SELECT ml.id, ml.is_active
            FROM music_lists ml
            JOIN orchestras o ON ml.orchestra_id = o.id
            WHERE ml.id = ? AND o.association_id = ?
        `).get(req.params.id, req.user!.associationId) as any;

        if (!list) {
            return res.status(404).json({ error: 'Muzieklijst niet gevonden.' });
        }

        const newStatus = list.is_active === 1 ? 0 : 1;
        db.prepare('UPDATE music_lists SET is_active = ? WHERE id = ?').run(newStatus, req.params.id);

        res.json({
            message: newStatus === 1 ? 'Lijst is nu actief.' : 'Lijst is nu inactief.',
            isActive: newStatus === 1,
        });
    } catch (error) {
        console.error('Toggle list active error:', error);
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

// Add all pieces of a title to list (admin or music_committee)
router.post('/:id/titles', authenticateToken, requireRole('admin', 'music_committee'), (req: AuthRequest, res: Response) => {
    try {
        const { title } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Titel is verplicht.' });
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

        // Get all pieces with this title
        const pieces = db.prepare(
            'SELECT id FROM music_pieces WHERE title = ? AND association_id = ?'
        ).all(title.trim(), req.user!.associationId) as { id: string }[];

        if (pieces.length === 0) {
            return res.status(404).json({ error: 'Geen muziekstukken gevonden met deze titel.' });
        }

        // Add all pieces to list (ignore if already exists)
        const insert = db.prepare(
            'INSERT OR IGNORE INTO music_list_pieces (music_list_id, music_piece_id) VALUES (?, ?)'
        );

        let added = 0;
        for (const piece of pieces) {
            const result = insert.run(req.params.id, piece.id);
            if (result.changes > 0) added++;
        }

        res.status(201).json({
            message: `${added} van ${pieces.length} partijen toegevoegd aan de lijst.`,
            added,
            total: pieces.length,
        });
    } catch (error) {
        console.error('Add title to list error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Remove all pieces of a title from list (admin or music_committee)
router.delete('/:id/titles/:title', authenticateToken, requireRole('admin', 'music_committee'), (req: AuthRequest, res: Response) => {
    try {
        const title = decodeURIComponent(req.params.title);

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

        // Get all pieces with this title
        const pieces = db.prepare(
            'SELECT id FROM music_pieces WHERE title = ? AND association_id = ?'
        ).all(title, req.user!.associationId) as { id: string }[];

        if (pieces.length === 0) {
            return res.status(404).json({ error: 'Geen muziekstukken gevonden met deze titel.' });
        }

        // Remove all pieces from list
        const remove = db.prepare(
            'DELETE FROM music_list_pieces WHERE music_list_id = ? AND music_piece_id = ?'
        );

        let removed = 0;
        for (const piece of pieces) {
            const result = remove.run(req.params.id, piece.id);
            if (result.changes > 0) removed++;
        }

        res.json({
            message: `${removed} partijen verwijderd van de lijst.`,
            removed,
        });
    } catch (error) {
        console.error('Remove title from list error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Update list positions (admin or music_committee)
router.put('/reorder', authenticateToken, requireRole('admin', 'music_committee'), (req: AuthRequest, res: Response) => {
    try {
        const { orchestraId, listIds } = req.body;

        if (!orchestraId || !listIds || !Array.isArray(listIds)) {
            return res.status(400).json({ error: 'Orkest ID en lijst IDs zijn verplicht.' });
        }

        // Verify orchestra belongs to user's association
        const orchestra = db.prepare(
            'SELECT id FROM orchestras WHERE id = ? AND association_id = ?'
        ).get(orchestraId, req.user!.associationId);

        if (!orchestra) {
            return res.status(404).json({ error: 'Orkest niet gevonden.' });
        }

        // Update positions
        const update = db.prepare('UPDATE music_lists SET position = ? WHERE id = ? AND orchestra_id = ?');

        for (let i = 0; i < listIds.length; i++) {
            update.run(i, listIds[i], orchestraId);
        }

        res.json({ message: 'Volgorde succesvol bijgewerkt.' });
    } catch (error) {
        console.error('Reorder lists error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

export default router;
