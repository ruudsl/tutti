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

// ========================================
// Opslag
// ========================================

/** Vorm van een rij in ticket_invoices. */
interface FactuurRij {
  id: string;
  invoice_number: string;
  order_id: string;
  association_id: string;
  concert_id: string;
  concert_name: string;
  buyer_name: string;
  buyer_email: string;
  buyer_company_name: string | null;
  buyer_vat_number: string | null;
  buyer_address: string | null;
  buyer_postal_code: string | null;
  buyer_city: string | null;
  buyer_country: string | null;
  subtotal: number;
  vat_amount: number;
  vat_rate: number;
  total: number;
  service_fee: number;
  service_fee_vat: number;
  pdf_path: string | null;
  issued_at: string;
  due_date: string;
  status: Invoice['status'];
  created_at: string;
  updated_at: string;
}

interface RegelRij {
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  total: number;
  vat_amount: number;
}

function haalRegels(invoiceId: string): InvoiceLineItem[] {
  const rijen = db
    .prepare(
      `
        SELECT description, quantity, unit_price, vat_rate, total, vat_amount
        FROM invoice_line_items WHERE invoice_id = ? ORDER BY rowid
    `,
    )
    .all(invoiceId) as RegelRij[];

  return rijen.map((rij) => ({
    description: rij.description,
    quantity: rij.quantity,
    unitPrice: rij.unit_price,
    totalPrice: rij.total,
    // vat_rate staat in de tabel als percentage, de service rekent met een breuk.
    vatRate: rij.vat_rate / 100,
    vatAmount: rij.vat_amount,
  }));
}

function naarFactuur(rij: FactuurRij): Invoice {
  const bedrijf: BusinessDetails | undefined = rij.buyer_company_name
    ? {
        companyName: rij.buyer_company_name,
        vatNumber: rij.buyer_vat_number ?? undefined,
        address: rij.buyer_address ?? '',
        postalCode: rij.buyer_postal_code ?? '',
        city: rij.buyer_city ?? '',
        country: rij.buyer_country ?? undefined,
      }
    : undefined;

  return {
    id: rij.id,
    invoiceNumber: rij.invoice_number,
    orderId: rij.order_id,
    associationId: rij.association_id,
    concertId: rij.concert_id,
    concertName: rij.concert_name,
    buyerName: rij.buyer_name,
    buyerEmail: rij.buyer_email,
    businessDetails: bedrijf,
    lineItems: haalRegels(rij.id),
    subtotal: rij.subtotal,
    vatAmount: rij.vat_amount,
    serviceFee: rij.service_fee,
    serviceFeeVat: rij.service_fee_vat,
    total: rij.total,
    vatRate: rij.vat_rate / 100,
    issuedAt: rij.issued_at,
    dueDate: rij.due_date,
    status: rij.status,
    pdfPath: rij.pdf_path ?? undefined,
    createdAt: rij.created_at,
    updatedAt: rij.updated_at,
  };
}

function bewaarFactuur(factuur: Invoice): void {
  const bedrijf = factuur.businessDetails;

  db.prepare(
    `
        INSERT INTO ticket_invoices (
            id, invoice_number, order_id, association_id, concert_id, concert_name,
            buyer_name, buyer_email,
            buyer_company_name, buyer_vat_number, buyer_address, buyer_postal_code, buyer_city, buyer_country,
            subtotal, vat_amount, vat_rate, total, service_fee, service_fee_vat,
            issued_at, due_date, status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    factuur.id,
    factuur.invoiceNumber,
    factuur.orderId,
    factuur.associationId,
    factuur.concertId,
    factuur.concertName,
    factuur.buyerName,
    factuur.buyerEmail,
    bedrijf?.companyName ?? null,
    bedrijf?.vatNumber ?? null,
    bedrijf?.address ?? null,
    bedrijf?.postalCode ?? null,
    bedrijf?.city ?? null,
    bedrijf?.country ?? null,
    factuur.subtotal,
    factuur.vatAmount,
    factuur.vatRate * 100,
    factuur.total,
    factuur.serviceFee,
    factuur.serviceFeeVat,
    factuur.issuedAt,
    factuur.dueDate,
    factuur.status,
    factuur.createdAt,
    factuur.updatedAt,
  );

  const regel = db.prepare(
    `
        INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price, vat_rate, total, vat_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );

  for (const item of factuur.lineItems) {
    regel.run(
      crypto.randomUUID(),
      factuur.id,
      item.description,
      item.quantity,
      item.unitPrice,
      item.vatRate * 100,
      item.totalPrice,
      item.vatAmount,
    );
  }
}

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
  const rij = db
    .prepare(
      `
        SELECT COUNT(*) AS aantal FROM ticket_invoices
        WHERE association_id = ? AND created_at >= ? AND created_at <= ?
    `,
    )
    .get(associationId, todayStart, todayEnd) as { aantal: number };

  const sequenceNumber = String(rij.aantal + 1).padStart(4, '0');

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
  const existingInvoice = getInvoiceByOrder(orderId);
  if (existingInvoice) {
    logger.info(`Invoice already exists for order ${orderId}`, { invoiceId: existingInvoice.id });
    return existingInvoice;
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

  // Bij het afrekenen geldt total = som(prijs x aantal) + servicekosten; er
  // komt geen btw bovenop. De kaartprijs is dus de prijs inclusief btw, zoals
  // gebruikelijk bij consumentenverkoop. De btw wordt daarom uit het bedrag
  // gerekend en niet erbovenop geteld: anders noemt de factuur negen procent
  // meer dan de koper heeft betaald.
  const naarCenten = (bedrag: number): number => Math.round(bedrag * 100) / 100;

  const lineItems: InvoiceLineItem[] = orderItems.map((item) => {
    const brutoRegel = naarCenten(item.quantity * item.unitPrice);
    const nettoRegel = naarCenten(brutoRegel / (1 + VAT_RATE));

    return {
      description: item.ticketTypeName,
      quantity: item.quantity,
      // Op een factuur staat de stukprijs exclusief btw, zodat aantal maal
      // stukprijs het regelbedrag oplevert.
      unitPrice: item.quantity > 0 ? naarCenten(nettoRegel / item.quantity) : 0,
      totalPrice: nettoRegel,
      vatRate: VAT_RATE,
      // Het verschil, niet opnieuw uitgerekend: zo tellen netto en btw altijd
      // precies op tot het brutobedrag.
      vatAmount: naarCenten(brutoRegel - nettoRegel),
    };
  });

  // Calculate totals
  const subtotal = naarCenten(lineItems.reduce((sum, item) => sum + item.totalPrice, 0));
  const vatAmount = naarCenten(lineItems.reduce((sum, item) => sum + item.vatAmount, 0));

  // Service fee (if any - calculated as difference between order total and ticket subtotal)
  const brutoServicekosten = Math.max(0, naarCenten(order.total - (subtotal + vatAmount)));
  const serviceFee = naarCenten(brutoServicekosten / (1 + VAT_RATE));
  const serviceFeeVat = naarCenten(brutoServicekosten - serviceFee);

  const total = naarCenten(subtotal + vatAmount + serviceFee + serviceFeeVat);

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
  bewaarFactuur(invoice);

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
  const rij = db.prepare('SELECT * FROM ticket_invoices WHERE id = ?').get(invoiceId) as FactuurRij | undefined;
  return rij ? naarFactuur(rij) : null;
}

/**
 * Get an invoice by order ID
 */
export function getInvoiceByOrder(orderId: string): Invoice | null {
  const rij = db.prepare('SELECT * FROM ticket_invoices WHERE order_id = ?').get(orderId) as FactuurRij | undefined;
  return rij ? naarFactuur(rij) : null;
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
  const resultaat = db
    .prepare('UPDATE ticket_invoices SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, new Date().toISOString(), invoiceId);

  if (resultaat.changes === 0) return null;

  logger.info(`Invoice status updated`, { invoiceId, status });

  return getInvoice(invoiceId);
}

/**
 * Get all invoices for an association
 */
export function getInvoicesByAssociation(associationId: string): Invoice[] {
  const rijen = db
    .prepare('SELECT * FROM ticket_invoices WHERE association_id = ? ORDER BY created_at DESC')
    .all(associationId) as FactuurRij[];
  return rijen.map(naarFactuur);
}

/**
 * Get invoices by buyer email
 */
export function getInvoicesByBuyerEmail(email: string): Invoice[] {
  const rijen = db
    .prepare('SELECT * FROM ticket_invoices WHERE LOWER(buyer_email) = LOWER(?) ORDER BY created_at DESC')
    .all(email) as FactuurRij[];
  return rijen.map(naarFactuur);
}

/**
 * Cancel an invoice
 */
export function cancelInvoice(invoiceId: string): Invoice | null {
  const factuur = getInvoice(invoiceId);
  if (!factuur) return null;

  if (factuur.status === 'paid') {
    throw new Error('Cannot cancel a paid invoice');
  }

  logger.info(`Invoice cancelled`, { invoiceId });

  return updateInvoiceStatus(invoiceId, 'cancelled');
}
