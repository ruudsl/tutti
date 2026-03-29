import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { z } from 'zod';
import logger from '../utils/logger';

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
});

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

    res.json({
        provider: settings.provider,
        isConnected: settings.is_connected === 1,
        canReceivePayments: settings.can_receive_payments === 1,
        canReceivePayouts: settings.can_receive_payouts === 1,
        profileId: settings.mollie_profile_id,
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

    const { apiKey } = validation.data;

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

        // TODO: Encrypt API key before storing
        // For now, we store it as-is (in production, use proper encryption)
        const encryptedKey = Buffer.from(apiKey).toString('base64');

        db.prepare(`
            UPDATE payment_settings
            SET mollie_profile_id = ?,
                mollie_api_key_encrypted = ?,
                is_connected = 1,
                can_receive_payments = ?,
                can_receive_payouts = 1,
                connected_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE association_id = ?
        `).run(orgData.id, encryptedKey, canReceivePayments ? 1 : 0, associationId);

        logger.info(`Mollie connected for association ${associationId}`, {
            profileId: orgData.id,
            associationId,
        });

        res.json({
            success: true,
            profileId: orgData.id,
            organisationName: orgData.name,
            canReceivePayments,
        });
    } catch (error) {
        if (error instanceof ApiError) throw error;
        logger.error('Failed to connect Mollie:', error);
        throw new ApiError(500, 'Failed to connect to Mollie');
    }
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
        SELECT mollie_api_key_encrypted FROM payment_settings WHERE association_id = ?
    `).get(associationId) as { mollie_api_key_encrypted: string | null } | undefined;

    if (!settings?.mollie_api_key_encrypted) {
        return res.json({
            connected: false,
            canReceivePayments: false,
            canReceivePayouts: false,
        });
    }

    // Decrypt API key (basic base64 for now)
    const apiKey = Buffer.from(settings.mollie_api_key_encrypted, 'base64').toString('utf-8');

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
