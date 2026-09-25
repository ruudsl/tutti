import { Router, Response, Request } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import db from '../database/connection';
import { generateToken, authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { registerSession } from '../utils/sessionStore';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import config from '../config';
import logger from '../utils/logger';
import { graphFetch } from '../utils/m365';
import { ontsleutelGeheim, versleutelGeheim } from '../utils/encryption';

const router = Router();

/**
 * Tenants waarin iedereen met een Microsoft-account kan inloggen.
 *
 * Met een van deze als tenant laat Microsoft elk werk- of schoolaccount
 * (organizations), elk persoonlijk account (consumers) of allebei (common)
 * binnen. Wie zelf een tenant aanmaakt, kiest daar zijn eigen
 * userPrincipalName en `mail`; koppelen op e-mailadres gaf zo iedereen die het
 * adres van een lid kende diens account.
 */
const OPEN_TENANTS = new Set(['common', 'organizations', 'consumers']);

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Een tenant-id (GUID) of een domeinnaam; niets dat een URL-pad kan ombuigen. */
const TENANT_VORM = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i;

function isSpecifiekeTenant(tenant: string): boolean {
  return TENANT_VORM.test(tenant) && !OPEN_TENANTS.has(tenant.toLowerCase());
}

const microsoftConfigSchema = z.object({
  clientId: z.string().trim().min(1, 'Client ID en Tenant ID zijn verplicht.'),
  clientSecret: z.string().optional(),
  tenantId: z
    .string()
    .trim()
    .min(1, 'Client ID en Tenant ID zijn verplicht.')
    .refine((tenant) => TENANT_VORM.test(tenant), 'Tenant ID moet een GUID of domeinnaam zijn.')
    .refine(
      (tenant) => !OPEN_TENANTS.has(tenant.toLowerCase()),
      'Vul de tenant van de eigen organisatie in; common, organizations en consumers laten elk Microsoft-account binnen.',
    ),
  enabled: z.boolean().optional(),
});

/**
 * De claims uit het id_token dat bij het inwisselen van de code terugkwam.
 *
 * De handtekening wordt niet gecontroleerd, en dat hoeft ook niet: het token
 * komt rechtstreeks van het token-eindpunt van Microsoft, over TLS, als
 * antwoord op ons eigen verzoek met ons clientgeheim (OpenID Connect Core
 * 3.1.3.7). Er zit geen gebruiker tussen die het kan vervangen.
 */
function claimsUitIdToken(idToken: unknown): { tid?: string; oid?: string } {
  if (typeof idToken !== 'string') return {};
  const deel = idToken.split('.')[1];
  if (!deel) return {};
  try {
    const claims = JSON.parse(Buffer.from(deel, 'base64url').toString('utf8')) as Record<string, unknown>;
    return {
      tid: typeof claims.tid === 'string' ? claims.tid : undefined,
      oid: typeof claims.oid === 'string' ? claims.oid : undefined,
    };
  } catch {
    return {};
  }
}

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

interface GebruikerRij {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  association_id: string | null;
  status: string | null;
  mfa_enabled: number;
}

const GEBRUIKER_KOLOMMEN = 'id, email, first_name, last_name, role, association_id, status, mfa_enabled';

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

  // Een instelling van vóór de controle bij het opslaan kan nog op common of
  // organizations staan. Daarmee inloggen laat elk Microsoft-account toe; dan
  // liever geen SSO tot een beheerder de eigen tenant invult.
  if (!isSpecifiekeTenant(association.microsoft_tenant_id)) {
    logger.warn(`Microsoft-SSO uitgeschakeld voor ${associationId}: tenant is geen specifieke tenant.`);
    return null;
  }

  // Het clientgeheim staat versleuteld opgeslagen. Is het er wel maar niet te
  // lezen, dan kan inloggen niet slagen; dan liever geen knop dan een fout.
  const clientSecret = ontsleutelGeheim(association.microsoft_client_secret, 'Entra-clientgeheim');
  if (association.microsoft_client_secret && !clientSecret) {
    return null;
  }
  return { ...association, microsoft_client_secret: clientSecret };
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
    const tokenResponse = await graphFetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
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
    const profileResponse = await graphFetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileResponse.ok) {
      logger.error('Microsoft Graph profile fetch failed', { status: profileResponse.status });
      throw new ApiError(400, 'Kan Microsoft profiel niet ophalen.');
    }

    const msProfile = (await profileResponse.json()) as MicrosoftUserProfile;

    if (typeof msProfile.id !== 'string' || !msProfile.id) {
      throw new ApiError(400, 'Kan Microsoft profiel niet ophalen.');
    }

    // In welke tenant is deze gebruiker ingelogd? Bij een tenant-id (GUID) als
    // instelling moet dat dezelfde zijn; anders is er iets mis met de
    // configuratie of het antwoord, en dan liever niemand binnen.
    const ingesteldeTenant = tenantId.toLowerCase();
    const { tid } = claimsUitIdToken(tokenData.id_token);
    const tenantIsGuid = GUID.test(ingesteldeTenant);
    const tenantKlopt = tenantIsGuid && tid?.toLowerCase() === ingesteldeTenant;

    if (tenantIsGuid && tid && !tenantKlopt) {
      logger.warn('Microsoft-SSO: token uit een andere tenant geweigerd', {
        associationId: storedState.associationId,
      });
      throw new ApiError(403, 'Dit Microsoft-account hoort niet bij de organisatie van deze vereniging.');
    }

    // Eerst op microsoft_id: dat is gekoppeld bij het aanmaken (onboarding),
    // bij het importeren uit Entra ID, of bij een eerdere inlog hieronder.
    let user = db
      .prepare(
        `SELECT ${GEBRUIKER_KOLOMMEN} FROM users WHERE microsoft_id = ? AND association_id = ? AND deleted_at IS NULL`,
      )
      .get(msProfile.id, storedState.associationId) as GebruikerRij | undefined;

    if (!user) {
      // Automatisch koppelen op e-mailadres, maar alleen als vaststaat dat
      // het account uit de eigen tenant komt, en alleen op userPrincipalName.
      //
      // `mail` is een vrij in te vullen eigenschap; wie beheerder is van welke
      // tenant dan ook kan hem op het adres van een lid zetten. Met common of
      // organizations als tenant (nu geweigerd) kwam zo iedereen binnen als
      // dat lid. De UPN is binnen een tenant uniek en door de beheerder van
      // die tenant uitgegeven; een gast (B2B) heeft een UPN met #EXT# en telt
      // niet. Is de tenant als domeinnaam ingesteld, dan valt de tid niet te
      // vergelijken en is een expliciete koppeling nodig (Entra-import).
      const upn = typeof msProfile.userPrincipalName === 'string' ? msProfile.userPrincipalName.toLowerCase() : '';
      if (tenantKlopt && upn && !upn.includes('#ext#')) {
        user = db
          .prepare(
            `SELECT ${GEBRUIKER_KOLOMMEN} FROM users
             WHERE LOWER(email) = ? AND association_id = ? AND deleted_at IS NULL AND microsoft_id IS NULL`,
          )
          .get(upn, storedState.associationId) as GebruikerRij | undefined;

        if (user && user.status !== 'inactive') {
          db.prepare('UPDATE users SET microsoft_id = ? WHERE id = ?').run(msProfile.id, user.id);
          logger.info(`Linked Microsoft account to user ${user.id} (${upn})`);
        }
      }
    }

    if (!user) {
      throw new ApiError(
        400,
        'Geen account gevonden dat aan dit Microsoft-account is gekoppeld. Neem contact op met de beheerder.',
      );
    }

    // Uit dienst is uit dienst, ook via Microsoft. Het wachtwoordpad
    // (routes/auth.ts) weigerde dit al; hier kwam zo iemand gewoon binnen.
    if (user.status === 'inactive') {
      throw new ApiError(403, 'Dit account is niet meer actief. Neem contact op met je vereniging.');
    }

    // Geen tweede factor op dit pad, en dat is een keuze.
    //
    // POST /auth/login dwingt bij mfa_enabled een TOTP- of herstelcode af
    // voordat er een token wordt afgegeven; hier gebeurt dat niet. Wie via
    // Microsoft binnenkomt heeft zijn tweede factor daar al gezet - Entra ID
    // handhaaft dat aan zijn kant - en die telt hier als voldoende.
    //
    // Dus: dit is geen vergeten controle. Wordt de tweede factor hier alsnog
    // gewenst, dan is dat een bewuste wijziging waar ook het inlogscherm aan
    // te pas komt, want dat moet dan met requiresMfa om kunnen gaan zoals bij
    // het wachtwoordpad.
    db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(new Date().toISOString(), user.id);

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
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
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
  requireRole('admin'),
  validate(microsoftConfigSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { clientId, clientSecret, tenantId, enabled } = req.body as z.infer<typeof microsoftConfigSchema>;

    // If clientSecret is provided, update it. Otherwise keep existing.
    if (clientSecret) {
      db.prepare(
        `
            UPDATE associations
            SET microsoft_client_id = ?, microsoft_client_secret = ?, microsoft_tenant_id = ?, microsoft_enabled = ?
            WHERE id = ?
        `,
      ).run(clientId, versleutelGeheim(clientSecret), tenantId, enabled ? 1 : 0, req.user!.associationId);
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
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
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
