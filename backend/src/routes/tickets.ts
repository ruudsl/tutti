import { Router, Response, Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, optionalAuth, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { z } from 'zod';
import {
    generateSecureTicketCode,
    generateQRCode,
    sendTicketConfirmationEmail,
    validateTicket,
    markTicketAsUsed,
    getAvailableTickets,
    reserveTickets,
    releaseTickets,
    getConcertTicketStats,
    exportAttendeeList,
} from '../services/ticketing';
import { getSalesPredictionSummary } from '../services/salesPredictions';
import {
    createPayment,
    getPaymentStatus,
    getAvailablePaymentMethods,
    getPaymentProvider,
    handleMollieWebhook,
    verifyStripeWebhook,
    handleStripeWebhook,
    createRefund,
    PaymentMethod,
} from '../services/payments';
import {
    verifyCaptcha,
    shouldRequireCaptcha,
    trackCheckoutRequest,
    isCaptchaEnabled,
    getCaptchaSiteKey,
} from '../services/captcha';
import logger from '../utils/logger';

const router = Router();

// Validation schemas
const createTicketTypeSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    price: z.number().min(0, 'Price must be non-negative'),
    quantity: z.number().int().min(1, 'Quantity must be at least 1'),
    description: z.string().optional(),
    saleStart: z.string().datetime().optional(),
    saleEnd: z.string().datetime().optional(),
    maxPerOrder: z.number().int().min(1).max(50).default(10),
    serviceFee: z.number().min(0, 'Service fee must be non-negative').default(0),
    showServiceFeeSeparate: z.boolean().default(false),
});

const updateTicketTypeSchema = createTicketTypeSchema.partial();

const createOrderSchema = z.object({
    items: z.array(z.object({
        ticketTypeId: z.string().uuid(),
        quantity: z.number().int().min(1).max(50),
    })).min(1, 'At least one ticket required'),
    buyerName: z.string().min(1, 'Buyer name is required'),
    buyerEmail: z.string().email('Valid email required'),
    buyerPhone: z.string().optional(),
    notes: z.string().optional(),
    captchaToken: z.string().optional(),
    language: z.enum(['nl', 'en', 'de']).default('nl'),
});

const payOrderSchema = z.object({
    method: z.enum(['ideal', 'creditcard', 'bancontact', 'paypal', 'applepay', 'googlepay']).optional(),
    returnUrl: z.string().url().optional(),
});

// =============================================
// PUBLIC ROUTES (with optional auth)
// =============================================

/**
 * @swagger
 * /concerts/{id}/tickets:
 *   get:
 *     summary: Get available ticket types for a concert
 *     tags: [Tickets]
 */
router.get('/concerts/:id/tickets', optionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id: concertId } = req.params;

    // Check if concert exists
    const concert = db.prepare(`
        SELECT id, name, date, end_date, location, description, concert_type
        FROM concerts
        WHERE id = ?
    `).get(concertId) as {
        id: string;
        name: string;
        date: string;
        end_date: string | null;
        location: string | null;
        description: string | null;
        concert_type: string | null;
    } | undefined;

    if (!concert) {
        throw new ApiError(404, 'Concert not found');
    }

    // Get ticket types
    const ticketTypes = db.prepare(`
        SELECT
            id,
            name,
            price,
            quantity,
            sold,
            description,
            sale_start,
            sale_end,
            max_per_order,
            service_fee,
            show_service_fee_separate
        FROM ticket_types
        WHERE concert_id = ?
        ORDER BY price ASC
    `).all(concertId) as {
        id: string;
        name: string;
        price: number;
        quantity: number;
        sold: number;
        description: string | null;
        sale_start: string | null;
        sale_end: string | null;
        max_per_order: number;
        service_fee: number;
        show_service_fee_separate: number;
    }[];

    const now = new Date().toISOString();

    res.json({
        concert: {
            id: concert.id,
            name: concert.name,
            date: concert.date,
            endDate: concert.end_date,
            location: concert.location,
            description: concert.description,
            concertType: concert.concert_type,
        },
        ticketTypes: ticketTypes.map(tt => ({
            id: tt.id,
            name: tt.name,
            price: tt.price,
            quantity: tt.quantity,
            available: Math.max(0, tt.quantity - tt.sold),
            description: tt.description,
            maxPerOrder: tt.max_per_order,
            onSale: (!tt.sale_start || tt.sale_start <= now) &&
                (!tt.sale_end || tt.sale_end >= now),
            saleStart: tt.sale_start,
            saleEnd: tt.sale_end,
            serviceFee: tt.service_fee || 0,
            showServiceFeeSeparate: Boolean(tt.show_service_fee_separate),
        })),
        paymentMethods: getAvailablePaymentMethods(),
        captcha: {
            enabled: isCaptchaEnabled(),
            siteKey: getCaptchaSiteKey(),
        },
    });
}));

/**
 * @swagger
 * /concerts/{id}/tickets/order:
 *   post:
 *     summary: Create a ticket order
 *     tags: [Tickets]
 */
router.post('/concerts/:id/tickets/order', optionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id: concertId } = req.params;
    const validation = createOrderSchema.safeParse(req.body);

    if (!validation.success) {
        throw new ApiError(400, validation.error.issues[0].message);
    }

    const { items, buyerName, buyerEmail, buyerPhone, notes, captchaToken, language } = validation.data;

    // Get client IP address
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || req.socket.remoteAddress
        || 'unknown';
    const userAgent = req.headers['user-agent'] || '';

    // Track checkout request for rate limiting
    trackCheckoutRequest(clientIp);

    // Check concert exists
    const concert = db.prepare(`
        SELECT id, name, date, location, association_id
        FROM concerts
        WHERE id = ?
    `).get(concertId) as {
        id: string;
        name: string;
        date: string;
        location: string | null;
        association_id: string;
    } | undefined;

    if (!concert) {
        throw new ApiError(404, 'Concert not found');
    }

    // Verify all ticket types and calculate total
    let subtotal = 0;
    let totalServiceFee = 0;
    const orderItems: { ticketTypeId: string; quantity: number; unitPrice: number; serviceFee: number; name: string; showServiceFeeSeparate: boolean }[] = [];

    for (const item of items) {
        const ticketType = db.prepare(`
            SELECT id, name, price, quantity, sold, sale_start, sale_end, max_per_order, concert_id, service_fee, show_service_fee_separate
            FROM ticket_types
            WHERE id = ?
        `).get(item.ticketTypeId) as {
            id: string;
            name: string;
            price: number;
            quantity: number;
            sold: number;
            sale_start: string | null;
            sale_end: string | null;
            max_per_order: number;
            concert_id: string;
            service_fee: number;
            show_service_fee_separate: number;
        } | undefined;

        if (!ticketType) {
            throw new ApiError(400, `Ticket type ${item.ticketTypeId} not found`);
        }

        if (ticketType.concert_id !== concertId) {
            throw new ApiError(400, 'Ticket type does not belong to this concert');
        }

        // Check sale period
        const now = new Date().toISOString();
        if (ticketType.sale_start && ticketType.sale_start > now) {
            throw new ApiError(400, `Sales for "${ticketType.name}" have not started yet`);
        }
        if (ticketType.sale_end && ticketType.sale_end < now) {
            throw new ApiError(400, `Sales for "${ticketType.name}" have ended`);
        }

        // Check max per order
        if (item.quantity > ticketType.max_per_order) {
            throw new ApiError(400, `Maximum ${ticketType.max_per_order} tickets per order for "${ticketType.name}"`);
        }

        // Check availability
        const available = ticketType.quantity - ticketType.sold;
        if (item.quantity > available) {
            throw new ApiError(400, `Only ${available} tickets available for "${ticketType.name}"`);
        }

        const serviceFee = ticketType.service_fee || 0;
        orderItems.push({
            ticketTypeId: ticketType.id,
            quantity: item.quantity,
            unitPrice: ticketType.price,
            serviceFee: serviceFee,
            name: ticketType.name,
            showServiceFeeSeparate: Boolean(ticketType.show_service_fee_separate),
        });

        subtotal += ticketType.price * item.quantity;
        totalServiceFee += serviceFee * item.quantity;
    }
    const total = subtotal + totalServiceFee;

    // CAPTCHA verification
    let captchaVerified = false;
    if (shouldRequireCaptcha(clientIp, total)) {
        if (!captchaToken) {
            throw new ApiError(400, 'CAPTCHA verification required');
        }

        const captchaResult = await verifyCaptcha(captchaToken, clientIp);
        if (!captchaResult.success) {
            throw new ApiError(400, captchaResult.error || 'CAPTCHA verification failed');
        }
        captchaVerified = true;
    }

    // Create order with transaction
    const orderId = uuidv4();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes

    const createOrder = db.transaction(() => {
        // Reserve tickets
        for (const item of orderItems) {
            const reservation = reserveTickets(item.ticketTypeId, item.quantity);
            if (!reservation.success) {
                throw new ApiError(400, reservation.message);
            }
        }

        // Create order
        db.prepare(`
            INSERT INTO ticket_orders (id, user_id, concert_id, total, status, buyer_name, buyer_email, buyer_phone, notes, expires_at, captcha_verified, ip_address, user_agent, language)
            VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            orderId,
            req.user?.id || null,
            concertId,
            total,
            buyerName,
            buyerEmail,
            buyerPhone || null,
            notes || null,
            expiresAt,
            captchaVerified ? 1 : 0,
            clientIp,
            userAgent,
            language
        );

        // Create order items
        for (const item of orderItems) {
            db.prepare(`
                INSERT INTO ticket_order_items (id, order_id, ticket_type_id, quantity, unit_price)
                VALUES (?, ?, ?, ?, ?)
            `).run(uuidv4(), orderId, item.ticketTypeId, item.quantity, item.unitPrice);
        }
    });

    try {
        createOrder();
    } catch (error) {
        logger.error('Failed to create order:', error);
        throw new ApiError(500, 'Failed to create order');
    }

    // Check if any item shows service fee separately
    const showServiceFeeSeparate = orderItems.some(item => item.showServiceFeeSeparate);

    res.status(201).json({
        orderId,
        subtotal,
        serviceFee: totalServiceFee,
        total,
        showServiceFeeSeparate,
        expiresAt,
        items: orderItems.map(item => ({
            ticketTypeId: item.ticketTypeId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            serviceFee: item.serviceFee,
            subtotal: item.unitPrice * item.quantity,
            serviceFeeTotal: item.serviceFee * item.quantity,
        })),
    });
}));

/**
 * @swagger
 * /tickets/orders/{id}:
 *   get:
 *     summary: Get order details
 *     tags: [Tickets]
 */
router.get('/tickets/orders/:id', optionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id: orderId } = req.params;

    const order = db.prepare(`
        SELECT
            o.id,
            o.user_id,
            o.concert_id,
            o.total,
            o.status,
            o.payment_id,
            o.payment_method,
            o.buyer_name,
            o.buyer_email,
            o.buyer_phone,
            o.notes,
            o.expires_at,
            o.paid_at,
            o.created_at,
            c.name as concert_name,
            c.date as concert_date,
            c.location as concert_location
        FROM ticket_orders o
        JOIN concerts c ON o.concert_id = c.id
        WHERE o.id = ?
    `).get(orderId) as {
        id: string;
        user_id: string | null;
        concert_id: string;
        total: number;
        status: string;
        payment_id: string | null;
        payment_method: string | null;
        buyer_name: string;
        buyer_email: string;
        buyer_phone: string | null;
        notes: string | null;
        expires_at: string | null;
        paid_at: string | null;
        created_at: string;
        concert_name: string;
        concert_date: string;
        concert_location: string | null;
    } | undefined;

    if (!order) {
        throw new ApiError(404, 'Order not found');
    }

    // Get order items
    const items = db.prepare(`
        SELECT
            oi.ticket_type_id,
            oi.quantity,
            oi.unit_price,
            tt.name
        FROM ticket_order_items oi
        JOIN ticket_types tt ON oi.ticket_type_id = tt.id
        WHERE oi.order_id = ?
    `).all(orderId) as {
        ticket_type_id: string;
        quantity: number;
        unit_price: number;
        name: string;
    }[];

    // Get tickets if order is paid
    let tickets: {
        id: string;
        qrCode: string;
        status: string;
        seatInfo: string | null;
        ticketTypeName: string;
    }[] = [];

    if (order.status === 'paid') {
        tickets = db.prepare(`
            SELECT
                t.id,
                t.qr_code as qrCode,
                t.status,
                t.seat_info as seatInfo,
                tt.name as ticketTypeName
            FROM tickets t
            JOIN ticket_types tt ON t.ticket_type_id = tt.id
            WHERE t.order_id = ?
        `).all(orderId) as typeof tickets;
    }

    res.json({
        id: order.id,
        concertId: order.concert_id,
        concertName: order.concert_name,
        concertDate: order.concert_date,
        concertLocation: order.concert_location,
        total: order.total,
        status: order.status,
        buyerName: order.buyer_name,
        buyerEmail: order.buyer_email,
        buyerPhone: order.buyer_phone,
        paymentMethod: order.payment_method,
        expiresAt: order.expires_at,
        paidAt: order.paid_at,
        createdAt: order.created_at,
        items: items.map(item => ({
            ticketTypeId: item.ticket_type_id,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            subtotal: item.unit_price * item.quantity,
        })),
        tickets,
    });
}));

/**
 * @swagger
 * /tickets/orders/{id}/pay:
 *   post:
 *     summary: Initialize payment for an order
 *     tags: [Tickets]
 */
router.post('/tickets/orders/:id/pay', optionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id: orderId } = req.params;
    const validation = payOrderSchema.safeParse(req.body);

    if (!validation.success) {
        throw new ApiError(400, validation.error.issues[0].message);
    }

    const { method, returnUrl } = validation.data;

    // Get order
    const order = db.prepare(`
        SELECT
            o.id,
            o.total,
            o.status,
            o.buyer_name,
            o.buyer_email,
            o.expires_at,
            c.name as concert_name,
            c.association_id
        FROM ticket_orders o
        JOIN concerts c ON o.concert_id = c.id
        WHERE o.id = ?
    `).get(orderId) as {
        id: string;
        total: number;
        status: string;
        buyer_name: string;
        buyer_email: string;
        expires_at: string | null;
        concert_name: string;
        association_id: string;
    } | undefined;

    if (!order) {
        throw new ApiError(404, 'Order not found');
    }

    if (order.status !== 'pending') {
        throw new ApiError(400, `Order is ${order.status}, cannot pay`);
    }

    // Check if order expired
    if (order.expires_at && new Date(order.expires_at) < new Date()) {
        // Release tickets and mark as expired
        const items = db.prepare(`
            SELECT ticket_type_id, quantity FROM ticket_order_items WHERE order_id = ?
        `).all(orderId) as { ticket_type_id: string; quantity: number }[];

        for (const item of items) {
            releaseTickets(item.ticket_type_id, item.quantity);
        }

        db.prepare(`UPDATE ticket_orders SET status = 'expired' WHERE id = ?`).run(orderId);
        throw new ApiError(400, 'Order has expired');
    }

    // Get base URL for redirects
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const redirectUrl = returnUrl || `${baseUrl}/tickets/orders/${orderId}`;
    const webhookUrl = `${process.env.API_URL || 'http://localhost:3000'}/api/tickets/webhooks/payment`;

    // Create payment
    const paymentResult = await createPayment({
        orderId,
        amount: order.total,
        description: `Tickets for ${order.concert_name}`,
        redirectUrl,
        webhookUrl,
        method: method as PaymentMethod,
        customerEmail: order.buyer_email,
        customerName: order.buyer_name,
        metadata: {
            concert_name: order.concert_name,
        },
    });

    if (!paymentResult.success) {
        throw new ApiError(500, paymentResult.error || 'Failed to create payment');
    }

    // Update order with payment ID
    db.prepare(`
        UPDATE ticket_orders
        SET payment_id = ?, payment_method = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(paymentResult.paymentId, method || 'unknown', orderId);

    res.json({
        paymentId: paymentResult.paymentId,
        checkoutUrl: paymentResult.checkoutUrl,
    });
}));

/**
 * @swagger
 * /tickets/webhooks/payment:
 *   post:
 *     summary: Handle payment webhook
 *     tags: [Tickets]
 */
router.post('/tickets/webhooks/payment', asyncHandler(async (req: Request, res: Response) => {
    const provider = getPaymentProvider();

    let result;

    if (provider === 'mollie') {
        // Mollie sends payment ID in form body
        const paymentId = req.body.id;
        if (!paymentId) {
            throw new ApiError(400, 'Missing payment ID');
        }
        result = await handleMollieWebhook(paymentId);
    } else if (provider === 'stripe') {
        // Stripe sends signed JSON
        const signature = req.headers['stripe-signature'] as string;
        const rawBody = JSON.stringify(req.body);

        const verification = verifyStripeWebhook(rawBody, signature);
        if (!verification.valid) {
            throw new ApiError(400, 'Invalid signature');
        }

        result = await handleStripeWebhook(verification.event as Record<string, unknown>);
    } else {
        // Mock payment - check query param or body
        const orderId = req.body.orderId || req.query.orderId;
        if (orderId) {
            result = { success: true, orderId: orderId as string, status: 'paid' };
        } else {
            res.status(200).send('OK');
            return;
        }
    }

    if (!result.success) {
        logger.error('Webhook processing failed:', result.error);
        res.status(200).send('OK'); // Still return 200 to prevent retries
        return;
    }

    if (result.orderId && result.status) {
        await processPaymentUpdate(result.orderId, result.status);
    }

    res.status(200).send('OK');
}));

/**
 * Process payment status update and create tickets if paid
 */
async function processPaymentUpdate(orderId: string, status: string): Promise<void> {
    const order = db.prepare(`
        SELECT
            o.id,
            o.status,
            o.buyer_name,
            o.buyer_email,
            o.total,
            o.user_id,
            o.language,
            c.id as concert_id,
            c.name as concert_name,
            c.date as concert_date,
            c.location as concert_location,
            c.association_id
        FROM ticket_orders o
        JOIN concerts c ON o.concert_id = c.id
        WHERE o.id = ?
    `).get(orderId) as {
        id: string;
        status: string;
        buyer_name: string;
        buyer_email: string;
        total: number;
        user_id: string | null;
        language: string | null;
        concert_id: string;
        concert_name: string;
        concert_date: string;
        concert_location: string | null;
        association_id: string;
    } | undefined;

    if (!order || order.status !== 'pending') {
        return;
    }

    if (status === 'paid') {
        // Get order items
        const items = db.prepare(`
            SELECT oi.ticket_type_id, oi.quantity, oi.unit_price, tt.name
            FROM ticket_order_items oi
            JOIN ticket_types tt ON oi.ticket_type_id = tt.id
            WHERE oi.order_id = ?
        `).all(orderId) as {
            ticket_type_id: string;
            quantity: number;
            unit_price: number;
            name: string;
        }[];

        // Create tickets
        const createTickets = db.transaction(() => {
            for (const item of items) {
                for (let i = 0; i < item.quantity; i++) {
                    const ticketId = uuidv4();
                    const qrCode = generateSecureTicketCode();

                    db.prepare(`
                        INSERT INTO tickets (id, ticket_type_id, order_id, user_id, buyer_name, buyer_email, qr_code, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'valid')
                    `).run(
                        ticketId,
                        item.ticket_type_id,
                        orderId,
                        order.user_id,
                        order.buyer_name,
                        order.buyer_email,
                        qrCode
                    );
                }
            }

            // Update order status
            db.prepare(`
                UPDATE ticket_orders
                SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(orderId);
        });

        try {
            createTickets();

            // Send confirmation email
            const tickets = db.prepare(`
                SELECT t.qr_code, tt.name as ticket_type_name
                FROM tickets t
                JOIN ticket_types tt ON t.ticket_type_id = tt.id
                WHERE t.order_id = ?
                LIMIT 1
            `).get(orderId) as { qr_code: string; ticket_type_name: string } | undefined;

            if (tickets) {
                const qrDataUrl = await generateQRCode(tickets.qr_code);
                // Type-safe language extraction with fallback to 'nl'
                const orderLanguage = (order.language === 'en' || order.language === 'de') ? order.language : 'nl';

                await sendTicketConfirmationEmail({
                    buyerName: order.buyer_name,
                    buyerEmail: order.buyer_email,
                    concertName: order.concert_name,
                    concertDate: order.concert_date,
                    concertLocation: order.concert_location || 'TBA',
                    ticketTypeName: tickets.ticket_type_name,
                    ticketCode: tickets.qr_code,
                    qrCodeDataUrl: qrDataUrl,
                    orderTotal: order.total,
                    quantity: items.reduce((sum, i) => sum + i.quantity, 0),
                }, order.association_id, orderLanguage);
            }

            logger.info(`Order ${orderId} paid, tickets created`);
        } catch (error) {
            logger.error('Failed to create tickets:', error);
        }
    } else if (status === 'cancelled' || status === 'expired' || status === 'failed') {
        // Release tickets
        const items = db.prepare(`
            SELECT ticket_type_id, quantity FROM ticket_order_items WHERE order_id = ?
        `).all(orderId) as { ticket_type_id: string; quantity: number }[];

        for (const item of items) {
            releaseTickets(item.ticket_type_id, item.quantity);
        }

        db.prepare(`
            UPDATE ticket_orders
            SET status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(status, orderId);

        logger.info(`Order ${orderId} ${status}, tickets released`);
    }
}

// =============================================
// STATIC TICKET ROUTES (must be before /:code)
// =============================================

/**
 * @swagger
 * /tickets/my:
 *   get:
 *     summary: Get current user's tickets
 *     tags: [Tickets]
 */
router.get('/tickets/my', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const userEmail = req.user!.email;

    // Get tickets by user ID or email
    const tickets = db.prepare(`
        SELECT
            t.id,
            t.qr_code,
            t.buyer_name,
            t.status,
            t.seat_info,
            t.purchase_date,
            t.used_at,
            tt.name as ticket_type_name,
            c.id as concert_id,
            c.name as concert_name,
            c.date as concert_date,
            c.location as concert_location
        FROM tickets t
        JOIN ticket_types tt ON t.ticket_type_id = tt.id
        JOIN concerts c ON tt.concert_id = c.id
        JOIN ticket_orders o ON t.order_id = o.id
        WHERE (t.user_id = ? OR t.buyer_email = ?) AND o.status = 'paid'
        ORDER BY c.date DESC, t.purchase_date DESC
    `).all(userId, userEmail) as {
        id: string;
        qr_code: string;
        buyer_name: string;
        status: string;
        seat_info: string | null;
        purchase_date: string;
        used_at: string | null;
        ticket_type_name: string;
        concert_id: string;
        concert_name: string;
        concert_date: string;
        concert_location: string | null;
    }[];

    // Generate QR codes for all tickets in parallel
    const ticketsWithQR = await Promise.all(tickets.map(async (t) => {
        const qrCodeDataUrl = await generateQRCode(t.qr_code);
        return {
            id: t.id,
            code: t.qr_code,
            buyerName: t.buyer_name,
            status: t.status,
            seatInfo: t.seat_info,
            purchaseDate: t.purchase_date,
            usedAt: t.used_at,
            ticketType: t.ticket_type_name,
            concert: {
                id: t.concert_id,
                name: t.concert_name,
                date: t.concert_date,
                location: t.concert_location,
            },
            qrCodeDataUrl,
        };
    }));

    res.json(ticketsWithQR);
}));

/**
 * @swagger
 * /tickets/dashboard/{concertId}:
 *   get:
 *     summary: Get ticket dashboard stats for a concert
 *     tags: [Tickets Admin]
 */
router.get('/tickets/dashboard/:concertId', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { concertId } = req.params;

    // Verify concert belongs to user's association
    const concert = db.prepare(`
        SELECT id, name, date, location
        FROM concerts
        WHERE id = ? AND association_id = ?
    `).get(concertId, req.user!.associationId) as {
        id: string;
        name: string;
        date: string;
        location: string | null;
    } | undefined;

    if (!concert) {
        throw new ApiError(404, 'Concert not found');
    }

    // Get ticket types with sales data
    const ticketTypes = db.prepare(`
        SELECT
            id,
            name,
            price,
            quantity,
            sold
        FROM ticket_types
        WHERE concert_id = ?
    `).all(concertId) as {
        id: string;
        name: string;
        price: number;
        quantity: number;
        sold: number;
    }[];

    // Calculate totals
    const totalCapacity = ticketTypes.reduce((sum, tt) => sum + tt.quantity, 0);
    const totalTicketsSold = ticketTypes.reduce((sum, tt) => sum + tt.sold, 0);

    // Calculate revenue
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();

    const revenueResult = db.prepare(`
        SELECT
            SUM(CASE WHEN o.paid_at >= ? THEN o.total ELSE 0 END) as revenue_today,
            SUM(CASE WHEN o.paid_at >= ? THEN o.total ELSE 0 END) as revenue_week,
            SUM(o.total) as revenue_all_time
        FROM ticket_orders o
        WHERE o.concert_id = ? AND o.status = 'paid'
    `).get(todayStart, weekStart, concertId) as {
        revenue_today: number | null;
        revenue_week: number | null;
        revenue_all_time: number | null;
    };

    // Get sales over time (last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const salesOverTime = db.prepare(`
        SELECT
            DATE(o.paid_at) as date,
            COUNT(DISTINCT t.id) as tickets_sold,
            SUM(o.total) as revenue
        FROM ticket_orders o
        JOIN tickets t ON t.order_id = o.id
        WHERE o.concert_id = ? AND o.status = 'paid' AND DATE(o.paid_at) >= ?
        GROUP BY DATE(o.paid_at)
        ORDER BY date ASC
    `).all(concertId, thirtyDaysAgo) as {
        date: string;
        tickets_sold: number;
        revenue: number;
    }[];

    // Get recent orders
    const recentOrders = db.prepare(`
        SELECT
            o.id,
            o.buyer_name,
            o.buyer_email,
            o.total,
            o.status,
            o.created_at,
            (SELECT COUNT(*) FROM tickets t WHERE t.order_id = o.id) as ticket_count
        FROM ticket_orders o
        WHERE o.concert_id = ?
        ORDER BY o.created_at DESC
        LIMIT 10
    `).all(concertId) as {
        id: string;
        buyer_name: string;
        buyer_email: string;
        total: number;
        status: string;
        created_at: string;
        ticket_count: number;
    }[];

    // Get guest list count
    const guestListResult = db.prepare(`
        SELECT COALESCE(SUM(ticket_count), 0) as total
        FROM guest_list
        WHERE concert_id = ?
    `).get(concertId) as { total: number };

    res.json({
        concertId: concert.id,
        concertName: concert.name,
        concertDate: concert.date,
        concertLocation: concert.location,
        totalTicketsSold,
        totalCapacity,
        revenueToday: revenueResult.revenue_today || 0,
        revenueThisWeek: revenueResult.revenue_week || 0,
        revenueAllTime: revenueResult.revenue_all_time || 0,
        ticketTypes: ticketTypes.map(tt => ({
            id: tt.id,
            name: tt.name,
            price: tt.price,
            quantity: tt.quantity,
            sold: tt.sold,
            available: tt.quantity - tt.sold,
            revenue: tt.price * tt.sold,
        })),
        salesOverTime: salesOverTime.map(s => ({
            date: s.date,
            ticketsSold: s.tickets_sold,
            revenue: s.revenue,
        })),
        recentOrders: recentOrders.map(o => ({
            id: o.id,
            buyerName: o.buyer_name,
            buyerEmail: o.buyer_email,
            total: o.total,
            ticketCount: o.ticket_count,
            status: o.status,
            createdAt: o.created_at,
        })),
        guestListTickets: guestListResult.total,
    });
}));

/**
 * @swagger
 * /tickets/transferable:
 *   get:
 *     summary: Get user's transferable tickets
 *     tags: [Tickets]
 */
router.get('/tickets/transferable', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const userEmail = req.user!.email;

    // Get valid tickets that the user owns and that are for upcoming concerts
    const tickets = db.prepare(`
        SELECT
            t.id,
            t.qr_code,
            t.buyer_name,
            t.status,
            tt.name as ticket_type_name,
            c.id as concert_id,
            c.name as concert_name,
            c.date as concert_date,
            c.location as concert_location,
            (SELECT COUNT(*) FROM ticket_transfers tr WHERE tr.ticket_id = t.id AND tr.status = 'pending') as pending_transfer_count
        FROM tickets t
        JOIN ticket_types tt ON t.ticket_type_id = tt.id
        JOIN concerts c ON tt.concert_id = c.id
        JOIN ticket_orders o ON t.order_id = o.id
        WHERE (t.user_id = ? OR t.buyer_email = ?)
          AND o.status = 'paid'
          AND t.status = 'valid'
          AND c.date >= DATE('now')
        ORDER BY c.date ASC
    `).all(userId, userEmail) as {
        id: string;
        qr_code: string;
        buyer_name: string;
        status: string;
        ticket_type_name: string;
        concert_id: string;
        concert_name: string;
        concert_date: string;
        concert_location: string | null;
        pending_transfer_count: number;
    }[];

    res.json(tickets.map(t => ({
        id: t.id,
        code: t.qr_code,
        ticketType: t.ticket_type_name,
        buyerName: t.buyer_name,
        status: t.status,
        concert: {
            id: t.concert_id,
            name: t.concert_name,
            date: t.concert_date,
            location: t.concert_location,
        },
        hasPendingTransfer: t.pending_transfer_count > 0,
    })));
}));

/**
 * @swagger
 * /tickets/transfers:
 *   get:
 *     summary: Get user's pending transfers (initiated by them)
 *     tags: [Tickets]
 */
router.get('/tickets/transfers', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const userEmail = req.user!.email;

    // Get pending transfers initiated by this user
    const transfers = db.prepare(`
        SELECT
            tr.id,
            tr.ticket_id,
            tr.recipient_email,
            tr.recipient_name,
            tr.transfer_code,
            tr.status,
            tr.created_at,
            tr.expires_at,
            tr.accepted_at,
            tr.cancelled_at,
            t.qr_code as ticket_code,
            tt.name as ticket_type_name,
            c.id as concert_id,
            c.name as concert_name,
            c.date as concert_date,
            c.location as concert_location
        FROM ticket_transfers tr
        JOIN tickets t ON tr.ticket_id = t.id
        JOIN ticket_types tt ON t.ticket_type_id = tt.id
        JOIN concerts c ON tt.concert_id = c.id
        WHERE (tr.from_user_id = ? OR tr.from_email = ?)
          AND tr.status = 'pending'
        ORDER BY tr.created_at DESC
    `).all(userId, userEmail) as {
        id: string;
        ticket_id: string;
        recipient_email: string;
        recipient_name: string;
        transfer_code: string;
        status: string;
        created_at: string;
        expires_at: string;
        accepted_at: string | null;
        cancelled_at: string | null;
        ticket_code: string;
        ticket_type_name: string;
        concert_id: string;
        concert_name: string;
        concert_date: string;
        concert_location: string | null;
    }[];

    res.json(transfers.map(tr => ({
        id: tr.id,
        ticketId: tr.ticket_id,
        ticket: {
            id: tr.ticket_id,
            code: tr.ticket_code,
            ticketType: tr.ticket_type_name,
            concert: {
                id: tr.concert_id,
                name: tr.concert_name,
                date: tr.concert_date,
                location: tr.concert_location,
            },
        },
        recipientEmail: tr.recipient_email,
        recipientName: tr.recipient_name,
        transferCode: tr.transfer_code,
        status: tr.status,
        createdAt: tr.created_at,
        expiresAt: tr.expires_at,
        acceptedAt: tr.accepted_at,
        cancelledAt: tr.cancelled_at,
    })));
}));

/**
 * @swagger
 * /tickets/transfers/history:
 *   get:
 *     summary: Get user's transfer history
 *     tags: [Tickets]
 */
router.get('/tickets/transfers/history', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const userEmail = req.user!.email;

    // Get all transfers where user is sender or recipient
    const transfers = db.prepare(`
        SELECT
            tr.id,
            tr.ticket_id,
            tr.from_email,
            tr.from_name,
            tr.recipient_email,
            tr.recipient_name,
            tr.status,
            tr.created_at,
            tr.accepted_at,
            t.qr_code as ticket_code,
            tt.name as ticket_type_name,
            c.id as concert_id,
            c.name as concert_name,
            c.date as concert_date
        FROM ticket_transfers tr
        JOIN tickets t ON tr.ticket_id = t.id
        JOIN ticket_types tt ON t.ticket_type_id = tt.id
        JOIN concerts c ON tt.concert_id = c.id
        WHERE tr.from_user_id = ? OR tr.from_email = ? OR tr.recipient_email = ?
        ORDER BY tr.created_at DESC
        LIMIT 50
    `).all(userId, userEmail, userEmail) as {
        id: string;
        ticket_id: string;
        from_email: string;
        from_name: string;
        recipient_email: string;
        recipient_name: string;
        status: string;
        created_at: string;
        accepted_at: string | null;
        ticket_code: string;
        ticket_type_name: string;
        concert_id: string;
        concert_name: string;
        concert_date: string;
    }[];

    res.json(transfers.map(tr => ({
        id: tr.id,
        ticketId: tr.ticket_id,
        ticket: {
            id: tr.ticket_id,
            code: tr.ticket_code,
            ticketType: tr.ticket_type_name,
            concert: {
                id: tr.concert_id,
                name: tr.concert_name,
                date: tr.concert_date,
            },
        },
        fromEmail: tr.from_email,
        fromName: tr.from_name,
        toEmail: tr.recipient_email,
        toName: tr.recipient_name,
        status: tr.status,
        transferredAt: tr.accepted_at || tr.created_at,
    })));
}));

/**
 * @swagger
 * /tickets/transfers/{transferCode}:
 *   get:
 *     summary: Get transfer details by code (for accepting)
 *     tags: [Tickets]
 */
router.get('/tickets/transfers/:transferCode', optionalAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { transferCode } = req.params;

    const transfer = db.prepare(`
        SELECT
            tr.id,
            tr.ticket_id,
            tr.from_name,
            tr.recipient_email,
            tr.recipient_name,
            tr.transfer_code,
            tr.status,
            tr.created_at,
            tr.expires_at,
            tr.accepted_at,
            tr.cancelled_at,
            t.qr_code as ticket_code,
            tt.name as ticket_type_name,
            c.id as concert_id,
            c.name as concert_name,
            c.date as concert_date,
            c.location as concert_location
        FROM ticket_transfers tr
        JOIN tickets t ON tr.ticket_id = t.id
        JOIN ticket_types tt ON t.ticket_type_id = tt.id
        JOIN concerts c ON tt.concert_id = c.id
        WHERE tr.transfer_code = ?
    `).get(transferCode) as {
        id: string;
        ticket_id: string;
        from_name: string;
        recipient_email: string;
        recipient_name: string;
        transfer_code: string;
        status: string;
        created_at: string;
        expires_at: string;
        accepted_at: string | null;
        cancelled_at: string | null;
        ticket_code: string;
        ticket_type_name: string;
        concert_id: string;
        concert_name: string;
        concert_date: string;
        concert_location: string | null;
    } | undefined;

    if (!transfer) {
        throw new ApiError(404, 'Transfer not found');
    }

    // Check if expired
    if (transfer.status === 'pending' && new Date(transfer.expires_at) < new Date()) {
        // Mark as expired
        db.prepare(`UPDATE ticket_transfers SET status = 'expired' WHERE id = ?`).run(transfer.id);
        transfer.status = 'expired';
    }

    res.json({
        id: transfer.id,
        ticketId: transfer.ticket_id,
        ticket: {
            id: transfer.ticket_id,
            code: transfer.ticket_code,
            ticketType: transfer.ticket_type_name,
            concert: {
                id: transfer.concert_id,
                name: transfer.concert_name,
                date: transfer.concert_date,
                location: transfer.concert_location,
            },
        },
        recipientEmail: transfer.recipient_email,
        recipientName: transfer.recipient_name,
        transferCode: transfer.transfer_code,
        status: transfer.status,
        createdAt: transfer.created_at,
        expiresAt: transfer.expires_at,
        acceptedAt: transfer.accepted_at,
        cancelledAt: transfer.cancelled_at,
    });
}));

/**
 * @swagger
 * /tickets/transfers/{transferId}:
 *   delete:
 *     summary: Cancel a pending transfer
 *     tags: [Tickets]
 */
router.delete('/tickets/transfers/:transferId', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { transferId } = req.params;
    const userId = req.user!.id;
    const userEmail = req.user!.email;

    // Verify transfer exists and belongs to user
    const transfer = db.prepare(`
        SELECT id, status, from_user_id, from_email
        FROM ticket_transfers
        WHERE id = ?
    `).get(transferId) as {
        id: string;
        status: string;
        from_user_id: string | null;
        from_email: string;
    } | undefined;

    if (!transfer) {
        throw new ApiError(404, 'Transfer not found');
    }

    // Check ownership
    if (transfer.from_user_id !== userId && transfer.from_email !== userEmail) {
        throw new ApiError(403, 'Not authorized to cancel this transfer');
    }

    if (transfer.status !== 'pending') {
        throw new ApiError(400, `Cannot cancel transfer with status: ${transfer.status}`);
    }

    // Cancel the transfer
    db.prepare(`
        UPDATE ticket_transfers
        SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(transferId);

    res.json({ success: true, message: 'Transfer cancelled successfully' });
}));

/**
 * @swagger
 * /tickets/transfers/{transferCode}/accept:
 *   post:
 *     summary: Accept a ticket transfer
 *     tags: [Tickets]
 */
router.post('/tickets/transfers/:transferCode/accept', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { transferCode } = req.params;
    const userId = req.user!.id;
    const userEmail = req.user!.email;
    const userName = `${req.user!.firstName} ${req.user!.lastName}`;

    // Get the transfer
    const transfer = db.prepare(`
        SELECT
            tr.id,
            tr.ticket_id,
            tr.status,
            tr.expires_at,
            tr.recipient_email,
            t.qr_code,
            t.status as ticket_status,
            tt.name as ticket_type_name,
            c.id as concert_id,
            c.name as concert_name,
            c.date as concert_date,
            c.location as concert_location
        FROM ticket_transfers tr
        JOIN tickets t ON tr.ticket_id = t.id
        JOIN ticket_types tt ON t.ticket_type_id = tt.id
        JOIN concerts c ON tt.concert_id = c.id
        WHERE tr.transfer_code = ?
    `).get(transferCode) as {
        id: string;
        ticket_id: string;
        status: string;
        expires_at: string;
        recipient_email: string;
        qr_code: string;
        ticket_status: string;
        ticket_type_name: string;
        concert_id: string;
        concert_name: string;
        concert_date: string;
        concert_location: string | null;
    } | undefined;

    if (!transfer) {
        throw new ApiError(404, 'Transfer not found');
    }

    if (transfer.status !== 'pending') {
        throw new ApiError(400, `Transfer has status: ${transfer.status}`);
    }

    // Check if expired
    if (new Date(transfer.expires_at) < new Date()) {
        db.prepare(`UPDATE ticket_transfers SET status = 'expired' WHERE id = ?`).run(transfer.id);
        throw new ApiError(400, 'Transfer has expired');
    }

    // Optional: verify recipient email matches (be lenient - allow any authenticated user)
    // In production you might want to enforce this more strictly

    // Transfer the ticket
    const acceptTransfer = db.transaction(() => {
        // Update the ticket ownership
        db.prepare(`
            UPDATE tickets
            SET user_id = ?, buyer_name = ?, buyer_email = ?
            WHERE id = ?
        `).run(userId, userName, userEmail, transfer.ticket_id);

        // Mark transfer as accepted
        db.prepare(`
            UPDATE ticket_transfers
            SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP, accepted_by_user_id = ?
            WHERE id = ?
        `).run(userId, transfer.id);
    });

    acceptTransfer();

    // Generate QR code for response
    const qrCodeDataUrl = await generateQRCode(transfer.qr_code);

    res.json({
        success: true,
        ticket: {
            id: transfer.ticket_id,
            code: transfer.qr_code,
            buyerName: userName,
            status: transfer.ticket_status,
            ticketType: transfer.ticket_type_name,
            concert: {
                id: transfer.concert_id,
                name: transfer.concert_name,
                date: transfer.concert_date,
                location: transfer.concert_location,
            },
            qrCodeDataUrl,
        },
        message: 'Ticket transferred successfully',
    });
}));

// Validation schema for ticket transfer
const initiateTransferSchema = z.object({
    recipientEmail: z.string().email('Valid email required'),
    recipientName: z.string().min(1, 'Recipient name is required'),
});

/**
 * @swagger
 * /tickets/{id}/transfer:
 *   post:
 *     summary: Initiate a ticket transfer
 *     tags: [Tickets]
 */
router.post('/tickets/:id/transfer', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id: ticketId } = req.params;
    const userId = req.user!.id;
    const userEmail = req.user!.email;
    const userName = `${req.user!.firstName} ${req.user!.lastName}`;

    const validation = initiateTransferSchema.safeParse(req.body);
    if (!validation.success) {
        throw new ApiError(400, validation.error.issues[0].message);
    }

    const { recipientEmail, recipientName } = validation.data;

    // Verify ticket exists and belongs to user
    const ticket = db.prepare(`
        SELECT
            t.id,
            t.user_id,
            t.buyer_email,
            t.status,
            t.qr_code,
            tt.name as ticket_type_name,
            c.id as concert_id,
            c.name as concert_name,
            c.date as concert_date,
            c.location as concert_location
        FROM tickets t
        JOIN ticket_types tt ON t.ticket_type_id = tt.id
        JOIN concerts c ON tt.concert_id = c.id
        JOIN ticket_orders o ON t.order_id = o.id
        WHERE t.id = ? AND o.status = 'paid'
    `).get(ticketId) as {
        id: string;
        user_id: string | null;
        buyer_email: string;
        status: string;
        qr_code: string;
        ticket_type_name: string;
        concert_id: string;
        concert_name: string;
        concert_date: string;
        concert_location: string | null;
    } | undefined;

    if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
    }

    // Check ownership
    if (ticket.user_id !== userId && ticket.buyer_email !== userEmail) {
        throw new ApiError(403, 'Not authorized to transfer this ticket');
    }

    if (ticket.status !== 'valid') {
        throw new ApiError(400, `Cannot transfer ticket with status: ${ticket.status}`);
    }

    // Check for existing pending transfer
    const existingTransfer = db.prepare(`
        SELECT id FROM ticket_transfers
        WHERE ticket_id = ? AND status = 'pending'
    `).get(ticketId) as { id: string } | undefined;

    if (existingTransfer) {
        throw new ApiError(400, 'Ticket already has a pending transfer');
    }

    // Cannot transfer to yourself
    if (recipientEmail.toLowerCase() === userEmail.toLowerCase()) {
        throw new ApiError(400, 'Cannot transfer ticket to yourself');
    }

    // Create the transfer
    const transferId = uuidv4();
    const transferCode = generateSecureTicketCode(); // Reuse the secure code generator
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    db.prepare(`
        INSERT INTO ticket_transfers (id, ticket_id, from_user_id, from_email, from_name, recipient_email, recipient_name, transfer_code, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(transferId, ticketId, userId, userEmail, userName, recipientEmail, recipientName, transferCode, expiresAt);

    res.status(201).json({
        transfer: {
            id: transferId,
            ticketId: ticketId,
            ticket: {
                id: ticket.id,
                code: ticket.qr_code,
                ticketType: ticket.ticket_type_name,
                concert: {
                    id: ticket.concert_id,
                    name: ticket.concert_name,
                    date: ticket.concert_date,
                    location: ticket.concert_location,
                },
            },
            recipientEmail,
            recipientName,
            transferCode,
            status: 'pending',
            createdAt: new Date().toISOString(),
            expiresAt,
            acceptedAt: null,
            cancelledAt: null,
        },
        message: 'Transfer initiated. Share the transfer code with the recipient.',
    });
}));

/**
 * @swagger
 * /tickets/sales:
 *   get:
 *     summary: Get all ticket sales/orders for admin overview
 *     tags: [Tickets Admin]
 */
router.get('/tickets/sales', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { concertId, status, startDate, endDate, page = '1', limit = '50' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;

    // Build query conditions
    const conditions: string[] = ['c.association_id = ?'];
    const params: unknown[] = [req.user!.associationId];

    if (concertId) {
        conditions.push('o.concert_id = ?');
        params.push(concertId);
    }

    if (status) {
        conditions.push('o.status = ?');
        params.push(status);
    }

    if (startDate) {
        conditions.push('o.created_at >= ?');
        params.push(startDate);
    }

    if (endDate) {
        conditions.push('o.created_at <= ?');
        params.push(endDate);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = db.prepare(`
        SELECT COUNT(*) as count
        FROM ticket_orders o
        JOIN concerts c ON o.concert_id = c.id
        WHERE ${whereClause}
    `).get(...params) as { count: number };

    // Get orders with details
    const orders = db.prepare(`
        SELECT
            o.id,
            o.concert_id,
            o.total,
            o.status,
            o.payment_id,
            o.payment_method,
            o.buyer_name,
            o.buyer_email,
            o.buyer_phone,
            o.expires_at,
            o.paid_at,
            o.created_at,
            o.updated_at,
            c.name as concert_name,
            c.date as concert_date,
            c.location as concert_location,
            (SELECT COUNT(*) FROM tickets t WHERE t.order_id = o.id) as ticket_count
        FROM ticket_orders o
        JOIN concerts c ON o.concert_id = c.id
        WHERE ${whereClause}
        ORDER BY o.created_at DESC
        LIMIT ? OFFSET ?
    `).all(...params, limitNum, offset) as {
        id: string;
        concert_id: string;
        total: number;
        status: string;
        payment_id: string | null;
        payment_method: string | null;
        buyer_name: string;
        buyer_email: string;
        buyer_phone: string | null;
        expires_at: string | null;
        paid_at: string | null;
        created_at: string;
        updated_at: string;
        concert_name: string;
        concert_date: string;
        concert_location: string | null;
        ticket_count: number;
    }[];

    // Get order items for each order
    const orderIds = orders.map(o => o.id);
    let orderItemsMap: Record<string, { ticketTypeId: string; name: string; quantity: number; unitPrice: number }[]> = {};

    if (orderIds.length > 0) {
        const orderItems = db.prepare(`
            SELECT
                oi.order_id,
                oi.ticket_type_id,
                oi.quantity,
                oi.unit_price,
                tt.name
            FROM ticket_order_items oi
            JOIN ticket_types tt ON oi.ticket_type_id = tt.id
            WHERE oi.order_id IN (${orderIds.map(() => '?').join(',')})
        `).all(...orderIds) as {
            order_id: string;
            ticket_type_id: string;
            quantity: number;
            unit_price: number;
            name: string;
        }[];

        for (const item of orderItems) {
            if (!orderItemsMap[item.order_id]) {
                orderItemsMap[item.order_id] = [];
            }
            orderItemsMap[item.order_id].push({
                ticketTypeId: item.ticket_type_id,
                name: item.name,
                quantity: item.quantity,
                unitPrice: item.unit_price,
            });
        }
    }

    // Calculate summary stats
    const statsResult = db.prepare(`
        SELECT
            COUNT(*) as total_orders,
            SUM(CASE WHEN o.status = 'paid' THEN 1 ELSE 0 END) as paid_orders,
            SUM(CASE WHEN o.status = 'paid' THEN o.total ELSE 0 END) as total_revenue,
            SUM(CASE WHEN o.status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
            SUM(CASE WHEN o.status = 'refunded' THEN 1 ELSE 0 END) as refunded_orders
        FROM ticket_orders o
        JOIN concerts c ON o.concert_id = c.id
        WHERE ${whereClause}
    `).get(...params) as {
        total_orders: number;
        paid_orders: number;
        total_revenue: number;
        pending_orders: number;
        refunded_orders: number;
    };

    res.json({
        orders: orders.map(o => ({
            id: o.id,
            concertId: o.concert_id,
            concertName: o.concert_name,
            concertDate: o.concert_date,
            concertLocation: o.concert_location,
            total: o.total,
            status: o.status,
            paymentId: o.payment_id,
            paymentMethod: o.payment_method,
            buyerName: o.buyer_name,
            buyerEmail: o.buyer_email,
            buyerPhone: o.buyer_phone,
            expiresAt: o.expires_at,
            paidAt: o.paid_at,
            createdAt: o.created_at,
            updatedAt: o.updated_at,
            ticketCount: o.ticket_count,
            items: orderItemsMap[o.id] || [],
        })),
        pagination: {
            page: pageNum,
            limit: limitNum,
            total: countResult.count,
            totalPages: Math.ceil(countResult.count / limitNum),
        },
        summary: {
            totalOrders: statsResult.total_orders,
            paidOrders: statsResult.paid_orders,
            totalRevenue: statsResult.total_revenue || 0,
            pendingOrders: statsResult.pending_orders,
            refundedOrders: statsResult.refunded_orders,
        },
    });
}));

// =============================================
// PARAMETERIZED TICKET ROUTES
// =============================================

/**
 * @swagger
 * /tickets/{code}:
 *   get:
 *     summary: Get ticket details by code
 *     tags: [Tickets]
 */
router.get('/tickets/:code', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { code } = req.params;

    const ticket = db.prepare(`
        SELECT
            t.id,
            t.qr_code,
            t.buyer_name,
            t.buyer_email,
            t.status,
            t.seat_info,
            t.purchase_date,
            t.used_at,
            tt.name as ticket_type_name,
            tt.price,
            c.id as concert_id,
            c.name as concert_name,
            c.date as concert_date,
            c.end_date as concert_end_date,
            c.location as concert_location
        FROM tickets t
        JOIN ticket_types tt ON t.ticket_type_id = tt.id
        JOIN concerts c ON tt.concert_id = c.id
        WHERE t.qr_code = ?
    `).get(code) as {
        id: string;
        qr_code: string;
        buyer_name: string;
        buyer_email: string;
        status: string;
        seat_info: string | null;
        purchase_date: string;
        used_at: string | null;
        ticket_type_name: string;
        price: number;
        concert_id: string;
        concert_name: string;
        concert_date: string;
        concert_end_date: string | null;
        concert_location: string | null;
    } | undefined;

    if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
    }

    // Generate QR code data URL
    const qrCode = await generateQRCode(ticket.qr_code);

    res.json({
        id: ticket.id,
        code: ticket.qr_code,
        buyerName: ticket.buyer_name,
        status: ticket.status,
        seatInfo: ticket.seat_info,
        purchaseDate: ticket.purchase_date,
        usedAt: ticket.used_at,
        ticketType: ticket.ticket_type_name,
        price: ticket.price,
        concert: {
            id: ticket.concert_id,
            name: ticket.concert_name,
            date: ticket.concert_date,
            endDate: ticket.concert_end_date,
            location: ticket.concert_location,
        },
        qrCodeDataUrl: qrCode,
    });
}));

/**
 * @swagger
 * /tickets/{code}/validate:
 *   post:
 *     summary: Validate and mark ticket as used
 *     tags: [Tickets]
 */
router.post('/tickets/:code/validate', authenticateToken, requireRole('admin', 'music_committee', 'conductor'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { code } = req.params;
    const { concertId } = req.body;

    // First validate
    const validation = validateTicket(code, concertId);

    if (!validation.valid) {
        res.json(validation);
        return;
    }

    // Mark as used
    const result = markTicketAsUsed(code, req.user!.id);

    if (!result.success) {
        throw new ApiError(400, result.message);
    }

    res.json({
        valid: true,
        status: 'used',
        ticket: validation.ticket,
        message: 'Ticket validated and marked as used',
    });
}));

// =============================================
// ADMIN ROUTES
// =============================================

/**
 * @swagger
 * /concerts/{id}/ticket-types:
 *   post:
 *     summary: Create a ticket type for a concert
 *     tags: [Tickets Admin]
 */
router.post('/concerts/:id/ticket-types', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id: concertId } = req.params;
    const validation = createTicketTypeSchema.safeParse(req.body);

    if (!validation.success) {
        throw new ApiError(400, validation.error.issues[0].message);
    }

    const { name, price, quantity, description, saleStart, saleEnd, maxPerOrder, serviceFee, showServiceFeeSeparate } = validation.data;

    // Verify concert exists and belongs to user's association
    const concert = db.prepare(`
        SELECT id FROM concerts WHERE id = ? AND association_id = ?
    `).get(concertId, req.user!.associationId) as { id: string } | undefined;

    if (!concert) {
        throw new ApiError(404, 'Concert not found');
    }

    const id = uuidv4();

    db.prepare(`
        INSERT INTO ticket_types (id, concert_id, name, price, quantity, description, sale_start, sale_end, max_per_order, service_fee, show_service_fee_separate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, concertId, name, price, quantity, description || null, saleStart || null, saleEnd || null, maxPerOrder, serviceFee || 0, showServiceFeeSeparate ? 1 : 0);

    res.status(201).json({
        id,
        name,
        price,
        quantity,
        sold: 0,
        available: quantity,
        description,
        saleStart,
        saleEnd,
        maxPerOrder,
        serviceFee: serviceFee || 0,
        showServiceFeeSeparate: showServiceFeeSeparate || false,
    });
}));

/**
 * @swagger
 * /ticket-types/{id}:
 *   put:
 *     summary: Update a ticket type
 *     tags: [Tickets Admin]
 */
router.put('/ticket-types/:id', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const validation = updateTicketTypeSchema.safeParse(req.body);

    if (!validation.success) {
        throw new ApiError(400, validation.error.issues[0].message);
    }

    // Verify ticket type exists and belongs to user's association
    const ticketType = db.prepare(`
        SELECT tt.id, tt.sold
        FROM ticket_types tt
        JOIN concerts c ON tt.concert_id = c.id
        WHERE tt.id = ? AND c.association_id = ?
    `).get(id, req.user!.associationId) as { id: string; sold: number } | undefined;

    if (!ticketType) {
        throw new ApiError(404, 'Ticket type not found');
    }

    const updates = validation.data;
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
        fields.push('name = ?');
        values.push(updates.name);
    }
    if (updates.price !== undefined) {
        fields.push('price = ?');
        values.push(updates.price);
    }
    if (updates.quantity !== undefined) {
        // Cannot reduce below sold count
        if (updates.quantity < ticketType.sold) {
            throw new ApiError(400, `Cannot reduce quantity below ${ticketType.sold} (already sold)`);
        }
        fields.push('quantity = ?');
        values.push(updates.quantity);
    }
    if (updates.description !== undefined) {
        fields.push('description = ?');
        values.push(updates.description || null);
    }
    if (updates.saleStart !== undefined) {
        fields.push('sale_start = ?');
        values.push(updates.saleStart || null);
    }
    if (updates.saleEnd !== undefined) {
        fields.push('sale_end = ?');
        values.push(updates.saleEnd || null);
    }
    if (updates.maxPerOrder !== undefined) {
        fields.push('max_per_order = ?');
        values.push(updates.maxPerOrder);
    }
    if (updates.serviceFee !== undefined) {
        fields.push('service_fee = ?');
        values.push(updates.serviceFee);
    }
    if (updates.showServiceFeeSeparate !== undefined) {
        fields.push('show_service_fee_separate = ?');
        values.push(updates.showServiceFeeSeparate ? 1 : 0);
    }

    if (fields.length === 0) {
        throw new ApiError(400, 'No fields to update');
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    db.prepare(`
        UPDATE ticket_types SET ${fields.join(', ')} WHERE id = ?
    `).run(...values);

    res.json({ success: true });
}));

/**
 * @swagger
 * /ticket-types/{id}:
 *   delete:
 *     summary: Delete a ticket type
 *     tags: [Tickets Admin]
 */
router.delete('/ticket-types/:id', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    // Verify ticket type exists and has no sales
    const ticketType = db.prepare(`
        SELECT tt.id, tt.sold
        FROM ticket_types tt
        JOIN concerts c ON tt.concert_id = c.id
        WHERE tt.id = ? AND c.association_id = ?
    `).get(id, req.user!.associationId) as { id: string; sold: number } | undefined;

    if (!ticketType) {
        throw new ApiError(404, 'Ticket type not found');
    }

    if (ticketType.sold > 0) {
        throw new ApiError(400, 'Cannot delete ticket type with existing sales');
    }

    db.prepare('DELETE FROM ticket_types WHERE id = ?').run(id);

    res.json({ success: true });
}));

/**
 * @swagger
 * /concerts/{id}/ticket-stats:
 *   get:
 *     summary: Get ticket sales statistics for a concert
 *     tags: [Tickets Admin]
 */
router.get('/concerts/:id/ticket-stats', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id: concertId } = req.params;

    // Verify concert belongs to user's association
    const concert = db.prepare(`
        SELECT id FROM concerts WHERE id = ? AND association_id = ?
    `).get(concertId, req.user!.associationId) as { id: string } | undefined;

    if (!concert) {
        throw new ApiError(404, 'Concert not found');
    }

    const stats = getConcertTicketStats(concertId);

    if (!stats) {
        throw new ApiError(404, 'Concert not found');
    }

    res.json(stats);
}));

/**
 * @swagger
 * /concerts/{id}/seats/heatmap-data:
 *   get:
 *     summary: Get seat sales heatmap data for a concert
 *     tags: [Tickets Admin]
 *     description: Returns sales velocity, popularity, and price performance data per section/seat
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Concert ID
 *     responses:
 *       200:
 *         description: Heatmap data with section and seat metrics
 *       404:
 *         description: Concert not found
 */
router.get('/concerts/:id/seats/heatmap-data', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id: concertId } = req.params;

    // Verify concert belongs to user's association
    const concert = db.prepare(`
        SELECT c.id, c.name, c.date, c.association_id
        FROM concerts c
        WHERE c.id = ? AND c.association_id = ?
    `).get(concertId, req.user!.associationId) as {
        id: string;
        name: string;
        date: string;
        association_id: string;
    } | undefined;

    if (!concert) {
        throw new ApiError(404, 'Concert not found');
    }

    // Get ticket types for this concert
    const ticketTypes = db.prepare(`
        SELECT id, name, price, quantity, sold, sale_start, sale_end
        FROM ticket_types
        WHERE concert_id = ?
    `).all(concertId) as {
        id: string;
        name: string;
        price: number;
        quantity: number;
        sold: number;
        sale_start: string | null;
        sale_end: string | null;
    }[];

    // Get all sold tickets with their sale timestamps
    const soldTickets = db.prepare(`
        SELECT
            t.id,
            t.ticket_type_id,
            t.seat_info,
            t.created_at as sold_at,
            t.status,
            tt.name as ticket_type_name,
            tt.price,
            tt.sale_start
        FROM tickets t
        JOIN ticket_types tt ON t.ticket_type_id = tt.id
        WHERE tt.concert_id = ? AND t.status IN ('valid', 'used')
        ORDER BY t.created_at ASC
    `).all(concertId) as {
        id: string;
        ticket_type_id: string;
        seat_info: string | null;
        sold_at: string;
        status: string;
        ticket_type_name: string;
        price: number;
        sale_start: string | null;
    }[];

    // Calculate total capacity and sold
    const totalCapacity = ticketTypes.reduce((sum, tt) => sum + tt.quantity, 0);
    const totalSold = ticketTypes.reduce((sum, tt) => sum + tt.sold, 0);

    // Determine sales period
    const salesPeriodStart = ticketTypes.reduce((earliest, tt) => {
        if (!tt.sale_start) return earliest;
        return earliest && earliest < tt.sale_start ? earliest : tt.sale_start;
    }, null as string | null) || concert.date;

    const now = new Date().toISOString();
    const salesPeriodEnd = now < concert.date ? now : concert.date;

    // Calculate section-level metrics (using ticket types as sections)
    const sectionData = ticketTypes.map(tt => {
        const sectionTickets = soldTickets.filter(t => t.ticket_type_id === tt.id);
        const revenue = sectionTickets.length * tt.price;

        // Calculate sales velocity (tickets per day)
        const saleStartDate = tt.sale_start ? new Date(tt.sale_start) : new Date(salesPeriodStart);
        const daysSinceStart = Math.max(1, (new Date().getTime() - saleStartDate.getTime()) / (1000 * 60 * 60 * 24));
        const salesVelocity = tt.sold / daysSinceStart;

        // Calculate time to sell out (if sold out)
        let timeToSellOut: number | null = null;
        if (tt.sold >= tt.quantity && sectionTickets.length > 0) {
            const firstSale = new Date(sectionTickets[0].sold_at);
            const lastSale = new Date(sectionTickets[sectionTickets.length - 1].sold_at);
            timeToSellOut = (lastSale.getTime() - firstSale.getTime()) / (1000 * 60 * 60); // hours
        }

        // Calculate popularity score (0-100)
        const percentSold = tt.quantity > 0 ? (tt.sold / tt.quantity) * 100 : 0;
        const velocityBonus = Math.min(20, salesVelocity * 5);
        const popularityScore = Math.min(100, percentSold * 0.8 + velocityBonus);

        // Calculate price performance score (0-100)
        // Higher price with high sales = better performance
        const avgPrice = ticketTypes.reduce((sum, t) => sum + t.price, 0) / ticketTypes.length || 1;
        const priceRatio = tt.price / avgPrice;
        const salesRatio = tt.quantity > 0 ? tt.sold / tt.quantity : 0;
        const pricePerformanceScore = Math.min(100, (salesRatio * 100) * (0.5 + priceRatio * 0.5));

        return {
            sectionId: tt.id,
            sectionName: tt.name,
            capacity: tt.quantity,
            sold: tt.sold,
            revenue,
            averagePrice: tt.price,
            salesVelocity: Math.round(salesVelocity * 100) / 100,
            timeToSellOut,
            popularityScore: Math.round(popularityScore),
            pricePerformanceScore: Math.round(pricePerformanceScore),
        };
    });

    // Define seat data type
    type SeatDataItem = {
        seatId: string;
        sectionId: string;
        rowLabel: string;
        seatLabel: string;
        x: number;
        y: number;
        status: 'sold' | 'available' | 'reserved' | 'held';
        soldAt: string | null;
        price: number | null;
        ticketTypeId: string;
        ticketTypeName: string;
        timeToSell: number | null;
        salesSpeedPercentile: number | null;
    };

    // Calculate seat-level metrics (simulated from ticket data since we don't have actual seats)
    // In a real implementation, this would map to actual venue seat data
    const seatData: SeatDataItem[] = soldTickets.map((ticket) => {
        const ticketType = ticketTypes.find(tt => tt.id === ticket.ticket_type_id);
        const saleStart = ticket.sale_start ? new Date(ticket.sale_start) : new Date(salesPeriodStart);
        const soldAt = new Date(ticket.sold_at);
        const timeToSell = (soldAt.getTime() - saleStart.getTime()) / 1000; // seconds

        // Calculate sales speed percentile (where in the selling order this ticket was)
        const sectionTickets = soldTickets.filter(t => t.ticket_type_id === ticket.ticket_type_id);
        const positionInSection = sectionTickets.findIndex(t => t.id === ticket.id);
        const salesSpeedPercentile = sectionTickets.length > 1
            ? Math.round((1 - positionInSection / (sectionTickets.length - 1)) * 100)
            : 50;

        // Generate pseudo-coordinates for visualization (grid layout)
        const sectionIndex = ticketTypes.findIndex(tt => tt.id === ticket.ticket_type_id);
        const seatsPerRow = Math.ceil(Math.sqrt(ticketType?.quantity || 10));
        const row = Math.floor(positionInSection / seatsPerRow);
        const col = positionInSection % seatsPerRow;

        return {
            seatId: ticket.id,
            sectionId: ticket.ticket_type_id,
            rowLabel: `R${row + 1}`,
            seatLabel: `${col + 1}`,
            x: sectionIndex * 150 + col * 20 + 50,
            y: row * 20 + 80,
            status: 'sold' as const,
            soldAt: ticket.sold_at,
            price: ticket.price,
            ticketTypeId: ticket.ticket_type_id,
            ticketTypeName: ticket.ticket_type_name,
            timeToSell,
            salesSpeedPercentile,
        };
    });

    // Add unsold seat placeholders
    ticketTypes.forEach((tt, sectionIndex) => {
        const soldInSection = soldTickets.filter(t => t.ticket_type_id === tt.id).length;
        const unsoldCount = tt.quantity - soldInSection;
        const seatsPerRow = Math.ceil(Math.sqrt(tt.quantity));

        for (let i = 0; i < unsoldCount; i++) {
            const position = soldInSection + i;
            const row = Math.floor(position / seatsPerRow);
            const col = position % seatsPerRow;

            seatData.push({
                seatId: `unsold-${tt.id}-${i}`,
                sectionId: tt.id,
                rowLabel: `R${row + 1}`,
                seatLabel: `${col + 1}`,
                x: sectionIndex * 150 + col * 20 + 50,
                y: row * 20 + 80,
                status: 'available',
                soldAt: null,
                price: tt.price,
                ticketTypeId: tt.id,
                ticketTypeName: tt.name,
                timeToSell: null,
                salesSpeedPercentile: null,
            });
        }
    });

    res.json({
        concertId: concert.id,
        concertName: concert.name,
        concertDate: concert.date,
        totalCapacity,
        totalSold,
        sections: sectionData,
        seats: seatData,
        salesPeriodStart,
        salesPeriodEnd,
    });
}));

/**
 * @swagger
 * /concerts/{id}/attendees:
 *   get:
 *     summary: Export attendee list for a concert
 *     tags: [Tickets Admin]
 */
router.get('/concerts/:id/attendees', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id: concertId } = req.params;
    const { format } = req.query;

    // Verify concert belongs to user's association
    const concert = db.prepare(`
        SELECT id, name FROM concerts WHERE id = ? AND association_id = ?
    `).get(concertId, req.user!.associationId) as { id: string; name: string } | undefined;

    if (!concert) {
        throw new ApiError(404, 'Concert not found');
    }

    const attendees = exportAttendeeList(concertId);

    if (format === 'csv') {
        // Generate CSV
        const header = 'Ticket Code,Buyer Name,Email,Ticket Type,Seat Info,Status,Purchase Date,Used At\n';
        const rows = attendees.map(a =>
            `"${a.ticketCode}","${a.buyerName}","${a.buyerEmail}","${a.ticketType}","${a.seatInfo || ''}","${a.status}","${a.purchaseDate}","${a.usedAt || ''}"`
        ).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="attendees-${concert.name.replace(/[^a-z0-9]/gi, '_')}.csv"`);
        res.send(header + rows);
        return;
    }

    res.json(attendees);
}));

/**
 * @swagger
 * /tickets/{id}/cancel:
 *   post:
 *     summary: Cancel a ticket
 *     tags: [Tickets Admin]
 */
router.post('/tickets/:id/cancel', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id: ticketId } = req.params;

    const ticket = db.prepare(`
        SELECT t.id, t.status, t.ticket_type_id, tt.concert_id
        FROM tickets t
        JOIN ticket_types tt ON t.ticket_type_id = tt.id
        JOIN concerts c ON tt.concert_id = c.id
        WHERE t.id = ? AND c.association_id = ?
    `).get(ticketId, req.user!.associationId) as {
        id: string;
        status: string;
        ticket_type_id: string;
        concert_id: string;
    } | undefined;

    if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
    }

    if (ticket.status !== 'valid') {
        throw new ApiError(400, `Cannot cancel ticket with status: ${ticket.status}`);
    }

    // Cancel ticket and release from sold count
    db.prepare(`UPDATE tickets SET status = 'cancelled' WHERE id = ?`).run(ticketId);
    releaseTickets(ticket.ticket_type_id, 1);

    res.json({ success: true, message: 'Ticket cancelled' });
}));

/**
 * @swagger
 * /tickets/orders/{id}/refund:
 *   post:
 *     summary: Refund an order
 *     tags: [Tickets Admin]
 */
router.post('/tickets/orders/:id/refund', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id: orderId } = req.params;
    const { reason } = req.body;

    const order = db.prepare(`
        SELECT o.id, o.payment_id, o.status, o.total
        FROM ticket_orders o
        JOIN concerts c ON o.concert_id = c.id
        WHERE o.id = ? AND c.association_id = ?
    `).get(orderId, req.user!.associationId) as {
        id: string;
        payment_id: string | null;
        status: string;
        total: number;
    } | undefined;

    if (!order) {
        throw new ApiError(404, 'Order not found');
    }

    if (order.status !== 'paid') {
        throw new ApiError(400, `Cannot refund order with status: ${order.status}`);
    }

    if (!order.payment_id) {
        throw new ApiError(400, 'No payment to refund');
    }

    // Create refund
    const refundResult = await createRefund({
        paymentId: order.payment_id,
        reason,
    });

    if (!refundResult.success) {
        throw new ApiError(500, refundResult.error || 'Failed to create refund');
    }

    // Update order and tickets
    const updateRefund = db.transaction(() => {
        // Update order
        db.prepare(`
            UPDATE ticket_orders SET status = 'refunded', updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(orderId);

        // Cancel all tickets and release counts
        const tickets = db.prepare(`
            SELECT t.id, t.ticket_type_id
            FROM tickets t
            WHERE t.order_id = ?
        `).all(orderId) as { id: string; ticket_type_id: string }[];

        for (const ticket of tickets) {
            db.prepare(`UPDATE tickets SET status = 'refunded' WHERE id = ?`).run(ticket.id);
            releaseTickets(ticket.ticket_type_id, 1);
        }
    });

    updateRefund();

    res.json({
        success: true,
        refundId: refundResult.refundId,
        message: 'Order refunded successfully',
    });
}));

/**
 * @swagger
 * /tickets/sales/{orderId}/payment-details:
 *   get:
 *     summary: Get payment details from Mollie/Stripe for an order
 *     tags: [Tickets Admin]
 */
router.get('/tickets/sales/:orderId/payment-details', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orderId } = req.params;

    // Get order with payment info
    const order = db.prepare(`
        SELECT o.id, o.payment_id, o.status
        FROM ticket_orders o
        JOIN concerts c ON o.concert_id = c.id
        WHERE o.id = ? AND c.association_id = ?
    `).get(orderId, req.user!.associationId) as {
        id: string;
        payment_id: string | null;
        status: string;
    } | undefined;

    if (!order) {
        throw new ApiError(404, 'Order not found');
    }

    if (!order.payment_id) {
        res.json({
            orderId: order.id,
            paymentId: null,
            provider: null,
            details: null,
        });
        return;
    }

    // Fetch payment details from provider
    const paymentDetails = await getPaymentStatus(order.payment_id);
    const provider = getPaymentProvider();

    res.json({
        orderId: order.id,
        paymentId: order.payment_id,
        provider,
        details: paymentDetails,
    });
}));

/**
 * @swagger
 * /tickets/sales/export:
 *   get:
 *     summary: Export all sales data as CSV
 *     tags: [Tickets Admin]
 */
router.get('/tickets/sales/export', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { concertId, status, startDate, endDate } = req.query;

    // Build query conditions
    const conditions: string[] = ['c.association_id = ?'];
    const params: unknown[] = [req.user!.associationId];

    if (concertId) {
        conditions.push('o.concert_id = ?');
        params.push(concertId);
    }

    if (status) {
        conditions.push('o.status = ?');
        params.push(status);
    }

    if (startDate) {
        conditions.push('o.created_at >= ?');
        params.push(startDate);
    }

    if (endDate) {
        conditions.push('o.created_at <= ?');
        params.push(endDate);
    }

    const whereClause = conditions.join(' AND ');

    const orders = db.prepare(`
        SELECT
            o.id as order_id,
            o.buyer_name,
            o.buyer_email,
            o.buyer_phone,
            o.total,
            o.status,
            o.payment_id,
            o.payment_method,
            o.paid_at,
            o.created_at,
            c.name as concert_name,
            c.date as concert_date,
            GROUP_CONCAT(tt.name || ' x' || oi.quantity, ', ') as items
        FROM ticket_orders o
        JOIN concerts c ON o.concert_id = c.id
        LEFT JOIN ticket_order_items oi ON oi.order_id = o.id
        LEFT JOIN ticket_types tt ON oi.ticket_type_id = tt.id
        WHERE ${whereClause}
        GROUP BY o.id
        ORDER BY o.created_at DESC
    `).all(...params) as {
        order_id: string;
        buyer_name: string;
        buyer_email: string;
        buyer_phone: string | null;
        total: number;
        status: string;
        payment_id: string | null;
        payment_method: string | null;
        paid_at: string | null;
        created_at: string;
        concert_name: string;
        concert_date: string;
        items: string | null;
    }[];

    // Generate CSV
    const header = 'Order ID,Concert,Concert Date,Buyer Name,Email,Phone,Items,Total,Status,Payment ID,Payment Method,Paid At,Created At\n';
    const rows = orders.map(o =>
        `"${o.order_id}","${o.concert_name}","${o.concert_date}","${o.buyer_name}","${o.buyer_email}","${o.buyer_phone || ''}","${o.items || ''}","${o.total.toFixed(2)}","${o.status}","${o.payment_id || ''}","${o.payment_method || ''}","${o.paid_at || ''}","${o.created_at}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="ticket-sales-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(header + rows);
}));

/**
 * @swagger
 * /concerts/{id}/tickets/predictions:
 *   get:
 *     summary: Get AI-based ticket sales predictions for a concert
 *     tags: [Tickets Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Concert ID
 *     responses:
 *       200:
 *         description: Sales prediction data
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Concert not found
 */
router.get('/concerts/:id/tickets/predictions', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id: concertId } = req.params;

    // Verify concert exists and belongs to user's association
    const concert = db.prepare(`
        SELECT id, name, date, venue_type, concert_type
        FROM concerts
        WHERE id = ? AND association_id = ?
    `).get(concertId, req.user!.associationId) as {
        id: string;
        name: string;
        date: string;
        venue_type: string | null;
        concert_type: string | null;
    } | undefined;

    if (!concert) {
        throw new ApiError(404, 'Concert not found');
    }

    // Get sales prediction data
    const predictionData = getSalesPredictionSummary(concertId);

    res.json({
        concert: {
            id: concert.id,
            name: concert.name,
            date: concert.date,
            venueType: concert.venue_type,
            concertType: concert.concert_type,
        },
        ...predictionData,
    });
}));

/**
 * Mock payment endpoint for development
 */
router.post('/tickets/orders/:id/mock-payment', asyncHandler(async (req: Request, res: Response) => {
    const { id: orderId } = req.params;
    const { action } = req.body; // 'pay' or 'cancel'

    if (action === 'pay') {
        await processPaymentUpdate(orderId, 'paid');
    } else {
        await processPaymentUpdate(orderId, 'cancelled');
    }

    res.json({ success: true });
}));

export default router;
