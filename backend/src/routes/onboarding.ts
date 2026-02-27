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
import { logAuditEvent } from './audit-logs';
import multer from 'multer';

// Configure multer for profile photo uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (_req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Alleen JPG en PNG bestanden zijn toegestaan'));
        }
    },
});

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

// Supported M365 license SKU part numbers in order of preference
// The first available license with available seats will be assigned
const SUPPORTED_LICENSE_SKUS = [
    // Microsoft 365 Business licenses
    'MICROSOFT_365_BUSINESS_BASIC',
    'O365_BUSINESS_ESSENTIALS',
    'SMB_BUSINESS_ESSENTIALS',
    'O365_BUSINESS_PREMIUM',
    'SMB_BUSINESS_PREMIUM',
    'SPB', // Microsoft 365 Business Premium
    // Microsoft 365 Enterprise licenses
    'ENTERPRISEPACK', // Office 365 E3
    'ENTERPRISEPREMIUM', // Office 365 E5
    'SPE_E3', // Microsoft 365 E3
    'SPE_E5', // Microsoft 365 E5
    'ENTERPRISEPREMIUM_NOPSTNCONF', // Office 365 E5 without Audio Conferencing
    // Microsoft 365 F licenses (Frontline)
    'SPE_F1', // Microsoft 365 F3
    'DESKLESSPACK', // Office 365 F3
    // Exchange Online standalone
    'EXCHANGESTANDARD', // Exchange Online (Plan 1)
    'EXCHANGEENTERPRISE', // Exchange Online (Plan 2)
];

/**
 * Assign a license to a user in M365
 * Searches for any supported license SKU with available seats
 */
async function assignM365License(accessToken: string, userId: string): Promise<boolean> {
    try {
        // First, get available licenses (SKUs) in the tenant
        const skuResponse = await fetch(
            'https://graph.microsoft.com/v1.0/subscribedSkus',
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!skuResponse.ok) {
            logger.warn('Could not fetch subscribed SKUs', { status: skuResponse.status });
            return false;
        }

        const skuData = await skuResponse.json() as { value: { skuId: string; skuPartNumber: string; consumedUnits: number; prepaidUnits: { enabled: number } }[] };

        // Log all available SKUs for debugging
        const availableSkus = skuData.value.map(sku => ({
            partNumber: sku.skuPartNumber,
            available: sku.prepaidUnits.enabled - sku.consumedUnits,
            total: sku.prepaidUnits.enabled,
        }));
        logger.info('Available M365 SKUs in tenant', { skus: availableSkus });

        // Find a supported license with available seats (in order of preference)
        let selectedSku: { skuId: string; skuPartNumber: string; consumedUnits: number; prepaidUnits: { enabled: number } } | undefined;

        for (const supportedSku of SUPPORTED_LICENSE_SKUS) {
            const sku = skuData.value.find(s => s.skuPartNumber === supportedSku);
            if (sku && sku.consumedUnits < sku.prepaidUnits.enabled) {
                selectedSku = sku;
                break;
            }
        }

        if (!selectedSku) {
            // Log which SKUs were found but had no available seats
            const foundButNoSeats = skuData.value
                .filter(s => SUPPORTED_LICENSE_SKUS.includes(s.skuPartNumber))
                .filter(s => s.consumedUnits >= s.prepaidUnits.enabled)
                .map(s => s.skuPartNumber);

            if (foundButNoSeats.length > 0) {
                logger.warn('Found M365 licenses but no seats available', { skus: foundButNoSeats });
            } else {
                logger.warn('No supported M365 license found in tenant', {
                    availableInTenant: skuData.value.map(s => s.skuPartNumber),
                    supportedSkus: SUPPORTED_LICENSE_SKUS,
                });
            }
            return false;
        }

        // Assign the license to the user
        const assignResponse = await fetch(
            `https://graph.microsoft.com/v1.0/users/${userId}/assignLicense`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    addLicenses: [{ skuId: selectedSku.skuId }],
                    removeLicenses: [],
                }),
            }
        );

        if (!assignResponse.ok) {
            const errorData = await assignResponse.json() as { error?: { message?: string } };
            logger.warn('Failed to assign license', {
                error: errorData.error?.message,
                skuPartNumber: selectedSku.skuPartNumber,
                userId,
            });
            return false;
        }

        logger.info(`License assigned to user ${userId}`, {
            skuPartNumber: selectedSku.skuPartNumber,
            availableAfter: selectedSku.prepaidUnits.enabled - selectedSku.consumedUnits - 1,
        });
        return true;
    } catch (err) {
        logger.error('Error assigning license', { error: err });
        return false;
    }
}

/**
 * Add user to M365 groups based on their orchestras
 */
async function addUserToM365Groups(accessToken: string, userId: string, groupNames: string[]): Promise<{ added: string[]; failed: string[] }> {
    const added: string[] = [];
    const failed: string[] = [];

    for (const groupName of groupNames) {
        try {
            // Search for the group by display name
            const searchResponse = await fetch(
                `https://graph.microsoft.com/v1.0/groups?$filter=displayName eq '${encodeURIComponent(groupName)}'`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );

            if (!searchResponse.ok) {
                logger.warn(`Could not search for group: ${groupName}`);
                failed.push(groupName);
                continue;
            }

            const searchData = await searchResponse.json() as { value: { id: string; displayName: string }[] };

            if (searchData.value.length === 0) {
                logger.warn(`Group not found: ${groupName}`);
                failed.push(groupName);
                continue;
            }

            const groupId = searchData.value[0].id;

            // Add user to the group
            const addResponse = await fetch(
                `https://graph.microsoft.com/v1.0/groups/${groupId}/members/$ref`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        '@odata.id': `https://graph.microsoft.com/v1.0/directoryObjects/${userId}`,
                    }),
                }
            );

            if (addResponse.ok || addResponse.status === 204) {
                added.push(groupName);
                logger.info(`User ${userId} added to group ${groupName}`);
            } else if (addResponse.status === 400) {
                // User might already be a member
                added.push(groupName);
            } else {
                const errorData = await addResponse.json() as { error?: { message?: string } };
                logger.warn(`Failed to add user to group ${groupName}`, { error: errorData.error?.message });
                failed.push(groupName);
            }
        } catch (err) {
            logger.error(`Error adding user to group ${groupName}`, { error: err });
            failed.push(groupName);
        }
    }

    return { added, failed };
}

/**
 * Set up email forwarding to private email address
 */
/**
 * Helper function to wait for a specified time
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Try to create an inbox forwarding rule with retry logic
 * The mailbox may not be immediately available after user creation
 */
async function createForwardingRuleWithRetry(
    accessToken: string,
    userId: string,
    forwardingAddress: string,
    maxRetries: number = 5,
    initialDelayMs: number = 3000
): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const ruleResponse = await fetch(
                `https://graph.microsoft.com/v1.0/users/${userId}/mailFolders/inbox/messageRules`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        displayName: 'Forward all mail to private email',
                        sequence: 1,
                        isEnabled: true,
                        conditions: {},
                        actions: {
                            forwardTo: [{
                                emailAddress: {
                                    address: forwardingAddress,
                                },
                            }],
                            stopProcessingRules: false,
                        },
                    }),
                }
            );

            if (ruleResponse.ok) {
                logger.info(`Email forwarding rule created for user ${userId} to ${forwardingAddress} (attempt ${attempt})`);
                return true;
            }

            const errorData = await ruleResponse.json() as { error?: { code?: string; message?: string } };
            const errorCode = errorData.error?.code;
            const errorMessage = errorData.error?.message;

            // Check if it's a mailbox not ready error - these are worth retrying
            const isMailboxNotReady =
                errorCode === 'MailboxNotEnabledForRESTAPI' ||
                errorCode === 'ResourceNotFound' ||
                errorMessage?.includes('mailbox') ||
                errorMessage?.includes('Mailbox') ||
                ruleResponse.status === 404;

            if (isMailboxNotReady && attempt < maxRetries) {
                const delay = initialDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
                logger.info(`Mailbox not ready, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
                await sleep(delay);
                continue;
            }

            // Not a retryable error or max retries reached
            logger.warn(`Could not create forwarding rule after ${attempt} attempts`, {
                error: errorMessage,
                code: errorCode,
                status: ruleResponse.status
            });
            return false;
        } catch (err) {
            if (attempt < maxRetries) {
                const delay = initialDelayMs * Math.pow(2, attempt - 1);
                logger.warn(`Error creating forwarding rule, retrying in ${delay}ms`, { error: err });
                await sleep(delay);
                continue;
            }
            logger.error('Failed to create forwarding rule after all retries', { error: err });
            return false;
        }
    }
    return false;
}

async function setupEmailForwarding(accessToken: string, userId: string, forwardingAddress: string): Promise<boolean> {
    try {
        // First set otherMails as a backup/reference
        const updateResponse = await fetch(
            `https://graph.microsoft.com/v1.0/users/${userId}`,
            {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    otherMails: [forwardingAddress],
                }),
            }
        );

        if (!updateResponse.ok) {
            const errorData = await updateResponse.json() as { error?: { message?: string } };
            logger.warn('Failed to set otherMails', { error: errorData.error?.message });
            // Continue anyway - the forwarding rule is more important
        }

        // Try to create the forwarding rule with retry logic
        // This handles the case where the mailbox is not immediately available
        const ruleCreated = await createForwardingRuleWithRetry(accessToken, userId, forwardingAddress);

        if (ruleCreated) {
            return true;
        }

        // If rule creation failed, return false to indicate forwarding was not set up
        logger.warn('Email forwarding rule could not be created - mailbox may need more time to provision');
        return false;
    } catch (err) {
        logger.error('Error setting up email forwarding', { error: err });
        return false;
    }
}

/**
 * Upload profile photo to M365
 */
async function uploadProfilePhotoToM365(accessToken: string, userId: string, photoBuffer: Buffer): Promise<boolean> {
    try {
        const uploadResponse = await fetch(
            `https://graph.microsoft.com/v1.0/users/${userId}/photo/$value`,
            {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'image/jpeg',
                },
                body: photoBuffer,
            }
        );

        if (uploadResponse.ok || uploadResponse.status === 200) {
            logger.info(`Profile photo uploaded for user ${userId}`);
            return true;
        } else {
            const errorText = await uploadResponse.text();
            logger.warn('Failed to upload profile photo', { status: uploadResponse.status, error: errorText });
            return false;
        }
    } catch (err) {
        logger.error('Error uploading profile photo', { error: err });
        return false;
    }
}

/**
 * Get job title for an instrument from mappings
 */
function getJobTitleForInstrument(instrumentId: string, associationId: string): string | null {
    const mapping = db.prepare(`
        SELECT m.job_title, i.name as instrument_name
        FROM instrument_job_title_mappings m
        JOIN instruments i ON i.id = m.instrument_id
        WHERE m.instrument_id = ? AND m.association_id = ?
    `).get(instrumentId, associationId) as { job_title: string; instrument_name: string } | undefined;

    if (mapping?.job_title) {
        logger.info(`Job title mapping found for instrument`, {
            instrumentId,
            instrumentName: mapping.instrument_name,
            jobTitle: mapping.job_title,
        });
        return mapping.job_title;
    }

    // Get instrument name for logging
    const instrument = db.prepare('SELECT name FROM instruments WHERE id = ?')
        .get(instrumentId) as { name: string } | undefined;

    logger.warn('No job title mapping found for instrument', {
        instrumentId,
        instrumentName: instrument?.name || 'unknown',
        associationId,
        hint: 'Configureer een job title mapping in Instellingen → M365 Integratie → Functietitel Mappings',
    });

    return null;
}

/**
 * Get M365 group names for orchestras
 */
function getM365GroupsForOrchestras(orchestraIds: string[], associationId: string): string[] {
    const groupNames: string[] = [];

    for (const orchestraId of orchestraIds) {
        const mapping = db.prepare(`
            SELECT group_name FROM m365_group_mappings
            WHERE orchestra_id = ? AND association_id = ?
        `).get(orchestraId, associationId) as { group_name: string } | undefined;

        if (mapping?.group_name) {
            groupNames.push(mapping.group_name);
        }
    }

    return groupNames;
}

/**
 * Get M365 group for percussion (slagwerkgroep)
 */
function getPercussionGroupName(associationId: string): string | null {
    const mapping = db.prepare(`
        SELECT group_name FROM m365_group_mappings
        WHERE association_id = ? AND group_type = 'percussion'
    `).get(associationId) as { group_name: string } | undefined;

    return mapping?.group_name || null;
}

/**
 * Check if instrument is a percussion instrument
 */
function isPercussionInstrument(instrumentId: string): boolean {
    const instrument = db.prepare(`
        SELECT name FROM instruments WHERE id = ?
    `).get(instrumentId) as { name: string } | undefined;

    if (!instrument) return false;

    const percussionNames = ['Percussion', 'Timpani', 'Mallets', 'Slagwerk', 'Pauken'];
    return percussionNames.some(name =>
        instrument.name.toLowerCase().includes(name.toLowerCase())
    );
}

/**
 * Save uploaded profile photo to disk
 */
function saveProfilePhoto(userId: string, photoBuffer: Buffer): string {
    const photoDir = path.resolve(config.uploadDir, 'profile-photos');
    if (!fs.existsSync(photoDir)) {
        fs.mkdirSync(photoDir, { recursive: true });
    }

    const filename = `profile-${userId.slice(0, 8)}-${Date.now()}.jpg`;
    const filePath = path.join(photoDir, filename);
    fs.writeFileSync(filePath, photoBuffer);
    return filePath;
}

// ========================================
// ONBOARDING WIZARD ENDPOINTS
// ========================================

/**
 * POST /onboarding/member
 * Start onboarding for a new member
 */
router.post('/member', authenticateToken, requireRole('admin'), upload.single('profilePhoto'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const {
        firstName,
        lastName,
        email,
        privateEmail,
        instrumentIds: instrumentIdsStr,
        orchestraIds: orchestraIdsStr,
        createM365Account: createM365AccountStr,
        m365Password,
        addToPercussionGroup: addToPercussionGroupStr,
    } = req.body;

    // Parse arrays from form data (when sent with multipart/form-data for file upload)
    const instrumentIds = instrumentIdsStr ? (typeof instrumentIdsStr === 'string' ? JSON.parse(instrumentIdsStr) : instrumentIdsStr) : [];
    const orchestraIds = orchestraIdsStr ? (typeof orchestraIdsStr === 'string' ? JSON.parse(orchestraIdsStr) : orchestraIdsStr) : [];
    const createM365Account = createM365AccountStr === 'true' || createM365AccountStr === true;
    const addToPercussionGroup = addToPercussionGroupStr === 'true' || addToPercussionGroupStr === true;
    const profilePhotoBuffer = req.file?.buffer;

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
    let licenseAssigned = false;
    let jobTitleSet: string | null = null;
    let groupsAdded: string[] = [];
    let groupsFailed: string[] = [];
    let emailForwardingSet = false;
    let photoUploaded = false;
    let profilePhotoPath: string | null = null;

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

                // Determine job title from first instrument
                let jobTitle: string | null = null;
                if (instrumentIds.length > 0) {
                    jobTitle = getJobTitleForInstrument(instrumentIds[0], req.user!.associationId!);
                }

                // Determine department from orchestras
                let department: string | null = null;
                if (orchestraIds.length > 0) {
                    const orchestraNames = orchestraIds.map((orchId: string) => {
                        const orch = db.prepare('SELECT name FROM orchestras WHERE id = ?').get(orchId) as { name: string } | undefined;
                        return orch?.name;
                    }).filter(Boolean);
                    department = orchestraNames.join(', ');
                }

                // Create user in M365 with job information
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
                            usageLocation: 'NL', // Required for license assignment
                            jobTitle: jobTitle || undefined,
                            department: department || undefined,
                            otherMails: privateEmail ? [privateEmail] : undefined,
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
                    jobTitleSet = jobTitle; // Track if job title was set
                    logger.info(`M365 user created: ${upn}`, { microsoftId, jobTitle, department, createdBy: req.user!.id });

                    // Assign license
                    licenseAssigned = await assignM365License(accessToken, microsoftId);

                    // Add to M365 groups based on orchestras
                    const groupNamesToAdd: string[] = getM365GroupsForOrchestras(orchestraIds, req.user!.associationId!);

                    // Add percussion group if requested or if instrument is percussion
                    const isPercussion = instrumentIds.some((instId: string) => isPercussionInstrument(instId));
                    if (addToPercussionGroup || isPercussion) {
                        const percussionGroup = getPercussionGroupName(req.user!.associationId!);
                        if (percussionGroup && !groupNamesToAdd.includes(percussionGroup)) {
                            groupNamesToAdd.push(percussionGroup);
                        }
                    }

                    if (groupNamesToAdd.length > 0) {
                        const groupResult = await addUserToM365Groups(accessToken, microsoftId, groupNamesToAdd);
                        groupsAdded = groupResult.added;
                        groupsFailed = groupResult.failed;
                    }

                    // Set up email forwarding if private email is provided
                    if (privateEmail) {
                        emailForwardingSet = await setupEmailForwarding(accessToken, microsoftId, privateEmail);
                    }

                    // Upload profile photo if provided
                    if (profilePhotoBuffer) {
                        photoUploaded = await uploadProfilePhotoToM365(accessToken, microsoftId, profilePhotoBuffer);
                    }
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

    // Save profile photo locally if provided
    if (profilePhotoBuffer) {
        profilePhotoPath = saveProfilePhoto(userId, profilePhotoBuffer);
    }

    // Create user in local database
    withTransaction(() => {
        db.prepare(`
            INSERT INTO users (id, email, password_hash, first_name, last_name, role, status, association_id, microsoft_id, private_email, profile_photo_path, onboarded_at)
            VALUES (?, ?, ?, ?, ?, 'member', 'active', ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(userId, email.toLowerCase(), passwordHash, firstName, lastName, req.user!.associationId, microsoftId, privateEmail || null, profilePhotoPath);

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

    logger.info(`User onboarded: ${email}`, {
        userId,
        m365Created,
        licenseAssigned,
        groupsAdded,
        emailForwardingSet,
        photoUploaded,
        createdBy: req.user!.id,
    });

    logAuditEvent(
        req.user!.id,
        'create',
        'user',
        userId,
        `${firstName} ${lastName}`,
        { email, onboarding: true, m365Created, licenseAssigned, groupsAdded },
        req.ip,
        req.get('user-agent')
    );

    // Build instructions based on what happened
    const instructions: string[] = [
        'Deel het tijdelijke wachtwoord met het nieuwe lid.',
    ];

    if (m365Created) {
        let m365Status = 'Het M365 account is aangemaakt.';

        // License status
        if (licenseAssigned) {
            m365Status += ' Licentie is toegewezen.';
        } else {
            m365Status += ' ⚠️ WAARSCHUWING: Licentie kon NIET worden toegewezen. Controleer of er beschikbare licenties zijn in het Microsoft 365 admin center.';
        }

        // Job title status
        if (jobTitleSet) {
            m365Status += ` Functietitel: "${jobTitleSet}".`;
        } else if (instrumentIds.length > 0) {
            m365Status += ' ⚠️ Functietitel niet ingesteld (geen mapping gevonden voor instrument). Configureer dit in Instellingen → M365 Integratie.';
        }

        // Groups status
        if (groupsAdded.length > 0) {
            m365Status += ` Toegevoegd aan groepen: ${groupsAdded.join(', ')}.`;
        }
        if (groupsFailed.length > 0) {
            m365Status += ` Kon niet toevoegen aan: ${groupsFailed.join(', ')}.`;
        }

        // Email forwarding status
        if (privateEmail) {
            if (emailForwardingSet) {
                m365Status += ` Email forwarding naar ${privateEmail} ingesteld.`;
            } else if (!licenseAssigned) {
                m365Status += ` ⚠️ Email forwarding niet ingesteld (mailbox niet beschikbaar zonder licentie).`;
            } else {
                m365Status += ` ⚠️ Email forwarding kon niet direct worden ingesteld (mailbox wordt nog ingericht). Probeer later opnieuw via ledenlijst.`;
            }
        }

        if (photoUploaded) {
            m365Status += ' Profielfoto is geüpload.';
        }
        m365Status += ' Het lid moet bij eerste login het wachtwoord wijzigen.';
        instructions.push(m365Status);
    } else if (m365Error) {
        instructions.push(`M365 account kon niet worden aangemaakt: ${m365Error}`);
    } else {
        instructions.push('Geen M365 account aangemaakt.');
    }

    instructions.push('Nodig het lid uit in de Spond app. De koppeling wordt automatisch gemaakt bij de volgende sync.');

    res.status(201).json({
        success: true,
        userId,
        email,
        firstName,
        lastName,
        tempPassword,
        m365Created,
        m365Error,
        licenseAssigned,
        jobTitleSet,
        groupsAdded,
        groupsFailed,
        emailForwardingSet,
        photoUploaded,
        spondLinkPending: true,
        message: 'Lid succesvol aangemaakt.',
        instructions,
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

/**
 * POST /onboarding/retry-email-forwarding/:userId
 * Retry setting up email forwarding for an existing user
 * This is useful when the mailbox wasn't ready during initial onboarding
 */
router.post('/retry-email-forwarding/:userId', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userId } = req.params;

    // Get user with their Microsoft ID and private email
    const user = db.prepare(`
        SELECT id, email, first_name, last_name, microsoft_id, private_email
        FROM users WHERE id = ? AND association_id = ?
    `).get(userId, req.user!.associationId) as { id: string; email: string; first_name: string; last_name: string; microsoft_id: string | null; private_email: string | null } | undefined;

    if (!user) {
        throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    if (!user.microsoft_id) {
        throw new ApiError(400, 'Gebruiker heeft geen M365 account.');
    }

    if (!user.private_email) {
        throw new ApiError(400, 'Gebruiker heeft geen privé emailadres geconfigureerd.');
    }

    // Get Microsoft config
    const msConfig = getMicrosoftConfig(req.user!.associationId);
    if (!msConfig || !msConfig.microsoft_enabled || !msConfig.microsoft_client_id || !msConfig.microsoft_client_secret || !msConfig.microsoft_tenant_id) {
        throw new ApiError(400, 'Microsoft integratie is niet geconfigureerd.');
    }

    // Get access token
    const accessToken = await getAppAccessToken(msConfig);

    // Try to set up email forwarding with retry
    const success = await setupEmailForwarding(accessToken, user.microsoft_id, user.private_email);

    if (success) {
        logger.info(`Email forwarding successfully set up for user ${user.email} to ${user.private_email}`);

        // Log success in onboarding tasks
        db.prepare(`
            INSERT INTO onboarding_tasks (id, user_id, association_id, task_type, status, metadata, completed_at)
            VALUES (?, ?, ?, 'email_forwarding_retry', 'completed', ?, CURRENT_TIMESTAMP)
        `).run(
            uuidv4(),
            userId,
            req.user!.associationId,
            JSON.stringify({ privateEmail: user.private_email })
        );

        res.json({
            success: true,
            message: `Email forwarding naar ${user.private_email} is succesvol ingesteld.`,
        });
    } else {
        // Log failure
        db.prepare(`
            INSERT INTO onboarding_tasks (id, user_id, association_id, task_type, status, error_message)
            VALUES (?, ?, ?, 'email_forwarding_retry', 'failed', ?)
        `).run(
            uuidv4(),
            userId,
            req.user!.associationId,
            'Mailbox is mogelijk nog niet beschikbaar. Probeer het later opnieuw.'
        );

        throw new ApiError(500, 'Email forwarding kon niet worden ingesteld. De mailbox is mogelijk nog niet volledig ingericht. Probeer het over enkele minuten opnieuw.');
    }
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

// ========================================
// M365 GROUP MAPPINGS ENDPOINTS
// ========================================

/**
 * GET /onboarding/m365-groups
 * Get all M365 group mappings
 */
router.get('/m365-groups', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const mappings = db.prepare(`
        SELECT m.id, m.orchestra_id, m.group_name, m.group_type, o.name as orchestra_name
        FROM m365_group_mappings m
        LEFT JOIN orchestras o ON m.orchestra_id = o.id
        WHERE m.association_id = ?
        ORDER BY m.group_type, o.name
    `).all(req.user!.associationId) as any[];

    res.json(mappings.map(m => ({
        id: m.id,
        orchestraId: m.orchestra_id,
        orchestraName: m.orchestra_name,
        groupName: m.group_name,
        groupType: m.group_type,
    })));
}));

/**
 * POST /onboarding/m365-groups
 * Create a new M365 group mapping
 */
router.post('/m365-groups', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orchestraId, groupName, groupType } = req.body;

    if (!groupName) {
        throw new ApiError(400, 'Groepsnaam is verplicht.');
    }

    // For orchestra type, orchestraId is required
    if (groupType === 'orchestra' && !orchestraId) {
        throw new ApiError(400, 'Orkest is verplicht voor orkest-groepen.');
    }

    // Check if mapping already exists for this orchestra
    if (orchestraId) {
        const existing = db.prepare(
            'SELECT id FROM m365_group_mappings WHERE orchestra_id = ? AND association_id = ?'
        ).get(orchestraId, req.user!.associationId);
        if (existing) {
            throw new ApiError(409, 'Er bestaat al een mapping voor dit orkest.');
        }
    }

    // For percussion type, check if one already exists
    if (groupType === 'percussion') {
        const existing = db.prepare(
            "SELECT id FROM m365_group_mappings WHERE group_type = 'percussion' AND association_id = ?"
        ).get(req.user!.associationId);
        if (existing) {
            throw new ApiError(409, 'Er bestaat al een slagwerkgroep mapping.');
        }
    }

    const id = uuidv4();
    db.prepare(`
        INSERT INTO m365_group_mappings (id, association_id, orchestra_id, group_name, group_type)
        VALUES (?, ?, ?, ?, ?)
    `).run(id, req.user!.associationId, orchestraId || null, groupName, groupType || 'orchestra');

    logger.info(`M365 group mapping created: ${groupName}`, { orchestraId, groupType, createdBy: req.user!.id });

    res.status(201).json({
        id,
        orchestraId,
        groupName,
        groupType: groupType || 'orchestra',
        message: 'Groep mapping succesvol aangemaakt.',
    });
}));

/**
 * PUT /onboarding/m365-groups/:id
 * Update an M365 group mapping
 */
router.put('/m365-groups/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { groupName } = req.body;

    if (!groupName) {
        throw new ApiError(400, 'Groepsnaam is verplicht.');
    }

    const result = db.prepare(`
        UPDATE m365_group_mappings SET group_name = ?
        WHERE id = ? AND association_id = ?
    `).run(groupName, req.params.id, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Groep mapping niet gevonden.');
    }

    logger.info(`M365 group mapping updated: ${req.params.id}`, { updatedBy: req.user!.id });

    res.json({ message: 'Groep mapping succesvol bijgewerkt.' });
}));

/**
 * DELETE /onboarding/m365-groups/:id
 * Delete an M365 group mapping
 */
router.delete('/m365-groups/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(
        'DELETE FROM m365_group_mappings WHERE id = ? AND association_id = ?'
    ).run(req.params.id, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Groep mapping niet gevonden.');
    }

    logger.info(`M365 group mapping deleted: ${req.params.id}`, { deletedBy: req.user!.id });

    res.json({ message: 'Groep mapping succesvol verwijderd.' });
}));

// ========================================
// INSTRUMENT JOB TITLE MAPPINGS ENDPOINTS
// ========================================

/**
 * GET /onboarding/job-titles
 * Get all instrument to job title mappings
 */
router.get('/job-titles', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const mappings = db.prepare(`
        SELECT m.id, m.instrument_id, m.job_title, i.name as instrument_name, i.tuning as instrument_tuning
        FROM instrument_job_title_mappings m
        JOIN instruments i ON m.instrument_id = i.id
        WHERE m.association_id = ?
        ORDER BY i.name
    `).all(req.user!.associationId) as any[];

    res.json(mappings.map(m => ({
        id: m.id,
        instrumentId: m.instrument_id,
        instrumentName: m.instrument_name,
        instrumentTuning: m.instrument_tuning,
        jobTitle: m.job_title,
    })));
}));

/**
 * POST /onboarding/job-titles
 * Create a new instrument to job title mapping
 */
router.post('/job-titles', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { instrumentId, jobTitle } = req.body;

    if (!instrumentId || !jobTitle) {
        throw new ApiError(400, 'Instrument en functietitel zijn verplicht.');
    }

    // Check if instrument exists
    const instrument = db.prepare('SELECT id, name FROM instruments WHERE id = ?').get(instrumentId) as { id: string; name: string } | undefined;
    if (!instrument) {
        throw new ApiError(404, 'Instrument niet gevonden.');
    }

    // Check if mapping already exists
    const existing = db.prepare(
        'SELECT id FROM instrument_job_title_mappings WHERE instrument_id = ? AND association_id = ?'
    ).get(instrumentId, req.user!.associationId);
    if (existing) {
        throw new ApiError(409, 'Er bestaat al een mapping voor dit instrument.');
    }

    const id = uuidv4();
    db.prepare(`
        INSERT INTO instrument_job_title_mappings (id, association_id, instrument_id, job_title)
        VALUES (?, ?, ?, ?)
    `).run(id, req.user!.associationId, instrumentId, jobTitle);

    logger.info(`Instrument job title mapping created: ${instrument.name} -> ${jobTitle}`, { createdBy: req.user!.id });

    res.status(201).json({
        id,
        instrumentId,
        instrumentName: instrument.name,
        jobTitle,
        message: 'Functietitel mapping succesvol aangemaakt.',
    });
}));

/**
 * PUT /onboarding/job-titles/:id
 * Update an instrument to job title mapping
 */
router.put('/job-titles/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { jobTitle } = req.body;

    if (!jobTitle) {
        throw new ApiError(400, 'Functietitel is verplicht.');
    }

    const result = db.prepare(`
        UPDATE instrument_job_title_mappings SET job_title = ?
        WHERE id = ? AND association_id = ?
    `).run(jobTitle, req.params.id, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Functietitel mapping niet gevonden.');
    }

    logger.info(`Instrument job title mapping updated: ${req.params.id}`, { updatedBy: req.user!.id });

    res.json({ message: 'Functietitel mapping succesvol bijgewerkt.' });
}));

/**
 * DELETE /onboarding/job-titles/:id
 * Delete an instrument to job title mapping
 */
router.delete('/job-titles/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(
        'DELETE FROM instrument_job_title_mappings WHERE id = ? AND association_id = ?'
    ).run(req.params.id, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Functietitel mapping niet gevonden.');
    }

    logger.info(`Instrument job title mapping deleted: ${req.params.id}`, { deletedBy: req.user!.id });

    res.json({ message: 'Functietitel mapping succesvol verwijderd.' });
}));

export default router;
