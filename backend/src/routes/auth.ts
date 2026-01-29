import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../database/connection';
import { generateToken, authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

interface LoginBody {
    email: string;
    password: string;
}

interface User {
    id: string;
    email: string;
    password_hash: string;
    first_name: string;
    last_name: string;
    role: string;
    association_id: string | null;
}

// Login
router.post('/login', (req: Request<{}, {}, LoginBody>, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email en wachtwoord zijn verplicht.' });
        }

        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;

        if (!user) {
            return res.status(401).json({ error: 'Ongeldige inloggegevens.' });
        }

        const validPassword = bcrypt.compareSync(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Ongeldige inloggegevens.' });
        }

        const token = generateToken(user);

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role,
                associationId: user.association_id,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Get current user profile
router.get('/me', authenticateToken, (req: AuthRequest, res: Response) => {
    try {
        const user = db.prepare(`
            SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.association_id,
                   a.name as association_name
            FROM users u
            LEFT JOIN associations a ON u.association_id = a.id
            WHERE u.id = ?
        `).get(req.user!.id) as any;

        if (!user) {
            return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
        }

        // Get user's instruments
        const instruments = db.prepare(`
            SELECT i.id, i.name, i.tuning
            FROM instruments i
            JOIN user_instruments ui ON i.id = ui.instrument_id
            WHERE ui.user_id = ?
        `).all(req.user!.id);

        // Get user's orchestras
        const orchestras = db.prepare(`
            SELECT o.id, o.name
            FROM orchestras o
            JOIN user_orchestras uo ON o.id = uo.orchestra_id
            WHERE uo.user_id = ?
        `).all(req.user!.id);

        res.json({
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role,
            associationId: user.association_id,
            associationName: user.association_name,
            instruments,
            orchestras,
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

// Change password
router.post('/change-password', authenticateToken, (req: AuthRequest, res: Response) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Huidig en nieuw wachtwoord zijn verplicht.' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Nieuw wachtwoord moet minimaal 6 tekens bevatten.' });
        }

        const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as { password_hash: string } | undefined;

        if (!user) {
            return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
        }

        const validPassword = bcrypt.compareSync(currentPassword, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Huidig wachtwoord is onjuist.' });
        }

        const newPasswordHash = bcrypt.hashSync(newPassword, 10);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newPasswordHash, req.user!.id);

        res.json({ message: 'Wachtwoord succesvol gewijzigd.' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Interne serverfout.' });
    }
});

export default router;
