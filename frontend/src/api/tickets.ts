/**
 * Tickets API Module
 *
 * Provides functions for ticket purchasing, management, validation, and transfers.
 * Includes both public-facing ticket sales and admin management endpoints.
 *
 * @module api/tickets
 */

import api from './client';
import type {
  ConcertTicketInfo,
  TicketOrder,
  Ticket,
  TicketValidationResult,
  TicketStats,
  AttendeeExport,
  TicketType,
  SeatHeatmapData,
  TicketSalesResponse,
  PaymentDetails,
  TicketDashboard,
  SalesPredictionResponse,
  ScannedTicketsResponse,
  TicketTransfer,
  TicketTransferHistory,
  TransferableTicket,
} from '../types';

// Public ticket endpoints

/**
 * Retrieves ticket information for a concert.
 *
 * @description Fetches available ticket types, prices, and availability for a concert.
 * This is a public endpoint accessible without authentication.
 * @param {string} concertId - The concert identifier
 * @returns {Promise<ConcertTicketInfo>} Concert ticket information including available types
 * @throws {AxiosError} When concert not found (404) or tickets not configured
 */
export const getConcertTickets = async (concertId: string): Promise<ConcertTicketInfo> => {
  const { data } = await api.get(`/concerts/${concertId}/tickets`);
  return data;
};

/**
 * Creates a new ticket order.
 *
 * @description Initiates a ticket purchase by reserving tickets and creating an order.
 * The order must be paid within the expiration time or tickets are released.
 * @param {string} concertId - The concert identifier
 * @param {Object} order - Order details
 * @param {Array<{ticketTypeId: string, quantity: number}>} order.items - Tickets to purchase
 * @param {string} order.buyerName - Buyer's full name
 * @param {string} order.buyerEmail - Buyer's email for ticket delivery
 * @param {string} [order.buyerPhone] - Optional phone number
 * @param {string} [order.notes] - Optional order notes
 * @param {string} [order.captchaToken] - CAPTCHA verification token
 * @returns {Promise<Object>} Order details with payment information
 * @returns {string} return.orderId - Unique order identifier
 * @returns {number} return.total - Total order amount
 * @returns {string} return.expiresAt - ISO timestamp when reservation expires
 * @returns {Array} return.items - Line items with pricing details
 * @throws {AxiosError} When tickets unavailable, validation fails, or concert not found
 * @example
 * const order = await createTicketOrder('concert-123', {
 *   items: [{ ticketTypeId: 'type-a', quantity: 2 }],
 *   buyerName: 'John Doe',
 *   buyerEmail: 'john@example.com'
 * });
 */
export const createTicketOrder = async (
  concertId: string,
  order: {
    items: { ticketTypeId: string; quantity: number }[];
    buyerName: string;
    buyerEmail: string;
    buyerPhone?: string;
    notes?: string;
    captchaToken?: string;
  },
): Promise<{
  orderId: string;
  total: number;
  expiresAt: string;
  items: { ticketTypeId: string; name: string; quantity: number; unitPrice: number; subtotal: number }[];
}> => {
  const { data } = await api.post(`/concerts/${concertId}/tickets/order`, order);
  return data;
};

/**
 * Retrieves a ticket order by ID.
 *
 * @description Fetches order details including status, tickets, and payment info.
 * @param {string} orderId - The order identifier
 * @returns {Promise<TicketOrder>} Complete order details
 * @throws {AxiosError} When order not found (404)
 */
export const getTicketOrder = async (orderId: string): Promise<TicketOrder> => {
  const { data } = await api.get(`/tickets/orders/${orderId}`);
  return data;
};

/**
 * Initiates payment for a ticket order.
 *
 * @description Starts the payment process and returns a checkout URL.
 * The user should be redirected to the checkout URL to complete payment.
 * @param {string} orderId - The order identifier
 * @param {Object} payment - Payment options
 * @param {string} [payment.method] - Payment method (e.g., 'ideal', 'creditcard')
 * @param {string} [payment.returnUrl] - URL to redirect after payment completion
 * @returns {Promise<{paymentId: string, checkoutUrl: string}>} Payment ID and checkout redirect URL
 * @throws {AxiosError} When order not found, already paid, or expired
 */
export const payTicketOrder = async (
  orderId: string,
  payment: { method?: string; returnUrl?: string },
): Promise<{ paymentId: string; checkoutUrl: string }> => {
  const { data } = await api.post(`/tickets/orders/${orderId}/pay`, payment);
  return data;
};

/**
 * Retrieves a ticket by its unique code.
 *
 * @description Fetches ticket details using the ticket code (typically from QR code).
 * @param {string} code - The unique ticket code
 * @returns {Promise<Ticket>} Ticket details
 * @throws {AxiosError} When ticket not found (404)
 */
export const getTicketByCode = async (code: string): Promise<Ticket> => {
  const { data } = await api.get(`/tickets/${code}`);
  return data;
};

/**
 * Validates and scans a ticket for entry.
 *
 * @description Validates a ticket code for concert entry. Marks the ticket as scanned
 * if valid. Can optionally verify against a specific concert.
 * @param {string} code - The ticket code to validate
 * @param {string} [concertId] - Optional concert ID to validate against
 * @returns {Promise<TicketValidationResult>} Validation result with ticket status
 * @throws {AxiosError} When ticket invalid, already used, or wrong concert
 */
export const validateTicket = async (code: string, concertId?: string): Promise<TicketValidationResult> => {
  const { data } = await api.post(`/tickets/${code}/validate`, { concertId });
  return data;
};

/**
 * Retrieves tickets owned by the current user.
 *
 * @description Fetches all tickets associated with the logged-in user's email.
 * Includes both upcoming and past concert tickets.
 * @returns {Promise<Ticket[]>} Array of user's tickets
 * @throws {AxiosError} When user is not authenticated (401)
 */
export const getMyTickets = async (): Promise<Ticket[]> => {
  const { data } = await api.get('/tickets/my');
  return data;
};

// Admin ticket type management

/**
 * Creates a new ticket type for a concert.
 *
 * @description Defines a new ticket category with pricing and availability. Requires admin access.
 * @param {string} concertId - The concert identifier
 * @param {Object} ticketType - Ticket type configuration
 * @param {string} ticketType.name - Display name (e.g., "Standard", "VIP")
 * @param {number} ticketType.price - Price in cents
 * @param {number} ticketType.quantity - Total available tickets
 * @param {string} [ticketType.description] - Description of what's included
 * @param {string} [ticketType.saleStart] - ISO date when sales begin
 * @param {string} [ticketType.saleEnd] - ISO date when sales end
 * @param {number} [ticketType.maxPerOrder] - Maximum tickets per order
 * @returns {Promise<TicketType>} Created ticket type
 * @throws {AxiosError} When concert not found or user lacks admin permission
 */
export const createTicketType = async (
  concertId: string,
  ticketType: {
    name: string;
    price: number;
    quantity: number;
    description?: string;
    saleStart?: string;
    saleEnd?: string;
    maxPerOrder?: number;
  },
): Promise<TicketType> => {
  const { data } = await api.post(`/concerts/${concertId}/ticket-types`, ticketType);
  return data;
};

/**
 * Updates an existing ticket type.
 *
 * @description Modifies ticket type properties. Price changes only affect new orders.
 * @param {string} ticketTypeId - The ticket type identifier
 * @param {Object} updates - Fields to update
 * @param {string} [updates.name] - New display name
 * @param {number} [updates.price] - New price in cents
 * @param {number} [updates.quantity] - New total quantity
 * @param {string} [updates.description] - New description
 * @param {string} [updates.saleStart] - New sale start date
 * @param {string} [updates.saleEnd] - New sale end date
 * @param {number} [updates.maxPerOrder] - New max per order limit
 * @returns {Promise<{success: boolean}>} Success indicator
 * @throws {AxiosError} When ticket type not found or user lacks admin permission
 */
export const updateTicketType = async (
  ticketTypeId: string,
  updates: {
    name?: string;
    price?: number;
    quantity?: number;
    description?: string;
    saleStart?: string;
    saleEnd?: string;
    maxPerOrder?: number;
  },
): Promise<{ success: boolean }> => {
  const { data } = await api.put(`/ticket-types/${ticketTypeId}`, updates);
  return data;
};

/**
 * Deletes a ticket type.
 *
 * @description Removes a ticket type. Cannot delete if tickets have been sold.
 * @param {string} ticketTypeId - The ticket type identifier
 * @returns {Promise<{success: boolean}>} Success indicator
 * @throws {AxiosError} When ticket type not found, has sold tickets, or user lacks permission
 */
export const deleteTicketType = async (ticketTypeId: string): Promise<{ success: boolean }> => {
  const { data } = await api.delete(`/ticket-types/${ticketTypeId}`);
  return data;
};

// Admin ticket management

/**
 * Retrieves ticket sales statistics for a concert.
 *
 * @description Fetches aggregate statistics including total sold, revenue, and per-type breakdown.
 * @param {string} concertId - The concert identifier
 * @returns {Promise<TicketStats>} Ticket sales statistics
 * @throws {AxiosError} When concert not found or user lacks admin permission
 */
export const getConcertTicketStats = async (concertId: string): Promise<TicketStats> => {
  const { data } = await api.get(`/concerts/${concertId}/ticket-stats`);
  return data;
};

/**
 * Retrieves list of attendees for a concert.
 *
 * @description Fetches all ticket holders for a concert with their details.
 * @param {string} concertId - The concert identifier
 * @returns {Promise<AttendeeExport[]>} Array of attendee records
 * @throws {AxiosError} When concert not found or user lacks admin permission
 */
export const getConcertAttendees = async (concertId: string): Promise<AttendeeExport[]> => {
  const { data } = await api.get(`/concerts/${concertId}/attendees`);
  return data;
};

/**
 * Retrieves seat selection heatmap data for a concert.
 *
 * @description Fetches data showing seat popularity and selection patterns for venue visualization.
 * @param {string} concertId - The concert identifier
 * @returns {Promise<SeatHeatmapData>} Heatmap data for seat visualization
 * @throws {AxiosError} When concert not found or seating not configured
 */
export const getSeatHeatmapData = async (concertId: string): Promise<SeatHeatmapData> => {
  const { data } = await api.get(`/concerts/${concertId}/seats/heatmap-data`);
  return data;
};

/**
 * Exports concert attendees to a CSV file.
 *
 * @description Downloads a CSV file containing all attendee information for a concert.
 * Triggers a browser file download.
 * @param {string} concertId - The concert identifier
 * @returns {Promise<void>} Resolves when download is initiated
 * @throws {AxiosError} When concert not found or user lacks admin permission
 */
export const exportConcertAttendeesCsv = async (concertId: string): Promise<void> => {
  const response = await api.get(`/concerts/${concertId}/attendees?format=csv`, {
    responseType: 'blob',
  });
  const blob = new Blob([response.data], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `attendees-${concertId}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
};

/**
 * Cancels a ticket.
 *
 * @description Cancels an individual ticket. Does not automatically process refund.
 * @param {string} ticketId - The ticket identifier
 * @returns {Promise<{success: boolean, message: string}>} Cancellation result
 * @throws {AxiosError} When ticket not found, already cancelled, or already scanned
 */
export const cancelTicket = async (ticketId: string): Promise<{ success: boolean; message: string }> => {
  const { data } = await api.post(`/tickets/${ticketId}/cancel`);
  return data;
};

/**
 * Processes a refund for a ticket order.
 *
 * @description Initiates a refund through the payment provider and cancels associated tickets.
 * @param {string} orderId - The order identifier
 * @param {string} [reason] - Optional reason for the refund
 * @returns {Promise<{success: boolean, refundId?: string, message: string}>} Refund result
 * @throws {AxiosError} When order not found, already refunded, or refund fails
 */
export const refundOrder = async (
  orderId: string,
  reason?: string,
): Promise<{ success: boolean; refundId?: string; message: string }> => {
  const { data } = await api.post(`/tickets/orders/${orderId}/refund`, { reason });
  return data;
};

/**
 * Simulates payment for testing purposes.
 *
 * @description Mock payment endpoint for development/testing. Not available in production.
 * @param {string} orderId - The order identifier
 * @param {'pay' | 'cancel'} action - Whether to simulate successful payment or cancellation
 * @returns {Promise<{success: boolean}>} Mock operation result
 * @throws {AxiosError} When order not found or endpoint disabled in production
 */
export const mockPayment = async (orderId: string, action: 'pay' | 'cancel'): Promise<{ success: boolean }> => {
  const { data } = await api.post(`/tickets/orders/${orderId}/mock-payment`, { action });
  return data;
};

// Ticket dashboard & sales

/**
 * Retrieves the ticket dashboard for a concert.
 *
 * @description Fetches comprehensive dashboard data including sales trends, revenue,
 * and real-time statistics for admin overview.
 * @param {string} concertId - The concert identifier
 * @returns {Promise<TicketDashboard>} Dashboard data with metrics and charts
 * @throws {AxiosError} When concert not found or user lacks admin permission
 */
export const getTicketDashboard = async (concertId: string): Promise<TicketDashboard> => {
  const { data } = await api.get(`/tickets/dashboard/${concertId}`);
  return data;
};

/**
 * Retrieves ticket sales data with filtering and pagination.
 *
 * @description Fetches sales records with optional filters for concert, status, and date range.
 * @param {Object} [params] - Query parameters
 * @param {string} [params.concertId] - Filter by concert
 * @param {string} [params.status] - Filter by order status
 * @param {string} [params.startDate] - Filter by start date (ISO format)
 * @param {string} [params.endDate] - Filter by end date (ISO format)
 * @param {number} [params.page] - Page number for pagination
 * @param {number} [params.limit] - Items per page
 * @returns {Promise<TicketSalesResponse>} Paginated sales data
 * @throws {AxiosError} When user lacks admin permission
 */
export const getTicketSales = async (params?: {
  concertId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}): Promise<TicketSalesResponse> => {
  const { data } = await api.get('/tickets/sales', { params });
  return data;
};

/**
 * Retrieves payment details for an order.
 *
 * @description Fetches detailed payment information including provider data and transaction history.
 * @param {string} orderId - The order identifier
 * @returns {Promise<PaymentDetails>} Payment details and transaction info
 * @throws {AxiosError} When order not found or user lacks admin permission
 */
export const getPaymentDetails = async (orderId: string): Promise<PaymentDetails> => {
  const { data } = await api.get(`/tickets/sales/${orderId}/payment-details`);
  return data;
};

/**
 * Retrieves sales predictions for a concert.
 *
 * @description Fetches AI-generated predictions for expected ticket sales based on
 * historical data and current trends.
 * @param {string} concertId - The concert identifier
 * @returns {Promise<SalesPredictionResponse>} Sales predictions and confidence intervals
 * @throws {AxiosError} When concert not found or insufficient data for predictions
 */
export const getSalesPredictions = async (concertId: string): Promise<SalesPredictionResponse> => {
  const { data } = await api.get(`/concerts/${concertId}/tickets/predictions`);
  return data;
};

/**
 * Retrieves scanned tickets for a concert.
 *
 * @description Fetches list of tickets that have been scanned for entry at a concert.
 * Useful for tracking real-time attendance.
 * @param {string} concertId - The concert identifier
 * @returns {Promise<ScannedTicketsResponse>} Scanned ticket records with timestamps
 * @throws {AxiosError} When concert not found or user lacks admin permission
 */
export const getScannedTickets = async (concertId: string): Promise<ScannedTicketsResponse> => {
  const { data } = await api.get(`/concerts/${concertId}/scanned-tickets`);
  return data;
};

/**
 * Exports ticket sales data to a CSV file.
 *
 * @description Downloads a CSV file containing filtered ticket sales data.
 * Triggers a browser file download with date-stamped filename.
 * @param {Object} [params] - Filter parameters
 * @param {string} [params.concertId] - Filter by concert
 * @param {string} [params.status] - Filter by order status
 * @param {string} [params.startDate] - Filter by start date (ISO format)
 * @param {string} [params.endDate] - Filter by end date (ISO format)
 * @returns {Promise<void>} Resolves when download is initiated
 * @throws {AxiosError} When user lacks admin permission
 */
export const exportTicketSalesCsv = async (params?: {
  concertId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}): Promise<void> => {
  const response = await api.get('/tickets/sales/export', {
    params,
    responseType: 'blob',
  });
  const blob = new Blob([response.data], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ticket-sales-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
};

// Ticket transfers

/**
 * Retrieves tickets that can be transferred.
 *
 * @description Fetches all tickets owned by the current user that are eligible for transfer.
 * Excludes already transferred, cancelled, or scanned tickets.
 * @returns {Promise<TransferableTicket[]>} Array of transferable tickets
 * @throws {AxiosError} When user is not authenticated (401)
 */
export const getTransferableTickets = async (): Promise<TransferableTicket[]> => {
  const { data } = await api.get('/tickets/transferable');
  return data;
};

/**
 * Initiates a ticket transfer to another person.
 *
 * @description Creates a pending transfer that must be accepted by the recipient.
 * The recipient receives an email with a transfer link.
 * @param {string} ticketId - The ticket identifier to transfer
 * @param {Object} transfer - Transfer recipient details
 * @param {string} transfer.recipientEmail - Email of the person receiving the ticket
 * @param {string} transfer.recipientName - Name of the recipient
 * @returns {Promise<{transfer: TicketTransfer, message: string}>} Transfer details and success message
 * @throws {AxiosError} When ticket not found, not transferable, or already pending transfer
 */
export const initiateTicketTransfer = async (
  ticketId: string,
  transfer: { recipientEmail: string; recipientName: string },
): Promise<{ transfer: TicketTransfer; message: string }> => {
  const { data } = await api.post(`/tickets/${ticketId}/transfer`, transfer);
  return data;
};

/**
 * Retrieves pending ticket transfers.
 *
 * @description Fetches all pending transfers initiated by the current user.
 * @returns {Promise<TicketTransfer[]>} Array of pending transfer records
 * @throws {AxiosError} When user is not authenticated (401)
 */
export const getPendingTransfers = async (): Promise<TicketTransfer[]> => {
  const { data } = await api.get('/tickets/transfers');
  return data;
};

/**
 * Cancels a pending ticket transfer.
 *
 * @description Cancels an outgoing transfer that has not yet been accepted.
 * The ticket returns to the original owner.
 * @param {string} transferId - The transfer identifier
 * @returns {Promise<{success: boolean, message: string}>} Cancellation result
 * @throws {AxiosError} When transfer not found, already completed, or user not the initiator
 */
export const cancelTicketTransfer = async (transferId: string): Promise<{ success: boolean; message: string }> => {
  const { data } = await api.delete(`/tickets/transfers/${transferId}`);
  return data;
};

/**
 * Accepts a ticket transfer.
 *
 * @description Claims a ticket that was transferred to the current user.
 * The ticket ownership is transferred upon acceptance.
 * @param {string} transferCode - The unique transfer code from the transfer link
 * @returns {Promise<{success: boolean, ticket: Ticket, message: string}>} Accepted ticket details
 * @throws {AxiosError} When transfer not found, expired, or already accepted
 */
export const acceptTicketTransfer = async (
  transferCode: string,
): Promise<{ success: boolean; ticket: Ticket; message: string }> => {
  const { data } = await api.post(`/tickets/transfers/${transferCode}/accept`);
  return data;
};

/**
 * Retrieves transfer details by transfer code.
 *
 * @description Fetches transfer information for display before accepting.
 * @param {string} transferCode - The unique transfer code
 * @returns {Promise<TicketTransfer>} Transfer details including ticket and sender info
 * @throws {AxiosError} When transfer not found or expired
 */
export const getTransferByCode = async (transferCode: string): Promise<TicketTransfer> => {
  const { data } = await api.get(`/tickets/transfers/${transferCode}`);
  return data;
};

/**
 * Retrieves ticket transfer history.
 *
 * @description Fetches complete transfer history for the current user,
 * including both sent and received transfers.
 * @returns {Promise<TicketTransferHistory[]>} Array of historical transfer records
 * @throws {AxiosError} When user is not authenticated (401)
 */
export const getTransferHistory = async (): Promise<TicketTransferHistory[]> => {
  const { data } = await api.get('/tickets/transfers/history');
  return data;
};
