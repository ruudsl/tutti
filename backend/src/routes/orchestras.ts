import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all orchestras for current association
router.get('/', authenticateToken, (req: AuthRequest, res: Response) => {
    try {
        const orchestras = db.prepare(`
            SELECT o.id, o.name, o.created_at,
                   (SELECT COUNT(*) FROM user_orchestras WHERE orchestra_id = o.id) as member_count,
                   (SELECT COUNT(*) FROM music_lists WHERE orchestra_id = o.id) as list_count
            FROM orchestras o
            WHERE o.association_id = ?
            ORDER BY o.name
        `).all(req.user!.associationId);

        res.json(orchestras.map((o: any) => ({
            id: o.id,
            name: o.name,
            createdAt: o.created_at,
            memberCount: o.member_count,
            listCount: o.list_count,
        })));
    } catch (error) {
        console.error('Get orchestras error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Get single orchestra with members
router.get('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
    try {
        const orchestra = db.prepare(`
            SELECT id, name, created_at
            FROM orchestras
            WHERE id = ? AND association_id = ?
        `).get(req.params.id, req.user!.associationId) as any;

        if (!orchestra) {
            return res.status(404).json({ error: 'Orkest niet gevonden.' });
        }

        // Get members
        const members = db.prepare(`
            SELECT u.id, u.first_name, u.last_name, u.email
            FROM users u
            JOIN user_orchestras uo ON u.id = uo.user_id
            WHERE uo.orchestra_id = ?
            ORDER BY u.last_name, u.first_name
        `).all(req.params.id);

        // Get music lists
        const lists = db.prepare(`
            SELECT ml.id, ml.name, ml.created_at,
                   (SELECT COUNT(*) FROM music_list_pieces WHERE music_list_id = ml.id) as piece_count
            FROM music_lists ml
            WHERE ml.orchestra_id = ?
            ORDER BY ml.name
        `).all(req.params.id);

        res.json({
            id: orchestra.id,
            name: orchestra.name,
            createdAt: orchestra.created_at,
            members: members.map((m: any) => ({
                id: m.id,
                firstName: m.first_name,
                lastName: m.last_name,
                email: m.email,
            })),
            lists: lists.map((l: any) => ({
                id: l.id,
                name: l.name,
                createdAt: l.created_at,
                pieceCount: l.piece_count,
            })),
        });
    } catch (error) {
        console.error('Get orchestra error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Create orchestra (admin only)
router.post('/', authenticateToken, requireRole('admin'), (req: AuthRequest, res: Response) => {
    try {
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Orkestnaam is verplicht.' });
        }

        // Check if orchestra name already exists in this association
        const existing = db.prepare(
            'SELECT id FROM orchestras WHERE LOWER(name) = LOWER(?) AND association_id = ?'
        ).get(name.trim(), req.user!.associationId);

        if (existing) {
            return res.status(400).json({ error: 'Orkest met deze naam bestaat al.' });
        }

        const orchestraId = uuidv4();
        db.prepare('INSERT INTO orchestras (id, name, association_id) VALUES (?, ?, ?)').run(
            orchestraId,
            name.trim(),
            req.user!.associationId
        );

        res.status(201).json({
            id: orchestraId,
            name: name.trim(),
            message: 'Orkest succesvol aangemaakt.',
        });
    } catch (error) {
        console.error('Create orchestra error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Update orchestra (admin only)
router.put('/:id', authenticateToken, requireRole('admin'), (req: AuthRequest, res: Response) => {
    try {
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Orkestnaam is verplicht.' });
        }

        const orchestra = db.prepare(
            'SELECT id FROM orchestras WHERE id = ? AND association_id = ?'
        ).get(req.params.id, req.user!.associationId);

        if (!orchestra) {
            return res.status(404).json({ error: 'Orkest niet gevonden.' });
        }

        // Check name uniqueness
        const existing = db.prepare(
            'SELECT id FROM orchestras WHERE LOWER(name) = LOWER(?) AND association_id = ? AND id != ?'
        ).get(name.trim(), req.user!.associationId, req.params.id);

        if (existing) {
            return res.status(400).json({ error: 'Orkest met deze naam bestaat al.' });
        }

        db.prepare('UPDATE orchestras SET name = ? WHERE id = ?').run(name.trim(), req.params.id);

        res.json({ message: 'Orkest succesvol bijgewerkt.' });
    } catch (error) {
        console.error('Update orchestra error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Delete orchestra (admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), (req: AuthRequest, res: Response) => {
    try {
        const result = db.prepare(
            'DELETE FROM orchestras WHERE id = ? AND association_id = ?'
        ).run(req.params.id, req.user!.associationId);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Orkest niet gevonden.' });
        }

        res.json({ message: 'Orkest succesvol verwijderd.' });
    } catch (error) {
        console.error('Delete orchestra error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

export default router;
