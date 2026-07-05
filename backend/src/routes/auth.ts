import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';
import { generateSecret, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import db from '../database/connection';
import { generateToken, authenticateToken, AuthRequest } from '../middleware/auth';
import { registerSession, revokeUserSessions, hashToken } from '../utils/sessionStore';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { loginSchema, changePasswordSchema } from '../validation/schemas';
import { sendPasswordResetEmail } from '../utils/email';
import logger from '../utils/logger';
import { logAuditEvent } from './audit-logs';

// Rate limiter for login: 5 attempts per 15 minutes per IP
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Te veel inlogpogingen. Probeer het over 15 minuten opnieuw.' },
  standardHeaders: true,
  legacyHeaders: false,
  // Only failed attempts count toward the IP limit: brute force is covered
  // by the per-account lockout, and a whole association behind one NAT
  // would otherwise hit the limit after 5 successful logins.
  skipSuccessfulRequests: true,
  // The limiter's in-memory store persists across tests within a file,
  // so deliberate failed-login tests would trip it for later tests.
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => req.ip || 'unknown',
});

// Rate limiter for password reset: 3 attempts per hour per email
// Uses a custom key generator to rate limit by email address
const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { error: 'Te veel wachtwoord reset verzoeken. Probeer het over een uur opnieuw.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by email address (normalized to lowercase)
    const email = req.body?.email?.toLowerCase?.() || req.ip || 'unknown';
    return `pwd-reset:${email}`;
  },
});

const sanitizeForLog = (value: unknown): string =>
  String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    // eslint-disable-next-line no-control-regex -- strip control chars from log output
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .trim();

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
  failed_login_attempts: number | null;
  locked_until: string | null;
}

// Account lockout: from this many failed attempts on, the account is locked
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_BASE_MINUTES = 15;
const LOCKOUT_MAX_MINUTES = 24 * 60; // 24 hours

const GENERIC_LOCKOUT_MESSAGE = 'Te veel mislukte pogingen, probeer later opnieuw.';

function isAccountLocked(user: User): boolean {
  if (!user.locked_until) return false;
  const lockedUntil = new Date(user.locked_until).getTime();
  return !isNaN(lockedUntil) && lockedUntil > Date.now();
}

/**
 * Record a failed login attempt. From LOCKOUT_THRESHOLD attempts on, the
 * account is locked exponentially: 5 attempts -> 15 min, each subsequent
 * failed attempt doubles the lock, capped at 24 hours.
 */
function recordFailedLoginAttempt(user: User, ipAddress?: string, userAgent?: string): void {
  const attempts = (user.failed_login_attempts || 0) + 1;

  let lockedUntil: string | null = null;
  if (attempts >= LOCKOUT_THRESHOLD) {
    const lockMinutes = Math.min(LOCKOUT_BASE_MINUTES * Math.pow(2, attempts - LOCKOUT_THRESHOLD), LOCKOUT_MAX_MINUTES);
    lockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000).toISOString();
  }

  db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?').run(
    attempts,
    lockedUntil,
    user.id,
  );

  logAuditEvent(
    user.id,
    'login_failed',
    'user',
    user.id,
    `${user.first_name} ${user.last_name}`,
    { failedAttempts: attempts, lockedUntil },
    ipAddress,
    userAgent,
  );
}

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Authenticate user and get JWT token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *           example:
 *             email: "muzikant@harmonie.nl"
 *             password: "wachtwoord123"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/login',
  loginRateLimiter,
  asyncHandler(async (req, res) => {
    const { email, password, mfaCode } = req.body;

    // Validate basic login credentials
    loginSchema.parse({ email, password });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;

    if (!user) {
      throw new ApiError(401, 'Ongeldige inloggegevens.');
    }

    // Account lockout check BEFORE password verification, with a generic
    // message that doesn't reveal whether the password was correct.
    if (isAccountLocked(user)) {
      logAuditEvent(
        user.id,
        'login_blocked',
        'user',
        user.id,
        `${user.first_name} ${user.last_name}`,
        { reason: 'account_locked', lockedUntil: user.locked_until },
        req.ip,
        req.get('user-agent'),
      );
      throw new ApiError(429, GENERIC_LOCKOUT_MESSAGE);
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      recordFailedLoginAttempt(user, req.ip, req.get('user-agent'));
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

    // Successful login (password + optional MFA verified):
    // update last login timestamp and reset the failed-attempts counter
    db.prepare('UPDATE users SET last_login = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(
      new Date().toISOString(),
      user.id,
    );

    // Generate token and return user data
    const token = generateToken(user);

    // Register the session so it shows up in session management and can be revoked
    registerSession(user.id, token, req.ip, req.get('user-agent'));

    // Log audit event for successful login
    logAuditEvent(
      user.id,
      'login',
      'user',
      user.id,
      `${user.first_name} ${user.last_name}`,
      undefined,
      req.ip,
      req.get('user-agent'),
    );

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
  }),
);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current authenticated user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile with instruments and orchestras
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.get(
  '/me',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = db
      .prepare(
        `
        SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.association_id,
               u.mfa_enabled, a.name as association_name
        FROM users u
        LEFT JOIN associations a ON u.association_id = a.id
        WHERE u.id = ?
    `,
      )
      .get(req.user!.id) as any;

    if (!user) {
      throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    // Get user's instruments
    const instruments = db
      .prepare(
        `
        SELECT i.id, i.name, i.tuning
        FROM instruments i
        JOIN user_instruments ui ON i.id = ui.instrument_id
        WHERE ui.user_id = ?
    `,
      )
      .all(req.user!.id);

    // Get user's orchestras
    const orchestras = db
      .prepare(
        `
        SELECT o.id, o.name
        FROM orchestras o
        JOIN user_orchestras uo ON o.id = uo.orchestra_id
        WHERE uo.user_id = ?
    `,
      )
      .all(req.user!.id);

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
  }),
);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Change password for authenticated user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePasswordRequest'
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Current password incorrect
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/change-password',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as
      | { password_hash: string }
      | undefined;

    if (!user) {
      throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    const validPassword = bcrypt.compareSync(currentPassword, user.password_hash);
    if (!validPassword) {
      throw new ApiError(401, 'Huidig wachtwoord is onjuist.');
    }

    const newPasswordHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?').run(
      newPasswordHash,
      new Date().toISOString(),
      req.user!.id,
    );

    // Revoke all other sessions for this user; the current session stays valid
    const authHeader = req.headers.authorization;
    const currentToken = (authHeader && authHeader.split(' ')[1]) || (req.query.token as string | undefined);
    revokeUserSessions(req.user!.id, currentToken ? hashToken(currentToken) : undefined);

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'update',
      'user',
      req.user!.id,
      'Wachtwoord gewijzigd',
      { field: 'password' },
      req.ip,
      req.get('user-agent'),
    );

    res.json({ message: 'Wachtwoord succesvol gewijzigd.' });
  }),
);

/**
 * @swagger
 * /auth/mfa/setup:
 *   post:
 *     summary: Generate MFA secret and QR code for setup
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: MFA setup information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 secret:
 *                   type: string
 *                   description: MFA secret (save this for backup)
 *                 qrCode:
 *                   type: string
 *                   description: QR code as data URL
 *                 message:
 *                   type: string
 *       400:
 *         description: MFA already enabled
 */
router.post(
  '/mfa/setup',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = db.prepare('SELECT email, mfa_enabled FROM users WHERE id = ?').get(req.user!.id) as
      | { email: string; mfa_enabled: boolean }
      | undefined;

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
  }),
);

/**
 * @swagger
 * /auth/mfa/enable:
 *   post:
 *     summary: Verify MFA code and enable MFA
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code:
 *                 type: string
 *                 description: 6-digit verification code from authenticator app
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: MFA enabled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 mfaEnabled:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: Invalid verification code
 */
router.post(
  '/mfa/enable',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { code } = req.body;

    if (!code) {
      throw new ApiError(400, 'Verificatie code is verplicht.');
    }

    const user = db.prepare('SELECT mfa_secret, mfa_enabled FROM users WHERE id = ?').get(req.user!.id) as
      | { mfa_secret: string | null; mfa_enabled: boolean }
      | undefined;

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

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'update',
      'user',
      req.user!.id,
      'MFA ingeschakeld',
      { mfaEnabled: true },
      req.ip,
      req.get('user-agent'),
    );

    res.json({
      message: 'MFA is succesvol ingeschakeld.',
      mfaEnabled: true,
    });
  }),
);

/**
 * @swagger
 * /auth/mfa/disable:
 *   post:
 *     summary: Disable MFA (requires password confirmation)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *                 description: Current password for verification
 *               code:
 *                 type: string
 *                 description: Optional MFA code for extra verification
 *     responses:
 *       200:
 *         description: MFA disabled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 mfaEnabled:
 *                   type: boolean
 *                   example: false
 *       401:
 *         description: Invalid password or MFA code
 */
router.post(
  '/mfa/disable',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { password, code } = req.body;

    if (!password) {
      throw new ApiError(400, 'Wachtwoord is verplicht om MFA uit te schakelen.');
    }

    const user = db
      .prepare('SELECT password_hash, mfa_secret, mfa_enabled FROM users WHERE id = ?')
      .get(req.user!.id) as { password_hash: string; mfa_secret: string | null; mfa_enabled: boolean } | undefined;

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

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'update',
      'user',
      req.user!.id,
      'MFA uitgeschakeld',
      { mfaEnabled: false },
      req.ip,
      req.get('user-agent'),
    );

    res.json({
      message: 'MFA is uitgeschakeld.',
      mfaEnabled: false,
    });
  }),
);

/**
 * @swagger
 * /auth/mfa/status:
 *   get:
 *     summary: Get current MFA status for authenticated user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: MFA status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mfaEnabled:
 *                   type: boolean
 */
router.get(
  '/mfa/status',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = db.prepare('SELECT mfa_enabled FROM users WHERE id = ?').get(req.user!.id) as
      | { mfa_enabled: boolean }
      | undefined;

    if (!user) {
      throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    res.json({
      mfaEnabled: Boolean(user.mfa_enabled),
    });
  }),
);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: Response sent (always returns success to prevent email enumeration)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post(
  '/forgot-password',
  passwordResetRateLimiter,
  asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
      throw new ApiError(400, 'E-mailadres is verplicht.');
    }

    // Always return success to prevent email enumeration
    const successMessage =
      'Als dit e-mailadres bij ons bekend is, ontvang je binnen enkele minuten een e-mail met instructies.';

    const user = db
      .prepare('SELECT id, first_name, last_name, association_id FROM users WHERE email = ?')
      .get(email) as { id: string; first_name: string; last_name: string; association_id: string | null } | undefined;

    if (!user) {
      // Don't reveal that email doesn't exist
      logger.info(`Password reset requested for unknown email: ${sanitizeForLog(email)}`);
      return res.json({ message: successMessage });
    }

    // Invalidate any existing tokens for this user
    db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0').run(user.id);

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenId = uuidv4();

    // Token expires in 1 hour
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // Store token
    db.prepare(
      `
        INSERT INTO password_reset_tokens (id, user_id, token, expires_at)
        VALUES (?, ?, ?, ?)
    `,
    ).run(tokenId, user.id, token, expiresAt.toISOString());

    // Send email
    const userName = `${user.first_name} ${user.last_name}`;
    const emailSent = await sendPasswordResetEmail(email, token, userName, user.association_id);

    if (!emailSent) {
      logger.error(`Failed to send password reset email to ${sanitizeForLog(email)}`);
    }

    logger.info(`Password reset token generated for user ${user.id}`);

    res.json({ message: successMessage });
  }),
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password using reset token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token:
 *                 type: string
 *                 description: Reset token received via email
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password reset successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Invalid or expired token
 */
router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      throw new ApiError(400, 'Token en nieuw wachtwoord zijn verplicht.');
    }

    if (newPassword.length < 8) {
      throw new ApiError(400, 'Wachtwoord moet minimaal 8 tekens bevatten.');
    }

    // Find valid token
    const resetToken = db
      .prepare(
        `
        SELECT prt.*, u.email
        FROM password_reset_tokens prt
        JOIN users u ON prt.user_id = u.id
        WHERE prt.token = ? AND prt.used = 0 AND prt.expires_at > datetime('now')
    `,
      )
      .get(token) as { id: string; user_id: string; email: string } | undefined;

    if (!resetToken) {
      throw new ApiError(400, 'Ongeldige of verlopen reset link. Vraag een nieuwe aan.');
    }

    // Hash new password
    const passwordHash = bcrypt.hashSync(newPassword, 10);

    // Update password. Also reset the failed-login lockout: the user has
    // proven ownership of the e-mail address.
    db.prepare(
      `
        UPDATE users SET password_hash = ?, password_changed_at = ?, failed_login_attempts = 0, locked_until = NULL
        WHERE id = ?
    `,
    ).run(passwordHash, new Date().toISOString(), resetToken.user_id);

    // Revoke ALL existing sessions for this user
    revokeUserSessions(resetToken.user_id);

    // Mark token as used
    db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(resetToken.id);

    // Log audit event
    logAuditEvent(
      resetToken.user_id,
      'update',
      'user',
      resetToken.user_id,
      'Wachtwoord hersteld via reset link',
      { field: 'password', method: 'reset_token' },
      req.ip,
      req.get('user-agent'),
    );

    logger.info(`Password reset successful for user ${resetToken.user_id}`);

    res.json({ message: 'Wachtwoord succesvol gewijzigd. Je kunt nu inloggen met je nieuwe wachtwoord.' });
  }),
);

/**
 * @swagger
 * /auth/reset-password/validate:
 *   get:
 *     summary: Validate a password reset token
 *     tags: [Auth]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Reset token to validate
 *     responses:
 *       200:
 *         description: Token is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Token is invalid or expired
 */
router.get(
  '/reset-password/validate',
  asyncHandler(async (req, res) => {
    const { token } = req.query;

    if (!token) {
      throw new ApiError(400, 'Token is verplicht.');
    }

    const resetToken = db
      .prepare(
        `
        SELECT id FROM password_reset_tokens
        WHERE token = ? AND used = 0 AND expires_at > datetime('now')
    `,
      )
      .get(token);

    if (!resetToken) {
      throw new ApiError(400, 'Ongeldige of verlopen reset link.');
    }

    res.json({ valid: true });
  }),
);

export default router;
