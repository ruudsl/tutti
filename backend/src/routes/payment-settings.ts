import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { z } from 'zod';
import logger from '../utils/logger';
import { encrypt, decrypt, isEncrypted } from '../utils/encryption';

const router = Router();

const MOLLIE_API_URL = 'https://api.mollie.com/v2';
const MOLLIE_STATUS_API = 'https://status.mollie.com/api/v2/summary.json';

// Default payment method fees for Mollie (as of 2024)
const DEFAULT_MOLLIE_FEES: Record<string, number> = {
    ideal: 0.35,
    creditcard: 0.30, // + percentage, but we'll use fixed for simplicity
    bancontact: 0.39,
    paypal: 0.35, // + percentage
    applepay: 0.35,
    googlepay: 0.35,
    banktransfer: 0.30,
};

// Validation schemas
const updateSettingsSchema = z.object({
    passFeesToCustomer: z.boolean().optional(),
});

const updateFeeSchema = z.object({
    customerFee: z.number().min(0),
    isEnabled: z.boolean().optional(),
});

const connectMollieSchema = z.object({
    apiKey: z.string().min(1, 'API key is required'),
    mode: z.enum(['live', 'test']).optional(),
});

const setModeSchema = z.object({
    mode: z.enum(['live', 'test']),
});

/**
 * Detect mode from API key prefix.
 * Mollie keys are prefixed with `live_` or `test_`.
 */
function detectModeFromKey(key: string): 'live' | 'test' {
    return key.startsWith('test_') ? 'test' : 'live';
}

// =============================================
// PAYMENT SETTINGS ROUTES
// =============================================

/**
 * Get payment settings for the current association
 */
router.get('/', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    if (!associationId) {
        throw new ApiError(400, 'No association configured');
    }

    // Get or create payment settings
    let settings = db.prepare(`
        SELECT * FROM payment_settings WHERE association_id = ?
    `).get(associationId) as {
        id: string;
        association_id: string;
        provider: string;
        mollie_profile_id: string | null;
        mollie_test_profile_id: string | null;
        mollie_api_key_encrypted: string | null;
        mollie_test_api_key_encrypted: string | null;
        mollie_mode: string | null;
        pass_fees_to_customer: number;
        is_connected: number;
        can_receive_payments: number;
        can_receive_payouts: number;
        connected_at: string | null;
    } | undefined;

    if (!settings) {
        // Create default settings
        const id = uuidv4();
        db.prepare(`
            INSERT INTO payment_settings (id, association_id, provider)
            VALUES (?, ?, 'mollie')
        `).run(id, associationId);

        settings = {
            id,
            association_id: associationId,
            provider: 'mollie',
            mollie_profile_id: null,
            mollie_test_profile_id: null,
            mollie_api_key_encrypted: null,
            mollie_test_api_key_encrypted: null,
            mollie_mode: 'live',
            pass_fees_to_customer: 0,
            is_connected: 0,
            can_receive_payments: 0,
            can_receive_payouts: 0,
            connected_at: null,
        };

        // Create default fees
        for (const [method, fee] of Object.entries(DEFAULT_MOLLIE_FEES)) {
            db.prepare(`
                INSERT INTO payment_method_fees (id, association_id, method, provider_fee, customer_fee, is_enabled)
                VALUES (?, ?, ?, ?, ?, 1)
            `).run(uuidv4(), associationId, method, fee, fee);
        }
    }

    // Get fees
    const fees = db.prepare(`
        SELECT method, provider_fee, customer_fee, is_enabled
        FROM payment_method_fees
        WHERE association_id = ?
        ORDER BY method
    `).all(associationId) as {
        method: string;
        provider_fee: number;
        customer_fee: number;
        is_enabled: number;
    }[];

    const mode = (settings.mollie_mode as 'live' | 'test') || 'live';
    const activeKeyConfigured =
        mode === 'test' ? !!settings.mollie_test_api_key_encrypted : !!settings.mollie_api_key_encrypted;
    const activeProfileId =
        mode === 'test' ? settings.mollie_test_profile_id : settings.mollie_profile_id;

    res.json({
        provider: settings.provider,
        isConnected: settings.is_connected === 1 && activeKeyConfigured,
        canReceivePayments: settings.can_receive_payments === 1,
        canReceivePayouts: settings.can_receive_payouts === 1,
        profileId: activeProfileId,
        mode,
        liveKeyConfigured: !!settings.mollie_api_key_encrypted,
        testKeyConfigured: !!settings.mollie_test_api_key_encrypted,
        liveProfileId: settings.mollie_profile_id,
        testProfileId: settings.mollie_test_profile_id,
        passFeesToCustomer: settings.pass_fees_to_customer === 1,
        connectedAt: settings.connected_at,
        fees: fees.map(f => ({
            method: f.method,
            providerFee: f.provider_fee,
            customerFee: f.customer_fee,
            isEnabled: f.is_enabled === 1,
        })),
    });
}));

/**
 * Update payment settings
 */
router.put('/', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const validation = updateSettingsSchema.safeParse(req.body);

    if (!validation.success) {
        throw new ApiError(400, validation.error.issues[0].message);
    }

    const { passFeesToCustomer } = validation.data;

    if (passFeesToCustomer !== undefined) {
        db.prepare(`
            UPDATE payment_settings
            SET pass_fees_to_customer = ?, updated_at = CURRENT_TIMESTAMP
            WHERE association_id = ?
        `).run(passFeesToCustomer ? 1 : 0, associationId);
    }

    res.json({ success: true });
}));

/**
 * Update a payment method fee
 */
router.put('/fees/:method', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { method } = req.params;
    const validation = updateFeeSchema.safeParse(req.body);

    if (!validation.success) {
        throw new ApiError(400, validation.error.issues[0].message);
    }

    const { customerFee, isEnabled } = validation.data;

    const existing = db.prepare(`
        SELECT id FROM payment_method_fees WHERE association_id = ? AND method = ?
    `).get(associationId, method);

    if (!existing) {
        throw new ApiError(404, 'Payment method not found');
    }

    const updates: string[] = ['customer_fee = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const params: (number | string)[] = [customerFee];

    if (isEnabled !== undefined) {
        updates.push('is_enabled = ?');
        params.push(isEnabled ? 1 : 0);
    }

    params.push(associationId!, method);

    db.prepare(`
        UPDATE payment_method_fees
        SET ${updates.join(', ')}
        WHERE association_id = ? AND method = ?
    `).run(...params);

    res.json({ success: true });
}));

/**
 * Connect Mollie account
 */
router.post('/mollie/connect', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const validation = connectMollieSchema.safeParse(req.body);

    if (!validation.success) {
        throw new ApiError(400, validation.error.issues[0].message);
    }

    const { apiKey, mode: explicitMode } = validation.data;
    const mode = explicitMode || detectModeFromKey(apiKey);

    // Verify API key by fetching organization info
    try {
        const orgResponse = await fetch(`${MOLLIE_API_URL}/organizations/me`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });

        if (!orgResponse.ok) {
            throw new ApiError(400, 'Invalid Mollie API key');
        }

        const orgData = await orgResponse.json() as {
            id: string;
            name: string;
        };

        // Check payment methods
        const methodsResponse = await fetch(`${MOLLIE_API_URL}/methods`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });

        let canReceivePayments = false;
        if (methodsResponse.ok) {
            const methodsData = await methodsResponse.json() as { count: number };
            canReceivePayments = methodsData.count > 0;
        }

        // Encrypt API key using AES-256-GCM
        const encryptedKey = encrypt(apiKey);

        // Save key to the appropriate column based on mode
        if (mode === 'test') {
            db.prepare(`
                UPDATE payment_settings
                SET mollie_test_profile_id = ?,
                    mollie_test_api_key_encrypted = ?,
                    mollie_mode = 'test',
                    is_connected = 1,
                    can_receive_payments = ?,
                    can_receive_payouts = 1,
                    connected_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE association_id = ?
            `).run(orgData.id, encryptedKey, canReceivePayments ? 1 : 0, associationId);
        } else {
            db.prepare(`
                UPDATE payment_settings
                SET mollie_profile_id = ?,
                    mollie_api_key_encrypted = ?,
                    mollie_mode = 'live',
                    is_connected = 1,
                    can_receive_payments = ?,
                    can_receive_payouts = 1,
                    connected_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE association_id = ?
            `).run(orgData.id, encryptedKey, canReceivePayments ? 1 : 0, associationId);
        }

        logger.info(`Mollie connected for association ${associationId} in ${mode} mode`, {
            profileId: orgData.id,
            associationId,
            mode,
        });

        res.json({
            success: true,
            profileId: orgData.id,
            organisationName: orgData.name,
            canReceivePayments,
            mode,
        });
    } catch (error) {
        if (error instanceof ApiError) throw error;
        logger.error('Failed to connect Mollie:', error);
        throw new ApiError(500, 'Failed to connect to Mollie');
    }
}));

/**
 * Switch active Mollie mode (live/test)
 */
router.put('/mollie/mode', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const validation = setModeSchema.safeParse(req.body);

    if (!validation.success) {
        throw new ApiError(400, validation.error.issues[0].message);
    }

    const { mode } = validation.data;

    // Verify that the key for the requested mode is configured
    const row = db.prepare(`
        SELECT mollie_api_key_encrypted, mollie_test_api_key_encrypted
        FROM payment_settings WHERE association_id = ?
    `).get(associationId) as {
        mollie_api_key_encrypted: string | null;
        mollie_test_api_key_encrypted: string | null;
    } | undefined;

    const keyForMode =
        mode === 'test' ? row?.mollie_test_api_key_encrypted : row?.mollie_api_key_encrypted;

    if (!keyForMode) {
        throw new ApiError(
            400,
            mode === 'test'
                ? 'Geen test API-sleutel geconfigureerd.'
                : 'Geen live API-sleutel geconfigureerd.'
        );
    }

    db.prepare(`
        UPDATE payment_settings
        SET mollie_mode = ?, updated_at = CURRENT_TIMESTAMP
        WHERE association_id = ?
    `).run(mode, associationId);

    logger.info(`Mollie mode changed to ${mode} for association ${associationId}`);

    res.json({ success: true, mode });
}));

/**
 * Delete a specific Mollie API key (live or test) without fully disconnecting
 */
router.delete('/mollie/key/:mode', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const mode = req.params.mode;

    if (mode !== 'live' && mode !== 'test') {
        throw new ApiError(400, 'Invalid mode. Use live or test.');
    }

    if (mode === 'test') {
        db.prepare(`
            UPDATE payment_settings
            SET mollie_test_api_key_encrypted = NULL,
                mollie_test_profile_id = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE association_id = ?
        `).run(associationId);
    } else {
        db.prepare(`
            UPDATE payment_settings
            SET mollie_api_key_encrypted = NULL,
                mollie_profile_id = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE association_id = ?
        `).run(associationId);
    }

    // If we just deleted the active key, update connection flags and switch mode if possible
    const row = db.prepare(`
        SELECT mollie_api_key_encrypted, mollie_test_api_key_encrypted, mollie_mode
        FROM payment_settings WHERE association_id = ?
    `).get(associationId) as {
        mollie_api_key_encrypted: string | null;
        mollie_test_api_key_encrypted: string | null;
        mollie_mode: string;
    };

    const activeKey =
        row.mollie_mode === 'test' ? row.mollie_test_api_key_encrypted : row.mollie_api_key_encrypted;

    if (!activeKey) {
        const otherMode = row.mollie_mode === 'test' ? 'live' : 'test';
        const otherKey =
            otherMode === 'test' ? row.mollie_test_api_key_encrypted : row.mollie_api_key_encrypted;

        db.prepare(`
            UPDATE payment_settings
            SET mollie_mode = ?,
                is_connected = ?,
                can_receive_payments = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE association_id = ?
        `).run(otherKey ? otherMode : row.mollie_mode, otherKey ? 1 : 0, otherKey ? 1 : 0, associationId);
    }

    logger.info(`Mollie ${mode} key deleted for association ${associationId}`);

    res.json({ success: true });
}));

/**
 * Disconnect Mollie account
 */
router.post('/mollie/disconnect', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    db.prepare(`
        UPDATE payment_settings
        SET mollie_profile_id = NULL,
            mollie_api_key_encrypted = NULL,
            mollie_test_profile_id = NULL,
            mollie_test_api_key_encrypted = NULL,
            is_connected = 0,
            can_receive_payments = 0,
            can_receive_payouts = 0,
            connected_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE association_id = ?
    `).run(associationId);

    logger.info(`Mollie disconnected for association ${associationId}`);

    res.json({ success: true });
}));

/**
 * Get Mollie status (from status.mollie.com)
 */
router.get('/mollie/status', authenticateToken, asyncHandler(async (_req: AuthRequest, res: Response) => {
    try {
        const response = await fetch(MOLLIE_STATUS_API);

        if (!response.ok) {
            return res.json({
                operational: true,
                incidents: [],
            });
        }

        const data = await response.json() as {
            status: {
                indicator: string;
                description: string;
            };
            incidents: {
                name: string;
                status: string;
                updated_at: string;
            }[];
        };

        res.json({
            operational: data.status.indicator === 'none',
            statusDescription: data.status.description,
            incidents: (data.incidents || []).slice(0, 5).map(i => ({
                name: i.name,
                status: i.status,
                updatedAt: i.updated_at,
            })),
        });
    } catch (error) {
        logger.error('Failed to fetch Mollie status:', error);
        res.json({
            operational: true,
            incidents: [],
        });
    }
}));

/**
 * Test Mollie connection
 */
router.get('/mollie/test', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const settings = db.prepare(`
        SELECT mollie_api_key_encrypted, mollie_test_api_key_encrypted, mollie_mode
        FROM payment_settings WHERE association_id = ?
    `).get(associationId) as {
        mollie_api_key_encrypted: string | null;
        mollie_test_api_key_encrypted: string | null;
        mollie_mode: string | null;
    } | undefined;

    const mode = (settings?.mollie_mode as 'live' | 'test') || 'live';
    const encryptedKey =
        mode === 'test' ? settings?.mollie_test_api_key_encrypted : settings?.mollie_api_key_encrypted;

    if (!encryptedKey) {
        return res.json({
            connected: false,
            canReceivePayments: false,
            canReceivePayouts: false,
        });
    }

    // Decrypt API key (migrate from base64 if needed)
    let apiKey: string;
    if (isEncrypted(encryptedKey)) {
      apiKey = decrypt(encryptedKey);
    } else {
      // Legacy base64 format - decrypt and re-encrypt properly
      apiKey = Buffer.from(encryptedKey, 'base64').toString('utf-8');
      const properlyEncrypted = encrypt(apiKey);
      const column = mode === 'test' ? 'mollie_test_api_key_encrypted' : 'mollie_api_key_encrypted';
      db.prepare(`UPDATE payment_settings SET ${column} = ? WHERE association_id = ?`).run(properlyEncrypted, associationId);
    }

    try {
        // Check organization
        const orgResponse = await fetch(`${MOLLIE_API_URL}/organizations/me`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });

        if (!orgResponse.ok) {
            db.prepare(`
                UPDATE payment_settings
                SET is_connected = 0, can_receive_payments = 0, can_receive_payouts = 0, updated_at = CURRENT_TIMESTAMP
                WHERE association_id = ?
            `).run(associationId);

            return res.json({
                connected: false,
                canReceivePayments: false,
                canReceivePayouts: false,
                error: 'API key is no longer valid',
            });
        }

        // Check payment methods
        const methodsResponse = await fetch(`${MOLLIE_API_URL}/methods`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });

        let canReceivePayments = false;
        if (methodsResponse.ok) {
            const methodsData = await methodsResponse.json() as { count: number };
            canReceivePayments = methodsData.count > 0;
        }

        // Update status
        db.prepare(`
            UPDATE payment_settings
            SET is_connected = 1, can_receive_payments = ?, last_status_check = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE association_id = ?
        `).run(canReceivePayments ? 1 : 0, associationId);

        res.json({
            connected: true,
            canReceivePayments,
            canReceivePayouts: true,
        });
    } catch (error) {
        logger.error('Failed to test Mollie connection:', error);
        res.json({
            connected: false,
            canReceivePayments: false,
            canReceivePayouts: false,
            error: 'Failed to connect to Mollie',
        });
    }
}));

export default router;
