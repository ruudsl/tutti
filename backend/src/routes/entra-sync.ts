import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { withTransaction } from '../utils/database';
import logger from '../utils/logger';

const router = Router();

interface MicrosoftConfig {
    microsoft_client_id: string | null;
    microsoft_client_secret: string | null;
    microsoft_tenant_id: string | null;
    microsoft_enabled: number;
}

interface EntraUser {
    id: string;
    displayName: string;
    givenName: string | null;
    surname: string | null;
    mail: string | null;
    userPrincipalName: string;
    jobTitle: string | null;
}

interface GraphUsersResponse {
    value: EntraUser[];
    '@odata.nextLink'?: string;
}

function getMicrosoftConfig(associationId: string | null): MicrosoftConfig | null {
    if (!associationId) return null;
    const association = db.prepare(`
        SELECT microsoft_client_id, microsoft_client_secret, microsoft_tenant_id, microsoft_enabled
        FROM associations WHERE id = ?
    `).get(associationId) as MicrosoftConfig | undefined;

    if (!association || !association.microsoft_enabled || !association.microsoft_client_id ||
        !association.microsoft_tenant_id || !association.microsoft_client_secret) {
        return null;
    }
    return association;
}

/**
 * Get an access token using client credentials flow (app-only)
 * Requires User.Read.All permission in Azure AD
 */
async function getAppAccessToken(msConfig: MicrosoftConfig): Promise<string> {
    const tokenResponse = await fetch(
        `https://login.microsoftonline.com/${msConfig.microsoft_tenant_id}/oauth2/v2.0/token`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: msConfig.microsoft_client_id!,
                client_secret: msConfig.microsoft_client_secret!,
                scope: 'https://graph.microsoft.com/.default',
                grant_type: 'client_credentials',
            }),
        }
    );

    if (!tokenResponse.ok) {
        const errorBody = await tokenResponse.text();
        logger.error('Failed to get app access token', { status: tokenResponse.status, body: errorBody });
        throw new ApiError(500, 'Kan geen toegangstoken verkrijgen van Microsoft. Controleer de app permissions.');
    }

    const tokenData = await tokenResponse.json() as { access_token: string };
    return tokenData.access_token;
}

/**
 * Fetch all users from Microsoft Graph API
 */
async function fetchEntraUsers(accessToken: string): Promise<EntraUser[]> {
    const users: EntraUser[] = [];
    let nextLink: string | null = 'https://graph.microsoft.com/v1.0/users?$select=id,displayName,givenName,surname,mail,userPrincipalName,jobTitle&$top=100';

    while (nextLink) {
        const response = await fetch(nextLink, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
            const errorBody = await response.text();
            logger.error('Failed to fetch users from Graph API', { status: response.status, body: errorBody });
            throw new ApiError(500, 'Kan gebruikers niet ophalen van Microsoft. Controleer de User.Read.All permission.');
        }

        const data = await response.json() as GraphUsersResponse;
        users.push(...data.value);
        nextLink = data['@odata.nextLink'] || null;
    }

    return users;
}

// ========================================
// JOB TITLE MAPPINGS ENDPOINTS
// ========================================

/**
 * GET /entra/mappings
 * Get all job title to instrument mappings
 */
router.get('/mappings', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const mappings = db.prepare(`
        SELECT m.id, m.job_title, m.instrument_id, i.name as instrument_name, i.tuning as instrument_tuning
        FROM job_title_instrument_mappings m
        JOIN instruments i ON m.instrument_id = i.id
        WHERE m.association_id = ?
        ORDER BY m.job_title
    `).all(req.user!.associationId);

    res.json(mappings);
}));

/**
 * POST /entra/mappings
 * Create a new job title to instrument mapping
 */
router.post('/mappings', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { jobTitle, instrumentId } = req.body;

    if (!jobTitle || !instrumentId) {
        throw new ApiError(400, 'Job title en instrument zijn verplicht.');
    }

    // Check if instrument exists
    const instrument = db.prepare('SELECT id FROM instruments WHERE id = ?').get(instrumentId);
    if (!instrument) {
        throw new ApiError(404, 'Instrument niet gevonden.');
    }

    // Check if mapping already exists
    const existing = db.prepare(
        'SELECT id FROM job_title_instrument_mappings WHERE association_id = ? AND job_title = ?'
    ).get(req.user!.associationId, jobTitle);
    if (existing) {
        throw new ApiError(409, 'Er bestaat al een mapping voor deze job title.');
    }

    const id = uuidv4();
    db.prepare(`
        INSERT INTO job_title_instrument_mappings (id, association_id, job_title, instrument_id)
        VALUES (?, ?, ?, ?)
    `).run(id, req.user!.associationId, jobTitle, instrumentId);

    logger.info(`Job title mapping created: ${jobTitle} -> ${instrumentId}`, { createdBy: req.user!.id });

    res.status(201).json({
        id,
        jobTitle,
        instrumentId,
        message: 'Mapping succesvol aangemaakt.',
    });
}));

/**
 * PUT /entra/mappings/:id
 * Update a job title to instrument mapping
 */
router.put('/mappings/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { instrumentId } = req.body;

    if (!instrumentId) {
        throw new ApiError(400, 'Instrument is verplicht.');
    }

    // Check if instrument exists
    const instrument = db.prepare('SELECT id FROM instruments WHERE id = ?').get(instrumentId);
    if (!instrument) {
        throw new ApiError(404, 'Instrument niet gevonden.');
    }

    const result = db.prepare(`
        UPDATE job_title_instrument_mappings SET instrument_id = ?
        WHERE id = ? AND association_id = ?
    `).run(instrumentId, req.params.id, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Mapping niet gevonden.');
    }

    logger.info(`Job title mapping updated: ${req.params.id}`, { updatedBy: req.user!.id });

    res.json({ message: 'Mapping succesvol bijgewerkt.' });
}));

/**
 * DELETE /entra/mappings/:id
 * Delete a job title to instrument mapping
 */
router.delete('/mappings/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(
        'DELETE FROM job_title_instrument_mappings WHERE id = ? AND association_id = ?'
    ).run(req.params.id, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Mapping niet gevonden.');
    }

    logger.info(`Job title mapping deleted: ${req.params.id}`, { deletedBy: req.user!.id });

    res.json({ message: 'Mapping succesvol verwijderd.' });
}));

// ========================================
// ENTRA USERS ENDPOINTS
// ========================================

/**
 * GET /entra/users
 * Fetch all users from Entra ID with their job titles
 */
router.get('/users', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const msConfig = getMicrosoftConfig(req.user!.associationId);
    if (!msConfig) {
        throw new ApiError(400, 'Microsoft integratie is niet geconfigureerd. Configureer eerst de Microsoft SSO.');
    }

    // Get access token using client credentials
    const accessToken = await getAppAccessToken(msConfig);

    // Fetch users from Graph API
    const entraUsers = await fetchEntraUsers(accessToken);

    // Get existing users to check which are already imported
    const existingUsers = db.prepare(`
        SELECT email, microsoft_id FROM users WHERE association_id = ?
    `).all(req.user!.associationId) as { email: string; microsoft_id: string | null }[];

    const existingEmails = new Set(existingUsers.map(u => u.email.toLowerCase()));
    const existingMsIds = new Set(existingUsers.filter(u => u.microsoft_id).map(u => u.microsoft_id));

    // Get job title mappings
    const mappings = db.prepare(`
        SELECT job_title, instrument_id FROM job_title_instrument_mappings WHERE association_id = ?
    `).all(req.user!.associationId) as { job_title: string; instrument_id: string }[];

    const jobTitleMap = new Map(mappings.map(m => [m.job_title.toLowerCase(), m.instrument_id]));

    // Collect unique job titles for the response
    const uniqueJobTitles = new Set<string>();

    // Enrich with import status
    const enrichedUsers = entraUsers.map(user => {
        const email = (user.mail || user.userPrincipalName || '').toLowerCase();
        const isImported = existingMsIds.has(user.id) || existingEmails.has(email);
        const hasMapping = user.jobTitle ? jobTitleMap.has(user.jobTitle.toLowerCase()) : false;
        const mappedInstrumentId = user.jobTitle ? jobTitleMap.get(user.jobTitle.toLowerCase()) : null;

        if (user.jobTitle) {
            uniqueJobTitles.add(user.jobTitle);
        }

        return {
            id: user.id,
            displayName: user.displayName,
            firstName: user.givenName || '',
            lastName: user.surname || '',
            email,
            jobTitle: user.jobTitle,
            isImported,
            hasMapping,
            mappedInstrumentId,
        };
    }).filter(u => u.email); // Filter out users without email

    // Sort by display name
    enrichedUsers.sort((a, b) => a.displayName.localeCompare(b.displayName));

    res.json({
        users: enrichedUsers,
        uniqueJobTitles: Array.from(uniqueJobTitles).sort(),
        totalCount: enrichedUsers.length,
        importedCount: enrichedUsers.filter(u => u.isImported).length,
    });
}));

/**
 * POST /entra/users/import
 * Import selected users from Entra ID
 */
router.post('/users/import', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userIds } = req.body as { userIds: string[] };

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        throw new ApiError(400, 'Selecteer minimaal één gebruiker om te importeren.');
    }

    const msConfig = getMicrosoftConfig(req.user!.associationId);
    if (!msConfig) {
        throw new ApiError(400, 'Microsoft integratie is niet geconfigureerd.');
    }

    // Get access token
    const accessToken = await getAppAccessToken(msConfig);

    // Fetch users from Graph API
    const entraUsers = await fetchEntraUsers(accessToken);
    const selectedUsers = entraUsers.filter(u => userIds.includes(u.id));

    if (selectedUsers.length === 0) {
        throw new ApiError(400, 'Geen geldige gebruikers geselecteerd.');
    }

    // Get job title mappings
    const mappings = db.prepare(`
        SELECT job_title, instrument_id FROM job_title_instrument_mappings WHERE association_id = ?
    `).all(req.user!.associationId) as { job_title: string; instrument_id: string }[];

    const jobTitleMap = new Map(mappings.map(m => [m.job_title.toLowerCase(), m.instrument_id]));

    const results = {
        imported: 0,
        skipped: 0,
        errors: [] as string[],
    };

    withTransaction(() => {
        for (const entraUser of selectedUsers) {
            const email = (entraUser.mail || entraUser.userPrincipalName || '').toLowerCase();

            if (!email) {
                results.errors.push(`${entraUser.displayName}: Geen e-mailadres`);
                results.skipped++;
                continue;
            }

            // Check if user already exists
            const existing = db.prepare(
                'SELECT id FROM users WHERE (microsoft_id = ? OR LOWER(email) = ?) AND association_id = ?'
            ).get(entraUser.id, email, req.user!.associationId) as { id: string } | undefined;

            if (existing) {
                // Update existing user with Microsoft ID if not set
                db.prepare('UPDATE users SET microsoft_id = COALESCE(microsoft_id, ?) WHERE id = ?')
                    .run(entraUser.id, existing.id);
                results.skipped++;
                continue;
            }

            // Generate random password (user will use Microsoft SSO to login)
            const randomPassword = crypto.randomBytes(32).toString('hex');
            const passwordHash = bcrypt.hashSync(randomPassword, 10);

            const userId = uuidv4();
            const firstName = entraUser.givenName || entraUser.displayName.split(' ')[0] || 'Onbekend';
            const lastName = entraUser.surname || entraUser.displayName.split(' ').slice(1).join(' ') || '';

            // Insert user
            db.prepare(`
                INSERT INTO users (id, email, password_hash, first_name, last_name, role, association_id, microsoft_id)
                VALUES (?, ?, ?, ?, ?, 'member', ?, ?)
            `).run(userId, email, passwordHash, firstName, lastName, req.user!.associationId, entraUser.id);

            // Add instrument based on job title mapping
            if (entraUser.jobTitle) {
                const instrumentId = jobTitleMap.get(entraUser.jobTitle.toLowerCase());
                if (instrumentId) {
                    db.prepare('INSERT OR IGNORE INTO user_instruments (user_id, instrument_id) VALUES (?, ?)')
                        .run(userId, instrumentId);
                }
            }

            results.imported++;
            logger.info(`User imported from Entra ID: ${email}`, { userId, microsoftId: entraUser.id, importedBy: req.user!.id });
        }
    });

    res.json({
        message: `${results.imported} gebruiker(s) geïmporteerd, ${results.skipped} overgeslagen.`,
        ...results,
    });
}));

/**
 * POST /entra/users/sync
 * Sync all users from Entra ID (update existing, create new if applicable)
 */
router.post('/users/sync', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { createNew = false } = req.body as { createNew?: boolean };

    const msConfig = getMicrosoftConfig(req.user!.associationId);
    if (!msConfig) {
        throw new ApiError(400, 'Microsoft integratie is niet geconfigureerd.');
    }

    // Get access token
    const accessToken = await getAppAccessToken(msConfig);

    // Fetch users from Graph API
    const entraUsers = await fetchEntraUsers(accessToken);

    // Get job title mappings
    const mappings = db.prepare(`
        SELECT job_title, instrument_id FROM job_title_instrument_mappings WHERE association_id = ?
    `).all(req.user!.associationId) as { job_title: string; instrument_id: string }[];

    const jobTitleMap = new Map(mappings.map(m => [m.job_title.toLowerCase(), m.instrument_id]));

    const results = {
        updated: 0,
        created: 0,
        skipped: 0,
    };

    withTransaction(() => {
        for (const entraUser of entraUsers) {
            const email = (entraUser.mail || entraUser.userPrincipalName || '').toLowerCase();

            if (!email) {
                results.skipped++;
                continue;
            }

            // Try to find existing user
            const existing = db.prepare(
                'SELECT id, microsoft_id FROM users WHERE (microsoft_id = ? OR LOWER(email) = ?) AND association_id = ?'
            ).get(entraUser.id, email, req.user!.associationId) as { id: string; microsoft_id: string | null } | undefined;

            if (existing) {
                // Update existing user
                const firstName = entraUser.givenName || entraUser.displayName.split(' ')[0] || 'Onbekend';
                const lastName = entraUser.surname || entraUser.displayName.split(' ').slice(1).join(' ') || '';

                db.prepare(`
                    UPDATE users SET first_name = ?, last_name = ?, microsoft_id = COALESCE(microsoft_id, ?)
                    WHERE id = ?
                `).run(firstName, lastName, entraUser.id, existing.id);

                // Update instrument based on job title mapping
                if (entraUser.jobTitle) {
                    const instrumentId = jobTitleMap.get(entraUser.jobTitle.toLowerCase());
                    if (instrumentId) {
                        // Clear existing instruments and set new one from job title
                        db.prepare('DELETE FROM user_instruments WHERE user_id = ?').run(existing.id);
                        db.prepare('INSERT OR IGNORE INTO user_instruments (user_id, instrument_id) VALUES (?, ?)')
                            .run(existing.id, instrumentId);
                    }
                }

                results.updated++;
            } else if (createNew) {
                // Create new user
                const randomPassword = crypto.randomBytes(32).toString('hex');
                const passwordHash = bcrypt.hashSync(randomPassword, 10);

                const userId = uuidv4();
                const firstName = entraUser.givenName || entraUser.displayName.split(' ')[0] || 'Onbekend';
                const lastName = entraUser.surname || entraUser.displayName.split(' ').slice(1).join(' ') || '';

                db.prepare(`
                    INSERT INTO users (id, email, password_hash, first_name, last_name, role, association_id, microsoft_id)
                    VALUES (?, ?, ?, ?, ?, 'member', ?, ?)
                `).run(userId, email, passwordHash, firstName, lastName, req.user!.associationId, entraUser.id);

                // Add instrument based on job title mapping
                if (entraUser.jobTitle) {
                    const instrumentId = jobTitleMap.get(entraUser.jobTitle.toLowerCase());
                    if (instrumentId) {
                        db.prepare('INSERT OR IGNORE INTO user_instruments (user_id, instrument_id) VALUES (?, ?)')
                            .run(userId, instrumentId);
                    }
                }

                results.created++;
                logger.info(`User created from Entra sync: ${email}`, { userId, microsoftId: entraUser.id, syncedBy: req.user!.id });
            } else {
                results.skipped++;
            }
        }
    });

    logger.info(`Entra sync completed`, { ...results, syncedBy: req.user!.id });

    res.json({
        message: `Synchronisatie voltooid: ${results.updated} bijgewerkt, ${results.created} aangemaakt, ${results.skipped} overgeslagen.`,
        ...results,
    });
}));

export default router;
