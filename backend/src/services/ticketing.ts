import crypto from 'crypto';
import QRCode from 'qrcode';
import { sendEmail } from '../utils/email';
import db from '../database/connection';
import logger from '../utils/logger';
import { getTicketEmailContent as getTicketEmailContentNL } from '../templates/emails/ticket-confirmation.nl';
import { getTicketEmailContent as getTicketEmailContentEN } from '../templates/emails/ticket-confirmation.en';
import { getTicketEmailContent as getTicketEmailContentDE } from '../templates/emails/ticket-confirmation.de';

export type SupportedLanguage = 'nl' | 'en' | 'de';

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

  // Checksum over the full 16-char payload, so validateTicketCodeChecksum()
  // can recompute it from the emitted code.
  const hash = crypto.createHash('sha256').update(hex).digest('hex');
  const checksum = hash.substring(0, 2).toUpperCase();

  // Format: XXXX-XXXX-XXXX-XXXX-XX
  return `${hex.substring(0, 4)}-${hex.substring(4, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${checksum}`;
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
    throw new Error('Failed to generate QR code', { cause: error });
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
    throw new Error('Failed to generate QR code', { cause: error });
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
 * Get the email content generator function for a given language
 */
function getEmailContentGenerator(language: SupportedLanguage): typeof getTicketEmailContentNL {
  switch (language) {
    case 'nl':
      return getTicketEmailContentNL;
    case 'de':
      return getTicketEmailContentDE;
    case 'en':
    default:
      return getTicketEmailContentEN;
  }
}

/**
 * Send ticket confirmation email with QR code
 * @param data - Ticket email data
 * @param associationId - Optional association ID for SMTP configuration
 * @param language - Language for email content (defaults to 'nl')
 */
export async function sendTicketConfirmationEmail(
  data: TicketEmailData,
  associationId?: string | null,
  language: SupportedLanguage = 'nl',
): Promise<boolean> {
  const getEmailContent = getEmailContentGenerator(language);
  const { subject, text, html } = getEmailContent(data);

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
 *
 * associationId hoort erbij zodra er een ingelogde scanner achter zit. Zonder
 * die grens vindt een kaartcode zijn kaart bij elke vereniging, en kan de
 * dirigent van de ene club de kaart van de andere op 'gebruikt' zetten - de
 * echte bezoeker staat dan bij de deur met een kaart die al gescand heet te
 * zijn. Blijft optioneel voor aanroepen zonder gebruiker (de publieke
 * kaartpagina).
 *
 * opMoment is het tijdstip waarop de kaart daadwerkelijk aan de deur is
 * aangeboden. Dat is standaard nu, maar niet bij een scan die offline is
 * gemaakt en pas later wordt nagestuurd: die is aan de deur tijdens het
 * concert gedaan, terwijl het nasturen de volgende ochtend kan gebeuren.
 * Zonder dit tijdstip valt zo'n scan onder 'expired' - de kaart wordt dan
 * nooit afgestempeld en de bezoeker die er wél was ontbreekt in de telling.
 */
export function validateTicket(
  qrCode: string,
  concertId?: string,
  associationId?: string,
  opMoment?: Date,
): TicketValidationResult {
  // Look up the ticket
  const ticket = db
    .prepare(
      `
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
          AND (? IS NULL OR c.association_id = ?)
    `,
    )
    .get(qrCode, associationId ?? null, associationId ?? null) as
    | {
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
      }
    | undefined;

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

  if ((opMoment ?? new Date()) > endDate) {
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
 *
 * associationId begrenst dezelfde zoekopdracht als in validateTicket; de
 * bijwerking hieronder gaat op qr_code, dus zonder die controle vooraf zou een
 * kaart van een andere vereniging alsnog worden weggeschreven.
 *
 * usedAt is het tijdstip waarop de kaart aan de deur is gescand. Bij een scan
 * die het apparaat offline maakte en pas later nastuurt is dat niet hetzelfde
 * als nu: zou hier het moment van nasturen worden weggeschreven, dan staat op
 * elke kaart de tijd waarop de telefoon weer bereik kreeg, en is niet meer na
 * te gaan wie er als eerste door de deur ging. Ook de geldigheidstoets gaat
 * dan over dat latere moment.
 */
export function markTicketAsUsed(
  qrCode: string,
  validatedBy: string,
  associationId?: string,
  usedAt?: string,
): { success: boolean; message: string } {
  const validation = validateTicket(qrCode, undefined, associationId, usedAt ? new Date(usedAt) : undefined);

  if (!validation.valid) {
    return {
      success: false,
      message: validation.message,
    };
  }

  const now = usedAt ?? new Date().toISOString();

  const result = db
    .prepare(
      `
        UPDATE tickets
        SET status = 'used', used_at = ?, validated_by = ?
        WHERE qr_code = ? AND status = 'valid'
    `,
    )
    .run(now, validatedBy, qrCode);

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
  const ticketType = db
    .prepare(
      `
        SELECT quantity, sold FROM ticket_types WHERE id = ?
    `,
    )
    .get(ticketTypeId) as { quantity: number; sold: number } | undefined;

  if (!ticketType) return 0;

  return Math.max(0, ticketType.quantity - ticketType.sold);
}

/**
 * Reserve tickets temporarily (during checkout)
 * Uses atomic conditional UPDATE to prevent race conditions / overselling
 */
export function reserveTickets(
  ticketTypeId: string,
  quantity: number,
): { success: boolean; message: string; available?: number } {
  // Atomic check-and-update: only succeeds if enough tickets available
  // This prevents race conditions where two concurrent requests both pass
  // the availability check before either updates the sold count
  const result = db
    .prepare(
      `
        UPDATE ticket_types
        SET sold = sold + ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND (quantity - sold) >= ?
    `,
    )
    .run(quantity, ticketTypeId, quantity);

  if (result.changes === 0) {
    // Update failed - either ticket type doesn't exist or not enough available
    const available = getAvailableTickets(ticketTypeId);
    return {
      success: false,
      message: available === 0 ? 'No tickets available' : `Only ${available} tickets available`,
      available,
    };
  }

  return {
    success: true,
    message: 'Tickets reserved',
  };
}

/**
 * Release reserved tickets (if payment fails or times out)
 */
export function releaseTickets(ticketTypeId: string, quantity: number): void {
  db.prepare(
    `
        UPDATE ticket_types
        SET sold = MAX(0, sold - ?), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `,
  ).run(quantity, ticketTypeId);
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

export function getConcertTicketStats(concertId: string): (ConcertTicketStats & { guestListTickets?: number }) | null {
  const concert = db
    .prepare(
      `
        SELECT id, name FROM concerts WHERE id = ?
    `,
    )
    .get(concertId) as { id: string; name: string } | undefined;

  if (!concert) return null;

  const ticketTypes = db
    .prepare(
      `
        SELECT id, name, price, quantity, sold
        FROM ticket_types
        WHERE concert_id = ?
        ORDER BY price ASC
    `,
    )
    .all(concertId) as {
    id: string;
    name: string;
    price: number;
    quantity: number;
    sold: number;
  }[];

  // Count guest list tickets (free tickets sent via guest list)
  const guestListStats = db
    .prepare(
      `
        SELECT COALESCE(SUM(ticket_count), 0) as total_tickets
        FROM guest_list
        WHERE concert_id = ? AND tickets_sent = 1
    `,
    )
    .get(concertId) as { total_tickets: number };

  const guestListTickets = guestListStats.total_tickets;

  let totalCapacity = 0;
  let totalSold = 0;
  let totalRevenue = 0;

  const mappedTicketTypes = ticketTypes.map((tt) => {
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

  // Add guest list tickets to total sold count
  totalSold += guestListTickets;

  return {
    concertId: concert.id,
    concertName: concert.name,
    totalCapacity,
    totalSold,
    totalRevenue,
    ticketTypes: mappedTicketTypes,
    guestListTickets,
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
  // Get paid tickets (including guest list tickets which have payment_method='guest_list')
  return db
    .prepare(
      `
        SELECT
            t.qr_code as ticketCode,
            t.buyer_name as buyerName,
            t.buyer_email as buyerEmail,
            COALESCE(tt.name, 'Gratis Ticket') as ticketType,
            t.seat_info as seatInfo,
            t.status,
            t.purchase_date as purchaseDate,
            t.used_at as usedAt
        FROM tickets t
        LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
        JOIN ticket_orders o ON t.order_id = o.id
        WHERE o.concert_id = ? AND o.status = 'paid'
        ORDER BY t.buyer_name ASC
    `,
    )
    .all(concertId) as AttendeeExport[];
}

// ============================================
// EARLY-BIRD PRICING
// ============================================

export interface TicketTypeWithEarlyBird {
  id: string;
  price: number;
  earlyBirdPrice?: number;
  earlyBirdEndDate?: string;
}

/**
 * Calculate the early-bird price for a ticket type
 * Returns the early-bird price if within the early-bird period, otherwise the regular price
 */
export function calculateEarlyBirdPrice(ticketType: TicketTypeWithEarlyBird): number {
  if (!ticketType.earlyBirdPrice || !ticketType.earlyBirdEndDate) {
    return ticketType.price;
  }

  const now = new Date();
  const earlyBirdEnd = new Date(ticketType.earlyBirdEndDate);

  if (now <= earlyBirdEnd) {
    logger.debug(`Early-bird pricing applied for ticket type ${ticketType.id}: ${ticketType.earlyBirdPrice}`);
    return ticketType.earlyBirdPrice;
  }

  return ticketType.price;
}

// ============================================
// GROUP DISCOUNT
// ============================================

export interface GroupDiscountConfig {
  minQuantity: number;
  discountPercentage: number;
}

/**
 * Calculate group discount based on quantity
 * Default thresholds: 5+ tickets = 5%, 10+ = 10%, 20+ = 15%
 */
export function calculateGroupDiscount(
  ticketTypeId: string,
  quantity: number,
): { discountAmount: number; finalPrice: number } {
  const ticketType = db
    .prepare(
      `
        SELECT price FROM ticket_types WHERE id = ?
    `,
    )
    .get(ticketTypeId) as { price: number } | undefined;

  if (!ticketType) {
    logger.warn(`Ticket type not found for group discount calculation: ${ticketTypeId}`);
    return { discountAmount: 0, finalPrice: 0 };
  }

  // Default discount tiers, used when the ticket type defines none of its own
  let discountTiers: GroupDiscountConfig[] = [
    { minQuantity: 5, discountPercentage: 5 },
    { minQuantity: 10, discountPercentage: 10 },
    { minQuantity: 20, discountPercentage: 15 },
  ];

  // Per-ticket-type tiers live in ticket_group_discounts; only percentage rows
  // apply here, the other discount types are handled at order level.
  const configured = db
    .prepare(
      `
        SELECT min_quantity, discount_value FROM ticket_group_discounts
        WHERE ticket_type_id = ? AND discount_type = 'percentage'
        ORDER BY min_quantity
    `,
    )
    .all(ticketTypeId) as Array<{ min_quantity: number; discount_value: number }>;

  if (configured.length > 0) {
    discountTiers = configured.map((row) => ({
      minQuantity: row.min_quantity,
      discountPercentage: row.discount_value,
    }));
  }

  // Find applicable discount tier (highest matching)
  let discountPercentage = 0;
  for (const tier of discountTiers) {
    if (quantity >= tier.minQuantity && tier.discountPercentage > discountPercentage) {
      discountPercentage = tier.discountPercentage;
    }
  }

  const totalPrice = ticketType.price * quantity;
  const discountAmount = totalPrice * (discountPercentage / 100);
  const finalPrice = totalPrice - discountAmount;

  logger.info(`Group discount calculated: ${discountPercentage}% off for ${quantity} tickets`, {
    ticketTypeId,
    quantity,
    totalPrice,
    discountAmount,
    finalPrice,
  });

  return { discountAmount, finalPrice };
}

// ============================================
// DISCOUNT CODE VALIDATION AND APPLICATION
// ============================================

export interface DiscountCodeValidation {
  valid: boolean;
  code?: {
    id: string;
    code: string;
    discountType: 'percentage' | 'fixed_amount';
    discountValue: number;
    maxUses?: number;
    currentUses: number;
    minOrderTotal?: number;
    validFrom?: string;
    validUntil?: string;
  };
  discountAmount: number;
  message: string;
}

/**
 * Validate a discount code for a specific order
 */
export function validateDiscountCode(
  code: string,
  associationId: string,
  concertId: string,
  orderTotal: number,
  userEmail: string,
): DiscountCodeValidation {
  const discountCode = db
    .prepare(
      `
        SELECT
            id, code, discount_type, discount_value,
            max_uses, uses_count, min_order_amount,
            valid_from, valid_until, concert_ids
        FROM discount_codes
        WHERE code = ? AND association_id = ? AND is_active = 1
    `,
    )
    .get(code.toUpperCase(), associationId) as
    | {
        id: string;
        code: string;
        discount_type: 'percentage' | 'fixed_amount';
        discount_value: number;
        max_uses: number | null;
        uses_count: number;
        min_order_amount: number | null;
        valid_from: string | null;
        valid_until: string | null;
        concert_ids: string | null;
      }
    | undefined;

  if (!discountCode) {
    return {
      valid: false,
      discountAmount: 0,
      message: 'Invalid discount code',
    };
  }

  // Check if code is restricted to specific concerts (null = all concerts)
  if (discountCode.concert_ids) {
    let toegestaneConcerten: string[] = [];
    try {
      toegestaneConcerten = JSON.parse(discountCode.concert_ids) as string[];
    } catch (error) {
      logger.error('Failed to parse concert_ids on discount code:', error);
    }
    if (toegestaneConcerten.length > 0 && !toegestaneConcerten.includes(concertId)) {
      return {
        valid: false,
        discountAmount: 0,
        message: 'This discount code is not valid for this concert',
      };
    }
  }

  // Check usage limit
  if (discountCode.max_uses !== null && discountCode.uses_count >= discountCode.max_uses) {
    return {
      valid: false,
      discountAmount: 0,
      message: 'This discount code has reached its usage limit',
    };
  }

  // Check validity dates
  const now = new Date();
  if (discountCode.valid_from && new Date(discountCode.valid_from) > now) {
    return {
      valid: false,
      discountAmount: 0,
      message: 'This discount code is not yet valid',
    };
  }
  if (discountCode.valid_until && new Date(discountCode.valid_until) < now) {
    return {
      valid: false,
      discountAmount: 0,
      message: 'This discount code has expired',
    };
  }

  // Check minimum order total
  if (discountCode.min_order_amount !== null && orderTotal < discountCode.min_order_amount) {
    return {
      valid: false,
      discountAmount: 0,
      message: `Minimum order total of EUR ${discountCode.min_order_amount.toFixed(2)} required`,
    };
  }

  // Calculate discount
  let discountAmount: number;
  if (discountCode.discount_type === 'percentage') {
    discountAmount = orderTotal * (discountCode.discount_value / 100);
  } else {
    discountAmount = discountCode.discount_value;
  }

  // Ensure discount doesn't exceed order total
  discountAmount = Math.min(discountAmount, orderTotal);

  logger.info(`Discount code validated: ${code}`, {
    orderId: concertId,
    discountAmount,
    discountType: discountCode.discount_type,
  });

  return {
    valid: true,
    code: {
      id: discountCode.id,
      code: discountCode.code,
      discountType: discountCode.discount_type,
      discountValue: discountCode.discount_value,
      maxUses: discountCode.max_uses ?? undefined,
      currentUses: discountCode.uses_count,
      minOrderTotal: discountCode.min_order_amount ?? undefined,
      validFrom: discountCode.valid_from ?? undefined,
      validUntil: discountCode.valid_until ?? undefined,
    },
    discountAmount,
    message: 'Discount code applied successfully',
  };
}

/**
 * Apply a discount code to an order (increment usage count and log)
 */
export function applyDiscountCode(codeId: string, orderId: string, userEmail: string, discountAmount: number): void {
  // Increment usage count
  db.prepare(
    `
        UPDATE discount_codes
        SET uses_count = uses_count + 1
        WHERE id = ?
    `,
  ).run(codeId);

  // Log the usage
  db.prepare(
    `
        INSERT INTO discount_code_usage (id, discount_code_id, order_id, user_email, discount_amount, used_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
  ).run(crypto.randomUUID(), codeId, orderId, userEmail, discountAmount);

  logger.info(`Discount code applied to order`, { codeId, orderId, userEmail, discountAmount });
}

// ============================================
// TICKET TRANSFER
// ============================================

export interface TransferResult {
  success: boolean;
  transferId?: string;
  transferCode?: string;
  message: string;
  ticket?: {
    id: string;
    code: string;
    newOwnerEmail?: string;
    newOwnerName?: string;
  };
}

/**
 * Initiate a ticket transfer to another person
 * Generates a secure transfer code that must be confirmed
 */
export function initiateTicketTransfer(
  ticketId: string,
  fromEmail: string,
  toEmail: string,
  toName: string,
): TransferResult {
  // Validate the ticket exists and belongs to the sender
  const ticket = db
    .prepare(
      `
        SELECT t.id, t.qr_code, t.buyer_email, t.buyer_name, t.status, t.order_id
        FROM tickets t
        WHERE t.id = ? AND LOWER(t.buyer_email) = LOWER(?)
    `,
    )
    .get(ticketId, fromEmail) as
    | {
        id: string;
        qr_code: string;
        buyer_email: string;
        buyer_name: string;
        status: string;
        order_id: string;
      }
    | undefined;

  if (!ticket) {
    return {
      success: false,
      message: 'Ticket not found or you are not the owner',
    };
  }

  if (ticket.status !== 'valid') {
    return {
      success: false,
      message: `Cannot transfer ticket with status: ${ticket.status}`,
    };
  }

  // Check for pending transfers
  const pendingTransfer = db
    .prepare(
      `
        SELECT id FROM ticket_transfers
        WHERE ticket_id = ? AND status = 'pending'
    `,
    )
    .get(ticketId) as { id: string } | undefined;

  if (pendingTransfer) {
    return {
      success: false,
      message: 'A transfer is already pending for this ticket. Please cancel it first.',
    };
  }

  // Generate secure transfer code
  const transferCode = crypto.randomBytes(16).toString('hex').toUpperCase();
  const transferId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

  db.prepare(
    `
        INSERT INTO ticket_transfers (id, ticket_id, from_email, from_name, recipient_email, recipient_name, transfer_code, status, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP)
    `,
  ).run(transferId, ticketId, fromEmail, ticket.buyer_name, toEmail, toName, transferCode, expiresAt);

  logger.info('Ticket transfer initiated', { transferId, ticketId, fromEmail, toEmail });

  return {
    success: true,
    transferId,
    transferCode,
    message: 'Transfer initiated. Please share the transfer code with the recipient.',
    ticket: {
      id: ticket.id,
      code: ticket.qr_code,
    },
  };
}

/**
 * Complete a ticket transfer using the transfer code
 */
export function completeTicketTransfer(transferCode: string): TransferResult {
  const transfer = db
    .prepare(
      `
        SELECT tt.id, tt.ticket_id, tt.from_email, tt.recipient_email, tt.recipient_name, tt.status, tt.expires_at,
               t.qr_code, t.status as ticket_status
        FROM ticket_transfers tt
        JOIN tickets t ON tt.ticket_id = t.id
        WHERE tt.transfer_code = ?
    `,
    )
    .get(transferCode) as
    | {
        id: string;
        ticket_id: string;
        from_email: string;
        recipient_email: string;
        recipient_name: string;
        status: string;
        expires_at: string;
        qr_code: string;
        ticket_status: string;
      }
    | undefined;

  if (!transfer) {
    return {
      success: false,
      message: 'Invalid transfer code',
    };
  }

  if (transfer.status !== 'pending') {
    return {
      success: false,
      message: `Transfer is ${transfer.status}`,
    };
  }

  if (new Date(transfer.expires_at) < new Date()) {
    // Mark as expired
    db.prepare(`UPDATE ticket_transfers SET status = 'expired' WHERE id = ?`).run(transfer.id);
    return {
      success: false,
      message: 'Transfer code has expired',
    };
  }

  if (transfer.ticket_status !== 'valid') {
    return {
      success: false,
      message: 'Ticket is no longer valid for transfer',
    };
  }

  // Generate new QR code for the transferred ticket
  const newQRCode = generateSecureTicketCode();

  // Perform the transfer
  const txn = db.transaction(() => {
    // Update ticket ownership
    db.prepare(
      `
            UPDATE tickets
            SET buyer_email = ?, buyer_name = ?, qr_code = ?
            WHERE id = ?
        `,
    ).run(transfer.recipient_email, transfer.recipient_name, newQRCode, transfer.ticket_id);

    // Mark transfer as completed
    db.prepare(
      `
            UPDATE ticket_transfers
            SET status = 'completed', accepted_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `,
    ).run(transfer.id);
  });

  txn();

  logger.info('Ticket transfer completed', {
    transferId: transfer.id,
    ticketId: transfer.ticket_id,
    fromEmail: transfer.from_email,
    toEmail: transfer.recipient_email,
  });

  return {
    success: true,
    transferId: transfer.id,
    message: 'Ticket transferred successfully',
    ticket: {
      id: transfer.ticket_id,
      code: newQRCode,
      newOwnerEmail: transfer.recipient_email,
      newOwnerName: transfer.recipient_name,
    },
  };
}

/**
 * Cancel a pending ticket transfer
 */
export function cancelTicketTransfer(transferId: string): void {
  const result = db
    .prepare(
      `
        UPDATE ticket_transfers
        SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'
    `,
    )
    .run(transferId);

  if (result.changes === 0) {
    throw new Error('Transfer not found or already processed');
  }

  logger.info('Ticket transfer cancelled', { transferId });
}

// ============================================
// DYNAMIC QR CODE
// ============================================

/**
 * Generate a dynamic QR code that rotates periodically for enhanced security
 * The QR code contains a time-based token that must be validated
 */
export async function generateDynamicQRCode(ticketId: string): Promise<{ qrCode: string; validUntil: Date }> {
  const ticket = db
    .prepare(
      `
        SELECT t.id, t.qr_code, t.status
        FROM tickets t
        WHERE t.id = ?
    `,
    )
    .get(ticketId) as { id: string; qr_code: string; status: string } | undefined;

  if (!ticket) {
    throw new Error('Ticket not found');
  }

  if (ticket.status !== 'valid') {
    throw new Error(`Ticket is ${ticket.status}`);
  }

  // Generate time-based token (valid for 30 seconds)
  const timestamp = Math.floor(Date.now() / 30000); // 30-second windows
  const validUntil = new Date((timestamp + 1) * 30000);

  // Create HMAC of ticket ID + timestamp
  const secret = process.env.QR_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('QR_SECRET environment variable must be set in production');
    }
    throw new Error('QR_SECRET environment variable is not set');
  }
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${ticketId}:${timestamp}`);
  const token = hmac.digest('hex').substring(0, 16);

  // QR data format: ticketId:token:timestamp
  const qrData = `${ticketId}:${token}:${timestamp}`;

  // Generate QR code image
  const qrCodeImage = await generateQRCode(qrData);

  logger.debug(`Dynamic QR code generated for ticket ${ticketId}, valid until ${validUntil.toISOString()}`);

  return { qrCode: qrCodeImage, validUntil };
}

/**
 * Validate a dynamic QR code
 * Checks that the token is valid for the current or previous time window
 */
export function validateDynamicQRCode(ticketId: string, qrData: string): boolean {
  try {
    const parts = qrData.split(':');
    if (parts.length !== 3) {
      logger.warn('Invalid dynamic QR code format', { ticketId });
      return false;
    }

    const [qrTicketId, token, timestampStr] = parts;
    const timestamp = parseInt(timestampStr, 10);

    if (qrTicketId !== ticketId) {
      logger.warn('Ticket ID mismatch in QR code', { expected: ticketId, got: qrTicketId });
      return false;
    }

    // Check if timestamp is within acceptable range (current or previous window)
    const currentTimestamp = Math.floor(Date.now() / 30000);
    if (timestamp < currentTimestamp - 1 || timestamp > currentTimestamp) {
      logger.warn('QR code timestamp expired', { ticketId, timestamp, current: currentTimestamp });
      return false;
    }

    // Verify token
    const secret = process.env.QR_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('QR_SECRET environment variable must be set in production');
      }
      throw new Error('QR_SECRET environment variable is not set');
    }
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${ticketId}:${timestamp}`);
    const expectedToken = hmac.digest('hex').substring(0, 16);

    if (token !== expectedToken) {
      logger.warn('Invalid QR code token', { ticketId });
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error validating dynamic QR code:', error);
    return false;
  }
}

// De offline scanner-synchronisatie is hier verwijderd: de tabellen
// scanner_tokens en offline_scan_log zijn nooit aangemaakt, dus de code
// liep bij elke aanroep stuk, en geen enkele route riep hem aan.

// ============================================
// RESERVATION EXTENSION
// ============================================

/**
 * Extend an order reservation
 * Can only be extended once and only if the order is still pending
 */
export function extendOrderReservation(orderId: string): { success: boolean; newExpiresAt: string; message: string } {
  const order = db
    .prepare(
      `
        SELECT id, status, expires_at, extension_count
        FROM ticket_orders
        WHERE id = ?
    `,
    )
    .get(orderId) as
    | {
        id: string;
        status: string;
        expires_at: string | null;
        extension_count: number | null;
      }
    | undefined;

  if (!order) {
    return {
      success: false,
      newExpiresAt: '',
      message: 'Order not found',
    };
  }

  if (order.status !== 'pending') {
    return {
      success: false,
      newExpiresAt: '',
      message: `Cannot extend order with status: ${order.status}`,
    };
  }

  const extensionCount = order.extension_count ?? 0;
  const maxExtensions = 1;

  if (extensionCount >= maxExtensions) {
    return {
      success: false,
      newExpiresAt: '',
      message: 'Maximum number of extensions reached',
    };
  }

  // Check if already expired
  if (order.expires_at && new Date(order.expires_at) < new Date()) {
    return {
      success: false,
      newExpiresAt: '',
      message: 'Order has already expired',
    };
  }

  // Extend by 15 minutes from now
  const newExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  db.prepare(
    `
        UPDATE ticket_orders
        SET expires_at = ?, extension_count = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `,
  ).run(newExpiresAt, extensionCount + 1, orderId);

  logger.info('Order reservation extended', { orderId, newExpiresAt, extensionCount: extensionCount + 1 });

  return {
    success: true,
    newExpiresAt,
    message: 'Reservation extended by 15 minutes',
  };
}
