import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { withTransaction } from '../utils/database';
import logger from '../utils/logger';
import { logAuditEvent } from './audit-logs';

const router = Router();

interface MicrosoftConfig {
    microsoft_client_id: string | null;
    microsoft_client_secret: string | null;
    microsoft_tenant_id: string | null;
    microsoft_enabled: number;
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
        throw new ApiError(500, 'Kan geen toegangstoken verkrijgen van Microsoft.');
    }

    const tokenData = await tokenResponse.json() as { access_token: string };
    return tokenData.access_token;
}

// ========================================
// ONBOARDING WIZARD ENDPOINTS
// ========================================

/**
 * POST /onboarding/member
 * Start onboarding for a new member
 */
router.post('/member', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const {
        firstName,
        lastName,
        email,
        instrumentIds,
        orchestraIds,
        createM365Account,
        m365Password,
    } = req.body;

    if (!firstName || !lastName || !email) {
        throw new ApiError(400, 'Voornaam, achternaam en email zijn verplicht.');
    }

    // Check if user already exists
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email.toLowerCase());
    if (existing) {
        throw new ApiError(409, 'Er bestaat al een gebruiker met dit emailadres.');
    }

    const userId = uuidv4();
    const tempPassword = m365Password || crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, '');
    const passwordHash = bcrypt.hashSync(tempPassword, 10);
    let microsoftId: string | null = null;
    let m365Created = false;
    let m365Error: string | null = null;

    // Try to create M365 account if requested
    if (createM365Account) {
        const msConfig = getMicrosoftConfig(req.user!.associationId);
        if (msConfig) {
            try {
                const accessToken = await getAppAccessToken(msConfig);

                // Get the domain from the tenant
                const orgResponse = await fetch(
                    'https://graph.microsoft.com/v1.0/organization',
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                );

                if (!orgResponse.ok) {
                    throw new Error('Kan organisatie-informatie niet ophalen');
                }

                const orgData = await orgResponse.json() as { value: { verifiedDomains: { name: string; isDefault: boolean }[] }[] };
                const defaultDomain = orgData.value[0]?.verifiedDomains?.find(d => d.isDefault)?.name;

                if (!defaultDomain) {
                    throw new Error('Geen default domein gevonden in M365');
                }

                // Create UPN from email or generate one
                const upn = email.includes('@') && email.endsWith(defaultDomain)
                    ? email
                    : `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${defaultDomain}`.replace(/\s+/g, '');

                // Create user in M365
                const createResponse = await fetch(
                    'https://graph.microsoft.com/v1.0/users',
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            accountEnabled: true,
                            displayName: `${firstName} ${lastName}`,
                            givenName: firstName,
                            surname: lastName,
                            mailNickname: `${firstName.toLowerCase()}${lastName.toLowerCase()}`.replace(/\s+/g, ''),
                            userPrincipalName: upn,
                            mail: email,
                            passwordProfile: {
                                forceChangePasswordNextSignIn: true,
                                password: tempPassword,
                            },
                        }),
                    }
                );

                if (createResponse.ok) {
                    const userData = await createResponse.json() as { id: string };
                    microsoftId = userData.id;
                    m365Created = true;
                    logger.info(`M365 user created: ${upn}`, { microsoftId, createdBy: req.user!.id });
                } else {
                    const errorData = await createResponse.json() as { error?: { message?: string } };
                    m365Error = errorData.error?.message || 'Kon M365 account niet aanmaken';
                    logger.warn('Failed to create M365 user', { email, error: m365Error });
                }
            } catch (err) {
                m365Error = err instanceof Error ? err.message : 'Onbekende fout bij M365';
                logger.error('M365 account creation error', { error: err });
            }
        } else {
            m365Error = 'Microsoft integratie is niet geconfigureerd';
        }
    }

    // Create user in local database
    withTransaction(() => {
        db.prepare(`
            INSERT INTO users (id, email, password_hash, first_name, last_name, role, status, association_id, microsoft_id, onboarded_at)
            VALUES (?, ?, ?, ?, ?, 'member', 'active', ?, ?, CURRENT_TIMESTAMP)
        `).run(userId, email.toLowerCase(), passwordHash, firstName, lastName, req.user!.associationId, microsoftId);

        // Add instruments
        if (instrumentIds && instrumentIds.length > 0) {
            const insertInstrument = db.prepare('INSERT INTO user_instruments (user_id, instrument_id) VALUES (?, ?)');
            for (const instrumentId of instrumentIds) {
                insertInstrument.run(userId, instrumentId);
            }
        }

        // Add orchestras
        if (orchestraIds && orchestraIds.length > 0) {
            const insertOrchestra = db.prepare('INSERT INTO user_orchestras (user_id, orchestra_id) VALUES (?, ?)');
            for (const orchestraId of orchestraIds) {
                insertOrchestra.run(userId, orchestraId);
            }
        }

        // Create pending Spond link entry
        db.prepare(`
            INSERT INTO pending_spond_links (id, user_id, association_id, expected_email, expected_name)
            VALUES (?, ?, ?, ?, ?)
        `).run(uuidv4(), userId, req.user!.associationId, email.toLowerCase(), `${firstName} ${lastName}`);

        // Log onboarding tasks
        const taskTypes = ['harmonie_create'];
        if (createM365Account) taskTypes.push(m365Created ? 'm365_create' : 'm365_create_failed');
        taskTypes.push('spond_link_pending');

        for (const taskType of taskTypes) {
            db.prepare(`
                INSERT INTO onboarding_tasks (id, user_id, association_id, task_type, status, metadata, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                uuidv4(),
                userId,
                req.user!.associationId,
                taskType,
                taskType.includes('pending') || taskType.includes('failed') ? 'pending' : 'completed',
                taskType === 'harmonie_create' ? JSON.stringify({ tempPassword }) : null,
                taskType.includes('pending') || taskType.includes('failed') ? null : new Date().toISOString()
            );
        }
    });

    logger.info(`User onboarded: ${email}`, { userId, m365Created, createdBy: req.user!.id });

    logAuditEvent(
        req.user!.id,
        'create',
        'user',
        userId,
        `${firstName} ${lastName}`,
        { email, onboarding: true, m365Created },
        req.ip,
        req.get('user-agent')
    );

    res.status(201).json({
        success: true,
        userId,
        email,
        firstName,
        lastName,
        tempPassword, // Return so admin can share with new member
        m365Created,
        m365Error,
        spondLinkPending: true,
        message: 'Lid succesvol aangemaakt.',
        instructions: [
            'Deel het tijdelijke wachtwoord met het nieuwe lid.',
            m365Created
                ? 'Het M365 account is aangemaakt. Het lid moet bij eerste login het wachtwoord wijzigen.'
                : (m365Error ? `M365 account kon niet worden aangemaakt: ${m365Error}` : 'Geen M365 account aangemaakt.'),
            'Nodig het lid uit in de Spond app. De koppeling wordt automatisch gemaakt bij de volgende sync.',
        ],
    });
}));

/**
 * GET /onboarding/pending-links
 * Get members waiting for Spond link
 */
router.get('/pending-links', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const pendingLinks = db.prepare(`
        SELECT
            psl.id,
            psl.user_id,
            psl.expected_email,
            psl.expected_name,
            psl.created_at,
            u.first_name,
            u.last_name,
            u.email
        FROM pending_spond_links psl
        JOIN users u ON psl.user_id = u.id
        WHERE psl.association_id = ?
        ORDER BY psl.created_at DESC
    `).all(req.user!.associationId) as any[];

    res.json(pendingLinks.map(link => ({
        id: link.id,
        userId: link.user_id,
        expectedEmail: link.expected_email,
        expectedName: link.expected_name,
        firstName: link.first_name,
        lastName: link.last_name,
        email: link.email,
        createdAt: link.created_at,
    })));
}));

/**
 * DELETE /onboarding/pending-links/:id
 * Remove a pending Spond link (e.g., after manual linking)
 */
router.delete('/pending-links/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(
        'DELETE FROM pending_spond_links WHERE id = ? AND association_id = ?'
    ).run(req.params.id, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Pending link niet gevonden.');
    }

    res.json({ message: 'Pending link verwijderd.' });
}));

/**
 * GET /onboarding/tasks/:userId
 * Get onboarding tasks for a specific user
 */
router.get('/tasks/:userId', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const tasks = db.prepare(`
        SELECT id, task_type, status, error_message, metadata, completed_at, created_at
        FROM onboarding_tasks
        WHERE user_id = ? AND association_id = ?
        ORDER BY created_at ASC
    `).all(req.params.userId, req.user!.associationId) as any[];

    res.json(tasks.map(task => ({
        id: task.id,
        taskType: task.task_type,
        status: task.status,
        errorMessage: task.error_message,
        metadata: task.metadata ? JSON.parse(task.metadata) : null,
        completedAt: task.completed_at,
        createdAt: task.created_at,
    })));
}));

// ========================================
// OFFBOARDING ENDPOINTS
// ========================================

/**
 * POST /onboarding/offboard/:userId
 * Offboard a member (deactivate, optionally remove from M365)
 */
router.post('/offboard/:userId', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { removeFromM365 } = req.body;
    const { userId } = req.params;

    // Get user
    const user = db.prepare(`
        SELECT id, email, first_name, last_name, microsoft_id, status
        FROM users WHERE id = ? AND association_id = ?
    `).get(userId, req.user!.associationId) as any;

    if (!user) {
        throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    if (user.status === 'inactive') {
        throw new ApiError(400, 'Gebruiker is al gedeactiveerd.');
    }

    // Prevent self-offboarding
    if (userId === req.user!.id) {
        throw new ApiError(400, 'Je kunt jezelf niet offboarden.');
    }

    let m365Removed = false;
    let m365Error: string | null = null;

    // Remove from M365 if requested
    if (removeFromM365 && user.microsoft_id) {
        const msConfig = getMicrosoftConfig(req.user!.associationId);
        if (msConfig) {
            try {
                const accessToken = await getAppAccessToken(msConfig);

                const deleteResponse = await fetch(
                    `https://graph.microsoft.com/v1.0/users/${user.microsoft_id}`,
                    {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${accessToken}` },
                    }
                );

                if (deleteResponse.ok || deleteResponse.status === 404) {
                    m365Removed = true;
                    logger.info(`M365 user deleted: ${user.email}`, { microsoftId: user.microsoft_id, deletedBy: req.user!.id });
                } else {
                    const errorData = await deleteResponse.json() as { error?: { message?: string } };
                    m365Error = errorData.error?.message || 'Kon M365 account niet verwijderen';
                }
            } catch (err) {
                m365Error = err instanceof Error ? err.message : 'Onbekende fout bij M365';
                logger.error('M365 account deletion error', { error: err });
            }
        }
    }

    // Deactivate user in local database
    withTransaction(() => {
        db.prepare(`
            UPDATE users SET status = 'inactive', offboarded_at = CURRENT_TIMESTAMP, microsoft_id = NULL
            WHERE id = ?
        `).run(userId);

        // Remove from orchestras
        db.prepare('DELETE FROM user_orchestras WHERE user_id = ?').run(userId);

        // Remove pending Spond links
        db.prepare('DELETE FROM pending_spond_links WHERE user_id = ?').run(userId);

        // Remove Spond member links
        db.prepare('DELETE FROM spond_member_links WHERE user_id = ?').run(userId);

        // Log offboarding task
        db.prepare(`
            INSERT INTO onboarding_tasks (id, user_id, association_id, task_type, status, metadata, completed_at)
            VALUES (?, ?, ?, 'offboard', 'completed', ?, CURRENT_TIMESTAMP)
        `).run(uuidv4(), userId, req.user!.associationId, JSON.stringify({ m365Removed, offboardedBy: req.user!.id }));
    });

    logger.info(`User offboarded: ${user.email}`, { userId, m365Removed, offboardedBy: req.user!.id });

    logAuditEvent(
        req.user!.id,
        'offboard',
        'user',
        userId,
        `${user.first_name} ${user.last_name}`,
        { email: user.email, m365Removed },
        req.ip,
        req.get('user-agent')
    );

    res.json({
        success: true,
        m365Removed,
        m365Error,
        message: 'Lid is gedeactiveerd.',
        notes: [
            'Het lid is gedeactiveerd in Harmonie.',
            m365Removed ? 'Het M365 account is verwijderd.' : (m365Error || 'Het M365 account is niet verwijderd.'),
            'Vergeet niet het lid handmatig uit Spond te verwijderen.',
        ],
    });
}));

/**
 * POST /onboarding/reactivate/:userId
 * Reactivate a previously offboarded member
 */
router.post('/reactivate/:userId', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userId } = req.params;

    const user = db.prepare(`
        SELECT id, email, first_name, last_name, status
        FROM users WHERE id = ? AND association_id = ?
    `).get(userId, req.user!.associationId) as any;

    if (!user) {
        throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    if (user.status === 'active') {
        throw new ApiError(400, 'Gebruiker is al actief.');
    }

    db.prepare(`
        UPDATE users SET status = 'active', offboarded_at = NULL
        WHERE id = ?
    `).run(userId);

    logger.info(`User reactivated: ${user.email}`, { userId, reactivatedBy: req.user!.id });

    logAuditEvent(
        req.user!.id,
        'reactivate',
        'user',
        userId,
        `${user.first_name} ${user.last_name}`,
        { email: user.email },
        req.ip,
        req.get('user-agent')
    );

    res.json({
        success: true,
        message: 'Lid is geheractiveerd.',
    });
}));

/**
 * GET /onboarding/inactive-members
 * Get all inactive (offboarded) members
 */
router.get('/inactive-members', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const members = db.prepare(`
        SELECT id, email, first_name, last_name, offboarded_at, created_at
        FROM users
        WHERE association_id = ? AND status = 'inactive'
        ORDER BY offboarded_at DESC
    `).all(req.user!.associationId) as any[];

    res.json(members.map(m => ({
        id: m.id,
        email: m.email,
        firstName: m.first_name,
        lastName: m.last_name,
        offboardedAt: m.offboarded_at,
        createdAt: m.created_at,
    })));
}));

export default router;
