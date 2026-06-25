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

export const createTicketOrder = async (
  concertId: string,
  order: {
    items: { ticketTypeId: string; quantity: number }[];
    buyerName: string;
    buyerEmail: string;
    buyerPhone?: string;
    notes?: string;
    captchaToken?: string;
  }
): Promise<{
  orderId: string;
  total: number;
  expiresAt: string;
  items: { ticketTypeId: string; name: string; quantity: number; unitPrice: number; subtotal: number }[];
}> => {
  const { data } = await api.post(`/concerts/${concertId}/tickets/order`, order);
  return data;
};

export const getTicketOrder = async (orderId: string): Promise<TicketOrder> => {
  const { data } = await api.get(`/tickets/orders/${orderId}`);
  return data;
};

export const payTicketOrder = async (
  orderId: string,
  payment: { method?: string; returnUrl?: string }
): Promise<{ paymentId: string; checkoutUrl: string }> => {
  const { data } = await api.post(`/tickets/orders/${orderId}/pay`, payment);
  return data;
};

export const getTicketByCode = async (code: string): Promise<Ticket> => {
  const { data } = await api.get(`/tickets/${code}`);
  return data;
};

export const validateTicket = async (code: string, concertId?: string): Promise<TicketValidationResult> => {
  const { data } = await api.post(`/tickets/${code}/validate`, { concertId });
  return data;
};

export const getMyTickets = async (): Promise<Ticket[]> => {
  const { data } = await api.get('/tickets/my');
  return data;
};

// Admin ticket type management
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
  }
): Promise<TicketType> => {
  const { data } = await api.post(`/concerts/${concertId}/ticket-types`, ticketType);
  return data;
};

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
  }
): Promise<{ success: boolean }> => {
  const { data } = await api.put(`/ticket-types/${ticketTypeId}`, updates);
  return data;
};

export const deleteTicketType = async (ticketTypeId: string): Promise<{ success: boolean }> => {
  const { data } = await api.delete(`/ticket-types/${ticketTypeId}`);
  return data;
};

// Admin ticket management
export const getConcertTicketStats = async (concertId: string): Promise<TicketStats> => {
  const { data } = await api.get(`/concerts/${concertId}/ticket-stats`);
  return data;
};

export const getConcertAttendees = async (concertId: string): Promise<AttendeeExport[]> => {
  const { data } = await api.get(`/concerts/${concertId}/attendees`);
  return data;
};

export const getSeatHeatmapData = async (concertId: string): Promise<SeatHeatmapData> => {
  const { data } = await api.get(`/concerts/${concertId}/seats/heatmap-data`);
  return data;
};

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

export const cancelTicket = async (ticketId: string): Promise<{ success: boolean; message: string }> => {
  const { data } = await api.post(`/tickets/${ticketId}/cancel`);
  return data;
};

export const refundOrder = async (orderId: string, reason?: string): Promise<{ success: boolean; refundId?: string; message: string }> => {
  const { data } = await api.post(`/tickets/orders/${orderId}/refund`, { reason });
  return data;
};

export const mockPayment = async (orderId: string, action: 'pay' | 'cancel'): Promise<{ success: boolean }> => {
  const { data } = await api.post(`/tickets/orders/${orderId}/mock-payment`, { action });
  return data;
};

// Ticket dashboard & sales
export const getTicketDashboard = async (concertId: string): Promise<TicketDashboard> => {
  const { data } = await api.get(`/tickets/dashboard/${concertId}`);
  return data;
};

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

export const getPaymentDetails = async (orderId: string): Promise<PaymentDetails> => {
  const { data } = await api.get(`/tickets/sales/${orderId}/payment-details`);
  return data;
};

export const getSalesPredictions = async (concertId: string): Promise<SalesPredictionResponse> => {
  const { data } = await api.get(`/concerts/${concertId}/tickets/predictions`);
  return data;
};

export const getScannedTickets = async (concertId: string): Promise<ScannedTicketsResponse> => {
  const { data } = await api.get(`/concerts/${concertId}/scanned-tickets`);
  return data;
};

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
export const getTransferableTickets = async (): Promise<TransferableTicket[]> => {
  const { data } = await api.get('/tickets/transferable');
  return data;
};

export const initiateTicketTransfer = async (
  ticketId: string,
  transfer: { recipientEmail: string; recipientName: string }
): Promise<{ transfer: TicketTransfer; message: string }> => {
  const { data } = await api.post(`/tickets/${ticketId}/transfer`, transfer);
  return data;
};

export const getPendingTransfers = async (): Promise<TicketTransfer[]> => {
  const { data } = await api.get('/tickets/transfers');
  return data;
};

export const cancelTicketTransfer = async (transferId: string): Promise<{ success: boolean; message: string }> => {
  const { data } = await api.delete(`/tickets/transfers/${transferId}`);
  return data;
};

export const acceptTicketTransfer = async (transferCode: string): Promise<{ success: boolean; ticket: Ticket; message: string }> => {
  const { data } = await api.post(`/tickets/transfers/${transferCode}/accept`);
  return data;
};

export const getTransferByCode = async (transferCode: string): Promise<TicketTransfer> => {
  const { data } = await api.get(`/tickets/transfers/${transferCode}`);
  return data;
};

export const getTransferHistory = async (): Promise<TicketTransferHistory[]> => {
  const { data } = await api.get('/tickets/transfers/history');
  return data;
};
