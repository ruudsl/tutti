import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import {
  getConcertTickets,
  createTicketOrder,
  getTicketOrder,
  payTicketOrder,
  validateTicket,
  getMyTickets,
  createTicketType,
  updateTicketType,
  deleteTicketType,
  getConcertTicketStats,
  getConcertAttendees,
  getSeatHeatmapData,
  exportConcertAttendeesCsv,
  cancelTicket,
  refundOrder,
  mockPayment,
} from '../api';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';
import { useTranslation } from 'react-i18next';

/**
 * Hook to fetch concert ticket info (available ticket types)
 */
export function useConcertTickets(concertId: string) {
  return useQuery({
    queryKey: queryKeys.concertTickets(concertId),
    queryFn: () => getConcertTickets(concertId),
    enabled: !!concertId,
  });
}

/**
 * Hook to fetch a ticket order
 */
export function useTicketOrder(orderId: string) {
  return useQuery({
    queryKey: queryKeys.ticketOrder(orderId),
    queryFn: () => getTicketOrder(orderId),
    enabled: !!orderId,
  });
}

/**
 * Hook to fetch user's tickets
 */
export function useMyTickets() {
  return useQuery({
    queryKey: queryKeys.myTickets,
    queryFn: getMyTickets,
  });
}

/**
 * Hook to fetch ticket stats for a concert
 */
export function useTicketStats(concertId: string) {
  return useQuery({
    queryKey: queryKeys.ticketStats(concertId),
    queryFn: () => getConcertTicketStats(concertId),
    enabled: !!concertId,
  });
}

/**
 * Hook to fetch attendees for a concert
 */
export function useAttendees(concertId: string) {
  return useQuery({
    queryKey: queryKeys.attendees(concertId),
    queryFn: () => getConcertAttendees(concertId),
    enabled: !!concertId,
  });
}

/**
 * Hook to fetch seat heatmap data for a concert
 */
export function useSeatHeatmap(concertId: string) {
  return useQuery({
    queryKey: ['seatHeatmap', concertId],
    queryFn: () => getSeatHeatmapData(concertId),
    enabled: !!concertId,
  });
}

/**
 * Hook to create a ticket order
 */
export function useCreateTicketOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      concertId,
      order,
    }: {
      concertId: string;
      order: {
        items: { ticketTypeId: string; quantity: number }[];
        buyerName: string;
        buyerEmail: string;
        buyerPhone?: string;
        notes?: string;
      };
    }) => createTicketOrder(concertId, order),
    onSuccess: (_, { concertId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.concertTickets(concertId) });
    },
  });
}

/**
 * Hook to pay a ticket order
 */
export function usePayTicketOrder() {
  return useMutation({
    mutationFn: ({ orderId, payment }: { orderId: string; payment: { method?: string; returnUrl?: string } }) =>
      payTicketOrder(orderId, payment),
  });
}

/**
 * Hook to validate a ticket (scan)
 */
export function useValidateTicket() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ code, concertId }: { code: string; concertId?: string }) => validateTicket(code, concertId),
    onSuccess: (result, { concertId }) => {
      if (result.valid) {
        showSuccess(t('tickets.ticketValidated'));
      } else {
        showError(result.message);
      }
      if (concertId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.ticketStats(concertId) });
      }
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to create a ticket type
 */
export function useCreateTicketType() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      concertId,
      ticketType,
    }: {
      concertId: string;
      ticketType: {
        name: string;
        price: number;
        quantity: number;
        description?: string;
        saleStart?: string;
        saleEnd?: string;
        maxPerOrder?: number;
      };
    }) => createTicketType(concertId, ticketType),
    onSuccess: (_, { concertId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.concertTickets(concertId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ticketStats(concertId) });
      showSuccess(t('common.saved'));
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update a ticket type
 */
export function useUpdateTicketType() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ticketTypeId,
      concertId: _concertId,
      updates,
    }: {
      ticketTypeId: string;
      concertId: string;
      updates: {
        name?: string;
        price?: number;
        quantity?: number;
        description?: string;
        saleStart?: string;
        saleEnd?: string;
        maxPerOrder?: number;
      };
    }) => updateTicketType(ticketTypeId, updates),
    onSuccess: (_, { concertId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.concertTickets(concertId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ticketStats(concertId) });
      showSuccess(t('common.saved'));
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete a ticket type
 */
export function useDeleteTicketType() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ticketTypeId, concertId: _concertId }: { ticketTypeId: string; concertId: string }) =>
      deleteTicketType(ticketTypeId),
    onSuccess: (_, { concertId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.concertTickets(concertId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ticketStats(concertId) });
      showSuccess(t('common.delete'));
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to cancel a ticket
 */
export function useCancelTicket() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ticketId, concertId: _concertId }: { ticketId: string; concertId: string }) =>
      cancelTicket(ticketId),
    onSuccess: (_, { concertId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ticketStats(concertId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.attendees(concertId) });
      showSuccess(t('tickets.ticketCancelled'));
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to refund an order
 */
export function useRefundOrder() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, concertId: _concertId, reason }: { orderId: string; concertId: string; reason?: string }) =>
      refundOrder(orderId, reason),
    onSuccess: (_, { concertId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ticketStats(concertId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.attendees(concertId) });
      showSuccess(t('tickets.orderRefunded'));
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to export attendees as CSV
 */
export function useExportAttendees() {
  return useMutation({
    mutationFn: (concertId: string) => exportConcertAttendeesCsv(concertId),
  });
}

/**
 * Hook for mock payment (development only)
 */
export function useMockPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, action }: { orderId: string; action: 'pay' | 'cancel' }) => mockPayment(orderId, action),
    onSuccess: (_, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ticketOrder(orderId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.myTickets });
    },
  });
}
