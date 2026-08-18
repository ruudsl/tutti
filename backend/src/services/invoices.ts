import crypto from 'crypto';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import db from '../database/connection';
import logger from '../utils/logger';

// VAT rate for cultural events in the Netherlands
const VAT_RATE = 0.09; // 9%

// ========================================
// Interfaces
// ========================================

export interface BusinessDetails {
  companyName: string;
  vatNumber?: string;
  address: string;
  postalCode: string;
  city: string;
  country?: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  vatRate: number;
  vatAmount: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  orderId: string;
  associationId: string;
  concertId: string;
  concertName: string;
  buyerName: string;
  buyerEmail: string;
  businessDetails?: BusinessDetails;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  vatAmount: number;
  serviceFee: number;
  serviceFeeVat: number;
  total: number;
  vatRate: number;
  issuedAt: string;
  dueDate: string;
  status: 'draft' | 'issued' | 'paid' | 'cancelled';
  pdfPath?: string;
  createdAt: string;
  updatedAt: string;
}

interface AssociationDetails {
  id: string;
  name: string;
  displayName?: string;
}

interface OrderData {
  id: string;
  concertId: string;
  concertName: string;
  associationId: string;
  buyerName: string;
  buyerEmail: string;
  total: number;
  status: string;
  paidAt: string | null;
}

interface OrderItem {
  ticketTypeName: string;
  quantity: number;
  unitPrice: number;
}

// In-memory invoice store (in production, use database)
const invoices = new Map<string, Invoice>();
const invoicesByOrder = new Map<string, string>(); // orderId -> invoiceId

// ========================================
// Invoice Number Generation
// ========================================

/**
 * Generate a unique invoice number
 * Format: INV-YYYYMMDD-XXXX (e.g., INV-20260329-0001)
 */
export function generateInvoiceNumber(associationId: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const datePart = `${year}${month}${day}`;

  // Get the count of invoices for this association today
  const todayStart = `${year}-${month}-${day}T00:00:00.000Z`;
  const todayEnd = `${year}-${month}-${day}T23:59:59.999Z`;

  // Count existing invoices for today
  let count = 0;
  for (const invoice of invoices.values()) {
    if (invoice.associationId === associationId && invoice.createdAt >= todayStart && invoice.createdAt <= todayEnd) {
      count++;
    }
  }

  const sequenceNumber = String(count + 1).padStart(4, '0');

  return `INV-${datePart}-${sequenceNumber}`;
}

// ========================================
// Invoice Creation
// ========================================

/**
 * Create an invoice for a ticket order
 */
export async function createInvoice(orderId: string, businessDetails?: BusinessDetails): Promise<Invoice> {
  // Check if invoice already exists for this order
  const existingInvoiceId = invoicesByOrder.get(orderId);
  if (existingInvoiceId) {
    const existingInvoice = invoices.get(existingInvoiceId);
    if (existingInvoice) {
      logger.info(`Invoice already exists for order ${orderId}`, { invoiceId: existingInvoiceId });
      return existingInvoice;
    }
  }

  // Fetch order details
  const order = db
    .prepare(
      `
        SELECT
            o.id,
            o.concert_id as concertId,
            o.buyer_name as buyerName,
            o.buyer_email as buyerEmail,
            o.total,
            o.status,
            o.paid_at as paidAt,
            c.name as concertName,
            c.association_id as associationId
        FROM ticket_orders o
        JOIN concerts c ON o.concert_id = c.id
        WHERE o.id = ?
    `,
    )
    .get(orderId) as OrderData | undefined;

  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // Fetch order items
  const orderItems = db
    .prepare(
      `
        SELECT
            tt.name as ticketTypeName,
            oi.quantity,
            oi.unit_price as unitPrice
        FROM ticket_order_items oi
        JOIN ticket_types tt ON oi.ticket_type_id = tt.id
        WHERE oi.order_id = ?
    `,
    )
    .all(orderId) as OrderItem[];

  if (orderItems.length === 0) {
    throw new Error(`No items found for order: ${orderId}`);
  }

  // Create line items with VAT calculation
  const lineItems: InvoiceLineItem[] = orderItems.map((item) => {
    const totalPrice = item.quantity * item.unitPrice;
    const vatAmount = totalPrice * VAT_RATE;

    return {
      description: item.ticketTypeName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice,
      vatRate: VAT_RATE,
      vatAmount,
    };
  });

  // Calculate totals
  const subtotal = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const vatAmount = lineItems.reduce((sum, item) => sum + item.vatAmount, 0);

  // Service fee (if any - calculated as difference between order total and ticket subtotal)
  const serviceFee = Math.max(0, order.total - subtotal);
  const serviceFeeVat = serviceFee * VAT_RATE;

  const total = subtotal + vatAmount + serviceFee + serviceFeeVat;

  // Generate invoice
  const now = new Date();
  const invoiceId = crypto.randomUUID();
  const invoiceNumber = generateInvoiceNumber(order.associationId);

  // Due date is 14 days from now (or already paid for prepaid orders)
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + 14);

  const invoice: Invoice = {
    id: invoiceId,
    invoiceNumber,
    orderId,
    associationId: order.associationId,
    concertId: order.concertId,
    concertName: order.concertName,
    buyerName: order.buyerName,
    buyerEmail: order.buyerEmail,
    businessDetails,
    lineItems,
    subtotal,
    vatAmount,
    serviceFee,
    serviceFeeVat,
    total,
    vatRate: VAT_RATE,
    issuedAt: now.toISOString(),
    dueDate: dueDate.toISOString(),
    status: order.status === 'paid' ? 'paid' : 'issued',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  // Store invoice
  invoices.set(invoiceId, invoice);
  invoicesByOrder.set(orderId, invoiceId);

  logger.info(`Invoice created`, {
    invoiceId,
    invoiceNumber,
    orderId,
    total: invoice.total,
  });

  return invoice;
}

// ========================================
// Invoice Retrieval
// ========================================

/**
 * Get an invoice by its ID
 */
export function getInvoice(invoiceId: string): Invoice | null {
  return invoices.get(invoiceId) || null;
}

/**
 * Get an invoice by order ID
 */
export function getInvoiceByOrder(orderId: string): Invoice | null {
  const invoiceId = invoicesByOrder.get(orderId);
  if (!invoiceId) return null;
  return invoices.get(invoiceId) || null;
}

// ========================================
// PDF Generation
// ========================================

/**
 * Generate a PDF invoice
 */
export async function generateInvoicePDF(invoiceId: string): Promise<Buffer> {
  const invoice = getInvoice(invoiceId);
  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`);
  }

  // Fetch association details for letterhead
  const association = db
    .prepare(
      `
        SELECT id, name, display_name as displayName
        FROM associations
        WHERE id = ?
    `,
    )
    .get(invoice.associationId) as AssociationDetails | undefined;

  const associationName = association?.displayName || association?.name || 'Harmonie';

  // Create PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 size in points

  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  // Colors
  const black = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.85, 0.85, 0.85);

  // Helper function to draw text
  const drawText = (
    text: string,
    x: number,
    yPos: number,
    options: {
      font?: typeof helvetica;
      size?: number;
      color?: typeof black;
      maxWidth?: number;
    } = {},
  ) => {
    page.drawText(text, {
      x,
      y: yPos,
      font: options.font || helvetica,
      size: options.size || 10,
      color: options.color || black,
      maxWidth: options.maxWidth,
    });
  };

  // Helper to format currency
  const formatCurrency = (amount: number): string => {
    return `EUR ${amount.toFixed(2)}`;
  };

  // Helper to format date
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('nl-NL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // ============ HEADER ============
  // Association name (as logo placeholder)
  drawText(associationName, margin, y, { font: helveticaBold, size: 20 });

  // Invoice title
  drawText('FACTUUR', width - margin - 100, height - margin, { font: helveticaBold, size: 16 });

  // Invoice number and date
  const invoiceInfoX = width - margin - 180;
  y = height - margin - 50;

  drawText('Factuurnummer:', invoiceInfoX, y, { color: gray });
  drawText(invoice.invoiceNumber, invoiceInfoX + 85, y);
  y -= 15;

  drawText('Factuurdatum:', invoiceInfoX, y, { color: gray });
  drawText(formatDate(invoice.issuedAt), invoiceInfoX + 85, y);
  y -= 15;

  drawText('Vervaldatum:', invoiceInfoX, y, { color: gray });
  drawText(formatDate(invoice.dueDate), invoiceInfoX + 85, y);
  y -= 15;

  if (invoice.status === 'paid') {
    drawText('Status:', invoiceInfoX, y, { color: gray });
    drawText('BETAALD', invoiceInfoX + 85, y, { font: helveticaBold, color: rgb(0.13, 0.55, 0.13) });
  }

  // ============ BUYER DETAILS ============
  y = height - margin - 80;

  drawText('Factuur aan:', margin, y, { font: helveticaBold, size: 11, color: gray });
  y -= 20;

  if (invoice.businessDetails) {
    drawText(invoice.businessDetails.companyName, margin, y, { font: helveticaBold, size: 11 });
    y -= 15;

    if (invoice.businessDetails.vatNumber) {
      drawText(`BTW-nummer: ${invoice.businessDetails.vatNumber}`, margin, y);
      y -= 15;
    }

    drawText(invoice.businessDetails.address, margin, y);
    y -= 15;
    drawText(`${invoice.businessDetails.postalCode} ${invoice.businessDetails.city}`, margin, y);
    y -= 15;

    if (invoice.businessDetails.country) {
      drawText(invoice.businessDetails.country, margin, y);
      y -= 15;
    }

    y -= 10;
    drawText(`T.a.v. ${invoice.buyerName}`, margin, y, { color: gray });
    y -= 15;
  } else {
    drawText(invoice.buyerName, margin, y, { font: helveticaBold, size: 11 });
    y -= 15;
  }

  drawText(invoice.buyerEmail, margin, y, { color: gray });
  y -= 30;

  // ============ CONCERT DETAILS ============
  drawText('Betreft:', margin, y, { font: helveticaBold, size: 11, color: gray });
  y -= 20;
  drawText(`Tickets voor ${invoice.concertName}`, margin, y);
  y -= 40;

  // ============ LINE ITEMS TABLE ============
  const tableTop = y;
  const colDescription = margin;
  const colQuantity = width - margin - 300;
  const colUnitPrice = width - margin - 200;
  const colVat = width - margin - 120;
  const colTotal = width - margin - 50;

  // Table header background
  page.drawRectangle({
    x: margin - 5,
    y: y - 5,
    width: width - 2 * margin + 10,
    height: 20,
    color: lightGray,
  });

  // Table headers
  drawText('Omschrijving', colDescription, y, { font: helveticaBold, size: 9 });
  drawText('Aantal', colQuantity, y, { font: helveticaBold, size: 9 });
  drawText('Prijs', colUnitPrice, y, { font: helveticaBold, size: 9 });
  drawText('BTW', colVat, y, { font: helveticaBold, size: 9 });
  drawText('Totaal', colTotal, y, { font: helveticaBold, size: 9 });
  y -= 25;

  // Line items
  for (const item of invoice.lineItems) {
    drawText(item.description, colDescription, y, { size: 9, maxWidth: 250 });
    drawText(item.quantity.toString(), colQuantity, y, { size: 9 });
    drawText(formatCurrency(item.unitPrice), colUnitPrice, y, { size: 9 });
    drawText(`${(item.vatRate * 100).toFixed(0)}%`, colVat, y, { size: 9 });
    drawText(formatCurrency(item.totalPrice), colTotal, y, { size: 9 });
    y -= 18;
  }

  // Service fee (if applicable)
  if (invoice.serviceFee > 0) {
    drawText('Servicekosten', colDescription, y, { size: 9 });
    drawText('1', colQuantity, y, { size: 9 });
    drawText(formatCurrency(invoice.serviceFee), colUnitPrice, y, { size: 9 });
    drawText(`${(VAT_RATE * 100).toFixed(0)}%`, colVat, y, { size: 9 });
    drawText(formatCurrency(invoice.serviceFee), colTotal, y, { size: 9 });
    y -= 18;
  }

  // Separator line
  y -= 10;
  page.drawLine({
    start: { x: margin, y: y },
    end: { x: width - margin, y: y },
    thickness: 1,
    color: lightGray,
  });
  y -= 20;

  // ============ TOTALS ============
  const totalsLabelX = width - margin - 150;
  const totalsValueX = width - margin - 50;

  drawText('Subtotaal:', totalsLabelX, y, { size: 10 });
  drawText(formatCurrency(invoice.subtotal + invoice.serviceFee), totalsValueX, y, { size: 10 });
  y -= 18;

  const totalVat = invoice.vatAmount + invoice.serviceFeeVat;
  drawText(`BTW (${(VAT_RATE * 100).toFixed(0)}%):`, totalsLabelX, y, { size: 10 });
  drawText(formatCurrency(totalVat), totalsValueX, y, { size: 10 });
  y -= 18;

  // Total line
  page.drawLine({
    start: { x: totalsLabelX - 10, y: y + 5 },
    end: { x: width - margin, y: y + 5 },
    thickness: 1,
    color: black,
  });
  y -= 5;

  drawText('Totaal:', totalsLabelX, y, { font: helveticaBold, size: 12 });
  drawText(formatCurrency(invoice.total), totalsValueX, y, { font: helveticaBold, size: 12 });
  y -= 40;

  // ============ FOOTER ============
  // VAT note
  drawText('BTW-tarief: 9% (verlaagd tarief voor culturele evenementen in Nederland)', margin, y, {
    size: 8,
    color: gray,
  });
  y -= 15;

  // Order reference
  drawText(`Bestelnummer: ${invoice.orderId}`, margin, y, { size: 8, color: gray });
  y -= 30;

  // Thank you note
  drawText('Bedankt voor uw aankoop!', margin, y, { font: helveticaBold, size: 10 });

  // Generate PDF bytes
  const pdfBytes = await pdfDoc.save();

  logger.info(`Invoice PDF generated`, { invoiceId, invoiceNumber: invoice.invoiceNumber });

  return Buffer.from(pdfBytes);
}

// ========================================
// Invoice Management
// ========================================

/**
 * Update invoice status
 */
export function updateInvoiceStatus(invoiceId: string, status: Invoice['status']): Invoice | null {
  const invoice = invoices.get(invoiceId);
  if (!invoice) return null;

  invoice.status = status;
  invoice.updatedAt = new Date().toISOString();

  invoices.set(invoiceId, invoice);

  logger.info(`Invoice status updated`, { invoiceId, status });

  return invoice;
}

/**
 * Get all invoices for an association
 */
export function getInvoicesByAssociation(associationId: string): Invoice[] {
  const result: Invoice[] = [];
  for (const invoice of invoices.values()) {
    if (invoice.associationId === associationId) {
      result.push(invoice);
    }
  }
  return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Get invoices by buyer email
 */
export function getInvoicesByBuyerEmail(email: string): Invoice[] {
  const result: Invoice[] = [];
  for (const invoice of invoices.values()) {
    if (invoice.buyerEmail.toLowerCase() === email.toLowerCase()) {
      result.push(invoice);
    }
  }
  return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Cancel an invoice
 */
export function cancelInvoice(invoiceId: string): Invoice | null {
  const invoice = invoices.get(invoiceId);
  if (!invoice) return null;

  if (invoice.status === 'paid') {
    throw new Error('Cannot cancel a paid invoice');
  }

  invoice.status = 'cancelled';
  invoice.updatedAt = new Date().toISOString();

  invoices.set(invoiceId, invoice);

  logger.info(`Invoice cancelled`, { invoiceId });

  return invoice;
}
