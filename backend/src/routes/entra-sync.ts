import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import db from '../database/connection';
import config from '../config';
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
    department: string | null;
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
    let nextLink: string | null = 'https://graph.microsoft.com/v1.0/users?$select=id,displayName,givenName,surname,mail,userPrincipalName,jobTitle,department&$top=100';

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

/**
 * Fetch profile photo for a specific user from Microsoft Graph API
 * Returns the photo as a Buffer or null if not available
 */
async function fetchUserPhoto(accessToken: string, userId: string): Promise<Buffer | null> {
    try {
        const response = await fetch(
            `https://graph.microsoft.com/v1.0/users/${userId}/photo/$value`,
            {
                headers: { Authorization: `Bearer ${accessToken}` },
            }
        );

        if (!response.ok) {
            // Log non-404 errors (404 just means no photo)
            if (response.status !== 404) {
                logger.warn(`Failed to fetch photo for user ${userId}`, { status: response.status });
            }
            return null; // User may not have a photo
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (e) {
        logger.error(`Error fetching photo for user ${userId}`, { error: e });
        return null;
    }
}

/**
 * Save profile photo to disk for a user
 */
function saveProfilePhoto(userId: string, photoBuffer: Buffer): string {
    const photoDir = path.resolve(config.uploadDir, 'profile-photos');
    if (!fs.existsSync(photoDir)) {
        fs.mkdirSync(photoDir, { recursive: true });
    }

    const filename = `profile-entra-${userId.slice(0, 8)}-${Date.now()}.jpg`;
    const filePath = path.join(photoDir, filename);
    fs.writeFileSync(filePath, photoBuffer);
    return filePath;
}

/**
 * Parse department string into orchestra names (comma-separated)
 */
function parseDepartments(department: string | null): string[] {
    if (!department) return [];
    return department.split(',').map(d => d.trim()).filter(d => d.length > 0);
}

/**
 * Find or create orchestras by name and return their IDs
 */
function findOrCreateOrchestras(orchestraNames: string[], associationId: string | null): string[] {
    if (!associationId) return [];
    const orchestraIds: string[] = [];

    for (const name of orchestraNames) {
        // Try to find existing orchestra (case-insensitive)
        let orchestra = db.prepare(
            'SELECT id FROM orchestras WHERE LOWER(name) = LOWER(?) AND association_id = ?'
        ).get(name, associationId) as { id: string } | undefined;

        if (!orchestra) {
            // Create new orchestra
            const id = uuidv4();
            db.prepare(
                'INSERT INTO orchestras (id, name, association_id) VALUES (?, ?, ?)'
            ).run(id, name, associationId);
            orchestraIds.push(id);
            logger.info(`Orchestra created from Entra department: ${name}`, { orchestraId: id, associationId });
        } else {
            orchestraIds.push(orchestra.id);
        }
    }

    return orchestraIds;
}

/**
 * Assign user to orchestras
 */
function assignUserToOrchestras(userId: string, orchestraIds: string[]): void {
    const insertStmt = db.prepare('INSERT OR IGNORE INTO user_orchestras (user_id, orchestra_id) VALUES (?, ?)');
    for (const orchestraId of orchestraIds) {
        insertStmt.run(userId, orchestraId);
    }
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

    // Collect unique job titles and departments for the response
    const uniqueJobTitles = new Set<string>();
    const uniqueDepartments = new Set<string>();

    // Get existing orchestras
    const existingOrchestras = db.prepare(
        'SELECT LOWER(name) as name FROM orchestras WHERE association_id = ?'
    ).all(req.user!.associationId) as { name: string }[];
    const existingOrchestraNames = new Set(existingOrchestras.map(o => o.name));

    // Enrich with import status
    const enrichedUsers = entraUsers.map(user => {
        const email = (user.mail || user.userPrincipalName || '').toLowerCase();
        const isImported = existingMsIds.has(user.id) || existingEmails.has(email);
        const hasMapping = user.jobTitle ? jobTitleMap.has(user.jobTitle.toLowerCase()) : false;
        const mappedInstrumentId = user.jobTitle ? jobTitleMap.get(user.jobTitle.toLowerCase()) : null;
        const departments = parseDepartments(user.department);

        if (user.jobTitle) {
            uniqueJobTitles.add(user.jobTitle);
        }

        // Track unique departments
        for (const dept of departments) {
            uniqueDepartments.add(dept);
        }

        return {
            id: user.id,
            displayName: user.displayName,
            firstName: user.givenName || '',
            lastName: user.surname || '',
            email,
            jobTitle: user.jobTitle,
            department: user.department,
            departments, // Parsed array
            isImported,
            hasMapping,
            mappedInstrumentId,
        };
    }).filter(u => u.email); // Filter out users without email

    // Sort by display name
    enrichedUsers.sort((a, b) => a.displayName.localeCompare(b.displayName));

    // Find departments that don't exist as orchestras yet
    const newDepartments = Array.from(uniqueDepartments).filter(
        d => !existingOrchestraNames.has(d.toLowerCase())
    );

    res.json({
        users: enrichedUsers,
        uniqueJobTitles: Array.from(uniqueJobTitles).sort(),
        uniqueDepartments: Array.from(uniqueDepartments).sort(),
        newDepartments: newDepartments.sort(),
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
    const importedUsers: { userId: string; entraId: string; email: string }[] = [];

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

            // Add to orchestras based on department
            const departments = parseDepartments(entraUser.department);
            if (departments.length > 0) {
                const orchestraIds = findOrCreateOrchestras(departments, req.user!.associationId);
                assignUserToOrchestras(userId, orchestraIds);
            }

            results.imported++;
            importedUsers.push({ userId, entraId: entraUser.id, email });
            logger.info(`User imported from Entra ID: ${email}`, { userId, microsoftId: entraUser.id, importedBy: req.user!.id });
        }
    });

    // Fetch profile photos outside transaction (async operations)
    for (const imported of importedUsers) {
        try {
            const photoBuffer = await fetchUserPhoto(accessToken, imported.entraId);
            if (photoBuffer) {
                const filePath = saveProfilePhoto(imported.userId, photoBuffer);
                db.prepare('UPDATE users SET profile_photo_path = ? WHERE id = ?').run(filePath, imported.userId);
            }
        } catch (e) {
            logger.warn(`Could not fetch photo for ${imported.email}`, { error: e });
        }
    }

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

                // Update orchestras based on department
                const departments = parseDepartments(entraUser.department);
                if (departments.length > 0) {
                    const orchestraIds = findOrCreateOrchestras(departments, req.user!.associationId);
                    // Clear existing orchestras and set new ones from department
                    db.prepare('DELETE FROM user_orchestras WHERE user_id = ?').run(existing.id);
                    assignUserToOrchestras(existing.id, orchestraIds);
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

                // Add to orchestras based on department
                const departments = parseDepartments(entraUser.department);
                if (departments.length > 0) {
                    const orchestraIds = findOrCreateOrchestras(departments, req.user!.associationId);
                    assignUserToOrchestras(userId, orchestraIds);
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

/**
 * POST /entra/sync-photos
 * Sync profile photos from Entra ID for all users with a microsoft_id
 */
router.post('/sync-photos', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const msConfig = getMicrosoftConfig(req.user!.associationId);
    if (!msConfig) {
        throw new ApiError(400, 'Microsoft integratie is niet geconfigureerd.');
    }

    // Get access token
    const accessToken = await getAppAccessToken(msConfig);

    // Get all users with microsoft_id
    const users = db.prepare(`
        SELECT id, microsoft_id, profile_photo_path FROM users
        WHERE association_id = ? AND microsoft_id IS NOT NULL
    `).all(req.user!.associationId) as { id: string; microsoft_id: string; profile_photo_path: string | null }[];

    logger.info(`Starting photo sync for ${users.length} users with microsoft_id`);

    if (users.length === 0) {
        return res.json({
            message: 'Geen gebruikers met Microsoft ID gevonden. Sync eerst gebruikers via "Sync bestaande" of importeer nieuwe gebruikers.',
            synced: 0,
            skipped: 0,
            failed: 0,
        });
    }

    let synced = 0;
    let failed = 0;
    let skipped = 0;

    for (const user of users) {
        try {
            const photoBuffer = await fetchUserPhoto(accessToken, user.microsoft_id);
            if (!photoBuffer) {
                skipped++;
                continue;
            }

            // Remove old photo if exists
            if (user.profile_photo_path) {
                const oldPath = path.resolve(user.profile_photo_path);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }

            const filePath = saveProfilePhoto(user.id, photoBuffer);
            db.prepare('UPDATE users SET profile_photo_path = ? WHERE id = ?').run(filePath, user.id);
            synced++;
        } catch (e) {
            logger.error(`Failed to sync photo for user ${user.id}`, { error: e });
            failed++;
        }
    }

    logger.info(`Entra photo sync completed`, { synced, failed, skipped, syncedBy: req.user!.id });

    res.json({
        message: `Foto's gesynchroniseerd: ${synced} geüpdatet, ${skipped} zonder foto, ${failed} mislukt.`,
        synced,
        skipped,
        failed,
    });
}));

export default router;
