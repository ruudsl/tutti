import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../database/connection';
import { generateToken, authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { loginSchema, changePasswordSchema } from '../validation/schemas';

const router = Router();

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
router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;

    if (!user) {
        throw new ApiError(401, 'Ongeldige inloggegevens.');
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
        throw new ApiError(401, 'Ongeldige inloggegevens.');
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
}));

// Get current user profile
router.get('/me', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = db.prepare(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.association_id,
               a.name as association_name
        FROM users u
        LEFT JOIN associations a ON u.association_id = a.id
        WHERE u.id = ?
    `).get(req.user!.id) as any;

    if (!user) {
        throw new ApiError(404, 'Gebruiker niet gevonden.');
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
}));

// Change password
router.post('/change-password', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as { password_hash: string } | undefined;

    if (!user) {
        throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    const validPassword = bcrypt.compareSync(currentPassword, user.password_hash);
    if (!validPassword) {
        throw new ApiError(401, 'Huidig wachtwoord is onjuist.');
    }

    const newPasswordHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newPasswordHash, req.user!.id);

    res.json({ message: 'Wachtwoord succesvol gewijzigd.' });
}));

export default router;
