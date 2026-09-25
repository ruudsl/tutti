import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { generateSecret, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import db from '../database/connection';
import {
  generateToken,
  authenticateToken,
  AuthRequest,
  verenigingGesloten,
  MELDING_NIET_ACTIEF,
} from '../middleware/auth';
import { registerSession, revokeUserSessions, hashToken } from '../utils/sessionStore';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { loginSchema, changePasswordSchema, resetPasswordSchema } from '../validation/schemas';
import {
  inlogSleutel,
  mfaSleutel,
  registreerMislukking,
  resterendeWachttijd,
  wisMislukkingen,
} from '../utils/inlogvertraging';
import { plaatsTaak } from '../taken/wachtrij';
import { sendPasswordResetEmail } from '../utils/email';
import logger from '../utils/logger';
import { logAuditEvent } from './audit-logs';
import {
  protectMfaSecret,
  revealMfaSecret,
  issueRecoveryCodes,
  deleteRecoveryCodes,
  consumeRecoveryCode,
} from '../utils/mfa';

// Rate limiter for login: 5 attempts per 15 minutes per IP
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Te veel inlogpogingen. Probeer het over 15 minuten opnieuw.' },
  standardHeaders: true,
  legacyHeaders: false,
  // Only failed attempts count toward the IP limit: brute force is covered
  // by the progressive delay per address (utils/inlogvertraging.ts), and a
  // whole association behind one NAT
  // would otherwise hit the limit after 5 successful logins.
  skipSuccessfulRequests: true,
  // The limiter's in-memory store persists across tests within a file,
  // so deliberate failed-login tests would trip it for later tests.
  skip: () => process.env.NODE_ENV === 'test',
  // req.ip rechtstreeks als sleutel gebruiken telt elk IPv6-adres apart.
  // Een aanvaller met een /64 heeft er 2^64 en komt dus nooit aan de limiet;
  // de bescherming tegen brute force op inloggen is dan alleen nog van
  // toepassing op IPv4. ipKeyGenerator normaliseert IPv6 naar het toegewezen
  // blok en laat IPv4 ongemoeid.
  keyGenerator: (req) => (req.ip ? ipKeyGenerator(req.ip) : 'unknown'),
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
    // Bij voorkeur op e-mailadres, want daar gaat het verzoek over. Zonder
    // e-mail in de body valt hij terug op het IP, en dan geldt hetzelfde
    // IPv6-verhaal als bij de inloglimiet hierboven.
    const email = req.body?.email?.toLowerCase?.();
    if (email) {
      return `pwd-reset:${email}`;
    }
    return `pwd-reset:${req.ip ? ipKeyGenerator(req.ip) : 'unknown'}`;
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
  /** active, inactive of pending - zie de kolomcommentaar in schema.ts. */
  status: string;
  association_id: string | null;
  mfa_secret: string | null;
  mfa_enabled: boolean;
}

const GENERIC_LOCKOUT_MESSAGE = 'Te veel mislukte pogingen, probeer later opnieuw.';
const ONGELDIGE_INLOG = 'Ongeldige inloggegevens.';

/**
 * Een hash om tegen te vergelijken als het adres onbekend is, met dezelfde
 * kosten (10) als echte wachtwoordhashes. Zonder die vergelijking antwoordde
 * een onbekend adres merkbaar sneller dan een bekend adres met een verkeerd
 * wachtwoord, en was aan de looptijd af te lezen welke adressen bestaan.
 */
const VERGELIJKHASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

/**
 * Verify a TOTP code. verifySync can throw on malformed input (e.g. a
 * recovery code instead of a 6-digit token), which should count as invalid.
 */
function isTotpCodeValid(token: string, secret: string): boolean {
  try {
    return verifySync({ token, secret }).valid;
  } catch {
    return false;
  }
}

/** Hash a password reset token for storage/lookup (tokens are never stored in plaintext). */
function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Weiger met 429 zolang voor een van deze sleutels een wachttijd loopt. Het
 * antwoord hangt alleen af van de sleutel (adres + IP, of het account bij de
 * tweede stap), nooit van of het adres bestaat.
 */
function weigerTijdensWachttijd(res: Response, ...sleutels: string[]): void {
  const wachttijdMs = Math.max(0, ...sleutels.map((sleutel) => resterendeWachttijd(sleutel)));
  if (wachttijdMs > 0) {
    res.set('Retry-After', String(Math.ceil(wachttijdMs / 1000)));
    throw new ApiError(429, GENERIC_LOCKOUT_MESSAGE);
  }
}

/**
 * Leg een mislukte poging vast (wachtwoord of tweede stap) voor een bestaand
 * account: tellen voor de wachttijd, en in het auditlogboek.
 */
function recordFailedLoginAttempt(
  user: User,
  sleutels: string[],
  stap: 'password' | 'mfa',
  ipAddress?: string,
  userAgent?: string,
): void {
  let failedAttempts = 0;
  let wachttijdMs = 0;
  for (const sleutel of sleutels) {
    const stand = registreerMislukking(sleutel);
    failedAttempts = Math.max(failedAttempts, stand.mislukt);
    wachttijdMs = Math.max(wachttijdMs, stand.wachttijdMs);
  }

  logAuditEvent(
    user.id,
    'login_failed',
    'user',
    user.id,
    `${user.first_name} ${user.last_name}`,
    { step: stap, failedAttempts, delaySeconds: Math.ceil(wachttijdMs / 1000) },
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
    const { email, password } = req.body;
    // Alleen tekst telt als code; iets anders is geen poging maar ontbreekt.
    const mfaCode: string | undefined =
      typeof req.body.mfaCode === 'string' && req.body.mfaCode !== '' ? req.body.mfaCode : undefined;

    // Validate basic login credentials
    loginSchema.parse({ email, password });

    // Wachttijd na eerdere mislukkingen, per opgegeven adres en IP-adres.
    // Vóór het opzoeken van de gebruiker: een onbekend adres krijgt precies
    // hetzelfde antwoord als een bekend.
    const sleutel = inlogSleutel(email, req.ip);
    weigerTijdensWachttijd(res, sleutel);

    const user = db.prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL').get(email) as
      User | undefined;

    if (!user) {
      // Evenveel werk als bij een bestaand adres, en dezelfde telling.
      bcrypt.compareSync(password, VERGELIJKHASH);
      registreerMislukking(sleutel);
      throw new ApiError(401, ONGELDIGE_INLOG);
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      recordFailedLoginAttempt(user, [sleutel], 'password', req.ip, req.get('user-agent'));
      throw new ApiError(401, ONGELDIGE_INLOG);
    }

    // `role` regelt wat je mag, `status` of je binnenkomt - en die tweede helft
    // werd nergens afgedwongen. Een lid uit dienst nemen zet status op
    // 'inactive' (routes/onboarding.ts), maar dat lid kon daarna gewoon opnieuw
    // inloggen met zijn wachtwoord.
    //
    // De controle staat bewust NA de wachtwoordcontrole. Ervoor zou de melding
    // verklappen welke adressen bestaan en welke daarvan uit dienst zijn.
    //
    // 'pending' blijft toegestaan: een gepromoveerd contact (routes/contacts.ts)
    // krijgt die status met een wachtwoord dat niemand kent, en komt alleen
    // binnen via 'wachtwoord vergeten'. Dat pad moet open blijven.
    //
    // Hetzelfde voor een gedeactiveerde vereniging (associations.is_active = 0):
    // haar leden komen er niet in, een superbeheerder wel.
    const verenigingDicht = user.status !== 'inactive' && verenigingGesloten(user.association_id, user.id);
    if (user.status === 'inactive' || verenigingDicht) {
      logAuditEvent(
        user.id,
        'login_blocked',
        'user',
        user.id,
        `${user.first_name} ${user.last_name}`,
        { reason: verenigingDicht ? 'association_inactive' : 'account_inactive' },
        req.ip,
        req.get('user-agent'),
      );
      throw new ApiError(403, MELDING_NIET_ACTIEF);
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

      // De tweede stap heeft naast de teller per adres en IP-adres ook een
      // teller per account. Zes cijfers zijn anders met genoeg IP-adressen te
      // raden; en alleen wie het wachtwoord al heeft, komt hier.
      const accountSleutel = mfaSleutel(user.id);
      weigerTijdensWachttijd(res, sleutel, accountSleutel);

      // The secret is stored encrypted; legacy installs may still hold plaintext
      const { secret: mfaSecret, wasPlaintext } = revealMfaSecret(user.mfa_secret);

      // Verify as TOTP code first; fall back to a one-time recovery code
      const totpValid = isTotpCodeValid(mfaCode, mfaSecret);

      if (!totpValid) {
        const recoveryCodeUsed = consumeRecoveryCode(user.id, mfaCode);
        if (!recoveryCodeUsed) {
          recordFailedLoginAttempt(user, [sleutel, accountSleutel], 'mfa', req.ip, req.get('user-agent'));
          throw new ApiError(401, 'Ongeldige MFA code.');
        }

        logAuditEvent(
          user.id,
          'mfa_recovery_code_used',
          'user',
          user.id,
          `${user.first_name} ${user.last_name}`,
          undefined,
          req.ip,
          req.get('user-agent'),
        );
      }

      // Legacy plaintext secret: re-encrypt now that the login succeeded.
      // protectMfaSecret degrades to plaintext when no key is configured,
      // in which case the stored value simply stays as-is.
      if (wasPlaintext) {
        const protectedSecret = protectMfaSecret(mfaSecret);
        if (protectedSecret !== user.mfa_secret) {
          db.prepare('UPDATE users SET mfa_secret = ? WHERE id = ?').run(protectedSecret, user.id);
        }
      }

      wisMislukkingen(accountSleutel);
    }

    // Successful login (password + optional MFA verified): the delay for this
    // address and IP starts over, and the last login is recorded.
    wisMislukkingen(sleutel);
    db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(new Date().toISOString(), user.id);

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
 * /auth/logout:
 *   post:
 *     summary: Log out and revoke the current session
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Session revoked
 *       401:
 *         description: Not authenticated
 */
router.post(
  '/logout',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Uitloggen wiste alleen het token in de browser. Het token zelf bleef
    // geldig tot het verliep: wie het had afgeluisterd of uit een gedeelde
    // browser had gehaald, kon ermee door. Nu wordt de sessie aan de
    // serverkant ingetrokken, zoals bij een wachtwoordwijziging - alleen deze
    // ene, niet de andere apparaten van de gebruiker.
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;
    if (!token) {
      // Alleen de Authorization-kopregel: een token uit de URL is alleen
      // geldig bij lezen (zie authenticateToken), en dit is geen lezen.
      throw new ApiError(400, 'Geen geldig token.');
    }

    const result = db
      .prepare(
        `UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP
          WHERE token_hash = ? AND user_id = ? AND revoked_at IS NULL`,
      )
      .run(hashToken(token), req.user!.id);

    logAuditEvent(
      req.user!.id,
      'logout',
      'user',
      req.user!.id,
      'Uitgelogd',
      { revokedCount: result.changes },
      req.ip,
      req.get('user-agent'),
    );

    res.json({ message: 'Uitgelogd.' });
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
      { password_hash: string } | undefined;

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
      { email: string; mfa_enabled: boolean } | undefined;

    if (!user) {
      throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    if (user.mfa_enabled) {
      throw new ApiError(400, 'MFA is al ingeschakeld. Schakel eerst uit om opnieuw in te stellen.');
    }

    // Generate new secret
    const secret = generateSecret();

    // Store secret temporarily (not enabled yet), encrypted at rest
    db.prepare('UPDATE users SET mfa_secret = ? WHERE id = ?').run(protectMfaSecret(secret), req.user!.id);

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
      { mfa_secret: string | null; mfa_enabled: boolean } | undefined;

    if (!user) {
      throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    if (user.mfa_enabled) {
      throw new ApiError(400, 'MFA is al ingeschakeld.');
    }

    if (!user.mfa_secret) {
      throw new ApiError(400, 'Start eerst de MFA setup.');
    }

    // Verify the code (secret is stored encrypted)
    const { secret: mfaSecret } = revealMfaSecret(user.mfa_secret);
    if (!isTotpCodeValid(code, mfaSecret)) {
      throw new ApiError(401, 'Ongeldige verificatie code. Probeer opnieuw.');
    }

    // Enable MFA
    db.prepare('UPDATE users SET mfa_enabled = 1 WHERE id = ?').run(req.user!.id);

    // Generate one-time recovery codes; the plaintext is only returned here
    const recoveryCodes = issueRecoveryCodes(req.user!.id);

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
      recoveryCodes,
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
      const { secret: mfaSecret } = revealMfaSecret(user.mfa_secret);
      if (!isTotpCodeValid(code, mfaSecret)) {
        throw new ApiError(401, 'Ongeldige MFA code.');
      }
    }

    // Disable MFA, clear secret and remove recovery codes
    db.prepare('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL WHERE id = ?').run(req.user!.id);
    deleteRecoveryCodes(req.user!.id);

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
      { mfa_enabled: boolean } | undefined;

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
 * /auth/mfa/recovery-codes/regenerate:
 *   post:
 *     summary: Regenerate MFA recovery codes (requires a valid TOTP code)
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
 *     responses:
 *       200:
 *         description: New recovery codes (shown only once, old codes are invalidated)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 recoveryCodes:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: MFA not enabled or code missing
 *       401:
 *         description: Invalid verification code
 */
router.post(
  '/mfa/recovery-codes/regenerate',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { code } = req.body;

    if (!code) {
      throw new ApiError(400, 'Verificatie code is verplicht.');
    }

    const user = db.prepare('SELECT mfa_secret, mfa_enabled FROM users WHERE id = ?').get(req.user!.id) as
      { mfa_secret: string | null; mfa_enabled: boolean } | undefined;

    if (!user) {
      throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    if (!user.mfa_enabled || !user.mfa_secret) {
      throw new ApiError(400, 'MFA is niet ingeschakeld.');
    }

    // Require a valid TOTP code (recovery codes cannot regenerate themselves)
    const { secret: mfaSecret } = revealMfaSecret(user.mfa_secret);
    if (!isTotpCodeValid(code, mfaSecret)) {
      throw new ApiError(401, 'Ongeldige MFA code.');
    }

    // Replace all existing codes with a fresh set
    const recoveryCodes = issueRecoveryCodes(req.user!.id);

    logAuditEvent(
      req.user!.id,
      'mfa_recovery_codes_regenerated',
      'user',
      req.user!.id,
      'MFA recovery codes opnieuw gegenereerd',
      undefined,
      req.ip,
      req.get('user-agent'),
    );

    res.json({
      message: 'Nieuwe recovery codes gegenereerd. Bewaar ze op een veilige plek; ze worden eenmalig getoond.',
      recoveryCodes,
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

    const user = db.prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL').get(email) as
      { id: string } | undefined;

    if (!user) {
      // Don't reveal that email doesn't exist
      logger.info(`Password reset requested for unknown email: ${sanitizeForLog(email)}`);
      return res.json({ message: successMessage });
    }

    // Het token maken en de mail versturen gebeurt in de wachtrij, niet
    // tijdens dit verzoek. Wachten op de mailserver maakte het antwoord voor
    // een bestaand adres merkbaar trager dan voor een onbekend, en zo was aan
    // de looptijd af te lezen welke adressen bestaan. In de taak staat alleen
    // het id; het token zelf ontstaat pas bij het versturen, zodat het nergens
    // leesbaar wordt opgeslagen.
    plaatsTaak(WACHTWOORDHERSTEL_TAAK, { userId: user.id });

    res.json({ message: successMessage });
  }),
);

/** De soort van de taak die een herstellink maakt en verstuurt (taken/index.ts). */
export const WACHTWOORDHERSTEL_TAAK = 'wachtwoordherstel-mail';

/**
 * Maak een herstellink voor deze gebruiker en verstuur hem. Draait in de
 * wachtrij; versturen is niet herhaalbaar, dus een mislukte mail gooit en
 * staat daarna als mislukt in de wachtrij.
 */
export async function verstuurWachtwoordHerstel(gegevens: { userId: string }): Promise<void> {
  const user = db
    .prepare('SELECT id, email, first_name, last_name, association_id FROM users WHERE id = ? AND deleted_at IS NULL')
    .get(gegevens.userId) as
    { id: string; email: string; first_name: string; last_name: string; association_id: string | null } | undefined;

  if (!user) {
    // Intussen verwijderd: niets te versturen.
    return;
  }

  // Invalidate any existing tokens for this user
  db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0').run(user.id);

  // Generate secure token
  const token = crypto.randomBytes(32).toString('hex');
  const tokenId = uuidv4();

  // Token expires in 1 hour
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1);

  // Store only the SHA-256 hash of the token; the plaintext token exists
  // solely in the e-mail sent to the user.
  db.prepare(
    `
      INSERT INTO password_reset_tokens (id, user_id, token, expires_at)
      VALUES (?, ?, ?, ?)
  `,
  ).run(tokenId, user.id, hashResetToken(token), expiresAt.toISOString());

  const userName = `${user.first_name} ${user.last_name}`;
  const emailSent = await sendPasswordResetEmail(user.email, token, userName, user.association_id);

  if (!emailSent) {
    throw new Error(`Herstelmail kon niet worden verstuurd voor gebruiker ${user.id}`);
  }

  logger.info(`Password reset token generated for user ${user.id}`);
}

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
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body as { token: string; newPassword: string };

    // Find valid token. Only hashes are stored, so the supplied token is
    // hashed for the lookup; legacy plaintext rows simply never match.
    const resetToken = db
      .prepare(
        `
        SELECT prt.*, u.email
        FROM password_reset_tokens prt
        JOIN users u ON prt.user_id = u.id
        WHERE prt.token = ? AND prt.used = 0
    `,
      )
      .get(hashResetToken(String(token))) as
      { id: string; user_id: string; email: string; expires_at: string } | undefined;

    // De vervaltijd wordt als ISO-string opgeslagen ('2026-08-21T11:00:00.000Z')
    // en SQLite vergelijkt tekst. `datetime('now')` levert
    // '2026-08-21 09:55:00', en op positie 10 staat 'T' (0x54) tegenover een
    // spatie (0x20). Zolang de datum gelijk is wint de ISO-vorm dus altijd:
    // een token dat na een uur had moeten verlopen bleef geldig tot middernacht
    // UTC - tot 24 keer zo lang als bedoeld. Daarom vergelijken we hier in JS,
    // waar beide notaties gewoon een datum zijn.
    if (!resetToken || new Date(resetToken.expires_at) <= new Date()) {
      throw new ApiError(400, 'Ongeldige of verlopen reset link. Vraag een nieuwe aan.');
    }

    // Hash new password
    const passwordHash = bcrypt.hashSync(newPassword, 10);

    // Update password
    db.prepare(
      `
        UPDATE users SET password_hash = ?, password_changed_at = ?
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
        SELECT id, expires_at FROM password_reset_tokens
        WHERE token = ? AND used = 0
    `,
      )
      .get(hashResetToken(String(token))) as { id: string; expires_at: string } | undefined;

    // Zelfde tekstvergelijking als bij het echte resetten hierboven.
    if (!resetToken || new Date(resetToken.expires_at) <= new Date()) {
      throw new ApiError(400, 'Ongeldige of verlopen reset link.');
    }

    res.json({ valid: true });
  }),
);

export default router;
