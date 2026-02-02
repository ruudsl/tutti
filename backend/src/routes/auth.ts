import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { generateSecret, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
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
    mfa_secret: string | null;
    mfa_enabled: boolean;
}

// Login - Step 1: Verify credentials
router.post('/login', asyncHandler(async (req, res) => {
    const { email, password, mfaCode } = req.body;

    // Validate basic login credentials
    loginSchema.parse({ email, password });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;

    if (!user) {
        throw new ApiError(401, 'Ongeldige inloggegevens.');
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
        throw new ApiError(401, 'Ongeldige inloggegevens.');
    }

    // Check if MFA is enabled
    if (user.mfa_enabled && user.mfa_secret) {
        // MFA is enabled, check if code is provided
        if (!mfaCode) {
            // Return indicator that MFA is required
            return res.json({
                requiresMfa: true,
                message: 'MFA verificatie vereist.',
            });
        }

        // Verify MFA code
        const verifyResult = verifySync({ token: mfaCode, secret: user.mfa_secret });

        if (!verifyResult.valid) {
            throw new ApiError(401, 'Ongeldige MFA code.');
        }
    }

    // Generate token and return user data
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
            mfaEnabled: Boolean(user.mfa_enabled),
        },
    });
}));

// Get current user profile
router.get('/me', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = db.prepare(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.association_id,
               u.mfa_enabled, a.name as association_name
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
        mfaEnabled: Boolean(user.mfa_enabled),
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

// MFA: Generate secret and QR code for setup
router.post('/mfa/setup', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = db.prepare('SELECT email, mfa_enabled FROM users WHERE id = ?').get(req.user!.id) as { email: string; mfa_enabled: boolean } | undefined;

    if (!user) {
        throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    if (user.mfa_enabled) {
        throw new ApiError(400, 'MFA is al ingeschakeld. Schakel eerst uit om opnieuw in te stellen.');
    }

    // Generate new secret
    const secret = generateSecret();

    // Store secret temporarily (not enabled yet)
    db.prepare('UPDATE users SET mfa_secret = ? WHERE id = ?').run(secret, req.user!.id);

    // Generate OTP Auth URL for QR code
    const otpauthUrl = `otpauth://totp/${encodeURIComponent('Harmonie Muziek')}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=${encodeURIComponent('Harmonie Muziek')}`;

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    res.json({
        secret,
        qrCode: qrCodeDataUrl,
        message: 'Scan de QR code met je authenticator app en verifieer met een code.',
    });
}));

// MFA: Verify code and enable MFA
router.post('/mfa/enable', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { code } = req.body;

    if (!code) {
        throw new ApiError(400, 'Verificatie code is verplicht.');
    }

    const user = db.prepare('SELECT mfa_secret, mfa_enabled FROM users WHERE id = ?').get(req.user!.id) as { mfa_secret: string | null; mfa_enabled: boolean } | undefined;

    if (!user) {
        throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    if (user.mfa_enabled) {
        throw new ApiError(400, 'MFA is al ingeschakeld.');
    }

    if (!user.mfa_secret) {
        throw new ApiError(400, 'Start eerst de MFA setup.');
    }

    // Verify the code
    const verifyResult = verifySync({ token: code, secret: user.mfa_secret });

    if (!verifyResult.valid) {
        throw new ApiError(401, 'Ongeldige verificatie code. Probeer opnieuw.');
    }

    // Enable MFA
    db.prepare('UPDATE users SET mfa_enabled = 1 WHERE id = ?').run(req.user!.id);

    res.json({
        message: 'MFA is succesvol ingeschakeld.',
        mfaEnabled: true,
    });
}));

// MFA: Disable MFA
router.post('/mfa/disable', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { password, code } = req.body;

    if (!password) {
        throw new ApiError(400, 'Wachtwoord is verplicht om MFA uit te schakelen.');
    }

    const user = db.prepare('SELECT password_hash, mfa_secret, mfa_enabled FROM users WHERE id = ?').get(req.user!.id) as { password_hash: string; mfa_secret: string | null; mfa_enabled: boolean } | undefined;

    if (!user) {
        throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    if (!user.mfa_enabled) {
        throw new ApiError(400, 'MFA is niet ingeschakeld.');
    }

    // Verify password
    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
        throw new ApiError(401, 'Onjuist wachtwoord.');
    }

    // Optionally verify MFA code if provided
    if (code && user.mfa_secret) {
        const verifyResult = verifySync({ token: code, secret: user.mfa_secret });

        if (!verifyResult.valid) {
            throw new ApiError(401, 'Ongeldige MFA code.');
        }
    }

    // Disable MFA and clear secret
    db.prepare('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL WHERE id = ?').run(req.user!.id);

    res.json({
        message: 'MFA is uitgeschakeld.',
        mfaEnabled: false,
    });
}));

// MFA: Get current MFA status
router.get('/mfa/status', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = db.prepare('SELECT mfa_enabled FROM users WHERE id = ?').get(req.user!.id) as { mfa_enabled: boolean } | undefined;

    if (!user) {
        throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    res.json({
        mfaEnabled: Boolean(user.mfa_enabled),
    });
}));

export default router;
