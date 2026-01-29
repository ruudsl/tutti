import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all users (admin only)
router.get('/', authenticateToken, requireRole('admin'), (req: AuthRequest, res: Response) => {
    try {
        const users = db.prepare(`
            SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.association_id, u.created_at,
                   a.name as association_name
            FROM users u
            LEFT JOIN associations a ON u.association_id = a.id
            WHERE u.association_id = ?
            ORDER BY u.last_name, u.first_name
        `).all(req.user!.associationId);

        // Get instruments and orchestras for each user
        const result = users.map((user: any) => {
            const instruments = db.prepare(`
                SELECT i.id, i.name, i.tuning
                FROM instruments i
                JOIN user_instruments ui ON i.id = ui.instrument_id
                WHERE ui.user_id = ?
            `).all(user.id);

            const orchestras = db.prepare(`
                SELECT o.id, o.name
                FROM orchestras o
                JOIN user_orchestras uo ON o.id = uo.orchestra_id
                WHERE uo.user_id = ?
            `).all(user.id);

            return {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role,
                associationId: user.association_id,
                associationName: user.association_name,
                createdAt: user.created_at,
                instruments,
                orchestras,
            };
        });

        res.json(result);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Get single user
router.get('/:id', authenticateToken, requireRole('admin'), (req: AuthRequest, res: Response) => {
    try {
        const user = db.prepare(`
            SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.association_id, u.created_at,
                   a.name as association_name
            FROM users u
            LEFT JOIN associations a ON u.association_id = a.id
            WHERE u.id = ? AND u.association_id = ?
        `).get(req.params.id, req.user!.associationId) as any;

        if (!user) {
            return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
        }

        const instruments = db.prepare(`
            SELECT i.id, i.name, i.tuning
            FROM instruments i
            JOIN user_instruments ui ON i.id = ui.instrument_id
            WHERE ui.user_id = ?
        `).all(user.id);

        const orchestras = db.prepare(`
            SELECT o.id, o.name
            FROM orchestras o
            JOIN user_orchestras uo ON o.id = uo.orchestra_id
            WHERE uo.user_id = ?
        `).all(user.id);

        res.json({
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role,
            associationId: user.association_id,
            associationName: user.association_name,
            createdAt: user.created_at,
            instruments,
            orchestras,
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Create new user (admin only)
router.post('/', authenticateToken, requireRole('admin'), (req: AuthRequest, res: Response) => {
    try {
        const { email, password, firstName, lastName, role, instrumentIds, orchestraIds } = req.body;

        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({ error: 'Email, wachtwoord, voornaam en achternaam zijn verplicht.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Wachtwoord moet minimaal 6 tekens bevatten.' });
        }

        // Check if email already exists
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) {
            return res.status(400).json({ error: 'Email is al in gebruik.' });
        }

        const userId = uuidv4();
        const passwordHash = bcrypt.hashSync(password, 10);
        const userRole = ['admin', 'music_committee', 'member'].includes(role) ? role : 'member';

        db.prepare(`
            INSERT INTO users (id, email, password_hash, first_name, last_name, role, association_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(userId, email, passwordHash, firstName, lastName, userRole, req.user!.associationId);

        // Add instruments
        if (instrumentIds && Array.isArray(instrumentIds)) {
            const insertInstrument = db.prepare('INSERT INTO user_instruments (user_id, instrument_id) VALUES (?, ?)');
            for (const instrumentId of instrumentIds) {
                insertInstrument.run(userId, instrumentId);
            }
        }

        // Add orchestras
        if (orchestraIds && Array.isArray(orchestraIds)) {
            const insertOrchestra = db.prepare('INSERT INTO user_orchestras (user_id, orchestra_id) VALUES (?, ?)');
            for (const orchestraId of orchestraIds) {
                insertOrchestra.run(userId, orchestraId);
            }
        }

        res.status(201).json({
            id: userId,
            email,
            firstName,
            lastName,
            role: userRole,
            message: 'Gebruiker succesvol aangemaakt.',
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Update user (admin only)
router.put('/:id', authenticateToken, requireRole('admin'), (req: AuthRequest, res: Response) => {
    try {
        const { email, firstName, lastName, role, instrumentIds, orchestraIds, password } = req.body;

        // Check if user exists and belongs to same association
        const user = db.prepare('SELECT * FROM users WHERE id = ? AND association_id = ?').get(
            req.params.id,
            req.user!.associationId
        );

        if (!user) {
            return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
        }

        // Check email uniqueness if changed
        if (email) {
            const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.params.id);
            if (existing) {
                return res.status(400).json({ error: 'Email is al in gebruik.' });
            }
        }

        // Update basic info
        const userRole = ['admin', 'music_committee', 'member'].includes(role) ? role : 'member';

        if (password && password.length >= 6) {
            const passwordHash = bcrypt.hashSync(password, 10);
            db.prepare(`
                UPDATE users SET email = ?, first_name = ?, last_name = ?, role = ?, password_hash = ?
                WHERE id = ?
            `).run(email, firstName, lastName, userRole, passwordHash, req.params.id);
        } else {
            db.prepare(`
                UPDATE users SET email = ?, first_name = ?, last_name = ?, role = ?
                WHERE id = ?
            `).run(email, firstName, lastName, userRole, req.params.id);
        }

        // Update instruments
        if (instrumentIds && Array.isArray(instrumentIds)) {
            db.prepare('DELETE FROM user_instruments WHERE user_id = ?').run(req.params.id);
            const insertInstrument = db.prepare('INSERT INTO user_instruments (user_id, instrument_id) VALUES (?, ?)');
            for (const instrumentId of instrumentIds) {
                insertInstrument.run(req.params.id, instrumentId);
            }
        }

        // Update orchestras
        if (orchestraIds && Array.isArray(orchestraIds)) {
            db.prepare('DELETE FROM user_orchestras WHERE user_id = ?').run(req.params.id);
            const insertOrchestra = db.prepare('INSERT INTO user_orchestras (user_id, orchestra_id) VALUES (?, ?)');
            for (const orchestraId of orchestraIds) {
                insertOrchestra.run(req.params.id, orchestraId);
            }
        }

        res.json({ message: 'Gebruiker succesvol bijgewerkt.' });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Delete user (admin only)
router.delete('/:id', authenticateToken, requireRole('admin'), (req: AuthRequest, res: Response) => {
    try {
        // Prevent self-deletion
        if (req.params.id === req.user!.id) {
            return res.status(400).json({ error: 'Je kunt jezelf niet verwijderen.' });
        }

        const result = db.prepare('DELETE FROM users WHERE id = ? AND association_id = ?').run(
            req.params.id,
            req.user!.associationId
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
        }

        res.json({ message: 'Gebruiker succesvol verwijderd.' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

export default router;
