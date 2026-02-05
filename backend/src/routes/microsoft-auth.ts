import { Router, Response, Request } from 'express';
import crypto from 'crypto';
import db from '../database/connection';
import { generateToken, authenticateToken, AuthRequest } from '../middleware/auth';
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
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of stateStore) {
        if (now - value.createdAt > 10 * 60 * 1000) { // 10 min expiry
            stateStore.delete(key);
        }
    }
}, 5 * 60 * 1000);

function getMicrosoftConfig(): MicrosoftConfig | null {
    const association = db.prepare(`
        SELECT microsoft_client_id, microsoft_client_secret, microsoft_tenant_id, microsoft_enabled
        FROM associations LIMIT 1
    `).get() as MicrosoftConfig | undefined;

    if (!association || !association.microsoft_enabled || !association.microsoft_client_id || !association.microsoft_tenant_id) {
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
router.get('/enabled', asyncHandler(async (_req: Request, res: Response) => {
    const msConfig = getMicrosoftConfig();
    res.json({ enabled: !!msConfig });
}));

/**
 * GET /auth/microsoft/login
 * Public endpoint - redirect to Microsoft login page
 */
router.get('/login', asyncHandler(async (_req: Request, res: Response) => {
    const msConfig = getMicrosoftConfig();
    if (!msConfig) {
        throw new ApiError(400, 'Microsoft login is niet geconfigureerd.');
    }

    // Get association ID for state
    const association = db.prepare('SELECT id FROM associations LIMIT 1').get() as { id: string } | undefined;
    if (!association) {
        throw new ApiError(500, 'Geen vereniging gevonden.');
    }

    const state = crypto.randomBytes(32).toString('hex');
    stateStore.set(state, { createdAt: Date.now(), associationId: association.id });

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
}));

/**
 * POST /auth/microsoft/callback
 * Exchange authorization code for token and login/match user
 */
router.post('/callback', asyncHandler(async (req: Request, res: Response) => {
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

    const msConfig = getMicrosoftConfig();
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
        throw new ApiError(401, 'Microsoft login mislukt. Controleer de configuratie.');
    }

    const tokenData = await tokenResponse.json() as MicrosoftTokenResponse;

    // Get user profile from Microsoft Graph
    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileResponse.ok) {
        logger.error('Microsoft Graph profile fetch failed', { status: profileResponse.status });
        throw new ApiError(401, 'Kan Microsoft profiel niet ophalen.');
    }

    const msProfile = await profileResponse.json() as MicrosoftUserProfile;
    const msEmail = (msProfile.mail || msProfile.userPrincipalName || '').toLowerCase();

    if (!msEmail) {
        throw new ApiError(400, 'Geen e-mailadres gevonden in Microsoft account.');
    }

    // Try to find existing user by microsoft_id first, then by email
    let user = db.prepare(
        'SELECT * FROM users WHERE microsoft_id = ? AND association_id = ?'
    ).get(msProfile.id, storedState.associationId) as any;

    if (!user) {
        // Try to match by email
        user = db.prepare(
            'SELECT * FROM users WHERE LOWER(email) = ? AND association_id = ?'
        ).get(msEmail, storedState.associationId) as any;

        if (user) {
            // Link Microsoft account to existing user
            db.prepare('UPDATE users SET microsoft_id = ? WHERE id = ?').run(msProfile.id, user.id);
            logger.info(`Linked Microsoft account to user ${user.id} (${msEmail})`);
        }
    }

    if (!user) {
        throw new ApiError(401, 'Geen account gevonden met dit e-mailadres. Neem contact op met de beheerder.');
    }

    // Generate JWT token
    const token = generateToken(user);

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
}));

/**
 * Admin endpoints: Microsoft config management
 */

// GET /auth/microsoft/config - Get current config (admin only)
router.get('/config', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.user!.role !== 'admin') {
        throw new ApiError(403, 'Alleen beheerders kunnen de Microsoft configuratie bekijken.');
    }

    const association = db.prepare(`
        SELECT microsoft_client_id, microsoft_tenant_id, microsoft_enabled
        FROM associations WHERE id = ?
    `).get(req.user!.associationId) as any;

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
}));

// PUT /auth/microsoft/config - Save config (admin only)
router.put('/config', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.user!.role !== 'admin') {
        throw new ApiError(403, 'Alleen beheerders kunnen de Microsoft configuratie wijzigen.');
    }

    const { clientId, clientSecret, tenantId, enabled } = req.body;

    if (!clientId || !tenantId) {
        throw new ApiError(400, 'Client ID en Tenant ID zijn verplicht.');
    }

    // If clientSecret is provided, update it. Otherwise keep existing.
    if (clientSecret) {
        db.prepare(`
            UPDATE associations
            SET microsoft_client_id = ?, microsoft_client_secret = ?, microsoft_tenant_id = ?, microsoft_enabled = ?
            WHERE id = ?
        `).run(clientId, clientSecret, tenantId, enabled ? 1 : 0, req.user!.associationId);
    } else {
        db.prepare(`
            UPDATE associations
            SET microsoft_client_id = ?, microsoft_tenant_id = ?, microsoft_enabled = ?
            WHERE id = ?
        `).run(clientId, tenantId, enabled ? 1 : 0, req.user!.associationId);
    }

    logger.info(`Microsoft config updated by ${req.user!.id}`);

    res.json({ message: 'Microsoft configuratie opgeslagen.' });
}));

// DELETE /auth/microsoft/config - Remove config (admin only)
router.delete('/config', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.user!.role !== 'admin') {
        throw new ApiError(403, 'Alleen beheerders kunnen de Microsoft configuratie verwijderen.');
    }

    db.prepare(`
        UPDATE associations
        SET microsoft_client_id = NULL, microsoft_client_secret = NULL, microsoft_tenant_id = NULL, microsoft_enabled = 0
        WHERE id = ?
    `).run(req.user!.associationId);

    logger.info(`Microsoft config removed by ${req.user!.id}`);

    res.json({ message: 'Microsoft configuratie verwijderd.' });
}));

export default router;
