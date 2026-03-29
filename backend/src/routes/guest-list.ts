import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { z } from 'zod';
import {
    generateSecureTicketCode,
    generateQRCode,
    sendTicketConfirmationEmail,
} from '../services/ticketing';
import logger from '../utils/logger';

const router = Router();

// Validation schemas
const createGuestSchema = z.object({
    organisation: z.string().optional().nullable(),
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Valid email required'),
    ticketCount: z.number().int().min(1, 'At least 1 ticket required').max(20, 'Maximum 20 tickets'),
    ticketTypeId: z.string().uuid().optional().nullable(),
    notes: z.string().optional().nullable(),
});

const updateGuestSchema = createGuestSchema.partial();

/**
 * Generate order number for guest list entry
 * Format: GL-YYYY-NNN (e.g., GL-2024-001)
 */
function generateOrderNumber(concertId: string): string {
    const year = new Date().getFullYear();
    const count = db.prepare(`
        SELECT COUNT(*) as count FROM guest_list
        WHERE concert_id = ? AND order_number IS NOT NULL
    `).get(concertId) as { count: number };

    const num = (count.count + 1).toString().padStart(3, '0');
    return `GL-${year}-${num}`;
}

// =============================================
// GUEST LIST ROUTES (Admin only)
// =============================================

/**
 * @swagger
 * /concerts/{id}/guest-list:
 *   get:
 *     summary: Get guest list for a concert
 *     tags: [GuestList]
 */
router.get('/concerts/:id/guest-list', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id: concertId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
    const offset = (page - 1) * limit;
    const search = req.query.search as string || '';
    const ticketsSent = req.query.ticketsSent as string;

    // Check if concert exists
    const concert = db.prepare(`
        SELECT id, name, date FROM concerts WHERE id = ?
    `).get(concertId) as { id: string; name: string; date: string } | undefined;

    if (!concert) {
        throw new ApiError(404, 'Concert not found');
    }

    // Build query conditions
    let whereClause = 'WHERE gl.concert_id = ?';
    const params: (string | number)[] = [concertId];

    if (search) {
        whereClause += ' AND (gl.name LIKE ? OR gl.email LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }

    if (ticketsSent === 'true') {
        whereClause += ' AND gl.tickets_sent = 1';
    } else if (ticketsSent === 'false') {
        whereClause += ' AND gl.tickets_sent = 0';
    }

    // Get total count
    const countResult = db.prepare(`
        SELECT COUNT(*) as total FROM guest_list gl ${whereClause}
    `).get(...params) as { total: number };

    // Get entries
    const entries = db.prepare(`
        SELECT
            gl.id,
            gl.concert_id,
            gl.order_number,
            gl.organisation,
            gl.name,
            gl.email,
            gl.ticket_count,
            gl.ticket_type_id,
            gl.notes,
            gl.tickets_sent,
            gl.sent_at,
            gl.order_id,
            gl.created_at,
            gl.updated_at,
            c.name as concert_name,
            c.date as concert_date,
            tt.name as ticket_type_name,
            u.id as created_by_id,
            u.first_name as created_by_first_name,
            u.last_name as created_by_last_name
        FROM guest_list gl
        JOIN concerts c ON gl.concert_id = c.id
        LEFT JOIN ticket_types tt ON gl.ticket_type_id = tt.id
        LEFT JOIN users u ON gl.created_by = u.id
        ${whereClause}
        ORDER BY gl.created_at DESC
        LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as {
        id: string;
        concert_id: string;
        order_number: string | null;
        organisation: string | null;
        name: string;
        email: string;
        ticket_count: number;
        ticket_type_id: string | null;
        notes: string | null;
        tickets_sent: number;
        sent_at: string | null;
        order_id: string | null;
        created_at: string;
        updated_at: string;
        concert_name: string;
        concert_date: string;
        ticket_type_name: string | null;
        created_by_id: string | null;
        created_by_first_name: string | null;
        created_by_last_name: string | null;
    }[];

    // Get summary
    const summary = db.prepare(`
        SELECT
            COUNT(*) as total_guests,
            COALESCE(SUM(ticket_count), 0) as total_tickets,
            COALESCE(SUM(CASE WHEN tickets_sent = 1 THEN ticket_count ELSE 0 END), 0) as tickets_sent,
            COALESCE(SUM(CASE WHEN tickets_sent = 0 THEN ticket_count ELSE 0 END), 0) as tickets_pending
        FROM guest_list
        WHERE concert_id = ?
    `).get(concertId) as {
        total_guests: number;
        total_tickets: number;
        tickets_sent: number;
        tickets_pending: number;
    };

    res.json({
        entries: entries.map(e => ({
            id: e.id,
            concertId: e.concert_id,
            concertName: e.concert_name,
            concertDate: e.concert_date,
            orderNumber: e.order_number,
            organisation: e.organisation,
            name: e.name,
            email: e.email,
            ticketCount: e.ticket_count,
            ticketTypeId: e.ticket_type_id,
            ticketTypeName: e.ticket_type_name,
            notes: e.notes,
            ticketsSent: e.tickets_sent === 1,
            sentAt: e.sent_at,
            orderId: e.order_id,
            createdBy: e.created_by_id ? {
                id: e.created_by_id,
                firstName: e.created_by_first_name!,
                lastName: e.created_by_last_name!,
            } : null,
            createdAt: e.created_at,
            updatedAt: e.updated_at,
        })),
        pagination: {
            page,
            limit,
            total: countResult.total,
            totalPages: Math.ceil(countResult.total / limit),
        },
        summary: {
            totalGuests: summary.total_guests,
            totalTickets: summary.total_tickets,
            ticketsSent: summary.tickets_sent,
            ticketsPending: summary.tickets_pending,
        },
    });
}));

/**
 * @swagger
 * /concerts/{id}/guest-list:
 *   post:
 *     summary: Add a guest to the guest list
 *     tags: [GuestList]
 */
router.post('/concerts/:id/guest-list', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id: concertId } = req.params;
    const validation = createGuestSchema.safeParse(req.body);

    if (!validation.success) {
        throw new ApiError(400, validation.error.issues[0].message);
    }

    const { organisation, name, email, ticketCount, ticketTypeId, notes } = validation.data;

    // Check if concert exists
    const concert = db.prepare(`
        SELECT id, name, date, location FROM concerts WHERE id = ?
    `).get(concertId) as { id: string; name: string; date: string; location: string | null } | undefined;

    if (!concert) {
        throw new ApiError(404, 'Concert not found');
    }

    // Check if ticket type exists if provided
    if (ticketTypeId) {
        const ticketType = db.prepare(`
            SELECT id FROM ticket_types WHERE id = ? AND concert_id = ?
        `).get(ticketTypeId, concertId);

        if (!ticketType) {
            throw new ApiError(400, 'Invalid ticket type');
        }
    }

    const id = uuidv4();
    const orderNumber = generateOrderNumber(concertId);

    db.prepare(`
        INSERT INTO guest_list (id, concert_id, order_number, organisation, name, email, ticket_count, ticket_type_id, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, concertId, orderNumber, organisation || null, name, email, ticketCount, ticketTypeId || null, notes || null, req.user!.id);

    logger.info(`Guest added to list: ${name} (${email}) for concert ${concert.name}`, {
        guestId: id,
        concertId,
        orderNumber,
        ticketCount,
        addedBy: req.user!.id,
    });

    res.status(201).json({
        id,
        concertId,
        orderNumber,
        organisation: organisation || null,
        name,
        email,
        ticketCount,
        ticketTypeId: ticketTypeId || null,
        notes: notes || null,
        ticketsSent: false,
        sentAt: null,
        createdAt: new Date().toISOString(),
    });
}));

/**
 * @swagger
 * /guest-list/{id}:
 *   put:
 *     summary: Update a guest list entry
 *     tags: [GuestList]
 */
router.put('/guest-list/:id', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const validation = updateGuestSchema.safeParse(req.body);

    if (!validation.success) {
        throw new ApiError(400, validation.error.issues[0].message);
    }

    // Check if entry exists
    const existing = db.prepare(`
        SELECT id, concert_id, tickets_sent FROM guest_list WHERE id = ?
    `).get(id) as { id: string; concert_id: string; tickets_sent: number } | undefined;

    if (!existing) {
        throw new ApiError(404, 'Guest list entry not found');
    }

    if (existing.tickets_sent === 1) {
        throw new ApiError(400, 'Cannot modify entry after tickets have been sent');
    }

    const { organisation, name, email, ticketCount, ticketTypeId, notes } = validation.data;

    // Check if ticket type exists if provided
    if (ticketTypeId) {
        const ticketType = db.prepare(`
            SELECT id FROM ticket_types WHERE id = ? AND concert_id = ?
        `).get(ticketTypeId, existing.concert_id);

        if (!ticketType) {
            throw new ApiError(400, 'Invalid ticket type');
        }
    }

    // Build update query
    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (organisation !== undefined) {
        updates.push('organisation = ?');
        params.push(organisation);
    }
    if (name !== undefined) {
        updates.push('name = ?');
        params.push(name);
    }
    if (email !== undefined) {
        updates.push('email = ?');
        params.push(email);
    }
    if (ticketCount !== undefined) {
        updates.push('ticket_count = ?');
        params.push(ticketCount);
    }
    if (ticketTypeId !== undefined) {
        updates.push('ticket_type_id = ?');
        params.push(ticketTypeId);
    }
    if (notes !== undefined) {
        updates.push('notes = ?');
        params.push(notes);
    }

    if (updates.length > 0) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(id);

        db.prepare(`
            UPDATE guest_list SET ${updates.join(', ')} WHERE id = ?
        `).run(...params);
    }

    const updated = db.prepare(`
        SELECT
            gl.*,
            c.name as concert_name,
            c.date as concert_date,
            tt.name as ticket_type_name
        FROM guest_list gl
        JOIN concerts c ON gl.concert_id = c.id
        LEFT JOIN ticket_types tt ON gl.ticket_type_id = tt.id
        WHERE gl.id = ?
    `).get(id) as {
        id: string;
        concert_id: string;
        order_number: string | null;
        organisation: string | null;
        name: string;
        email: string;
        ticket_count: number;
        ticket_type_id: string | null;
        notes: string | null;
        tickets_sent: number;
        sent_at: string | null;
        order_id: string | null;
        created_at: string;
        updated_at: string;
        concert_name: string;
        concert_date: string;
        ticket_type_name: string | null;
    };

    res.json({
        id: updated.id,
        concertId: updated.concert_id,
        concertName: updated.concert_name,
        concertDate: updated.concert_date,
        orderNumber: updated.order_number,
        organisation: updated.organisation,
        name: updated.name,
        email: updated.email,
        ticketCount: updated.ticket_count,
        ticketTypeId: updated.ticket_type_id,
        ticketTypeName: updated.ticket_type_name,
        notes: updated.notes,
        ticketsSent: updated.tickets_sent === 1,
        sentAt: updated.sent_at,
        orderId: updated.order_id,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
    });
}));

/**
 * @swagger
 * /guest-list/{id}:
 *   delete:
 *     summary: Remove a guest from the guest list
 *     tags: [GuestList]
 */
router.delete('/guest-list/:id', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    // Check if entry exists
    const existing = db.prepare(`
        SELECT id, name, email, concert_id, tickets_sent FROM guest_list WHERE id = ?
    `).get(id) as { id: string; name: string; email: string; concert_id: string; tickets_sent: number } | undefined;

    if (!existing) {
        throw new ApiError(404, 'Guest list entry not found');
    }

    if (existing.tickets_sent === 1) {
        throw new ApiError(400, 'Cannot delete entry after tickets have been sent. Consider cancelling the tickets instead.');
    }

    db.prepare('DELETE FROM guest_list WHERE id = ?').run(id);

    logger.info(`Guest removed from list: ${existing.name} (${existing.email})`, {
        guestId: id,
        concertId: existing.concert_id,
        removedBy: req.user!.id,
    });

    res.status(204).send();
}));

/**
 * @swagger
 * /guest-list/{id}/send-tickets:
 *   post:
 *     summary: Generate and send tickets to a guest
 *     tags: [GuestList]
 */
router.post('/guest-list/:id/send-tickets', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    // Get guest list entry
    const entry = db.prepare(`
        SELECT
            gl.*,
            c.name as concert_name,
            c.date as concert_date,
            c.location as concert_location,
            c.association_id,
            tt.name as ticket_type_name
        FROM guest_list gl
        JOIN concerts c ON gl.concert_id = c.id
        LEFT JOIN ticket_types tt ON gl.ticket_type_id = tt.id
        WHERE gl.id = ?
    `).get(id) as {
        id: string;
        concert_id: string;
        name: string;
        email: string;
        ticket_count: number;
        ticket_type_id: string | null;
        notes: string | null;
        tickets_sent: number;
        concert_name: string;
        concert_date: string;
        concert_location: string | null;
        association_id: string | null;
        ticket_type_name: string | null;
    } | undefined;

    if (!entry) {
        throw new ApiError(404, 'Guest list entry not found');
    }

    if (entry.tickets_sent === 1) {
        throw new ApiError(400, 'Tickets have already been sent to this guest');
    }

    // Create a guest order (total = 0 for free tickets)
    const orderId = uuidv4();
    const tickets: { id: string; code: string; qrDataUrl: string }[] = [];

    const createGuestTickets = db.transaction(() => {
        // Create order for tracking
        db.prepare(`
            INSERT INTO ticket_orders (id, concert_id, total, status, buyer_name, buyer_email, payment_method, paid_at)
            VALUES (?, ?, 0, 'paid', ?, ?, 'guest_list', CURRENT_TIMESTAMP)
        `).run(orderId, entry.concert_id, entry.name, entry.email);

        // Create order item if ticket type specified
        if (entry.ticket_type_id) {
            db.prepare(`
                INSERT INTO ticket_order_items (id, order_id, ticket_type_id, quantity, unit_price)
                VALUES (?, ?, ?, ?, 0)
            `).run(uuidv4(), orderId, entry.ticket_type_id, entry.ticket_count);
        }

        // Generate tickets
        for (let i = 0; i < entry.ticket_count; i++) {
            const ticketId = uuidv4();
            const ticketCode = generateSecureTicketCode();

            db.prepare(`
                INSERT INTO tickets (id, ticket_type_id, order_id, buyer_name, buyer_email, status, qr_code)
                VALUES (?, ?, ?, ?, ?, 'valid', ?)
            `).run(
                ticketId,
                entry.ticket_type_id || 'guest',
                orderId,
                entry.name,
                entry.email,
                ticketCode
            );

            tickets.push({ id: ticketId, code: ticketCode, qrDataUrl: '' });
        }

        // Mark as sent and link order
        db.prepare(`
            UPDATE guest_list SET tickets_sent = 1, sent_at = CURRENT_TIMESTAMP, order_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(orderId, id);
    });

    try {
        createGuestTickets();
    } catch (error) {
        logger.error('Failed to create guest tickets:', error);
        throw new ApiError(500, 'Failed to create tickets');
    }

    // Generate QR codes and send email
    try {
        for (const ticket of tickets) {
            ticket.qrDataUrl = await generateQRCode(ticket.code);
        }

        // Send email with all tickets
        const concertDate = new Date(entry.concert_date).toLocaleDateString('nl-NL', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });

        await sendTicketConfirmationEmail({
            buyerName: entry.name,
            buyerEmail: entry.email,
            concertName: entry.concert_name,
            concertDate,
            concertLocation: entry.concert_location || 'TBA',
            ticketTypeName: entry.ticket_type_name || 'Gratis Ticket',
            ticketCode: tickets.map(t => t.code).join(', '),
            qrCodeDataUrl: tickets[0].qrDataUrl,
            orderTotal: 0,
            quantity: entry.ticket_count,
        }, entry.association_id);

        logger.info(`Guest tickets sent: ${entry.name} (${entry.email}) - ${entry.ticket_count} tickets`, {
            guestId: id,
            orderId,
            concertId: entry.concert_id,
            sentBy: req.user!.id,
        });
    } catch (error) {
        logger.error('Failed to send guest ticket email:', error);
        // Tickets are created, but email failed - don't throw, just warn
    }

    res.json({
        success: true,
        orderId,
        ticketCount: tickets.length,
        tickets: tickets.map(t => ({
            id: t.id,
            code: t.code,
        })),
    });
}));

/**
 * @swagger
 * /concerts/{id}/guest-list/send-all:
 *   post:
 *     summary: Send tickets to all guests who haven't received them yet
 *     tags: [GuestList]
 */
router.post('/concerts/:id/guest-list/send-all', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id: concertId } = req.params;

    // Get all unsent guest list entries
    const entries = db.prepare(`
        SELECT id FROM guest_list WHERE concert_id = ? AND tickets_sent = 0
    `).all(concertId) as { id: string }[];

    if (entries.length === 0) {
        return res.json({
            success: true,
            sent: 0,
            message: 'No pending tickets to send',
        });
    }

    let successCount = 0;
    const errors: string[] = [];

    for (const entry of entries) {
        try {
            // Re-use the send-tickets logic
            const guestEntry = db.prepare(`
                SELECT
                    gl.*,
                    c.name as concert_name,
                    c.date as concert_date,
                    c.location as concert_location,
                    c.association_id,
                    tt.name as ticket_type_name
                FROM guest_list gl
                JOIN concerts c ON gl.concert_id = c.id
                LEFT JOIN ticket_types tt ON gl.ticket_type_id = tt.id
                WHERE gl.id = ?
            `).get(entry.id) as {
                id: string;
                concert_id: string;
                name: string;
                email: string;
                ticket_count: number;
                ticket_type_id: string | null;
                concert_name: string;
                concert_date: string;
                concert_location: string | null;
                association_id: string | null;
                ticket_type_name: string | null;
            };

            const orderId = uuidv4();
            const tickets: { code: string; qrDataUrl: string }[] = [];

            db.transaction(() => {
                db.prepare(`
                    INSERT INTO ticket_orders (id, concert_id, total, status, buyer_name, buyer_email, payment_method, paid_at)
                    VALUES (?, ?, 0, 'paid', ?, ?, 'guest_list', CURRENT_TIMESTAMP)
                `).run(orderId, guestEntry.concert_id, guestEntry.name, guestEntry.email);

                if (guestEntry.ticket_type_id) {
                    db.prepare(`
                        INSERT INTO ticket_order_items (id, order_id, ticket_type_id, quantity, unit_price)
                        VALUES (?, ?, ?, ?, 0)
                    `).run(uuidv4(), orderId, guestEntry.ticket_type_id, guestEntry.ticket_count);
                }

                for (let i = 0; i < guestEntry.ticket_count; i++) {
                    const ticketId = uuidv4();
                    const ticketCode = generateSecureTicketCode();

                    db.prepare(`
                        INSERT INTO tickets (id, ticket_type_id, order_id, buyer_name, buyer_email, status, qr_code)
                        VALUES (?, ?, ?, ?, ?, 'valid', ?)
                    `).run(ticketId, guestEntry.ticket_type_id || 'guest', orderId, guestEntry.name, guestEntry.email, ticketCode);

                    tickets.push({ code: ticketCode, qrDataUrl: '' });
                }

                db.prepare(`
                    UPDATE guest_list SET tickets_sent = 1, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
                `).run(entry.id);
            })();

            // Generate QR and send email
            for (const ticket of tickets) {
                ticket.qrDataUrl = await generateQRCode(ticket.code);
            }

            const concertDate = new Date(guestEntry.concert_date).toLocaleDateString('nl-NL', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });

            await sendTicketConfirmationEmail({
                buyerName: guestEntry.name,
                buyerEmail: guestEntry.email,
                concertName: guestEntry.concert_name,
                concertDate,
                concertLocation: guestEntry.concert_location || 'TBA',
                ticketTypeName: guestEntry.ticket_type_name || 'Gratis Ticket',
                ticketCode: tickets.map(t => t.code).join(', '),
                qrCodeDataUrl: tickets[0].qrDataUrl,
                orderTotal: 0,
                quantity: guestEntry.ticket_count,
            }, guestEntry.association_id);

            successCount++;
        } catch (error) {
            logger.error(`Failed to send tickets to guest ${entry.id}:`, error);
            errors.push(entry.id);
        }
    }

    res.json({
        success: true,
        sent: successCount,
        failed: errors.length,
        errors: errors.length > 0 ? errors : undefined,
    });
}));

export default router;
