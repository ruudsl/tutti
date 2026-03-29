import { Router, Response, Request } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import config from '../config';
import logger from '../utils/logger';

const router = Router();

// Configuration from environment variables
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const facebookAppId = process.env.FACEBOOK_APP_ID;
const facebookAppSecret = process.env.FACEBOOK_APP_SECRET;
const socialAuthCallbackUrl = process.env.SOCIAL_AUTH_CALLBACK_URL || config.frontendUrl;

interface SocialUserProfile {
    id: string;
    email: string;
    name: string;
    firstName?: string;
    lastName?: string;
    provider: 'google' | 'facebook';
}

interface GuestCheckoutToken {
    type: 'guest_checkout';
    email: string;
    name: string;
    firstName?: string;
    lastName?: string;
    authProvider: 'google' | 'facebook';
    exp: number;
}

// In-memory state store for CSRF protection (short-lived)
const stateStore = new Map<string, { createdAt: number; provider: string; returnUrl?: string }>();

// Clean up expired states every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of stateStore) {
        if (now - value.createdAt > 10 * 60 * 1000) { // 10 min expiry
            stateStore.delete(key);
        }
    }
}, 5 * 60 * 1000);

/**
 * Generate a short-lived guest checkout token
 * This token allows completing a ticket purchase without full user registration
 */
function generateGuestCheckoutToken(profile: SocialUserProfile): string {
    const payload: GuestCheckoutToken = {
        type: 'guest_checkout',
        email: profile.email,
        name: profile.name,
        firstName: profile.firstName,
        lastName: profile.lastName,
        authProvider: profile.provider,
        exp: Math.floor(Date.now() / 1000) + (30 * 60), // 30 minutes
    };

    return jwt.sign(payload, config.jwtSecret, { expiresIn: '30m' });
}

/**
 * Verify a guest checkout token
 */
export function verifyGuestCheckoutToken(token: string): GuestCheckoutToken | null {
    try {
        const decoded = jwt.verify(token, config.jwtSecret) as GuestCheckoutToken;
        if (decoded.type !== 'guest_checkout') {
            return null;
        }
        return decoded;
    } catch {
        return null;
    }
}

// ==========================================
// GOOGLE OAUTH
// ==========================================

function getGoogleRedirectUri(): string {
    return `${socialAuthCallbackUrl}/auth/google/callback`;
}

/**
 * GET /auth/social/google/enabled
 * Check if Google login is available
 */
router.get('/google/enabled', asyncHandler(async (_req: Request, res: Response) => {
    const enabled = !!(googleClientId && googleClientSecret);
    res.json({ enabled });
}));

/**
 * GET /auth/social/google
 * Redirect to Google OAuth consent screen
 */
router.get('/google', asyncHandler(async (req: Request, res: Response) => {
    if (!googleClientId || !googleClientSecret) {
        throw new ApiError(400, 'Google login is niet geconfigureerd.');
    }

    const returnUrl = req.query.returnUrl as string | undefined;
    const state = crypto.randomBytes(32).toString('hex');
    stateStore.set(state, { createdAt: Date.now(), provider: 'google', returnUrl });

    const params = new URLSearchParams({
        client_id: googleClientId,
        redirect_uri: getGoogleRedirectUri(),
        response_type: 'code',
        scope: 'openid email profile',
        state,
        access_type: 'offline',
        prompt: 'select_account',
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

    // Return URL for frontend to redirect
    res.json({ authUrl });
}));

/**
 * GET /auth/social/google/callback
 * Handle Google OAuth callback
 */
router.get('/google/callback', asyncHandler(async (req: Request, res: Response) => {
    const { code, state, error } = req.query;

    if (error) {
        logger.warn('Google OAuth error', { error });
        throw new ApiError(400, 'Google login geannuleerd of mislukt.');
    }

    if (!code || !state) {
        throw new ApiError(400, 'Ongeldige callback parameters.');
    }

    // Verify state
    const storedState = stateStore.get(state as string);
    if (!storedState || storedState.provider !== 'google') {
        throw new ApiError(400, 'Ongeldige of verlopen state. Probeer opnieuw.');
    }
    stateStore.delete(state as string);

    // Check if state is not too old
    if (Date.now() - storedState.createdAt > 10 * 60 * 1000) {
        throw new ApiError(400, 'Login sessie verlopen. Probeer opnieuw.');
    }

    if (!googleClientId || !googleClientSecret) {
        throw new ApiError(400, 'Google login is niet geconfigureerd.');
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: googleClientId,
            client_secret: googleClientSecret,
            code: code as string,
            redirect_uri: getGoogleRedirectUri(),
            grant_type: 'authorization_code',
        }),
    });

    if (!tokenResponse.ok) {
        const errorBody = await tokenResponse.text();
        logger.error('Google token exchange failed', { status: tokenResponse.status, body: errorBody });
        throw new ApiError(400, 'Google login mislukt. Probeer opnieuw.');
    }

    const tokenData = await tokenResponse.json() as { access_token: string; id_token: string };

    // Get user profile from Google
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileResponse.ok) {
        logger.error('Google profile fetch failed', { status: profileResponse.status });
        throw new ApiError(400, 'Kan Google profiel niet ophalen.');
    }

    const googleProfile = await profileResponse.json() as {
        id: string;
        email: string;
        name: string;
        given_name?: string;
        family_name?: string;
        picture?: string;
    };

    if (!googleProfile.email) {
        throw new ApiError(400, 'Geen e-mailadres gevonden in Google account.');
    }

    const profile: SocialUserProfile = {
        id: googleProfile.id,
        email: googleProfile.email.toLowerCase(),
        name: googleProfile.name || `${googleProfile.given_name || ''} ${googleProfile.family_name || ''}`.trim(),
        firstName: googleProfile.given_name,
        lastName: googleProfile.family_name,
        provider: 'google',
    };

    // Generate guest checkout token
    const guestToken = generateGuestCheckoutToken(profile);

    logger.info(`Google social login for guest checkout: ${profile.email}`);

    res.json({
        token: guestToken,
        user: {
            email: profile.email,
            name: profile.name,
            firstName: profile.firstName,
            lastName: profile.lastName,
            authProvider: 'google',
        },
        returnUrl: storedState.returnUrl,
    });
}));

// ==========================================
// FACEBOOK OAUTH
// ==========================================

function getFacebookRedirectUri(): string {
    return `${socialAuthCallbackUrl}/auth/facebook/callback`;
}

/**
 * GET /auth/social/facebook/enabled
 * Check if Facebook login is available
 */
router.get('/facebook/enabled', asyncHandler(async (_req: Request, res: Response) => {
    const enabled = !!(facebookAppId && facebookAppSecret);
    res.json({ enabled });
}));

/**
 * GET /auth/social/facebook
 * Redirect to Facebook OAuth consent screen
 */
router.get('/facebook', asyncHandler(async (req: Request, res: Response) => {
    if (!facebookAppId || !facebookAppSecret) {
        throw new ApiError(400, 'Facebook login is niet geconfigureerd.');
    }

    const returnUrl = req.query.returnUrl as string | undefined;
    const state = crypto.randomBytes(32).toString('hex');
    stateStore.set(state, { createdAt: Date.now(), provider: 'facebook', returnUrl });

    const params = new URLSearchParams({
        client_id: facebookAppId,
        redirect_uri: getFacebookRedirectUri(),
        state,
        scope: 'email,public_profile',
        response_type: 'code',
    });

    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?${params}`;

    res.json({ authUrl });
}));

/**
 * GET /auth/social/facebook/callback
 * Handle Facebook OAuth callback
 */
router.get('/facebook/callback', asyncHandler(async (req: Request, res: Response) => {
    const { code, state, error, error_description } = req.query;

    if (error) {
        logger.warn('Facebook OAuth error', { error, error_description });
        throw new ApiError(400, 'Facebook login geannuleerd of mislukt.');
    }

    if (!code || !state) {
        throw new ApiError(400, 'Ongeldige callback parameters.');
    }

    // Verify state
    const storedState = stateStore.get(state as string);
    if (!storedState || storedState.provider !== 'facebook') {
        throw new ApiError(400, 'Ongeldige of verlopen state. Probeer opnieuw.');
    }
    stateStore.delete(state as string);

    // Check if state is not too old
    if (Date.now() - storedState.createdAt > 10 * 60 * 1000) {
        throw new ApiError(400, 'Login sessie verlopen. Probeer opnieuw.');
    }

    if (!facebookAppId || !facebookAppSecret) {
        throw new ApiError(400, 'Facebook login is niet geconfigureerd.');
    }

    // Exchange code for access token
    const tokenParams = new URLSearchParams({
        client_id: facebookAppId,
        client_secret: facebookAppSecret,
        code: code as string,
        redirect_uri: getFacebookRedirectUri(),
    });

    const tokenResponse = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?${tokenParams}`);

    if (!tokenResponse.ok) {
        const errorBody = await tokenResponse.text();
        logger.error('Facebook token exchange failed', { status: tokenResponse.status, body: errorBody });
        throw new ApiError(400, 'Facebook login mislukt. Probeer opnieuw.');
    }

    const tokenData = await tokenResponse.json() as { access_token: string };

    // Get user profile from Facebook
    const profileParams = new URLSearchParams({
        fields: 'id,name,email,first_name,last_name',
        access_token: tokenData.access_token,
    });

    const profileResponse = await fetch(`https://graph.facebook.com/v18.0/me?${profileParams}`);

    if (!profileResponse.ok) {
        logger.error('Facebook profile fetch failed', { status: profileResponse.status });
        throw new ApiError(400, 'Kan Facebook profiel niet ophalen.');
    }

    const facebookProfile = await profileResponse.json() as {
        id: string;
        name: string;
        email?: string;
        first_name?: string;
        last_name?: string;
    };

    if (!facebookProfile.email) {
        throw new ApiError(400, 'Geen e-mailadres gevonden in Facebook account. Controleer je Facebook privacy instellingen.');
    }

    const profile: SocialUserProfile = {
        id: facebookProfile.id,
        email: facebookProfile.email.toLowerCase(),
        name: facebookProfile.name || `${facebookProfile.first_name || ''} ${facebookProfile.last_name || ''}`.trim(),
        firstName: facebookProfile.first_name,
        lastName: facebookProfile.last_name,
        provider: 'facebook',
    };

    // Generate guest checkout token
    const guestToken = generateGuestCheckoutToken(profile);

    logger.info(`Facebook social login for guest checkout: ${profile.email}`);

    res.json({
        token: guestToken,
        user: {
            email: profile.email,
            name: profile.name,
            firstName: profile.firstName,
            lastName: profile.lastName,
            authProvider: 'facebook',
        },
        returnUrl: storedState.returnUrl,
    });
}));

// ==========================================
// PROVIDER STATUS
// ==========================================

/**
 * GET /auth/social/providers
 * Get all available social login providers
 */
router.get('/providers', asyncHandler(async (_req: Request, res: Response) => {
    res.json({
        providers: {
            google: {
                enabled: !!(googleClientId && googleClientSecret),
                name: 'Google',
            },
            facebook: {
                enabled: !!(facebookAppId && facebookAppSecret),
                name: 'Facebook',
            },
        },
    });
}));

export default router;
