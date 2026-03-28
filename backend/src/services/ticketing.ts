import crypto from 'crypto';
import QRCode from 'qrcode';
import { sendEmail } from '../utils/email';
import db from '../database/connection';
import logger from '../utils/logger';

/**
 * Generate a unique ticket code
 * Format: XXXX-XXXX-XXXX (12 alphanumeric characters)
 */
export function generateTicketCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding similar characters (0, O, 1, I)
    let code = '';
    for (let i = 0; i < 12; i++) {
        if (i > 0 && i % 4 === 0) {
            code += '-';
        }
        code += chars.charAt(crypto.randomInt(chars.length));
    }
    return code;
}

/**
 * Generate a cryptographically secure ticket code with checksum
 */
export function generateSecureTicketCode(): string {
    // Generate random bytes
    const randomBytes = crypto.randomBytes(8);
    const hex = randomBytes.toString('hex').toUpperCase();

    // Create a simple checksum (last 2 chars based on hash of first 14)
    const hash = crypto.createHash('sha256').update(hex).digest('hex');
    const checksum = hash.substring(0, 2).toUpperCase();

    // Format: XXXX-XXXX-XXXX-XX
    return `${hex.substring(0, 4)}-${hex.substring(4, 8)}-${hex.substring(8, 12)}-${checksum}`;
}

/**
 * Validate ticket code checksum
 */
export function validateTicketCodeChecksum(code: string): boolean {
    const cleanCode = code.replace(/-/g, '');
    if (cleanCode.length !== 18) return false;

    const payload = cleanCode.substring(0, 16);
    const checksum = cleanCode.substring(16, 18);

    const hash = crypto.createHash('sha256').update(payload).digest('hex');
    const expectedChecksum = hash.substring(0, 2).toUpperCase();

    return checksum === expectedChecksum;
}

/**
 * Generate QR code as data URL
 */
export async function generateQRCode(data: string): Promise<string> {
    try {
        const qrDataUrl = await QRCode.toDataURL(data, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            margin: 2,
            width: 300,
            color: {
                dark: '#000000',
                light: '#FFFFFF',
            },
        });
        return qrDataUrl;
    } catch (error) {
        logger.error('Failed to generate QR code:', error);
        throw new Error('Failed to generate QR code');
    }
}

/**
 * Generate QR code as SVG string
 */
export async function generateQRCodeSVG(data: string): Promise<string> {
    try {
        const svg = await QRCode.toString(data, {
            type: 'svg',
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 300,
        });
        return svg;
    } catch (error) {
        logger.error('Failed to generate QR code SVG:', error);
        throw new Error('Failed to generate QR code');
    }
}

export interface TicketEmailData {
    buyerName: string;
    buyerEmail: string;
    concertName: string;
    concertDate: string;
    concertLocation: string;
    ticketTypeName: string;
    ticketCode: string;
    qrCodeDataUrl: string;
    orderTotal: number;
    quantity: number;
}

/**
 * Send ticket confirmation email with QR code
 */
export async function sendTicketConfirmationEmail(
    data: TicketEmailData,
    associationId?: string | null
): Promise<boolean> {
    const subject = `Your tickets for ${data.concertName}`;

    const text = `
Dear ${data.buyerName},

Thank you for your purchase! Here are your ticket details:

Concert: ${data.concertName}
Date: ${data.concertDate}
Location: ${data.concertLocation}
Ticket Type: ${data.ticketTypeName}
Quantity: ${data.quantity}
Total: EUR ${data.orderTotal.toFixed(2)}

Your ticket code: ${data.ticketCode}

Please show the QR code at the entrance. You can find the QR code in the HTML version of this email or in your account under "My Tickets".

We look forward to seeing you!

Best regards,
The Harmonie Team
`;

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .ticket-card { background: #f8f9fa; border-radius: 12px; padding: 24px; margin: 20px 0; border: 2px dashed #dee2e6; }
        .qr-container { text-align: center; margin: 20px 0; }
        .qr-container img { border: 8px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .ticket-code { font-family: 'Courier New', monospace; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 2px; margin: 15px 0; }
        .details { margin: 20px 0; }
        .detail-row { display: flex; padding: 8px 0; border-bottom: 1px solid #eee; }
        .detail-label { font-weight: 600; width: 120px; }
        .total { font-size: 1.25em; font-weight: bold; color: #2e7d32; margin-top: 15px; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Your Tickets</h1>
            <p>Thank you for your purchase!</p>
        </div>

        <div class="ticket-card">
            <h2 style="margin-top: 0; text-align: center;">${data.concertName}</h2>

            <div class="qr-container">
                <img src="${data.qrCodeDataUrl}" alt="Ticket QR Code" width="200" height="200" />
            </div>

            <div class="ticket-code">${data.ticketCode}</div>

            <div class="details">
                <div class="detail-row">
                    <span class="detail-label">Date:</span>
                    <span>${data.concertDate}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Location:</span>
                    <span>${data.concertLocation}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Ticket Type:</span>
                    <span>${data.ticketTypeName}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Quantity:</span>
                    <span>${data.quantity}</span>
                </div>
            </div>

            <div class="total">Total: EUR ${data.orderTotal.toFixed(2)}</div>
        </div>

        <p style="text-align: center;">
            <strong>Please show the QR code at the entrance.</strong>
        </p>

        <div class="footer">
            <p>This email serves as your ticket confirmation.</p>
            <p>Questions? Contact us at the venue.</p>
        </div>
    </div>
</body>
</html>
`;

    return sendEmail({
        to: data.buyerEmail,
        subject,
        text,
        html,
        associationId,
    });
}

export interface TicketValidationResult {
    valid: boolean;
    status: 'valid' | 'used' | 'cancelled' | 'refunded' | 'not_found' | 'wrong_concert' | 'expired';
    ticket?: {
        id: string;
        code: string;
        buyerName: string;
        ticketType: string;
        concertName: string;
        concertDate: string;
        usedAt?: string;
        seatInfo?: string;
    };
    message: string;
}

/**
 * Validate a ticket by its QR code
 */
export function validateTicket(
    qrCode: string,
    concertId?: string
): TicketValidationResult {
    // Look up the ticket
    const ticket = db.prepare(`
        SELECT
            t.id,
            t.qr_code,
            t.buyer_name,
            t.status,
            t.used_at,
            t.seat_info,
            tt.name as ticket_type_name,
            c.id as concert_id,
            c.name as concert_name,
            c.date as concert_date,
            c.end_date as concert_end_date
        FROM tickets t
        JOIN ticket_types tt ON t.ticket_type_id = tt.id
        JOIN concerts c ON tt.concert_id = c.id
        WHERE t.qr_code = ?
    `).get(qrCode) as {
        id: string;
        qr_code: string;
        buyer_name: string;
        status: string;
        used_at: string | null;
        seat_info: string | null;
        ticket_type_name: string;
        concert_id: string;
        concert_name: string;
        concert_date: string;
        concert_end_date: string | null;
    } | undefined;

    if (!ticket) {
        return {
            valid: false,
            status: 'not_found',
            message: 'Ticket not found',
        };
    }

    // Check if this is for the right concert
    if (concertId && ticket.concert_id !== concertId) {
        return {
            valid: false,
            status: 'wrong_concert',
            ticket: {
                id: ticket.id,
                code: ticket.qr_code,
                buyerName: ticket.buyer_name,
                ticketType: ticket.ticket_type_name,
                concertName: ticket.concert_name,
                concertDate: ticket.concert_date,
                seatInfo: ticket.seat_info || undefined,
            },
            message: 'This ticket is for a different concert',
        };
    }

    // Check ticket status
    if (ticket.status === 'used') {
        return {
            valid: false,
            status: 'used',
            ticket: {
                id: ticket.id,
                code: ticket.qr_code,
                buyerName: ticket.buyer_name,
                ticketType: ticket.ticket_type_name,
                concertName: ticket.concert_name,
                concertDate: ticket.concert_date,
                usedAt: ticket.used_at || undefined,
                seatInfo: ticket.seat_info || undefined,
            },
            message: `Ticket already used at ${ticket.used_at}`,
        };
    }

    if (ticket.status === 'cancelled') {
        return {
            valid: false,
            status: 'cancelled',
            ticket: {
                id: ticket.id,
                code: ticket.qr_code,
                buyerName: ticket.buyer_name,
                ticketType: ticket.ticket_type_name,
                concertName: ticket.concert_name,
                concertDate: ticket.concert_date,
                seatInfo: ticket.seat_info || undefined,
            },
            message: 'Ticket has been cancelled',
        };
    }

    if (ticket.status === 'refunded') {
        return {
            valid: false,
            status: 'refunded',
            ticket: {
                id: ticket.id,
                code: ticket.qr_code,
                buyerName: ticket.buyer_name,
                ticketType: ticket.ticket_type_name,
                concertName: ticket.concert_name,
                concertDate: ticket.concert_date,
                seatInfo: ticket.seat_info || undefined,
            },
            message: 'Ticket has been refunded',
        };
    }

    // Check if concert date has passed (allow entry on concert day and day after for multi-day events)
    const concertEndDate = ticket.concert_end_date || ticket.concert_date;
    const endDate = new Date(concertEndDate);
    endDate.setDate(endDate.getDate() + 1); // Allow entry until day after concert

    if (new Date() > endDate) {
        return {
            valid: false,
            status: 'expired',
            ticket: {
                id: ticket.id,
                code: ticket.qr_code,
                buyerName: ticket.buyer_name,
                ticketType: ticket.ticket_type_name,
                concertName: ticket.concert_name,
                concertDate: ticket.concert_date,
                seatInfo: ticket.seat_info || undefined,
            },
            message: 'Concert has already ended',
        };
    }

    // Ticket is valid
    return {
        valid: true,
        status: 'valid',
        ticket: {
            id: ticket.id,
            code: ticket.qr_code,
            buyerName: ticket.buyer_name,
            ticketType: ticket.ticket_type_name,
            concertName: ticket.concert_name,
            concertDate: ticket.concert_date,
            seatInfo: ticket.seat_info || undefined,
        },
        message: 'Ticket is valid',
    };
}

/**
 * Mark a ticket as used (scanned at entrance)
 */
export function markTicketAsUsed(
    qrCode: string,
    validatedBy: string
): { success: boolean; message: string } {
    const validation = validateTicket(qrCode);

    if (!validation.valid) {
        return {
            success: false,
            message: validation.message,
        };
    }

    const now = new Date().toISOString();

    const result = db.prepare(`
        UPDATE tickets
        SET status = 'used', used_at = ?, validated_by = ?
        WHERE qr_code = ? AND status = 'valid'
    `).run(now, validatedBy, qrCode);

    if (result.changes === 0) {
        return {
            success: false,
            message: 'Failed to update ticket status',
        };
    }

    logger.info(`Ticket ${qrCode} marked as used by ${validatedBy}`);

    return {
        success: true,
        message: 'Ticket validated successfully',
    };
}

/**
 * Calculate available tickets for a ticket type
 */
export function getAvailableTickets(ticketTypeId: string): number {
    const ticketType = db.prepare(`
        SELECT quantity, sold FROM ticket_types WHERE id = ?
    `).get(ticketTypeId) as { quantity: number; sold: number } | undefined;

    if (!ticketType) return 0;

    return Math.max(0, ticketType.quantity - ticketType.sold);
}

/**
 * Reserve tickets temporarily (during checkout)
 * Note: This is a simplified version. In production, use Redis with TTL
 */
export function reserveTickets(
    ticketTypeId: string,
    quantity: number
): { success: boolean; message: string } {
    const available = getAvailableTickets(ticketTypeId);

    if (available < quantity) {
        return {
            success: false,
            message: `Only ${available} tickets available`,
        };
    }

    // Update sold count (reservation)
    db.prepare(`
        UPDATE ticket_types
        SET sold = sold + ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(quantity, ticketTypeId);

    return {
        success: true,
        message: 'Tickets reserved',
    };
}

/**
 * Release reserved tickets (if payment fails or times out)
 */
export function releaseTickets(
    ticketTypeId: string,
    quantity: number
): void {
    db.prepare(`
        UPDATE ticket_types
        SET sold = MAX(0, sold - ?), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(quantity, ticketTypeId);
}

/**
 * Get ticket statistics for a concert
 */
export interface ConcertTicketStats {
    concertId: string;
    concertName: string;
    totalCapacity: number;
    totalSold: number;
    totalRevenue: number;
    ticketTypes: {
        id: string;
        name: string;
        price: number;
        quantity: number;
        sold: number;
        available: number;
        revenue: number;
    }[];
}

export function getConcertTicketStats(concertId: string): ConcertTicketStats | null {
    const concert = db.prepare(`
        SELECT id, name FROM concerts WHERE id = ?
    `).get(concertId) as { id: string; name: string } | undefined;

    if (!concert) return null;

    const ticketTypes = db.prepare(`
        SELECT id, name, price, quantity, sold
        FROM ticket_types
        WHERE concert_id = ?
        ORDER BY price ASC
    `).all(concertId) as {
        id: string;
        name: string;
        price: number;
        quantity: number;
        sold: number;
    }[];

    let totalCapacity = 0;
    let totalSold = 0;
    let totalRevenue = 0;

    const mappedTicketTypes = ticketTypes.map(tt => {
        const revenue = tt.price * tt.sold;
        totalCapacity += tt.quantity;
        totalSold += tt.sold;
        totalRevenue += revenue;

        return {
            id: tt.id,
            name: tt.name,
            price: tt.price,
            quantity: tt.quantity,
            sold: tt.sold,
            available: tt.quantity - tt.sold,
            revenue,
        };
    });

    return {
        concertId: concert.id,
        concertName: concert.name,
        totalCapacity,
        totalSold,
        totalRevenue,
        ticketTypes: mappedTicketTypes,
    };
}

/**
 * Export attendee list for a concert
 */
export interface AttendeeExport {
    ticketCode: string;
    buyerName: string;
    buyerEmail: string;
    ticketType: string;
    seatInfo: string | null;
    status: string;
    purchaseDate: string;
    usedAt: string | null;
}

export function exportAttendeeList(concertId: string): AttendeeExport[] {
    return db.prepare(`
        SELECT
            t.qr_code as ticketCode,
            t.buyer_name as buyerName,
            t.buyer_email as buyerEmail,
            tt.name as ticketType,
            t.seat_info as seatInfo,
            t.status,
            t.purchase_date as purchaseDate,
            t.used_at as usedAt
        FROM tickets t
        JOIN ticket_types tt ON t.ticket_type_id = tt.id
        JOIN ticket_orders o ON t.order_id = o.id
        WHERE tt.concert_id = ? AND o.status = 'paid'
        ORDER BY t.buyer_name ASC
    `).all(concertId) as AttendeeExport[];
}
