import { Router, Response, Request } from 'express';
import crypto from 'crypto';
import db from '../database/connection';
import { generateToken, authenticateToken, AuthRequest } from '../middleware/auth';
import { registerSession } from '../utils/sessionStore';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import config from '../config';
import logger from '../utils/logger';

const router = Router();

interface MicrosoftConfig {
  microsoft_client_id: string | null;
  microsoft_client_secret: string | null;
  microsoft_tenant_id: string | null;
  microsoft_enabled: number;
}

interface MicrosoftTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
}

interface MicrosoftUserProfile {
  id: string;
  displayName: string;
  givenName: string;
  surname: string;
  mail: string;
  userPrincipalName: string;
}

// In-memory state store for CSRF protection (short-lived)
const stateStore = new Map<string, { createdAt: number; associationId: string }>();

// Clean up expired states every 5 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [key, value] of stateStore) {
      if (now - value.createdAt > 10 * 60 * 1000) {
        // 10 min expiry
        stateStore.delete(key);
      }
    }
  },
  5 * 60 * 1000,
);

/**
 * Bij welke vereniging hoort deze inlogpoging?
 *
 * /enabled en /login zijn publiek - er is nog geen ingelogde gebruiker om het
 * aan af te leiden. Hier stond daarom `FROM associations LIMIT 1`: zonder
 * ORDER BY en zonder filter, dus de eerst aangemaakte vereniging. Op een
 * installatie met een vereniging klopte dat toevallig; met meer verenigingen
 * gebruikte iedereen de Azure-app van vereniging A, en werd er ook in haar
 * ledenlijst gezocht. Een beheerder van B zag in zijn scherm "geconfigureerd"
 * staan terwijl inloggen bij A uitkwam.
 *
 * De slug bepaalt het nu, net als bij /settings/branding en het inlogscherm:
 * /login/harmonie-sint-cecilia stuurt ?slug=harmonie-sint-cecilia mee. Zonder
 * slug hangt het van de installatie af - precies een vereniging: die; meer dan
 * een: geen enkele, want dan is er niets te kiezen en is elke keuze de
 * verkeerde.
 */
function bepaalVereniging(slug: string | undefined): string | null {
  if (slug) {
    const gevonden = db
      .prepare('SELECT id FROM associations WHERE slug = ? AND COALESCE(is_active, 1) = 1')
      .get(slug) as { id: string } | undefined;
    return gevonden?.id ?? null;
  }

  const { aantal } = db.prepare('SELECT COUNT(*) AS aantal FROM associations').get() as { aantal: number };
  if (aantal !== 1) return null;

  const enige = db.prepare('SELECT id FROM associations').get() as { id: string } | undefined;
  return enige?.id ?? null;
}

/** De slug uit de querystring, als die er als tekst in staat. */
function slugUit(req: Request): string | undefined {
  return typeof req.query.slug === 'string' && req.query.slug ? req.query.slug : undefined;
}

function getMicrosoftConfig(associationId: string | null): MicrosoftConfig | null {
  if (!associationId) return null;

  const association = db
    .prepare(
      `
        SELECT microsoft_client_id, microsoft_client_secret, microsoft_tenant_id, microsoft_enabled
        FROM associations WHERE id = ?
    `,
    )
    .get(associationId) as MicrosoftConfig | undefined;

  if (
    !association ||
    !association.microsoft_enabled ||
    !association.microsoft_client_id ||
    !association.microsoft_tenant_id
  ) {
    return null;
  }
  return association;
}

function getRedirectUri(): string {
  return `${config.frontendUrl}/auth/microsoft/callback`;
}

/**
 * GET /auth/microsoft/enabled
 * Public endpoint - check if Microsoft login is available
 */
router.get(
  '/enabled',
  asyncHandler(async (req: Request, res: Response) => {
    const msConfig = getMicrosoftConfig(bepaalVereniging(slugUit(req)));
    res.json({ enabled: !!msConfig });
  }),
);

/**
 * GET /auth/microsoft/login
 * Public endpoint - redirect to Microsoft login page
 */
router.get(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const associationId = bepaalVereniging(slugUit(req));
    const msConfig = getMicrosoftConfig(associationId);
    if (!msConfig || !associationId) {
      throw new ApiError(400, 'Microsoft login is niet geconfigureerd.');
    }

    const state = crypto.randomBytes(32).toString('hex');
    stateStore.set(state, { createdAt: Date.now(), associationId });

    const params = new URLSearchParams({
      client_id: msConfig.microsoft_client_id!,
      response_type: 'code',
      redirect_uri: getRedirectUri(),
      scope: 'openid profile email User.Read',
      response_mode: 'query',
      state,
    });

    const tenantId = msConfig.microsoft_tenant_id!;
    const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`;

    res.json({ authUrl });
  }),
);

/**
 * POST /auth/microsoft/callback
 * Exchange authorization code for token and login/match user
 */
router.post(
  '/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const { code, state } = req.body;

    if (!code || !state) {
      throw new ApiError(400, 'Code en state zijn verplicht.');
    }

    // Verify state
    const storedState = stateStore.get(state);
    if (!storedState) {
      throw new ApiError(400, 'Ongeldige of verlopen state. Probeer opnieuw in te loggen.');
    }
    stateStore.delete(state);

    // Check if state is not too old (10 min)
    if (Date.now() - storedState.createdAt > 10 * 60 * 1000) {
      throw new ApiError(400, 'Login sessie verlopen. Probeer opnieuw.');
    }

    // Niet opnieuw de slug: de vereniging staat vast sinds /login en is
    // onderdeel van de state die hierboven is gecontroleerd.
    const msConfig = getMicrosoftConfig(storedState.associationId);
    if (!msConfig) {
      throw new ApiError(400, 'Microsoft login is niet geconfigureerd.');
    }

    const tenantId = msConfig.microsoft_tenant_id!;

    // Exchange code for token
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: msConfig.microsoft_client_id!,
        client_secret: msConfig.microsoft_client_secret!,
        code,
        redirect_uri: getRedirectUri(),
        grant_type: 'authorization_code',
        scope: 'openid profile email User.Read',
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      logger.error('Microsoft token exchange failed', { status: tokenResponse.status, body: errorBody });
      throw new ApiError(400, 'Microsoft login mislukt. Controleer de configuratie.');
    }

    const tokenData = (await tokenResponse.json()) as MicrosoftTokenResponse;

    // Get user profile from Microsoft Graph
    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileResponse.ok) {
      logger.error('Microsoft Graph profile fetch failed', { status: profileResponse.status });
      throw new ApiError(400, 'Kan Microsoft profiel niet ophalen.');
    }

    const msProfile = (await profileResponse.json()) as MicrosoftUserProfile;
    const msEmail = (msProfile.mail || msProfile.userPrincipalName || '').toLowerCase();

    if (!msEmail) {
      throw new ApiError(400, 'Geen e-mailadres gevonden in Microsoft account.');
    }

    // Try to find existing user by microsoft_id first, then by email
    let user = db
      .prepare('SELECT * FROM users WHERE microsoft_id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(msProfile.id, storedState.associationId) as any;

    if (!user) {
      // Try to match by email
      user = db
        .prepare('SELECT * FROM users WHERE LOWER(email) = ? AND association_id = ? AND deleted_at IS NULL')
        .get(msEmail, storedState.associationId) as any;

      if (user) {
        // Link Microsoft account to existing user
        db.prepare('UPDATE users SET microsoft_id = ? WHERE id = ?').run(msProfile.id, user.id);
        logger.info(`Linked Microsoft account to user ${user.id} (${msEmail})`);
      }
    }

    if (!user) {
      throw new ApiError(400, 'Geen account gevonden met dit e-mailadres. Neem contact op met de beheerder.');
    }

    // Update last login timestamp
    db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(new Date().toISOString(), user.id);

    // Generate JWT token
    const token = generateToken(user);

    // Register the session so it shows up in session management and can be revoked
    registerSession(user.id, token, req.ip, req.get('user-agent'));

    logger.info(`Microsoft SSO login: ${user.email} (${user.id})`);

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
 * Admin endpoints: Microsoft config management
 */

// GET /auth/microsoft/config - Get current config (admin only)
router.get(
  '/config',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.user!.role !== 'admin') {
      throw new ApiError(403, 'Alleen beheerders kunnen de Microsoft configuratie bekijken.');
    }

    const association = db
      .prepare(
        `
        SELECT microsoft_client_id, microsoft_tenant_id, microsoft_enabled
        FROM associations WHERE id = ?
    `,
      )
      .get(req.user!.associationId) as any;

    if (!association) {
      throw new ApiError(404, 'Vereniging niet gevonden.');
    }

    res.json({
      clientId: association.microsoft_client_id || '',
      tenantId: association.microsoft_tenant_id || '',
      enabled: Boolean(association.microsoft_enabled),
      configured: !!(association.microsoft_client_id && association.microsoft_tenant_id),
      redirectUri: getRedirectUri(),
    });
  }),
);

// PUT /auth/microsoft/config - Save config (admin only)
router.put(
  '/config',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.user!.role !== 'admin') {
      throw new ApiError(403, 'Alleen beheerders kunnen de Microsoft configuratie wijzigen.');
    }

    const { clientId, clientSecret, tenantId, enabled } = req.body;

    if (!clientId || !tenantId) {
      throw new ApiError(400, 'Client ID en Tenant ID zijn verplicht.');
    }

    // If clientSecret is provided, update it. Otherwise keep existing.
    if (clientSecret) {
      db.prepare(
        `
            UPDATE associations
            SET microsoft_client_id = ?, microsoft_client_secret = ?, microsoft_tenant_id = ?, microsoft_enabled = ?
            WHERE id = ?
        `,
      ).run(clientId, clientSecret, tenantId, enabled ? 1 : 0, req.user!.associationId);
    } else {
      db.prepare(
        `
            UPDATE associations
            SET microsoft_client_id = ?, microsoft_tenant_id = ?, microsoft_enabled = ?
            WHERE id = ?
        `,
      ).run(clientId, tenantId, enabled ? 1 : 0, req.user!.associationId);
    }

    logger.info(`Microsoft config updated by ${req.user!.id}`);

    res.json({ message: 'Microsoft configuratie opgeslagen.' });
  }),
);

// DELETE /auth/microsoft/config - Remove config (admin only)
router.delete(
  '/config',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.user!.role !== 'admin') {
      throw new ApiError(403, 'Alleen beheerders kunnen de Microsoft configuratie verwijderen.');
    }

    db.prepare(
      `
        UPDATE associations
        SET microsoft_client_id = NULL, microsoft_client_secret = NULL, microsoft_tenant_id = NULL, microsoft_enabled = 0
        WHERE id = ?
    `,
    ).run(req.user!.associationId);

    logger.info(`Microsoft config removed by ${req.user!.id}`);

    res.json({ message: 'Microsoft configuratie verwijderd.' });
  }),
);

export default router;
