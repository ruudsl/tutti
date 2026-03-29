import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, optionalAuth, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { z } from 'zod';
import logger from '../utils/logger';

const router = Router();

// =============================================
// VALIDATION SCHEMAS
// =============================================

const baseDiscountCodeSchema = z.object({
    code: z.string().min(1, 'Code is required').max(50, 'Code must be 50 characters or less'),
    description: z.string().max(500).optional(),
    discountType: z.enum(['percentage', 'fixed_amount']),
    discountValue: z.number().min(0, 'Discount value must be non-negative'),
    minOrderAmount: z.number().min(0).default(0),
    maxUses: z.number().int().min(1).nullable().optional(),
    maxUsesPerUser: z.number().int().min(1).default(1),
    validFrom: z.string().datetime().nullable().optional(),
    validUntil: z.string().datetime().nullable().optional(),
    concertIds: z.array(z.string().uuid()).nullable().optional(),
    ticketTypeIds: z.array(z.string().uuid()).nullable().optional(),
    isActive: z.boolean().default(true),
});

const createDiscountCodeSchema = baseDiscountCodeSchema.refine(
    (data) => {
        if (data.discountType === 'percentage' && data.discountValue > 100) {
            return false;
        }
        return true;
    },
    { message: 'Percentage discount cannot exceed 100%' }
).refine(
    (data) => {
        if (data.validFrom && data.validUntil && data.validFrom > data.validUntil) {
            return false;
        }
        return true;
    },
    { message: 'Valid from date must be before valid until date' }
);

const updateDiscountCodeSchema = baseDiscountCodeSchema.omit({ code: true }).partial().refine(
    (data) => {
        if (data.discountType === 'percentage' && data.discountValue !== undefined && data.discountValue > 100) {
            return false;
        }
        return true;
    },
    { message: 'Percentage discount cannot exceed 100%' }
).refine(
    (data) => {
        if (data.validFrom && data.validUntil && data.validFrom > data.validUntil) {
            return false;
        }
        return true;
    },
    { message: 'Valid from date must be before valid until date' }
);

const validateDiscountCodeSchema = z.object({
    code: z.string().min(1, 'Code is required'),
    concertId: z.string().uuid('Invalid concert ID'),
    orderTotal: z.number().min(0, 'Order total must be non-negative'),
    ticketTypeIds: z.array(z.string().uuid()).optional(),
    buyerEmail: z.string().email().optional(),
});

// =============================================
// TYPE DEFINITIONS
// =============================================

interface DiscountCodeRow {
    id: string;
    association_id: string;
    code: string;
    description: string | null;
    discount_type: 'percentage' | 'fixed_amount';
    discount_value: number;
    min_order_amount: number;
    max_uses: number | null;
    uses_count: number;
    max_uses_per_user: number;
    valid_from: string | null;
    valid_until: string | null;
    concert_ids: string | null;
    ticket_type_ids: string | null;
    is_active: number;
    created_at: string;
    created_by: string | null;
}

interface UsageRow {
    id: string;
    discount_code_id: string;
    order_id: string;
    user_email: string;
    discount_amount: number;
    used_at: string;
    concert_name?: string;
    order_total?: number;
}

// =============================================
// HELPER FUNCTIONS
// =============================================

function formatDiscountCode(row: DiscountCodeRow) {
    return {
        id: row.id,
        code: row.code,
        description: row.description,
        discountType: row.discount_type,
        discountValue: row.discount_value,
        minOrderAmount: row.min_order_amount,
        maxUses: row.max_uses,
        usesCount: row.uses_count,
        maxUsesPerUser: row.max_uses_per_user,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        concertIds: row.concert_ids ? JSON.parse(row.concert_ids) : null,
        ticketTypeIds: row.ticket_type_ids ? JSON.parse(row.ticket_type_ids) : null,
        isActive: row.is_active === 1,
        createdAt: row.created_at,
        createdBy: row.created_by,
    };
}

function calculateDiscount(
    discountType: 'percentage' | 'fixed_amount',
    discountValue: number,
    orderTotal: number
): number {
    if (discountType === 'percentage') {
        return Math.round((orderTotal * discountValue / 100) * 100) / 100;
    }
    return Math.min(discountValue, orderTotal);
}

// =============================================
// ADMIN ROUTES
// =============================================

/**
 * @swagger
 * /discount-codes:
 *   get:
 *     summary: List all discount codes for the association
 *     tags: [Discount Codes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of discount codes
 */
router.get('/', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    if (!associationId) {
        throw new ApiError(400, 'No association configured');
    }

    const discountCodes = db.prepare(`
        SELECT *
        FROM discount_codes
        WHERE association_id = ?
        ORDER BY created_at DESC
    `).all(associationId) as DiscountCodeRow[];

    res.json(discountCodes.map(formatDiscountCode));
}));

/**
 * @swagger
 * /discount-codes:
 *   post:
 *     summary: Create a new discount code
 *     tags: [Discount Codes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, discountType, discountValue]
 *             properties:
 *               code:
 *                 type: string
 *               discountType:
 *                 type: string
 *                 enum: [percentage, fixed_amount]
 *               discountValue:
 *                 type: number
 *     responses:
 *       201:
 *         description: Discount code created
 *       409:
 *         description: Code already exists
 */
router.post('/', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    if (!associationId) {
        throw new ApiError(400, 'No association configured');
    }

    const validation = createDiscountCodeSchema.safeParse(req.body);
    if (!validation.success) {
        throw new ApiError(400, validation.error.issues[0].message);
    }

    const data = validation.data;

    // Check if code already exists for this association
    const existing = db.prepare(`
        SELECT id FROM discount_codes WHERE association_id = ? AND UPPER(code) = UPPER(?)
    `).get(associationId, data.code);

    if (existing) {
        throw new ApiError(409, `Discount code "${data.code}" already exists`);
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO discount_codes (
            id, association_id, code, description, discount_type, discount_value,
            min_order_amount, max_uses, max_uses_per_user, valid_from, valid_until,
            concert_ids, ticket_type_ids, is_active, created_at, created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        associationId,
        data.code.toUpperCase(),
        data.description || null,
        data.discountType,
        data.discountValue,
        data.minOrderAmount,
        data.maxUses ?? null,
        data.maxUsesPerUser,
        data.validFrom ?? null,
        data.validUntil ?? null,
        data.concertIds ? JSON.stringify(data.concertIds) : null,
        data.ticketTypeIds ? JSON.stringify(data.ticketTypeIds) : null,
        data.isActive ? 1 : 0,
        now,
        req.user!.id
    );

    logger.info('Discount code created', { id, code: data.code, associationId, userId: req.user!.id });

    const created = db.prepare('SELECT * FROM discount_codes WHERE id = ?').get(id) as DiscountCodeRow;

    res.status(201).json({
        ...formatDiscountCode(created),
        message: 'Discount code created successfully',
    });
}));

/**
 * @swagger
 * /discount-codes/{id}:
 *   get:
 *     summary: Get discount code details with usage stats
 *     tags: [Discount Codes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Discount code details
 *       404:
 *         description: Discount code not found
 */
router.get('/:id', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { id } = req.params;

    if (!associationId) {
        throw new ApiError(400, 'No association configured');
    }

    const discountCode = db.prepare(`
        SELECT * FROM discount_codes WHERE id = ? AND association_id = ?
    `).get(id, associationId) as DiscountCodeRow | undefined;

    if (!discountCode) {
        throw new ApiError(404, 'Discount code not found');
    }

    // Get usage statistics
    const usageStats = db.prepare(`
        SELECT
            COUNT(*) as totalUsages,
            SUM(discount_amount) as totalDiscountGiven,
            COUNT(DISTINCT user_email) as uniqueUsers
        FROM discount_code_usage
        WHERE discount_code_id = ?
    `).get(id) as { totalUsages: number; totalDiscountGiven: number | null; uniqueUsers: number };

    // Get recent usages
    const recentUsages = db.prepare(`
        SELECT
            dcu.id,
            dcu.order_id,
            dcu.user_email,
            dcu.discount_amount,
            dcu.used_at,
            c.name as concert_name
        FROM discount_code_usage dcu
        LEFT JOIN ticket_orders o ON dcu.order_id = o.id
        LEFT JOIN concerts c ON o.concert_id = c.id
        WHERE dcu.discount_code_id = ?
        ORDER BY dcu.used_at DESC
        LIMIT 10
    `).all(id) as UsageRow[];

    res.json({
        ...formatDiscountCode(discountCode),
        stats: {
            totalUsages: usageStats.totalUsages,
            totalDiscountGiven: usageStats.totalDiscountGiven || 0,
            uniqueUsers: usageStats.uniqueUsers,
            remainingUses: discountCode.max_uses ? Math.max(0, discountCode.max_uses - discountCode.uses_count) : null,
        },
        recentUsages: recentUsages.map(u => ({
            id: u.id,
            orderId: u.order_id,
            userEmail: u.user_email,
            discountAmount: u.discount_amount,
            usedAt: u.used_at,
            concertName: u.concert_name,
        })),
    });
}));

/**
 * @swagger
 * /discount-codes/{id}:
 *   put:
 *     summary: Update a discount code
 *     tags: [Discount Codes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Discount code updated
 *       404:
 *         description: Discount code not found
 */
router.put('/:id', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { id } = req.params;

    if (!associationId) {
        throw new ApiError(400, 'No association configured');
    }

    const validation = updateDiscountCodeSchema.safeParse(req.body);
    if (!validation.success) {
        throw new ApiError(400, validation.error.issues[0].message);
    }

    const existing = db.prepare(`
        SELECT * FROM discount_codes WHERE id = ? AND association_id = ?
    `).get(id, associationId) as DiscountCodeRow | undefined;

    if (!existing) {
        throw new ApiError(404, 'Discount code not found');
    }

    const data = validation.data;
    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (data.description !== undefined) {
        updates.push('description = ?');
        params.push(data.description || null);
    }
    if (data.discountType !== undefined) {
        updates.push('discount_type = ?');
        params.push(data.discountType);
    }
    if (data.discountValue !== undefined) {
        updates.push('discount_value = ?');
        params.push(data.discountValue);
    }
    if (data.minOrderAmount !== undefined) {
        updates.push('min_order_amount = ?');
        params.push(data.minOrderAmount);
    }
    if (data.maxUses !== undefined) {
        updates.push('max_uses = ?');
        params.push(data.maxUses);
    }
    if (data.maxUsesPerUser !== undefined) {
        updates.push('max_uses_per_user = ?');
        params.push(data.maxUsesPerUser);
    }
    if (data.validFrom !== undefined) {
        updates.push('valid_from = ?');
        params.push(data.validFrom);
    }
    if (data.validUntil !== undefined) {
        updates.push('valid_until = ?');
        params.push(data.validUntil);
    }
    if (data.concertIds !== undefined) {
        updates.push('concert_ids = ?');
        params.push(data.concertIds ? JSON.stringify(data.concertIds) : null);
    }
    if (data.ticketTypeIds !== undefined) {
        updates.push('ticket_type_ids = ?');
        params.push(data.ticketTypeIds ? JSON.stringify(data.ticketTypeIds) : null);
    }
    if (data.isActive !== undefined) {
        updates.push('is_active = ?');
        params.push(data.isActive ? 1 : 0);
    }

    if (updates.length === 0) {
        throw new ApiError(400, 'No fields to update');
    }

    params.push(id);

    db.prepare(`
        UPDATE discount_codes
        SET ${updates.join(', ')}
        WHERE id = ?
    `).run(...params);

    logger.info('Discount code updated', { id, associationId, userId: req.user!.id });

    const updated = db.prepare('SELECT * FROM discount_codes WHERE id = ?').get(id) as DiscountCodeRow;

    res.json({
        ...formatDiscountCode(updated),
        message: 'Discount code updated successfully',
    });
}));

/**
 * @swagger
 * /discount-codes/{id}:
 *   delete:
 *     summary: Delete a discount code
 *     tags: [Discount Codes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Discount code deleted
 *       404:
 *         description: Discount code not found
 */
router.delete('/:id', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { id } = req.params;

    if (!associationId) {
        throw new ApiError(400, 'No association configured');
    }

    const existing = db.prepare(`
        SELECT id, code FROM discount_codes WHERE id = ? AND association_id = ?
    `).get(id, associationId) as { id: string; code: string } | undefined;

    if (!existing) {
        throw new ApiError(404, 'Discount code not found');
    }

    // Delete usage records first (foreign key)
    db.prepare('DELETE FROM discount_code_usage WHERE discount_code_id = ?').run(id);

    // Delete the discount code
    db.prepare('DELETE FROM discount_codes WHERE id = ?').run(id);

    logger.info('Discount code deleted', { id, code: existing.code, associationId, userId: req.user!.id });

    res.json({ message: 'Discount code deleted successfully' });
}));

/**
 * @swagger
 * /discount-codes/{id}/usage:
 *   get:
 *     summary: Get usage history for a discount code
 *     tags: [Discount Codes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Usage history
 *       404:
 *         description: Discount code not found
 */
router.get('/:id/usage', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    if (!associationId) {
        throw new ApiError(400, 'No association configured');
    }

    const discountCode = db.prepare(`
        SELECT id, code FROM discount_codes WHERE id = ? AND association_id = ?
    `).get(id, associationId) as { id: string; code: string } | undefined;

    if (!discountCode) {
        throw new ApiError(404, 'Discount code not found');
    }

    // Get total count
    const countResult = db.prepare(`
        SELECT COUNT(*) as count FROM discount_code_usage WHERE discount_code_id = ?
    `).get(id) as { count: number };

    // Get usage records with details
    const usages = db.prepare(`
        SELECT
            dcu.id,
            dcu.order_id,
            dcu.user_email,
            dcu.discount_amount,
            dcu.used_at,
            c.name as concert_name,
            o.total as order_total
        FROM discount_code_usage dcu
        LEFT JOIN ticket_orders o ON dcu.order_id = o.id
        LEFT JOIN concerts c ON o.concert_id = c.id
        WHERE dcu.discount_code_id = ?
        ORDER BY dcu.used_at DESC
        LIMIT ? OFFSET ?
    `).all(id, limit, offset) as UsageRow[];

    res.json({
        code: discountCode.code,
        total: countResult.count,
        limit,
        offset,
        usages: usages.map(u => ({
            id: u.id,
            orderId: u.order_id,
            userEmail: u.user_email,
            discountAmount: u.discount_amount,
            usedAt: u.used_at,
            concertName: u.concert_name,
            orderTotal: u.order_total,
        })),
    });
}));

// =============================================
// PUBLIC ROUTES
// =============================================

/**
 * @swagger
 * /discount-codes/validate:
 *   post:
 *     summary: Validate a discount code for checkout
 *     tags: [Discount Codes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, concertId, orderTotal]
 *             properties:
 *               code:
 *                 type: string
 *               concertId:
 *                 type: string
 *               orderTotal:
 *                 type: number
 *     responses:
 *       200:
 *         description: Validation result
 */
router.post('/validate', optionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const validation = validateDiscountCodeSchema.safeParse(req.body);
    if (!validation.success) {
        return res.json({
            valid: false,
            discountType: null,
            discountValue: 0,
            discountAmount: 0,
            message: validation.error.issues[0].message,
        });
    }

    const { code, concertId, orderTotal, ticketTypeIds, buyerEmail } = validation.data;

    // Get the concert to find association
    const concert = db.prepare(`
        SELECT id, association_id FROM concerts WHERE id = ?
    `).get(concertId) as { id: string; association_id: string } | undefined;

    if (!concert) {
        return res.json({
            valid: false,
            discountType: null,
            discountValue: 0,
            discountAmount: 0,
            message: 'Concert not found',
        });
    }

    // Find the discount code
    const discountCode = db.prepare(`
        SELECT * FROM discount_codes
        WHERE association_id = ? AND UPPER(code) = UPPER(?)
    `).get(concert.association_id, code) as DiscountCodeRow | undefined;

    if (!discountCode) {
        return res.json({
            valid: false,
            discountType: null,
            discountValue: 0,
            discountAmount: 0,
            message: 'Invalid discount code',
        });
    }

    // Check if active
    if (discountCode.is_active !== 1) {
        return res.json({
            valid: false,
            discountType: null,
            discountValue: 0,
            discountAmount: 0,
            message: 'This discount code is no longer active',
        });
    }

    const now = new Date().toISOString();

    // Check validity period
    if (discountCode.valid_from && discountCode.valid_from > now) {
        return res.json({
            valid: false,
            discountType: null,
            discountValue: 0,
            discountAmount: 0,
            message: 'This discount code is not yet valid',
        });
    }

    if (discountCode.valid_until && discountCode.valid_until < now) {
        return res.json({
            valid: false,
            discountType: null,
            discountValue: 0,
            discountAmount: 0,
            message: 'This discount code has expired',
        });
    }

    // Check max uses
    if (discountCode.max_uses !== null && discountCode.uses_count >= discountCode.max_uses) {
        return res.json({
            valid: false,
            discountType: null,
            discountValue: 0,
            discountAmount: 0,
            message: 'This discount code has reached its maximum number of uses',
        });
    }

    // Check per-user limit
    const emailToCheck = buyerEmail || req.user?.email;
    if (emailToCheck && discountCode.max_uses_per_user > 0) {
        const userUsageCount = db.prepare(`
            SELECT COUNT(*) as count FROM discount_code_usage
            WHERE discount_code_id = ? AND LOWER(user_email) = LOWER(?)
        `).get(discountCode.id, emailToCheck) as { count: number };

        if (userUsageCount.count >= discountCode.max_uses_per_user) {
            return res.json({
                valid: false,
                discountType: null,
                discountValue: 0,
                discountAmount: 0,
                message: 'You have already used this discount code the maximum number of times',
            });
        }
    }

    // Check minimum order amount
    if (orderTotal < discountCode.min_order_amount) {
        return res.json({
            valid: false,
            discountType: null,
            discountValue: 0,
            discountAmount: 0,
            message: `Minimum order amount of ${discountCode.min_order_amount.toFixed(2)} required for this discount code`,
        });
    }

    // Check concert restrictions
    if (discountCode.concert_ids) {
        const allowedConcerts = JSON.parse(discountCode.concert_ids) as string[];
        if (!allowedConcerts.includes(concertId)) {
            return res.json({
                valid: false,
                discountType: null,
                discountValue: 0,
                discountAmount: 0,
                message: 'This discount code is not valid for this concert',
            });
        }
    }

    // Check ticket type restrictions
    if (discountCode.ticket_type_ids && ticketTypeIds && ticketTypeIds.length > 0) {
        const allowedTypes = JSON.parse(discountCode.ticket_type_ids) as string[];
        const hasAllowedType = ticketTypeIds.some(typeId => allowedTypes.includes(typeId));
        if (!hasAllowedType) {
            return res.json({
                valid: false,
                discountType: null,
                discountValue: 0,
                discountAmount: 0,
                message: 'This discount code is not valid for the selected ticket types',
            });
        }
    }

    // Calculate discount
    const discountAmount = calculateDiscount(
        discountCode.discount_type,
        discountCode.discount_value,
        orderTotal
    );

    res.json({
        valid: true,
        discountType: discountCode.discount_type,
        discountValue: discountCode.discount_value,
        discountAmount,
        message: discountCode.discount_type === 'percentage'
            ? `${discountCode.discount_value}% discount applied`
            : `${discountCode.discount_value.toFixed(2)} discount applied`,
    });
}));

export default router;
