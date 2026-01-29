import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all associations (for sharing purposes)
router.get('/', authenticateToken, requireRole('admin'), (req: AuthRequest, res: Response) => {
    try {
        const associations = db.prepare(`
            SELECT id, name, created_at
            FROM associations
            ORDER BY name
        `).all();

        res.json(associations.map((a: any) => ({
            id: a.id,
            name: a.name,
            createdAt: a.created_at,
        })));
    } catch (error) {
        console.error('Get associations error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Get current association
router.get('/current', authenticateToken, (req: AuthRequest, res: Response) => {
    try {
        const association = db.prepare(`
            SELECT a.id, a.name, a.created_at,
                   (SELECT COUNT(*) FROM users WHERE association_id = a.id) as member_count,
                   (SELECT COUNT(*) FROM orchestras WHERE association_id = a.id) as orchestra_count
            FROM associations a
            WHERE a.id = ?
        `).get(req.user!.associationId) as any;

        if (!association) {
            return res.status(404).json({ error: 'Vereniging niet gevonden.' });
        }

        res.json({
            id: association.id,
            name: association.name,
            createdAt: association.created_at,
            memberCount: association.member_count,
            orchestraCount: association.orchestra_count,
        });
    } catch (error) {
        console.error('Get current association error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Update current association (admin only)
router.put('/current', authenticateToken, requireRole('admin'), (req: AuthRequest, res: Response) => {
    try {
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Verenigingsnaam is verplicht.' });
        }

        // Check name uniqueness
        const existing = db.prepare(
            'SELECT id FROM associations WHERE LOWER(name) = LOWER(?) AND id != ?'
        ).get(name.trim(), req.user!.associationId);

        if (existing) {
            return res.status(400).json({ error: 'Vereniging met deze naam bestaat al.' });
        }

        db.prepare('UPDATE associations SET name = ? WHERE id = ?').run(
            name.trim(),
            req.user!.associationId
        );

        res.json({ message: 'Vereniging succesvol bijgewerkt.' });
    } catch (error) {
        console.error('Update association error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Create new association (super admin - for multi-tenant setup)
router.post('/', authenticateToken, requireRole('admin'), (req: AuthRequest, res: Response) => {
    try {
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Verenigingsnaam is verplicht.' });
        }

        // Check if name already exists
        const existing = db.prepare(
            'SELECT id FROM associations WHERE LOWER(name) = LOWER(?)'
        ).get(name.trim());

        if (existing) {
            return res.status(400).json({ error: 'Vereniging met deze naam bestaat al.' });
        }

        const associationId = uuidv4();
        db.prepare('INSERT INTO associations (id, name) VALUES (?, ?)').run(
            associationId,
            name.trim()
        );

        res.status(201).json({
            id: associationId,
            name: name.trim(),
            message: 'Vereniging succesvol aangemaakt.',
        });
    } catch (error) {
        console.error('Create association error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

export default router;
